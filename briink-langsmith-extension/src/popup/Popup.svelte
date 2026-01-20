<script lang="ts">
  import type { BriinkConfig, TestConnectionResponse } from '../types';

  let apiKey = $state('');
  let apiBaseUrl = $state('https://api.briinkai.com');
  let workspaceId = $state('');
  let enabled = $state(true);
  let showApiKey = $state(false);
  let status = $state<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  let isLoading = $state(false);
  let isTesting = $state(false);

  // Load saved config on mount
  $effect(() => {
    loadConfig();
  });

  async function loadConfig() {
    try {
      const result = await chrome.storage.sync.get(['briinkConfig']);
      if (result.briinkConfig) {
        const config: BriinkConfig = result.briinkConfig;
        apiKey = config.apiKey || '';
        apiBaseUrl = config.apiBaseUrl || 'https://api.briinkai.com';
        workspaceId = config.workspaceId || '';
        enabled = config.enabled ?? true;
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }

  async function saveConfig() {
    isLoading = true;
    status = null;

    try {
      const config: BriinkConfig = {
        apiKey,
        apiBaseUrl,
        workspaceId: workspaceId || undefined,
        enabled,
      };

      await chrome.storage.sync.set({ briinkConfig: config });
      status = { type: 'success', message: 'Settings saved successfully!' };

      // Clear status after 3 seconds
      setTimeout(() => {
        status = null;
      }, 3000);
    } catch (err) {
      status = { type: 'error', message: 'Failed to save settings' };
    } finally {
      isLoading = false;
    }
  }

  async function testConnection() {
    if (!apiKey) {
      status = { type: 'error', message: 'Please enter an API key first' };
      return;
    }

    isTesting = true;
    status = { type: 'info', message: 'Testing connection...' };

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_CONNECTION',
        payload: { apiKey, apiBaseUrl },
      }) as TestConnectionResponse;

      if (response.success) {
        status = { type: 'success', message: 'Connection successful!' };
      } else {
        status = { type: 'error', message: response.error || 'Connection failed' };
      }
    } catch (err) {
      status = { type: 'error', message: 'Failed to test connection' };
    } finally {
      isTesting = false;
    }
  }

  function toggleApiKeyVisibility() {
    showApiKey = !showApiKey;
  }
</script>

<div class="container">
  <header>
    <h1>Briink LangSmith</h1>
    <p class="subtitle">PDF Viewer for Annotation Queues</p>
  </header>

  <div class="section">
    <label for="apiKey">Briink API Key</label>
    <div class="input-group">
      <input
        type={showApiKey ? 'text' : 'password'}
        id="apiKey"
        bind:value={apiKey}
        placeholder="Enter your API key"
      />
      <button
        class="icon-btn"
        onclick={toggleApiKeyVisibility}
        title={showApiKey ? 'Hide' : 'Show'}
      >
        {showApiKey ? '🙈' : '👁️'}
      </button>
    </div>
  </div>

  <div class="section">
    <label for="apiBaseUrl">API Base URL</label>
    <input
      type="text"
      id="apiBaseUrl"
      bind:value={apiBaseUrl}
      placeholder="https://api.briinkai.com"
    />
  </div>

  <div class="section">
    <label for="workspaceId">Workspace ID <span class="optional">(optional)</span></label>
    <input
      type="text"
      id="workspaceId"
      bind:value={workspaceId}
      placeholder="Enter workspace ID"
    />
  </div>

  <div class="button-group">
    <button class="primary" onclick={saveConfig} disabled={isLoading}>
      {isLoading ? 'Saving...' : 'Save Settings'}
    </button>
    <button class="secondary" onclick={testConnection} disabled={isTesting || !apiKey}>
      {isTesting ? 'Testing...' : 'Test Connection'}
    </button>
  </div>

  {#if status}
    <div class="status {status.type}">
      {status.message}
    </div>
  {/if}

  <div class="section toggle-section">
    <label class="toggle-label">
      <input type="checkbox" bind:checked={enabled} onchange={saveConfig} />
      <span class="toggle-text">Enable PDF Sidebar</span>
    </label>
  </div>

  <footer>
    <span class="version">v1.0.0</span>
  </footer>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #1a1d21;
    color: #e8eaed;
    width: 320px;
    min-height: 400px;
  }

  .container {
    padding: 16px;
  }

  header {
    text-align: center;
    margin-bottom: 20px;
  }

  h1 {
    font-size: 18px;
    margin: 0 0 4px 0;
    color: #8ab4f8;
  }

  .subtitle {
    font-size: 12px;
    color: #9aa0a6;
    margin: 0;
  }

  .section {
    margin-bottom: 16px;
  }

  label {
    display: block;
    font-size: 12px;
    color: #9aa0a6;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .optional {
    text-transform: none;
    font-size: 11px;
  }

  input[type="text"],
  input[type="password"] {
    width: 100%;
    padding: 10px 12px;
    background-color: #22262b;
    border: 1px solid #3c4043;
    border-radius: 6px;
    color: #e8eaed;
    font-size: 13px;
    box-sizing: border-box;
  }

  input[type="text"]:focus,
  input[type="password"]:focus {
    outline: none;
    border-color: #8ab4f8;
  }

  .input-group {
    display: flex;
    gap: 8px;
  }

  .input-group input {
    flex: 1;
  }

  .icon-btn {
    padding: 8px 12px;
    background-color: #22262b;
    border: 1px solid #3c4043;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }

  .icon-btn:hover {
    background-color: #2d3136;
  }

  .button-group {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  button {
    flex: 1;
    padding: 10px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .primary {
    background-color: #8ab4f8;
    color: #1a1d21;
  }

  .primary:hover:not(:disabled) {
    background-color: #a8c7fa;
  }

  .secondary {
    background-color: #3c4043;
    color: #e8eaed;
  }

  .secondary:hover:not(:disabled) {
    background-color: #4a4f54;
  }

  .status {
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 12px;
    margin-bottom: 16px;
  }

  .status.success {
    background-color: rgba(129, 201, 149, 0.15);
    color: #81c995;
    border: 1px solid rgba(129, 201, 149, 0.3);
  }

  .status.error {
    background-color: rgba(242, 139, 130, 0.15);
    color: #f28b82;
    border: 1px solid rgba(242, 139, 130, 0.3);
  }

  .status.info {
    background-color: rgba(138, 180, 248, 0.15);
    color: #8ab4f8;
    border: 1px solid rgba(138, 180, 248, 0.3);
  }

  .toggle-section {
    padding-top: 16px;
    border-top: 1px solid #3c4043;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .toggle-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #8ab4f8;
  }

  .toggle-text {
    font-size: 13px;
    color: #e8eaed;
    text-transform: none;
  }

  footer {
    text-align: center;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #3c4043;
  }

  .version {
    font-size: 11px;
    color: #9aa0a6;
  }
</style>
