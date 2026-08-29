import { json } from "./http";
import { mcpTools } from "./mcp";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300",
  "X-Content-Type-Options": "nosniff",
};

const RELEASE_LAST_MODIFIED = "2026-08-27";

const agentSkills = [
  {
    name: "query-current-stories",
    description: "Use Atlas to list current evidence-backed story clusters by time, event region, and prominence metric.",
    body: `---
name: query-current-stories
description: Use Atlas to list current evidence-backed story clusters by time, event region, and prominence metric.
version: "1.0"
---

# Query current stories

## When to use

Use this skill when a user needs a current, cited map or ranked list of real story clusters. Do not use it to infer audience exposure or public opinion.

## Procedure

1. Read \`/health\`; stop or disclose degradation when the source watermark is stale or unavailable.
2. Call \`GET /api/v1/stories?metric=normalized&limit=20\` or the MCP tool \`atlas.query_dominant_stories\`.
3. Treat \`primary_region_code\` as event geography only. It is not an outlet editorial market.
4. Preserve cluster confidence, timestamps, and source links. Do not invent missing claims or locations.

All Atlas operations described here are public and read-only.`,
  },
  {
    name: "compare-story-coverage",
    description: "Use Atlas to compare how one evidence-backed story cluster appears across primary editorial markets and outlets.",
    body: `---
name: compare-story-coverage
description: Use Atlas to compare how one evidence-backed story cluster appears across primary editorial markets and outlets.
version: "1.0"
---

# Compare same-story coverage

## When to use

Use this skill after selecting a real Atlas cluster when the user wants to compare sources, editorial-market coverage, prominence, claims, framing, or tone for the same event.

## Procedure

1. Fetch \`GET /api/v1/stories/{cluster_id}\` or call \`atlas.explain_story_cluster\`.
2. Cite each article by its retained source URL.
3. Use only \`same_story.editorialMarket\` for coverage-market comparisons. Never substitute event location, publisher origin, language alone, or reader location.
4. Report observed confidence and evidence. Preserve \`unknown\` assessments instead of filling gaps.
5. Describe contradiction, omission, framing, or tone only when the returned evidence supports it.

Atlas exposes no public write or account operation.`,
  },
  {
    name: "inspect-pipeline-health",
    description: "Use Atlas pipeline health to verify freshness and explain degraded or unavailable current-news results.",
    body: `---
name: inspect-pipeline-health
description: Use Atlas pipeline health to verify freshness and explain degraded or unavailable current-news results.
version: "1.0"
---

# Inspect pipeline health

## When to use

Use this skill before making freshness-sensitive claims or when an Atlas result is empty, stale, degraded, or unavailable.

## Procedure

1. Call \`GET /health\` or the MCP tool \`atlas.pipeline_health\`.
2. Read the status, source watermark, freshness age, latest run, failure count, and explicit reasons.
3. Treat degraded and unavailable states as product evidence, not permission to substitute fixtures or older demo content.
4. State the observed timestamp and retryability when reporting a failure.

This check reads the same production truth store as the browser, REST, MCP, and A2A surfaces.`,
  },
] as const;

function text(body: string, contentType: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", contentType);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(body, { ...init, headers });
}

/**
 * Escape a string for an HTML text or double-quoted attribute context. The
 * discovery HTML pages interpolate the request origin, canonical path, and
 * fixed trust-document fields; escaping them is defense-in-depth so a future
 * change to the source of any interpolated value cannot introduce an XSS by
 * breaking out of an attribute or injecting markup.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

/**
 * Prepare a request pathname for reflection into a single-backtick markdown
 * code span on the 404 page. Backticks would close the span early and angle
 * brackets/quotes could confuse lenient markdown renderers; control
 * characters are stripped too. Length is capped so a pathological path
 * cannot dominate the 404 body. The WHATWG URL parser already percent-encodes
 * most of these characters in `pathname`; this sanitizer is defense-in-depth
 * in case the input source ever changes.
 */
export function sanitizePathForMarkdown(path: string): string {
  return path.replace(/[`<>"'\x00-\x1f\x7f]/g, "").slice(0, 200);
}

function apiLinks(): string {
  return [
    "</.well-known/api-catalog>; rel=\"api-catalog\"",
    "</.well-known/ard.json>; rel=\"ai-catalog\"; type=\"application/ai-catalog+json\"",
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

export function documentationRepresentation(request: Request): "markdown" | "html" | null {
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

export function attachDiscoveryHeaders(response: Response, markdownPath?: string): Response {
  response.headers.set("Link", [
    apiLinks(),
    ...(markdownPath === undefined ? [] : [`<${markdownPath}>; rel="alternate"; type="text/markdown"`]),
  ].join(", "));
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export function robots(origin: string): Response {
  return text(
    [
      "User-agent: *",
      "Content-Signal: search=yes, ai-train=no, ai-input=yes",
      "Allow: /",
      `Sitemap: ${origin}/sitemap.xml`,
      `Agentmap: ${origin}/.well-known/ard.json`,
      "",
    ].join("\n"),
    "text/plain; charset=utf-8",
    { headers: CACHE_HEADERS },
  );
}

export function sitemap(origin: string): Response {
  const paths = ["/", "/docs", "/api", "/integrations", "/about", "/contact", "/privacy", "/security", "/auth.md"];
  const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc><lastmod>${RELEASE_LAST_MODIFIED}</lastmod></url>`).join("\n");
  return text(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    "application/xml; charset=utf-8",
    { headers: CACHE_HEADERS },
  );
}

export function documentationMarkdown(origin: string, canonicalPath = "/docs"): string {
  return `---
title: Atlas News Intelligence
description: Read-only, evidence-backed global news intelligence documentation.
canonical: ${origin}${canonicalPath}
last-updated: ${RELEASE_LAST_MODIFIED}
---

# Atlas News Intelligence

Atlas is a read-only global news intelligence service over current, evidence-backed records. It maps event locations, keeps publisher origin and each outlet's evidence-backed primary editorial market separate, clusters reports about the same event, and exposes raw plus source-normalized prominence.

## Public browser

- [Interactive explorer](${origin}/)
- Default window: rolling 24 hours
- No product stub data: unavailable current evidence produces an explicit degraded or unavailable state

## Public REST API

- [Service index](${origin}/api)
- [OpenAPI 3.1 description](${origin}/openapi.json)
- [Public access and authentication statement](${origin}/auth.md)
- [Versioning and deprecation policy](${origin}/api/versioning)
- [Health](${origin}/health)
- [Intelligence snapshot](${origin}/api/v1/intelligence?window=24h&prominence=normalized)
- [Story list](${origin}/api/v1/stories?metric=normalized&limit=20)
- Story detail: \`${origin}/api/v1/stories/{cluster_id}\`

The public read API requires no authentication. Atlas does not publish mutation, account, payment, or credential-management operations.

## MCP

- Endpoint: \`${origin}/mcp\`
- [Server card](${origin}/.well-known/mcp/server-card.json)
- Read-only tools: \`atlas.query_dominant_stories\`, \`atlas.explain_story_cluster\`, and \`atlas.pipeline_health\`.

## A2A

- [Agent Card](${origin}/.well-known/agent-card.json)
- JSON-RPC 2.0 endpoint: \`${origin}/a2a\` using the A2A v1 \`SendMessage\` method.
- Legacy compatibility: \`message/send\` accepts the official v0.3 lowercase \`user\` role and one \`{kind:"text",text}\` or \`{kind:"data",data}\` part. It returns a direct v0.3 \`kind:"message"\` result with lowercase \`agent\` role.
- HTTP+JSON compatibility: \`${origin}/a2a/message:send\`.
- Text parts on either JSON-RPC method must contain strict JSON for one supported read operation; free-form text is rejected.
- Supported operations: \`query_stories\`, \`explain_story\`, and \`pipeline_health\`.

## Truth and security boundaries

- Event location is never inferred from publisher headquarters.
- Each observed editorial market is one evidence-backed primary outlet market; unknown assignments remain explicit.
- Event location and publisher origin never substitute for editorial market.
- Every story member retains a source URL and cluster-membership evidence.
- Unknown or stale data remains visible; it is never replaced with fabricated news.
- Machine-readable surfaces describe only deployed public read capabilities.
- Responses advertise a best-effort per-Worker-instance public-read limit. A 429 includes \`Retry-After\`; clients should honor it.
`;
}

function documentationHtml(origin: string): string {
  const o = escapeHtml(origin);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Atlas News Intelligence — API documentation</title>
  <meta name="description" content="Read-only, evidence-backed global news intelligence API, MCP, and A2A documentation.">
  <link rel="canonical" href="${o}/docs">
  <link rel="alternate" type="text/markdown" href="${o}/docs.md">
</head>
<body>
  <main>
    <h1>Atlas News Intelligence</h1>
    <p>Atlas is a read-only global news intelligence service over current, evidence-backed records. It clusters reports about the same event and compares primary editorial markets only when that assignment is evidenced. Event location, publisher origin, and primary editorial market remain separate.</p>
    <nav aria-label="Documentation">
      <ul>
        <li><a href="/">Interactive explorer</a></li>
        <li><a href="/api">Public API</a></li>
        <li><a href="/openapi.json">OpenAPI 3.1</a></li>
        <li><a href="/.well-known/api-catalog">API catalog</a></li>
        <li><a href="/.well-known/ard.json">Agent resource catalog</a></li>
        <li><a href="/.well-known/agent-skills/index.json">Agent Skills index</a></li>
        <li><a href="/.well-known/mcp/server-card.json">MCP server card</a></li>
        <li><a href="/.well-known/agent-card.json">A2A Agent Card</a></li>
        <li><a href="/health">Pipeline health</a></li>
        <li><a href="/integrations">Integration provenance</a></li>
        <li><a href="/auth.md">Public access statement</a></li>
        <li><a href="/security">Security and trust</a></li>
      </ul>
    </nav>
    <h2>REST reads</h2>
    <p><code>GET /api/v1/intelligence?window=24h&amp;prominence=normalized</code></p>
    <p><code>GET /api/v1/stories?metric=normalized&amp;limit=20</code></p>
    <p><code>GET /api/v1/stories/{cluster_id}</code></p>
    <h2>MCP</h2>
    <p>POST JSON-RPC requests to <code>/mcp</code>. Tools are read-only and share the same truth store as the browser and REST API.</p>
    <h2>A2A</h2>
    <p>POST an A2A v1 JSON-RPC <code>SendMessage</code> request to <code>/a2a</code>. Legacy <code>message/send</code> requests use the official v0.3 lowercase <code>user</code> role and one kind-discriminated text or data part; responses are direct v0.3 <code>kind:"message"</code> results with lowercase <code>agent</code> role. The HTTP+JSON compatibility route is <code>/a2a/message:send</code>. Text parts on either JSON-RPC method must contain strict JSON for one supported read operation; free-form text is rejected.</p>
    <h2>Authentication and effects</h2>
    <p>No authentication is required for these public reads. Atlas exposes no public mutation, account, payment, or credential-management operation.</p>
    <h2>Limits and compatibility</h2>
    <p>Public read responses carry standard rate-limit policy and remaining-budget headers when the production edge can identify a request source. A 429 includes <code>Retry-After</code>. REST v1 is the stable integration surface; see the documented versioning policy before relying on an unversioned compatibility route.</p>
  </main>
</body>
</html>`;
}

export function docs(request: Request): Response {
  const url = new URL(request.url);
  const origin = url.origin;
  const isRoot = url.pathname === "/" || url.pathname === "/index.md";
  const markdownPath = isRoot ? "/index.md" : "/docs.md";
  const canonicalPath = isRoot ? "/" : "/docs";
  const representation = documentationRepresentation(request);
  if (representation === null) return attachDiscoveryHeaders(notAcceptable());
  if (representation === "markdown") {
    return attachDiscoveryHeaders(text(documentationMarkdown(origin, canonicalPath), "text/markdown; charset=utf-8", { headers: CACHE_HEADERS }), markdownPath);
  }
  return attachDiscoveryHeaders(text(documentationHtml(origin), "text/html; charset=utf-8", { headers: CACHE_HEADERS }), markdownPath);
}

export function llms(origin: string): Response {
  const body = `# Atlas News Intelligence\n\n> Evidence-backed global news intelligence over real current records.\n\n## Start here\n\n- [Product and machine documentation](${origin}/docs)\n- [OpenAPI 3.1](${origin}/openapi.json)\n- [API catalog](${origin}/.well-known/api-catalog)\n- [Agent resource catalog](${origin}/.well-known/ard.json)\n- [Agent Skills index](${origin}/.well-known/agent-skills/index.json)\n- [MCP server card](${origin}/.well-known/mcp/server-card.json)\n- [A2A Agent Card](${origin}/.well-known/agent-card.json)\n- [Public access statement](${origin}/auth.md)\n- [Security and trust](${origin}/security)\n- [Pipeline health](${origin}/health)\n\n## When to use Atlas\n\nUse Atlas when a user needs current same-story comparisons, cited cross-outlet evidence, event geography, or evidence-backed primary editorial-market coverage. Start with /health, list candidate clusters, and then explain one selected cluster. Do not use Atlas as evidence of audience exposure, readership, public opinion, or a publisher's intent. Preserve every source URL, observed timestamp, confidence, and unknown state.\n\n## Canonical facts\n\n- Public reads require no authentication. Do not send API keys or bearer tokens.\n- The service exposes no public writes, accounts, payments, or credential operations.\n- Event location, publisher origin, and primary editorial market are distinct.\n- Editorial-market heat uses at most one evidence-backed primary assignment per article; unknown assignments stay unknown.\n- Empty, stale, or failed upstream data is reported explicitly; no demo records substitute for it.\n- MCP tools are read-only and retain their published \`atlas.*\` names.\n`;
  return attachDiscoveryHeaders(text(body, "text/plain; charset=utf-8", { headers: CACHE_HEADERS }));
}

export function scopedLlms(origin: string, scope: "api" | "docs"): Response {
  const body = scope === "api"
    ? `# Atlas API context\n\n- [OpenAPI 3.1](${origin}/openapi.json)\n- [REST documentation](${origin}/docs)\n- [Authentication and public access](${origin}/auth.md)\n- [Versioning policy](${origin}/api/versioning)\n- [Pipeline health](${origin}/health)\n\nAtlas REST reads are public and require no credential. All operations are read-only. Honor rate-limit headers and preserve evidence, uncertainty, and timestamps.\n`
    : `# Atlas documentation context\n\n- [Documentation](${origin}/docs)\n- [Agent resource catalog](${origin}/.well-known/ard.json)\n- [Agent Skills index](${origin}/.well-known/agent-skills/index.json)\n- [Security and trust](${origin}/security)\n- [Privacy](${origin}/privacy)\n\nUse Atlas for current, cited same-story and editorial-market comparisons. Never treat event location, publisher origin, or audience location as an editorial market.\n`;
  return attachDiscoveryHeaders(text(body, "text/plain; charset=utf-8", { headers: CACHE_HEADERS }));
}

export function agentMode(origin: string): Response {
  const body = `---
title: Atlas agent view
description: Machine-oriented entry point for Atlas News Intelligence.
canonical: ${origin}/?mode=agent
last-updated: ${RELEASE_LAST_MODIFIED}
---

# Atlas agent view

## Best-fit jobs

- Find current evidence-backed story clusters by event region and time.
- Compare one story across source outlets and their evidenced primary editorial markets.
- Inspect citations, cluster confidence, claims, prominence, and pipeline freshness.

## Call sequence

1. Read [pipeline health](${origin}/health).
2. Query [current stories](${origin}/api/v1/stories?metric=normalized&limit=20).
3. Fetch \`${origin}/api/v1/stories/{cluster_id}\` for a selected cluster.

REST, MCP, and A2A are public and read-only. No authentication, OAuth, account, write, or payment operation exists. Preserve source URLs and unknown assessments; never substitute event location or publisher origin for primary editorial market.

- [OpenAPI](${origin}/openapi.json)
- [MCP server card](${origin}/.well-known/mcp/server-card.json)
- [A2A Agent Card](${origin}/.well-known/agent-card.json)
- [Agent Skills](${origin}/.well-known/agent-skills/index.json)
`;
  return attachDiscoveryHeaders(text(body, "text/markdown; charset=utf-8", { headers: CACHE_HEADERS }));
}

export function authMarkdown(origin: string): Response {
  const body = `---
title: Atlas public access and authentication
description: Truthful access statement for Atlas browser, REST, MCP, and A2A reads.
canonical: ${origin}/auth.md
last-updated: ${RELEASE_LAST_MODIFIED}
---

# Atlas public access and authentication

## Discover

Atlas exposes a public, read-only REST API, MCP server, A2A agent, browser explorer, and documentation. The machine descriptions are linked from [llms.txt](${origin}/llms.txt) and the [agent resource catalog](${origin}/.well-known/ard.json).

## Pick a method

No authentication method is required or supported for the deployed public reads. Do not send an API key, bearer token, cookie, identity assertion, or personal provider credential.

## Register

There is no public registration endpoint, \`register_uri\`, account creation flow, OAuth authorization server, or dynamic client registration. Atlas must not be represented as supporting one.

## Claim

No identity claim, \`agent_auth\` credential, or \`id-jag\` assertion is issued or accepted. Access is anonymous because every deployed operation is read-only.

## Use the credential

No credential is used. Call the documented HTTPS endpoints directly and honor rate-limit response headers. MCP and A2A requests remain read-only even though their transports use POST.

## Errors

REST failures use a typed JSON envelope with a machine-readable \`error.kind\`, human-readable message, retryability, and request metadata. MCP uses JSON-RPC error codes and messages. A 429 includes \`Retry-After\`.

## Revocation

There is no public credential to revoke and no revocation endpoint. If the access model ever changes, this document and the machine descriptions must change before protected operations ship. Atlas does not emit a \`WWW-Authenticate\` challenge because the published resources are not protected.
`;
  return attachDiscoveryHeaders(text(body, "text/markdown; charset=utf-8", { headers: CACHE_HEADERS }));
}

const trustDocuments = {
  about: {
    title: "About Atlas News Intelligence",
    description: "Product scope, evidence model, and provenance boundaries for Atlas News Intelligence.",
    paragraphs: [
      "Atlas News Intelligence is a public, read-only research prototype for comparing how the same current event is reported across outlets and primary editorial markets. It discovers real current records through the production ingestion pipeline, retains source URLs and timestamps, and clusters articles only when shared entities, time, location, and other evidence support a same-event relationship. The browser globe, REST API, MCP tools, and A2A agent read from the same Cloudflare D1 truth store.",
      "Atlas deliberately separates event location, publisher origin, outlet language, primary editorial market, and audience location. Regional coverage means an outlet's primary editorial market supported by documented outlet market, language, and publisher-location evidence with a confidence label. Audience and readership telemetry are outside the product. Unknown fields stay unknown, and unavailable upstream data produces an explicit degraded or unavailable state rather than product stub records.",
      "The project source is publicly linked for provenance, but repository presence is not an audit, certification, or guarantee. Current claims should be checked against the linked articles and the service health timestamp. Atlas is not a news publisher, fact-checking authority, sentiment oracle, audience-measurement service, or system for inferring intent. Its comparisons are aids for inspection and must retain their citations and uncertainty.",
    ],
  },
  contact: {
    title: "Contact and project channels",
    description: "Truthful public contact boundaries for the Atlas News Intelligence prototype.",
    paragraphs: [
      "Atlas does not operate customer accounts, sales, billing, a private support desk, or a credential-issuance service. The deployed service is a public read-only prototype, so users should not send personal data, API keys, provider tokens, unpublished source material, or secrets in requests. Operational status is available from the public health endpoint, and integration behavior is described in the public documentation and OpenAPI description.",
      "The public source repository is the attributable project channel for reproducible implementation defects and documentation corrections: https://github.com/rowan121/atlas-news-intelligence. A repository link is not an invitation to send unrelated messages, private personal information, or third-party credentials. Reports should identify the affected public URL, an observed timestamp, the expected result, and a minimal reproduction that contains no sensitive data.",
      "Security-sensitive material should not be posted publicly. When the repository presents a private security-advisory workflow, use that workflow; otherwise do not disclose exploit details through a public issue. This deployment does not claim a telephone number, office address, service-level agreement, or monitored security mailbox that does not exist. Any future contact mechanism must be published here before agents rely on it.",
    ],
  },
  privacy: {
    title: "Atlas privacy statement",
    description: "Privacy and data-minimization boundaries for the public Atlas News Intelligence service.",
    paragraphs: [
      "Atlas has no user accounts, login flow, payment flow, advertising profile, or audience-measurement feature. The product does not intentionally collect readership or audience-location telemetry, and it never treats a requester's network location as evidence of a news outlet's editorial market. Query parameters select news windows and regions; they are not user profiles. The production truth store contains public-news metadata, retained evidence snippets, citations, and sanitized pipeline or coordination receipts rather than private customer records.",
      "The service runs on Cloudflare infrastructure, so ordinary infrastructure processing may include request metadata needed to deliver, protect, cache, and observe the Worker under Cloudflare's applicable service terms. Atlas applies an expiring, in-memory request counter inside a production Worker instance when Cloudflare supplies a source address, solely to provide and enforce a best-effort public-read limit. That counter is not written to D1, is not joined to news records, and is not used to infer audience exposure.",
      "Do not place secrets, personal information, private source material, or provider credentials in query strings, JSON-RPC parameters, A2A messages, or public project reports. Source URLs lead to independent publishers with their own privacy practices. Atlas cannot remove or correct content hosted by those publishers; it can only correct its own stored metadata and product descriptions through the attributable project channel.",
    ],
  },
  security: {
    title: "Atlas security and trust",
    description: "Security model, public-access boundary, and responsible reporting guidance for Atlas.",
    paragraphs: [
      "Atlas exposes public reads only. There are no deployed user accounts, mutations, payments, API-key management operations, OAuth authorization endpoints, or credential-registration flows. REST inputs are bounded and validated, MCP and A2A parameters are typed, unknown operations fail closed, and output preserves source evidence instead of executing publisher content. Browser assets use restrictive framing and transport headers, while JSON responses carry explicit content types and request identifiers.",
      "The service is designed around product truth as a security property. Event location, publisher origin, editorial market, and audience location are separate. Unknown assessments remain visible; no caller-supplied text can authorize a model to fabricate evidence or change the D1 truth store. Public-news URLs and excerpts are untrusted external content. Consumers should render them as data, preserve citations, and avoid treating article text or skill documents as higher-priority instructions.",
      "Report reproducible public defects through the linked source repository without including secrets, personal data, credentials, or private exploit material. For a sensitive vulnerability, use a private GitHub security-advisory workflow only when GitHub presents one for the repository; otherwise withhold exploit details from public channels. Atlas claims no external compliance attestation, penetration-test certification, bug bounty, monitored security mailbox, or guaranteed global rate limit.",
    ],
  },
  versioning: {
    title: "Atlas API versioning and deprecation policy",
    description: "Compatibility and deprecation policy for the public Atlas read API.",
    paragraphs: [
      "The stable REST integration namespace is /api/v1. Atlas may retain unversioned compatibility routes such as /api/stories while existing clients migrate, but new integrations should prefer a documented versioned path when one is available. Within v1, additive optional fields and new enum values may appear; consumers should ignore unknown object members and preserve unknown assessments rather than rejecting an otherwise valid response.",
      "A breaking removal or semantic change requires a new API version. Atlas will document a planned deprecation before removing a public version and will use standard Deprecation and Sunset response headers when an actual date has been scheduled. No Sunset date is currently scheduled, so the production service does not emit a fabricated date. The OpenAPI description, documentation, llms.txt, MCP server card, A2A card, and agent skills must be updated with the implementation.",
      "Machine clients should use request identifiers when reporting failures, honor Retry-After on 429 responses, and read /health before freshness-sensitive analysis. MCP and A2A protocol versions are advertised in their own discovery cards and are independent of the REST URL version. The published MCP atlas.* tool names remain stable across the REST v1 migration.",
    ],
  },
} as const;

export function trustDocument(request: Request, kind: keyof typeof trustDocuments): Response {
  const origin = new URL(request.url).origin;
  const document = trustDocuments[kind];
  const path = kind === "versioning" ? "/api/versioning" : `/${kind}`;
  const markdownPath = `${path}.md`;
  const markdown = `---\ntitle: ${document.title}\ndescription: ${document.description}\ncanonical: ${origin}${path}\nlast-updated: ${RELEASE_LAST_MODIFIED}\n---\n\n# ${document.title}\n\n${document.paragraphs.join("\n\n")}\n\n- [Documentation](${origin}/docs)\n- [Pipeline health](${origin}/health)\n`;
  const representation = documentationRepresentation(request);
  if (representation === null) return attachDiscoveryHeaders(notAcceptable());
  if (representation === "markdown") {
    return attachDiscoveryHeaders(text(markdown, "text/markdown; charset=utf-8", { headers: CACHE_HEADERS }), markdownPath);
  }
  const paragraphs = document.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  const o = escapeHtml(origin);
  const p = escapeHtml(path);
  const mp = escapeHtml(markdownPath);
  const title = escapeHtml(document.title);
  const description = escapeHtml(document.description);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${o}${p}"><link rel="alternate" type="text/markdown" href="${o}${mp}"></head><body><main><h1>${title}</h1>${paragraphs}<nav><a href="/docs">Documentation</a> · <a href="/health">Pipeline health</a> · <a href="/privacy">Privacy</a> · <a href="/security">Security</a></nav></main></body></html>`;
  return attachDiscoveryHeaders(text(html, "text/html; charset=utf-8", { headers: CACHE_HEADERS }), markdownPath);
}

export function integrations(request: Request): Response {
  const origin = new URL(request.url).origin;
  const markdown = `---
title: Atlas integration provenance
description: Truthful live-integration provenance and evidence rules.
canonical: ${origin}/integrations
last-updated: ${RELEASE_LAST_MODIFIED}
---

# Atlas integration provenance

Atlas uses GDELT as the public current-news backbone and MapLibre for browser mapping. Tavily may enrich retrieval only when the existing configured access is used. Cotal receipts preserve agent coordination provenance; Nebius is used only through existing Cotal platform access. Tenki supplies existing hosted sandboxes. Runtype is the intended product-surface and evaluation plane. Mitosis may preserve workflow provenance where a live receipt exists.

Sponsor presence is never inferred from configuration alone. A provider counts as used only when a sanitized live receipt records the capability, status, timestamp, and—when exposed by that provider—before/after usage. A missing receipt means “not evidenced,” not “used.” AIsa and HUD are excluded.

- [Pipeline health and latest receipt](${origin}/health)
- [API documentation](${origin}/docs)
`;
  const representation = documentationRepresentation(request);
  if (representation === null) return attachDiscoveryHeaders(notAcceptable());
  if (representation === "markdown") {
    return attachDiscoveryHeaders(text(markdown, "text/markdown; charset=utf-8", { headers: CACHE_HEADERS }), "/integrations.md");
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas integration provenance</title><link rel="canonical" href="${escapeHtml(origin)}/integrations"><link rel="alternate" type="text/markdown" href="${escapeHtml(origin)}/integrations.md"></head><body><main><h1>Atlas integration provenance</h1><p>Atlas uses GDELT as its current-news backbone and MapLibre for mapping. Optional sponsor services count as used only when a sanitized live receipt exists; configuration alone is not usage.</p><p>Cotal receipts preserve coordination provenance. Nebius is used only through Cotal. Tavily, Tenki, Runtype, and Mitosis are reported only from real invocations. AIsa and HUD are excluded.</p><ul><li><a href="/health">Pipeline health and latest receipt</a></li><li><a href="/docs">API documentation</a></li></ul></main></body></html>`;
  return attachDiscoveryHeaders(text(html, "text/html; charset=utf-8", { headers: CACHE_HEADERS }), "/integrations.md");
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
  headers.set("Link", `${apiLinks()}, <${origin}/.well-known/api-catalog.md>; rel=\"alternate\"; type=\"text/markdown\"`);
  return new Response(head ? null : JSON.stringify(body), { status: 200, headers });
}

function trustManifest(origin: string): Record<string, unknown> {
  return {
    identity: `${origin}/#publisher`,
    identityType: "url",
    provenance: [
      {
        relation: "publishedFrom",
        sourceId: "https://github.com/rowan121/atlas-news-intelligence",
      },
    ],
    privacyPolicyUrl: `${origin}/privacy`,
  };
}

export function ardCatalog(origin: string): Response {
  const publisher = { identifier: origin, displayName: "Atlas News Intelligence", identityType: "url" };
  const trust = trustManifest(origin);
  const body = {
    specVersion: "1.0",
    host: {
      displayName: "Atlas News Intelligence",
      identifier: origin,
      documentationUrl: `${origin}/docs`,
      logoUrl: `${origin}/atlas-social.svg`,
      trustManifest: trust,
    },
    entries: [
      {
        identifier: "urn:air:atlas-news-intelligence-api.atlas-news-surface.workers.dev:mcp:news-intelligence",
        displayName: "Atlas News Intelligence MCP",
        type: "application/mcp-server-card+json",
        url: `${origin}/.well-known/mcp/server-card.json`,
        version: "0.1.0",
        description: "Read-only MCP tools for current story queries, same-story source comparison, and pipeline health.",
        tags: ["news", "mcp", "citations", "geography"],
        publisher,
        trustManifest: trust,
        representativeQueries: [
          "Which current stories dominate this event region?",
          "How is this same story covered across primary editorial markets?",
          "Is the Atlas source pipeline current?",
        ],
        updatedAt: `${RELEASE_LAST_MODIFIED}T00:00:00Z`,
      },
      {
        identifier: "urn:air:atlas-news-intelligence-api.atlas-news-surface.workers.dev:a2a:news-intelligence",
        displayName: "Atlas News Intelligence A2A Agent",
        type: "application/a2a-agent-card+json",
        url: `${origin}/.well-known/agent-card.json`,
        version: "0.1.0",
        description: "Read-only A2A access to Atlas story, evidence, prominence, and pipeline-health operations.",
        tags: ["news", "a2a", "evidence"],
        publisher,
        trustManifest: trust,
        representativeQueries: ["Explain this Atlas story cluster with source evidence."],
        updatedAt: `${RELEASE_LAST_MODIFIED}T00:00:00Z`,
      },
      {
        identifier: "urn:air:atlas-news-intelligence-api.atlas-news-surface.workers.dev:api:openapi-v1",
        displayName: "Atlas News Intelligence REST API",
        type: "application/vnd.oai.openapi+json",
        url: `${origin}/openapi.json`,
        version: "1.0",
        description: "OpenAPI 3.1 description for the public, read-only Atlas REST API.",
        tags: ["news", "rest", "openapi"],
        publisher,
        trustManifest: trust,
        representativeQueries: ["List current Atlas story clusters with normalized prominence."],
        updatedAt: `${RELEASE_LAST_MODIFIED}T00:00:00Z`,
      },
      {
        identifier: "urn:air:atlas-news-intelligence-api.atlas-news-surface.workers.dev:skills:index",
        displayName: "Atlas Agent Skills",
        type: "application/json",
        url: `${origin}/.well-known/agent-skills/index.json`,
        version: "0.2.0",
        description: "Integrity-addressed skill instructions for querying, comparing, and validating Atlas news intelligence.",
        tags: ["news", "agent-skills", "instructions"],
        publisher,
        trustManifest: trust,
        representativeQueries: ["How should an agent use Atlas without conflating geography?"],
        updatedAt: `${RELEASE_LAST_MODIFIED}T00:00:00Z`,
      },
    ],
  };
  const response = json(body, { headers: CACHE_HEADERS });
  response.headers.set("Content-Type", "application/ai-catalog+json; charset=utf-8");
  response.headers.set("Link", `<${origin}/.well-known/ard.json>; rel="ai-catalog"`);
  return response;
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function agentSkillsIndex(origin: string): Promise<Response> {
  const skills = await Promise.all(agentSkills.map(async (skill) => ({
    name: skill.name,
    description: skill.description,
    type: "skill-md",
    url: `${origin}/.well-known/agent-skills/${skill.name}/SKILL.md`,
    digest: await sha256(skill.body),
  })));
  return json({
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills,
  }, {
    headers: { ...CACHE_HEADERS, "Access-Control-Allow-Origin": "*" },
  });
}

export function agentSkill(name: string): Response | null {
  const skill = agentSkills.find((candidate) => candidate.name === name);
  if (skill === undefined) return null;
  return text(skill.body, "text/markdown; charset=utf-8", {
    headers: { ...CACHE_HEADERS, "Access-Control-Allow-Origin": "*" },
  });
}

export function apiCatalogMarkdown(origin: string): Response {
  const body = `---\ntitle: Atlas API catalog\ndescription: Human- and agent-readable twin of the RFC 9727 API catalog.\ncanonical: ${origin}/.well-known/api-catalog\nlast-updated: ${RELEASE_LAST_MODIFIED}\n---\n\n# Atlas API catalog\n\n- [REST API documentation](${origin}/docs)\n- [OpenAPI 3.1](${origin}/openapi.json)\n- [MCP server card](${origin}/.well-known/mcp/server-card.json)\n- [A2A Agent Card](${origin}/.well-known/agent-card.json)\n- [Pipeline health](${origin}/health)\n\nAll listed capabilities are public and read-only.\n`;
  return attachDiscoveryHeaders(text(body, "text/markdown; charset=utf-8", { headers: CACHE_HEADERS }));
}

export function openApiMarkdown(origin: string): Response {
  const body = `---\ntitle: Atlas OpenAPI overview\ndescription: Markdown twin of the Atlas OpenAPI 3.1 description.\ncanonical: ${origin}/openapi.json\nlast-updated: ${RELEASE_LAST_MODIFIED}\n---\n\n# Atlas OpenAPI overview\n\nThe canonical machine schema is [openapi.json](${origin}/openapi.json). It documents public read-only health, intelligence-snapshot, story-list, and story-detail operations with typed success and error responses. No authentication or public write operation is deployed.\n\n- [REST documentation](${origin}/docs)\n- [Versioning policy](${origin}/api/versioning)\n- [Public access statement](${origin}/auth.md)\n`;
  return attachDiscoveryHeaders(text(body, "text/markdown; charset=utf-8", { headers: CACHE_HEADERS }));
}

export function notFoundMarkdown(origin: string, path: string): Response {
  const safePath = sanitizePathForMarkdown(path);
  const body = `# Atlas page not found\n\nNo public Atlas route exists at \`${safePath}\`.\n\n- [Documentation](${origin}/docs)\n- [Agent index](${origin}/llms.txt)\n- [Sitemap](${origin}/sitemap.xml)\n- [OpenAPI](${origin}/openapi.json)\n`;
  return attachDiscoveryHeaders(text(body, "text/markdown; charset=utf-8", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  }));
}

export function openApi(origin: string): Response {
  const rateHeaders = {
    RateLimit: { $ref: "#/components/headers/RateLimit" },
    "RateLimit-Policy": { $ref: "#/components/headers/RateLimitPolicy" },
  };
  const jsonContent = (schema: Record<string, unknown>) => ({
    "application/json": { schema },
  });
  const errorResponse = (description: string) => ({
    description,
    headers: rateHeaders,
    content: jsonContent({ $ref: "#/components/schemas/FailureEnvelope" }),
  });
  const storyParameters = [
    { name: "region", in: "query", description: "Optional 2-16 character event-region code.", schema: { type: "string", minLength: 2, maxLength: 16 } },
    { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
    { name: "until", in: "query", schema: { type: "string", format: "date-time" } },
    { name: "metric", in: "query", schema: { type: "string", enum: ["raw", "normalized"], default: "normalized" } },
    { name: "limit", in: "query", description: "Maximum stories returned. This is bounded, not offset pagination.", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
  ];
  const listStoriesOperation = (deprecated = false) => ({
    operationId: deprecated ? "listStoriesCompatibility" : "listStories",
    summary: "List current story clusters",
    description: "Returns a bounded current list. Region filters event geography; it never represents outlet audience exposure or editorial market.",
    deprecated,
    parameters: storyParameters,
    responses: {
      "200": {
        description: "Typed story-list envelope",
        headers: rateHeaders,
        content: jsonContent({ $ref: "#/components/schemas/StoryListEnvelope" }),
      },
      "400": errorResponse("Invalid filter"),
      "429": errorResponse("Public-read limit exceeded; honor Retry-After"),
      "503": errorResponse("Current news storage is unavailable"),
    },
  });
  const getStoryOperation = (deprecated = false) => ({
    operationId: deprecated ? "getStoryCompatibility" : "getStory",
    summary: "Explain one story cluster with sources and evidence",
    description: "Returns retained source articles, evidence-backed locations, claims, editorial-market assessments, and prominence for one same-story cluster.",
    deprecated,
    parameters: [
      { name: "cluster_id", in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 200 } },
    ],
    responses: {
      "200": {
        description: "Typed story-detail envelope",
        headers: rateHeaders,
        content: jsonContent({ $ref: "#/components/schemas/StoryDetailEnvelope" }),
      },
      "400": errorResponse("Malformed cluster identifier"),
      "404": errorResponse("Unknown cluster"),
      "429": errorResponse("Public-read limit exceeded; honor Retry-After"),
      "503": errorResponse("Current news storage is unavailable"),
    },
  });
  const response = json({
    openapi: "3.1.0",
    info: {
      title: "Atlas News Intelligence API",
      version: "0.1.0",
      description: "Read-only, evidence-backed global news intelligence. No authentication is required. REST v1 is stable; breaking changes use a new version and an actual scheduled retirement uses Deprecation and Sunset headers.",
    },
    servers: [{ url: origin }],
    security: [],
    externalDocs: { description: "Atlas API and truth-boundary documentation", url: `${origin}/docs` },
    paths: {
      "/health": { get: {
        operationId: "getPipelineHealth",
        summary: "Inspect source freshness and failures",
        description: "Reads the latest source watermark, run state, counts, and explicit degradation reasons.",
        responses: {
          "200": { description: "Healthy, stale, or degraded status", headers: rateHeaders, content: jsonContent({ $ref: "#/components/schemas/PipelineHealthEnvelope" }) },
          "429": errorResponse("Public-read limit exceeded; honor Retry-After"),
          "503": { description: "No current data is available; the body still carries typed health state", headers: rateHeaders, content: jsonContent({ $ref: "#/components/schemas/PipelineHealthEnvelope" }) },
        },
      } },
      "/api/v1/intelligence": { get: {
        operationId: "getIntelligenceSnapshot",
        summary: "Get the browser intelligence snapshot",
        description: "Returns the current globe regions and same-story clusters with event geography and separate editorial-market coverage heat.",
        parameters: [
          { name: "window", in: "query", schema: { type: "string", enum: ["6h", "24h", "7d"], default: "24h" } },
          { name: "prominence", in: "query", schema: { type: "string", enum: ["raw", "normalized"], default: "normalized" } },
        ],
        responses: {
          "200": { description: "Current intelligence snapshot", headers: rateHeaders, content: jsonContent({ $ref: "#/components/schemas/IntelligenceSnapshot" }) },
          "400": errorResponse("Invalid window or prominence filter"),
          "429": errorResponse("Public-read limit exceeded; honor Retry-After"),
          "503": errorResponse("No current evidence-backed intelligence"),
        },
      } },
      "/api/v1/stories": { get: listStoriesOperation(false) },
      "/api/v1/stories/{cluster_id}": { get: getStoryOperation(false) },
      "/api/stories": { get: listStoriesOperation(true) },
      "/api/stories/{cluster_id}": { get: getStoryOperation(true) },
    },
    components: {
      headers: {
        RateLimit: { description: "RFC RateLimit field with remaining requests and reset seconds for the current best-effort edge window.", schema: { type: "string" } },
        RateLimitPolicy: { description: "RFC RateLimit-Policy field describing the best-effort per-Worker-instance public-read quota and window.", schema: { type: "string" } },
      },
      schemas: {
        ApiMeta: {
          type: "object",
          additionalProperties: false,
          required: ["request_id", "generated_at"],
          properties: {
            request_id: { type: "string" },
            generated_at: { type: "string", format: "date-time" },
          },
        },
        FailureEnvelope: {
          type: "object",
          additionalProperties: false,
          required: ["ok", "error", "meta"],
          properties: {
            ok: { const: false },
            error: {
              type: "object",
              additionalProperties: false,
              required: ["kind", "message", "retryable"],
              properties: {
                kind: { type: "string", enum: ["bad_request", "not_found", "method_not_allowed", "conflict", "rate_limited", "database_unavailable", "internal_error"] },
                message: { type: "string" },
                retryable: { type: "boolean" },
                details: { type: "object", additionalProperties: true },
              },
            },
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
        },
        PipelineHealth: {
          type: "object",
          additionalProperties: true,
          required: ["status", "checked_at", "stale_after_seconds", "failures_24h", "cluster_count_24h", "article_count_24h", "active_source_count", "reasons"],
          properties: {
            status: { type: "string", enum: ["ok", "degraded", "unavailable"] },
            checked_at: { type: "string", format: "date-time" },
            stale_after_seconds: { type: "integer", minimum: 0 },
            latest_story_at: { type: ["string", "null"], format: "date-time" },
            freshness_age_seconds: { type: ["integer", "null"], minimum: 0 },
            latest_run: { type: ["object", "null"], additionalProperties: true },
            failures_24h: { type: "integer", minimum: 0 },
            cluster_count_24h: { type: "integer", minimum: 0 },
            article_count_24h: { type: "integer", minimum: 0 },
            active_source_count: { type: "integer", minimum: 0 },
            reasons: { type: "array", items: { type: "string" } },
          },
        },
        PipelineHealthEnvelope: {
          type: "object",
          additionalProperties: false,
          required: ["ok", "data", "meta"],
          properties: { ok: { const: true }, data: { $ref: "#/components/schemas/PipelineHealth" }, meta: { $ref: "#/components/schemas/ApiMeta" } },
        },
        StorySummary: {
          type: "object",
          additionalProperties: true,
          required: ["cluster_id", "canonical_title", "first_observed_at", "last_observed_at", "raw_article_count", "unique_outlet_count", "normalized_prominence", "cluster_confidence", "membership_explanation"],
          properties: {
            cluster_id: { type: "string" },
            canonical_title: { type: "string" },
            summary: { type: ["string", "null"] },
            primary_region_code: { type: ["string", "null"], description: "Event-region code, never editorial market or audience location." },
            first_observed_at: { type: "string", format: "date-time" },
            last_observed_at: { type: "string", format: "date-time" },
            raw_article_count: { type: "integer", minimum: 0 },
            unique_outlet_count: { type: "integer", minimum: 0 },
            normalized_prominence: { type: "number", minimum: 0 },
            cluster_confidence: { type: "number", minimum: 0, maximum: 1 },
            membership_explanation: { type: "string" },
            primary_event_location: { type: ["object", "null"], additionalProperties: true },
          },
        },
        StoryQuery: {
          type: "object",
          additionalProperties: false,
          required: ["metric", "limit"],
          properties: {
            region: { type: "string" }, since: { type: "string", format: "date-time" }, until: { type: "string", format: "date-time" },
            metric: { type: "string", enum: ["raw", "normalized"] }, limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
        StoryListEnvelope: {
          type: "object",
          additionalProperties: false,
          required: ["ok", "data", "meta"],
          properties: {
            ok: { const: true },
            data: {
              type: "object", additionalProperties: false, required: ["stories", "query", "count"],
              properties: { stories: { type: "array", items: { $ref: "#/components/schemas/StorySummary" } }, query: { $ref: "#/components/schemas/StoryQuery" }, count: { type: "integer", minimum: 0 } },
            },
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
        },
        StoryDetail: {
          allOf: [
            { $ref: "#/components/schemas/StorySummary" },
            { type: "object", required: ["articles", "locations", "claims", "regional_prominence"], properties: {
              articles: { type: "array", items: { type: "object", additionalProperties: true, required: ["article_id", "source_url", "title", "publisher_name", "publisher_domain", "published_at", "same_story"] } },
              locations: { type: "array", items: { type: "object", additionalProperties: true } },
              claims: { type: "array", items: { type: "object", additionalProperties: true } },
              regional_prominence: { type: "array", items: { type: "object", additionalProperties: true } },
            } },
          ],
        },
        StoryDetailEnvelope: {
          type: "object", additionalProperties: false, required: ["ok", "data", "meta"],
          properties: { ok: { const: true }, data: { $ref: "#/components/schemas/StoryDetail" }, meta: { $ref: "#/components/schemas/ApiMeta" } },
        },
        IntelligenceSnapshot: {
          type: "object",
          additionalProperties: false,
          required: ["generatedAt", "window", "health", "regions", "clusters"],
          properties: {
            generatedAt: { type: "string", format: "date-time" },
            window: { type: "string", enum: ["6h", "24h", "7d"] },
            health: { type: "object", additionalProperties: true, required: ["status", "activeSourceCount", "regionCount"] },
            regions: { type: "array", items: { type: "object", additionalProperties: true, required: ["id", "label", "latitude", "longitude", "storyCount", "sourceCount"] } },
            clusters: { type: "array", items: { type: "object", additionalProperties: true, required: ["id", "canonicalTitle", "eventLocations", "coverageHeat", "sources"] } },
          },
        },
      },
    },
  }, { headers: CACHE_HEADERS });
  response.headers.set("Content-Type", "application/vnd.oai.openapi+json;version=3.1; charset=utf-8");
  response.headers.set("Link", `${apiLinks()}, <${origin}/openapi.json.md>; rel=\"alternate\"; type=\"text/markdown\"`);
  return response;
}

export function mcpServerCard(origin: string): Response {
  return json({
    $schema: "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    schemaVersion: "1.0",
    name: "Atlas News Intelligence",
    title: "Atlas News Intelligence",
    version: "0.1.0",
    serverUrl: `${origin}/mcp`,
    icon: `${origin}/atlas-social.svg`,
    icons: [{ src: `${origin}/atlas-social.svg`, mimeType: "image/svg+xml", sizes: ["1200x630"] }],
    protocolVersion: "2026-07-28",
    serverInfo: { name: "atlas-news-intelligence", title: "Atlas News Intelligence", version: "0.1.0" },
    description: "Read-only tools for current, evidence-backed global news intelligence.",
    documentationUrl: `${origin}/docs`,
    transport: { type: "streamable-http", endpoint: `${origin}/mcp` },
    capabilities: { tools: { listChanged: false } },
    tools: mcpTools.map(({ name, title, description, inputSchema, annotations }) => ({
      name,
      title,
      description,
      inputSchema,
      annotations,
    })),
  }, { headers: CACHE_HEADERS });
}

export function a2aAgentCard(origin: string): Response {
  return json({
    name: "Atlas News Intelligence",
    description: "Read-only agent access to current story clusters, source evidence, event locations, regional prominence, and pipeline health.",
    supportedInterfaces: [
      { url: `${origin}/a2a`, protocolBinding: "JSONRPC", protocolVersion: "1.0" },
      { url: `${origin}/a2a`, protocolBinding: "HTTP+JSON", protocolVersion: "1.0" },
    ],
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
