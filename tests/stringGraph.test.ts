import { describe, expect, it } from "vitest";
import type { GraphCommit } from "../shared/types";
import {
  countWrappedLines,
  fullComment,
  layoutStringGraph,
  mergeConstantSegments,
  seriesPath,
  staggerDelay,
  staggerDelayMs,
  stringNodeHeight,
} from "../client/stringGraph";

function commit(partial: Partial<GraphCommit> & Pick<GraphCommit, "hash" | "parents" | "subject">): GraphCommit {
  return {
    shortHash: partial.hash.slice(0, 7),
    author: "Viz",
    email: "viz@example.com",
    timestamp: 1_700_000_000,
    body: "",
    refs: [],
    lane: 0,
    edges: [],
    throughLanes: [],
    role: "series",
    seriesId: partial.hash,
    missingParents: [],
    ghost: false,
    ...partial,
  };
}

describe("string graph comments", () => {
  it("joins subject and body into one visible comment", () => {
    expect(fullComment("fix login", "handle empty password")).toBe("fix login\n\nhandle empty password");
    expect(fullComment("only subject", "")).toBe("only subject");
  });

  it("gives comment nodes enough height for wrapped body text", () => {
    const short = stringNodeHeight("init", "");
    const long = stringNodeHeight(
      "explain the feature",
      "line one\nline two\nline three\nline four that is quite a bit longer than a single row",
    );
    expect(long).toBeGreaterThan(short);
    expect(countWrappedLines("abcdefghijklmnopqr")).toBeGreaterThan(0);
  });

  it("draws parent and child as one series line, not two opposite kinds", () => {
    const layout = layoutStringGraph([
      commit({ hash: "child", parents: ["parent"], subject: "child comment", lane: 0 }),
      commit({ hash: "parent", parents: [], subject: "parent comment", body: "details", lane: 0, role: "root" }),
    ]);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.seriesLines).toHaveLength(1);
    expect(layout.constantLines).toHaveLength(0);
    const line = layout.seriesLines[0];
    if (!line) {
      throw new Error("expected a series line");
    }
    expect(line.kind).toBe("series");
    expect(line.fromHash).toBe("child");
    expect(line.toHash).toBe("parent");
    expect(line.polarity).toBe("negative");
    expect(seriesPath(line)).toMatch(/^M /);
    expect(layout.nodes[1]?.y).toBeGreaterThan(layout.nodes[0]?.y ?? 0);
  });

  it("keeps merge parents in the series class and through-lanes as constant lines", () => {
    const layout = layoutStringGraph([
      commit({
        hash: "m",
        parents: ["a", "b"],
        subject: "merge",
        lane: 0,
        throughLanes: [1],
        role: "merge",
      }),
      commit({ hash: "a", parents: ["c"], subject: "on main", lane: 0 }),
      commit({ hash: "b", parents: ["c"], subject: "on feature", lane: 1, seriesId: "b" }),
      commit({ hash: "c", parents: [], subject: "root", lane: 0, throughLanes: [1], role: "root" }),
    ]);
    const mergeSeries = layout.seriesLines.filter((line) => line.fromHash === "m");
    expect(mergeSeries).toHaveLength(2);
    expect(mergeSeries.every((line) => line.kind === "series")).toBe(true);
    expect(mergeSeries.map((line) => line.toHash).sort()).toEqual(["a", "b"]);
    expect(layout.constantLines.length).toBeGreaterThan(0);
    expect(layout.constantLines.every((line) => line.kind === "constant" && line.y2 > line.y1)).toBe(true);
    const feature = layout.nodes.find((node) => node.hash === "b");
    const main = layout.nodes.find((node) => node.hash === "a");
    expect(feature?.x).toBeGreaterThan(main?.x ?? 0);
  });

  it("draws a ghost parent when the real parent is missing", () => {
    const layout = layoutStringGraph([
      commit({
        hash: "c",
        parents: ["missing"],
        subject: "newest",
        missingParents: ["missing"],
      }),
      commit({
        hash: "missing",
        parents: [],
        subject: "",
        ghost: true,
        role: "series",
      }),
    ]);
    const ghost = layout.nodes.find((node) => node.hash === "missing");
    expect(ghost?.ghost).toBe(true);
    expect(ghost?.subject).toBe("父提交未载入");
    expect(layout.seriesLines.some((line) => line.fromHash === "c" && line.toHash === "missing")).toBe(true);
  });

  it("merges overlapping constant segments on the same lane", () => {
    const merged = mergeConstantSegments([
      { kind: "constant", lane: 1, x: 10, y1: 0, y2: 40 },
      { kind: "constant", lane: 1, x: 10, y1: 30, y2: 80 },
      { kind: "constant", lane: 2, x: 50, y1: 0, y2: 10 },
    ]);
    const lane1 = merged.filter((line) => line.lane === 1);
    expect(lane1).toHaveLength(1);
    expect(lane1[0]?.y1).toBe(0);
    expect(lane1[0]?.y2).toBe(80);
    expect(merged.some((line) => line.lane === 2)).toBe(true);
  });

  it("caps enter-animation stagger so large graphs do not wait too long", () => {
    expect(staggerDelayMs(0)).toBe(0);
    expect(staggerDelayMs(2, 28, 26)).toBe(56);
    expect(staggerDelayMs(100, 28, 26)).toBe(26 * 28);
    expect(staggerDelay(3, 10, 26)).toBe("30ms");
  });
});
