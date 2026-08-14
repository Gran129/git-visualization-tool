/// <reference types="vite/client" />

interface GitVizBridge {
  invoke: (
    method: string,
    payload?: Record<string, unknown>,
  ) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  onOpenPath: (handler: (dir: string) => void) => () => void;
}

interface Window {
  gitViz?: GitVizBridge;
}
