# Atlas News Intelligence — final independent verification

Verdict: **PASS for the local pre-production release gate**

- Frozen product/code candidate: **f7e7a6c21a44b5cff8ff95fb7422b9b51a4ca650**
- Final documentation/evidence ledger: **f3f471281ebcd486dffc4add23622b0b4282af42**
- Verified: **2026-08-27T11:13:18Z**
- ORA result: **24 PASS / 0 FAIL / 7 BLOCKED / 7 N-A**

There is no remaining local P0/P1 implementation failure. This is not a production certification: the blocked checks require a real HTTPS origin, owner/edge policy, external scanner authorization, or an available browser accessibility runtime.

## Frozen scope and method

- Evaluation criteria: all 959 lines of `/Users/rowancooper/Desktop/Deep research Folder/ORA THING.md`, read in full and used only as evaluation criteria. SHA-256: `fdc461c0b6060047163b3b91d280f1c449fe932aaab2936a0ba4b6cbc6e48f62`.
- Exact final-ledger archive: `/tmp/atlas-agent-d-ledger.2zO3zh`, created with `git archive` from clean HEAD `f3f4712`. Its non-documentation tree is byte-identical to product commit `f7e7a6c`; the only later changes are the two reconciled release documents.
- Exact f7 code archive used for the focused product gate: `/tmp/atlas-agent-d-f7.zCBDgz`.
- Live local origin: `http://127.0.0.1:8788`, exact f7 Worker/UI, persisted D1 `/tmp/atlas-news-final2-8788.13cNcf`, run `gdelt:20260827091500`.
- Independent proof load: `/tmp/atlas-agent-d-f7-d1.4pUWlr`.
- Browser checks followed the required in-app Browser skill. Runtime setup succeeded, but browser selection returned “No browser is available”; the one permitted inventory check returned `[]`. No Playwright, Computer Use, external browser, Ora, IsItAgentReady, Hacker Bob, AIsa, or HUD substitute was used.
- No implementation or release document was changed by Agent D. No deploy, push, publish, remote D1 write, account/resource creation, credential retrieval, sponsor call, quota use, or external scan occurred. Only this readiness matrix and report are changed in the Agent D worktree.

## ORA disposition

| Status | Count | Meaning |
|---|---:|---|
| PASS | 24 | Applicable local criterion met with direct, build, unit, or seeded-runtime evidence. |
| FAIL | 0 | No reproducible local P0/P1 release defect remains. |
| BLOCKED | 7 | Needs production policy/origin/edge behavior, external authorization, or a browser accessibility backend. |
| N-A | 7 | Capability is genuinely absent and was not fabricated for scanner points. |

The machine-readable source of truth is `check-matrix.csv`. Every ORA item is also summarized here:

| ID | Pri. | Result | Final evidence |
|---|---:|---|---|
| F-01 | P0 | PASS | Built initial HTML has Atlas identity, purpose, truth boundary, ordinary links, and a real `#top` skip target without JS. |
| F-02 | P0 | PASS | No-JS home reaches docs/intelligence/integrations/OpenAPI/A2A directly; docs reaches API Catalog/MCP/health/API within the second hop. |
| F-03 | P0 | PASS | `/docs`, `/api`, `/integrations` are 200; irrelevant `/pricing` is truthful 404. |
| F-04 | P0 | BLOCKED | Local robots syntax, allow policy, and sitemap are valid; production owner Content Signals/bot policy is not established. |
| F-05 | P0 | PASS | Valid four-route sitemap; all listed URLs resolve; no private URL. |
| F-06 | P1 | PASS | Root Link relations resolve to the truthful API Catalog, OpenAPI, docs, MCP card, and A2A card. |
| F-07 | P0 | PASS | Root and docs Markdown negotiation returns useful, equivalent, correctly typed Markdown. |
| F-08 | P1 | PASS | `/index.md` and `/docs/index.md` are explicit current Markdown fallbacks. |
| F-09 | P1 | PASS | `llms.txt` is concise; every sampled machine/docs link resolves without a conflicting fact. |
| F-10 | P0 | PASS | Product facts, f3 ledgers, hashes, 20/21/14 data totals, null sponsor receipt, geography boundaries, and degraded state are coherent. |
| F-11 | P0 | PASS | RFC 9727 linkset and OpenAPI 3.1 expose only genuine public GET reads with matching input behavior. |
| F-12 | P0 | N-A | No OAuth/auth/private surface exists or is claimed. |
| F-13 | P0 | PASS | MCP discovery/initialize/list and three real read tools work; schemas, geography, timestamps, null envelopes, and results match reality. |
| F-14 | P1 | PASS | A2A 1.0 card and query/explain/health reads are real and typed; unimplemented advanced protocols are absent. |
| E-01 | P0 | BLOCKED | No production HTTPS origin, aliases, or canonical-host redirect policy exists. |
| E-02 | P1 | PASS | Missing machine/conventional resources are controlled 404; malformed path encoding is controlled non-retryable 400. |
| E-03 | P0 | PASS | Identity, truth, skip target, docs, JSON, integrations, OpenAPI, A2A, and MCP method guidance survive no JS. |
| E-04 | P1 | PASS | Missing/mixed/HTML/Markdown Accept handling is deterministic; unsupported docs media returns typed 406 with `Vary: Accept`. |
| E-05 | P1 | N-A | No deprecated/versioned public docs or API is claimed. |
| A-01 | P0 | BLOCKED | Four local browser/bot user agents receive 200; production WAF/challenge behavior is unavailable. |
| A-02 | P0 | PASS | Fetched news remained inert data; no content instruction changed criteria, exposed a secret, or triggered a write. |
| A-03 | P0 | PASS | Malformed query/path/body/method/media/protocol values return controlled errors without stack, secret, internal host, or false 503. |
| A-04 | P0 | N-A | No auth, privileged state, or private data surface. |
| A-05 | P1 | BLOCKED | No approved production/test rate-limit environment exists; no induction was attempted. |
| A-06 | P1 | PASS | MCP/A2A validate types, schemas, limits, dates, roles, parts, and operations; no command, arbitrary URL, credential, or mutation is reachable. |
| T-01 | P1 | PASS | Thirty local no-cache reads: homepage p95 15.939 ms; docs p95 2.480 ms; no timeout. |
| T-02 | P1 | PASS | Twenty local no-cache reads: intelligence p95 22.295 ms; MCP health p95 4.303 ms; no timeout. |
| T-03 | P1 | BLOCKED | Production-only Ora/IsItAgentReady/Hacker Bob runs were explicitly deferred. |
| T-04 | P2 | PASS | One-shot read fault: retryable 503, one bounded retry to 200 degraded, exactly two reads, zero writes. |
| X-01 | P0 | BLOCKED | Source/unit evidence proves repaired skip, inert, focus, and 760px boundary behavior; independent real-browser keyboard traversal was unavailable. |
| X-02 | P0 | BLOCKED | Static semantics/names are positive; the required accessibility-tree backend was unavailable. |
| X-03 | P1 | PASS | Logical heading hierarchy and descriptive/contextual links; no critical ambiguous link. |
| X-04 | P1 | PASS | Loading/empty states use status, failures use alert with text/retry, and same-story transitions focus headings. |
| L-01 | P0 | PASS | All primary HTML surfaces declare the genuine single locale `en`. |
| L-02 | P1 | N-A | No additional supported locale. |
| L-03 | P1 | N-A | No localized fact set. |
| L-04 | P1 | N-A | No locale switcher, localized URLs, or locale negotiation. |
| L-05 | P2 | N-A | No RTL locale. |

## Exact release-gate evidence

### Unified cold verification

`npm run verify:release` ran from the clean final-ledger archive and exited 0:

- dependency installs/audits: root 54 packages, UI 150, Surface 45; **0 vulnerabilities in each**;
- data package: typecheck/build and **73/73 tests**;
- UI: **14/14 tests** and production build;
- Surface: typecheck and **55/55 tests**;
- Wrangler production dry-run completed with self-only CORS and the all-zero local D1 sentinel.

Reproducible built assets matched the reconciled ledger and live server:

| Artifact | SHA-256 |
|---|---|
| `ui/dist/index.html` | `d2b5abe4178206f738e71dccc07d3134a84d14dfbb29dabac97231e403f4dfa5` |
| `ui/dist/assets/index-DTMesOzy.js` | `46afa349c8ee6b813d5073ee8cf1e77350f034ada05c065b669c60851a84ee53` |
| `ui/dist/assets/index-DCaFNjwV.css` | `1e1bc0d7bf73faee75ab8568d8c7a42c323560f08c9510d5a0e1011390307618` |

The exact final smoke completed at `2026-08-27T11:13:18.187Z`: **17/17 passed** across root/no-JS/assets, degraded D1 health, intelligence, docs HTML/Markdown/406, robots, sitemap, OpenAPI, MCP initialize/list, A2A card/query, malformed-percent 400, and missing-route 404. Dynamic health/intelligence/A2A/error bodies contain request or generation metadata, so their changing hashes are deliberately not treated as immutable release identities.

### Data truth and reproducibility

- Source proof `/tmp/atlas-news-integration/artifacts/gdelt-same-story-proof.json`: SHA-256 `fa11c15088e0486654354eca41aa977bce1bc68775305e0a4d64814bc6fcfc61`.
- Exact f7 regeneration emitted 20 clusters, 21 articles, and 28 location-evidence records. Generated SQL SHA-256 `1b7d8e521e844587a5408b9bbddc2cf4319f8c884c13ff40e18fc9c8e0f8d71f` and was byte-identical to `/tmp/atlas-receipt-fix.sql`.
- SQL contains only batch-scoped deletes keyed by `ingestion_run_id`/`run_id`; it contains no explicit `BEGIN`, `COMMIT`, `ROLLBACK`, or `TRANSACTION`.
- Fresh Wrangler local import executed 19 schema commands and 127 seed commands without a nested-transaction error. Query result: 20 clusters, 21 articles, 14 distinct event regions, one `degraded` run, and `cotal_receipt_json IS NULL`.
- `/health` truthfully returns 200 degraded, run `gdelt:20260827091500`, 20 clusters, 21 articles, one active source, null Cotal receipt, and stale/degraded reasons. The proof is partial because duplicate GlobalEventID groups were merged and the configured cluster cap was reached; that is disclosed rather than hidden.

### Same-story and geography truth

The Nepal cluster `gdelt:20260827091500:gdelt_event_1320164521` is exactly one cluster with:

- two articles and two unique publishers;
- three cited event regions/locations: NP, IN, and CH;
- three coordinate anchors and six article-location evidence associations;
- coverage heat `unavailable`; publisher origin, audience exposure, framing, and tone all `unknown`.

An 18-result focused live probe passed:

- REST, MCP, and A2A queries for each of NP, IN, and CH all include Nepal;
- story detail remains 2 articles / 2 publishers / 3 event regions with unknown assessments;
- intelligence is 20 clusters / 14 regions, Nepal has two sources and three anchors, and no region repeats a `topClusterId`;
- REST/MCP/A2A reject `since=1` according to their protocol;
- MCP null/scalar/array envelopes return JSON-RPC `-32600`, and A2A null envelope/message/non-object parts return typed 400 rather than 503;
- root Markdown negotiation and exact self-only CORS pass.

Across all current records, no cluster reports observed coverage heat, tone, framing, publisher origin, or audience exposure. All 40 computed comparison signals are `not_assessed`; Atlas does not infer coverage market or audience from publisher origin or event location.

UI tests prove same-story entry, two-source comparison, unavailable-evidence explanation, reused-scroll reset, Back to overview, secondary-location discovery, panel focus/inert behavior, and the 800px/760px responsive boundary. Separate integration-lane desktop-browser evidence observed the 1280px MapLibre globe, 25 event-location buttons, exactly three Nepal anchors, attribution, and no console warnings/errors. That supplemental evidence does not replace Agent D's blocked mobile keyboard/accessibility-tree checks.

### GDELT fallback transparency

The prior-complete-batch recovery remains bounded and coherent:

- default lookback is four 15-minute batches; hard maximum is eight;
- fallback begins only when an advertised Events/Mentions/GKG file produces file-level HTTP 404;
- the bounded Range tail is parsed only for checksum-bearing rows on `data.gdeltproject.org`, upgraded to HTTPS, grouped into exactly one Events/Mentions/GKG triple with one batch ID, restricted to aligned prior quarter-hours, and sorted newest first;
- every candidate file must match the official-list byte count and MD5 before parsing, so a candidate cannot mix batches;
- candidate 404 may advance to the next bounded coherent candidate; non-404 HTTP/network errors, checksum/size errors, parse/integrity failures, duplicate manifest rows, a master-list 503, or a malformed non-boundary tail row stop and remain visible;
- a selected fallback marks snapshot and every cluster `degraded` and names both advertised and selected checksum-verified batches;
- loader tests exercise bounded extraction, malformed tails, master-list 503 transparency, non-404 transparency, checksum stop, disablement, and degraded metadata. All are included in the 73/73 data pass.

No fallback test or verification run made an external write, guessed a historical filename, synthesized a batch, or invoked a provider outside the supplied fixtures/proof.

## Security, privacy, and external effects

- Tracked-file high-confidence scans found no private key, AWS/GitHub/Slack/OpenAI token signature, `.env`, credential, or secret-key filename. Production Wrangler configuration retains an all-zero D1 database-ID sentinel.
- No runtime product module imports test fixtures, mocks, stubs, sample stories, or demo records. Empty/unavailable data paths are explicit.
- Public routes are GET/HEAD reads or POST-based read protocols. The D1 store exposes an internal pipeline-run upsert method, but no public route invokes it. MCP tools are annotated read-only, non-destructive, and closed-world.
- Exact self-origin CORS is echoed; foreign origins receive no `Access-Control-Allow-Origin`. JSON/protocol responses use `nosniff`; malformed inputs do not leak a stack, secret, internal hostname, or credential.
- The UI stores no cookies, local storage, or session storage and contains no analytics product integration. Source links use `rel=noreferrer`.
- No arbitrary URL fetch, shell, filesystem, account, payment, mutation, auth, or credential tool exists on REST/MCP/A2A.
- The real proof has no Cotal receipt. SQL stores `NULL`; API health exposes `cotal_receipt: null`; the ledger makes no Cotal/Nebius/sponsor usage claim.

## Remaining external blockers and non-blocking residuals

The following must remain BLOCKED until the relevant environment exists:

1. Production HTTPS/canonical aliases and redirects (E-01).
2. Owner-approved robots/Content Signals and production bot/WAF behavior (F-04/A-01).
3. Platform rate-limit/429 behavior in an approved test budget (A-05).
4. External Ora/IsItAgentReady/Hacker Bob results against the eventual production origin (T-03).
5. Independent mobile keyboard traversal and accessibility-tree capture through an available browser backend (X-01/X-02).
6. Cloudflare deployment identity, real D1 binding, and production Runtype activation/evals. The checked Runtype document is explicitly `draft`; REST/MCP/A2A runtime capabilities are genuine, but no production provider identity is inferred.

Non-blocking engineering follow-ups:

- UI JavaScript is 1,256.51 kB / 339.19 kB gzip and triggers the build's 500 kB chunk warning; local timing passes, but production Web Vitals remain unmeasured.
- Controlled 405 responses omit the HTTP `Allow` header.
- The browser map fetches the keyless OpenFreeMap style and tiles from a third party; no CSP or `Referrer-Policy` is currently defined.
- Trailing-slash variants such as `/docs/` return controlled 404 rather than redirect; final canonical-host policy should decide whether to normalize them.
- The inactive future Cotal integration-receipt parser uses permissive `Date.parse` for `observed_at` and does not constrain evidence URLs. The current proof receipt is null, the path is not publicly writable, and no sponsor claim depends on it; harden before accepting future provider receipts.

No production score, external scanner result, sponsor usage, deployment, or browser accessibility certification is claimed.
