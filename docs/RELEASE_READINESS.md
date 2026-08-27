# Release and agent-readiness audit

Checked locally on 2026-08-27 through the full built UI + Worker + isolated local D1 stack. No external write, deployment, account mutation, paid call, Runtype convergence, or quota-consuming scanner run was performed. The reproducible route-level evidence is in [the local smoke receipt](./LOCAL_RELEASE_SMOKE_2026-08-27.md).

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
- A real read-only A2A HTTP+JSON interface now accepts structured `query_stories`, `explain_story`, and `pipeline_health` requests and returns source-of-truth results. Its Agent Card advertises only those operations and no auth, streaming, push, or writes.
- `CORS_ORIGIN=self` allows same-origin browser/API use without guessing the Worker hostname and rejects foreign origins unless an explicit origin is later approved.
- The latest D1 pipeline-run query now exposes an optional sanitized Cotal receipt when one exists. The final proof correctly returns `cotal_receipt: null`: its source JSON contained no Cotal receipt, so this candidate makes no Cotal/Nebius or other sponsor-usage claim. Optional future sponsor receipts validate provider, capability, timestamp, status, external request ID, evidence URLs, and mathematically consistent before/after/delta usage.
- Selective Worker-first routing prevents the SPA fallback from turning missing conventional or machine paths into misleading HTML 200 responses.
- The document response now contains a meaningful no-JavaScript product identity, explanation, and ordinary links to documentation, current read-only intelligence, integration provenance, OpenAPI, and A2A discovery. The POST-only MCP endpoint is labeled as an endpoint rather than presented as a GET navigation link.
- The browser contract separates the initial world-news view from a selected same-story comparison view. Source membership, event location, coverage-market heat, framing, and tone each retain their own truth status; unavailable evidence is shown as unavailable.
- Malformed percent-encoding is a controlled non-retryable 400 and unknown Worker routes return a controlled 404 instead of leaking a stack or becoming a misleading SPA response.

## Applicable readiness matrix

| Area | Local candidate | Production evidence still required |
|---|---|---|
| Homepage identity/no-JS | Implemented, built, and served through the Worker; local HTTP check passed | Deployed HTTPS and keyboard/browser verification |
| Conventional `/docs`, `/api`, `/integrations` | Implemented and unit tested; `/docs` local HTTP check passed | Deployed HTTPS probes |
| `/pricing` | Intentionally absent; Worker-first path returns a real 404 | HTTPS probe |
| robots and sitemap | Implemented, unit tested, and locally HTTP-smoked | Deployed parser + canonical URL probes |
| Markdown negotiation and explicit fallback | HTML, Markdown, and explicit 406 are unit tested and locally HTTP-smoked | Deployed HTTPS content-equivalence probe |
| `llms.txt` | Implemented from canonical release facts | Link/fact consistency probe |
| API Catalog + OpenAPI | Implemented for public reads only; OpenAPI paths and GET-only operations locally verified | Deployed RFC validator and sampled operation probes |
| Authentication/OAuth metadata | N/A: public reads, no public OAuth server | Confirm no deployment layer adds auth |
| MCP discovery and invocation | Implemented; initialize and 3 read-only tools locally invoked | Deployed initialize/discover/list/call receipt |
| A2A discovery and invocation | Implemented; card and read-only query SendMessage locally invoked | Deployed card + SendMessage receipt |
| Agent Skills, WebMCP, ARD, DNS-AID | N/A unless a later real capability requires them | Re-evaluate against live scanner catalog |
| Commerce protocols | N/A: Atlas sells nothing | Keep N/A |
| Bot training/inference policy | No owner policy supplied; robots permits public reads only as a crawl instruction | Owner decision if Content Signals or crawler-specific policy is desired |
| Localization | English only | N/A for locale parity; verify `<html lang="en">` |
| Canonical origin/redirects | Blocked until deploy | HTTP→HTTPS and alias/redirect probes |
| External Ora/IsItAgentReady | Deferred to frozen deployed candidate | One milestone scan each, with check-set/version snapshot |
| Hacker Bob | Reserved | One final scan after freeze |

## Remaining deployment blockers

1. `surface/wrangler.jsonc` intentionally contains D1 ID `00000000-0000-0000-0000-000000000000`; deployment is prohibited until existing-account Cloudflare OAuth creates or identifies the approved production database.
2. The remote schema and current live seed have not been applied. Their exact file hashes and the returned D1 UUID must be shown before each write.
3. There is no production HTTPS origin, deploy ID, or remote row-count/health receipt.
4. Runtype has no observed product ID, surface IDs, deployed base URL, eval results, or before/after usage receipt yet. The local definition is only a draft.
5. No live Tavily, Tenki, Runtype, Mitosis, or Cotal/Nebius usage should be claimed unless a sanitized receipt exists. Configuration or account balance alone is not evidence of use. The final GDELT source JSON contains no Cotal receipt, and the corrected SQL therefore stores `NULL`; this is explicitly not sponsor-service evidence.
6. External Ora, IsItAgentReady, and Hacker Bob evidence cannot exist before deployment and was deliberately not consumed during iteration.

None of these blockers justifies creating an account, hunting for a key, attaching a personal provider key, or enabling AIsa/HUD.

## Known evidence limitation

The imported proof is real GDELT data: 20 clusters, 21 unique articles, and 14 event regions. At least one cluster contains multiple source records about the same event. It does **not** contain evidence-backed coverage-market, framing, tone, or measured audience-exposure metadata, so every story correctly reports `coverageHeat.status = "unavailable"` and the UI must show an evidence-unavailable explanation. Publisher origin is not substituted for coverage market or audience. This is truthful behavior, but a richer comparison demo still depends on a later evidence-producing data run.

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
53 tests passed; Surface typecheck passed

npm run typecheck
passed

npm test
73 tests passed

npm --prefix ui test
13 tests passed; UI build passed

ATLAS_BASE_URL=http://127.0.0.1:8788 \
ATLAS_EXPECTED_RUN_ID=gdelt:20260827091500 \
ATLAS_EXPECTED_CLUSTERS=20 ATLAS_EXPECTED_ARTICLES=21 \
ATLAS_EXPECTED_REGIONS=14 ATLAS_EXPECTED_COVERAGE_STATUS=unavailable \
node scripts/smoke-local.mjs
17/17 HTTP checks passed against the built UI + Worker + isolated local D1

npm run verify:release
all dependency audit, typecheck, test, build, and Wrangler dry-run gates passed
```

The frozen local candidate was `257cc5240ba9a09129880fdbb8ece4ceab2e6aca`. Its corrected seed `/tmp/atlas-receipt-fix.sql` has SHA-256 `1b7d8e521e844587a5408b9bbddc2cf4319f8c884c13ff40e18fc9c8e0f8d71f`; its source `/tmp/atlas-news-integration/artifacts/gdelt-same-story-proof.json` has SHA-256 `fa11c15088e0486654354eca41aa977bce1bc68775305e0a4d64814bc6fcfc61`. The source contains no Cotal receipt, so the imported run's `cotal_receipt` is `null`.

Full `npm run verify:release` remains the merge/deploy preflight because it also builds the changing UI and performs the Wrangler bundle dry-run.

## Primary specifications consulted

- Cloudflare Workers static-assets routing: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- RFC 9727 API Catalog: https://www.rfc-editor.org/rfc/rfc9727
- MCP current discovery: https://modelcontextprotocol.io/specification/draft/server/discover
- A2A current specification and Agent Card: https://a2a-protocol.org/latest/specification/
