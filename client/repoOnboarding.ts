export type HostingProviderId = "github" | "gitee" | "gitlab" | "codeberg" | "other";

export interface HostingProvider {
  id: Exclude<HostingProviderId, "other">;
  name: string;
  hint: string;
  newRepoUrl: string;
  hostPatterns: string[];
}

export const HOSTING_PROVIDERS: HostingProvider[] = [
  {
    id: "github",
    name: "GitHub",
    hint: "github.com",
    newRepoUrl: "https://github.com/new",
    hostPatterns: ["github.com"],
  },
  {
    id: "gitee",
    name: "Gitee",
    hint: "gitee.com",
    newRepoUrl: "https://gitee.com/projects/new",
    hostPatterns: ["gitee.com"],
  },
  {
    id: "gitlab",
    name: "GitLab",
    hint: "gitlab.com",
    newRepoUrl: "https://gitlab.com/projects/new",
    hostPatterns: ["gitlab.com"],
  },
  {
    id: "codeberg",
    name: "Codeberg",
    hint: "codeberg.org",
    newRepoUrl: "https://codeberg.org/repo/create",
    hostPatterns: ["codeberg.org"],
  },
];

const DEFAULT_REPO_NAME = "repo";

function stripGitSuffix(name: string): string {
  return name.replace(/\.git$/i, "");
}

function lastPathSegment(value: string): string {
  const parts = value.split("/").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? "";
}

function sanitizeRepoName(name: string): string {
  return name.replace(/[<>:"|?*]/g, "").trim();
}

export function repoNameFromUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  let cleaned = trimmed.replace(/\\/g, "/");
  const scpMatch = /^git@[^:/]+:(.+)$/i.exec(cleaned);
  if (scpMatch?.[1]) {
    cleaned = scpMatch[1];
  } else {
    try {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) {
        cleaned = new URL(cleaned).pathname;
      }
    } catch {
      // Keep the original string and take its last segment below.
    }
  }

  cleaned = cleaned.replace(/\/+$/, "");
  const name = sanitizeRepoName(stripGitSuffix(lastPathSegment(cleaned)));
  return name;
}

export function pathSeparator(base: string): "/" | "\\" {
  if (/^[a-zA-Z]:[\\/]/.test(base) || (base.includes("\\") && !base.includes("/"))) {
    return "\\";
  }
  return "/";
}

export function joinPath(base: string, name: string): string {
  const trimmedName = name.replace(/^[\\/]+/, "");
  if (!base.trim()) {
    return trimmedName;
  }
  const sep = pathSeparator(base);
  const trimmedBase = base.replace(/[\\/]+$/, "");
  if (!trimmedName) {
    return trimmedBase;
  }
  const normalizedName = sep === "\\" ? trimmedName.replace(/\//g, "\\") : trimmedName;
  return `${trimmedBase}${sep}${normalizedName}`;
}

export function suggestedCloneDest(home: string, url: string): string {
  return joinPath(home, repoNameFromUrl(url) || DEFAULT_REPO_NAME);
}

export function classifyHosting(url: string): HostingProviderId {
  const lower = url.trim().toLowerCase();
  if (!lower) {
    return "other";
  }
  for (const provider of HOSTING_PROVIDERS) {
    if (provider.hostPatterns.some((host) => lower.includes(host))) {
      return provider.id;
    }
  }
  return "other";
}

export function hostingProviderById(id: HostingProviderId): HostingProvider | null {
  if (id === "other") {
    return null;
  }
  return HOSTING_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function openHostingNewRepo(url: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
