import { beforeEach, describe, it } from "node:test";
import { createWorker, type Env } from "../index";
import { MemoryTruthStore, healthy, story } from "./fixtures";
import { expect } from "./expect";

const now = new Date("2026-08-26T12:00:00.000Z");
const env = {
  BUILD_VERSION: "test-sha",
  CORS_ORIGIN: "https://atlas.example",
  STALE_AFTER_SECONDS: "1800",
} as Env;

describe("Atlas Worker routes", () => {
  let store: MemoryTruthStore;
  let worker: ReturnType<typeof createWorker>;

  beforeEach(() => {
    store = new MemoryTruthStore();
    worker = createWorker({ store, clock: () => now, requestId: () => "request-test" });
  });

  async function get(path: string): Promise<Response> {
    return worker.fetch!(new Request(`https://atlas.example${path}`), env, {} as ExecutionContext);
  }

  it("describes the service without reading storage", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { service: "atlas-news-intelligence", version: "test-sha" },
      meta: { request_id: "request-test" },
    });
  });

  it("returns a typed stories envelope", async () => {
    const response = await get("/api/stories");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("stale-while-revalidate");
    const body = await response.json() as { data: { count: number; stories: typeof store.stories } };
    expect(body.data.count).toBe(1);
    expect(body.data.stories[0]?.cluster_id).toBe(story.cluster_id);
  });

  it("serves the Lane A/UI intelligence snapshot contract without an envelope", async () => {
    const response = await get("/api/v1/intelligence?window=24h&prominence=normalized");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      generatedAt: "2026-08-26T12:00:00.000Z",
      window: "24h",
      health: { status: "healthy", activeSourceCount: 2, regionCount: 1 },
      regions: [{ id: "TEST-EU", topClusterIds: [story.cluster_id] }],
      clusters: [{
        id: story.cluster_id,
        primaryRegionId: "TEST-EU",
        eventLocations: [{ locationType: "city", evidenceCount: 1 }],
        sources: [{ publisher: "Fixture Wire", claimPosition: "reports" }],
      }],
    });
  });

  it("translates a seven-day raw intelligence query into the truth-store window", async () => {
    await get("/api/v1/intelligence?window=7d&prominence=raw");
    expect(store.queries[0]).toEqual({
      since: "2026-08-19T12:00:00.000Z",
      until: "2026-08-26T12:00:00.000Z",
      metric: "raw",
      limit: 100,
    });
  });

  it("rejects unsupported intelligence windows", async () => {
    const response = await get("/api/v1/intelligence?window=30d&prominence=normalized");
    expect(response.status).toBe(400);
  });

  it("does not fabricate an intelligence snapshot when the truth store is unavailable", async () => {
    store.health = { ...healthy, status: "unavailable", latest_story_at: null, reasons: ["no_story_watermark"] };
    store.stories = [];
    const response = await get("/api/v1/intelligence?window=24h&prominence=normalized");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { kind: "database_unavailable", retryable: true },
    });
  });

  it("normalizes and forwards story filters", async () => {
    await get("/api/stories?region=test-eu&metric=raw&limit=7&since=2026-08-26T01:00:00Z");
    expect(store.queries).toEqual([
      {
        region: "TEST-EU",
        metric: "raw",
        limit: 7,
        since: "2026-08-26T01:00:00.000Z",
      },
    ]);
  });

  it("rejects an invalid metric", async () => {
    const response = await get("/api/stories?metric=viral");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { kind: "bad_request" } });
  });

  it("rejects an invalid limit", async () => {
    const response = await get("/api/stories?limit=101");
    expect(response.status).toBe(400);
  });

  it("rejects an invalid timestamp", async () => {
    const response = await get("/api/stories?since=yesterday-ish");
    expect(response.status).toBe(400);
  });

  it("rejects a reversed time window", async () => {
    const response = await get("/api/stories?since=2026-08-27T00:00:00Z&until=2026-08-26T00:00:00Z");
    expect(response.status).toBe(400);
  });

  it("returns story detail", async () => {
    const response = await get(`/api/stories/${story.cluster_id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { cluster_id: story.cluster_id } });
  });

  it("returns a typed missing-cluster failure", async () => {
    const response = await get("/api/stories/missing");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { kind: "not_found", retryable: false },
    });
  });

  it("returns healthy pipeline state", async () => {
    const response = await get("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: healthy });
  });

  it("uses 503 for unavailable data while preserving the success envelope", async () => {
    store.health = { ...healthy, status: "unavailable", reasons: ["no_story_watermark"] };
    const response = await get("/health");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { status: "unavailable", reasons: ["no_story_watermark"] },
    });
  });

  it("sets explicit CORS headers", async () => {
    const response = await get("/");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://atlas.example");
  });

  it("handles preflight without storage", async () => {
    const response = await worker.fetch!(
      new Request("https://atlas.example/api/stories", { method: "OPTIONS" }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(204);
  });

  it("rejects unsupported methods", async () => {
    const response = await worker.fetch!(
      new Request("https://atlas.example/api/stories", { method: "DELETE" }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(405);
    expect(await response.json()).toMatchObject({ ok: false, error: { kind: "method_not_allowed" } });
  });
});

describe("MCP surface", () => {
  const store = new MemoryTruthStore();
  const worker = createWorker({ store, clock: () => now, requestId: () => "request-mcp" });

  async function rpc(body: unknown): Promise<Record<string, unknown>> {
    const response = await worker.fetch!(
      new Request("https://atlas.example/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
      {} as ExecutionContext,
    );
    return await response.json() as Record<string, unknown>;
  }

  it("negotiates MCP initialization", async () => {
    const response = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "atlas-news-intelligence" } },
    });
  });

  it("lists read-only product tools", async () => {
    const response = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const result = response.result as { tools: Array<{ name: string }> };
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "atlas.query_dominant_stories",
      "atlas.explain_story_cluster",
      "atlas.pipeline_health",
    ]);
  });

  it("invokes the same truth store through MCP", async () => {
    const response = await rpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "atlas.explain_story_cluster", arguments: { cluster_id: story.cluster_id } },
    });
    expect(response).toMatchObject({
      result: { isError: false, structuredContent: { cluster_id: story.cluster_id } },
    });
  });

  it("returns a tool-level error for an unknown cluster", async () => {
    const response = await rpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "atlas.explain_story_cluster", arguments: { cluster_id: "missing" } },
    });
    expect(response).toMatchObject({ result: { isError: true } });
  });

  it("returns JSON-RPC method-not-found", async () => {
    const response = await rpc({ jsonrpc: "2.0", id: 5, method: "resources/list" });
    expect(response).toMatchObject({ error: { code: -32601 } });
  });
});
