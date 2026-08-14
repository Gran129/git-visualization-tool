import type { GraphCommitRole } from "../shared/types.js";

export interface GraphCommitInput {
  hash: string;
  parents: string[];
  subject?: string;
  body?: string;
  refs?: string[];
}

export interface GraphEdge {
  fromLane: number;
  toLane: number;
  kind: "parent" | "merge";
}

export interface LaidOutCommit {
  hash: string;
  parents: string[];
  lane: number;
  edges: GraphEdge[];
  throughLanes: number[];
  ghost: boolean;
}

function firstFreeLane(lanes: Array<string | null>): number {
  const empty = lanes.findIndex((value) => value === null);
  if (empty >= 0) {
    return empty;
  }
  return lanes.length;
}

function compactLanes(lanes: Array<string | null>): Array<string | null> {
  const next = [...lanes];
  while (next.length > 0 && next[next.length - 1] === null) {
    next.pop();
  }
  return next;
}

export function collectMissingParents(commits: GraphCommitInput[]): string[] {
  const visible = new Set(commits.map((commit) => commit.hash));
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const commit of commits) {
    for (const parent of commit.parents) {
      if (!visible.has(parent) && !seen.has(parent)) {
        seen.add(parent);
        missing.push(parent);
      }
    }
  }
  return missing;
}

export function expandWithMissingParents(commits: GraphCommitInput[]): {
  commits: GraphCommitInput[];
  ghostHashes: Set<string>;
} {
  const missing = collectMissingParents(commits);
  const ghostHashes = new Set(missing);
  const ghosts: GraphCommitInput[] = missing.map((hash) => ({ hash, parents: [] }));
  return { commits: [...commits, ...ghosts], ghostHashes };
}

export function classifyCommitRole(input: {
  hash: string;
  parents: string[];
  subject?: string;
  body?: string;
  refs?: string[];
  ghost?: boolean;
  stashHashes?: Set<string>;
}): GraphCommitRole {
  if (input.ghost) {
    return "series";
  }
  const refs = input.refs ?? [];
  if (
    input.stashHashes?.has(input.hash) ||
    refs.some((ref) => ref === "stash" || ref.startsWith("stash@") || ref.includes("refs/stash"))
  ) {
    return "stash";
  }
  const text = `${input.subject ?? ""}\n${input.body ?? ""}`;
  if (/\(cherry picked from commit [0-9a-f]+\)/i.test(text)) {
    return "cherryPick";
  }
  if (/^Revert\b/i.test(input.subject ?? "") || /This reverts commit [0-9a-f]+/i.test(text)) {
    return "revert";
  }
  if (input.parents.length === 0) {
    return "root";
  }
  if (input.parents.length >= 3) {
    return "octopus";
  }
  if (input.parents.length === 2) {
    return "merge";
  }
  return "series";
}

/** 从每个 tip 沿第一父链向下涂色：先到的 tip 占用主干，后到的旁支在分叉处停下。 */
export function assignSeriesIds(commits: GraphCommitInput[]): Map<string, string> {
  const usedAsFirstParent = new Set<string>();
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  for (const commit of commits) {
    const first = commit.parents[0];
    if (first) {
      usedAsFirstParent.add(first);
    }
  }
  const tips = commits.filter((commit) => !usedAsFirstParent.has(commit.hash));
  const seriesId = new Map<string, string>();
  for (const tip of tips) {
    let current: string | undefined = tip.hash;
    while (current && byHash.has(current) && !seriesId.has(current)) {
      seriesId.set(current, tip.hash);
      current = byHash.get(current)?.parents[0];
    }
  }
  for (const commit of commits) {
    if (!seriesId.has(commit.hash)) {
      seriesId.set(commit.hash, commit.hash);
    }
  }
  return seriesId;
}

/**
 * gitk / Git Graph 风格的泳道布局：按时间倒序排列提交，
 * 第一父提交延续当前泳道（同一系列），额外父提交占用新泳道（另一系列接入）。
 * 窗口外的父提交会先展开成虚节点再参与占道。
 */
export function layoutCommitGraph(commits: GraphCommitInput[]): {
  commits: LaidOutCommit[];
  laneCount: number;
  ghostHashes: Set<string>;
} {
  const expanded = expandWithMissingParents(commits);
  const ghostHashes = expanded.ghostHashes;
  let lanes: Array<string | null> = [];
  const laidOut: LaidOutCommit[] = [];
  let laneCount = 0;

  for (const commit of expanded.commits) {
    let lane = lanes.indexOf(commit.hash);
    if (lane === -1) {
      lane = firstFreeLane(lanes);
      if (lane === lanes.length) {
        lanes.push(commit.hash);
      } else {
        lanes[lane] = commit.hash;
      }
    }

    const throughLanes: number[] = [];
    for (let index = 0; index < lanes.length; index += 1) {
      const occupant = lanes[index];
      if (occupant !== null && occupant !== commit.hash) {
        throughLanes.push(index);
      }
    }

    const nextLanes: Array<string | null> = [...lanes];
    const edges: GraphEdge[] = [];
    const firstParent = commit.parents[0];

    if (firstParent === undefined) {
      nextLanes[lane] = null;
    } else {
      nextLanes[lane] = firstParent;
      edges.push({ fromLane: lane, toLane: lane, kind: "parent" });
    }

    for (let parentIndex = 1; parentIndex < commit.parents.length; parentIndex += 1) {
      const parent = commit.parents[parentIndex];
      if (parent === undefined) {
        continue;
      }
      let parentLane = nextLanes.indexOf(parent);
      if (parentLane === -1) {
        parentLane = firstFreeLane(nextLanes);
        if (parentLane === nextLanes.length) {
          nextLanes.push(parent);
        } else {
          nextLanes[parentLane] = parent;
        }
      }
      edges.push({ fromLane: lane, toLane: parentLane, kind: "merge" });
    }

    lanes = compactLanes(nextLanes);
    laneCount = Math.max(laneCount, lanes.length, lane + 1);
    laidOut.push({
      hash: commit.hash,
      parents: commit.parents,
      lane,
      edges,
      throughLanes,
      ghost: ghostHashes.has(commit.hash),
    });
  }

  return { commits: laidOut, laneCount: Math.max(laneCount, 1), ghostHashes };
}
