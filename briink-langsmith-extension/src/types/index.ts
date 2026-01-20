// API Configuration
export interface BriinkConfig {
  apiKey: string;
  apiBaseUrl: string;
  workspaceId?: string;
  enabled: boolean;
}

// File metadata from LangSmith/Briink
export interface FileMeta {
  id: string;
  file_name: string;
  display_name?: string;
  mime_type?: string;
  total_chunks?: number;
  total_token_size?: number;
}

// Source document from response_render
export interface SourceDocument {
  page_content: string;
  metadata: {
    file_id?: string;
    id?: string;
    file_name?: string;
    filename?: string;
    source?: string;
    page?: number;
    page_number?: number;
    page_idx?: number;
    chunk_id?: number;
    characters?: number;
  };
}

// Message types for communication between content script and service worker
export type MessageType =
  | 'FETCH_PDF'
  | 'GET_CONFIG'
  | 'SAVE_CONFIG'
  | 'TEST_CONNECTION'
  | 'OPEN_PDF_VIEWER';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

export interface FetchPdfPayload {
  fileId: string;
  page?: number;
}

export interface FetchPdfResponse {
  success: boolean;
  data?: ArrayBuffer;
  error?: string;
  fileName?: string;
}

export interface TestConnectionResponse {
  success: boolean;
  error?: string;
}

// PDF Viewer state
export interface PdfViewerState {
  isOpen: boolean;
  currentFileId: string | null;
  currentPage: number;
  totalPages: number;
  scale: number;
  isLoading: boolean;
  error: string | null;
}

// Events from custom renderer iframe
export interface SourceDocClickEvent {
  fileId: string;
  page: number;
  fileName: string;
}
