# Briink LangSmith Extension

A Chrome browser extension that enhances LangSmith annotation queues with PDF viewing capabilities from the Briink platform.

## Features

- **PDF Sidebar Viewer**: View source PDFs directly alongside LangSmith annotation queues
- **Page Navigation**: Click on source documents to jump to the exact page referenced
- **Secure API Key Storage**: API keys are stored securely using Chrome's encrypted storage
- **Dark Theme**: Matches LangSmith's dark mode interface

## Prerequisites

- Node.js 20+ 
- npm or yarn
- Chrome browser

## Installation

### Development Setup

1. **Clone and install dependencies:**
   ```bash
   cd briink-langsmith-extension
   npm install
   ```

2. **Create icon files:**
   
   The extension requires PNG icons. You can convert the provided SVG files or create your own:
   - `public/icons/icon16.png` (16x16)
   - `public/icons/icon48.png` (48x48)
   - `public/icons/icon128.png` (128x128)

3. **Build the extension:**
   ```bash
   npm run build
   ```

4. **Load in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

### Development Mode

For hot-reload during development:

```bash
npm run dev
```

Then load the extension from the `dist` folder in Chrome.

## Configuration

1. Click the extension icon in Chrome toolbar
2. Enter your Briink API credentials:
   - **API Key**: Your Briink platform API key
   - **API Base URL**: The Briink API endpoint (default: `https://api.briinkai.com`)
   - **Workspace ID**: (Optional) Your workspace ID if required
3. Click "Save Settings"
4. Use "Test Connection" to verify your credentials

## Usage

1. Navigate to a LangSmith annotation queue page
2. A floating PDF button (📄) will appear in the bottom-right corner
3. Click on any source document's PDF icon to open it in the sidebar
4. Use the toolbar to:
   - Navigate between pages
   - Zoom in/out
   - Fit to width

## Project Structure

```
briink-langsmith-extension/
├── src/
│   ├── popup/           # Extension popup (settings UI)
│   │   ├── popup.html
│   │   ├── main.ts
│   │   └── Popup.svelte
│   ├── sidebar/         # PDF viewer sidebar
│   │   ├── sidebar.html
│   │   ├── main.ts
│   │   └── Sidebar.svelte
│   ├── content/         # Content script (injected into LangSmith)
│   │   ├── content.ts
│   │   └── content.css
│   ├── background/      # Service worker (API calls)
│   │   └── service-worker.ts
│   └── types/           # TypeScript type definitions
│       └── index.ts
├── public/
│   └── icons/           # Extension icons
├── manifest.json        # Chrome extension manifest
├── vite.config.ts       # Vite configuration
└── package.json
```

## Tech Stack

- **Svelte 5** - UI components with runes
- **TypeScript** - Type safety
- **Vite** - Build tool
- **@crxjs/vite-plugin** - Chrome extension Vite plugin
- **PDF.js** - PDF rendering

## API Integration

The extension expects the Briink API to provide:

- `GET /status` - Health check endpoint
- `GET /files/{fileId}/content` - PDF file download
- `GET /workspaces/{workspaceId}/files/{fileId}/content` - PDF file download (with workspace)

Authentication is done via the `x-api-key` header.

## Custom Renderer Integration

The extension works with the `response_render.html` custom renderer. When a user clicks the PDF icon on a source document, the renderer sends a message:

```javascript
window.parent.postMessage({
  type: 'BRIINK_SOURCE_CLICK',
  payload: {
    fileId: 'uuid',
    page: 1,
    fileName: 'document.pdf'
  }
}, '*');
```

The extension's content script intercepts this message and opens the PDF in the sidebar.

## Troubleshooting

### Extension not loading
- Ensure you've built the project (`npm run build`)
- Check Chrome's extension error logs at `chrome://extensions/`

### PDF not loading
- Verify your API key is correct
- Check the browser console for error messages
- Ensure the Briink API is accessible

### Sidebar not appearing
- Make sure the extension is enabled in settings
- Verify you're on a LangSmith annotation queue page

## License

MIT
