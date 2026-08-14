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

export const api = {
  health: () => request<{ service: string }>("/api/health"),
  defaultPath: () => request<{ path: string; home: string }>("/api/default-path"),
  open: (path: string) =>
    request<RepoSummary>("/api/repo/open", { method: "POST", body: JSON.stringify({ path }) }),
  repo: (path: string) => request<RepoSummary>(`/api/repo?${withPath(path)}`),
  graph: (path: string, max = 300) => request<GraphPayload>(`/api/graph?${withPath(path, { max })}`),
  status: (path: string) => request<StatusPayload>(`/api/status?${withPath(path)}`),
  refs: (path: string) => request<RefInfo[]>(`/api/refs?${withPath(path)}`),
  commit: (path: string, hash: string) =>
    request<CommitDetail>(`/api/commit/${encodeURIComponent(hash)}?${withPath(path)}`),
  diff: (
    path: string,
    opts: { file?: string; staged?: boolean; commit?: string; from?: string; to?: string },
  ) =>
    request<DiffPayload>(
      `/api/diff?${withPath(path, {
        file: opts.file,
        staged: opts.staged ? 1 : undefined,
        commit: opts.commit,
        from: opts.from,
        to: opts.to,
      })}`,
    ),
  blame: (path: string, file: string, rev?: string) =>
    request<BlameLine[]>(`/api/blame?${withPath(path, { file, rev })}`),
  tree: (path: string, rev: string, dir = "") =>
    request<TreeEntry[]>(`/api/tree?${withPath(path, { rev, dir })}`),
  file: (path: string, file: string, rev: string) =>
    request<{ content: string }>(`/api/file?${withPath(path, { file, rev })}`),
  stash: (path: string) => request<StashEntry[]>(`/api/stash?${withPath(path)}`),
  reflog: (path: string) => request<ReflogEntry[]>(`/api/reflog?${withPath(path)}`),
  search: (path: string, q: string) => request<SearchHit[]>(`/api/search?${withPath(path, { q })}`),
  fileLog: (path: string, file: string) =>
    request<SearchHit[]>(`/api/file-log?${withPath(path, { file })}`),
  compare: (path: string, from: string, to: string) =>
    request<CommitFile[]>(`/api/compare?${withPath(path, { from, to })}`),
  stage: (path: string, file: string) =>
    request<StatusPayload>("/api/stage", { method: "POST", body: JSON.stringify({ path, file }) }),
  unstage: (path: string, file: string) =>
    request<StatusPayload>("/api/unstage", { method: "POST", body: JSON.stringify({ path, file }) }),
  discard: (path: string, file: string, untracked: boolean) =>
    request<StatusPayload>("/api/discard", {
      method: "POST",
      body: JSON.stringify({ path, file, untracked }),
    }),
  commitChanges: (path: string, message: string, amend: boolean) =>
    request<{ stdout: string }>("/api/commit", {
      method: "POST",
      body: JSON.stringify({ path, message, amend }),
    }),
  checkout: (path: string, target: string, create = false) =>
    request<RepoSummary>("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ path, target, create }),
    }),
  branch: (path: string, body: Record<string, unknown>) =>
    request<RefInfo[]>("/api/branch", { method: "POST", body: JSON.stringify({ path, ...body }) }),
  merge: (path: string, target: string, noFf: boolean) =>
    request<{ stdout: string }>("/api/merge", {
      method: "POST",
      body: JSON.stringify({ path, target, noFf }),
    }),
  rebase: (path: string, target: string) =>
    request<{ stdout: string }>("/api/rebase", {
      method: "POST",
      body: JSON.stringify({ path, target }),
    }),
  cherryPick: (path: string, hash: string) =>
    request<{ stdout: string }>("/api/cherry-pick", {
      method: "POST",
      body: JSON.stringify({ path, hash }),
    }),
  revert: (path: string, hash: string) =>
    request<{ stdout: string }>("/api/revert", {
      method: "POST",
      body: JSON.stringify({ path, hash }),
    }),
  reset: (path: string, hash: string, mode: "soft" | "mixed" | "hard") =>
    request<RepoSummary>("/api/reset", {
      method: "POST",
      body: JSON.stringify({ path, hash, mode }),
    }),
  tag: (path: string, body: Record<string, unknown>) =>
    request<RefInfo[]>("/api/tag", { method: "POST", body: JSON.stringify({ path, ...body }) }),
  stashAction: (path: string, body: Record<string, unknown>) =>
    request<StashEntry[]>("/api/stash", { method: "POST", body: JSON.stringify({ path, ...body }) }),
  fetchRemote: (path: string, remote?: string) =>
    request<{ stdout: string }>("/api/fetch", {
      method: "POST",
      body: JSON.stringify({ path, remote }),
    }),
  pull: (path: string, rebase: boolean) =>
    request<{ stdout: string }>("/api/pull", {
      method: "POST",
      body: JSON.stringify({ path, rebase }),
    }),
  push: (path: string, remote: string, branch: string, setUpstream: boolean, force: boolean) =>
    request<{ stdout: string }>("/api/push", {
      method: "POST",
      body: JSON.stringify({ path, remote, branch, setUpstream, force }),
    }),
  remote: (path: string, body: Record<string, unknown>) =>
    request("/api/remote", { method: "POST", body: JSON.stringify({ path, ...body }) }),
  init: (dest: string) =>
    request<RepoSummary>("/api/init", { method: "POST", body: JSON.stringify({ dest }) }),
  clone: (url: string, dest: string) =>
    request<RepoSummary>("/api/clone", { method: "POST", body: JSON.stringify({ url, dest }) }),
};

export type { CommandResult };
