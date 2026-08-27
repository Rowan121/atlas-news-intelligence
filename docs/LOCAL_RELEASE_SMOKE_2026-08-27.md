# Local release smoke receipt — 2026-08-27

This receipt covers the frozen Atlas candidate's built UI, Worker, and isolated local D1. It is local evidence only: no deployment, push, resource creation, account mutation, external scan, paid call, or sponsor API invocation occurred.

## Candidate and runtime

- Worktree: `/tmp/atlas-news-ui-correction`
- Branch: `codex/ui-story-comparison`
- Candidate parent tested: `162d6e1bae7fa96d18d66c9253760f054a31939e`
- Local origin: `http://127.0.0.1:8788`
- Wrangler process session: `23355`
- Wrangler: `4.126.0`
- Local-only persistence: `/tmp/atlas-news-smoke-8788.2c6S7g`
- Final route run completed: `2026-08-27T10:05:12.234Z`

The candidate advanced from `b2f759e` to `162d6e1` in the existing UI lane while the local stack was running. The Worker hot-reloaded and the final receipt below was generated from the newer candidate; no reset or force operation was used.

## Input and built-asset hashes

| Input/artifact | SHA-256 |
|---|---|
| `surface/schema/schema.sql` | `f3d30b54bd56066b149c19dc425f71778f2512073ebb86bb489bf1bda339f6ee` |
| `/tmp/atlas-news-integration/artifacts/gdelt-same-story-proof.sql` | `21bec3eb14440223360e36fb87dec87d49ed8adff76dc6c63c0c82817b0dc1e1` |
| Served `ui/dist/index.html` | `2b45153dc96fd728caf2fea8057d24470e40c0464ace46eef3be6550c8705dd6` |
| Served `ui/dist/assets/index-BxdiTDsQ.js` | `c34632f90d86c6f4766f5a5c4c7cf146af2e557e292413cc0fbc394f4af5aaad` |
| Served `ui/dist/assets/index-DCaFNjwV.css` | `1e1bc0d7bf73faee75ab8568d8c7a42c323560f08c9510d5a0e1011390307618` |

## Commands

```sh
npm --prefix ui run build
npm --prefix surface run typecheck

cd surface
npx wrangler d1 execute atlas-news-intelligence-local --local \
  --persist-to /tmp/atlas-news-smoke-8788.2c6S7g \
  --file schema/schema.sql
npx wrangler d1 execute atlas-news-intelligence-local --local \
  --persist-to /tmp/atlas-news-smoke-8788.2c6S7g \
  --file /tmp/atlas-news-integration/artifacts/gdelt-same-story-proof.sql
npx wrangler dev --local --ip 127.0.0.1 --port 8788 \
  --persist-to /tmp/atlas-news-smoke-8788.2c6S7g

cd ..
ATLAS_BASE_URL=http://127.0.0.1:8788 \
ATLAS_EXPECTED_RUN_ID=gdelt:20260827091500 \
ATLAS_EXPECTED_CLUSTERS=20 \
ATLAS_EXPECTED_ARTICLES=23 \
ATLAS_EXPECTED_REGIONS=12 \
ATLAS_EXPECTED_COVERAGE_STATUS=unavailable \
node scripts/smoke-local.mjs
```

D1 initialization executed 19 schema commands and 115 proof-import commands successfully. The resulting local counts were one pipeline run, 20 clusters, 23 articles, 20 locations, and 20 prominence rows.

## Final HTTP results

All 17 checks passed. Hashes below are the exact served response hashes for the final run. Health, intelligence, A2A query, and error-envelope hashes include request IDs or generation timestamps and are receipt-specific rather than reproducible build hashes.

| Check | Expected/observed status | Content type | Response SHA-256 |
|---|---:|---|---|
| Root HTML + no-JS identity | 200 | `text/html` | `2b45153dc96fd728caf2fea8057d24470e40c0464ace46eef3be6550c8705dd6` |
| JavaScript asset | 200 | `text/javascript` | `c34632f90d86c6f4766f5a5c4c7cf146af2e557e292413cc0fbc394f4af5aaad` |
| CSS asset | 200 | `text/css` | `1e1bc0d7bf73faee75ab8568d8c7a42c323560f08c9510d5a0e1011390307618` |
| D1 health | 200 | `application/json` | `8ba9a01dce248f563acff11fd79a6c80f621609c5d10101e9b29a9f3355dbfe1` |
| 24h normalized intelligence | 200 | `application/json` | `c9b1910a2b472ce22ee367a38ddcb7c033e77aa09e8d5f3f94fbf7b50f293cf0` |
| Docs HTML | 200 | `text/html` | `25465c15a51c06621340d65cf9c385044cf73a26dd0206c97fe4a5ee7896d158` |
| Docs Markdown | 200 | `text/markdown` | `68868fa73b0833ee0980aff7e07df3faad34b3392791c6b9047ad450d9410223` |
| Unsupported docs representation | 406 | `application/problem+json` | `8ded8805c6120ae0ad4db572956a37837438101b8e40ca9e44a19cb19a71c331` |
| Robots | 200 | `text/plain` | `3093023c05644af55d37351c60f8c0335d823617be95a1d7c46c5d026a4e00f7` |
| Sitemap | 200 | `application/xml` | `57cb7ec49c351eaaabb5047e56c562a938a7caee32b48317b11f290750ca5698` |
| OpenAPI 3.1, GET-only paths | 200 | OpenAPI JSON | `2bc1a9deecae45d54d7397660045d101a6c81bacc3c3bfc6d043295e3f5ee1a1` |
| MCP initialize | 200 | `application/json` | `55090bbf1ab6c72a1be7f84d31fd2b5604e60a05315c1072642c10c38a2cf2bf` |
| MCP tools/list, 3 read-only tools | 200 | `application/json` | `b91f4feb88a54c282a8fee98c80baf04fed7d9e1279606dc1fd742824b829bfc` |
| A2A Agent Card | 200 | `application/json` | `dd5efd912c6c3521e44638dd79b05a90d9665b60c830abedc61a2b719936f910` |
| A2A query SendMessage | 200 | `application/a2a+json` | `2b02e77437baf6271096b58424d2b719a0dd7710debc52a5fe56e9bd5d3022c3` |
| Malformed-percent story route | 400 | `application/json` | `3bf6c03e0346c354284af4719562425baf66b686194c8d1466c326b65d349455` |
| Missing Worker route | 404 | `application/json` | `4c2b7dd58243ff072d24b36b2cb0cd7b8462424c93dc0a5ebe953c1dab896135` |

Semantic assertions additionally verified that at least one cluster contains multiple source records, event-location prominence remains distinct from coverage-market heat, and every imported proof cluster reports coverage heat as unavailable because the seed contains no evidence-backed coverage-market metadata.

## Findings

- The first semantic pass caught HTML documentation drift: Markdown described same-event clustering but HTML did not. The Surface copy and regression test were corrected before the final run.
- The imported GDELT run is deliberately `degraded` and its story watermark was stale at test time. `/health` truthfully returned HTTP 200 with both reasons instead of hiding them; the intelligence response remained available from 20 real clusters.
- There are no unresolved local route failures.
- This receipt does not prove production HTTPS, redirects, a real Cloudflare D1 binding, deployed MCP/A2A invocation, Runtype activation, sponsor usage, or external scanner results.
