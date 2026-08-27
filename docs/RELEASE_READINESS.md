# Release and agent-readiness audit

Checked locally on 2026-08-27. No external write, deployment, account mutation, paid call, Runtype convergence, or quota-consuming scanner run was performed.

## Truthful profile

Atlas is a **hybrid public content + API/application**. It has a browser explorer plus genuine read-only REST, MCP, and A2A interfaces over one truth store. Public reads have no authentication. Atlas is not commerce, does not expose public writes, and does not have a public OAuth authorization server. OAuth and commerce metadata are therefore non-applicable and must not be fabricated for scanner points.

## Release-lane delta

Before this candidate:

- REST and MCP existed locally but had no robots, sitemap, Markdown docs, API Catalog, OpenAPI, or server-card discovery.
- Runtype declared an A2A surface even though no A2A request path existed.
- Runtype declared API-key authentication even though the underlying public reads did not require it.
- Cloudflare used wildcard CORS and the deployment draft depended on an unknown hostname placeholder.
- Cotal receipts were persisted in D1 but the latest-run health query did not return them.
- Sponsor before/after usage had no validated receipt shape.

After this candidate:

- `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/docs`, `/index.md`, `/integrations`, `/.well-known/api-catalog`, and `/openapi.json` are deterministic Worker routes.
- Documentation supports `Accept: text/markdown`; HTML and Markdown assert the same auth, capability, and data-truth facts.
- RFC 9727 GET/HEAD behavior is represented by an `application/linkset+json` API Catalog and `Link: rel="api-catalog"` discovery.
- MCP retains the stable `2025-06-18` initialize flow and adds current stateless `server/discover`, plus a public server card.
- A real read-only A2A HTTP+JSON interface now accepts structured `query_stories`, `explain_story`, and `pipeline_health` requests and returns source-of-truth results. Its Agent Card advertises only those operations and no auth, streaming, push, or writes.
- `CORS_ORIGIN=self` allows same-origin browser/API use without guessing the Worker hostname and rejects foreign origins unless an explicit origin is later approved.
- The latest D1 pipeline-run query now returns a sanitized Cotal receipt. Optional sponsor receipts validate provider, capability, timestamp, status, external request ID, evidence URLs, and mathematically consistent before/after/delta usage.
- Selective Worker-first routing prevents the SPA fallback from turning missing conventional or machine paths into misleading HTML 200 responses.

## Applicable readiness matrix

| Area | Local candidate | Production evidence still required |
|---|---|---|
| Homepage identity/no-JS | **Blocked in UI lane:** current committed `ui/index.html` has an empty root | Meaningful server-returned HTML and keyboard/browser verification |
| Conventional `/docs`, `/api`, `/integrations` | Implemented and unit tested | HTTPS probes |
| `/pricing` | Intentionally absent; Worker-first path returns a real 404 | HTTPS probe |
| robots and sitemap | Implemented and unit tested | Parser + canonical URL probes |
| Markdown negotiation and explicit fallback | Implemented and unit tested | HTTPS content equivalence probe |
| `llms.txt` | Implemented from canonical release facts | Link/fact consistency probe |
| API Catalog + OpenAPI | Implemented for deployed public reads only | RFC validator and sampled operation probes |
| Authentication/OAuth metadata | N/A: public reads, no public OAuth server | Confirm no deployment layer adds auth |
| MCP discovery and invocation | Implemented; 3 read-only tools | Deployed initialize/discover/list/call receipt |
| A2A discovery and invocation | Implemented; 3 structured read operations | Deployed card + SendMessage receipt |
| Agent Skills, WebMCP, ARD, DNS-AID | N/A unless a later real capability requires them | Re-evaluate against live scanner catalog |
| Commerce protocols | N/A: Atlas sells nothing | Keep N/A |
| Bot training/inference policy | No owner policy supplied; robots permits public reads only as a crawl instruction | Owner decision if Content Signals or crawler-specific policy is desired |
| Localization | English only | N/A for locale parity; verify `<html lang="en">` |
| Canonical origin/redirects | Blocked until deploy | HTTP→HTTPS and alias/redirect probes |
| External Ora/IsItAgentReady | Deferred to frozen deployed candidate | One milestone scan each, with check-set/version snapshot |
| Hacker Bob | Reserved | One final scan after freeze |

## Hard deployment blockers

1. `surface/wrangler.jsonc` intentionally contains D1 ID `00000000-0000-0000-0000-000000000000`; deployment is prohibited until existing-account Cloudflare OAuth creates or identifies the approved production database.
2. The remote schema and current live seed have not been applied. Their exact file hashes and the returned D1 UUID must be shown before each write.
3. There is no production HTTPS origin, deploy ID, or remote row-count/health receipt.
4. Runtype has no observed product ID, surface IDs, deployed base URL, eval results, or before/after usage receipt yet. The local definition is only a draft.
5. The current committed homepage still fails the document-response/no-JS information gate; the UI lane must add meaningful initial HTML without undoing the interactive app.
6. No live Tavily, Tenki, Runtype, Mitosis, Cotal/Nebius usage should be claimed unless a sanitized receipt exists. Configuration or account balance alone is not evidence of use.
7. External Ora, IsItAgentReady, and Hacker Bob evidence cannot exist before deployment and was deliberately not consumed during iteration.
8. The current intelligence response still aggregates prominence around event regions and does not yet provide the user-required same-story coverage-market heatmap or framing/tone evidence. The Runtype comparison capability remains explicitly draft/activation-gated until the data and UI lanes land those fields.

None of these blockers justifies creating an account, hunting for a key, attaching a personal provider key, or enabling AIsa/HUD.

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
40 tests passed; Surface typecheck passed

npm run typecheck
passed

npm test
64 tests passed
```

Full `npm run verify:release` remains the merge/deploy preflight because it also builds the changing UI and performs the Wrangler bundle dry-run.

## Primary specifications consulted

- Cloudflare Workers static-assets routing: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- RFC 9727 API Catalog: https://www.rfc-editor.org/rfc/rfc9727
- MCP current discovery: https://modelcontextprotocol.io/specification/draft/server/discover
- A2A current specification and Agent Card: https://a2a-protocol.org/latest/specification/
