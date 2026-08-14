import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkoutRef,
  commitChanges,
  createBranch,
  getCommitDetail,
  getGraph,
  getStatus,
  mergeRef,
  stageFile,
} from "../server/ops.js";

const created: string[] = [];

function git(repo: string, args: string[]): void {
  const result = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git failed");
  }
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-viz-"));
  created.push(dir);
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "viz@example.com"]);
  git(dir, ["config", "user.name", "Viz Tester"]);
  git(dir, ["checkout", "-b", "main"]);
  return dir;
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("git operations", () => {
  it("stages, commits, branches, merges, and builds a graph", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "README.md"), "hello\n");
    await stageFile(repo, "README.md");
    await commitChanges(repo, "init", false);

    await createBranch(repo, "feature");
    await checkoutRef(repo, "feature", false);
    fs.writeFileSync(path.join(repo, "feature.txt"), "branch work\n");
    await stageFile(repo, "feature.txt");
    await commitChanges(repo, "feature commit", false);

    await checkoutRef(repo, "main", false);
    fs.writeFileSync(path.join(repo, "main.txt"), "main work\n");
    await stageFile(repo, "main.txt");
    await commitChanges(repo, "main commit", false);

    await mergeRef(repo, "feature", true);
    const graph = await getGraph(repo, { max: 50 });
    expect(graph.commits.length).toBeGreaterThanOrEqual(3);
    expect(graph.laneCount).toBeGreaterThanOrEqual(1);
    const merge = graph.commits.find((commit) => commit.parents.length === 2);
    expect(merge).toBeTruthy();
    if (!merge) {
      throw new Error("expected merge commit");
    }
    expect(merge.role).toBe("merge");
    expect(merge.ghost).toBe(false);
    const detail = await getCommitDetail(repo, merge.hash);
    expect(detail.files.some((file) => file.path === "feature.txt")).toBe(true);

    fs.writeFileSync(path.join(repo, "dirty.txt"), "unstaged\n");
    const status = await getStatus(repo);
    expect(status.files.some((file) => file.path === "dirty.txt" && file.untracked)).toBe(true);
  });
});
