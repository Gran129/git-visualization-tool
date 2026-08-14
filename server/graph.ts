export interface GraphCommitInput {
  hash: string;
  parents: string[];
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

/**
 * gitk / Git Graph 风格的泳道布局：按时间倒序排列提交，
 * 第一父提交延续当前泳道，额外父提交（合并）占用新泳道。
 */
export function layoutCommitGraph(commits: GraphCommitInput[]): {
  commits: LaidOutCommit[];
  laneCount: number;
} {
  let lanes: Array<string | null> = [];
  const laidOut: LaidOutCommit[] = [];
  let laneCount = 0;

  for (const commit of commits) {
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
    });
  }

  return { commits: laidOut, laneCount: Math.max(laneCount, 1) };
}
