import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setupGitProcessEnv } from "./gitEnv.js";

export class GitError extends Error {
  readonly name = "GitError";

  constructor(
    message: string,
    readonly args: string[],
    readonly stderr: string,
    readonly code: number,
    readonly stdout: string,
  ) {
    super(message);
  }
}

export function resolveRepo(input: string): string {
  if (!input || input.trim().length === 0) {
    throw new Error("仓库路径不能为空");
  }
  const resolved = path.resolve(input);
  const gitPath = path.join(resolved, ".git");
  if (!fs.existsSync(gitPath)) {
    throw new Error(`不是 Git 仓库: ${resolved}`);
  }
  return resolved;
}

export function isGitRepo(input: string): boolean {
  try {
    resolveRepo(input);
    return true;
  } catch {
    return false;
  }
}

export interface GitRunOptions {
  stdin?: string;
  allowFailure?: boolean;
  timeoutMs?: number;
}

export interface GitRunResult {
  stdout: string;
  stderr: string;
  code: number;
  args: string[];
}

export function runGit(
  repo: string,
  args: string[],
  options: GitRunOptions = {},
): Promise<GitRunResult> {
  const cwd = path.resolve(repo);
  const timeoutMs = options.timeoutMs ?? 30_000;
  const fullArgs = ["-c", "core.quotepath=false", "-c", "color.ui=false", ...args];

  const { gitBinary, env } = setupGitProcessEnv();

  return new Promise((resolve, reject) => {
    const child = spawn(gitBinary, fullArgs, {
      cwd,
      env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    child.on("error", (error) => {
      clearTimeout(timer);
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        reject(
          new Error(
            `未找到 Git 可执行文件（${gitBinary}）。请使用本应用的安装包（已内置 Git），或在开发环境安装 Git。`,
          ),
        );
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const result: GitRunResult = {
        stdout,
        stderr,
        code: code ?? 1,
        args: fullArgs,
      };
      if (result.code !== 0 && !options.allowFailure) {
        reject(
          new GitError(
            stderr.trim() || stdout.trim() || `git 命令失败 (${result.code})`,
            args,
            stderr,
            result.code,
            stdout,
          ),
        );
        return;
      }
      resolve(result);
    });
  });
}

export async function gitOk(repo: string, args: string[], options?: GitRunOptions): Promise<string> {
  const result = await runGit(repo, args, options);
  return result.stdout;
}
