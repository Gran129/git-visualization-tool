import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectGitOnPath, findBundledGitDir, getGitRuntimeInfo, type GitRuntimeInfo } from "./gitEnv.js";

export type GitInstallAction =
  | "installed"
  | "already-installed"
  | "skipped-system-git"
  | "skipped-no-bundle"
  | "skipped-disabled";

export interface GitInstallResult {
  action: GitInstallAction;
  runtime: GitRuntimeInfo;
  userGitDir: string;
  shimPath: string;
  gitOnPath: boolean;
  installedByApp: boolean;
  message: string;
}

const APP_DATA_NAME = "git-visualization-tool";

export function userGitInstallDir(): string {
  if (process.env.GIT_VIZ_USER_GIT_DIR && process.env.GIT_VIZ_USER_GIT_DIR.trim().length > 0) {
    return path.resolve(process.env.GIT_VIZ_USER_GIT_DIR);
  }
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, APP_DATA_NAME, "git");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_DATA_NAME, "git");
  }
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(dataHome, APP_DATA_NAME, "git");
}

export function userGitShimPath(): string {
  if (process.env.GIT_VIZ_USER_BIN_DIR && process.env.GIT_VIZ_USER_BIN_DIR.trim().length > 0) {
    return path.join(
      path.resolve(process.env.GIT_VIZ_USER_BIN_DIR),
      process.platform === "win32" ? "git.cmd" : "git",
    );
  }
  if (process.platform === "win32") {
    return path.join(path.dirname(userGitInstallDir()), "cmd", "git.cmd");
  }
  const binHome = process.env.XDG_BIN_HOME || path.join(os.homedir(), ".local", "bin");
  return path.join(binHome, "git");
}

function posixShellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function unixGitWrapperScript(gitDir: string): string {
  const bin = path.join(gitDir, "bin", "git");
  const execPath = path.join(gitDir, "libexec", "git-core");
  const templates = path.join(gitDir, "share", "git-core", "templates");
  const config = path.join(gitDir, "etc", "gitconfig");
  const ssl = path.join(gitDir, "ssl", "cacert.pem");
  return `#!/bin/sh
# Installed by Git可视化工具 — do not edit
export GIT_EXEC_PATH=${posixShellEscape(execPath)}
export GIT_TEMPLATE_DIR=${posixShellEscape(templates)}
export GIT_CONFIG_SYSTEM=${posixShellEscape(config)}
export PREFIX=${posixShellEscape(gitDir)}
if [ -f ${posixShellEscape(ssl)} ]; then
  export GIT_SSL_CAINFO=${posixShellEscape(ssl)}
fi
export PATH=${posixShellEscape(path.join(gitDir, "bin"))}:$PATH
exec ${posixShellEscape(bin)} "$@"
`;
}

export function windowsGitCmdScript(gitDir: string): string {
  const exe = path.join(gitDir, "cmd", "git.exe");
  return `@echo off
REM Installed by Git可视化工具 — do not edit
set "GIT_VIZ_ROOT=${gitDir}"
set "PATH=%GIT_VIZ_ROOT%\\mingw64\\bin;%GIT_VIZ_ROOT%\\clangarm64\\bin;%GIT_VIZ_ROOT%\\mingw32\\bin;%GIT_VIZ_ROOT%\\usr\\bin;%PATH%"
"${exe}" %*
`;
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase();
  }
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return left === right;
  }
}

function isOurShim(which: string | null): boolean {
  if (!which) {
    return false;
  }
  const shim = userGitShimPath();
  if (samePath(which, shim)) {
    return true;
  }
  const userDir = userGitInstallDir();
  const resolvedWhich = path.resolve(which);
  return resolvedWhich.startsWith(userDir + path.sep) || resolvedWhich === userDir;
}

function copyGitTree(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true, dereference: false, errorOnExist: false, force: true });
}

function writeShim(gitDir: string): string {
  const shim = userGitShimPath();
  fs.mkdirSync(path.dirname(shim), { recursive: true });
  if (process.platform === "win32") {
    fs.writeFileSync(shim, windowsGitCmdScript(gitDir), "utf8");
  } else {
    fs.writeFileSync(shim, unixGitWrapperScript(gitDir), { encoding: "utf8", mode: 0o755 });
    fs.chmodSync(shim, 0o755);
  }
  return shim;
}

function ensureUnixLocalBinOnPath(binDir: string): void {
  const home = os.homedir();
  const exportLine = `export PATH="${binDir}:$PATH"`;
  const marker = "# git-visualization-tool";
  const rcFiles = [".profile", ".bashrc", ".zshrc", ".zprofile"].map((name) => path.join(home, name));
  const pathEnv = process.env.PATH ?? "";
  const alreadyOnPath = pathEnv.split(path.delimiter).some((entry) => path.resolve(entry) === path.resolve(binDir));
  if (alreadyOnPath) {
    return;
  }
  for (const rc of rcFiles) {
    if (!fs.existsSync(rc)) {
      continue;
    }
    const current = fs.readFileSync(rc, "utf8");
    if (current.includes(marker)) {
      return;
    }
  }
  const profile = path.join(home, ".profile");
  const snippet = `\n${marker}\n${exportLine}\n`;
  fs.appendFileSync(profile, snippet, "utf8");
}

function addWindowsUserPath(dir: string): void {
  const script = `
$dir = ${JSON.stringify(dir)}
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$parts = @()
if ($userPath) { $parts = $userPath -split ';' | Where-Object { $_ -ne '' } }
$exists = $parts | Where-Object { $_.TrimEnd('\\') -ieq $dir.TrimEnd('\\') }
if (-not $exists) {
  $newPath = if ($parts.Count -eq 0) { $dir } else { ($parts + $dir) -join ';' }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
}
`;
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
    timeout: 15_000,
  });
}

function writeManifest(gitDir: string, sourceDir: string): void {
  const runtime = getGitRuntimeInfo();
  const payload = {
    sourceDir,
    gitDir,
    version: runtime.version,
    installedAt: Date.now(),
  };
  fs.writeFileSync(path.join(gitDir, ".git-viz-user-install.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function ensureUserGitOnPath(options: { force?: boolean } = {}): GitInstallResult {
  const runtime = getGitRuntimeInfo();
  const userGitDir = userGitInstallDir();
  const shimPath = userGitShimPath();
  const disabled = process.env.GIT_VIZ_SKIP_GIT_INSTALL === "1";

  const base = (action: GitInstallAction, message: string, extra?: Partial<GitInstallResult>): GitInstallResult => ({
    action,
    runtime,
    userGitDir,
    shimPath,
    gitOnPath: detectGitOnPath() !== null,
    installedByApp: isOurShim(detectGitOnPath()?.which ?? null) || fs.existsSync(path.join(userGitDir, ".git-viz-user-install.json")),
    message,
    ...extra,
  });

  if (disabled && !options.force) {
    return base("skipped-disabled", "已跳过 Git 安装（GIT_VIZ_SKIP_GIT_INSTALL=1）");
  }

  const bundledDir = findBundledGitDir();
  if (!bundledDir) {
    return base("skipped-no-bundle", "未找到内置 Git。开发模式可使用系统 Git；发布请用 npm run dist 打包。");
  }

  const onPath = detectGitOnPath();
  if (onPath && !isOurShim(onPath.which) && !options.force) {
    return base("skipped-system-git", `系统已有 Git（${onPath.version}），未覆盖。应用仍使用内置 Git。`, {
      gitOnPath: true,
      installedByApp: false,
    });
  }

  if (!options.force && fs.existsSync(path.join(userGitDir, ".git-viz-user-install.json")) && fs.existsSync(shimPath)) {
    return base("already-installed", "本应用已将 Git 安装到用户目录。", {
      gitOnPath: onPath !== null,
      installedByApp: true,
    });
  }

  copyGitTree(bundledDir, userGitDir);
  writeShim(userGitDir);
  writeManifest(userGitDir, bundledDir);

  if (process.platform === "win32") {
    if (!process.env.GIT_VIZ_USER_BIN_DIR) {
      addWindowsUserPath(path.dirname(shimPath));
    }
  } else if (!process.env.GIT_VIZ_USER_BIN_DIR) {
    ensureUnixLocalBinOnPath(path.dirname(shimPath));
  }

  return {
    action: "installed",
    runtime: getGitRuntimeInfo(),
    userGitDir,
    shimPath,
    gitOnPath: true,
    installedByApp: true,
    message: `已将 Git 安装到 ${shimPath}。新开一个终端即可使用 git 命令。`,
  };
}
