# Local release smoke receipt — 2026-08-27

This is the current local receipt for the Atlas P0 editorial-market candidate. It covers the built UI, Worker, and an isolated local D1 only. No deployment, production write, account mutation, paid call, sponsor API invocation, or external scanner run occurred while producing it.

## Candidate and runtime

- Product/code candidate: `55f9627d6c7c5baf1d165be8e0ffb3dec7de0bb0`
- Candidate worktree: `/tmp/atlas-news-ui-correction`
- Isolated local D1 persistence: `/tmp/atlas-p0-final-smoke.2CIdVh`
- Local origin: `http://127.0.0.1:8791`
- Result: 17/17 HTTP checks passed
- Retained machine-readable smoke receipt: `artifacts/p0-editorial-market-final-smoke.json`

The later ledger and release-freeze commits do not change product logic. Their distinct SHAs are reported in the release handoff because a Git commit cannot embed its own final SHA.

## Reproducible inputs and built assets

| Input/artifact | SHA-256 |
|---|---|
| `surface/schema/schema.sql` | `f3d30b54bd56066b149c19dc425f71778f2512073ebb86bb489bf1bda339f6ee` |
| `artifacts/gdelt-20260827170000.manifest.txt` | `09a7ed399857bf1f4703b7c82564a3499fb8d23064bade21a35dccddb136574b` |
| `artifacts/p0-editorial-market-final.json` | `fff27207417aba310ada64a0653d944e391224b15973be7102fafda40a19c94c` |
| `artifacts/p0-editorial-market-final.sql` | `4cde8920229744e4de0ffeb584069836b92a22234700af116a3681755c8c102b` |
| `artifacts/p0-editorial-market-production.sql` | `27bab7330daf7ae944af731be61c89aa6076bf647a68b73ef5493f759d14802c` |
| `artifacts/p0-editorial-market-final-smoke.json` | `5a3eb51627a170aa6bdf8765fed51fe629f5682a20a88667e75633151e9e02e1` |
| `ui/dist/index.html` | `ceec0225ba1c2a80baf8d0c671160296298c7f05823f80788acdffe40ed954b0` |
| `ui/dist/assets/index-tzW11bZK.js` | `fded7c02262150672a61471f8fcc1f31cbe62011a5fa1cc5aa3b1db3124c59c0` |
| `ui/dist/assets/index-DXU3S9Il.css` | `6266713fc302878c9a41cb8407d5af9074cbae7cc8a9d279994c2a46c9c5e5d0` |
| `ui/dist/assets/maplibre-gl-worker-Bml_7JYB.js` | `ed345860ff896d2baf568b1ee4765ab4f3527413115d23896a68230b0c70ff2d` |

The tracked manifest pins the exact real GDELT batch inputs and checksums used to regenerate the source JSON. The generated seed is derived from that validated JSON. The production refresh is a reproducible composition of the verified seed plus one explicit retirement of the superseded production run; it prevents incomparable per-run prominence scores from being mixed by the current read queries. The source contains no Cotal receipt, so the imported run exposes `cotal_receipt: null`; this receipt makes no Cotal, Nebius, or other sponsor-usage claim.

## Verification and smoke commands

```sh
npm run typecheck
npm test                              # 85 tests
npm --prefix ui test                  # 29 tests
npm --prefix ui run build
npm --prefix surface run check        # 61 tests + Surface typecheck
npm --prefix surface run build
npm audit
npm --prefix ui audit
npm --prefix surface audit            # 0 vulnerabilities in each audit

cd surface
npx wrangler d1 execute atlas-news-intelligence-local --local \
  --persist-to /tmp/atlas-p0-final-smoke.2CIdVh \
  --file schema/schema.sql
npx wrangler d1 execute atlas-news-intelligence-local --local \
  --persist-to /tmp/atlas-p0-final-smoke.2CIdVh \
  --file ../artifacts/p0-editorial-market-final.sql
npx wrangler dev --local --ip 127.0.0.1 --port 8791 \
  --persist-to /tmp/atlas-p0-final-smoke.2CIdVh

cd ..
ATLAS_BASE_URL=http://127.0.0.1:8791 \
ATLAS_EXPECTED_RUN_ID=gdelt:20260827170000 \
ATLAS_EXPECTED_RUN_STATUS=succeeded \
ATLAS_EXPECTED_DB_CLUSTERS=111 \
ATLAS_EXPECTED_RESPONSE_CLUSTERS=100 \
ATLAS_EXPECTED_ARTICLES=123 \
ATLAS_EXPECTED_REGIONS=42 \
ATLAS_EXPECTED_OBSERVED_HEAT_CLUSTERS=1 \
ATLAS_RECEIPT_OUTPUT=artifacts/p0-editorial-market-final-smoke.json \
node scripts/smoke-local.mjs
```

The full root, UI, and Surface suites passed, as did strict typechecking and all three package audits. The isolated D1 contains one `succeeded` pipeline run, 111 clusters, 123 cluster-scoped article rows representing 121 distinct canonical URLs, and 143 article-linked event-location evidence rows. `/health` is truthfully `degraded` only because the replayed story watermark is stale at verification time; the pipeline run itself is successful.

The composed production refresh was also executed against an exact local copy of the production schema plus the superseded `gdelt:20260827091500` run. After the single transaction, only `gdelt:20260827170000` remained, with 111 clusters, 123 articles, 131 story locations, 143 location-evidence rows, 0 claims, and 122 regional-prominence rows; `PRAGMA foreign_key_check` returned no rows.

## HTTP results

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

## Semantic findings and limits

- The intelligence response exposes its deterministic 100-cluster cap across 42 event regions.
- One 11-article same-story cluster has 11 observed heat points backed one-for-one by distinct, cited source editorial markets; the other 99 returned clusters truthfully report unavailable heat.
- Each observed editorial market has a confidence label, method, and cited evidence. Accepted evidence is a documented outlet market, or the validated combination of outlet language and publisher location. Manual confirmation requires direct outlet-market documentation.
- Every heat coordinate matches the corresponding source's observed editorial-market coordinate.
- Event location is used only for event prominence. It never fills editorial-market heat.
- Publisher origin remains separate. The 11 station publisher-origin assessments omit coordinates because the cited publisher addresses do not establish those editorial-market anchor points.
- Audience/readership telemetry and legacy plural coverage fields are absent from the public contract.
- Framing, tone, conflict, and omission remain unavailable where the evidence cannot support them.
- This receipt does not prove production HTTPS, redirects, a remote D1 binding, deployed REST/MCP/A2A behavior, Runtype activation, sponsor usage, or external Ora/IsItAgentReady/Hacker Bob results. Those require the independently approved frozen deployment.
