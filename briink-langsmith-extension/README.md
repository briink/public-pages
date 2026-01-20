# Briink LangSmith Extension

A Chrome extension that displays PDF documents from the Briink platform alongside LangSmith annotation queues. When reviewing AI responses that reference source documents, you can click to view the original PDF at the exact page cited.

## Quick Start

### 1. Install the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `dist` folder from this project

### 2. Configure Your API Key

1. Click the extension icon in Chrome's toolbar (puzzle piece icon, then pin the Briink extension)
2. You'll see the settings popup:

   ![Settings Popup](docs/popup-screenshot.png)

3. Enter your credentials:
   - **API Key**: Your Briink platform API key (get this from your Briink account settings)
   - **API Base URL**: Usually `https://api.briinkai.com` (default)
   - **Workspace ID**: Optional - only needed if your files are in a specific workspace

4. Click **Save Settings**
5. Click **Test Connection** to verify your API key works

### 3. Using the Extension

1. Navigate to a LangSmith annotation queue page (e.g., `https://smith.langchain.com/annotation-queues/...`)

2. You'll see a floating **PDF button** in the bottom-right corner of the page

3. When viewing an annotation with source documents, click the **PDF icon** next to any source reference

4. The PDF will open in a sidebar panel on the right side of the page, automatically jumping to the referenced page

### Sidebar Controls

- **Page navigation**: Use `<` and `>` buttons or enter a page number directly
- **Zoom**: Use `+` and `-` buttons to zoom in/out
- **Close**: Click the `X` button or the floating PDF button to toggle the sidebar

## Features

- View source PDFs without leaving LangSmith
- Automatically jumps to the exact page referenced
- Resizable sidebar (drag the left edge)
- Dark theme matching LangSmith's interface
- Secure API key storage (encrypted by Chrome)
- PDF caching to avoid re-downloading

## Troubleshooting

### "Extension not working on LangSmith"
- Make sure you're on a `smith.langchain.com` page
- Check that the extension is enabled (not grayed out in `chrome://extensions/`)
- Try refreshing the page

### "PDF not loading"
- Verify your API key is correct (use **Test Connection**)
- Check that the file ID exists in your Briink workspace
- Open Chrome DevTools (F12) and check the Console for error messages

### "Can't find the extension icon"
- Click the puzzle piece icon in Chrome's toolbar
- Find "Briink LangSmith Enrichment" and click the pin icon

### "Test Connection fails"
- Double-check your API key (no extra spaces)
- Verify the API Base URL is correct
- Check your network connection

## For Developers

### Building from Source

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development mode with hot reload
npm run dev
```

### Tech Stack
- Svelte 5 + TypeScript
- Vite + @crxjs/vite-plugin
- PDF.js for rendering

### API Requirements

The extension expects these Briink API endpoints:
- `GET /status` - Health check
- `GET /files/{fileId}/content` - Download PDF
- `GET /workspaces/{workspaceId}/files/{fileId}/content` - Download PDF (with workspace)

Authentication uses the `x-api-key` header.
