# Production release receipt — 2026-08-27

## Outcome

Atlas News Intelligence is deployed at
<https://atlas-news-intelligence-api.atlas-news-surface.workers.dev> on the
existing Cloudflare Worker and D1 database. The initial browser state contains
the MapLibre globe and event-place story feed. Selecting a story enters a
separate same-story comparison mode; only then does Atlas render the
editorial-market heat layer, source cards, confidence/evidence, and tone rails.
The Back control returns to the initial globe.

Regional coverage has one meaning throughout the contracts, pipeline, API, and
UI: the outlet's evidence-backed **primary editorial market**. It is not reader
exposure. Direct outlet-market documentation is preferred; a documented outlet
language plus documented publisher location is the lower-confidence fallback.
Publisher location alone, language alone, and event location are insufficient.
Event location never fills the coverage heatmap.

## Frozen production identity

| Item | Value |
| --- | --- |
| Origin | `https://atlas-news-intelligence-api.atlas-news-surface.workers.dev` |
| Existing Worker | `atlas-news-intelligence-api` |
| Existing Cloudflare account | `70311d13372e29742a6ae45f6788bcc9` |
| Existing D1 database | `atlas-news-intelligence-prod` |
| D1 database ID | `a4b64588-32ff-4e18-950e-f603e3c7d3d2` |
| Final deployment version | `af5a6aee-18e6-4467-b4e4-b9fb93c87e58` |
| Runtime build version | `074da0c4683686d17d5b7b4ea31541384a31d2d6` |
| GDELT run | `gdelt:20260827170000` |
| Release smoke completion | `2026-08-27T20:35:37.782Z` |

No Worker, D1 database, account, or replacement external account was created.
The only new credential was Rowan's exactly authorized Runtype eval-management
key in the existing account, recorded below; no additional key was created.
AIsa, HUD, Telegram, paid calls, hackathon submission, and third-party messages
remained out of scope.

## Production data before and after

The approved atomic refresh retired only the superseded independently
normalized run `gdelt:20260827091500` while loading
`gdelt:20260827170000`. This avoided mixing incomparable prominence
denominators.

| Measure | Before | After |
| --- | ---: | ---: |
| Stored clusters | 20 | 111 |
| Article rows | 21 | 123 |
| Story-location rows | 25 | 131 |
| Article-linked location-evidence rows | — | 143 |
| Claim rows | — | 0 |
| Regional-prominence rows | — | 122 |

The final read-only D1 receipt returned one succeeded run, 6,452 records seen,
630 records upserted, no foreign-key violations, and `cotal_receipt_json IS
NULL`. Eleven article records have observed primary editorial markets; zero
observed publisher-origin assessments carry editorial-market coordinates; zero
rows contain the retired `coverageMarkets` or `audienceExposure` contexts.

The public 24-hour normalized response returns its deterministic 100-cluster
cap across 42 event regions. One real 11-article cluster has 11 cited editorial
markets with confidence `0.93–0.97`; the other 99 clusters report heat as
unavailable. The observed cluster's event is Barranquilla, Colombia while its
heat markets are separately documented outlet markets in the United States.
This is deliberate evidence separation, not event-to-market substitution.

Pipeline health is currently `degraded` only because the successful story
watermark is older than the configured 30-minute freshness threshold. The UI
shows this rather than hiding it or substituting product stubs.

## Verification

The final release gate passed after the production asset-header fix and the
outlet-count truth remediation:

- data package: 85/85 tests, typecheck, and build;
- UI: 29/29 tests and production build;
- Surface: 70/70 tests, typecheck, and Wrangler dry bundle;
- all three dependency audits: zero known vulnerabilities;
- final production smoke: 25/25 checks, including REST list/detail, MCP
  query/detail, A2A v1 JSON-RPC, A2A HTTP+JSON, the strict v0.3 adapter, and the
  independent HTTP redirect probe. Every story-bearing machine payload exposes
  `unique_outlet_count` and omits the misleading legacy
  `unique_publisher_count` name.

The machine-readable smoke receipt is
[`receipts/production-smoke-2026-08-27.json`](./receipts/production-smoke-2026-08-27.json).
It covers HTML/no-JS truth, both hashed UI assets, D1 health, 24-hour
intelligence, REST story reads, HTML/Markdown/406 docs, robots, sitemap,
OpenAPI, MCP discovery and story reads, A2A discovery and all deployed adapters,
malformed input, a controlled missing route, and HTTP→HTTPS.

Browser verification on the final deployment confirmed:

- initial mode: visible interactive globe, 42 evidenced event places, 100
  current story clusters, 24-hour default, normalized prominence selected;
- focused mode: one selected story on the left, “News stories like …” on the
  right, 11 matched versions, 11 evidenced editorial markets, cited
  market/method/confidence per source, distinct publisher origin and event
  geography, truthfully unavailable tone/framing where not assessed, and Back;
- returning with Back restores the initial globe.

## Security

The one approved Hacker Bob HTTP scan was consumed once at
`2026-08-27T19:49:19.844Z` against the exact public origin. It ran in paranoid
mode with internal hosts blocked, reached the root with HTTP 200 in 162 ms, and
reported no leaked secret. Its response analysis identified missing HSTS and
missing clickjacking protection. The stored analyzer state contains zero formal
findings, but the response observations were treated as defects.

The final Worker now emits:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` on production
  HTTPS only;
- `Content-Security-Policy: frame-ancestors 'none'`;
- `X-Frame-Options: DENY`.

Live verification covered the root, JavaScript, CSS, REST intelligence, Agent
Card, A2A protocol error, missing asset, and controlled non-asset 404. The HTTP
308 redirect carries no HSTS. Cloudflare's direct static-asset bypass was found
during live verification and fixed by routing `/assets/*` through the Worker
while preserving content type, cache control, ETag, body, status, and HEAD
semantics. The one-scan limit was respected; Agent D owns the final independent
verification of the remediated state.

## Runtype receipt

The existing signed-in Runtype account started with no Atlas product, product
runs/errors `0/0`, an observed $5 promo balance, and estimated bill $0. The
approved existing-account workflow produced:

| Runtype object | ID |
| --- | --- |
| Product | `prod_01m12akcm1em7rbjzf7d7tegr1` |
| Capability | `prodcap_01m12anppbejfrsxtvvampcngg` |
| Underlying external agent | `agent_01m12anp9ze0va72dmvns83zt6` |
| A2A surface | `surf_01m12aken9eppbfvt2vspwcp20` |
| REST surface | `surf_01m12ax8j0et4vrb7a33q09c7g` |
| MCP surface | `surf_01m12ay152ekssg2a8a63vb3mq` |

The first Runtype A2A attempts exposed real integration defects in sequence:
HTTP 405, then method-not-found after the canonical A2A v1 implementation, then
invalid parameters from Runtype's cached v0.3 shape. Atlas added a strict,
method-scoped v0.3 adapter without weakening v1 or accepting free-form text.
Refreshing the existing cached Agent Card made the capability execute
successfully.

The final post-deployment debug execution sent
`{"operation":"pipeline_health"}` through the existing capability and produced
`execution_start`, `step_start`, `step_complete`, and `execution_complete` in
0.188 seconds. Debug executions do not increment the product's 24-hour run
counter, which remained `0`; no numeric bill or credit delta is invented.

Runtype's Evals page showed zero saved evals and `0/100` for the day but no UI
control to create the five approved named suites. Rowan subsequently authorized
exactly one new eval-only management credential. The key authenticates to the
correct Atlas organization, has explicit `EVALS:READ` and `EVALS:WRITE` scopes,
expires on 2026-08-29, and is stored only in Runtype's supported
`runtype.api-key/v1` file format under `~/.runtype/keys` with mode `0600`. Its
value is absent from this repository, chat receipts, screenshots, and logs.

Runtype nevertheless returned HTTP 403 for both eval-suite read and the
non-writing `eval/ensure` hash probe. The former said `FLOWS:READ or EVALS:READ
permission required`; the latter said `Insufficient permissions`. The
synchronous `/v1/eval/run` endpoint does not support the existing external A2A
agent; Runtype documents `/v1/eval/submit` as the delegated external-agent batch
path, limited to one baseline configuration without overrides. That batch path
could not be invoked honestly because the prerequisite suite write was denied.

Accordingly, geolocation-fidelity, citation-integrity, cluster-coherence,
abstention-and-failure, and agent-surface-conformance were neither created nor
run. Eval usage stayed `0/100`, no model/provider execution or personal billing
key was attached, and REST/MCP/A2A remain draft. The sanitized failure receipt
is [`docs/receipts/runtype-eval-gate-2026-08-27.json`](./receipts/runtype-eval-gate-2026-08-27.json).

## Other integrations and truthful limits

- GDELT is the live current-news backbone; MapLibre renders the browser globe.
- Cotal `v0.33.1` reports the `hack` mesh reachable, but this machine has no
  user-auth material for a live mesh snapshot. `cotal endpoints` showed the
  existing endpoints/agent idle and `cotal ps` was empty. No login, key, or
  replacement account was requested, and no Cotal/Nebius usage claim is made.
- Tavily, Tenki, and Mitosis access may exist, but the final production run has
  no sanitized invocation receipts. Configuration and balances are not usage;
  this release makes no claim for them.
- No AIsa or HUD code path was enabled.

## Independent final verification

Verification Agent D was given the complete attached ORA/IsItAgentReady
document at the beginning of the workflow and derived the early applicability
checklist in [`.agent-readiness/early-applicability-checklist.md`](../.agent-readiness/early-applicability-checklist.md).
The frozen production candidate is handed back to that same existing Agent D
last. Its independent final report is reserved at
`.agent-readiness/final-production-verification.md`; no implementation change
may follow that verification without invalidating its verdict.
