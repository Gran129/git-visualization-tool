import type {
  ApiErrorBody,
  BlameLine,
  CommandResult,
  CommitDetail,
  CommitFile,
  DiffPayload,
  GraphPayload,
  RefInfo,
  ReflogEntry,
  RepoSummary,
  SearchHit,
  StashEntry,
  StatusPayload,
  TreeEntry,
} from "../shared/types";

interface Ok<T> {
  ok: true;
  data: T;
}

type ApiResponse<T> = Ok<T> | ApiErrorBody;

function isDesktop(): boolean {
  return typeof window !== "undefined" && window.gitViz !== undefined;
}

async function invokeDesktop<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const bridge = window.gitViz;
  if (!bridge) {
    throw new Error("桌面桥接不可用");
  }
  const body = await bridge.invoke(method, payload);
  if (!body.ok) {
    throw new Error(body.error ?? "操作失败");
  }
  return body.data as T;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) {
    throw new Error(body.error);
  }
  return body.data;
}

function withPath(path: string, extra?: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams({ path });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    }
  }
  return params.toString();
}

function call<T>(
  method: string,
  payload: Record<string, unknown>,
  http: () => Promise<T>,
): Promise<T> {
  if (isDesktop()) {
    return invokeDesktop<T>(method, payload);
  }
  return http();
}

export const api = {
  isDesktop,
  selectDirectory: async (): Promise<string | null> => {
    if (!isDesktop()) {
      return null;
    }
    return invokeDesktop<string | null>("selectDirectory");
  },
  onOpenPath: (handler: (dir: string) => void): (() => void) => {
    if (!window.gitViz?.onOpenPath) {
      return () => undefined;
    }
    return window.gitViz.onOpenPath(handler);
  },
  health: () =>
    call<{ service: string }>("health", {}, () => request("/api/health")),
  defaultPath: () =>
    call<{ path: string; home: string }>("defaultPath", {}, () => request("/api/default-path")),
  open: (path: string) =>
    call<RepoSummary>("open", { path }, () =>
      request("/api/repo/open", { method: "POST", body: JSON.stringify({ path }) }),
    ),
  repo: (path: string) =>
    call<RepoSummary>("repo", { path }, () => request(`/api/repo?${withPath(path)}`)),
  graph: (path: string, max = 300) =>
    call<GraphPayload>("graph", { path, max }, () => request(`/api/graph?${withPath(path, { max })}`)),
  status: (path: string) =>
    call<StatusPayload>("status", { path }, () => request(`/api/status?${withPath(path)}`)),
  refs: (path: string) =>
    call<RefInfo[]>("refs", { path }, () => request(`/api/refs?${withPath(path)}`)),
  commit: (path: string, hash: string) =>
    call<CommitDetail>("commit", { path, hash }, () =>
      request(`/api/commit/${encodeURIComponent(hash)}?${withPath(path)}`),
    ),
  diff: (
    path: string,
    opts: { file?: string; staged?: boolean; commit?: string; from?: string; to?: string },
  ) =>
    call<DiffPayload>("diff", { path, ...opts }, () =>
      request(
        `/api/diff?${withPath(path, {
          file: opts.file,
          staged: opts.staged ? 1 : undefined,
          commit: opts.commit,
          from: opts.from,
          to: opts.to,
        })}`,
      ),
    ),
  blame: (path: string, file: string, rev?: string) =>
    call<BlameLine[]>("blame", { path, file, rev }, () =>
      request(`/api/blame?${withPath(path, { file, rev })}`),
    ),
  tree: (path: string, rev: string, dir = "") =>
    call<TreeEntry[]>("tree", { path, rev, dir }, () =>
      request(`/api/tree?${withPath(path, { rev, dir })}`),
    ),
  file: (path: string, file: string, rev: string) =>
    call<{ content: string }>("file", { path, file, rev }, () =>
      request(`/api/file?${withPath(path, { file, rev })}`),
    ),
  stash: (path: string) =>
    call<StashEntry[]>("stash", { path }, () => request(`/api/stash?${withPath(path)}`)),
  reflog: (path: string) =>
    call<ReflogEntry[]>("reflog", { path }, () => request(`/api/reflog?${withPath(path)}`)),
  search: (path: string, q: string) =>
    call<SearchHit[]>("search", { path, q }, () => request(`/api/search?${withPath(path, { q })}`)),
  fileLog: (path: string, file: string) =>
    call<SearchHit[]>("fileLog", { path, file }, () =>
      request(`/api/file-log?${withPath(path, { file })}`),
    ),
  compare: (path: string, from: string, to: string) =>
    call<CommitFile[]>("compare", { path, from, to }, () =>
      request(`/api/compare?${withPath(path, { from, to })}`),
    ),
  stage: (path: string, file: string) =>
    call<StatusPayload>("stage", { path, file }, () =>
      request("/api/stage", { method: "POST", body: JSON.stringify({ path, file }) }),
    ),
  unstage: (path: string, file: string) =>
    call<StatusPayload>("unstage", { path, file }, () =>
      request("/api/unstage", { method: "POST", body: JSON.stringify({ path, file }) }),
    ),
  discard: (path: string, file: string, untracked: boolean) =>
    call<StatusPayload>("discard", { path, file, untracked }, () =>
      request("/api/discard", {
        method: "POST",
        body: JSON.stringify({ path, file, untracked }),
      }),
    ),
  commitChanges: (path: string, message: string, amend: boolean) =>
    call<{ stdout: string }>("commitChanges", { path, message, amend }, () =>
      request("/api/commit", {
        method: "POST",
        body: JSON.stringify({ path, message, amend }),
      }),
    ),
  checkout: (path: string, target: string, create = false) =>
    call<RepoSummary>("checkout", { path, target, create }, () =>
      request("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ path, target, create }),
      }),
    ),
  branch: (path: string, body: Record<string, unknown>) =>
    call<RefInfo[]>("branch", { path, ...body }, () =>
      request("/api/branch", { method: "POST", body: JSON.stringify({ path, ...body }) }),
    ),
  merge: (path: string, target: string, noFf: boolean) =>
    call<{ stdout: string }>("merge", { path, target, noFf }, () =>
      request("/api/merge", {
        method: "POST",
        body: JSON.stringify({ path, target, noFf }),
      }),
    ),
  rebase: (path: string, target: string) =>
    call<{ stdout: string }>("rebase", { path, target }, () =>
      request("/api/rebase", {
        method: "POST",
        body: JSON.stringify({ path, target }),
      }),
    ),
  cherryPick: (path: string, hash: string) =>
    call<{ stdout: string }>("cherryPick", { path, hash }, () =>
      request("/api/cherry-pick", {
        method: "POST",
        body: JSON.stringify({ path, hash }),
      }),
    ),
  revert: (path: string, hash: string) =>
    call<{ stdout: string }>("revert", { path, hash }, () =>
      request("/api/revert", {
        method: "POST",
        body: JSON.stringify({ path, hash }),
      }),
    ),
  reset: (path: string, hash: string, mode: "soft" | "mixed" | "hard") =>
    call<RepoSummary>("reset", { path, hash, mode }, () =>
      request("/api/reset", {
        method: "POST",
        body: JSON.stringify({ path, hash, mode }),
      }),
    ),
  tag: (path: string, body: Record<string, unknown>) =>
    call<RefInfo[]>("tag", { path, ...body }, () =>
      request("/api/tag", { method: "POST", body: JSON.stringify({ path, ...body }) }),
    ),
  stashAction: (path: string, body: Record<string, unknown>) =>
    call<StashEntry[]>("stashAction", { path, ...body }, () =>
      request("/api/stash", { method: "POST", body: JSON.stringify({ path, ...body }) }),
    ),
  fetchRemote: (path: string, remote?: string) =>
    call<{ stdout: string }>("fetchRemote", { path, remote }, () =>
      request("/api/fetch", {
        method: "POST",
        body: JSON.stringify({ path, remote }),
      }),
    ),
  pull: (path: string, rebase: boolean) =>
    call<{ stdout: string }>("pull", { path, rebase }, () =>
      request("/api/pull", {
        method: "POST",
        body: JSON.stringify({ path, rebase }),
      }),
    ),
  push: (path: string, remote: string, branch: string, setUpstream: boolean, force: boolean) =>
    call<{ stdout: string }>("push", { path, remote, branch, setUpstream, force }, () =>
      request("/api/push", {
        method: "POST",
        body: JSON.stringify({ path, remote, branch, setUpstream, force }),
      }),
    ),
  remote: (path: string, body: Record<string, unknown>) =>
    call("remote", { path, ...body }, () =>
      request("/api/remote", { method: "POST", body: JSON.stringify({ path, ...body }) }),
    ),
  init: (dest: string) =>
    call<RepoSummary>("init", { dest }, () =>
      request("/api/init", { method: "POST", body: JSON.stringify({ dest }) }),
    ),
  clone: (url: string, dest: string) =>
    call<RepoSummary>("clone", { url, dest }, () =>
      request("/api/clone", { method: "POST", body: JSON.stringify({ url, dest }) }),
    ),
};

export type { CommandResult };
