import { describe, expect, it } from "vitest";
import {
  classifyHosting,
  hostingProviderById,
  joinPath,
  pathSeparator,
  repoNameFromUrl,
  suggestedCloneDest,
} from "../client/repoOnboarding";

describe("repo onboarding helpers", () => {
  it("extracts a repo name from HTTPS, SSH, and scp-style URLs", () => {
    expect(repoNameFromUrl("https://github.com/Gran129/git-visualization-tool.git")).toBe(
      "git-visualization-tool",
    );
    expect(repoNameFromUrl("https://gitee.com/user/demo/")).toBe("demo");
    expect(repoNameFromUrl("git@github.com:user/my-app.git")).toBe("my-app");
    expect(repoNameFromUrl("ssh://git@gitlab.com/group/project.git")).toBe("project");
    expect(repoNameFromUrl("https://codeberg.org/org/notes.git?foo=1")).toBe("notes");
    expect(repoNameFromUrl("")).toBe("");
  });

  it("joins POSIX and Windows paths without Node path", () => {
    expect(pathSeparator("/home/viz")).toBe("/");
    expect(pathSeparator("C:\\Users\\viz")).toBe("\\");
    expect(joinPath("/home/viz", "repo")).toBe("/home/viz/repo");
    expect(joinPath("/home/viz/", "repo")).toBe("/home/viz/repo");
    expect(joinPath("C:\\Users\\viz", "repo")).toBe("C:\\Users\\viz\\repo");
    expect(joinPath("", "repo")).toBe("repo");
  });

  it("suggests a clone destination under the user home directory", () => {
    expect(suggestedCloneDest("/home/viz", "https://github.com/user/demo.git")).toBe(
      "/home/viz/demo",
    );
    expect(suggestedCloneDest("C:\\Users\\viz", "git@gitee.com:org/app.git")).toBe(
      "C:\\Users\\viz\\app",
    );
    expect(suggestedCloneDest("/home/viz", "")).toBe("/home/viz/repo");
  });

  it("classifies common Git hosting providers", () => {
    expect(classifyHosting("https://github.com/user/repo.git")).toBe("github");
    expect(classifyHosting("git@gitee.com:user/repo.git")).toBe("gitee");
    expect(classifyHosting("https://gitlab.com/group/project.git")).toBe("gitlab");
    expect(classifyHosting("https://codeberg.org/org/notes.git")).toBe("codeberg");
    expect(classifyHosting("https://example.com/git/repo.git")).toBe("other");
    expect(hostingProviderById("gitee")?.newRepoUrl).toBe("https://gitee.com/projects/new");
    expect(hostingProviderById("other")).toBeNull();
  });
});
