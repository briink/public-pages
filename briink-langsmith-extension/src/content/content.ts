import type { BriinkConfig, SourceDocClickEvent } from "../types";

console.log("[Briink] Content script loaded at:", window.location.href);

// State
let sidebarIframe: HTMLIFrameElement | null = null;
let sidebarContainer: HTMLDivElement | null = null;
let isInitialized = false;
let collectedFiles: Map<
    string,
    { fileId: string; fileName: string; page: number }
> = new Map();

// Initialize the extension
async function initialize() {
    console.log("[Briink] initialize() called, isInitialized:", isInitialized);
    if (isInitialized) return;

    // Check if we're on an annotation queue page
    if (!isAnnotationQueuePage()) {
        console.log(
            "[Briink] Not on annotation queue page, URL:",
            window.location.href,
        );
        return;
    }

    console.log("[Briink] Extension initializing on:", window.location.href);

    createSidebar();
    console.log("[Briink] Sidebar created, container:", sidebarContainer);

    setupMessageListeners();
    console.log("[Briink] Message listeners set up");

    observePageChanges();
    console.log("[Briink] Page observer set up");

    isInitialized = true;

    // Check if extension is enabled/configured and notify sidebar
    const config = (await chrome.runtime.sendMessage({
        type: "GET_CONFIG",
    })) as BriinkConfig | null;

    if (!config?.enabled || !config?.apiKey) {
        console.log(
            "Briink LangSmith Extension: Please configure API key in extension popup",
        );
        notifySidebar("SHOW_CONFIG_MESSAGE", {});
    }
}

// Check if current page is an annotation queue
function isAnnotationQueuePage(): boolean {
    const url = window.location.href;
    return (
        url.includes("smith.langchain.com") &&
        (url.includes("annotation") ||
            url.includes("queue") ||
            url.includes("datasets"))
    );
}

// Create the sidebar container and iframe
function createSidebar() {
    // Create container
    sidebarContainer = document.createElement("div");
    sidebarContainer.id = "briink-pdf-sidebar";
    sidebarContainer.className = "briink-sidebar-container";

    // Create toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "briink-sidebar-toggle";
    toggleBtn.innerHTML = "📄";
    toggleBtn.title = "Toggle PDF Viewer";
    toggleBtn.onclick = toggleSidebar;

    // Create resize handle
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "briink-resize-handle";
    setupResizeHandler(resizeHandle);

    // Create iframe for sidebar content
    sidebarIframe = document.createElement("iframe");
    sidebarIframe.src = chrome.runtime.getURL("src/sidebar/sidebar.html");
    sidebarIframe.className = "briink-sidebar-iframe";

    // Create close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "briink-sidebar-close";
    closeBtn.innerHTML = "×";
    closeBtn.title = "Close PDF Viewer";
    closeBtn.onclick = () => closeSidebar();

    // Assemble
    sidebarContainer.appendChild(resizeHandle);
    sidebarContainer.appendChild(closeBtn);
    sidebarContainer.appendChild(sidebarIframe);
    document.body.appendChild(sidebarContainer);
    document.body.appendChild(toggleBtn);

    // Start open by default
}

// Toggle sidebar visibility
function toggleSidebar() {
    if (!sidebarContainer) return;
    sidebarContainer.classList.toggle("closed");
}

// Open sidebar
function openSidebar() {
    if (!sidebarContainer) return;
    sidebarContainer.classList.remove("closed");
}

// Close sidebar
function closeSidebar() {
    if (!sidebarContainer) return;
    sidebarContainer.classList.add("closed");
}

// Setup resize handler for sidebar
function setupResizeHandler(handle: HTMLDivElement) {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener("mousedown", (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebarContainer?.offsetWidth || 400;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
        if (!isResizing || !sidebarContainer) return;
        const diff = startX - e.clientX;
        const newWidth = Math.min(Math.max(startWidth + diff, 300), 800);
        sidebarContainer.style.width = `${newWidth}px`;
    });

    document.addEventListener("mouseup", () => {
        isResizing = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    });
}

// Send message to sidebar iframe
function notifySidebar(type: string, payload: any) {
    if (sidebarIframe?.contentWindow) {
        sidebarIframe.contentWindow.postMessage({ type, payload }, "*");
    }
}

// Listen for messages from the custom renderer iframe and sidebar
function setupMessageListeners() {
    window.addEventListener("message", async (event) => {
        // Handle messages from the custom renderer (response_render.html)
        if (event.data?.type === "BRIINK_SOURCE_CLICK") {
            const data = event.data as {
                type: string;
                payload: SourceDocClickEvent;
            };
            await handleSourceDocClick(data.payload);
        }

        // Handle request to load all files from sidebar
        if (event.data?.type === "BRIINK_REQUEST_FILES") {
            // Send collected files to sidebar
            const files = Array.from(collectedFiles.values());
            notifySidebar("BRIINK_FILES_LIST", { files });
        }

        // Handle messages from our sidebar iframe
        if (event.data?.type === "BRIINK_SIDEBAR_READY") {
            console.log("Sidebar iframe ready");
            // Send any already collected files
            const files = Array.from(collectedFiles.values());
            if (files.length > 0) {
                notifySidebar("BRIINK_FILES_LIST", { files });
            }
        }
    });
}

// Handle source document click - collect file and notify sidebar
async function handleSourceDocClick(payload: SourceDocClickEvent) {
    console.log("Source doc clicked:", payload);

    // Add to collected files if new
    if (payload.fileId && !collectedFiles.has(payload.fileId)) {
        collectedFiles.set(payload.fileId, {
            fileId: payload.fileId,
            fileName: payload.fileName || "document.pdf",
            page: payload.page || 1,
        });
    }

    // Open the sidebar
    openSidebar();

    // Send message to sidebar to load this specific PDF and show it
    notifySidebar("LOAD_PDF", {
        fileId: payload.fileId,
        page: payload.page,
        fileName: payload.fileName,
    });

    // Also send the full file list so sidebar can build tabs
    const files = Array.from(collectedFiles.values());
    notifySidebar("BRIINK_FILES_LIST", { files });
}

// Observe page changes (SPA navigation)
function observePageChanges() {
    let lastUrl = window.location.href;

    const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            console.log("Page changed:", lastUrl);

            // Clear collected files on page change
            collectedFiles.clear();

            // Re-check if we should show sidebar
            if (!isAnnotationQueuePage()) {
                sidebarContainer?.classList.add("hidden");
            } else {
                sidebarContainer?.classList.remove("hidden");
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
} else {
    initialize();
}

// Also listen for config changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "sync" && changes.briinkConfig) {
        const newConfig = changes.briinkConfig.newValue as BriinkConfig;
        if (newConfig?.enabled && !isInitialized) {
            initialize();
        } else if (!newConfig?.enabled && sidebarContainer) {
            sidebarContainer.classList.add("hidden");
        } else if (newConfig?.enabled && sidebarContainer) {
            sidebarContainer.classList.remove("hidden");
        }
    }
});
