// Type declaration for VS Code webview API
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// Acquire the API once and export
const vscode = acquireVsCodeApi();

export { vscode };

