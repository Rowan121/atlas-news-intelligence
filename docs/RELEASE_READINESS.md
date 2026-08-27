# Release and agent-readiness audit

The P0 candidate is deployed on the existing Cloudflare Worker and D1 resources. The final build uses real GDELT records, a visible MapLibre globe, evidence-backed primary editorial-market heat, and genuine REST/MCP/A2A surfaces. The full local release gate and a 19-check production smoke passed after the last live-only asset security fix. The one approved Hacker Bob scan was consumed once and its two response observations were remediated. The complete production receipt is [here](./PRODUCTION_RELEASE_2026-08-27.md); Agent D's independent final ORA/IsItAgentReady verification is deliberately last.

## Truthful profile

Atlas is a **hybrid public content + API/application**. It has a browser explorer plus genuine read-only REST, MCP, and A2A interfaces over one truth store. Public reads have no authentication. Atlas is not commerce, does not expose public writes, and does not have a public OAuth authorization server. OAuth and commerce metadata are therefore non-applicable and must not be fabricated for scanner points.

## Release-lane delta

Before this candidate:

- REST and MCP existed locally but had no robots, sitemap, Markdown docs, API Catalog, OpenAPI, or server-card discovery.
- Runtype declared an A2A surface even though no A2A request path existed.
- Runtype declared API-key authentication even though the underlying public reads did not require it.
- Cloudflare used wildcard CORS and the deployment draft depended on an unknown hostname placeholder.
- The D1 schema could persist Cotal receipts, but the latest-run health query did not expose the optional value.
- Sponsor before/after usage had no validated receipt shape.

After this candidate:

- `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/docs`, `/index.md`, `/integrations`, `/.well-known/api-catalog`, and `/openapi.json` are deterministic Worker routes.
- Documentation and the root resource support `Accept: text/markdown`; HTML and Markdown assert the same auth, capability, and data-truth facts, including correct q-value fallback and explicit 406 responses.
- RFC 9727 GET/HEAD behavior is represented by an `application/linkset+json` API Catalog and `Link: rel="api-catalog"` discovery.
- MCP retains the stable `2025-06-18` initialize flow and adds current stateless `server/discover`, plus a public server card.
- A real read-only A2A v1 JSON-RPC interface and HTTP+JSON binding accept structured `query_stories`, `explain_story`, and `pipeline_health` requests and return source-of-truth results. A strict method-scoped v0.3 adapter serves the existing Runtype client without weakening v1 or accepting free-form text. The Agent Card advertises only real operations and no auth, streaming, push, or writes.
- `CORS_ORIGIN=self` allows same-origin browser/API use without guessing the Worker hostname and rejects foreign origins unless an explicit origin is later approved.
- The latest D1 pipeline-run query now exposes an optional sanitized Cotal receipt when one exists. The final proof correctly returns `cotal_receipt: null`: its source JSON contained no Cotal receipt, so this candidate makes no Cotal/Nebius or other sponsor-usage claim. Optional future sponsor receipts validate provider, capability, timestamp, status, external request ID, evidence URLs, and mathematically consistent before/after/delta usage.
- Selective Worker-first routing prevents the SPA fallback from turning missing conventional or machine paths into misleading HTML 200 responses.
- The document response now contains a meaningful no-JavaScript product identity, explanation, and ordinary links to documentation, current read-only intelligence, integration provenance, OpenAPI, and A2A discovery. The POST-only MCP endpoint is labeled as an endpoint rather than presented as a GET navigation link.
- The browser contract separates the initial world-news view from a selected same-story comparison view. Source membership, event location, primary editorial-market heat, framing, and tone each retain their own truth status; unavailable evidence is shown as unavailable.
- Every source exposes one `editorialMarket` assessment with confidence, method, and cited evidence when observed. Distinct outlet domains remain visible even when several editions share a parent publisher/network.
- Audience/readership telemetry and legacy plural coverage fields are absent. Event location and publisher origin never fill the same-story heatmap.
- Malformed percent-encoding is a controlled non-retryable 400 and unknown Worker routes return a controlled 404 instead of leaking a stack or becoming a misleading SPA response.
- Production HTTPS responses, including hashed assets, carry HSTS plus CSP/XFO frame denial. HTTP redirects omit HSTS, and asset response metadata is preserved.

## Applicable readiness matrix

| Area | Final state | Evidence / remaining limit |
|---|---|---|
| Homepage identity/no-JS | PASS | Live HTTPS, semantic browser snapshot, and visible final screenshot |
| Initial and focused globe modes | PASS | Initial event globe; focused 11-market heat; Back restores initial mode |
| Conventional `/docs`, `/api`, `/integrations` | PASS | Deployed HTTPS probes and negotiated HTML/Markdown/406 |
| `/pricing` | N/A | Atlas sells nothing; controlled 404 is truthful |
| robots, sitemap, `llms.txt` | PASS | Live origin and fact/link checks |
| API Catalog + OpenAPI | PASS | Deployed API Catalog and GET-only OpenAPI 3.1 paths |
| Authentication/OAuth metadata | N/A | Public reads; no public OAuth server or deployment-layer auth |
| MCP discovery and invocation | PASS | Live initialize and three read-only tool declarations |
| A2A discovery and invocation | PASS | Live v1 JSON-RPC, HTTP+JSON, strict v0.3 Runtype compatibility, and final Runtype `execution_complete` |
| Static asset security | PASS | JS/CSS run through Worker and preserve representation metadata while receiving CSP/XFO/HSTS |
| Agent Skills, WebMCP, ARD, DNS-AID | N/A | No real product capability requires fabricated metadata |
| Commerce protocols | N/A | Atlas sells nothing |
| Bot training/inference policy | Open owner choice | Robots permits crawl; no unsupported owner Content Signals policy was invented |
| Localization | English only | `<html lang="en">`; locale parity N/A |
| Canonical origin/redirects | PASS | HTTP 308 to HTTPS; HSTS only on production HTTPS |
| Runtype product/capability | PARTIAL | Genuine final A2A execution; surfaces remain draft because required named eval creation needs a prohibited new API credential |
| External ORA/IsItAgentReady | FINAL AGENT D GATE | Existing Agent D owns the complete attached-document checklist and final frozen-origin verdict |
| Hacker Bob | CONSUMED / REMEDIATED | One scan only; HSTS/clickjacking observations fixed; no second scan permitted |

## Remaining gate

Only the same existing Agent D's final independent ORA/IsItAgentReady pass remains. The atomic D1 refresh, Worker deploy, live browser/REST/MCP/A2A/security verification, final Runtype execution, and one Hacker Bob scan are complete. Any implementation change after Agent D's verdict invalidates that verdict and requires a new independent pass.

Runtype activation remains intentionally blocked rather than silently waived: the five named eval suites cannot be created from the available signed-in UI, and the SDK/API path requires minting a credential. Tavily, Tenki, Mitosis, and Cotal/Nebius are not claimed as used without sanitized final-run receipts. None of these limits justifies creating an account, hunting for a key, attaching a personal provider key, or enabling AIsa/HUD.

## Current evidence profile

The P0 proof is a checksum-replayed real GDELT batch `20260827170000`: 111 stored clusters, 123 cluster-scoped article records representing 121 distinct canonical URLs, and 143 article-linked event-location evidence rows. The read-only intelligence route returns its deterministic 100-cluster cap across 42 event regions. One 11-article same-story cluster has 11 observed, cited, distinct primary editorial markets and therefore an observed editorial-market heatmap; 99 returned clusters remain truthfully unavailable. The 11 station publisher-origin assessments carry no coordinates because the cited publisher addresses and editorial-market anchors are not interchangeable. Framing, tone, and omission remain unavailable where evidence does not support them, and no reader-location claim is made.

## Sponsor receipt contract

An integration counts as evidenced only when attached to the Cotal receipt for the relevant run. Example shape (values illustrative, not a claim of actual use):

```json
{
  "provider": "tavily",
  "capability": "news_enrichment",
  "status": "succeeded",
  "observed_at": "2026-08-27T08:00:00.000Z",
  "external_request_id": "sanitized-provider-request-id",
  "usage": {
    "unit": "credits",
    "before": 1000,
    "after": 998,
    "delta": -2
  },
  "evidence_urls": ["https://first-party-provider-receipt.example/"]
}
```

If a provider does not expose usage, `usage` is `null`; never invent a numeric delta. Evidence must exclude tokens, auth headers, cookies, PII, or internal URLs.

## Local evidence

```text
npm --prefix surface run check
70 tests passed; Surface typecheck passed

npm run typecheck
passed

npm test
85 tests passed

npm --prefix ui test
29 tests passed; UI build passed

npm audit
npm --prefix ui audit
npm --prefix surface audit
0 vulnerabilities in each audit

ATLAS_BASE_URL=https://atlas-news-intelligence-api.atlas-news-surface.workers.dev \
ATLAS_EXPECTED_RUN_ID=gdelt:20260827170000 \
ATLAS_EXPECTED_RUN_STATUS=succeeded \
ATLAS_EXPECTED_DB_CLUSTERS=111 ATLAS_EXPECTED_RESPONSE_CLUSTERS=100 \
ATLAS_EXPECTED_ARTICLES=123 ATLAS_EXPECTED_REGIONS=42 \
ATLAS_EXPECTED_OBSERVED_HEAT_CLUSTERS=1 \
node scripts/smoke-local.mjs
18/18 scripted HTTPS checks passed; the separate HTTP→HTTPS probe passed, for 19/19 production checks

npm run verify:release
all install, typecheck, test, build, and Wrangler dry-run gates passed
```

The final deployed runtime build is `32a3e6630291f485a67aade8efa0ba5e0b56657f`; Cloudflare deployment version `34ea69cb-aa81-41bd-aab1-5b07d6222df0` serves it. The valid P0 source, generated-seed, and production-refresh hashes remain recorded in the approved payload ledger. The source contains no fabricated sponsor receipt; sponsor claims require separate sanitized integration evidence.

Full `npm run verify:release` remains the merge/deploy preflight because it also builds the changing UI and performs the Wrangler bundle dry-run.

## Primary specifications consulted

- Cloudflare Workers static-assets routing: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- RFC 9727 API Catalog: https://www.rfc-editor.org/rfc/rfc9727
- MCP current discovery: https://modelcontextprotocol.io/specification/draft/server/discover
- A2A current specification and Agent Card: https://a2a-protocol.org/latest/specification/
