import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GitError, isGitRepo } from "./git.js";
import type { GitRunResult } from "./git.js";
import { getGitRuntimeInfo } from "./gitEnv.js";
import { ensureUserGitOnPath } from "./gitInstall.js";
import * as ops from "./ops.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function repoFrom(req: Request): string {
  const value = typeof req.query.path === "string" ? req.query.path : req.body?.path;
  if (typeof value !== "string" || value.trim().length === 0) {
    return ops.defaultRepoPath();
  }
  return ops.requireRepo(value);
}

function isGitRunResult(error: unknown): error is GitRunResult {
  return (
    typeof error === "object" &&
    error !== null &&
    "args" in error &&
    "code" in error &&
    "stderr" in error &&
    "stdout" in error
  );
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof GitError) {
    res.status(409).json({
      ok: false,
      error: error.message,
      stderr: error.stderr,
      command: error.args,
      code: error.code,
    });
    return;
  }
  if (isGitRunResult(error)) {
    res.status(409).json({
      ok: false,
      error: error.stderr.trim() || error.stdout.trim() || "git 命令失败",
      stderr: error.stderr,
      command: error.args,
      code: error.code,
    });
    return;
  }
  const message = error instanceof Error ? error.message : "未知错误";
  res.status(400).json({ ok: false, error: message });
}

async function wrap(res: Response, fn: () => Promise<unknown>): Promise<void> {
  try {
    const data = await fn();
    res.json({ ok: true, data });
  } catch (error) {
    sendError(res, error);
  }
}

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, data: { service: "git-visualization-tool", git: getGitRuntimeInfo() } });
  });

  app.get("/api/git-runtime", (_req, res) => {
    res.json({ ok: true, data: getGitRuntimeInfo() });
  });

  app.post("/api/git-install", (req, res) => {
    wrap(res, async () => ensureUserGitOnPath({ force: Boolean(req.body?.force) }));
  });

  app.get("/api/default-path", (_req, res) => {
    res.json({ ok: true, data: { path: ops.defaultRepoPath(), home: ops.homedir() } });
  });

  app.post("/api/repo/open", (req, res) => {
    wrap(res, async () => {
      const input = String(req.body?.path ?? "");
      const resolved = path.resolve(input);
      if (!fs.existsSync(resolved)) {
        throw new Error(`路径不存在: ${resolved}`);
      }
      if (!isGitRepo(resolved)) {
        throw new Error(`不是 Git 仓库: ${resolved}`);
      }
      return ops.getRepoSummary(resolved);
    });
  });

  app.get("/api/repo", (req, res) => {
    wrap(res, async () => ops.getRepoSummary(repoFrom(req)));
  });

  app.get("/api/graph", (req, res) => {
    wrap(res, async () =>
      ops.getGraph(repoFrom(req), {
        max: req.query.max ? Number(req.query.max) : undefined,
        skip: req.query.skip ? Number(req.query.skip) : undefined,
        all: req.query.all === "0" ? false : true,
        ref: typeof req.query.ref === "string" ? req.query.ref : undefined,
      }),
    );
  });

  app.get("/api/status", (req, res) => {
    wrap(res, async () => ops.getStatus(repoFrom(req)));
  });

  app.get("/api/refs", (req, res) => {
    wrap(res, async () => ops.listRefs(repoFrom(req)));
  });

  app.get("/api/commit/:hash", (req, res) => {
    wrap(res, async () => ops.getCommitDetail(repoFrom(req), String(req.params.hash)));
  });

  app.get("/api/diff", (req, res) => {
    wrap(res, async () =>
      ops.getDiff(repoFrom(req), {
        file: typeof req.query.file === "string" ? req.query.file : undefined,
        staged: req.query.staged === "1",
        commit: typeof req.query.commit === "string" ? req.query.commit : undefined,
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
      }),
    );
  });

  app.get("/api/blame", (req, res) => {
    wrap(res, async () => {
      const file = String(req.query.file ?? "");
      if (!file) {
        throw new Error("缺少 file 参数");
      }
      const rev = typeof req.query.rev === "string" ? req.query.rev : undefined;
      return ops.getBlame(repoFrom(req), file, rev);
    });
  });

  app.get("/api/tree", (req, res) => {
    wrap(res, async () => {
      const rev = String(req.query.rev ?? "HEAD");
      const dir = typeof req.query.dir === "string" ? req.query.dir : "";
      return ops.getTree(repoFrom(req), rev, dir);
    });
  });

  app.get("/api/file", (req, res) => {
    wrap(res, async () => {
      const file = String(req.query.file ?? "");
      const rev = String(req.query.rev ?? "HEAD");
      if (!file) {
        throw new Error("缺少 file 参数");
      }
      return { content: await ops.getFileContents(repoFrom(req), rev, file) };
    });
  });

  app.get("/api/stash", (req, res) => {
    wrap(res, async () => ops.listStash(repoFrom(req)));
  });

  app.get("/api/reflog", (req, res) => {
    wrap(res, async () => ops.listReflog(repoFrom(req)));
  });

  app.get("/api/search", (req, res) => {
    wrap(res, async () => {
      const q = String(req.query.q ?? "").trim();
      if (!q) {
        return [];
      }
      return ops.searchCommits(repoFrom(req), q);
    });
  });

  app.get("/api/file-log", (req, res) => {
    wrap(res, async () => {
      const file = String(req.query.file ?? "");
      if (!file) {
        throw new Error("缺少 file 参数");
      }
      return ops.fileLog(repoFrom(req), file);
    });
  });

  app.get("/api/compare", (req, res) => {
    wrap(res, async () => {
      const from = String(req.query.from ?? "");
      const to = String(req.query.to ?? "");
      if (!from || !to) {
        throw new Error("需要 from 和 to");
      }
      return ops.compareRefs(repoFrom(req), from, to);
    });
  });

  app.post("/api/stage", (req, res) => {
    wrap(res, async () => {
      await ops.stageFile(repoFrom(req), String(req.body.file));
      return ops.getStatus(repoFrom(req));
    });
  });

  app.post("/api/unstage", (req, res) => {
    wrap(res, async () => {
      await ops.unstageFile(repoFrom(req), String(req.body.file));
      return ops.getStatus(repoFrom(req));
    });
  });

  app.post("/api/discard", (req, res) => {
    wrap(res, async () => {
      await ops.discardFile(repoFrom(req), String(req.body.file), Boolean(req.body.untracked));
      return ops.getStatus(repoFrom(req));
    });
  });

  app.post("/api/commit", (req, res) => {
    wrap(res, async () => {
      const message = String(req.body.message ?? "");
      const amend = Boolean(req.body.amend);
      const stdout = await ops.commitChanges(repoFrom(req), message, amend);
      return { stdout };
    });
  });

  app.post("/api/checkout", (req, res) => {
    wrap(res, async () => {
      await ops.checkoutRef(repoFrom(req), String(req.body.target), Boolean(req.body.create));
      return ops.getRepoSummary(repoFrom(req));
    });
  });

  app.post("/api/branch", (req, res) => {
    wrap(res, async () => {
      const action = String(req.body.action ?? "create");
      const repo = repoFrom(req);
      if (action === "create") {
        await ops.createBranch(repo, String(req.body.name), req.body.startPoint);
      } else if (action === "delete") {
        await ops.deleteBranch(repo, String(req.body.name), Boolean(req.body.force));
      } else if (action === "rename") {
        await ops.renameBranch(repo, String(req.body.from), String(req.body.to));
      } else {
        throw new Error(`未知分支操作: ${action}`);
      }
      return ops.listRefs(repo);
    });
  });

  app.post("/api/merge", (req, res) => {
    wrap(res, async () => {
      const stdout = await ops.mergeRef(repoFrom(req), String(req.body.target), Boolean(req.body.noFf));
      return { stdout };
    });
  });

  app.post("/api/rebase", (req, res) => {
    wrap(res, async () => {
      const stdout = await ops.rebaseOnto(repoFrom(req), String(req.body.target));
      return { stdout };
    });
  });

  app.post("/api/cherry-pick", (req, res) => {
    wrap(res, async () => {
      const stdout = await ops.cherryPick(repoFrom(req), String(req.body.hash));
      return { stdout };
    });
  });

  app.post("/api/revert", (req, res) => {
    wrap(res, async () => {
      const stdout = await ops.revertCommit(repoFrom(req), String(req.body.hash));
      return { stdout };
    });
  });

  app.post("/api/reset", (req, res) => {
    wrap(res, async () => {
      const mode = req.body.mode as "soft" | "mixed" | "hard";
      if (mode !== "soft" && mode !== "mixed" && mode !== "hard") {
        throw new Error("reset 模式必须是 soft / mixed / hard");
      }
      await ops.resetTo(repoFrom(req), String(req.body.hash), mode);
      return ops.getRepoSummary(repoFrom(req));
    });
  });

  app.post("/api/tag", (req, res) => {
    wrap(res, async () => {
      const action = String(req.body.action ?? "create");
      const repo = repoFrom(req);
      if (action === "delete") {
        await ops.deleteTag(repo, String(req.body.name));
      } else {
        await ops.createTag(repo, String(req.body.name), req.body.message, req.body.hash);
      }
      return ops.listRefs(repo);
    });
  });

  app.post("/api/stash", (req, res) => {
    wrap(res, async () => {
      const action = String(req.body.action ?? "save");
      const repo = repoFrom(req);
      switch (action) {
        case "save":
          await ops.stashSave(repo, req.body.message, Boolean(req.body.includeUntracked));
          break;
        case "apply":
          await ops.stashApply(repo, String(req.body.ref), false);
          break;
        case "pop":
          await ops.stashApply(repo, String(req.body.ref), true);
          break;
        case "drop":
          await ops.stashDrop(repo, String(req.body.ref));
          break;
        default:
          throw new Error(`未知 stash 操作: ${action}`);
      }
      return ops.listStash(repo);
    });
  });

  app.post("/api/fetch", (req, res) => {
    wrap(res, async () => ({ stdout: await ops.fetchRemote(repoFrom(req), req.body.remote) }));
  });

  app.post("/api/pull", (req, res) => {
    wrap(res, async () => ({
      stdout: await ops.pullRemote(
        repoFrom(req),
        Boolean(req.body.rebase),
        req.body.remote,
        req.body.branch,
      ),
    }));
  });

  app.post("/api/push", (req, res) => {
    wrap(res, async () => ({
      stdout: await ops.pushRemote(
        repoFrom(req),
        String(req.body.remote ?? "origin"),
        String(req.body.branch),
        Boolean(req.body.setUpstream),
        Boolean(req.body.force),
      ),
    }));
  });

  app.post("/api/remote", (req, res) => {
    wrap(res, async () => {
      const repo = repoFrom(req);
      const action = String(req.body.action ?? "add");
      if (action === "remove") {
        await ops.removeRemote(repo, String(req.body.name));
      } else {
        await ops.addRemote(repo, String(req.body.name), String(req.body.url));
      }
      return ops.listRemotes(repo);
    });
  });

  app.post("/api/init", (req, res) => {
    wrap(res, async () => {
      const dest = await ops.initRepo(String(req.body.dest));
      return ops.getRepoSummary(dest);
    });
  });

  app.post("/api/clone", (req, res) => {
    wrap(res, async () => {
      const dest = await ops.cloneRepo(String(req.body.url), String(req.body.dest));
      return ops.getRepoSummary(dest);
    });
  });

  const clientDir = path.resolve(__dirname, "../client");
  if (process.env.NODE_ENV === "production" && fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDir, "index.html"));
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendError(res, error);
  });

  return app;
}
