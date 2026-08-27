# Local release smoke receipt — 2026-08-27

This is the current local receipt for the frozen Atlas candidate. It covers the built UI, Worker, and an isolated local D1 only: no deployment, push, resource creation, account mutation, external scan, paid call, or sponsor API invocation occurred.

An earlier local run produced different asset hashes and seed counts. That receipt is historical and is not evidence for the current candidate; its superseded values are intentionally omitted here.

## Candidate and runtime

- Candidate: `257cc5240ba9a09129880fdbb8ece4ceab2e6aca`
- Candidate worktree: `/tmp/atlas-news-ui-correction`
- Independent verification copy: `/tmp/atlas-agent-d-final2.rlJBKb`
- Local origin: `http://127.0.0.1:8788`
- Local-only persistence: `/tmp/atlas-agent-d-d1-final2.2q9IJh`
- Final smoke completed: `2026-08-27T10:42:18.515Z`
- Result: 17/17 HTTP checks passed

The runtime process/session identifier was ephemeral and is deliberately not treated as release evidence. The candidate SHA, inputs, response hashes, assertions, and counts below are the durable receipt.

## Input and built-asset hashes

| Input/artifact | SHA-256 |
|---|---|
| `surface/schema/schema.sql` | `f3d30b54bd56066b149c19dc425f71778f2512073ebb86bb489bf1bda339f6ee` |
| Source `/tmp/atlas-news-integration/artifacts/gdelt-same-story-proof.json` | `fa11c15088e0486654354eca41aa977bce1bc68775305e0a4d64814bc6fcfc61` |
| Corrected seed `/tmp/atlas-receipt-fix.sql` | `1b7d8e521e844587a5408b9bbddc2cf4319f8c884c13ff40e18fc9c8e0f8d71f` |
| Served `ui/dist/index.html` | `b330c991ad85bda576b6e6549fcc569b30963f2d73c4601eb380c5baaa8e3544` |
| Served `ui/dist/assets/index-CMnXF4Mo.js` | `2ce729365e15c5bcd813f789852e0f5bfe8871ed9b0851d10c5182286940c117` |
| Served `ui/dist/assets/index-DCaFNjwV.css` | `1e1bc0d7bf73faee75ab8568d8c7a42c323560f08c9510d5a0e1011390307618` |

The source JSON contains no Cotal receipt. The corrected SQL therefore imports `cotal_receipt_json` as `NULL`, and the API truthfully exposes `cotal_receipt: null`. This receipt makes no Cotal/Nebius or other sponsor-usage claim.

## Verification and smoke commands

```sh
npm run typecheck
npm test                              # 73 tests
npm --prefix ui test                  # 13 tests
npm --prefix ui run build
npm --prefix surface run check        # 53 tests + Surface typecheck
npm --prefix surface run build

cd surface
npx wrangler d1 execute atlas-news-intelligence-local --local \
  --persist-to /tmp/atlas-agent-d-d1-final2.2q9IJh \
  --file schema/schema.sql
npx wrangler d1 execute atlas-news-intelligence-local --local \
  --persist-to /tmp/atlas-agent-d-d1-final2.2q9IJh \
  --file /tmp/atlas-receipt-fix.sql
npx wrangler dev --local --ip 127.0.0.1 --port 8788 \
  --persist-to /tmp/atlas-agent-d-d1-final2.2q9IJh

cd ..
ATLAS_BASE_URL=http://127.0.0.1:8788 \
ATLAS_EXPECTED_RUN_ID=gdelt:20260827091500 \
ATLAS_EXPECTED_CLUSTERS=20 \
ATLAS_EXPECTED_ARTICLES=21 \
ATLAS_EXPECTED_REGIONS=14 \
ATLAS_EXPECTED_COVERAGE_STATUS=unavailable \
node scripts/smoke-local.mjs
```

The isolated D1 held one pipeline run, 20 clusters, and 21 unique article records. The intelligence response exposed 14 event regions. The run was truthfully `degraded`; it remained readable and did not fabricate unavailable coverage-market evidence.

## Final HTTP results

All 17 checks passed with the expected status and representation:

1. Root HTML plus no-JavaScript identity — 200 `text/html`.
2. JavaScript asset — 200 JavaScript.
3. CSS asset — 200 `text/css`.
4. D1 health — 200 `application/json`.
5. 24-hour normalized intelligence — 200 `application/json`.
6. Docs HTML — 200 `text/html`.
7. Docs Markdown — 200 `text/markdown`.
8. Unsupported docs representation — 406 `application/problem+json`.
9. Robots — 200 `text/plain`.
10. Sitemap — 200 `application/xml`.
11. OpenAPI 3.1 with GET-only public paths — 200 OpenAPI JSON.
12. MCP initialize — 200 `application/json`.
13. MCP tools/list with three read-only tools — 200 `application/json`.
14. A2A Agent Card — 200 `application/json`.
15. A2A query SendMessage — 200 `application/a2a+json`.
16. Malformed-percent story route — controlled 400 JSON error.
17. Missing Worker route — controlled 404 JSON error.

The exact retained response hashes for the final run are:

| Response | SHA-256 | Reproducibility note |
|---|---|---|
| Root HTML | `b330c991ad85bda576b6e6549fcc569b30963f2d73c4601eb380c5baaa8e3544` | Reproducible built asset |
| JavaScript asset | `2ce729365e15c5bcd813f789852e0f5bfe8871ed9b0851d10c5182286940c117` | Reproducible built asset |
| CSS asset | `1e1bc0d7bf73faee75ab8568d8c7a42c323560f08c9510d5a0e1011390307618` | Reproducible built asset |
| 24-hour normalized intelligence | `a00526ac2b89f7a5d01556f493f7224b8ec81a0a8ef9e55f7136f579b4a5554d` | Receipt-specific because the response contains dynamic request/generation metadata |

The other route bodies also passed their semantic assertions, but their receipt-specific hashes are not promoted here as reproducible build identifiers.

## Semantic findings and limits

- At least one cluster contains multiple source records about the same event.
- Every cluster has an event location, and regional prominence remains explicitly based on event location.
- Coverage-market heat remains separate and reports `unavailable` because this proof contains no evidence-backed coverage-market metadata.
- Publisher origin is not substituted for coverage market or measured audience exposure.
- There are no unresolved local route failures in this 17-check receipt.
- This receipt does not prove production HTTPS, redirects, a real Cloudflare D1 binding, deployed MCP/A2A invocation, Runtype activation, sponsor usage, or external Ora/IsItAgentReady/Hacker Bob results.
