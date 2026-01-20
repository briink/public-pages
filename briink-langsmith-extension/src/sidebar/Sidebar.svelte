<script lang="ts">
  import { onMount } from 'svelte';
  import * as pdfjsLib from 'pdfjs-dist';
  import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

  // Configure PDF.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  // State
  let pdfDoc = $state<PDFDocumentProxy | null>(null);
  let currentPage = $state(1);
  let totalPages = $state(0);
  let scale = $state(1.0);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let fileName = $state('');
  let currentFileId = $state<string | null>(null);
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
    if (event.data?.type === 'LOAD_PDF') {
      const { fileId, page, fileName: name } = event.data.payload;
      await loadPdf(fileId, page, name);
    }
  }

  async function loadPdf(fileId: string, page: number = 1, name: string = '') {
    if (!fileId) return;

    isLoading = true;
    error = null;
    fileName = name;
    currentFileId = fileId;

    try {
      // Fetch PDF from service worker
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_PDF',
        payload: { fileId, page },
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch PDF');
      }

      // Convert base64 to ArrayBuffer
      const pdfData = base64ToArrayBuffer(response.data);

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      pdfDoc = await loadingTask.promise;
      totalPages = pdfDoc.numPages;
      currentPage = Math.min(Math.max(1, page), totalPages);

      // Render the requested page
      await renderPage(currentPage);

      if (response.fileName) {
        fileName = response.fileName;
      }
    } catch (err) {
      console.error('Failed to load PDF:', err);
      error = err instanceof Error ? err.message : 'Failed to load PDF';
      pdfDoc = null;
    } finally {
      isLoading = false;
    }
  }

  async function renderPage(pageNum: number) {
    if (!pdfDoc || !canvas) return;

    try {
      const page: PDFPageProxy = await pdfDoc.getPage(pageNum);

      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');

      if (!context) return;

      // Set canvas dimensions
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Render PDF page
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.error('Failed to render page:', err);
      error = 'Failed to render page';
    }
  }

  function goToPage(pageNum: number) {
    if (!pdfDoc) return;
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
    if (!pdfDoc || !canvasContainer) return;

    pdfDoc.getPage(currentPage).then((page) => {
      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = canvasContainer.clientWidth - 32; // Account for padding
      scale = containerWidth / viewport.width;
      renderPage(currentPage);
    });
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
</script>

<div class="sidebar-container">
  <header class="sidebar-header">
    <h2>PDF Viewer</h2>
    {#if fileName}
      <span class="file-name" title={fileName}>{fileName}</span>
    {/if}
  </header>

  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading PDF...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button onclick={() => currentFileId && loadPdf(currentFileId, currentPage, fileName)}>
        Retry
      </button>
    </div>
  {:else if !pdfDoc}
    <div class="empty-state">
      <div class="icon">📄</div>
      <p>Click on a source document to view the PDF</p>
    </div>
  {:else}
    <div class="toolbar">
      <div class="toolbar-group">
        <button onclick={prevPage} disabled={currentPage <= 1} title="Previous page">
          ◀
        </button>
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
        <button onclick={nextPage} disabled={currentPage >= totalPages} title="Next page">
          ▶
        </button>
      </div>

      <div class="toolbar-group">
        <button onclick={zoomOut} title="Zoom out">−</button>
        <span class="zoom-level">{Math.round(scale * 100)}%</span>
        <button onclick={zoomIn} title="Zoom in">+</button>
        <button onclick={fitWidth} title="Fit width">↔</button>
      </div>
    </div>

    <div class="canvas-container" bind:this={canvasContainer}>
      <canvas bind:this={canvas}></canvas>
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

  .sidebar-header {
    padding: 12px 16px;
    background-color: #22262b;
    border-bottom: 1px solid #3c4043;
    flex-shrink: 0;
  }

  .sidebar-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #8ab4f8;
  }

  .file-name {
    display: block;
    font-size: 11px;
    color: #9aa0a6;
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

  .loading, .error, .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    text-align: center;
  }

  .loading p, .error p, .empty-state p {
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

  .empty-state .icon {
    font-size: 48px;
    opacity: 0.5;
  }
</style>
