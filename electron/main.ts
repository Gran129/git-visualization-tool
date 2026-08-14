import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { invoke } from "../server/dispatch";
import { ensureUserGitOnPath } from "../server/gitInstall";

const isDev = process.env.GIT_VIZ_DEV === "1";

function preloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: "Git可视化工具",
    backgroundColor: "#0d1117",
    autoHideMenuBar: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    void win.loadURL(process.env.GIT_VIZ_DEV_URL ?? "http://127.0.0.1:5173");
  } else {
    void win.loadFile(path.join(__dirname, "../dist/client/index.html"));
  }

  return win;
}

function setupMenu(win: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "文件",
      submenu: [
        {
          label: "打开仓库…",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            void pickDirectory(win).then((dir) => {
              if (dir) {
                win.webContents.send("git-viz:open-path", dir);
              }
            });
          },
        },
        { type: "separator" },
        { role: "quit", label: "退出" },
      ],
    },
    { role: "editMenu", label: "编辑" },
    { role: "viewMenu", label: "视图" },
    { role: "windowMenu", label: "窗口" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function pickDirectory(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: "选择 Git 仓库目录",
    properties: ["openDirectory", "createDirectory"],
  });
  const selected = result.filePaths[0];
  return result.canceled || !selected ? null : selected;
}

app.whenReady().then(() => {
  ipcMain.handle("git-viz:invoke", async (_event, method: string, payload: Record<string, unknown>) => {
    if (method === "selectDirectory") {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (!win) {
        return { ok: false, error: "没有可用窗口" };
      }
      const dir = await pickDirectory(win);
      return { ok: true, data: dir };
    }
    return invoke(method, payload ?? {});
  });

  try {
    const install = ensureUserGitOnPath();
    if (install.action === "installed") {
      console.log(install.message);
    }
  } catch (error) {
    console.error("将 Git 安装到用户目录失败:", error);
  }

  const win = createWindow();
  setupMenu(win);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const next = createWindow();
      setupMenu(next);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
