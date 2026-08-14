#!/usr/bin/env node
/**
 * Download a portable Git distribution (dugite-native) into
 * resources/git/<electron-os>-<arch>/ so electron-builder can ship it.
 *
 * Usage:
 *   node scripts/prepare-bundled-git.mjs
 *   node scripts/prepare-bundled-git.mjs --os linux --arch x64
 *   node scripts/prepare-bundled-git.mjs --all
 */
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DUGITE_RELEASE = "v2.53.0-4";
export const DUGITE_VERSION = "v2.53.0";
export const DUGITE_BUILD = "4098283";
export const GIT_VERSION = "2.53.0";

/** @type {Record<string, { asset: string, sha256: string }>} */
const TARGETS = {
  "linux-x64": {
    asset: "ubuntu-x64",
    sha256: "cca76aa31ad9e835e771ee7f55b73934777fbd8d16757a10d307ba06de860901",
  },
  "linux-arm64": {
    asset: "ubuntu-arm64",
    sha256: "a161f45af4626bb7e0c688854bd4a9aee47cc514bca404cff0a5e3536ef1c0af",
  },
  "linux-armv7l": {
    asset: "ubuntu-arm",
    sha256: "9d858586217c24abed503cd5243fd8b7e3711d9fde5c6d9717d1434022193820",
  },
  "linux-ia32": {
    asset: "ubuntu-x86",
    sha256: "b5bfa2bdd0d365c743cbe9e695a5efe4bbd4312a145709843af659495cf1a309",
  },
  "win-x64": {
    asset: "windows-x64",
    sha256: "7b76bc5c32c0d7c5984efdc2a8a32697cf1e8a43bc55176fbf9869c0ee995130",
  },
  "win-arm64": {
    asset: "windows-arm64",
    sha256: "1abbeb3a2ce06e9b80e75bb888dce959b6c73bdb11ccc670a01a71d64f4422a5",
  },
  "win-ia32": {
    asset: "windows-x86",
    sha256: "8c5e167976735cba3320cf3b92b30b0c845827570747c6c0b52725442d0ab722",
  },
  "mac-x64": {
    asset: "macOS-x64",
    sha256: "ae6686718aa34f4140424db16b92a47dcffd6d1f312eb8b5f3b267f7404e2680",
  },
  "mac-arm64": {
    asset: "macOS-arm64",
    sha256: "f9dc64635a5b62fbd7ad95db73268bbb8912255ac516d65d37bf7af22fcb8ffe",
  },
};

function hostTargetKey() {
  const osKey = process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";
  const arch = process.arch === "ia32" ? "ia32" : process.arch;
  return `${osKey}-${arch}`;
}

function parseArgs(argv) {
  /** @type {{ all: boolean, os?: string, arch?: string }} */
  const out = { all: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") {
      out.all = true;
    } else if (arg === "--os") {
      out.os = argv[i + 1];
      i += 1;
    } else if (arg === "--arch") {
      out.arch = argv[i + 1];
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/prepare-bundled-git.mjs [--os linux|win|mac] [--arch x64|arm64] [--all]");
      process.exit(0);
    }
  }
  return out;
}

function keysToPrepare(args) {
  if (args.all) {
    return Object.keys(TARGETS);
  }
  if (args.os || args.arch) {
    const osKey = args.os ?? hostTargetKey().split("-")[0];
    const arch = args.arch ?? process.arch;
    const key = `${osKey}-${arch}`;
    if (!TARGETS[key]) {
      throw new Error(`不支持的 Git 目标: ${key}`);
    }
    return [key];
  }
  const host = hostTargetKey();
  if (!TARGETS[host]) {
    throw new Error(`当前平台没有预置的便携 Git: ${host}`);
  }
  return [host];
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function gitLooksPresent(dest) {
  return existsSync(path.join(dest, "bin", "git")) || existsSync(path.join(dest, "cmd", "git.exe"));
}

function versionMatches(dest) {
  const marker = path.join(dest, ".git-viz-bundle.json");
  if (!existsSync(marker)) {
    return false;
  }
  try {
    const data = JSON.parse(readFileSync(marker, "utf8"));
    return data.release === DUGITE_RELEASE && data.gitVersion === GIT_VERSION;
  } catch {
    return false;
  }
}

async function download(url, destFile) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`下载失败 ${response.status} ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destFile));
}

async function prepareOne(targetKey) {
  const spec = TARGETS[targetKey];
  const dest = path.join(ROOT, "resources", "git", targetKey);
  if (gitLooksPresent(dest) && versionMatches(dest)) {
    console.log(`已缓存 ${targetKey} (Git ${GIT_VERSION})`);
    return dest;
  }

  const fileName = `dugite-native-${DUGITE_VERSION}-${DUGITE_BUILD}-${spec.asset}.tar.gz`;
  const url = `https://github.com/desktop/dugite-native/releases/download/${DUGITE_RELEASE}/${fileName}`;
  const work = path.join(tmpdir(), `git-viz-dugite-${targetKey}-${process.pid}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const archive = path.join(work, fileName);

  console.log(`下载 ${targetKey} ← ${url}`);
  await download(url, archive);
  const digest = sha256File(archive);
  if (digest !== spec.sha256) {
    throw new Error(`校验失败 ${targetKey}: 期望 ${spec.sha256} 实际 ${digest}`);
  }

  const extractDir = path.join(work, "extract");
  mkdirSync(extractDir, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "-C", extractDir], { stdio: "inherit" });
  if (!gitLooksPresent(extractDir)) {
    throw new Error(`解压后未找到 git 可执行文件: ${extractDir}`);
  }

  await rm(dest, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  try {
    await rename(extractDir, dest);
  } catch {
    mkdirSync(dest, { recursive: true });
    execFileSync("cp", ["-a", `${extractDir}/.`, dest]);
  }

  const marker = {
    release: DUGITE_RELEASE,
    gitVersion: GIT_VERSION,
    target: targetKey,
    asset: spec.asset,
    sha256: spec.sha256,
  };
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(dest, ".git-viz-bundle.json"), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  await rm(work, { recursive: true, force: true });
  console.log(`就绪 ${dest}`);
  return dest;
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  const keys = keysToPrepare(parseArgs(process.argv.slice(2)));
  for (const key of keys) {
    await prepareOne(key);
  }
}
