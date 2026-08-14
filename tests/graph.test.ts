import { describe, expect, it } from "vitest";
import {
  assignSeriesIds,
  classifyCommitRole,
  collectMissingParents,
  layoutCommitGraph,
} from "../server/graph.js";

describe("layoutCommitGraph", () => {
  it("handles an empty history", () => {
    const result = layoutCommitGraph([]);
    expect(result.commits).toEqual([]);
    expect(result.laneCount).toBe(1);
    expect(result.ghostHashes.size).toBe(0);
  });

  it("marks a single root commit", () => {
    const result = layoutCommitGraph([{ hash: "a", parents: [] }]);
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0]?.lane).toBe(0);
    expect(result.commits[0]?.ghost).toBe(false);
    expect(classifyCommitRole({ hash: "a", parents: [] })).toBe("root");
  });

  it("puts a linear history on a single lane", () => {
    const result = layoutCommitGraph([
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    expect(result.laneCount).toBe(1);
    expect(result.commits.map((item) => item.lane)).toEqual([0, 0, 0]);
  });

  it("gives a side branch its own lane at a fork", () => {
    const result = layoutCommitGraph([
      { hash: "c", parents: ["a"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    expect(result.laneCount).toBeGreaterThanOrEqual(2);
    const lanes = new Set(result.commits.filter((item) => item.hash !== "a").map((item) => item.lane));
    expect(lanes.size).toBe(2);
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
    expect(classifyCommitRole({ hash: "m", parents: ["a", "b"] })).toBe("merge");
  });

  it("keeps octopus merges on one node with extra parent lanes", () => {
    const result = layoutCommitGraph([
      { hash: "o", parents: ["a", "b", "c"] },
      { hash: "a", parents: ["r"] },
      { hash: "b", parents: ["r"] },
      { hash: "c", parents: ["r"] },
      { hash: "r", parents: [] },
    ]);
    expect(result.laneCount).toBeGreaterThanOrEqual(3);
    const octopus = result.commits.find((item) => item.hash === "o");
    expect(octopus?.edges.filter((edge) => edge.kind === "merge")).toHaveLength(2);
    expect(classifyCommitRole({ hash: "o", parents: ["a", "b", "c"] })).toBe("octopus");
  });

  it("keeps two unrelated roots on separate series", () => {
    const result = layoutCommitGraph([
      { hash: "b1", parents: ["a1"] },
      { hash: "b2", parents: ["a2"] },
      { hash: "a1", parents: [] },
      { hash: "a2", parents: [] },
    ]);
    expect(result.laneCount).toBeGreaterThanOrEqual(2);
    const ids = assignSeriesIds(result.commits);
    expect(ids.get("a1")).not.toBe(ids.get("a2"));
  });

  it("inserts a ghost node when a parent is outside the window", () => {
    expect(collectMissingParents([{ hash: "c", parents: ["missing"] }])).toEqual(["missing"]);
    const result = layoutCommitGraph([{ hash: "c", parents: ["missing"] }]);
    const ghost = result.commits.find((item) => item.hash === "missing");
    expect(ghost?.ghost).toBe(true);
    expect(result.ghostHashes.has("missing")).toBe(true);
    const child = result.commits.find((item) => item.hash === "c");
    expect(child?.parents).toEqual(["missing"]);
  });
});

describe("classifyCommitRole", () => {
  it("detects cherry-pick, revert, and stash", () => {
    expect(
      classifyCommitRole({
        hash: "p",
        parents: ["a"],
        subject: "fix",
        body: "(cherry picked from commit abcdef1)",
      }),
    ).toBe("cherryPick");
    expect(
      classifyCommitRole({
        hash: "v",
        parents: ["a"],
        subject: 'Revert "bad change"',
        body: "This reverts commit abcdef1.",
      }),
    ).toBe("revert");
    expect(
      classifyCommitRole({
        hash: "s",
        parents: ["a"],
        subject: "WIP",
        stashHashes: new Set(["s"]),
      }),
    ).toBe("stash");
  });
});
