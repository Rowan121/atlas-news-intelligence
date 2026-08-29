import { beforeEach, describe, it } from "node:test";
import { createWorker, type Env } from "../index";
import { MemoryTruthStore, healthy, story } from "./fixtures";
import { escapeHtml, sanitizePathForMarkdown, notFoundMarkdown } from "../discovery";
import { expect } from "./expect";

const now = new Date("2026-08-26T12:00:00.000Z");
const env = {
  BUILD_VERSION: "test-sha",
  CORS_ORIGIN: "https://atlas.example",
  STALE_AFTER_SECONDS: "1800",
} as Env;

function expectPublicOutletCountContract(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized.includes('"unique_outlet_count":2')).toBe(true);
  expect(serialized.includes("unique_publisher_count")).toBe(false);
}

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

  function expectClickjackingHeaders(response: Response): void {
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
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
    expect(redirect.headers.get("strict-transport-security")).toBe(null);
    expect(store.queries).toEqual([]);

    const secure = await worker.fetch!(
      new Request("https://atlas.example/api/stories?metric=raw"),
      productionEnv,
      {} as ExecutionContext,
    );
    expect(secure.status).toBe(200);
    expect(secure.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expectClickjackingHeaders(secure);
    expect(store.queries).toEqual([{ metric: "raw", limit: 20 }]);
  });

  it("allows loopback HTTP even when local Wrangler inherits the production environment", async () => {
    const productionEnv = { ...env, ENVIRONMENT: "production" };
    for (const url of [
      "http://localhost:8787/api/stories",
      "http://127.42.0.1:8787/api/stories",
      "http://[::1]:8787/api/stories",
    ]) {
      const response = await worker.fetch!(
        new Request(url),
        productionEnv,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBe(null);
      expect(response.headers.get("strict-transport-security")).toBe(null);
      expectClickjackingHeaders(response);
    }
    expect(store.queries).toEqual([
      { metric: "normalized", limit: 20 },
      { metric: "normalized", limit: 20 },
      { metric: "normalized", limit: 20 },
    ]);
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
    expect(html.headers.get("link")).toContain('</index.md>; rel="alternate"; type="text/markdown"');

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
    expectClickjackingHeaders(robots);
    expect(robots.headers.get("strict-transport-security")).toBe(null);
    expect(robots.headers.get("content-type")).toContain("text/plain");
    expect(await robots.text()).toContain("Sitemap: https://atlas.example/sitemap.xml");
    expect(await (await get("/robots.txt")).text()).toContain("Content-Signal: search=yes, ai-train=no, ai-input=yes");

    const sitemap = await get("/sitemap.xml");
    expect(sitemap.headers.get("content-type")).toContain("application/xml");
    expect(await sitemap.text()).toContain("<loc>https://atlas.example/docs</loc>");
    expect(await (await get("/sitemap.xml")).text()).toContain("<lastmod>2026-08-27</lastmod>");

    const llms = await get("/llms.txt");
    expect(await llms.text()).toContain("Event location, publisher origin, and primary editorial market are distinct");

    const ard = await get("/.well-known/ard.json");
    expect(ard.headers.get("content-type")).toContain("application/ai-catalog+json");
    expect(await ard.json()).toMatchObject({ specVersion: "1.0", entries: [{ displayName: "Atlas News Intelligence MCP" }] });

    const skills = await get("/.well-known/agent-skills/index.json");
    const skillsBody = await skills.json() as { $schema: string; skills: Array<{ name: string; type: string; url: string; digest: string }> };
    expect(skillsBody).toMatchObject({
      $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
      skills: [{ name: "query-current-stories", type: "skill-md" }],
    });
    const skill = await get(new URL(skillsBody.skills[0]!.url).pathname);
    const skillBody = await skill.text();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(skillBody));
    const digestHex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(skillsBody.skills[0]!.digest).toBe(`sha256:${digestHex}`);

    const auth = await get("/auth.md");
    expect(auth.headers.get("content-type")).toContain("text/markdown");
    expect(await auth.text()).toContain("There is no public registration endpoint");
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

    for (const path of ["/index.md", "/docs.md", "/.well-known/api-catalog.md", "/openapi.json.md"]) {
      const twin = await get(path);
      expect(twin.status).toBe(200);
      expect(twin.headers.get("content-type")).toContain("text/markdown");
      expect((await twin.text()).startsWith("---\n")).toBe(true);
    }
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
    expect(head.headers.get("link")).toContain('/.well-known/api-catalog.md>');
    expect(await head.text()).toBe("");
  });

  it("publishes only real public API paths in OpenAPI", async () => {
    const response = await get("/openapi.json");
    expect(response.headers.get("content-type")).toContain("application/vnd.oai.openapi+json");
    const specification = await response.json() as {
      paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema?: unknown }> }> }>>;
    };
    expect(specification).toMatchObject({
      openapi: "3.1.0",
      servers: [{ url: "https://atlas.example" }],
      paths: {
        "/health": {},
        "/api/v1/intelligence": {},
        "/api/v1/stories": {},
        "/api/v1/stories/{cluster_id}": {},
        "/api/stories": {},
        "/api/stories/{cluster_id}": {},
      },
      components: { schemas: { FailureEnvelope: {}, StoryListEnvelope: {}, StoryDetailEnvelope: {}, IntelligenceSnapshot: {} } },
    });
    for (const pathItem of Object.values(specification.paths)) {
      for (const operation of Object.values(pathItem)) {
        for (const describedResponse of Object.values(operation.responses)) {
          expect(describedResponse.content?.["application/json"]?.schema === undefined).toBe(false);
        }
      }
    }
  });

  it("publishes truthful MCP and A2A discovery cards", async () => {
    const mcp = await get("/.well-known/mcp/server-card.json");
    expect(await mcp.json()).toMatchObject({
      name: "Atlas News Intelligence",
      serverUrl: "https://atlas.example/mcp",
      protocolVersion: "2026-07-28",
      transport: { type: "streamable-http", endpoint: "https://atlas.example/mcp" },
      tools: [
        { name: "atlas.query_dominant_stories" },
        { name: "atlas.explain_story_cluster" },
        { name: "atlas.pipeline_health" },
      ],
    });
    const a2a = await get("/.well-known/agent-card.json");
    expect(await a2a.json()).toMatchObject({
      supportedInterfaces: [
        { url: "https://atlas.example/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" },
        { url: "https://atlas.example/a2a", protocolBinding: "HTTP+JSON", protocolVersion: "1.0" },
      ],
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
      ENVIRONMENT: "production",
      ASSETS: {
        async fetch(): Promise<Response> {
          return new Response("<!doctype html><html lang=\"en\"><body>Atlas explorer</body></html>", {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy": "default-src 'none'; frame-ancestors https://embed.invalid",
              "X-Frame-Options": "SAMEORIGIN",
              "Strict-Transport-Security": "max-age=0",
            },
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
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
  });

  it("forwards built asset paths through the Worker without changing asset representation metadata", async () => {
    const assetRequests: Array<{ method: string; pathname: string }> = [];
    const assetEnv = {
      ...env,
      ENVIRONMENT: "production",
      ASSETS: {
        async fetch(input: RequestInfo | URL): Promise<Response> {
          const request = input instanceof Request ? input : new Request(input);
          const pathname = new URL(request.url).pathname;
          assetRequests.push({ method: request.method, pathname });
          if (pathname === "/assets/missing.js") {
            return new Response("missing asset", {
              status: 404,
              statusText: "Not Found",
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, max-age=60",
                ETag: "\"missing-etag\"",
              },
            });
          }
          if (pathname === "/atlas-social.svg") {
            return new Response("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", {
              status: 200,
              headers: {
                "Content-Type": "image/svg+xml",
                "Cache-Control": "public, max-age=300",
                ETag: "\"social-etag\"",
              },
            });
          }
          return new Response("console.log('atlas');", {
            status: 200,
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": "public, max-age=31536000, immutable",
              ETag: "\"asset-etag\"",
            },
          });
        },
      },
    } as Env;

    const asset = await worker.fetch!(
      new Request("https://atlas.example/assets/index.js"),
      assetEnv,
      {} as ExecutionContext,
    );
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("console.log('atlas');");
    expect(asset.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(asset.headers.get("etag")).toBe("\"asset-etag\"");
    expect(asset.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expectClickjackingHeaders(asset);

    const head = await worker.fetch!(
      new Request("https://atlas.example/assets/index.js", { method: "HEAD" }),
      assetEnv,
      {} as ExecutionContext,
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(head.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
    expect(head.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(head.headers.get("etag")).toBe("\"asset-etag\"");
    expectClickjackingHeaders(head);

    const missingAsset = await worker.fetch!(
      new Request("https://atlas.example/assets/missing.js"),
      assetEnv,
      {} as ExecutionContext,
    );
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.statusText).toBe("Not Found");
    expect(await missingAsset.text()).toBe("missing asset");
    expect(missingAsset.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(missingAsset.headers.get("cache-control")).toBe("public, max-age=60");
    expect(missingAsset.headers.get("etag")).toBe("\"missing-etag\"");
    expectClickjackingHeaders(missingAsset);

    const socialAsset = await worker.fetch!(
      new Request("https://atlas.example/atlas-social.svg"),
      assetEnv,
      {} as ExecutionContext,
    );
    expect(socialAsset.status).toBe(200);
    expect(socialAsset.headers.get("content-type")).toBe("image/svg+xml");
    expect(socialAsset.headers.get("x-content-type-options")).toBe("nosniff");
    expect(socialAsset.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expectClickjackingHeaders(socialAsset);

    const nonAssetMiss = await worker.fetch!(
      new Request("https://atlas.example/not-an-asset"),
      assetEnv,
      {} as ExecutionContext,
    );
    expect(nonAssetMiss.status).toBe(404);
    expect(nonAssetMiss.headers.get("content-type")).toContain("text/markdown");
    expect(await nonAssetMiss.text()).toContain("[Documentation](https://atlas.example/docs)");
    expect(assetRequests).toEqual([
      { method: "GET", pathname: "/assets/index.js" },
      { method: "HEAD", pathname: "/assets/index.js" },
      { method: "GET", pathname: "/assets/missing.js" },
      { method: "GET", pathname: "/atlas-social.svg" },
    ]);
  });

  it("applies one clickjacking policy to API and protocol errors while gating HSTS to production HTTPS", async () => {
    const apiError = await get("/api/stories?metric=unsupported");
    expect(apiError.status).toBe(400);
    expectClickjackingHeaders(apiError);
    expect(apiError.headers.get("strict-transport-security")).toBe(null);

    const protocolError = await worker.fetch!(
      new Request("https://atlas.example/a2a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "bad-method", method: "DeleteEverything", params: {} }),
      }),
      { ...env, ENVIRONMENT: "production" },
      {} as ExecutionContext,
    );
    expect(protocolError.status).toBe(200);
    expect(await protocolError.json()).toMatchObject({ error: { code: -32601 } });
    expectClickjackingHeaders(protocolError);
    expect(protocolError.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
  });

  it("returns a typed stories envelope", async () => {
    const response = await get("/api/stories");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("stale-while-revalidate");
    const body = await response.json() as { data: { count: number; stories: typeof store.stories } };
    expect(body.data.count).toBe(1);
    expect(body.data.stories[0]?.cluster_id).toBe(story.cluster_id);
    expectPublicOutletCountContract(body);
  });

  it("serves the Lane A/UI intelligence snapshot contract without an envelope", async () => {
    const response = await get("/api/v1/intelligence?window=24h&prominence=normalized");
    expect(response.status).toBe(200);
    const snapshot = await response.json() as {
      clusters: Array<{ sources: Array<Record<string, unknown>> }>;
    };
    expect(snapshot).toMatchObject({
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
        coverageHeat: { status: "unavailable", basis: "editorial_market", markets: [] },
        signals: {
          conflict: { status: "not_assessed" },
          omission: { status: "not_assessed" },
        },
        sources: [{
          publisher: "Fixture Wire",
          claimPosition: "reports",
          publisherOrigin: { status: "observed", value: { regionCode: "ZZ" } },
          editorialMarket: { status: "unknown", value: null },
          framing: { status: "unknown", value: null },
          tone: { status: "unknown", value: null },
        }],
      }],
    });
    expect(snapshot.clusters[0]?.sources[0]?.coverageMarkets).toBe(undefined);
    expect(snapshot.clusters[0]?.sources[0]?.audienceExposure).toBe(undefined);
  });

  it("loads every intelligence cluster in bounded store batches", async () => {
    store.stories = Array.from({ length: 101 }, (_, index) => ({
      ...structuredClone(story),
      cluster_id: `test-cluster-${index}`,
      canonical_title: `Test story ${index}`,
    }));

    const response = await get("/api/v1/intelligence?window=24h&prominence=normalized");
    expect(response.status).toBe(200);
    const snapshot = await response.json() as { clusters: Array<{ id: string }> };

    expect(snapshot.clusters.length).toBe(101);
    expect(store.queries).toEqual([
      {
        since: "2026-08-25T12:00:00.000Z",
        until: "2026-08-26T12:00:00.000Z",
        metric: "normalized",
        limit: 100,
      },
      {
        since: "2026-08-25T12:00:00.000Z",
        until: "2026-08-26T12:00:00.000Z",
        metric: "normalized",
        limit: 100,
        offset: 100,
      },
    ]);
  });

  it("builds SAME-STORY editorial-market heat and conflict only from cited cross-network evidence", async () => {
    const compared = structuredClone(story);
    const first = compared.articles[0]!;
    first.same_story.editorialMarket = {
      status: "observed",
      value: { regionCode: "TEST-NA", label: "Test North" },
      confidence: 0.9,
      method: "documented_outlet_market",
      evidence: [{
        kind: "outlet_market_documentation",
        articleId: first.article_id,
        url: first.canonical_url,
        quote: "Fixture outlet-market documentation.",
      }],
      reason: null,
    };
    compared.articles.push({
      ...structuredClone(first),
      article_id: "test-article-1b",
      canonical_url: "https://fixture.example.invalid/test-only/article-1b",
      source_url: "https://fixture.example.invalid/test-only/article-1b",
      same_story: {
        ...structuredClone(first.same_story),
        editorialMarket: {
          status: "observed",
          value: {
            regionCode: "TEST-EU",
            label: "Test Europe",
            coordinates: { latitude: 48.8, longitude: 2.3 },
          },
          confidence: 0.9,
          method: "documented_outlet_market",
          evidence: [{
            kind: "outlet_market_documentation",
            articleId: "test-article-1b",
            url: "https://fixture.example.invalid/test-only/article-1b",
            quote: "Fixture outlet-market documentation.",
          }],
          reason: null,
        },
      },
    });
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
        editorialMarket: {
          status: "observed",
          value: { regionCode: "TEST-EU", label: "Test Europe" },
          confidence: 0.9,
          method: "documented_outlet_market",
          evidence: [{
            kind: "outlet_market_documentation",
            articleId: "test-article-2",
            url: "https://second.example.invalid/test-only/article-2",
            quote: "Fixture outlet-market documentation.",
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
        basis: "editorial_market",
        markets: [
          {
            regionCode: "TEST-EU",
            rawArticleCount: 2,
            uniqueOutletCount: 2,
            sourceNormalizedShare: 0.75,
            coordinates: {
              latitude: 48.8,
              longitude: 2.3,
              confidence: 0.9,
              method: "documented_outlet_market",
            },
          },
          {
            regionCode: "TEST-NA",
            rawArticleCount: 1,
            uniqueOutletCount: 1,
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
        { editorialMarket: { status: "observed", value: { regionCode: "TEST-NA" } }, framing: { status: "observed", value: "supports" } },
        { editorialMarket: { status: "observed", value: { regionCode: "TEST-EU" } }, framing: { status: "unknown" } },
        { editorialMarket: { status: "observed", value: { regionCode: "TEST-EU" } }, framing: { status: "observed", value: "disputes" } },
      ],
    });
  });

  it("does not treat outlet editions under one parent network as independent conflict evidence", async () => {
    const compared = structuredClone(story);
    const first = compared.articles[0]!;
    compared.articles.push({
      ...structuredClone(first),
      article_id: "test-affiliate-article",
      canonical_url: "https://affiliate.fixture.invalid/test-only/article",
      source_url: "https://affiliate.fixture.invalid/test-only/article",
      publisher_name: first.publisher_name,
      publisher_domain: "affiliate.fixture.invalid",
    });
    compared.claims = [
      {
        claim_id: "same-network-support",
        normalized_claim: "the harbor is closed",
        stance: "supports",
        confidence: 0.9,
        evidence_article_id: first.article_id,
        evidence_quote: "The harbor is closed.",
      },
      {
        claim_id: "same-network-dispute",
        normalized_claim: "the harbor is closed",
        stance: "disputes",
        confidence: 0.8,
        evidence_article_id: "test-affiliate-article",
        evidence_quote: "The harbor remains open.",
      },
    ];
    store.stories = [compared];

    const response = await get("/api/v1/intelligence?window=24h&prominence=normalized");
    const body = await response.json() as {
      clusters: Array<{ signals: { conflict: { status: string; reason: string | null } } }>;
    };

    expect(response.status).toBe(200);
    expect(body.clusters[0]?.signals.conflict).toMatchObject({
      status: "not_assessed",
      reason: "Conflict requires evidence-backed claims from at least two independent publisher networks.",
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
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: {
        cluster_id: story.cluster_id,
        unique_outlet_count: 2,
        regional_prominence: [{ unique_outlet_count: 2 }],
      },
    });
    expectPublicOutletCountContract(body);
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

  it("returns recoverable Markdown for an ordinary missing page and typed JSON for an API miss", async () => {
    const response = await get("/definitely-not-a-real-route");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(await response.text()).toContain("[Agent index](https://atlas.example/llms.txt)");

    const apiResponse = await get("/api/v1/definitely-not-a-real-route");
    expect(apiResponse.status).toBe(404);
    expect(await apiResponse.json()).toMatchObject({
      ok: false,
      error: { kind: "not_found", retryable: false },
    });
    expect(await (await get("/api/v1/definitely-not-a-real-route")).json()).toMatchObject({
      error: { details: { docs: "https://atlas.example/docs", llms: "https://atlas.example/llms.txt" } },
    });
  });

  it("gives agent crawlers a recoverable Markdown 404", async () => {
    const response = await worker.fetch!(
      new Request("https://atlas.example/no-such-document", { headers: { "User-Agent": "ora-agent/1.0" } }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(await response.text()).toContain("[Sitemap](https://atlas.example/sitemap.xml)");

    const root = await worker.fetch!(
      new Request("https://atlas.example/", { headers: { Accept: "text/html", "User-Agent": "ChatGPT-User/1.0" } }),
      env,
      {} as ExecutionContext,
    );
    expect(root.status).toBe(200);
    expect(root.headers.get("content-type")).toContain("text/markdown");
    expect(await root.text()).toContain("# Atlas News Intelligence");
  });

  it("serves substantive trust anchors and a distinct machine entry view", async () => {
    for (const path of ["/about", "/contact", "/privacy", "/security"]) {
      const response = await worker.fetch!(
        new Request(`https://atlas.example${path}`, { headers: { Accept: "text/html" } }),
        env,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(200);
      expect((await response.text()).length > 500).toBe(true);
    }
    const agent = await get("/?mode=agent");
    expect(agent.headers.get("content-type")).toContain("text/markdown");
    expect(await agent.text()).toContain("## Call sequence");
  });

  it("enforces and describes a best-effort production Worker-instance read limit", async () => {
    const productionEnv = { ...env, ENVIRONMENT: "production" };
    const makeRequest = () => worker.fetch!(
      new Request("https://atlas.example/health", { headers: { "CF-Connecting-IP": "203.0.113.91" } }),
      productionEnv,
      {} as ExecutionContext,
    );
    const first = await makeRequest();
    expect(first.headers.get("ratelimit-policy")).toContain("q=120;w=60");
    expect(first.headers.get("ratelimit-remaining")).toBe("119");
    for (let index = 1; index < 120; index += 1) await makeRequest();
    const limited = await makeRequest();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(await limited.json()).toMatchObject({ error: { kind: "rate_limited", retryable: true } });
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
      result: {
        isError: false,
        structuredContent: {
          cluster_id: story.cluster_id,
          unique_outlet_count: 2,
          regional_prominence: [{ unique_outlet_count: 2 }],
        },
      },
    });
    expectPublicOutletCountContract(response);
  });

  it("enforces declared MCP schemas and normalizes query timestamps", async () => {
    const invalid = await rpc({
      jsonrpc: "2.0",
      id: "invalid-args",
      method: "tools/call",
      params: { name: "atlas.query_dominant_stories", arguments: { region: "us", surprise: true } },
    });
    expect(invalid).toMatchObject({ error: { code: -32602, message: "query arguments does not allow property surprise" } });

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
    expect(response).toMatchObject({ error: { code: -32602, message: "since must be an RFC 3339 date-time" } });
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

  async function sendRpc(
    body: unknown,
    contentType = "application/json",
    version = "1.0",
  ): Promise<Response> {
    return worker.fetch!(
      new Request("https://atlas.example/a2a", {
        method: "POST",
        headers: { "Content-Type": contentType, "A2A-Version": version },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      env,
      {} as ExecutionContext,
    );
  }

  function rpcMessage(part: Record<string, unknown>): Record<string, unknown> {
    return {
      jsonrpc: "2.0",
      id: "runtype-check",
      method: "SendMessage",
      params: {
        message: {
          messageId: "runtype-message",
          contextId: "runtype-context",
          role: "ROLE_USER",
          parts: [part],
        },
      },
    };
  }

  function legacyRpcMessage(part: Record<string, unknown>): Record<string, unknown> {
    return {
      jsonrpc: "2.0",
      id: "runtype-legacy-check",
      method: "message/send",
      params: {
        message: {
          messageId: "runtype-legacy-message",
          role: "user",
          parts: [part],
        },
      },
    };
  }

  it("preserves Agent Card discovery on GET /a2a", async () => {
    const response = await worker.fetch!(
      new Request("https://atlas.example/a2a"),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      supportedInterfaces: [
        { url: "https://atlas.example/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" },
        { url: "https://atlas.example/a2a", protocolBinding: "HTTP+JSON", protocolVersion: "1.0" },
      ],
    });
  });

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

  it("accepts A2A v1 JSON-RPC SendMessage at the Agent Card interface URL", async () => {
    const response = await sendRpc(rpcMessage({
      data: { operation: "pipeline_health" },
      mediaType: "application/json; charset=utf-8",
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("a2a-version")).toBe("1.0");
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: "runtype-check",
      result: {
        message: {
          messageId: "request-a2a:response",
          contextId: "runtype-context",
          role: "ROLE_AGENT",
          parts: [{ data: { operation: "pipeline_health", health: { status: "ok" } } }],
        },
      },
    });
  });

  it("accepts the Runtype chat payload only as strict JSON text and dispatches the same read-only schema", async () => {
    const response = await sendRpc(rpcMessage({
      text: JSON.stringify({ operation: "query_stories", region: "test-eu", metric: "raw", limit: 7 }),
      mediaType: "application/json",
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      result: {
        message: {
          parts: [{ data: { operation: "query_stories", count: 1, stories: [{ unique_outlet_count: 2 }] } }],
        },
      },
    });
    expectPublicOutletCountContract(body);
    expect(store.queries).toEqual([{ region: "TEST-EU", metric: "raw", limit: 7 }]);
  });

  it("adapts the exact official v0.3 message/send wire shape", async () => {
    const response = await sendRpc(legacyRpcMessage({
      kind: "text",
      text: JSON.stringify({ operation: "pipeline_health" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: "runtype-legacy-check",
      result: {
        kind: "message",
        messageId: "request-a2a:response",
        role: "agent",
        parts: [{ kind: "data", data: { operation: "pipeline_health", health: { status: "ok" } } }],
      },
    });

    const dataPart = await sendRpc(legacyRpcMessage({
      kind: "data",
      data: { operation: "pipeline_health" },
    }));
    expect(dataPart.status).toBe(200);
  });

  it("isolates legacy roles and parts from v1 and rejects free-form text on both methods", async () => {
    const v1WithLegacyRole = rpcMessage({ data: { operation: "pipeline_health" } });
    const v1Params = v1WithLegacyRole.params as { message: Record<string, unknown> };
    v1Params.message.role = "user";
    expect(await (await sendRpc(v1WithLegacyRole)).json()).toMatchObject({ error: { code: -32602 } });

    const legacyWithV1Role = legacyRpcMessage({ kind: "data", data: { operation: "pipeline_health" } });
    const legacyParams = legacyWithV1Role.params as { message: Record<string, unknown> };
    legacyParams.message.role = "ROLE_USER";
    expect(await (await sendRpc(legacyWithV1Role)).json()).toMatchObject({ error: { code: -32602 } });

    const mismatchedPart = await sendRpc(legacyRpcMessage({
      kind: "text",
      data: { operation: "pipeline_health" },
    }));
    expect(await mismatchedPart.json()).toMatchObject({ error: { code: -32602 } });

    const legacyFreeForm = await sendRpc(legacyRpcMessage({ kind: "text", text: "please check pipeline health" }));
    const legacyFreeFormBody = await legacyFreeForm.json();
    expect(legacyFreeFormBody).toMatchObject({ error: { code: -32602, message: "Invalid parameters" } });
    expect(JSON.stringify(legacyFreeFormBody).includes("stack")).toBe(false);
  });

  it("returns typed JSON-RPC errors for malformed requests, unknown methods, and non-JSON chat text", async () => {
    const malformed = await sendRpc("{");
    expect(await malformed.json()).toMatchObject({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Invalid JSON payload" },
    });

    const invalid = await sendRpc(null);
    expect(await invalid.json()).toMatchObject({ error: { code: -32600 } });

    const unknownMethod = await sendRpc({ jsonrpc: "2.0", id: 2, method: "DeleteEverything", params: {} });
    expect(await unknownMethod.json()).toMatchObject({ id: 2, error: { code: -32601, message: "Method not found" } });

    const unknownOperation = await sendRpc(rpcMessage({ data: { operation: "spend_money" } }));
    expect(await unknownOperation.json()).toMatchObject({ error: { code: -32602, message: "Invalid parameters" } });

    const freeForm = await sendRpc(rpcMessage({ text: "please check pipeline health", mediaType: "text/plain" }));
    const freeFormBody = await freeForm.json();
    expect(freeFormBody).toMatchObject({ error: { code: -32602, message: "Invalid parameters" } });
    expect(JSON.stringify(freeFormBody).includes("stack")).toBe(false);
    expect(store.queries).toEqual([]);
  });

  it("enforces JSON-RPC and part media types with A2A error codes", async () => {
    const wrongTransport = await sendRpc(
      rpcMessage({ data: { operation: "pipeline_health" } }),
      "application/a2a+json",
    );
    expect(await wrongTransport.json()).toMatchObject({ error: { code: -32005, message: "Content type not supported" } });

    const wrongPart = await sendRpc(rpcMessage({
      data: { operation: "pipeline_health" },
      mediaType: "image/png",
    }));
    expect(await wrongPart.json()).toMatchObject({ error: { code: -32005, message: "Content type not supported" } });

    const wrongVersion = await sendRpc(
      rpcMessage({ data: { operation: "pipeline_health" } }),
      "application/json",
      "0.3",
    );
    expect(await wrongVersion.json()).toMatchObject({ error: { code: -32009, message: "Protocol version not supported" } });
  });

  it("returns current story summaries through a real read-only skill", async () => {
    const response = await send({ operation: "query_stories", region: "test-eu", metric: "normalized", limit: 7 });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/a2a+json");
    const body = await response.json();
    expect(body).toMatchObject({
      message: {
        messageId: "request-a2a:response",
        role: "ROLE_AGENT",
        parts: [{
          data: {
            operation: "query_stories",
            count: 1,
            query: { region: "TEST-EU", limit: 7 },
            stories: [{ unique_outlet_count: 2 }],
          },
        }],
      },
    });
    expectPublicOutletCountContract(body);
  });

  it("explains a cluster and reports pipeline health", async () => {
    const detail = await send({ operation: "explain_story", cluster_id: story.cluster_id });
    const detailBody = await detail.json();
    expect(detailBody).toMatchObject({
      message: {
        parts: [{
          data: {
            story: {
              cluster_id: story.cluster_id,
              unique_outlet_count: 2,
              regional_prominence: [{ unique_outlet_count: 2 }],
            },
          },
        }],
      },
    });
    expectPublicOutletCountContract(detailBody);
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

describe("Discovery output sanitization", () => {
  it("escapes HTML metacharacters for text and double-quoted attribute contexts", () => {
    expect(escapeHtml(`<a href="x">O'Reilly & "co"</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;O&#39;Reilly &amp; &quot;co&quot;&lt;/a&gt;",
    );
    expect(escapeHtml("plain text")).toBe("plain text");
  });

  it("strips backticks, quotes, angle brackets, and control characters from reflected paths", () => {
    expect(sanitizePathForMarkdown("/never/`code`/injected")).toBe("/never/code/injected");
    expect(sanitizePathForMarkdown("/a\x00b\x1fc\x7fd")).toBe("/abcd");
    expect(sanitizePathForMarkdown("/has<angle>and-quote-ones")).toBe("/hasangleand-quote-ones");
    expect(sanitizePathForMarkdown("x".repeat(300)).length).toBe(200);
  });

  it("reflects a sanitized path in the 404 markdown so backticks cannot close the code span", async () => {
    const response = notFoundMarkdown("https://atlas.example", "/never/`code`/injected");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    const body = await response.text();
    expect(body).toContain("`/never/code/injected`");
    // The unescaped "`code`" code-span fragment must not survive in the body.
    expect(body.split("`code`").length).toBe(1);
  });

  it("serves the escaped HTML trust document for /security", async () => {
    const worker = createWorker({ store: new MemoryTruthStore(), clock: () => now, requestId: () => "request-test" });
    const response = await worker.fetch!(
      new Request("https://atlas.example/security", { headers: { Accept: "text/html" } }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    // Escaped canonical link uses the request origin without unescaped quotes.
    expect(body).toContain('href="https://atlas.example/security"');
    expect(body).toContain('href="https://atlas.example/security.md"');
    // The page must remain a single <html> root with no raw injected markup.
    expect(body.match(/<html/g)?.length).toBe(1);
    expect(body.match(/<\/html>/g)?.length).toBe(1);
  });
});
