import type {
    BriinkConfig,
    Message,
    FetchPdfPayload,
    FetchPdfResponse,
    TestConnectionResponse,
} from "../types";

// Get stored configuration
async function getConfig(): Promise<BriinkConfig | null> {
    try {
        const result = await chrome.storage.sync.get(["briinkConfig"]);
        return result.briinkConfig || null;
    } catch (err) {
        console.error("Failed to get config:", err);
        return null;
    }
}

// Test API connection
async function testConnection(
    apiKey: string,
    apiBaseUrl: string,
): Promise<TestConnectionResponse> {
    try {
        const response = await fetch(`${apiBaseUrl}/status`, {
            method: "GET",
            headers: {
                "x-api-key": apiKey,
                "Content-Type": "application/json",
            },
        });

        if (response.ok) {
            return { success: true };
        } else {
            const errorText = await response.text();
            return {
                success: false,
                error: `API returned ${response.status}: ${errorText}`,
            };
        }
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Connection failed",
        };
    }
}

// Fetch PDF file from Briink API
async function fetchPdf(
    fileId: string,
    config: BriinkConfig,
): Promise<FetchPdfResponse> {
    try {
        // Construct the file download URL
        // API: https://api.platform.briink.com/workspaces/{workspace_id}/files/{file_id}
        if (!config.workspaceId) {
            return {
                success: false,
                error: "Workspace ID is required. Please configure it in extension settings.",
            };
        }
        // The /files/{id} endpoint returns metadata, need /files/{id}/content for actual file
        const url = `${config.apiBaseUrl}/workspaces/${config.workspaceId}/files/${fileId}/content`;

        console.log("Fetching PDF from:", url);

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "x-api-key": config.apiKey,
            },
        });

        console.log("Response status:", response.status);
        console.log("Content-Type:", response.headers.get("Content-Type"));

        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                error: `Failed to fetch PDF: ${response.status} - ${errorText}`,
            };
        }

        // Check if response is actually a PDF
        const contentType = response.headers.get("Content-Type");
        if (
            contentType &&
            !contentType.includes("pdf") &&
            !contentType.includes("octet-stream")
        ) {
            // API might return JSON with download URL instead of raw PDF
            const text = await response.text();
            console.log("Response body (not PDF):", text.substring(0, 500));
            return {
                success: false,
                error: `Unexpected content type: ${contentType}. Response: ${text.substring(0, 200)}`,
            };
        }

        // Get file name from response headers if available
        const contentDisposition = response.headers.get("Content-Disposition");
        let fileName = "document.pdf";
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
            if (match) {
                fileName = match[1];
            }
        }

        const data = await response.arrayBuffer();

        return {
            success: true,
            data,
            fileName,
        };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Failed to fetch PDF",
        };
    }
}

// Cache for PDF data to avoid re-fetching
const pdfCache = new Map<
    string,
    { data: ArrayBuffer; fileName: string; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchPdfWithCache(
    fileId: string,
    config: BriinkConfig,
): Promise<FetchPdfResponse> {
    const cached = pdfCache.get(fileId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return {
            success: true,
            data: cached.data,
            fileName: cached.fileName,
        };
    }

    const result = await fetchPdf(fileId, config);

    if (result.success && result.data) {
        pdfCache.set(fileId, {
            data: result.data,
            fileName: result.fileName || "document.pdf",
            timestamp: Date.now(),
        });
    }

    return result;
}

// Message listener
chrome.runtime.onMessage.addListener(
    (message: Message, sender, sendResponse) => {
        (async () => {
            try {
                switch (message.type) {
                    case "GET_CONFIG": {
                        const config = await getConfig();
                        sendResponse(config);
                        break;
                    }

                    case "TEST_CONNECTION": {
                        const payload = message.payload as {
                            apiKey: string;
                            apiBaseUrl: string;
                        };
                        const result = await testConnection(
                            payload.apiKey,
                            payload.apiBaseUrl,
                        );
                        sendResponse(result);
                        break;
                    }

                    case "FETCH_PDF": {
                        const payload = message.payload as FetchPdfPayload;
                        const config = await getConfig();

                        if (!config || !config.apiKey) {
                            sendResponse({
                                success: false,
                                error: "API key not configured. Please set up the extension.",
                            } as FetchPdfResponse);
                            break;
                        }

                        if (!config.enabled) {
                            sendResponse({
                                success: false,
                                error: "Extension is disabled",
                            } as FetchPdfResponse);
                            break;
                        }

                        const result = await fetchPdfWithCache(
                            payload.fileId,
                            config,
                        );

                        // Convert ArrayBuffer to base64 for message passing
                        if (result.success && result.data) {
                            const base64 = arrayBufferToBase64(result.data);
                            sendResponse({
                                success: true,
                                data: base64,
                                fileName: result.fileName,
                            });
                        } else {
                            sendResponse(result);
                        }
                        break;
                    }

                    default:
                        sendResponse({
                            success: false,
                            error: "Unknown message type",
                        });
                }
            } catch (err) {
                sendResponse({
                    success: false,
                    error: err instanceof Error ? err.message : "Unknown error",
                });
            }
        })();

        // Return true to indicate we'll respond asynchronously
        return true;
    },
);

// Helper to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Clean up old cache entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of pdfCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            pdfCache.delete(key);
        }
    }
}, 60000); // Check every minute

console.log("Briink LangSmith Extension service worker loaded");
