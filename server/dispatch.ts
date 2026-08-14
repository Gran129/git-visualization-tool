import { GitError } from "./git.js";
import * as ops from "./ops.js";

export type InvokePayload = Record<string, unknown>;

export interface InvokeOk {
  ok: true;
  data: unknown;
}

export interface InvokeErr {
  ok: false;
  error: string;
  stderr?: string;
  command?: string[];
  code?: number;
}

export type InvokeResult = InvokeOk | InvokeErr;

function str(payload: InvokePayload, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : String(value ?? "");
}

function bool(payload: InvokePayload, key: string): boolean {
  return Boolean(payload[key]);
}

function optionalStr(payload: InvokePayload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function repoOf(payload: InvokePayload): string {
  const value = payload.path;
  if (typeof value !== "string" || value.trim().length === 0) {
    return ops.defaultRepoPath();
  }
  return ops.requireRepo(value);
}

export async function dispatch(method: string, payload: InvokePayload = {}): Promise<unknown> {
  switch (method) {
    case "health":
      return { service: "git-visualization-tool" };
    case "defaultPath":
      return { path: ops.defaultRepoPath(), home: ops.homedir() };
    case "open":
      return ops.getRepoSummary(ops.requireRepo(str(payload, "path")));
    case "repo":
      return ops.getRepoSummary(repoOf(payload));
    case "graph":
      return ops.getGraph(repoOf(payload), {
        max: typeof payload.max === "number" ? payload.max : 300,
      });
    case "status":
      return ops.getStatus(repoOf(payload));
    case "refs":
      return ops.listRefs(repoOf(payload));
    case "commit":
      return ops.getCommitDetail(repoOf(payload), str(payload, "hash"));
    case "diff":
      return ops.getDiff(repoOf(payload), {
        file: optionalStr(payload, "file"),
        staged: bool(payload, "staged"),
        commit: optionalStr(payload, "commit"),
        from: optionalStr(payload, "from"),
        to: optionalStr(payload, "to"),
      });
    case "blame":
      return ops.getBlame(repoOf(payload), str(payload, "file"), optionalStr(payload, "rev"));
    case "tree":
      return ops.getTree(repoOf(payload), str(payload, "rev") || "HEAD", str(payload, "dir"));
    case "file":
      return {
        content: await ops.getFileContents(repoOf(payload), str(payload, "rev") || "HEAD", str(payload, "file")),
      };
    case "stash":
      return ops.listStash(repoOf(payload));
    case "reflog":
      return ops.listReflog(repoOf(payload));
    case "search":
      return ops.searchCommits(repoOf(payload), str(payload, "q"));
    case "fileLog":
      return ops.fileLog(repoOf(payload), str(payload, "file"));
    case "compare":
      return ops.compareRefs(repoOf(payload), str(payload, "from"), str(payload, "to"));
    case "stage":
      await ops.stageFile(repoOf(payload), str(payload, "file"));
      return ops.getStatus(repoOf(payload));
    case "unstage":
      await ops.unstageFile(repoOf(payload), str(payload, "file"));
      return ops.getStatus(repoOf(payload));
    case "discard":
      await ops.discardFile(repoOf(payload), str(payload, "file"), bool(payload, "untracked"));
      return ops.getStatus(repoOf(payload));
    case "commitChanges":
      return { stdout: await ops.commitChanges(repoOf(payload), str(payload, "message"), bool(payload, "amend")) };
    case "checkout":
      await ops.checkoutRef(repoOf(payload), str(payload, "target"), bool(payload, "create"));
      return ops.getRepoSummary(repoOf(payload));
    case "branch": {
      const repo = repoOf(payload);
      const action = str(payload, "action") || "create";
      if (action === "create") {
        await ops.createBranch(repo, str(payload, "name"), optionalStr(payload, "startPoint"));
      } else if (action === "delete") {
        await ops.deleteBranch(repo, str(payload, "name"), bool(payload, "force"));
      } else if (action === "rename") {
        await ops.renameBranch(repo, str(payload, "from"), str(payload, "to"));
      } else {
        throw new Error(`未知分支操作: ${action}`);
      }
      return ops.listRefs(repo);
    }
    case "merge":
      return { stdout: await ops.mergeRef(repoOf(payload), str(payload, "target"), bool(payload, "noFf")) };
    case "rebase":
      return { stdout: await ops.rebaseOnto(repoOf(payload), str(payload, "target")) };
    case "cherryPick":
      return { stdout: await ops.cherryPick(repoOf(payload), str(payload, "hash")) };
    case "revert":
      return { stdout: await ops.revertCommit(repoOf(payload), str(payload, "hash")) };
    case "reset": {
      const mode = str(payload, "mode");
      if (mode !== "soft" && mode !== "mixed" && mode !== "hard") {
        throw new Error("reset 模式必须是 soft / mixed / hard");
      }
      await ops.resetTo(repoOf(payload), str(payload, "hash"), mode);
      return ops.getRepoSummary(repoOf(payload));
    }
    case "tag": {
      const repo = repoOf(payload);
      if (str(payload, "action") === "delete") {
        await ops.deleteTag(repo, str(payload, "name"));
      } else {
        await ops.createTag(repo, str(payload, "name"), optionalStr(payload, "message"), optionalStr(payload, "hash"));
      }
      return ops.listRefs(repo);
    }
    case "stashAction": {
      const repo = repoOf(payload);
      const action = str(payload, "action") || "save";
      if (action === "save") {
        await ops.stashSave(repo, optionalStr(payload, "message"), bool(payload, "includeUntracked"));
      } else if (action === "apply") {
        await ops.stashApply(repo, str(payload, "ref"), false);
      } else if (action === "pop") {
        await ops.stashApply(repo, str(payload, "ref"), true);
      } else if (action === "drop") {
        await ops.stashDrop(repo, str(payload, "ref"));
      } else {
        throw new Error(`未知 stash 操作: ${action}`);
      }
      return ops.listStash(repo);
    }
    case "fetchRemote":
      return { stdout: await ops.fetchRemote(repoOf(payload), optionalStr(payload, "remote")) };
    case "pull":
      return {
        stdout: await ops.pullRemote(
          repoOf(payload),
          bool(payload, "rebase"),
          optionalStr(payload, "remote"),
          optionalStr(payload, "branch"),
        ),
      };
    case "push":
      return {
        stdout: await ops.pushRemote(
          repoOf(payload),
          str(payload, "remote") || "origin",
          str(payload, "branch"),
          bool(payload, "setUpstream"),
          bool(payload, "force"),
        ),
      };
    case "remote": {
      const repo = repoOf(payload);
      if (str(payload, "action") === "remove") {
        await ops.removeRemote(repo, str(payload, "name"));
      } else {
        await ops.addRemote(repo, str(payload, "name"), str(payload, "url"));
      }
      return ops.listRemotes(repo);
    }
    case "init":
      return ops.getRepoSummary(await ops.initRepo(str(payload, "dest")));
    case "clone":
      return ops.getRepoSummary(await ops.cloneRepo(str(payload, "url"), str(payload, "dest")));
    default:
      throw new Error(`未知方法: ${method}`);
  }
}

export async function invoke(method: string, payload: InvokePayload = {}): Promise<InvokeResult> {
  try {
    const data = await dispatch(method, payload);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof GitError) {
      return {
        ok: false,
        error: error.message,
        stderr: error.stderr,
        command: error.args,
        code: error.code,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}
