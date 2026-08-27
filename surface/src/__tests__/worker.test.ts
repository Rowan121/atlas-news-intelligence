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

  it("redirects production HTTP before routing or storage while HTTPS passes through", async () => {
    const productionEnv = { ...env, ENVIRONMENT: "production" };
    const redirect = await worker.fetch!(
      new Request("http://atlas.example/api/stories?metric=raw", { method: "POST" }),
      productionEnv,
      {} as ExecutionContext,
    );

    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe("https://atlas.example/api/stories?metric=raw");
    expect(store.queries).toEqual([]);

    const secure = await worker.fetch!(
      new Request("https://atlas.example/api/stories?metric=raw"),
      productionEnv,
      {} as ExecutionContext,
    );
    expect(secure.status).toBe(200);
    expect(store.queries).toEqual([{ metric: "raw", limit: 20 }]);
  });

  it("does not force HTTPS outside production", async () => {
    const response = await worker.fetch!(
      new Request("http://127.0.0.1:8787/api/stories"),
      { ...env, ENVIRONMENT: "development" },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBe(null);
    expect(store.queries).toEqual([{ metric: "normalized", limit: 20 }]);
  });

  it("describes the service without reading storage", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { service: "atlas-news-intelligence", version: "test-sha" },
      meta: { request_id: "request-test" },
    });
  });

  it("negotiates Markdown and explicit fallback semantics on the root", async () => {
    const markdown = await worker.fetch!(
      new Request("https://atlas.example/", { headers: { Accept: "text/markdown" } }),
      env,
      {} as ExecutionContext,
    );
    expect(markdown.status).toBe(200);
    expect(markdown.headers.get("content-type")).toContain("text/markdown");
    expect(await markdown.text()).toContain("# Atlas News Intelligence");

    const assetEnv = {
      ...env,
      ASSETS: {
        async fetch(): Promise<Response> {
          return new Response("<!doctype html><html lang=\"en\"><body>Atlas explorer</body></html>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      },
    };
    const html = await worker.fetch!(
      new Request("https://atlas.example/", { headers: { Accept: "text/markdown;q=0, text/html;q=1" } }),
      assetEnv,
      {} as ExecutionContext,
    );
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");

    const unacceptable = await worker.fetch!(
      new Request("https://atlas.example/", { headers: { Accept: "application/pdf" } }),
      assetEnv,
      {} as ExecutionContext,
    );
    expect(unacceptable.status).toBe(406);
    expect(unacceptable.headers.get("content-type")).toContain("application/problem+json");
  });

  it("serves machine discovery without touching storage", async () => {
    const robots = await get("/robots.txt");
    expect(robots.status).toBe(200);
    expect(robots.headers.get("content-type")).toContain("text/plain");
    expect(await robots.text()).toContain("Sitemap: https://atlas.example/sitemap.xml");

    const sitemap = await get("/sitemap.xml");
    expect(sitemap.headers.get("content-type")).toContain("application/xml");
    expect(await sitemap.text()).toContain("<loc>https://atlas.example/docs</loc>");

    const llms = await get("/llms.txt");
    expect(await llms.text()).toContain("Event location, publisher origin, and audience-region evidence are distinct");
  });

  it("negotiates equivalent Markdown documentation", async () => {
    const response = await worker.fetch!(
      new Request("https://atlas.example/docs", { headers: { Accept: "text/markdown" } }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("vary")).toContain("Accept");
    expect(await response.text()).toContain("## Public REST API");
  });

  it("keeps the HTML documentation aligned with the same-event product contract", async () => {
    const response = await worker.fetch!(
      new Request("https://atlas.example/docs", { headers: { Accept: "text/html" } }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("clusters reports about the same event");
  });

  it("honors explicit Accept quality and never mislabels an HTML fallback", async () => {
    const response = await worker.fetch!(
      new Request("https://atlas.example/docs", {
        headers: { Accept: "text/markdown;q=0, text/html;q=1" },
      }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("<!doctype html>");
  });

  it("returns 406 when neither documentation representation is acceptable", async () => {
    const response = await worker.fetch!(
      new Request("https://atlas.example/docs", { headers: { Accept: "application/pdf" } }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(406);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ title: "Not Acceptable", status: 406 });
  });

  it("publishes an RFC 9727 linkset and a matching HEAD relation", async () => {
    const response = await get("/.well-known/api-catalog");
    expect(response.headers.get("content-type")).toContain("application/linkset+json");
    const body = await response.json() as { linkset: Array<{ anchor: string }> };
    expect(body.linkset[0]?.anchor).toBe("https://atlas.example/.well-known/api-catalog");

    const head = await worker.fetch!(
      new Request("https://atlas.example/.well-known/api-catalog", { method: "HEAD" }),
      env,
      {} as ExecutionContext,
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("link")).toContain('rel="api-catalog"');
    expect(await head.text()).toBe("");
  });

  it("publishes only real public API paths in OpenAPI", async () => {
    const response = await get("/openapi.json");
    expect(response.headers.get("content-type")).toContain("application/vnd.oai.openapi+json");
    expect(await response.json()).toMatchObject({
      openapi: "3.1.0",
      servers: [{ url: "https://atlas.example" }],
      paths: {
        "/health": {},
        "/api/v1/intelligence": {},
        "/api/stories": {},
        "/api/stories/{cluster_id}": {},
      },
    });
  });

  it("publishes truthful MCP and A2A discovery cards", async () => {
    const mcp = await get("/.well-known/mcp/server-card.json");
    expect(await mcp.json()).toMatchObject({
      protocolVersion: "2026-07-28",
      transport: { type: "streamable-http", endpoint: "https://atlas.example/mcp" },
    });
    const a2a = await get("/.well-known/agent-card.json");
    expect(await a2a.json()).toMatchObject({
      supportedInterfaces: [{ url: "https://atlas.example/a2a", protocolBinding: "HTTP+JSON", protocolVersion: "1.0" }],
      capabilities: { streaming: false, pushNotifications: false },
    });
  });

  it("uses self-only CORS without requiring the final Worker hostname", async () => {
    const selfEnv = { ...env, CORS_ORIGIN: "self" };
    const sameOrigin = await worker.fetch!(
      new Request("https://atlas.example/health", { headers: { Origin: "https://atlas.example" } }),
      selfEnv,
      {} as ExecutionContext,
    );
    expect(sameOrigin.headers.get("access-control-allow-origin")).toBe("https://atlas.example");
    const foreign = await worker.fetch!(
      new Request("https://atlas.example/health", { headers: { Origin: "https://other.example" } }),
      selfEnv,
      {} as ExecutionContext,
    );
    expect(foreign.headers.get("access-control-allow-origin")).toBe(null);
  });

  it("adds discovery links while forwarding the real static homepage asset", async () => {
    const assetEnv = {
      ...env,
      ASSETS: {
        async fetch(): Promise<Response> {
          return new Response("<!doctype html><html lang=\"en\"><body>Atlas explorer</body></html>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      },
    };
    const response = await worker.fetch!(
      new Request("https://atlas.example/"),
      assetEnv,
      {} as ExecutionContext,
    );
    expect(await response.text()).toContain("Atlas explorer");
    expect(response.headers.get("link")).toContain("/.well-known/api-catalog");
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
        prominence: {
          basis: "event_location",
          byRegion: [{
            normalized: {
              sourceNormalizedShare: 0.4,
              denominators: { regionalArticleMemberships: 5, regionalOutlets: 3 },
            },
          }],
        },
        coverageHeat: { status: "unavailable", basis: "coverage_market", markets: [] },
        signals: {
          conflict: { status: "not_assessed" },
          omission: { status: "not_assessed" },
        },
        sources: [{
          publisher: "Fixture Wire",
          claimPosition: "reports",
          publisherOrigin: { status: "observed", value: { regionCode: "ZZ" } },
          coverageMarkets: { status: "unknown", value: null },
          audienceExposure: { status: "unknown", value: null },
          framing: { status: "unknown", value: null },
          tone: { status: "unknown", value: null },
        }],
      }],
    });
  });

  it("builds SAME-STORY coverage heat and conflict only from cited cross-publisher evidence", async () => {
    const compared = structuredClone(story);
    const first = compared.articles[0]!;
    first.same_story.coverageMarkets = {
      status: "observed",
      value: [
        { regionCode: "TEST-NA", label: "Test North" },
        {
          regionCode: "TEST-EU",
          label: "Test Europe",
          coordinates: { latitude: 48.8, longitude: 2.3 },
        },
      ],
      confidence: 0.9,
      method: "provider_coverage_metadata",
      evidence: [{ articleId: first.article_id, url: first.canonical_url, quote: "Fixture coverage metadata." }],
      reason: null,
    };
    compared.articles.push({
      ...structuredClone(first),
      article_id: "test-article-2",
      canonical_url: "https://second.example.invalid/test-only/article-2",
      source_url: "https://second.example.invalid/test-only/article-2",
      publisher_name: "Second Fixture Wire",
      publisher_domain: "second.example.invalid",
      same_story: {
        ...structuredClone(first.same_story),
        publisherOrigin: {
          status: "observed",
          value: { regionCode: "YY", label: "Second synthetic origin" },
          confidence: 0.8,
          method: "publisher_registry",
          evidence: [],
          reason: null,
        },
        coverageMarkets: {
          status: "observed",
          value: [{ regionCode: "TEST-EU", label: "Test Europe" }],
          confidence: 0.9,
          method: "provider_coverage_metadata",
          evidence: [{
            articleId: "test-article-2",
            url: "https://second.example.invalid/test-only/article-2",
            quote: "Fixture coverage metadata.",
          }],
          reason: null,
        },
      },
    });
    compared.claims = [
      {
        claim_id: "claim-support",
        normalized_claim: "the harbor is closed",
        stance: "supports",
        confidence: 0.9,
        evidence_article_id: first.article_id,
        evidence_quote: "The harbor is closed.",
      },
      {
        claim_id: "claim-dispute",
        normalized_claim: "the harbor is closed",
        stance: "disputes",
        confidence: 0.8,
        evidence_article_id: "test-article-2",
        evidence_quote: "The harbor remains open.",
      },
    ];
    store.stories = [compared];

    const response = await get("/api/v1/intelligence?window=24h&prominence=normalized");
    const body = await response.json() as {
      clusters: Array<{
        coverageHeat: unknown;
        signals: unknown;
        sources: unknown[];
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.clusters[0]).toMatchObject({
      coverageHeat: {
        status: "observed",
        basis: "coverage_market",
        markets: [
          {
            regionCode: "TEST-EU",
            rawArticleCount: 2,
            uniquePublisherCount: 2,
            sourceNormalizedShare: 0.75,
            coordinates: {
              latitude: 48.8,
              longitude: 2.3,
              confidence: 0.9,
              method: "provider_coverage_metadata",
            },
          },
          {
            regionCode: "TEST-NA",
            rawArticleCount: 1,
            uniquePublisherCount: 1,
            sourceNormalizedShare: 0.25,
            coordinates: null,
          },
        ],
      },
      signals: {
        conflict: { status: "detected", confidence: 0.8, method: "claim_stance_comparison" },
        omission: { status: "not_assessed", method: "unavailable" },
      },
      sources: [
        { framing: { status: "observed", value: "supports" }, audienceExposure: { status: "unknown" } },
        { framing: { status: "observed", value: "disputes" }, audienceExposure: { status: "unknown" } },
      ],
    });
  });

  it("collapses duplicate summary ids and chooses one deterministic evidence-ranked event anchor", async () => {
    const multiLocation = structuredClone(story);
    multiLocation.locations.push({
      ...structuredClone(multiLocation.locations[0]!),
      location_id: "test-location-same-region",
      label: "Second cited location in Test Europe",
      latitude: 13,
      longitude: 23,
      confidence: 0.85,
      evidence_count: 1,
    });
    multiLocation.locations.push({
      ...structuredClone(multiLocation.locations[0]!),
      location_id: "test-location-stronger",
      label: "Stronger cited event location",
      region_code: "TEST-PRIMARY",
      latitude: 35,
      longitude: 45,
      confidence: 0.95,
      evidence_count: 2,
    });
    store.stories = [multiLocation, structuredClone(multiLocation)];

    const response = await get("/api/v1/intelligence?window=24h&prominence=normalized");
    const body = await response.json() as {
      health: { message: string | null };
      clusters: Array<{
        id: string;
        primaryRegionId: string;
        eventLocations: Array<{ id: string; isPrimary: boolean }>;
      }>;
      regions: Array<{
        id: string;
        rawProminence: number;
        storyCount: number;
        topClusterIds: string[];
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.clusters.length).toBe(1);
    expect(body.clusters[0]).toMatchObject({
      id: story.cluster_id,
      primaryRegionId: "TEST-PRIMARY",
      eventLocations: [
        { id: "test-location-stronger", isPrimary: true },
        { id: "test-location-event", isPrimary: false },
        { id: "test-location-same-region", isPrimary: false },
      ],
    });
    expect(body.regions.find((region) => region.id === "TEST-EU")).toMatchObject({
      rawProminence: 2,
      storyCount: 1,
      topClusterIds: [story.cluster_id],
    });
    expect(body.health.message).toContain("duplicate cluster summary row");
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

  it("rejects permissive but non-RFC3339 timestamps", async () => {
    for (const value of ["1", "2026-08-26", "2026-02-30T00:00:00Z", "2026-08-26 01:00:00Z"]) {
      const response = await get(`/api/stories?since=${encodeURIComponent(value)}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { kind: "bad_request", message: "since must be an RFC 3339 date-time", retryable: false },
      });
    }
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

  it("rejects malformed percent-encoding as a non-retryable client error", async () => {
    const response = await get("/api/stories/%");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { kind: "bad_request", retryable: false },
    });
  });

  it("returns a controlled 404 for an unknown Worker route", async () => {
    const response = await get("/definitely-not-a-real-route");
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

  it("returns a JSON-RPC client error for a null request body", async () => {
    const response = await rpc(null);
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" },
    });
  });

  it("supports current stateless MCP discovery while retaining legacy initialization", async () => {
    const response = await rpc({
      jsonrpc: "2.0",
      id: "discover",
      method: "server/discover",
      params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } },
    });
    expect(response).toMatchObject({
      result: {
        resultType: "complete",
        supportedVersions: ["2026-07-28", "2025-06-18"],
        cacheScope: "public",
      },
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

  it("enforces declared MCP schemas and normalizes query timestamps", async () => {
    const invalid = await rpc({
      jsonrpc: "2.0",
      id: "invalid-args",
      method: "tools/call",
      params: { name: "atlas.query_dominant_stories", arguments: { region: "us", surprise: true } },
    });
    expect(invalid).toMatchObject({ result: { isError: true } });

    await rpc({
      jsonrpc: "2.0",
      id: "normalized-args",
      method: "tools/call",
      params: {
        name: "atlas.query_dominant_stories",
        arguments: { region: "test-eu", since: "2026-08-26T01:00:00Z", limit: 7 },
      },
    });
    expect(store.queries.at(-1)).toEqual({
      region: "TEST-EU",
      since: "2026-08-26T01:00:00.000Z",
      metric: "normalized",
      limit: 7,
    });
  });

  it("returns a tool error for a non-RFC3339 timestamp", async () => {
    const response = await rpc({
      jsonrpc: "2.0",
      id: "invalid-time",
      method: "tools/call",
      params: { name: "atlas.query_dominant_stories", arguments: { since: "1" } },
    });
    expect(response).toMatchObject({
      result: {
        isError: true,
        structuredContent: { error: "since must be an RFC 3339 date-time" },
      },
    });
  });

  it("returns no body for JSON-RPC notifications", async () => {
    const response = await worker.fetch!(
      new Request("https://atlas.example/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list" }),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
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

describe("A2A surface", () => {
  let store: MemoryTruthStore;
  let worker: ReturnType<typeof createWorker>;

  beforeEach(() => {
    store = new MemoryTruthStore();
    worker = createWorker({ store, clock: () => now, requestId: () => "request-a2a" });
  });

  async function send(data: unknown): Promise<Response> {
    return worker.fetch!(
      new Request("https://atlas.example/a2a/message:send", {
        method: "POST",
        headers: { "Content-Type": "application/a2a+json", "A2A-Version": "1.0" },
        body: JSON.stringify({
          message: { messageId: "client-message", role: "ROLE_USER", parts: [{ data }] },
        }),
      }),
      env,
      {} as ExecutionContext,
    );
  }

  async function sendEnvelope(body: string): Promise<Response> {
    return worker.fetch!(
      new Request("https://atlas.example/a2a/message:send", {
        method: "POST",
        headers: { "Content-Type": "application/a2a+json", "A2A-Version": "1.0" },
        body,
      }),
      env,
      {} as ExecutionContext,
    );
  }

  it("returns A2A client errors for null envelopes, messages, and parts", async () => {
    const bodies = [
      "null",
      JSON.stringify({ message: null }),
      JSON.stringify({
        message: { messageId: "client-message", role: "ROLE_USER", parts: [null] },
      }),
    ];

    for (const body of bodies) {
      const response = await sendEnvelope(body);
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(await response.json()).toMatchObject({
        title: "Invalid A2A request",
        status: 400,
      });
    }
  });

  it("returns current story summaries through a real read-only skill", async () => {
    const response = await send({ operation: "query_stories", region: "test-eu", metric: "normalized", limit: 7 });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/a2a+json");
    expect(await response.json()).toMatchObject({
      message: {
        messageId: "request-a2a:response",
        role: "ROLE_AGENT",
        parts: [{ data: { operation: "query_stories", count: 1, query: { region: "TEST-EU", limit: 7 } } }],
      },
    });
  });

  it("explains a cluster and reports pipeline health", async () => {
    const detail = await send({ operation: "explain_story", cluster_id: story.cluster_id });
    expect(await detail.json()).toMatchObject({ message: { parts: [{ data: { story: { cluster_id: story.cluster_id } } }] } });
    const health = await send({ operation: "pipeline_health" });
    expect(await health.json()).toMatchObject({ message: { parts: [{ data: { health: { status: "ok" } } }] } });
  });

  it("rejects malformed and unknown A2A operations without a stack trace", async () => {
    const response = await send({ operation: "spend_money" });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ title: "Invalid A2A operation", status: 400 });
  });

  it("returns a protocol error for a non-RFC3339 timestamp", async () => {
    const response = await send({ operation: "query_stories", since: "1" });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({
      title: "Invalid A2A operation",
      status: 400,
      detail: "since must be an RFC 3339 date-time",
    });
  });

  it("returns a typed A2A version-negotiation error", async () => {
    const response = await worker.fetch!(
      new Request("https://atlas.example/a2a/message:send", {
        method: "POST",
        headers: { "Content-Type": "application/a2a+json", "A2A-Version": "0.3" },
        body: JSON.stringify({ message: { messageId: "client-message", role: "ROLE_USER", parts: [{ data: { operation: "pipeline_health" } }] } }),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ supportedVersions: ["1.0"] });
  });
});
