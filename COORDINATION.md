# Global News Intelligence — Coordination Ledger

Status: **APPROVED — bootstrap and launch in progress**

HITL owner: **Rowan, through the main Codex task only**

Working window: **five hours after the coordinator arms the build loop**

This is the canonical coordination ledger for the project. Every agent must read it before work and before every new loop. Shared sections are edited only by the main coordinator. Each execution lane writes only its own file under `coordination/lanes/` to avoid merge conflicts; the coordinator folds accepted facts and decisions back into this ledger.

## Mission

Build a production-quality global news intelligence tool that:

- maps current real stories to their **event locations** on a polished interactive globe;
- distinguishes event location from publisher origin and audience region;
- clusters coverage of the same event across outlets and languages;
- shows raw and normalized regional prominence;
- exposes source disagreement, coverage gaps, and confidence/evidence;
- ships a real browser product plus machine-facing Runtype API/MCP/A2A surface;
- uses Cloudflare for the deployed application and Cotal for agent coordination.

No stub, fabricated, or demo-only records may appear in the product. Deterministic fixtures may exist only in automated tests and must be clearly labeled there.

## Locked safety and authority rules

1. The main Codex task is the only human-in-the-loop route.
2. Agents never contact Rowan directly and never make product decisions that are recorded as `HITL_REQUIRED`.
3. Reads and local reversible work are allowed. Any application, submission, account creation, message, credential request, paid action, GitHub repository creation, Cloudflare deploy, Runtype publish, Cotal team mutation, or other external write requires the main coordinator to show Rowan the exact payload first and receive approval.
4. Never reveal, print, commit, transmit, or copy secrets from `/Users/rowancooper/.codex/hackathon-keys.env` into logs, prompts, source code, screenshots, or coordination files.
5. Prefer hackathon-issued/platform credits. Personal model keys and personal billable providers are forbidden unless Rowan explicitly approves a named provider, model, budget, and action.
6. On ambiguity that changes product behavior, cost, public exposure, data truth, or architecture, record `HITL_REQUIRED` and move to an independent task.
7. One agent owns one task edge at a time. No duplicated implementation unless the coordinator explicitly requests a blind comparison.

## Approved topology

```text
                               Rowan (HITL)
                                    |
                       Main Codex coordinator/merger
                         /          |           \
                        /           |            \
          A — Atlas/Data      B — Globe/UI    C — Surface/Runtime
          isolated worktree   isolated worktree isolated worktree
                 \                 |                 /
                  \_________ artifacts + receipts __/
                                    |
                         D — Proof Gate (read/run)
                         independent final verifier
```

Dominant risks: correlated factual errors in geolocation/clustering and merge races between the data, UI, and deployment surfaces. Three fenced writers plus a separate proof gate address both.

## Approved runtime and model placement

All four execution seats use **Cotal-hosted agents on Tenki sandboxes with Nebius platform-issued model access**, not local Claude or Rowan's personal provider keys. Model variants were observed in the live Cotal hosted-agent model list.

| Seat | Model variant | Lane | Write authority |
|---|---|---|---|
| Main | Existing Codex task (runtime model is app-managed) | Coordinator, HITL router, merge owner | Main checkout only |
| A | Qwen3.5-397B-A17B | Live sources, canonical schema, geolocation, clustering, prominence | Worktree A only |
| B | Kimi K2.7 Code | Globe, interaction design, accessible responsive UI | Worktree B only |
| C | DeepSeek V4 Pro | Workers API, persistence, Runtype surfaces/evals, Cotal/Cloudflare integration | Worktree C only |
| D | Hermes 4 405B | Adversarial factual, product, security, and rubric verification | Read/run only |

If a named model is unavailable at launch, the coordinator must present the replacement and rationale before spawning that seat. No silent fallback to a personal provider.

## Communication layer

- Cotal team channel: `team.rowan`.
- Proposed lane subjects: `news.data`, `news.ui`, `news.surface`, `news.verify`, and `news.hitl`.
- Agents publish compact receipts: `{agent, task_id, commit, tests, artifact_paths, evidence_urls, blockers, next}`.
- Only the coordinator writes decisions into the Decision Log below.
- Telegram is intentionally out of scope. HITL questions remain in this Codex task and `news.hitl`.

## Product truth contract

Every story cluster must preserve:

- `cluster_id`, canonical title, and first/last observed timestamps;
- event locations with latitude/longitude, location type, confidence, and supporting source spans;
- publisher identity, publisher origin, article language, URL, publication time, and retrieval time;
- cluster membership confidence and the features/evidence that caused the match;
- raw outlet/article count and normalized regional prominence;
- extracted conflicting claims with links and verbatim snippets kept within legal quotation limits;
- freshness and pipeline health indicators.

The interface must never imply that a publisher's headquarters is where an event happened. Uncertain geolocation stays visible as uncertain.

## Approved initial technical direction

- Discovery: GDELT for broad multilingual/global coverage; Tavily `news` search and extraction for fresh retrieval/enrichment.
- Processing: deterministic URL/source normalization, evidence-backed location extraction, hybrid entity/time/embedding clustering.
- Web: TypeScript + React and MapLibre GL JS globe projection.
- Cloudflare: Workers API, D1 source-of-truth records, Queues for ingestion; R2 for raw snapshots if needed; Vectorize only after a measured clustering need.
- Runtype: a real product capability exposed through API plus MCP or A2A, backed by evals over real records.
- Cotal: actual agent coordination/provenance, not merely a logo or unused dependency.

## Smallest deployable sequence

1. **Truth slice:** live endpoint returns one real, cited, geolocated story cluster with multiple sources.
2. **Globe slice:** deployed globe renders that cluster and a source-comparison drawer.
3. **Coverage slice:** multiple regions, raw + normalized prominence, time-window selector.
4. **Analysis slice:** disagreement and undercoverage signals with explicit evidence/confidence.
5. **Agent-native slice:** Runtype API/MCP/A2A capability for querying the same live intelligence graph.
6. **Proof slice:** independent verification, security scan, performance/accessibility, demo receipt.

Every slice is independently deployable; downstream work may not require an unmerged chain of speculative dependencies.

## Agent loop

Every agent repeats:

1. **Orient:** read this ledger, its own lane file, current graph/messages, and dependency receipts.
2. **Research:** use primary sources and inspect the actual repository/runtime. Never guess an API.
3. **Contract:** name one bounded deliverable, dependencies, acceptance checks, and owned files.
4. **Build:** implement the smallest deployable change in the owned worktree.
5. **Exercise:** run proportionate local tests and capture evidence; this is not final verification.
6. **Receipt:** atomic commit, update only the lane file, and send the receipt to Cotal.
7. **Idle:** poll for dependencies without making paid/API calls; remain addressable through the five-hour window.

Agent D performs the only final verification after candidate artifacts are frozen. Verification is the final project stage.

## Shared success checks

- At least three materially different geographic regions have real current clusters.
- A cluster can show multiple independent outlets when such coverage exists.
- Clicking a globe region explains why stories dominate there and shows both raw and normalized measures.
- Conflicting-coverage signals quote/link the underlying evidence and expose uncertainty.
- Refresh timestamps, failure states, source counts, and pipeline health are visible.
- UI works on desktop and mobile, keyboard navigation is usable, and reduced motion is respected.
- Public deployment contains no secrets and survives an empty/partial upstream response.
- Runtype surface invokes real project capability and has passing eval receipts.
- Cotal logs demonstrate real cross-agent coordination.
- Final submission remains a separate Rowan-approved action.

## Lane status

| Lane | State | Current task | Dependency/blocker |
|---|---|---|---|
| A — Atlas/Data | ACTIVE | Live source and truth-slice contract | GitHub artifact-transfer path |
| B — Globe/UI | ACTIVE | Globe shell and analyst journey | Data contract from A |
| C — Surface/Runtime | ACTIVE | Local Worker/Runtype definitions | Existing-account Cloudflare/Runtype OAuth at publish |
| D — Proof Gate | ACTIVE/BLIND | Verification plan only | Frozen candidate build |

## HITL queue

No open product-choice questions. Pause only if a genuinely required credential is missing or a new consequential choice arises.

## Decision log

| Time | Decision | Owner | Evidence/rationale |
|---|---|---|---|
| 2026-08-26 | A–D topology and proposed hosted models approved | Rowan | Explicit approval in the main Codex task |
| 2026-08-26 | Event location is the default; publisher origin is a comparison layer | Rowan | Explicit approval |
| 2026-08-26 | Analyst-grade public explorer, rolling 24h default, raw + normalized prominence | Rowan | Explicit approval |
| 2026-08-26 | GitHub repository is public `rowan121/atlas-news-intelligence` | Rowan | Explicit approval |
| 2026-08-26 | Telegram removed; do not spend more time obtaining API keys | Rowan | Explicit instruction |
| 2026-08-26 | Four hosted agents launched: `atlas_data`, `globe_ui`, `surface_runtime`, `proof_gate` | Main | Cotal Graph reports all four working on approved Nebius variants |
| 2026-08-26 | Fixed access matrix frozen at `docs/API_ACCESS.md` | Main | Bounded audit; no critical live-news key missing |

## External references used for the initial hypothesis

- GDELT GEO API: https://blog.gdeltproject.org/gdelt-geo-2-0-api-debuts/
- GDELT DOC API: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Cloudflare Queues: https://developers.cloudflare.com/queues/
- Cloudflare Vectorize: https://developers.cloudflare.com/vectorize/reference/what-is-a-vector-database/
- Tavily API: https://docs.tavily.com/documentation/api-reference/introduction
- Runtype: https://docs.runtype.com/
