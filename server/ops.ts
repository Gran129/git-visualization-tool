import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GitError, gitOk, isGitRepo, resolveRepo, runGit } from "./git.js";
import { assignSeriesIds, classifyCommitRole, layoutCommitGraph } from "./graph.js";
import type {
  BlameLine,
  CommitDetail,
  CommitFile,
  DiffPayload,
  FileChange,
  GraphCommit,
  GraphPayload,
  RefInfo,
  ReflogEntry,
  RemoteInfo,
  RepoSummary,
  SearchHit,
  StashEntry,
  StatusPayload,
  TreeEntry,
} from "../shared/types.js";

const RECORD_SEP = "\x1e";
const FIELD_SEP = "\x1f";

export function requireRepo(repoPath: string): string {
  return resolveRepo(repoPath);
}

export async function getRepoSummary(repo: string): Promise<RepoSummary> {
  const headResult = await runGit(repo, ["rev-parse", "HEAD"], { allowFailure: true });
  const head = headResult.code === 0 ? headResult.stdout.trim() : null;

  const branchResult = await runGit(repo, ["symbolic-ref", "--short", "HEAD"], {
    allowFailure: true,
  });
  const detached = branchResult.code !== 0;
  const branch = detached ? null : branchResult.stdout.trim();

  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  if (branch) {
    const upstreamResult = await runGit(
      repo,
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      { allowFailure: true },
    );
    if (upstreamResult.code === 0) {
      upstream = upstreamResult.stdout.trim();
      const count = await runGit(repo, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`], {
        allowFailure: true,
      });
      if (count.code === 0) {
        const parts = count.stdout.trim().split(/\s+/);
        behind = Number(parts[0] ?? 0);
        ahead = Number(parts[1] ?? 0);
      }
    }
  }

  return {
    path: repo,
    head,
    branch,
    detached,
    upstream,
    ahead,
    behind,
    remotes: await listRemotes(repo),
  };
}

export async function listRemotes(repo: string): Promise<RemoteInfo[]> {
  const stdout = await gitOk(repo, ["remote", "-v"]);
  const map = new Map<string, RemoteInfo>();
  for (const line of stdout.split("\n")) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) {
      continue;
    }
    const name = match[1];
    const url = match[2];
    const kind = match[3];
    if (!name || !url || !kind) {
      continue;
    }
    const existing = map.get(name) ?? { name, fetchUrl: "", pushUrl: "" };
    if (kind === "fetch") {
      existing.fetchUrl = url;
    } else {
      existing.pushUrl = url;
    }
    map.set(name, existing);
  }
  return [...map.values()];
}

export async function listRefs(repo: string): Promise<RefInfo[]> {
  const current = await runGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true });
  const currentName = current.code === 0 ? current.stdout.trim() : "";
  const stdout = await gitOk(repo, [
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname)%1f%(objectname)%1f%(objecttype)%1f%(upstream:short)%1f%(subject)",
    "refs/heads",
    "refs/remotes",
    "refs/tags",
  ]);
  const refs: RefInfo[] = [];
  for (const line of stdout.split("\n")) {
    if (!line) {
      continue;
    }
    const [fullName, hash, , upstream] = line.split(FIELD_SEP);
    if (!fullName || !hash) {
      continue;
    }
    let type: RefInfo["type"];
    let name: string;
    if (fullName.startsWith("refs/heads/")) {
      type = "local";
      name = fullName.slice("refs/heads/".length);
    } else if (fullName.startsWith("refs/remotes/")) {
      type = "remote";
      name = fullName.slice("refs/remotes/".length);
    } else if (fullName.startsWith("refs/tags/")) {
      type = "tag";
      name = fullName.slice("refs/tags/".length);
    } else {
      continue;
    }
    refs.push({
      name,
      fullName,
      hash,
      type,
      current: type === "local" && name === currentName,
      upstream: upstream || undefined,
    });
  }
  return refs;
}

interface RawCommit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  timestamp: number;
  subject: string;
  body: string;
  refs: string[];
}

function parseDecorations(raw: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(", ")
    .map((item) =>
      item
        .replace(/^HEAD -> /, "")
        .replace(/^tag: /, "")
        .replace(/^refs\/heads\//, "")
        .replace(/^refs\/remotes\//, "")
        .replace(/^refs\/tags\//, "")
        .trim(),
    )
    .filter((item) => item.length > 0 && item !== "HEAD");
}

export async function getGraph(
  repo: string,
  options: { max?: number; skip?: number; all?: boolean; ref?: string } = {},
): Promise<GraphPayload> {
  const max = Math.min(Math.max(options.max ?? 300, 1), 2000);
  const skip = Math.max(options.skip ?? 0, 0);
  const args = [
    "log",
    options.all === false && options.ref ? options.ref : "--all",
    "--date-order",
    `--max-count=${max}`,
    `--skip=${skip}`,
    `--pretty=format:%H${FIELD_SEP}%P${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%at${FIELD_SEP}%s${FIELD_SEP}%b${FIELD_SEP}%D${RECORD_SEP}`,
  ];
  const logResult = await runGit(repo, args, { allowFailure: true });
  const stdout = logResult.stdout;

  const rawCommits: RawCommit[] = [];
  for (const chunk of stdout.split(RECORD_SEP)) {
    const line = chunk.replace(/^\n/, "");
    if (!line.trim()) {
      continue;
    }
    const parts = line.split(FIELD_SEP);
    const hash = parts[0];
    if (!hash) {
      continue;
    }
    const parents = (parts[1] ?? "").split(" ").filter(Boolean);
    rawCommits.push({
      hash,
      parents,
      author: parts[2] ?? "",
      email: parts[3] ?? "",
      timestamp: Number(parts[4] ?? 0),
      subject: parts[5] ?? "",
      body: (parts[6] ?? "").trim(),
      refs: parseDecorations(parts[7] ?? ""),
    });
  }

  const layout = layoutCommitGraph(rawCommits);
  const seriesIds = assignSeriesIds(layout.commits);
  const rawByHash = new Map(rawCommits.map((item) => [item.hash, item]));
  const headResult = await runGit(repo, ["rev-parse", "HEAD"], { allowFailure: true });
  const stashResult = await runGit(repo, ["stash", "list", "--format=%H"], { allowFailure: true });
  const stashHashes = new Set(
    stashResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );

  const commits: GraphCommit[] = layout.commits.map((laid) => {
    const raw = rawByHash.get(laid.hash);
    const ghost = laid.ghost;
    const parents = raw?.parents ?? laid.parents;
    const subject = raw?.subject ?? "";
    const body = raw?.body ?? "";
    const refs = raw?.refs ?? [];
    return {
      hash: laid.hash,
      shortHash: laid.hash.slice(0, 7),
      parents,
      author: raw?.author ?? "",
      email: raw?.email ?? "",
      timestamp: raw?.timestamp ?? 0,
      subject,
      body,
      refs,
      lane: laid.lane,
      edges: laid.edges,
      throughLanes: laid.throughLanes,
      role: classifyCommitRole({
        hash: laid.hash,
        parents,
        subject,
        body,
        refs,
        ghost,
        stashHashes,
      }),
      seriesId: seriesIds.get(laid.hash) ?? laid.hash,
      missingParents: parents.filter((parent) => layout.ghostHashes.has(parent)),
      ghost,
    };
  });

  const countResult = await runGit(repo, ["rev-list", "--all", "--count"], { allowFailure: true });
  return {
    commits,
    laneCount: layout.laneCount,
    head: headResult.code === 0 ? headResult.stdout.trim() : null,
    total: Number(countResult.stdout.trim() || commits.length),
  };
}

function parseStatusXy(xy: string): { indexStatus: string; worktreeStatus: string } {
  const indexStatus = xy[0] ?? " ";
  const worktreeStatus = xy[1] ?? " ";
  return { indexStatus, worktreeStatus };
}

export async function getStatus(repo: string): Promise<StatusPayload> {
  const result = await runGit(repo, ["status", "--porcelain=v1", "-uall", "--branch"], {
    allowFailure: true,
  });
  const lines = result.stdout.split("\n").filter((line) => line.length > 0);
  let branch: string | null = null;
  let detached = false;
  const files: FileChange[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const header = line.slice(3);
      if (header.includes("HEAD (no branch)") || header.startsWith("(no branch)")) {
        detached = true;
        branch = null;
      } else {
        const name = header.split("...")[0]?.trim() ?? header;
        branch = name === "No commits yet on main" || name.startsWith("No commits yet") ? name : name;
        if (header.startsWith("HEAD (no branch)")) {
          detached = true;
          branch = null;
        }
      }
      continue;
    }
    if (line.startsWith("?? ")) {
      files.push({
        path: line.slice(3),
        indexStatus: "?",
        worktreeStatus: "?",
        staged: false,
        untracked: true,
        conflicted: false,
      });
      continue;
    }
    if (line.startsWith("!! ")) {
      continue;
    }
    const xy = line.slice(0, 2);
    const rest = line.slice(3);
    const { indexStatus, worktreeStatus } = parseStatusXy(xy);
    const conflicted = "DUAA".includes(indexStatus) && "DUAA".includes(worktreeStatus)
      ? indexStatus === "U" || worktreeStatus === "U" || (indexStatus === "A" && worktreeStatus === "A") || (indexStatus === "D" && worktreeStatus === "D")
      : indexStatus === "U" || worktreeStatus === "U";
    let filePath = rest;
    let originalPath: string | undefined;
    if (rest.includes(" -> ")) {
      const [from, to] = rest.split(" -> ");
      originalPath = from;
      filePath = to ?? rest;
    }
    files.push({
      path: filePath,
      originalPath,
      indexStatus,
      worktreeStatus,
      staged: indexStatus !== " " && indexStatus !== "?",
      untracked: false,
      conflicted,
    });
  }

  return {
    branch,
    detached,
    files,
    conflicted: files.some((file) => file.conflicted),
  };
}

export async function getCommitDetail(repo: string, hash: string): Promise<CommitDetail> {
  const format = [
    "%H",
    "%P",
    "%an",
    "%ae",
    "%aD",
    "%cn",
    "%ce",
    "%cD",
    "%s",
    "%b",
  ].join(FIELD_SEP);
  const stdout = await gitOk(repo, ["show", "-s", `--pretty=format:${format}`, hash]);
  const parts = stdout.split(FIELD_SEP);
  const numstat = await gitOk(repo, ["show", "--format=", "--numstat", hash]);
  const files: CommitFile[] = [];
  for (const line of numstat.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match) {
      continue;
    }
    const insertions = match[1] === "-" ? 0 : Number(match[1]);
    const deletions = match[2] === "-" ? 0 : Number(match[2]);
    const filePath = match[3] ?? "";
    files.push({
      path: filePath,
      status: insertions === 0 && deletions === 0 ? "M" : "M",
      insertions,
      deletions,
    });
  }
  const nameStatus = await gitOk(repo, ["show", "--format=", "--name-status", hash]);
  const statusByPath = new Map<string, string>();
  for (const line of nameStatus.split("\n")) {
    const match = line.match(/^([A-Z])\d*\t(.+)$/);
    if (match && match[1] && match[2]) {
      statusByPath.set(match[2], match[1]);
    }
  }
  for (const file of files) {
    file.status = statusByPath.get(file.path) ?? file.status;
  }

  return {
    hash: parts[0] ?? hash,
    parents: (parts[1] ?? "").split(" ").filter(Boolean),
    author: parts[2] ?? "",
    email: parts[3] ?? "",
    authorDate: parts[4] ?? "",
    committer: parts[5] ?? "",
    committerEmail: parts[6] ?? "",
    committerDate: parts[7] ?? "",
    subject: parts[8] ?? "",
    body: (parts[9] ?? "").trim(),
    files,
  };
}

export async function getDiff(
  repo: string,
  options: {
    file?: string;
    staged?: boolean;
    commit?: string;
    from?: string;
    to?: string;
  },
): Promise<DiffPayload> {
  const args: string[] = ["diff", "--no-color", "--find-renames"];
  if (options.commit) {
    args.push(`${options.commit}^!`);
  } else if (options.from && options.to) {
    args.push(options.from, options.to);
  } else if (options.staged) {
    args.push("--cached");
  }
  if (options.file) {
    args.push("--", options.file);
  }
  const result = await runGit(repo, args, { allowFailure: true });
  const patch = result.stdout;
  const binary = patch.includes("Binary files") || patch.includes("GIT binary patch");
  return {
    path: options.file ?? "",
    patch: binary ? "二进制文件，无法显示文本差异" : patch,
    binary,
  };
}

export async function getBlame(repo: string, file: string, rev?: string): Promise<BlameLine[]> {
  const args = ["blame", "--line-porcelain", ...(rev ? [rev] : []), "--", file];
  const stdout = await gitOk(repo, args);
  const lines: BlameLine[] = [];
  const raw = stdout.split("\n");
  let hash = "";
  let author = "";
  let timestamp = 0;
  let lineNumber = 0;
  for (const line of raw) {
    const header = line.match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (header && header[1] && header[2]) {
      hash = header[1];
      lineNumber = Number(header[2]);
      continue;
    }
    if (line.startsWith("author ")) {
      author = line.slice("author ".length);
      continue;
    }
    if (line.startsWith("author-time ")) {
      timestamp = Number(line.slice("author-time ".length));
      continue;
    }
    if (line.startsWith("\t")) {
      lines.push({
        hash,
        author,
        timestamp,
        lineNumber,
        content: line.slice(1),
      });
    }
  }
  return lines;
}

export async function getTree(repo: string, rev: string, dir = ""): Promise<TreeEntry[]> {
  const spec = dir ? `${rev}:${dir}` : `${rev}:`;
  const stdout = await gitOk(repo, ["ls-tree", "-z", spec]);
  const entries: TreeEntry[] = [];
  for (const chunk of stdout.split("\0")) {
    if (!chunk) {
      continue;
    }
    const match = chunk.match(/^(\d+) (blob|tree|commit) ([0-9a-f]+)\t(.+)$/);
    if (!match) {
      continue;
    }
    const name = match[4] ?? "";
    entries.push({
      mode: match[1] ?? "",
      type: (match[2] as TreeEntry["type"]) ?? "blob",
      hash: match[3] ?? "",
      name,
      path: dir ? `${dir}/${name}` : name,
    });
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "tree" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export async function getFileContents(
  repo: string,
  rev: string,
  filePath: string,
): Promise<string> {
  return gitOk(repo, ["show", `${rev}:${filePath}`]);
}

export async function listStash(repo: string): Promise<StashEntry[]> {
  const result = await runGit(
    repo,
    ["stash", "list", `--pretty=format:%gd${FIELD_SEP}%H${FIELD_SEP}%s`],
    { allowFailure: true },
  );
  if (!result.stdout.trim()) {
    return [];
  }
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      const [ref, hash, message] = line.split(FIELD_SEP);
      return {
        index,
        ref: ref ?? `stash@{${index}}`,
        hash: hash ?? "",
        message: message ?? "",
      };
    });
}

export async function listReflog(repo: string, max = 80): Promise<ReflogEntry[]> {
  const result = await runGit(
    repo,
    ["reflog", `--max-count=${max}`, `--pretty=format:%H${FIELD_SEP}%gd${FIELD_SEP}%gs`],
    { allowFailure: true },
  );
  if (!result.stdout.trim()) {
    return [];
  }
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, selector, message] = line.split(FIELD_SEP);
      return {
        hash: hash ?? "",
        selector: selector ?? "",
        message: message ?? "",
      };
    });
}

export async function searchCommits(repo: string, query: string): Promise<SearchHit[]> {
  const result = await runGit(
    repo,
    [
      "log",
      "--all",
      "--max-count=100",
      `--pretty=format:%H${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%at`,
      "--regexp-ignore-case",
      `--grep=${query}`,
    ],
    { allowFailure: true },
  );
  const authorHits = await runGit(
    repo,
    [
      "log",
      "--all",
      "--max-count=100",
      `--pretty=format:%H${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%at`,
      "--regexp-ignore-case",
      `--author=${query}`,
    ],
    { allowFailure: true },
  );
  const map = new Map<string, SearchHit>();
  const consume = (stdout: string) => {
    for (const line of stdout.split("\n")) {
      if (!line) {
        continue;
      }
      const [hash, subject, author, timestamp] = line.split(FIELD_SEP);
      if (!hash || map.has(hash)) {
        continue;
      }
      map.set(hash, {
        hash,
        subject: subject ?? "",
        author: author ?? "",
        timestamp: Number(timestamp ?? 0),
      });
    }
  };
  consume(result.stdout);
  consume(authorHits.stdout);
  if (/^[0-9a-f]{4,40}$/i.test(query)) {
    const hashHit = await runGit(repo, ["log", "-1", `--pretty=format:%H${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%at`, query], {
      allowFailure: true,
    });
    consume(hashHit.stdout);
  }
  return [...map.values()];
}

export async function fileLog(repo: string, file: string): Promise<SearchHit[]> {
  const stdout = await gitOk(repo, [
    "log",
    "--all",
    "--max-count=100",
    `--pretty=format:%H${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%at`,
    "--",
    file,
  ]);
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, author, timestamp] = line.split(FIELD_SEP);
      return {
        hash: hash ?? "",
        subject: subject ?? "",
        author: author ?? "",
        timestamp: Number(timestamp ?? 0),
      };
    });
}

export async function compareRefs(repo: string, from: string, to: string): Promise<CommitFile[]> {
  const stdout = await gitOk(repo, ["diff", "--numstat", from, to]);
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      return {
        path: match?.[3] ?? line,
        status: "M",
        insertions: match?.[1] === "-" ? 0 : Number(match?.[1] ?? 0),
        deletions: match?.[2] === "-" ? 0 : Number(match?.[2] ?? 0),
      };
    });
}

function pathArgs(filePath: string): string[] {
  return ["--", filePath];
}

export async function stageFile(repo: string, filePath: string): Promise<void> {
  await gitOk(repo, ["add", "-A", ...pathArgs(filePath)]);
}

export async function unstageFile(repo: string, filePath: string): Promise<void> {
  await runGit(repo, ["restore", "--staged", ...pathArgs(filePath)], { allowFailure: true });
  await runGit(repo, ["reset", "HEAD", ...pathArgs(filePath)], { allowFailure: true });
}

function resolveInsideRepo(repo: string, filePath: string): string {
  const root = resolveRepo(repo);
  const resolved = path.resolve(root, filePath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("非法文件路径");
  }
  return resolved;
}

export async function discardFile(repo: string, filePath: string, untracked: boolean): Promise<void> {
  if (untracked) {
    const resolved = resolveInsideRepo(repo, filePath);
    const stat = fs.lstatSync(resolved);
    if (stat.isDirectory()) {
      fs.rmSync(resolved, { recursive: true, force: true });
    } else {
      fs.rmSync(resolved, { force: true });
    }
    return;
  }
  await gitOk(repo, ["restore", "--worktree", "--source=HEAD", ...pathArgs(filePath)]);
}

export async function commitChanges(
  repo: string,
  message: string,
  amend: boolean,
): Promise<string> {
  if (!message.trim() && !amend) {
    throw new Error("提交说明不能为空");
  }
  const args = ["commit", "--no-verify"];
  if (amend) {
    args.push("--amend", "--no-edit");
    if (message.trim()) {
      args.splice(args.length - 1, 1, "-m", message);
    }
  } else {
    args.push("-m", message);
  }
  const stdout = await gitOk(repo, args);
  return stdout.trim();
}

export async function checkoutRef(repo: string, target: string, create: boolean): Promise<void> {
  const args = create ? ["checkout", "-b", target] : ["checkout", target];
  await gitOk(repo, args);
}

export async function createBranch(repo: string, name: string, startPoint?: string): Promise<void> {
  const args = ["branch", name];
  if (startPoint) {
    args.push(startPoint);
  }
  await gitOk(repo, args);
}

export async function deleteBranch(repo: string, name: string, force: boolean): Promise<void> {
  await gitOk(repo, ["branch", force ? "-D" : "-d", name]);
}

export async function renameBranch(repo: string, from: string, to: string): Promise<void> {
  await gitOk(repo, ["branch", "-m", from, to]);
}

function throwIfFailed(result: Awaited<ReturnType<typeof runGit>>, args: string[]): void {
  if (result.code !== 0) {
    throw new GitError(
      result.stderr.trim() || result.stdout.trim() || "git 命令失败",
      args,
      result.stderr,
      result.code,
      result.stdout,
    );
  }
}

export async function mergeRef(repo: string, target: string, noFf: boolean): Promise<string> {
  const args = ["merge", "--no-edit"];
  if (noFf) {
    args.push("--no-ff");
  }
  args.push(target);
  const result = await runGit(repo, args, { allowFailure: true });
  throwIfFailed(result, args);
  return result.stdout;
}

export async function rebaseOnto(repo: string, target: string): Promise<string> {
  const args = ["rebase", target];
  const result = await runGit(repo, args, { allowFailure: true });
  throwIfFailed(result, args);
  return result.stdout;
}

export async function cherryPick(repo: string, hash: string): Promise<string> {
  const args = ["cherry-pick", hash];
  const result = await runGit(repo, args, { allowFailure: true });
  throwIfFailed(result, args);
  return result.stdout;
}

export async function revertCommit(repo: string, hash: string): Promise<string> {
  const args = ["revert", "--no-edit", hash];
  const result = await runGit(repo, args, { allowFailure: true });
  throwIfFailed(result, args);
  return result.stdout;
}

export async function resetTo(
  repo: string,
  hash: string,
  mode: "soft" | "mixed" | "hard",
): Promise<void> {
  await gitOk(repo, ["reset", `--${mode}`, hash]);
}

export async function createTag(repo: string, name: string, message?: string, hash?: string): Promise<void> {
  const args = message ? ["tag", "-a", name, "-m", message] : ["tag", name];
  if (hash) {
    args.push(hash);
  }
  await gitOk(repo, args);
}

export async function deleteTag(repo: string, name: string): Promise<void> {
  await gitOk(repo, ["tag", "-d", name]);
}

export async function stashSave(repo: string, message?: string, includeUntracked?: boolean): Promise<void> {
  const args = ["stash", "push"];
  if (includeUntracked) {
    args.push("-u");
  }
  if (message) {
    args.push("-m", message);
  }
  await gitOk(repo, args);
}

export async function stashApply(repo: string, ref: string, pop: boolean): Promise<void> {
  await gitOk(repo, ["stash", pop ? "pop" : "apply", ref]);
}

export async function stashDrop(repo: string, ref: string): Promise<void> {
  await gitOk(repo, ["stash", "drop", ref]);
}

export async function fetchRemote(repo: string, remote?: string): Promise<string> {
  const args = remote ? ["fetch", remote] : ["fetch", "--all", "--prune"];
  const result = await runGit(repo, args, { timeoutMs: 60_000 });
  return result.stdout + result.stderr;
}

export async function pullRemote(
  repo: string,
  rebase: boolean,
  remote?: string,
  branch?: string,
): Promise<string> {
  const args = ["pull"];
  if (rebase) {
    args.push("--rebase");
  }
  if (remote) {
    args.push(remote);
  }
  if (branch) {
    args.push(branch);
  }
  const result = await runGit(repo, args, { timeoutMs: 60_000, allowFailure: true });
  throwIfFailed(result, args);
  return result.stdout + result.stderr;
}

export async function pushRemote(
  repo: string,
  remote: string,
  branch: string,
  setUpstream: boolean,
  force: boolean,
): Promise<string> {
  const args = ["push"];
  if (setUpstream) {
    args.push("-u");
  }
  if (force) {
    args.push("--force-with-lease");
  }
  args.push(remote, branch);
  const result = await runGit(repo, args, { timeoutMs: 60_000, allowFailure: true });
  throwIfFailed(result, args);
  return result.stdout + result.stderr;
}

export async function addRemote(repo: string, name: string, url: string): Promise<void> {
  await gitOk(repo, ["remote", "add", name, url]);
}

export async function removeRemote(repo: string, name: string): Promise<void> {
  await gitOk(repo, ["remote", "remove", name]);
}

export async function initRepo(dest: string): Promise<string> {
  const resolved = path.resolve(dest);
  fs.mkdirSync(resolved, { recursive: true });
  await gitOk(resolved, ["init"]);
  return resolved;
}

export async function cloneRepo(url: string, dest: string): Promise<string> {
  const resolved = path.resolve(dest);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  await runGit(path.dirname(resolved), ["clone", url, resolved], { timeoutMs: 120_000 });
  return resolved;
}

export function defaultRepoPath(): string {
  const fromEnv = process.env.GIT_VIZ_REPO;
  if (fromEnv && isGitRepo(fromEnv)) {
    return resolveRepo(fromEnv);
  }
  const cwd = process.cwd();
  if (isGitRepo(cwd)) {
    return resolveRepo(cwd);
  }
  return cwd;
}

export function homedir(): string {
  return os.homedir();
}
