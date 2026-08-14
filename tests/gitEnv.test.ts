import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { applyBundledGitEnv, bundledGitTargetKey, resolveGit, setupGitProcessEnv } from "../server/gitEnv.js";
import { ensureUserGitOnPath, unixGitWrapperScript, userGitInstallDir, userGitShimPath } from "../server/gitInstall.js";
import { runGit } from "../server/git.js";

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  delete process.env.GIT_VIZ_GIT_DIR;
  delete process.env.GIT_VIZ_USER_GIT_DIR;
  delete process.env.GIT_VIZ_USER_BIN_DIR;
  delete process.env.GIT_VIZ_SKIP_GIT_INSTALL;
  resolveGit(true);
});

function makeFakeGitDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-viz-bundle-"));
  created.push(dir);
  const binDir = path.join(dir, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.join(dir, "libexec", "git-core"), { recursive: true });
  fs.mkdirSync(path.join(dir, "etc"), { recursive: true });
  fs.mkdirSync(path.join(dir, "share", "git-core", "templates"), { recursive: true });
  fs.mkdirSync(path.join(dir, "ssl"), { recursive: true });
  fs.writeFileSync(path.join(dir, "etc", "gitconfig"), "[core]\n\tquotepath = false\n");
  fs.writeFileSync(path.join(dir, "ssl", "cacert.pem"), "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n");
  const which = spawnSync("which", ["git"], { encoding: "utf8" });
  const realGit = which.stdout.trim();
  if (!realGit) {
    throw new Error("test requires system git to build a forwarding stub");
  }
  fs.writeFileSync(path.join(binDir, "git"), `#!/bin/sh\nexec ${JSON.stringify(realGit)} "$@"\n`, {
    mode: 0o755,
  });
  fs.chmodSync(path.join(binDir, "git"), 0o755);
  return dir;
}

describe("bundled git environment", () => {
  it("names the electron-builder extraResources key for this host", () => {
    expect(bundledGitTargetKey("linux", "x64")).toBe("linux-x64");
    expect(bundledGitTargetKey("win32", "arm64")).toBe("win-arm64");
    expect(bundledGitTargetKey("darwin", "arm64")).toBe("mac-arm64");
  });

  it("prefers GIT_VIZ_GIT_DIR over system git", () => {
    const gitDir = makeFakeGitDir();
    process.env.GIT_VIZ_GIT_DIR = gitDir;
    const resolved = resolveGit(true);
    expect(resolved.source).toBe("bundled");
    expect(resolved.gitDir).toBe(gitDir);
    expect(resolved.binary).toBe(path.join(gitDir, "bin", "git"));

    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    applyBundledGitEnv(env, gitDir);
    expect(env.GIT_EXEC_PATH).toBe(path.join(gitDir, "libexec", "git-core"));
    expect(env.GIT_SSL_CAINFO).toBe(path.join(gitDir, "ssl", "cacert.pem"));
    expect(env.PREFIX).toBe(gitDir);
  });

  it("runs git through the bundled binary", async () => {
    const gitDir = makeFakeGitDir();
    process.env.GIT_VIZ_GIT_DIR = gitDir;
    resolveGit(true);
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "git-viz-repo-"));
    created.push(repo);
    const { gitBinary } = setupGitProcessEnv();
    expect(gitBinary).toBe(path.join(gitDir, "bin", "git"));
    await runGit(repo, ["init"]);
    expect(fs.existsSync(path.join(repo, ".git"))).toBe(true);
  });

  it("writes a unix wrapper that points at the bundled tree", () => {
    const script = unixGitWrapperScript("/opt/app/resources/git");
    expect(script).toContain("export GIT_EXEC_PATH='/opt/app/resources/git/libexec/git-core'");
    expect(script).toContain("exec '/opt/app/resources/git/bin/git'");
  });

  it("skips PATH install when system git is already available", () => {
    const gitDir = makeFakeGitDir();
    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-viz-user-"));
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-viz-bin-"));
    created.push(userDir, binDir);
    process.env.GIT_VIZ_GIT_DIR = gitDir;
    process.env.GIT_VIZ_USER_GIT_DIR = path.join(userDir, "git");
    process.env.GIT_VIZ_USER_BIN_DIR = binDir;
    resolveGit(true);
    const result = ensureUserGitOnPath();
    expect(result.action).toBe("skipped-system-git");
    expect(fs.existsSync(userGitShimPath())).toBe(false);
  });

  it("installs git into user PATH dirs when no system git is visible", () => {
    const gitDir = makeFakeGitDir();
    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-viz-user-"));
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-viz-bin-"));
    created.push(userDir, binDir);
    process.env.GIT_VIZ_GIT_DIR = gitDir;
    process.env.GIT_VIZ_USER_GIT_DIR = path.join(userDir, "git");
    process.env.GIT_VIZ_USER_BIN_DIR = binDir;
    resolveGit(true);

    const emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), "git-viz-empty-path-"));
    created.push(emptyPath);
    const originalPath = process.env.PATH;
    process.env.PATH = emptyPath;
    try {
      const result = ensureUserGitOnPath();
      expect(result.action).toBe("installed");
      expect(fs.existsSync(userGitShimPath())).toBe(true);
      expect(userGitInstallDir()).toBe(path.join(userDir, "git"));
      const probe = spawnSync(userGitShimPath(), ["--version"], { encoding: "utf8" });
      expect(probe.status).toBe(0);
      expect(probe.stdout).toMatch(/git version/i);
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
