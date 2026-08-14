import { contextBridge, ipcRenderer } from "electron";

export interface InvokeResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

contextBridge.exposeInMainWorld("gitViz", {
  invoke: (method: string, payload: Record<string, unknown> = {}): Promise<InvokeResult> =>
    ipcRenderer.invoke("git-viz:invoke", method, payload) as Promise<InvokeResult>,
  onOpenPath: (handler: (dir: string) => void): (() => void) => {
    const listener = (_event: unknown, dir: string) => {
      handler(dir);
    };
    ipcRenderer.on("git-viz:open-path", listener);
    return () => {
      ipcRenderer.removeListener("git-viz:open-path", listener);
    };
  },
});
