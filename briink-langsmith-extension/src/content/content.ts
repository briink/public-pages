import type { BriinkConfig, SourceDocClickEvent, FetchPdfResponse } from '../types';

// State
let sidebarIframe: HTMLIFrameElement | null = null;
let sidebarContainer: HTMLDivElement | null = null;
let isInitialized = false;

// Initialize the extension
async function initialize() {
  if (isInitialized) return;

  // Check if extension is enabled
  const config = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' }) as BriinkConfig | null;
  if (!config?.enabled) {
    console.log('Briink LangSmith Extension is disabled');
    return;
  }

  // Check if we're on an annotation queue page
  if (!isAnnotationQueuePage()) {
    console.log('Not on annotation queue page');
    return;
  }

  console.log('Briink LangSmith Extension initializing...');

  createSidebar();
  setupMessageListeners();
  observePageChanges();

  isInitialized = true;
}

// Check if current page is an annotation queue
function isAnnotationQueuePage(): boolean {
  const url = window.location.href;
  return url.includes('smith.langchain.com') &&
         (url.includes('annotation') || url.includes('queue') || url.includes('datasets'));
}

// Create the sidebar container and iframe
function createSidebar() {
  // Create container
  sidebarContainer = document.createElement('div');
  sidebarContainer.id = 'briink-pdf-sidebar';
  sidebarContainer.className = 'briink-sidebar-container';

  // Create toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'briink-sidebar-toggle';
  toggleBtn.innerHTML = '📄';
  toggleBtn.title = 'Toggle PDF Viewer';
  toggleBtn.onclick = toggleSidebar;

  // Create resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'briink-resize-handle';
  setupResizeHandler(resizeHandle);

  // Create iframe for sidebar content
  sidebarIframe = document.createElement('iframe');
  sidebarIframe.src = chrome.runtime.getURL('src/sidebar/sidebar.html');
  sidebarIframe.className = 'briink-sidebar-iframe';

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'briink-sidebar-close';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close PDF Viewer';
  closeBtn.onclick = () => closeSidebar();

  // Assemble
  sidebarContainer.appendChild(resizeHandle);
  sidebarContainer.appendChild(closeBtn);
  sidebarContainer.appendChild(sidebarIframe);
  document.body.appendChild(sidebarContainer);
  document.body.appendChild(toggleBtn);

  // Start closed
  sidebarContainer.classList.add('closed');
}

// Toggle sidebar visibility
function toggleSidebar() {
  if (!sidebarContainer) return;
  sidebarContainer.classList.toggle('closed');
}

// Open sidebar
function openSidebar() {
  if (!sidebarContainer) return;
  sidebarContainer.classList.remove('closed');
}

// Close sidebar
function closeSidebar() {
  if (!sidebarContainer) return;
  sidebarContainer.classList.add('closed');
}

// Setup resize handler for sidebar
function setupResizeHandler(handle: HTMLDivElement) {
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebarContainer?.offsetWidth || 400;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing || !sidebarContainer) return;
    const diff = startX - e.clientX;
    const newWidth = Math.min(Math.max(startWidth + diff, 300), 800);
    sidebarContainer.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// Listen for messages from the custom renderer iframe and sidebar
function setupMessageListeners() {
  window.addEventListener('message', async (event) => {
    // Handle messages from the custom renderer (response_render.html)
    if (event.data?.type === 'BRIINK_SOURCE_CLICK') {
      const data = event.data as { type: string; payload: SourceDocClickEvent };
      await handleSourceDocClick(data.payload);
    }

    // Handle messages from our sidebar iframe
    if (event.data?.type === 'BRIINK_SIDEBAR_READY') {
      console.log('Sidebar iframe ready');
    }
  });
}

// Handle source document click
async function handleSourceDocClick(payload: SourceDocClickEvent) {
  console.log('Source doc clicked:', payload);

  // Open the sidebar
  openSidebar();

  // Send message to sidebar to load the PDF
  if (sidebarIframe?.contentWindow) {
    sidebarIframe.contentWindow.postMessage({
      type: 'LOAD_PDF',
      payload: {
        fileId: payload.fileId,
        page: payload.page,
        fileName: payload.fileName,
      },
    }, '*');
  }
}

// Observe page changes (SPA navigation)
function observePageChanges() {
  // Watch for URL changes
  let lastUrl = window.location.href;

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log('Page changed:', lastUrl);

      // Re-check if we should show sidebar
      if (!isAnnotationQueuePage()) {
        sidebarContainer?.classList.add('hidden');
      } else {
        sidebarContainer?.classList.remove('hidden');
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// Extract file metadata from page
function extractFileMetasFromPage(): Map<string, { id: string; fileName: string }> {
  const fileMetas = new Map<string, { id: string; fileName: string }>();

  // Try to find File Metas in the page content
  // This is a heuristic approach - may need adjustment based on actual page structure
  const textContent = document.body.innerText;

  // Look for UUID patterns that might be file IDs
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const matches = textContent.match(uuidPattern);

  if (matches) {
    matches.forEach((id) => {
      // Check if this ID is near a file_name pattern
      const idx = textContent.indexOf(id);
      const context = textContent.substring(Math.max(0, idx - 200), idx + 200);

      const fileNameMatch = context.match(/"file_name":\s*"([^"]+)"/);
      if (fileNameMatch) {
        fileMetas.set(id, { id, fileName: fileNameMatch[1] });
      }
    });
  }

  return fileMetas;
}

// Inject click handlers into source document elements in custom renderer iframe
function injectSourceDocClickHandlers() {
  // Find all iframes that might contain our custom renderer
  const iframes = document.querySelectorAll('iframe');

  iframes.forEach((iframe) => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // Look for source-doc elements
      const sourceDocs = iframeDoc.querySelectorAll('.source-doc');
      sourceDocs.forEach((doc) => {
        // Add click handler if not already added
        if (doc.getAttribute('data-briink-handler')) return;
        doc.setAttribute('data-briink-handler', 'true');

        doc.addEventListener('click', (e) => {
          const target = e.currentTarget as HTMLElement;
          const fileId = target.getAttribute('data-file-id') ||
                        target.querySelector('[data-file-id]')?.getAttribute('data-file-id');
          const page = parseInt(target.getAttribute('data-page') || '1', 10);
          const fileName = target.querySelector('.source-doc-filename')?.textContent || 'document.pdf';

          if (fileId) {
            window.postMessage({
              type: 'BRIINK_SOURCE_CLICK',
              payload: { fileId, page, fileName },
            }, '*');
          }
        });
      });
    } catch (err) {
      // Cross-origin iframe, can't access
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Also listen for config changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.briinkConfig) {
    const newConfig = changes.briinkConfig.newValue as BriinkConfig;
    if (newConfig?.enabled && !isInitialized) {
      initialize();
    } else if (!newConfig?.enabled && sidebarContainer) {
      sidebarContainer.classList.add('hidden');
    } else if (newConfig?.enabled && sidebarContainer) {
      sidebarContainer.classList.remove('hidden');
    }
  }
});
