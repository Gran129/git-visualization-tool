export interface RepoSummary {
  path: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  remotes: RemoteInfo[];
}

export interface RemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface RefInfo {
  name: string;
  fullName: string;
  hash: string;
  type: "local" | "remote" | "tag";
  current: boolean;
  upstream?: string;
}

export type GraphCommitRole = "root" | "series" | "merge" | "octopus" | "cherryPick" | "revert" | "stash";

export interface GraphCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  email: string;
  timestamp: number;
  subject: string;
  body: string;
  refs: string[];
  lane: number;
  edges: GraphEdge[];
  throughLanes: number[];
  role: GraphCommitRole;
  seriesId: string;
  missingParents: string[];
  ghost: boolean;
}

export interface GraphEdge {
  fromLane: number;
  toLane: number;
  kind: "parent" | "merge";
}

export interface GraphPayload {
  commits: GraphCommit[];
  laneCount: number;
  head: string | null;
  total: number;
}

export interface FileChange {
  path: string;
  originalPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  untracked: boolean;
  conflicted: boolean;
  insertions?: number;
  deletions?: number;
}

export interface StatusPayload {
  branch: string | null;
  detached: boolean;
  files: FileChange[];
  conflicted: boolean;
}

export interface CommitFile {
  path: string;
  status: string;
  insertions: number;
  deletions: number;
}

export interface CommitDetail {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  authorDate: string;
  committer: string;
  committerEmail: string;
  committerDate: string;
  subject: string;
  body: string;
  files: CommitFile[];
}

export interface DiffPayload {
  path: string;
  patch: string;
  binary: boolean;
}

export interface BlameLine {
  hash: string;
  author: string;
  timestamp: number;
  lineNumber: number;
  content: string;
}

export interface TreeEntry {
  mode: string;
  type: "blob" | "tree" | "commit";
  hash: string;
  name: string;
  path: string;
}

export interface StashEntry {
  index: number;
  ref: string;
  hash: string;
  message: string;
}

export interface ReflogEntry {
  hash: string;
  selector: string;
  message: string;
}

export interface SearchHit {
  hash: string;
  subject: string;
  author: string;
  timestamp: number;
}

export interface GitRuntimeInfo {
  version: string;
  binary: string;
  source: "bundled" | "system";
  gitDir: string | null;
}

export interface GitInstallResult {
  action: "installed" | "already-installed" | "skipped-system-git" | "skipped-no-bundle" | "skipped-disabled";
  runtime: GitRuntimeInfo;
  userGitDir: string;
  shimPath: string;
  gitOnPath: boolean;
  installedByApp: boolean;
  message: string;
}

export interface CommandResult {
  ok: true;
  stdout: string;
  command: string[];
}

export interface ApiErrorBody {
  ok: false;
  error: string;
  stderr?: string;
  command?: string[];
  code?: number;
}
