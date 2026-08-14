import type { GraphCommit, GraphCommitRole } from "../shared/types";

export const STRING_NODE_WIDTH = 260;
export const STRING_NODE_GAP_X = 36;
export const STRING_NODE_GAP_Y = 28;
export const STRING_NODE_PAD = 24;
export const STRING_NODE_MIN_HEIGHT = 88;
export const GHOST_NODE_HEIGHT = 64;
export const STRING_NODE_MAX_BODY_LINES = 8;
export const CHARS_PER_LINE = 18;

export type SubtractionKind = "series" | "constant";
export type SeriesPolarity = "negative" | "positive";

export interface StringNode {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  comment: string;
  author: string;
  timestamp: number;
  refs: string[];
  lane: number;
  role: GraphCommitRole;
  seriesId: string;
  ghost: boolean;
  missingParents: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  top: number;
  bottom: number;
}

/** 系列减法：负向（子→父）与正向（父→子）是同一条系列，只画一次。 */
export interface SeriesLine {
  kind: "series";
  fromHash: string;
  toHash: string;
  polarity: SeriesPolarity;
  lane: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 恒定减法：贯穿泳道，横坐标不变。 */
export interface ConstantLine {
  kind: "constant";
  lane: number;
  x: number;
  y1: number;
  y2: number;
}

export interface StringGraphLayout {
  nodes: StringNode[];
  seriesLines: SeriesLine[];
  constantLines: ConstantLine[];
  width: number;
  height: number;
}

export function laneCenterX(lane: number): number {
  return STRING_NODE_PAD + lane * (STRING_NODE_WIDTH + STRING_NODE_GAP_X) + STRING_NODE_WIDTH / 2;
}

export function countWrappedLines(text: string, charsPerLine: number = CHARS_PER_LINE): number {
  const trimmed = text.replace(/\s+$/g, "");
  if (trimmed.length === 0) {
    return 0;
  }
  let lines = 0;
  for (const paragraph of trimmed.split("\n")) {
    const length = [...paragraph].length;
    lines += Math.max(1, Math.ceil(length / charsPerLine));
  }
  return lines;
}

export function fullComment(subject: string, body: string): string {
  const head = subject.trim();
  const rest = body.trim();
  if (head.length === 0) {
    return rest;
  }
  if (rest.length === 0) {
    return head;
  }
  return `${head}\n\n${rest}`;
}

export function stringNodeHeight(subject: string, body: string, ghost = false): number {
  if (ghost) {
    return GHOST_NODE_HEIGHT;
  }
  const subjectLines = Math.max(1, countWrappedLines(subject || "(无说明)"));
  const bodyLines = Math.min(countWrappedLines(body), STRING_NODE_MAX_BODY_LINES);
  const textHeight = subjectLines * 20 + (bodyLines > 0 ? 10 + bodyLines * 17 : 0);
  return Math.max(STRING_NODE_MIN_HEIGHT, 44 + textHeight);
}

export function seriesPath(line: SeriesLine): string {
  const midY = (line.y1 + line.y2) / 2;
  return `M ${line.x1} ${line.y1} C ${line.x1} ${midY}, ${line.x2} ${midY}, ${line.x2} ${line.y2}`;
}

/** 节点树入场错开延迟；超过 cap 后不再继续拉长，避免大仓库打开过慢。 */
export function staggerDelayMs(index: number, stepMs = 28, cap = 26): number {
  if (!Number.isFinite(index) || index <= 0) {
    return 0;
  }
  return Math.min(Math.floor(index), cap) * stepMs;
}

export function staggerDelay(index: number, stepMs = 28, cap = 26): string {
  return `${staggerDelayMs(index, stepMs, cap)}ms`;
}

export function mergeConstantSegments(lines: ConstantLine[]): ConstantLine[] {
  const byLane = new Map<number, ConstantLine[]>();
  for (const line of lines) {
    const group = byLane.get(line.lane) ?? [];
    group.push(line);
    byLane.set(line.lane, group);
  }
  const merged: ConstantLine[] = [];
  for (const [lane, group] of byLane) {
    const sorted = [...group].sort((a, b) => a.y1 - b.y1);
    let current = sorted[0];
    if (!current) {
      continue;
    }
    for (let index = 1; index < sorted.length; index += 1) {
      const next = sorted[index];
      if (!next) {
        continue;
      }
      if (next.y1 <= current.y2 + 1) {
        current = {
          kind: "constant",
          lane,
          x: current.x,
          y1: current.y1,
          y2: Math.max(current.y2, next.y2),
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
  }
  return merged;
}

function liveSeriesConstantLines(nodes: StringNode[]): ConstantLine[] {
  const byLane = new Map<number, StringNode[]>();
  for (const node of nodes) {
    const group = byLane.get(node.lane) ?? [];
    group.push(node);
    byLane.set(node.lane, group);
  }
  const lines: ConstantLine[] = [];
  for (const node of nodes) {
    if (node.ghost) {
      continue;
    }
    for (const [lane, members] of byLane) {
      if (lane === node.lane) {
        continue;
      }
      const hasAbove = members.some((member) => member.bottom <= node.top);
      const hasBelow = members.some((member) => member.top >= node.bottom);
      if (hasAbove && hasBelow) {
        lines.push({
          kind: "constant",
          lane,
          x: laneCenterX(lane),
          y1: node.top - STRING_NODE_GAP_Y / 2,
          y2: node.bottom + STRING_NODE_GAP_Y / 2,
        });
      }
    }
  }
  return lines;
}

export function layoutStringGraph(commits: GraphCommit[]): StringGraphLayout {
  const nodes: StringNode[] = [];
  let y = STRING_NODE_PAD;
  let maxLane = 0;

  for (const commit of commits) {
    const width = STRING_NODE_WIDTH;
    const height = stringNodeHeight(commit.subject, commit.body, commit.ghost);
    const x = STRING_NODE_PAD + commit.lane * (STRING_NODE_WIDTH + STRING_NODE_GAP_X);
    const comment = commit.ghost ? "父提交未载入" : fullComment(commit.subject, commit.body);
    maxLane = Math.max(maxLane, commit.lane, ...commit.throughLanes);
    nodes.push({
      hash: commit.hash,
      shortHash: commit.shortHash,
      subject: commit.ghost ? "父提交未载入" : commit.subject,
      body: commit.ghost ? "" : commit.body,
      comment,
      author: commit.author,
      timestamp: commit.timestamp,
      refs: commit.refs,
      lane: commit.lane,
      role: commit.role,
      seriesId: commit.seriesId,
      ghost: commit.ghost,
      missingParents: commit.missingParents,
      x,
      y,
      width,
      height,
      cx: x + width / 2,
      cy: y + height / 2,
      top: y,
      bottom: y + height,
    });
    y += height + STRING_NODE_GAP_Y;
  }

  const byHash = new Map(nodes.map((node) => [node.hash, node]));
  const seriesLines: SeriesLine[] = [];
  const constantRaw: ConstantLine[] = [...liveSeriesConstantLines(nodes)];

  for (const commit of commits) {
    const from = byHash.get(commit.hash);
    if (!from) {
      continue;
    }

    for (const lane of commit.throughLanes) {
      constantRaw.push({
        kind: "constant",
        lane,
        x: laneCenterX(lane),
        y1: from.top - STRING_NODE_GAP_Y / 2,
        y2: from.bottom + STRING_NODE_GAP_Y / 2,
      });
    }

    commit.parents.forEach((parentHash, parentIndex) => {
      const to = byHash.get(parentHash);
      if (!to) {
        return;
      }
      seriesLines.push({
        kind: "series",
        fromHash: from.hash,
        toHash: to.hash,
        polarity: "negative",
        lane: parentIndex === 0 ? from.lane : to.lane,
        x1: from.cx,
        y1: from.cy,
        x2: to.cx,
        y2: to.cy,
      });
    });
  }

  const width =
    STRING_NODE_PAD * 2 + Math.max(maxLane + 1, 1) * STRING_NODE_WIDTH + maxLane * STRING_NODE_GAP_X;
  const last = nodes[nodes.length - 1];
  const height = last ? last.bottom + STRING_NODE_PAD : STRING_NODE_MIN_HEIGHT;

  return {
    nodes,
    seriesLines,
    constantLines: mergeConstantSegments(constantRaw),
    width,
    height,
  };
}
