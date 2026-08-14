import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { dispatch } from "../server/dispatch.js";

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

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("desktop dispatch", () => {
  it("opens a repo and returns a graph without HTTP", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-viz-ipc-"));
    created.push(dir);
    git(dir, ["init"]);
    git(dir, ["config", "user.email", "viz@example.com"]);
    git(dir, ["config", "user.name", "Viz Tester"]);
    fs.writeFileSync(path.join(dir, "a.txt"), "hello\n");
    git(dir, ["add", "a.txt"]);
    git(dir, ["commit", "-m", "hello"]);

    const summary = (await dispatch("open", { path: dir })) as { path: string };
    expect(summary.path).toBe(path.resolve(dir));
    const graph = (await dispatch("graph", { path: dir })) as { commits: Array<{ subject: string }> };
    expect(graph.commits[0]?.subject).toBe("hello");
  });

  it("reports whether a path is a git repository without opening it", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-viz-isrepo-"));
    created.push(dir);
    const missing = path.join(dir, "no-such-dir");

    const empty = (await dispatch("isRepo", { path: dir })) as { path: string; isRepo: boolean };
    expect(empty.isRepo).toBe(false);
    expect(empty.path).toBe(path.resolve(dir));

    git(dir, ["init"]);
    const ready = (await dispatch("isRepo", { path: dir })) as { path: string; isRepo: boolean };
    expect(ready.isRepo).toBe(true);

    const blank = (await dispatch("isRepo", { path: "" })) as { path: string; isRepo: boolean };
    expect(blank).toEqual({ path: "", isRepo: false });

    const absent = (await dispatch("isRepo", { path: missing })) as { isRepo: boolean };
    expect(absent.isRepo).toBe(false);
  });

  it("rejects unknown methods", async () => {
    await expect(dispatch("not-a-method", {})).rejects.toThrow(/未知方法/);
  });
});
