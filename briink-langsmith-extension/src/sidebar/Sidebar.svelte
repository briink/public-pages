<script lang="ts">
  import { onMount } from 'svelte';
  import * as pdfjsLib from 'pdfjs-dist';
  import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

  // Configure PDF.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  // Types
  interface FileInfo {
    fileId: string;
    fileName: string;
    page: number;
  }

  interface LoadedPdf {
    fileId: string;
    fileName: string;
    initialPage: number;
    doc: PDFDocumentProxy | null;
    data: string | null; // base64
    error: string | null;
    loading: boolean;
  }

  // State
  let files = $state<FileInfo[]>([]);
  let loadedPdfs = $state<Map<string, LoadedPdf>>(new Map());
  let activeFileId = $state<string | null>(null);
  let currentPage = $state(1);
  let totalPages = $state(0);
  let scale = $state(1.0);
  let needsConfig = $state(false);
  let canvasContainer: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  // Listen for messages from content script
  onMount(() => {
    window.addEventListener('message', handleMessage);

    // Notify parent that sidebar is ready
    window.parent.postMessage({ type: 'BRIINK_SIDEBAR_READY' }, '*');

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  });

  async function handleMessage(event: MessageEvent) {
    const { type, payload } = event.data || {};

    switch (type) {
      case 'LOAD_PDF':
        await handleLoadPdf(payload);
        break;
      case 'BRIINK_FILES_LIST':
        handleFilesList(payload.files);
        break;
      case 'SHOW_CONFIG_MESSAGE':
        needsConfig = true;
        break;
    }
  }

  function handleFilesList(newFiles: FileInfo[]) {
    // Add new files to our list (avoid duplicates)
    for (const file of newFiles) {
      if (!files.find(f => f.fileId === file.fileId)) {
        files = [...files, file];
        // Start fetching the PDF
        fetchPdfForFile(file);
      }
    }
  }

  async function handleLoadPdf(payload: { fileId: string; page: number; fileName: string }) {
    const { fileId, page, fileName } = payload;

    // Add to files list if not present
    if (!files.find(f => f.fileId === fileId)) {
      files = [...files, { fileId, fileName, page }];
      await fetchPdfForFile({ fileId, fileName, page });
    }

    // Set as active and go to the specified page
    activeFileId = fileId;
    const loaded = loadedPdfs.get(fileId);
    if (loaded?.doc) {
      totalPages = loaded.doc.numPages;
      currentPage = Math.min(Math.max(1, page), totalPages);
      await renderPage(currentPage);
    }
  }

  async function fetchPdfForFile(file: FileInfo) {
    const { fileId, fileName, page } = file;

    // Initialize loading state
    loadedPdfs.set(fileId, {
      fileId,
      fileName,
      initialPage: page,
      doc: null,
      data: null,
      error: null,
      loading: true,
    });
    loadedPdfs = new Map(loadedPdfs); // Trigger reactivity

    try {
      // Fetch PDF from service worker
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_PDF',
        payload: { fileId, page },
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch PDF');
      }

      // Convert base64 to ArrayBuffer and load PDF
      const pdfData = base64ToArrayBuffer(response.data);
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      const doc = await loadingTask.promise;

      loadedPdfs.set(fileId, {
        fileId,
        fileName: response.fileName || fileName,
        initialPage: page,
        doc,
        data: response.data,
        error: null,
        loading: false,
      });
      loadedPdfs = new Map(loadedPdfs);

      // If this is the first file or the active one, render it
      if (!activeFileId || activeFileId === fileId) {
        activeFileId = fileId;
        totalPages = doc.numPages;
        currentPage = Math.min(Math.max(1, page), totalPages);
        await renderPage(currentPage);
      }
    } catch (err) {
      console.error('Failed to load PDF:', err);
      loadedPdfs.set(fileId, {
        fileId,
        fileName,
        initialPage: page,
        doc: null,
        data: null,
        error: err instanceof Error ? err.message : 'Failed to fetch PDF',
        loading: false,
      });
      loadedPdfs = new Map(loadedPdfs);
    }
  }

  async function selectFile(fileId: string) {
    const loaded = loadedPdfs.get(fileId);
    if (!loaded) return;

    activeFileId = fileId;

    if (loaded.doc) {
      totalPages = loaded.doc.numPages;
      currentPage = Math.min(Math.max(1, loaded.initialPage), totalPages);
      await renderPage(currentPage);
    }
  }

  async function renderPage(pageNum: number) {
    if (!activeFileId || !canvas) return;

    const loaded = loadedPdfs.get(activeFileId);
    if (!loaded?.doc) return;

    try {
      const page: PDFPageProxy = await loaded.doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');

      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;
    } catch (err) {
      console.error('Failed to render page:', err);
    }
  }

  function goToPage(pageNum: number) {
    if (!activeFileId) return;
    const loaded = loadedPdfs.get(activeFileId);
    if (!loaded?.doc) return;

    currentPage = Math.min(Math.max(1, pageNum), totalPages);
    renderPage(currentPage);
  }

  function prevPage() {
    goToPage(currentPage - 1);
  }

  function nextPage() {
    goToPage(currentPage + 1);
  }

  function zoomIn() {
    scale = Math.min(scale + 0.25, 3.0);
    renderPage(currentPage);
  }

  function zoomOut() {
    scale = Math.max(scale - 0.25, 0.5);
    renderPage(currentPage);
  }

  function fitWidth() {
    if (!activeFileId || !canvasContainer) return;
    const loaded = loadedPdfs.get(activeFileId);
    if (!loaded?.doc) return;

    loaded.doc.getPage(currentPage).then((page) => {
      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = canvasContainer.clientWidth - 32;
      scale = containerWidth / viewport.width;
      renderPage(currentPage);
    });
  }

  function retryFetch(fileId: string) {
    const file = files.find(f => f.fileId === fileId);
    if (file) {
      fetchPdfForFile(file);
    }
  }

  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function handlePageInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const pageNum = parseInt(input.value, 10);
    if (!isNaN(pageNum)) {
      goToPage(pageNum);
    }
  }

  function truncateFileName(name: string, maxLen: number = 40): string {
    if (name.length <= maxLen) return name;
    const ext = name.lastIndexOf('.');
    if (ext > 0 && name.length - ext < 10) {
      const extPart = name.slice(ext);
      const namePart = name.slice(0, maxLen - extPart.length - 3);
      return namePart + '...' + extPart;
    }
    return name.slice(0, maxLen - 3) + '...';
  }

  // Reactive: get active loaded PDF
  let activeLoaded = $derived(activeFileId ? loadedPdfs.get(activeFileId) : null);
</script>

<div class="sidebar-container">
  {#if needsConfig}
    <div class="config-message">
      <div class="icon">🔑</div>
      <p>Please configure your Briink API key</p>
      <p class="hint">Click the extension icon in Chrome toolbar</p>
    </div>
  {:else if files.length === 0}
    <div class="empty-state">
      <div class="icon">📄</div>
      <p>Click on a source document to view the PDF</p>
    </div>
  {:else}
    <!-- File tabs -->
    <div class="file-tabs">
      {#each files as file (file.fileId)}
        {@const loaded = loadedPdfs.get(file.fileId)}
        <button
          class="file-tab"
          class:active={activeFileId === file.fileId}
          class:loading={loaded?.loading}
          class:error={loaded?.error}
          onclick={() => selectFile(file.fileId)}
          title={file.fileName}
        >
          {#if loaded?.loading}
            <span class="tab-spinner"></span>
          {:else if loaded?.error}
            <span class="tab-icon error">!</span>
          {:else}
            <span class="tab-icon">📄</span>
          {/if}
          <span class="tab-name">{truncateFileName(file.fileName, 25)}</span>
          <span class="tab-page">p.{file.page}</span>
        </button>
      {/each}
    </div>

    <!-- PDF viewer area -->
    <div class="viewer-area">
      {#if activeLoaded?.loading}
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading {activeLoaded.fileName}...</p>
        </div>
      {:else if activeLoaded?.error}
        <div class="error">
          <p>Failed to load PDF</p>
          <p class="error-detail">{activeLoaded.error}</p>
          <button onclick={() => activeFileId && retryFetch(activeFileId)}>Retry</button>
        </div>
      {:else if activeLoaded?.doc}
        <!-- Toolbar -->
        <div class="toolbar">
          <div class="toolbar-group">
            <button onclick={prevPage} disabled={currentPage <= 1} title="Previous page">◀</button>
            <span class="page-info">
              <input
                type="number"
                value={currentPage}
                min="1"
                max={totalPages}
                onchange={handlePageInput}
              />
              / {totalPages}
            </span>
            <button onclick={nextPage} disabled={currentPage >= totalPages} title="Next page">▶</button>
          </div>
          <div class="toolbar-group">
            <button onclick={zoomOut} title="Zoom out">−</button>
            <span class="zoom-level">{Math.round(scale * 100)}%</span>
            <button onclick={zoomIn} title="Zoom in">+</button>
            <button onclick={fitWidth} title="Fit width">↔</button>
          </div>
        </div>

        <!-- Canvas -->
        <div class="canvas-container" bind:this={canvasContainer}>
          <canvas bind:this={canvas}></canvas>
        </div>
      {:else}
        <div class="empty-state">
          <p>Select a file from the tabs above</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #1a1d21;
    color: #e8eaed;
    height: 100vh;
    overflow: hidden;
  }

  .sidebar-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  /* File tabs */
  .file-tabs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    background-color: #22262b;
    border-bottom: 1px solid #3c4043;
    max-height: 200px;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .file-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background-color: #2d3136;
    border: 1px solid #3c4043;
    border-radius: 6px;
    color: #9aa0a6;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    transition: all 0.2s;
  }

  .file-tab:hover {
    background-color: #3c4043;
    color: #e8eaed;
  }

  .file-tab.active {
    background-color: #3c4043;
    border-color: #8ab4f8;
    color: #e8eaed;
  }

  .file-tab.loading {
    opacity: 0.7;
  }

  .file-tab.error {
    border-color: #f28b82;
  }

  .tab-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .tab-icon.error {
    color: #f28b82;
    font-weight: bold;
  }

  .tab-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #3c4043;
    border-top-color: #8ab4f8;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    flex-shrink: 0;
  }

  .tab-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-page {
    font-size: 10px;
    color: #6b7280;
    flex-shrink: 0;
  }

  /* Viewer area */
  .viewer-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background-color: #22262b;
    border-bottom: 1px solid #3c4043;
    flex-shrink: 0;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .toolbar button {
    padding: 6px 10px;
    background-color: #3c4043;
    border: none;
    border-radius: 4px;
    color: #e8eaed;
    cursor: pointer;
    font-size: 12px;
    transition: background-color 0.2s;
  }

  .toolbar button:hover:not(:disabled) {
    background-color: #4a4f54;
  }

  .toolbar button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #9aa0a6;
  }

  .page-info input {
    width: 40px;
    padding: 4px 6px;
    background-color: #3c4043;
    border: 1px solid #4a4f54;
    border-radius: 4px;
    color: #e8eaed;
    font-size: 12px;
    text-align: center;
  }

  .page-info input:focus {
    outline: none;
    border-color: #8ab4f8;
  }

  .zoom-level {
    font-size: 11px;
    color: #9aa0a6;
    min-width: 40px;
    text-align: center;
  }

  .canvas-container {
    flex: 1;
    overflow: auto;
    padding: 16px;
    background-color: #2d3136;
  }

  canvas {
    display: block;
    margin: 0 auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  /* States */
  .loading, .error, .empty-state, .config-message {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    text-align: center;
  }

  .loading p, .empty-state p, .config-message p {
    margin: 16px 0 0 0;
    color: #9aa0a6;
    font-size: 13px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #3c4043;
    border-top-color: #8ab4f8;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error {
    color: #f28b82;
  }

  .error p {
    margin: 8px 0;
  }

  .error-detail {
    font-size: 11px;
    color: #9aa0a6;
    max-width: 300px;
    word-break: break-word;
  }

  .error button {
    margin-top: 16px;
    padding: 8px 16px;
    background-color: #8ab4f8;
    color: #1a1d21;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .error button:hover {
    background-color: #a8c7fa;
  }

  .empty-state .icon, .config-message .icon {
    font-size: 48px;
    opacity: 0.5;
  }

  .config-message .hint {
    font-size: 11px;
    color: #6b7280;
    margin-top: 8px;
  }
</style>
