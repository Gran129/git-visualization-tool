import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../server/app.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

async function listen(): Promise<string> {
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind test server");
  }
  return `http://127.0.0.1:${address.port}`;
}

describe("http api", () => {
  it("reports health and opens the current repository", async () => {
    const base = await listen();
    const health = await fetch(`${base}/api/health`).then(
      (response) => response.json() as Promise<{ ok: boolean; data: { service: string } }>,
    );
    expect(health.ok).toBe(true);
    expect(health.data.service).toBe("git-visualization-tool");

    const graph = await fetch(`${base}/api/graph`).then(
      (response) =>
        response.json() as Promise<{
          ok: boolean;
          data: { commits: unknown[]; laneCount: number };
        }>,
    );
    expect(graph.ok).toBe(true);
    expect(graph.data.laneCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(graph.data.commits)).toBe(true);
  });
});
