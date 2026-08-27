# Atlas News Intelligence — Early Applicability Checklist

Status: **early source gate, not a deployment certification**

Commit: `35cbae393511dc594f3247ba7a6abea88f019f55`

Criteria: all 959 lines of `ORA THING.md`, SHA-256 `fdc461c0b6060047163b3b91d280f1c449fe932aaab2936a0ba4b6cbc6e48f62`, used only as evaluation criteria.

Method: read-only review in a detached worktree plus one local Worker request. No external scans or writes, credential discovery, AIsa, or HUD.

## Classification rule

- **Applicable** — belongs in the product's verification contract now. It may currently pass or fail; this is not itself a pass mark.
- **N/A** — no genuine product capability makes the check relevant. It must not be implemented merely to satisfy a scanner.
- **Blocked** — relevant, but requires a deployed origin, owner policy, approval, or other unavailable authority.
- **Deferred** — legitimate later-stage or advanced work that is not a current release claim and should follow stabilization of canonical surfaces.

The complete 38-test mapping is in `check-matrix.csv`: **23 applicable, 6 N/A, 5 blocked, and 4 deferred**.

## Family-level applicability

| Check family | Classification | Early disposition |
|---|---|---|
| Product truth, security, real-data semantics | Applicable | Core release gate. Data provenance and explicit degradation are strong; public-surface metadata currently overclaims runtime capability. |
| Ordinary homepage and no-JS navigation | Applicable | Current P0 fail: source HTML contains no product identity or ordinary navigation without JavaScript. |
| Human docs and conventional `/docs`/`/api` navigation | Applicable | No canonical docs/navigation surface exists. `/pricing` and `/integrations` are individually N/A because the product claims neither. |
| `robots.txt` | Applicable, policy blocked | The route is expected for a public app, but allow/disallow and Content Signals choices require the owner's policy. |
| `sitemap.xml` | Applicable | No sitemap exists; it must contain only canonical public human pages. |
| HTTP `Link` discovery | Applicable | No discovery links exist. Add only after their REST/MCP/A2A targets are truthful. |
| Markdown content negotiation | Applicable | Absent for key informational pages. Explicit `.md` fallback and `llms.txt` are deferred until canonical docs exist. |
| REST/OpenAPI/API Catalog | Applicable | The REST API is genuine; discoverability is absent. A schema must reflect the different actual envelope shapes. |
| Authentication/OAuth discovery | N/A under current public model; truth resolution blocked | The Worker has no auth. Do not add OAuth metadata unless auth becomes real. The Runtype draft's `api_key` claim is currently false. |
| MCP endpoint | Applicable | Genuine POST `/mcp` with three D1-backed read tools. Discovery metadata is missing and runtime/schema validation needs adversarial testing. |
| A2A endpoint and agent card | Applicable | Explicit target and Runtype claim, but no implementation or card exists. This is a release blocker for an advertised genuine A2A surface. |
| Agent Skills | Deferred | No validated product requirement or skill package yet. |
| WebMCP | N/A for current release | No genuine browser-tool mapping is claimed; REST/MCP already provide machine operation. |
| DNS-AID and ARD | Deferred | Reassess against current specifications only after a live canonical domain and stable surface exist. |
| Web Bot Auth | N/A under public unauthenticated reads | Reclassify only if verified bot identity becomes part of a real access policy. |
| Commerce/checkout/payment protocols | N/A | The product has no pricing, checkout, or commerce capability. |
| Redirects, bot-user-agent behavior, live timing, and external scanners | Blocked | No production origin exists; external scans are explicitly outside this phase. |
| Missing-route and error semantics | Applicable | SPA fallback risks misleading 200 HTML for absent resources; malformed path encoding already causes a false retryable 503. |
| Accessibility | Applicable | Strong native-control baseline, but no-JS access and drawer focus containment/return are unresolved. |
| Localization | Default locale applicable; additional locale/RTL checks N/A | English is the only genuine locale and `lang="en"` is present. |

## Highest-risk gaps, in release order

1. **P0 — The no-JavaScript homepage is empty of product identity and navigation.** `ui/index.html:11-13` supplies a skip link, an empty `#root`, and the module script only. The skip link's `#story-feed` target is also React-rendered. This directly fails F-01/E-03.

2. **P0 — Published-surface truth is internally inconsistent.** `surface/runtype/atlas-product.json:43-45` advertises `api_key` authentication for MCP and A2A, while `surface/src/index.ts` performs no authentication. The same draft advertises A2A despite no A2A route/card, calls REST responses uniformly `wrapped` while `/api/v1/intelligence` returns the snapshot directly (`surface/src/index.ts:143-145`), and describes event-region filtering on a path that exposes only `window` and `prominence` (`surface/runtype/atlas-product.json:17-18`). The draft must not be activated until claims and runtime converge.

3. **P0 — A2A is absent despite being an explicit target.** The Worker routes only health, REST, and MCP. If genuine A2A remains a launch requirement, implement and verify its endpoint/card; otherwise remove the claim rather than shipping a façade.

4. **P0 — Machine discovery and ordinary documentation are absent.** There is no tracked `robots.txt`, sitemap, OpenAPI/API Catalog, MCP card, A2A card, docs route, `Link` discovery, or Markdown representation. This blocks a truthful public machine-readable surface even though REST/MCP runtime code exists.

5. **P0 — SPA fallback can mask missing resources.** `surface/wrangler.jsonc:6-14` enables `single-page-application` fallback and runs the Worker first only for `/api/*`, `/health`, and `/mcp`. Missing discovery files or docs paths may therefore return a 200 app shell instead of a controlled 404 or intended representation. Test the exact combined deployment routing.

6. **P0 — Malformed path encoding is misreported as a transient database failure.** `decodeURIComponent` is unguarded at `surface/src/index.ts:155`; the generic catch at lines 178-182 maps the resulting URI error to retryable `database_unavailable` 503. A local request to `/api/stories/%` reproduced status 503 with that envelope. It should be a controlled, non-retryable 4xx.

7. **P1 — MCP discovery and schema enforcement need hardening.** The endpoint and three tools are real, but discovery is absent and runtime argument checks are looser than the declared JSON Schemas. Final tests should cover unknown fields, wrong types, oversized inputs, malformed timestamps, notification semantics, and unknown methods/tools.

8. **P1 — Drawer focus behavior may not meet modal expectations.** `ui/src/App.tsx:169-197` moves focus to Close and handles Escape, but source review shows no focus trap and no restoration to the invoking story control. Confirm and fix based on a keyboard/accessibility-tree pass.

## Final independent gate after integration

Before publication, rerun the repository verification and test the combined Worker with real seeded D1 data. Then verify:

- no-JS identity/navigation and basic keyboard flow;
- explicit 404/405/406 and malformed-input behavior on every human, REST, MCP, A2A, and discovery route;
- Runtype, OpenAPI/catalog, MCP, and A2A metadata against the exact deployed implementation and auth model;
- batch-scoped deletes, event-versus-publisher geography, provenance, freshness, and degraded health without stub data;
- safe CORS, API/MCP parsing, accessibility-tree names/states, dialog focus containment/return, and live-region announcements;
- canonical redirects, bot policy, low-volume rate-limit behavior, warm/cold timing, and the approved external readiness scans once a real origin exists.

No commerce, extra locale, WebMCP, OAuth, Agent Skills, DNS-AID, or ARD surface should be added merely to increase checklist coverage. Reclassify those only when they become genuine product capabilities.
