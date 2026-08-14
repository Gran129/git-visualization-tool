import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type GitSource = "bundled" | "system";

export interface ResolvedGit {
  binary: string;
  gitDir: string | null;
  source: GitSource;
}

export interface GitRuntimeInfo {
  version: string;
  binary: string;
  source: GitSource;
  gitDir: string | null;
}

function thisDir(): string {
  const url = import.meta.url;
  if (typeof url === "string" && url.startsWith("file:")) {
    return path.dirname(fileURLToPath(url));
  }
  return process.cwd();
}

let cached: ResolvedGit | null = null;

export function electronOsKey(platform: NodeJS.Platform = process.platform): "win" | "mac" | "linux" {
  if (platform === "win32") {
    return "win";
  }
  if (platform === "darwin") {
    return "mac";
  }
  return "linux";
}

export function electronArchKey(arch: string = process.arch): string {
  if (arch === "ia32") {
    return "ia32";
  }
  return arch;
}

export function bundledGitTargetKey(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  return `${electronOsKey(platform)}-${electronArchKey(arch)}`;
}

function gitBinaryInDir(gitDir: string): string | null {
  const unix = path.join(gitDir, "bin", "git");
  const win = path.join(gitDir, "cmd", "git.exe");
  if (process.platform === "win32") {
    if (fs.existsSync(win)) {
      return win;
    }
    if (fs.existsSync(unix)) {
      return unix;
    }
    return null;
  }
  if (fs.existsSync(unix)) {
    return unix;
  }
  if (fs.existsSync(win)) {
    return win;
  }
  return null;
}

function findProjectRoot(): string | null {
  let dir = thisDir();
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  if (fs.existsSync(path.join(process.cwd(), "package.json"))) {
    return process.cwd();
  }
  return null;
}

function electronResourcesPath(): string | undefined {
  const value: unknown = (process as NodeJS.Process & { resourcesPath?: unknown }).resourcesPath;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function findBundledGitDir(): string | null {
  const override = process.env.GIT_VIZ_GIT_DIR ?? process.env.LOCAL_GIT_DIRECTORY;
  if (override && override.trim().length > 0) {
    const resolved = path.resolve(override);
    if (gitBinaryInDir(resolved)) {
      return resolved;
    }
  }

  const candidates: string[] = [];
  const resourcesPath = electronResourcesPath();
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, "git"));
  }

  const target = bundledGitTargetKey();
  const project = findProjectRoot();
  if (project) {
    candidates.push(path.join(project, "resources", "git", target));
  }
  candidates.push(path.join(process.cwd(), "resources", "git", target));
  candidates.push(path.join(thisDir(), "..", "resources", "git", target));
  candidates.push(path.join(thisDir(), "../..", "resources", "git", target));

  for (const dir of candidates) {
    if (gitBinaryInDir(dir)) {
      return dir;
    }
  }
  return null;
}

export function resolveGit(forceRefresh = false): ResolvedGit {
  if (cached && !forceRefresh) {
    return cached;
  }
  const gitDir = findBundledGitDir();
  if (gitDir) {
    const binary = gitBinaryInDir(gitDir);
    if (binary) {
      cached = { binary, gitDir, source: "bundled" };
      return cached;
    }
  }
  cached = {
    binary: process.platform === "win32" ? "git.exe" : "git",
    gitDir: null,
    source: "system",
  };
  return cached;
}

export function win32GitSubfolder(arch: string = process.arch): string {
  if (arch === "x64") {
    return "mingw64";
  }
  if (arch === "arm64") {
    return "clangarm64";
  }
  return "mingw32";
}

export function applyBundledGitEnv(env: NodeJS.ProcessEnv, gitDir: string): void {
  const execPath =
    process.platform === "win32"
      ? path.join(gitDir, win32GitSubfolder(), "libexec", "git-core")
      : path.join(gitDir, "libexec", "git-core");
  if (fs.existsSync(execPath) && !env.GIT_EXEC_PATH) {
    env.GIT_EXEC_PATH = execPath;
  }

  if (process.platform === "win32") {
    const sub = win32GitSubfolder();
    const extra = [path.join(gitDir, sub, "bin"), path.join(gitDir, sub, "usr", "bin"), path.join(gitDir, "cmd")];
    env.PATH = `${extra.join(path.delimiter)}${path.delimiter}${env.PATH ?? ""}`;
  } else {
    env.PATH = `${path.join(gitDir, "bin")}${path.delimiter}${env.PATH ?? ""}`;
    if (!env.GIT_CONFIG_SYSTEM) {
      const systemConfig = path.join(gitDir, "etc", "gitconfig");
      if (fs.existsSync(systemConfig)) {
        env.GIT_CONFIG_SYSTEM = systemConfig;
      }
    }
    const templateDir = path.join(gitDir, "share", "git-core", "templates");
    if (fs.existsSync(templateDir)) {
      env.GIT_TEMPLATE_DIR = templateDir;
    }
    env.PREFIX = gitDir;
    if (process.platform === "linux" && !env.GIT_SSL_CAINFO) {
      const ssl = path.join(gitDir, "ssl", "cacert.pem");
      if (fs.existsSync(ssl)) {
        env.GIT_SSL_CAINFO = ssl;
      }
    }
  }
}

export function setupGitProcessEnv(): { gitBinary: string; env: NodeJS.ProcessEnv; source: GitSource } {
  const resolved = resolveGit();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    LANG: process.env.LANG ?? "C",
    LC_ALL: process.env.LC_ALL ?? "C",
  };
  if (resolved.source === "bundled" && resolved.gitDir) {
    applyBundledGitEnv(env, resolved.gitDir);
  }
  return { gitBinary: resolved.binary, env, source: resolved.source };
}

export function readGitVersion(binary: string, env: NodeJS.ProcessEnv): string {
  const result = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    env,
    timeout: 8_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return (result.stdout || result.stderr || "").trim();
}

export function getGitRuntimeInfo(): GitRuntimeInfo {
  const { gitBinary, env, source } = setupGitProcessEnv();
  const resolved = resolveGit();
  const version = readGitVersion(gitBinary, env) || (source === "bundled" ? "bundled" : "unknown");
  return {
    version,
    binary: gitBinary,
    source,
    gitDir: resolved.gitDir,
  };
}

export function detectGitOnPath(env: NodeJS.ProcessEnv = process.env): { version: string; which: string | null } | null {
  const cmd = process.platform === "win32" ? "git.exe" : "git";
  const versionResult = spawnSync(cmd, ["--version"], {
    encoding: "utf8",
    env,
    timeout: 8_000,
    windowsHide: true,
  });
  if (versionResult.error || versionResult.status !== 0) {
    return null;
  }
  const version = (versionResult.stdout || "").trim();
  const locator = process.platform === "win32" ? "where" : "which";
  const whichResult = spawnSync(locator, [process.platform === "win32" ? "git" : "git"], {
    encoding: "utf8",
    env,
    timeout: 8_000,
    windowsHide: true,
  });
  const which =
    whichResult.status === 0
      ? (whichResult.stdout || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line.length > 0) ?? null
      : null;
  return { version, which };
}
