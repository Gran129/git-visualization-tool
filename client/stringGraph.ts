import type { GraphCommit } from "../shared/types";

export const STRING_NODE_WIDTH = 260;
export const STRING_NODE_GAP_X = 36;
export const STRING_NODE_GAP_Y = 28;
export const STRING_NODE_PAD = 24;
export const STRING_NODE_MIN_HEIGHT = 88;
export const STRING_NODE_MAX_BODY_LINES = 8;
export const CHARS_PER_LINE = 18;

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
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  top: number;
  bottom: number;
}

export interface StringEdge {
  fromHash: string;
  toHash: string;
  kind: "parent" | "merge";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface StringGraphLayout {
  nodes: StringNode[];
  edges: StringEdge[];
  width: number;
  height: number;
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

export function stringNodeHeight(subject: string, body: string): number {
  const subjectLines = Math.max(1, countWrappedLines(subject || "(无说明)"));
  const bodyLines = Math.min(countWrappedLines(body), STRING_NODE_MAX_BODY_LINES);
  const textHeight = subjectLines * 20 + (bodyLines > 0 ? 10 + bodyLines * 17 : 0);
  return Math.max(STRING_NODE_MIN_HEIGHT, 44 + textHeight);
}

export function layoutStringGraph(commits: GraphCommit[]): StringGraphLayout {
  const nodes: StringNode[] = [];
  let y = STRING_NODE_PAD;
  let maxLane = 0;

  for (const commit of commits) {
    const width = STRING_NODE_WIDTH;
    const height = stringNodeHeight(commit.subject, commit.body);
    const x = STRING_NODE_PAD + commit.lane * (STRING_NODE_WIDTH + STRING_NODE_GAP_X);
    const comment = fullComment(commit.subject, commit.body);
    maxLane = Math.max(maxLane, commit.lane);
    nodes.push({
      hash: commit.hash,
      shortHash: commit.shortHash,
      subject: commit.subject,
      body: commit.body,
      comment,
      author: commit.author,
      timestamp: commit.timestamp,
      refs: commit.refs,
      lane: commit.lane,
      x,
      y,
      width,
      height,
      cx: x + width / 2,
      top: y,
      bottom: y + height,
    });
    y += height + STRING_NODE_GAP_Y;
  }

  const byHash = new Map(nodes.map((node) => [node.hash, node]));
  const edges: StringEdge[] = [];

  for (const commit of commits) {
    const from = byHash.get(commit.hash);
    if (!from) {
      continue;
    }
    commit.parents.forEach((parentHash, parentIndex) => {
      const to = byHash.get(parentHash);
      if (!to) {
        return;
      }
      edges.push({
        fromHash: from.hash,
        toHash: to.hash,
        kind: parentIndex === 0 ? "parent" : "merge",
        x1: from.cx,
        y1: from.bottom,
        x2: to.cx,
        y2: to.top,
      });
    });
  }

  const width =
    STRING_NODE_PAD * 2 + Math.max(maxLane + 1, 1) * STRING_NODE_WIDTH + maxLane * STRING_NODE_GAP_X;
  const last = nodes[nodes.length - 1];
  const height = last ? last.bottom + STRING_NODE_PAD : STRING_NODE_MIN_HEIGHT;

  return { nodes, edges, width, height };
}

export function edgePath(edge: StringEdge): string {
  const midY = (edge.y1 + edge.y2) / 2;
  return `M ${edge.x1} ${edge.y1} C ${edge.x1} ${midY}, ${edge.x2} ${midY}, ${edge.x2} ${edge.y2}`;
}
