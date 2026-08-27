import { json } from "./http";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300",
  "X-Content-Type-Options": "nosniff",
};

function text(body: string, contentType: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", contentType);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(body, { ...init, headers });
}

function apiLinks(): string {
  return [
    "</.well-known/api-catalog>; rel=\"api-catalog\"",
    "</openapi.json>; rel=\"service-desc\"; type=\"application/vnd.oai.openapi+json;version=3.1\"",
    "</docs>; rel=\"service-doc\"",
    "</.well-known/mcp/server-card.json>; rel=\"describedby\"; type=\"application/json\"",
    "</.well-known/agent-card.json>; rel=\"describedby\"; type=\"application/json\"",
  ].join(", ");
}

function mediaQuality(accept: string, mediaType: string): number {
  if (accept.trim() === "") return 1;
  const [targetType] = mediaType.split("/");
  let bestSpecificity = -1;
  let bestQuality = 0;
  for (const entry of accept.split(",")) {
    const [rawType, ...parameters] = entry.trim().split(";");
    const candidate = rawType?.toLowerCase();
    const specificity = candidate === mediaType ? 2 : candidate === `${targetType}/*` ? 1 : candidate === "*/*" ? 0 : -1;
    if (specificity < 0 || specificity < bestSpecificity) continue;
    const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith("q="));
    const parsed = qualityParameter === undefined ? 1 : Number(qualityParameter.trim().slice(2));
    const quality = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
    if (specificity > bestSpecificity || quality > bestQuality) {
      bestSpecificity = specificity;
      bestQuality = quality;
    }
  }
  return bestQuality;
}

function documentationRepresentation(request: Request): "markdown" | "html" | null {
  if (new URL(request.url).pathname.endsWith(".md")) return "markdown";
  const accept = request.headers.get("Accept") ?? "";
  const markdown = mediaQuality(accept, "text/markdown");
  const html = mediaQuality(accept, "text/html");
  if (markdown === 0 && html === 0) return null;
  return markdown > html ? "markdown" : "html";
}

function notAcceptable(): Response {
  return text(JSON.stringify({
    type: "about:blank",
    title: "Not Acceptable",
    status: 406,
    detail: "This documentation is available as text/html or text/markdown.",
  }), "application/problem+json; charset=utf-8", {
    status: 406,
    headers: { "Cache-Control": "no-store", Vary: "Accept" },
  });
}

export function attachDiscoveryHeaders(response: Response): Response {
  response.headers.set("Link", apiLinks());
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export function robots(origin: string): Response {
  return text(
    [
      "User-agent: *",
      "Allow: /",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n"),
    "text/plain; charset=utf-8",
    { headers: CACHE_HEADERS },
  );
}

export function sitemap(origin: string): Response {
  const paths = ["/", "/docs", "/api", "/integrations"];
  const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n");
  return text(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    "application/xml; charset=utf-8",
    { headers: CACHE_HEADERS },
  );
}

export function documentationMarkdown(origin: string): string {
  return `# Atlas News Intelligence

Atlas is a read-only global news intelligence service over current, evidence-backed records. It maps event locations, keeps publisher origin and audience-region evidence separate, clusters reports about the same event, and exposes raw plus source-normalized prominence.

## Public browser

- [Interactive explorer](${origin}/)
- Default window: rolling 24 hours
- No product stub data: unavailable current evidence produces an explicit degraded or unavailable state

## Public REST API

- [Service index](${origin}/api)
- [OpenAPI 3.1 description](${origin}/openapi.json)
- [Health](${origin}/health)
- [Intelligence snapshot](${origin}/api/v1/intelligence?window=24h&prominence=normalized)
- [Story list](${origin}/api/stories?metric=normalized&limit=20)
- Story detail: \`${origin}/api/stories/{cluster_id}\`

The public read API requires no authentication. Atlas does not publish mutation, account, payment, or credential-management operations.

## MCP

- Endpoint: \`${origin}/mcp\`
- [Server card](${origin}/.well-known/mcp/server-card.json)
- Read-only tools: \`atlas.query_dominant_stories\`, \`atlas.explain_story_cluster\`, and \`atlas.pipeline_health\`

## A2A

- [Agent Card](${origin}/.well-known/agent-card.json)
- HTTP+JSON base: \`${origin}/a2a\`
- Send a structured read request to \`${origin}/a2a/message:send\` as a \`data\` part.
- Supported operations: \`query_stories\`, \`explain_story\`, and \`pipeline_health\`.

## Truth and security boundaries

- Event location is never inferred from publisher headquarters.
- Audience-region coverage is shown only when explicit evidence exists.
- Every story member retains a source URL and cluster-membership evidence.
- Unknown or stale data remains visible; it is never replaced with fabricated news.
- Machine-readable surfaces describe only deployed public read capabilities.
`;
}

function documentationHtml(origin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Atlas News Intelligence — API documentation</title>
  <meta name="description" content="Read-only, evidence-backed global news intelligence API, MCP, and A2A documentation.">
  <link rel="canonical" href="${origin}/docs">
</head>
<body>
  <main>
    <h1>Atlas News Intelligence</h1>
    <p>Atlas is a read-only global news intelligence service over current, evidence-backed records. It clusters reports about the same event and compares regional coverage only when that coverage is evidenced. Event location, publisher origin, and audience-region evidence remain separate.</p>
    <nav aria-label="Documentation">
      <ul>
        <li><a href="/">Interactive explorer</a></li>
        <li><a href="/api">Public API</a></li>
        <li><a href="/openapi.json">OpenAPI 3.1</a></li>
        <li><a href="/.well-known/api-catalog">API catalog</a></li>
        <li><a href="/.well-known/mcp/server-card.json">MCP server card</a></li>
        <li><a href="/.well-known/agent-card.json">A2A Agent Card</a></li>
        <li><a href="/health">Pipeline health</a></li>
        <li><a href="/integrations">Integration provenance</a></li>
      </ul>
    </nav>
    <h2>REST reads</h2>
    <p><code>GET /api/v1/intelligence?window=24h&amp;prominence=normalized</code></p>
    <p><code>GET /api/stories?metric=normalized&amp;limit=20</code></p>
    <p><code>GET /api/stories/{cluster_id}</code></p>
    <h2>MCP</h2>
    <p>POST JSON-RPC requests to <code>/mcp</code>. Tools are read-only and share the same truth store as the browser and REST API.</p>
    <h2>A2A</h2>
    <p>POST an A2A HTTP+JSON <code>SendMessageRequest</code> to <code>/a2a/message:send</code>. The message must contain a structured <code>data</code> part naming one supported read operation.</p>
    <h2>Authentication and effects</h2>
    <p>No authentication is required for these public reads. Atlas exposes no public mutation, account, payment, or credential-management operation.</p>
  </main>
</body>
</html>`;
}

export function docs(request: Request): Response {
  const origin = new URL(request.url).origin;
  const representation = documentationRepresentation(request);
  if (representation === null) return attachDiscoveryHeaders(notAcceptable());
  if (representation === "markdown") {
    return attachDiscoveryHeaders(text(documentationMarkdown(origin), "text/markdown; charset=utf-8", { headers: CACHE_HEADERS }));
  }
  return attachDiscoveryHeaders(text(documentationHtml(origin), "text/html; charset=utf-8", { headers: CACHE_HEADERS }));
}

export function llms(origin: string): Response {
  const body = `# Atlas News Intelligence\n\n> Evidence-backed global news intelligence over real current records.\n\n## Start here\n\n- [Product and machine documentation](${origin}/docs)\n- [OpenAPI 3.1](${origin}/openapi.json)\n- [API catalog](${origin}/.well-known/api-catalog)\n- [MCP server card](${origin}/.well-known/mcp/server-card.json)\n- [A2A Agent Card](${origin}/.well-known/agent-card.json)\n- [Pipeline health](${origin}/health)\n\n## Canonical facts\n\n- Public reads require no authentication.\n- The service exposes no public writes or payments.\n- Event location, publisher origin, and audience-region evidence are distinct.\n- Empty, stale, or failed upstream data is reported explicitly; no demo records substitute for it.\n`;
  return attachDiscoveryHeaders(text(body, "text/plain; charset=utf-8", { headers: CACHE_HEADERS }));
}

export function integrations(request: Request): Response {
  const origin = new URL(request.url).origin;
  const markdown = `# Atlas integration provenance

Atlas uses GDELT as the public current-news backbone and MapLibre for browser mapping. Tavily may enrich retrieval only when the existing configured access is used. Cotal receipts preserve agent coordination provenance; Nebius is used only through existing Cotal platform access. Tenki supplies existing hosted sandboxes. Runtype is the intended product-surface and evaluation plane. Mitosis may preserve workflow provenance where a live receipt exists.

Sponsor presence is never inferred from configuration alone. A provider counts as used only when a sanitized live receipt records the capability, status, timestamp, and—when exposed by that provider—before/after usage. A missing receipt means “not evidenced,” not “used.” AIsa and HUD are excluded.

- [Pipeline health and latest receipt](${origin}/health)
- [API documentation](${origin}/docs)
`;
  const representation = documentationRepresentation(request);
  if (representation === null) return attachDiscoveryHeaders(notAcceptable());
  if (representation === "markdown") {
    return attachDiscoveryHeaders(text(markdown, "text/markdown; charset=utf-8", { headers: CACHE_HEADERS }));
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas integration provenance</title><link rel="canonical" href="${origin}/integrations"></head><body><main><h1>Atlas integration provenance</h1><p>Atlas uses GDELT as its current-news backbone and MapLibre for mapping. Optional sponsor services count as used only when a sanitized live receipt exists; configuration alone is not usage.</p><p>Cotal receipts preserve coordination provenance. Nebius is used only through Cotal. Tavily, Tenki, Runtype, and Mitosis are reported only from real invocations. AIsa and HUD are excluded.</p><ul><li><a href="/health">Pipeline health and latest receipt</a></li><li><a href="/docs">API documentation</a></li></ul></main></body></html>`;
  return attachDiscoveryHeaders(text(html, "text/html; charset=utf-8", { headers: CACHE_HEADERS }));
}

export function apiCatalog(origin: string, head = false): Response {
  const href = `${origin}/.well-known/api-catalog`;
  const body = {
    linkset: [
      {
        anchor: href,
        item: [
          { href: `${origin}/api` },
          { href: `${origin}/mcp` },
          { href: `${origin}/a2a` },
        ],
      },
      {
        anchor: `${origin}/api`,
        "service-desc": [{ href: `${origin}/openapi.json`, type: "application/vnd.oai.openapi+json;version=3.1" }],
        "service-doc": [{ href: `${origin}/docs`, type: "text/html" }],
        status: [{ href: `${origin}/health`, type: "application/json" }],
      },
      {
        anchor: `${origin}/mcp`,
        "service-desc": [{ href: `${origin}/.well-known/mcp/server-card.json`, type: "application/json" }],
        "service-doc": [{ href: `${origin}/docs`, type: "text/html" }],
      },
      {
        anchor: `${origin}/a2a`,
        "service-desc": [{ href: `${origin}/.well-known/agent-card.json`, type: "application/json" }],
        "service-doc": [{ href: `${origin}/docs`, type: "text/html" }],
      },
    ],
  };
  const headers = new Headers(CACHE_HEADERS);
  headers.set("Content-Type", "application/linkset+json; profile=\"https://www.rfc-editor.org/info/rfc9727\"");
  headers.set("Link", `<${href}>; rel=\"api-catalog\"`);
  return new Response(head ? null : JSON.stringify(body), { status: 200, headers });
}

export function openApi(origin: string): Response {
  const response = json({
    openapi: "3.1.0",
    info: {
      title: "Atlas News Intelligence API",
      version: "0.1.0",
      description: "Read-only, evidence-backed global news intelligence. No authentication is required for public reads.",
    },
    servers: [{ url: origin }],
    paths: {
      "/health": { get: { operationId: "getPipelineHealth", summary: "Inspect source freshness and failures", responses: { "200": { description: "Healthy or degraded status" }, "503": { description: "No current data is available" } } } },
      "/api/v1/intelligence": { get: { operationId: "getIntelligenceSnapshot", summary: "Get the browser intelligence snapshot", parameters: [
        { name: "window", in: "query", schema: { type: "string", enum: ["6h", "24h", "7d"], default: "24h" } },
        { name: "prominence", in: "query", schema: { type: "string", enum: ["raw", "normalized"], default: "normalized" } },
      ], responses: { "200": { description: "Current intelligence snapshot" }, "400": { description: "Invalid filter" }, "503": { description: "No current evidence-backed intelligence" } } } },
      "/api/stories": { get: { operationId: "listStories", summary: "List current story clusters", parameters: [
        { name: "region", in: "query", schema: { type: "string" } },
        { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "until", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "metric", in: "query", schema: { type: "string", enum: ["raw", "normalized"], default: "normalized" } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
      ], responses: { "200": { description: "Typed story-list envelope" }, "400": { description: "Invalid filter" } } } },
      "/api/stories/{cluster_id}": { get: { operationId: "getStory", summary: "Explain one story cluster with sources and evidence", parameters: [
        { name: "cluster_id", in: "path", required: true, schema: { type: "string", maxLength: 200 } },
      ], responses: { "200": { description: "Typed story-detail envelope" }, "404": { description: "Unknown cluster" } } } },
    },
  }, { headers: CACHE_HEADERS });
  response.headers.set("Content-Type", "application/vnd.oai.openapi+json;version=3.1; charset=utf-8");
  response.headers.set("Link", apiLinks());
  return response;
}

export function mcpServerCard(origin: string): Response {
  return json({
    $schema: "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    version: "1.0",
    protocolVersion: "2026-07-28",
    serverInfo: { name: "atlas-news-intelligence", title: "Atlas News Intelligence", version: "0.1.0" },
    description: "Read-only tools for current, evidence-backed global news intelligence.",
    documentationUrl: `${origin}/docs`,
    transport: { type: "streamable-http", endpoint: `${origin}/mcp` },
    capabilities: { tools: { listChanged: false } },
  }, { headers: CACHE_HEADERS });
}

export function a2aAgentCard(origin: string): Response {
  return json({
    name: "Atlas News Intelligence",
    description: "Read-only agent access to current story clusters, source evidence, event locations, regional prominence, and pipeline health.",
    supportedInterfaces: [{ url: `${origin}/a2a`, protocolBinding: "HTTP+JSON", protocolVersion: "1.0" }],
    provider: { organization: "Atlas News Intelligence", url: origin },
    version: "0.1.0",
    documentationUrl: `${origin}/docs`,
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "query-stories",
        name: "Query Current Stories",
        description: "Lists current evidence-backed story clusters by optional region, time bounds, prominence metric, and limit.",
        tags: ["news", "geography", "prominence", "sources"],
        examples: ['{"operation":"query_stories","region":"US","metric":"normalized","limit":20}'],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "explain-story",
        name: "Explain Story Cluster",
        description: "Returns one cluster with articles, evidence-backed event locations, claims, and regional prominence.",
        tags: ["news", "evidence", "cluster", "coverage"],
        examples: ['{"operation":"explain_story","cluster_id":"cluster-id"}'],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "pipeline-health",
        name: "Inspect Pipeline Health",
        description: "Returns freshness, current source watermark, failures, and retryability without invoking an external provider.",
        tags: ["health", "freshness", "provenance"],
        examples: ['{"operation":"pipeline_health"}'],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
  }, { headers: CACHE_HEADERS });
}
