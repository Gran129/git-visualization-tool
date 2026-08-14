import { describe, expect, it } from "vitest";
import type { GraphCommit } from "../shared/types";
import {
  countWrappedLines,
  edgePath,
  fullComment,
  layoutStringGraph,
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

  it("places two comments as string nodes and connects them together", () => {
    const layout = layoutStringGraph([
      commit({ hash: "child", parents: ["parent"], subject: "child comment", lane: 0 }),
      commit({ hash: "parent", parents: [], subject: "parent comment", body: "details", lane: 0 }),
    ]);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.nodes[0]?.comment).toBe("child comment");
    expect(layout.nodes[1]?.comment).toContain("parent comment");
    expect(layout.nodes[1]?.comment).toContain("details");
    expect(layout.edges).toHaveLength(1);
    const edge = layout.edges[0];
    if (!edge) {
      throw new Error("expected an edge between string nodes");
    }
    expect(edge.fromHash).toBe("child");
    expect(edge.toHash).toBe("parent");
    expect(edge.kind).toBe("parent");
    expect(edge.y2).toBeGreaterThan(edge.y1);
    expect(edgePath(edge)).toMatch(/^M /);
    expect(layout.nodes[1]?.y).toBeGreaterThan(layout.nodes[0]?.y ?? 0);
  });

  it("connects a merge comment to both parent string nodes", () => {
    const layout = layoutStringGraph([
      commit({ hash: "m", parents: ["a", "b"], subject: "merge", lane: 0 }),
      commit({ hash: "a", parents: ["c"], subject: "on main", lane: 0 }),
      commit({ hash: "b", parents: ["c"], subject: "on feature", lane: 1 }),
      commit({ hash: "c", parents: [], subject: "root", lane: 0 }),
    ]);
    const mergeEdges = layout.edges.filter((edge) => edge.fromHash === "m");
    expect(mergeEdges).toHaveLength(2);
    expect(mergeEdges.map((edge) => edge.toHash).sort()).toEqual(["a", "b"]);
    expect(mergeEdges.some((edge) => edge.kind === "merge")).toBe(true);
    const feature = layout.nodes.find((node) => node.hash === "b");
    const main = layout.nodes.find((node) => node.hash === "a");
    expect(feature?.x).toBeGreaterThan(main?.x ?? 0);
  });
});
