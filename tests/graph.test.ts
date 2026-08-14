import { describe, expect, it } from "vitest";
import { layoutCommitGraph } from "../server/graph.js";

describe("layoutCommitGraph", () => {
  it("puts a linear history on a single lane", () => {
    const result = layoutCommitGraph([
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    expect(result.laneCount).toBe(1);
    expect(result.commits.map((item) => item.lane)).toEqual([0, 0, 0]);
  });

  it("assigns a second lane for a merge parent", () => {
    const result = layoutCommitGraph([
      { hash: "m", parents: ["a", "b"] },
      { hash: "a", parents: ["c"] },
      { hash: "b", parents: ["c"] },
      { hash: "c", parents: [] },
    ]);
    expect(result.laneCount).toBeGreaterThanOrEqual(2);
    const merge = result.commits[0];
    expect(merge?.edges.some((edge) => edge.kind === "merge")).toBe(true);
    expect(new Set(result.commits.map((item) => item.hash)).size).toBe(4);
  });

  it("handles an empty history", () => {
    const result = layoutCommitGraph([]);
    expect(result.commits).toEqual([]);
    expect(result.laneCount).toBe(1);
  });
});
