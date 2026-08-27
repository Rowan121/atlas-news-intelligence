# Atlas News Intelligence — final independent production verification

**Verdict: PASS for the frozen public product and deployment.** No P0/P1
product-truth, security, public-contract, data-integrity, or deployment defect
was found. Four checks remain explicitly blocked by unavailable or deliberately
withheld external test authority; seven checks are genuinely non-applicable.
Runtype activation remains blocked at its provider-side eval authorization gate,
so all three Runtype surfaces correctly remain draft.

This is an independent engineering verdict, not an invented Ora score or
Cloudflare readiness level.

## Exact scope

| Item | Verified value |
| --- | --- |
| Frozen candidate | `6ba765e3d76d11dba4093c83b22febf441e1a7f8` |
| Candidate state | Clean before this verification artifact was added |
| Product/runtime build | `074da0c4683686d17d5b7b4ea31541384a31d2d6` |
| Cloudflare version | `af5a6aee-18e6-4467-b4e4-b9fb93c87e58`, 100% of the current deployment |
| Origin | `https://atlas-news-intelligence-api.atlas-news-surface.workers.dev` |
| Existing D1 | `atlas-news-intelligence-prod` / `a4b64588-32ff-4e18-950e-f603e3c7d3d2` |
| Production run | `gdelt:20260827170000` |
| Verification time | `2026-08-27T21:12:19Z` |
| Evaluation criteria | All 959 lines of `ORA THING.md`, SHA-256 `fdc461c0b6060047163b3b91d280f1c449fe932aaab2936a0ba4b6cbc6e48f62` |

The post-receipt successor changed only documentation. The delta from
`6415278be2f1bbf3900bfc6560a516ada36bcb03` is limited to the three credential
statements in `docs/API_ACCESS.md`, `docs/PRODUCTION_RELEASE_2026-08-27.md`, and
`surface/EXTERNAL_PAYLOAD_DRAFTS.md`. It resolves the earlier F-10 contradiction
by consistently recording one and only one authorized Runtype eval-management
credential. Product code and the deployed asset tree are unchanged.

## Result counts

The 38-item early ORA/IsItAgentReady applicability matrix now resolves to:

| Status | Count | Meaning |
| --- | ---: | --- |
| PASS | 27 | Independently exercised or supported by exact-tree deterministic evidence |
| FAIL | 0 | No observed defect |
| BLOCKED | 4 | Relevant but unsafe or impossible to execute in this lane; not hidden as pass |
| N/A | 7 | Capability is genuinely absent and must not be fabricated |
| Total | 38 | Complete early checklist |

All 27 executed applicable checks pass. The four blocked checks are rate-limit
induction on production, a new official Ora/IsItAgentReady scanner run, fresh
browser keyboard traversal, and a fresh accessibility-tree capture. The
in-app Browser connection was attempted through the required Browser skill,
including its one permitted recovery inventory check, and returned no browser
windows. No substitute browser or external scanner was used.

## Decisive evidence

### Frozen-tree release gate

`npm run verify:release` passed on exact candidate `6ba765e3`:

- data: 85/85 tests, typecheck, and build;
- UI: 29/29 tests and production build;
- Surface: 70/70 tests, typecheck, and Wrangler dry bundle;
- data, UI, and Surface dependency installs: zero known vulnerabilities;
- dry bundle: existing production D1, `ENVIRONMENT=production`, self-only CORS,
  and `BUILD_VERSION=074da0c...`.

The UI suite specifically covers initial globe presence, separately bundled
MapLibre worker use, same-story entry, Back restoration, evidence-only heat,
event/publisher/market separation, distinct outlet-edition labels, unavailable
tone/framing, no fabricated fallback data, mobile inert/focus restoration,
the 760 px breakpoint, skip target, and no-JavaScript links.

### Live release and security smoke

An independent live run of `scripts/smoke-local.mjs` passed **25/25** at
`2026-08-27T20:40:40.901Z`. The committed receipt also reports 25/25 and has
SHA-256 `430fd3f77e6ff6eabf1c2897855ca39dabb581b04d568f619c4bb2b4ddafd372`.

Cloudflare's read-only version inspection independently returned:

- version `af5a6aee-18e6-4467-b4e4-b9fb93c87e58` at 100%;
- runtime binding `BUILD_VERSION=074da0c4683686d17d5b7b4ea31541384a31d2d6`;
- the expected existing D1 binding and Worker-first routes for the homepage,
  APIs, MCP, A2A, discovery, docs, and `/assets/*`.

The live root, hashed JavaScript, hashed CSS, MapLibre worker, health route, and
controlled 404 all carry:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`;
- `Content-Security-Policy: frame-ancestors 'none'`;
- `X-Frame-Options: DENY`.

HTTP returns a single 308 hop to the canonical HTTPS origin and correctly omits
HSTS. The one approved Hacker Bob scan was not rerun. Its earlier HSTS and
clickjacking observations are independently confirmed remediated by these live
headers.

Live representation hashes match the exact local build byte for byte:

| Resource | Bytes | SHA-256 |
| --- | ---: | --- |
| `/` | 1,810 | `ceec0225ba1c2a80baf8d0c671160296298c7f05823f80788acdffe40ed954b0` |
| `/assets/index-tzW11bZK.js` | 1,371,837 | `fded7c02262150672a61471f8fcc1f31cbe62011a5fa1cc5aa3b1db3124c59c0` |
| `/assets/index-DXU3S9Il.css` | 105,872 | `6266713fc302878c9a41cb8407d5af9074cbae7cc8a9d279994c2a46c9c5e5d0` |
| `/assets/maplibre-gl-worker-Bml_7JYB.js` | 477,721 | `ed345860ff896d2baf568b1ee4765ab4f3527413115d23896a68230b0c70ff2d` |

Self-origin CORS returns the exact origin, a foreign origin receives no
`Access-Control-Allow-Origin`, and the self-origin preflight returns 204.
Browser, Googlebot, GPTBot, and ClaudeBot requests all return the same 200 root
bytes. Malformed percent encoding returns a controlled 400 without a stack.

Thirty uncached root and docs reads and twenty API/MCP reads had zero timeouts:

| Surface | Runs | p95 |
| --- | ---: | ---: |
| Homepage | 30 | 76.1 ms |
| Docs | 30 | 28.2 ms |
| Health API | 20 | 51.6 ms |
| MCP pipeline health | 20 | 48.5 ms |

No rate-limit threshold was induced against production; A-05 therefore remains
BLOCKED rather than being inferred from these low-volume reads.

### Public outlet-count contract — former P0

Independent live requests exercised all seven story-bearing interfaces:

1. REST story list;
2. REST story detail;
3. MCP `atlas.query_dominant_stories`;
4. MCP `atlas.explain_story_cluster`;
5. canonical A2A v1 JSON-RPC `SendMessage`;
6. A2A v1 HTTP+JSON `message:send`;
7. strict A2A v0.3 `message/send` adapter.

Every response contains `unique_outlet_count`; recursive key inspection found
zero public `unique_publisher_count` occurrences. The legacy D1 column name is
confined to storage and aliased at the storage boundary.

Observed cluster `gdelt:20260827170000:gdelt_event_1320232313` returns eleven
articles with eleven distinct `publisher_domain` outlet editions and exactly
one `publisher_name` network, `iheart.com`. The UI makes the outlet domain the
primary source identity and retains the shared parent network as secondary
context. Neither the API nor the UI represents those station editions as
eleven independent publisher networks.

### Product-truth and geography semantics

The live normalized 24-hour response returns 100 capped clusters across 42
event regions. It truthfully reports degraded health because the successful
GDELT watermark is stale; it does not substitute product fixtures.

The one observed heat cluster is the 11-article cluster above:

- event location: Barranquilla, Colombia (`CO`);
- primary editorial-market heat: eleven separately cited U.S. outlet markets;
- heat status/basis: `observed` / `editorial_market`;
- live methods: `documented_outlet_market`, confidence 0.93–0.97;
- every market has matching source `editorialMarket`, confidence, method, URL,
  and evidence quote;
- publisher origin remains a separate U.S. fact and supplies no heat coordinate;
- audience/readership keys are absent;
- tone, framing, conflict, and omission remain unavailable where unsupported.

The other 99 returned clusters with no editorial-market assessment truthfully
withhold heat. Static schema and storage tests also require both outlet-language
and publisher-location evidence for the lower-confidence fallback, reject
publisher-location-only/manual evidence, and never accept event location as an
editorial market.

Independent live queries passed for 6h, 24h, and 7d windows in both raw and
normalized prominence modes. Each cluster carries both raw and normalized
values and the UI exposes both modes without presenting prominence as reader
reach.

### D1 integrity and provenance

Read-only remote D1 queries returned:

| Table/evidence set | Rows |
| --- | ---: |
| story clusters | 111 |
| articles | 123 |
| story locations | 131 |
| article-linked location evidence | 143 |
| claims | 0 |
| regional prominence | 122 |

`PRAGMA foreign_key_check` returned no rows. The latest and only retained run is
`gdelt:20260827170000`, status `succeeded`, with 6,452 records seen, 630 upserted,
and a null Cotal receipt. Every D1 query reported `rows_written=0`. The observed
cluster independently resolves to one publisher network, eleven outlet domains,
eleven articles, and zero non-null legacy audience regions.

### No secrets, stubs, or unintended writes

Tracked-file scans found no common private-key, access-key, bearer-token, GitHub
token, or provider-secret signature, and no tracked credential-shaped file.
Runtime source contains no fixture, demo, fallback-story, or mock-data provider;
fixtures are confined to test paths. No deployment, D1 write, account mutation,
message, external scan, or key access occurred in this verification lane.

### Runtype eval-auth receipt

The sanitized receipt
`docs/receipts/runtype-eval-gate-2026-08-27.json` has SHA-256
`a3d7e69dcc9a6cf643d9e02cc5c0f88dd9fa135df9a8edbdb2ca14577013038a`.
Its schema and cross-document facts were independently checked:

- account key rows increase by exactly one, from 1 to 2;
- key ID `key_01m12fpdkbedztxn1ywmqcx27t` is recorded, but no key value,
  token, authorization header, or secret-valued field exists;
- permissions are exactly `EVALS:READ` and `EVALS:WRITE`;
- `/auth/me` is recorded as 200 with the Atlas organization matched;
- suite list and non-writing ensure/hash probe are both recorded as 403;
- exactly five named suites are recorded, all `created=false` and `run=false`;
- usage remains 0/100 with delta 0;
- `/v1/eval/run` excludes external agents, while `/v1/eval/submit` is recorded
  as the documented delegated external-agent batch path and was not attempted;
- no personal provider key, provider/model run, or numeric cost delta is claimed;
- REST, MCP, and A2A surfaces remain draft.

These provider observations were assessed from the sanitized receipt without
accessing or hunting for the credential. Runtype's refusal is an explicit
external authorization blocker, not an Atlas public-surface failure and not a
basis for activating unevaluated draft surfaces.

## Complete ORA/IsItAgentReady matrix

| ID | Pri. | Status | Final evidence |
| --- | --- | --- | --- |
| F-01 | P0 | PASS | Live root contains English Atlas identity, purpose, truth boundary, skip target, and ordinary no-JS links. |
| F-02 | P0 | PASS | Home/docs expose docs, API, integrations, OpenAPI, MCP guidance, and A2A within two deterministic hops. |
| F-03 | P0 | PASS | `/docs`, `/api`, and `/integrations` work; irrelevant `/pricing` truthfully 404s. |
| F-04 | P0 | PASS | Live RFC 9309-style robots file permits intended public reads, links the sitemap, and is not treated as authorization. |
| F-05 | P0 | PASS | Sitemap is valid, public-only, and its canonical routes resolve. |
| F-06 | P1 | PASS | Root `Link` relations resolve to API Catalog, OpenAPI, docs, MCP card, and A2A card. |
| F-07 | P0 | PASS | Root/docs Markdown negotiation is useful, correctly typed, and fact-equivalent. |
| F-08 | P1 | PASS | Explicit `/index.md` and `/docs/index.md` fallbacks resolve as Markdown. |
| F-09 | P1 | PASS | `llms.txt` is concise and its representative links are current. |
| F-10 | P0 | PASS | Human/machine/runtime/receipt facts agree after the three credential statements were reconciled; no auth, outlet, geography, cost, or capability contradiction remains. |
| F-11 | P0 | PASS | RFC 9727 API Catalog and OpenAPI 3.1 advertise only genuine public reads. |
| F-12 | P0 | N/A | Public product reads require no OAuth/authentication; no OAuth server is claimed. |
| F-13 | P0 | PASS | MCP discovery, initialize, three read-only tools, schema errors, query, detail, and health all work against D1. |
| F-14 | P1 | PASS | Genuine A2A v1 and strict v0.3 reads work; unsupported Agent Skills/WebMCP/ARD are not fabricated. Runtype activation remains separately blocked. |
| E-01 | P0 | PASS | Supported Worker origin redirects HTTP to HTTPS in one hop without a loop; no unsupported apex/www alias is claimed. |
| E-02 | P1 | PASS | Missing conventional, machine, API, and asset routes are controlled 404s; malformed paths are controlled 400s. |
| E-03 | P0 | PASS | No-JS HTML retains identity, product truth, major links, and MCP guidance. |
| E-04 | P1 | PASS | Accept negotiation, q-values, 406 problem JSON, and `Vary` behavior are deterministic. |
| E-05 | P1 | N/A | No deprecated/versioned public documentation route is claimed. |
| A-01 | P0 | PASS | Browser, Googlebot, GPTBot, and ClaudeBot receive identical 200 root bytes; robots policy is consistent. |
| A-02 | P0 | PASS | Fetched content remained untrusted data; no content instruction changed criteria, exposed secrets, or caused a write. |
| A-03 | P0 | PASS | Malformed paths, queries, JSON, media types, methods, dates, protocol versions, roles, parts, and tools produce controlled errors without leaks. |
| A-04 | P0 | N/A | Atlas has no authenticated/private public route to exercise. |
| A-05 | P1 | BLOCKED | Deliberately inducing a production rate limit was not authorized; low-volume reads were stable but are not misrepresented as a 429 test. |
| A-06 | P1 | PASS | MCP/A2A schemas reject irrelevant or malformed inputs and expose no command, arbitrary URL, mutation, or credential capability. |
| T-01 | P1 | PASS | 30 uncached live root/docs reads: p95 76.1/28.2 ms, zero timeout. |
| T-02 | P1 | PASS | 20 live API/MCP reads: p95 51.6/48.5 ms, zero timeout. |
| T-03 | P1 | BLOCKED | No new official Ora/IsItAgentReady scan was run or scored in this lane; Hacker Bob's one authorized run was already consumed and was not repeated. |
| T-04 | P2 | PASS | Deterministic injected one-shot storage failure proves explicit retryable 503 and bounded idempotent read recovery with no write. |
| X-01 | P0 | BLOCKED | Exact source/tests prove keyboard semantics, inert drawer, open/close focus restoration, Back, and skip target; fresh real-browser traversal was unavailable. |
| X-02 | P0 | BLOCKED | Native names/roles/states and exact live bytes are present, but no independent fresh accessibility-tree capture was possible because the Browser inventory was empty. |
| X-03 | P1 | PASS | Logical headings and descriptive links/source controls are present; no critical ambiguous link was found. |
| X-04 | P1 | PASS | Loading/empty states use status semantics, failures use alert text, and story transitions move focus sensibly; no form flow is claimed. |
| L-01 | P0 | PASS | Root and human docs declare `lang=en`, matching the sole supported locale. |
| L-02 | P1 | N/A | No additional locale is supported or claimed. |
| L-03 | P1 | N/A | Single-locale product; no localized fact set exists. |
| L-04 | P1 | N/A | No locale switcher, localized route, or locale negotiation is claimed. |
| L-05 | P2 | N/A | No RTL locale exists. |

## Remaining limits

1. **Runtype eval authorization — BLOCKED/PARTIAL.** The authorized eval-only
   credential authenticated to the correct organization but the provider
   rejected both displayed eval scopes with 403. The five suites do not exist,
   no eval ran, and all Runtype surfaces must remain draft.
2. **Fresh browser keyboard/accessibility capture — BLOCKED.** Exact assets and
   deterministic tests pass, and the release ledger contains prior browser
   evidence, but this independent lane had no available Browser window.
3. **Production rate-limit induction — BLOCKED.** It was not safe or authorized
   to force a 429 on the public Worker.
4. **Official Ora/IsItAgentReady result — BLOCKED.** No fresh external score or
   readiness level was produced; none is claimed here.

These are explicit evidence limits, not hidden product failures. Any product,
runtime, deployment, data, or public-contract change after candidate
`6ba765e3d76d11dba4093c83b22febf441e1a7f8` invalidates this verdict and requires
a new affected-surface verification.
