# Atlas News Intelligence

Atlas is an analyst-grade public explorer for current global news. It maps real stories to event locations, clusters the same event across outlets, and compares how much and how differently outlets in distinct primary editorial markets cover it, with raw/source-normalized prominence, disagreement, freshness, and evidence confidence.

## Release status

**P0 refresh verified locally; production update pending the independent predeploy gate.** The existing origin is `https://atlas-news-intelligence-api.atlas-news-surface.workers.dev`, backed by the existing `atlas-news-intelligence-prod` D1 database. It still serves the superseded candidate until the approved atomic D1 refresh and Worker update complete. Runtype is not yet active. Exact approved payloads, resource IDs, hashes, ordering, and remaining gates are recorded in [`surface/EXTERNAL_PAYLOAD_DRAFTS.md`](surface/EXTERNAL_PAYLOAD_DRAFTS.md).

The live GDELT loader produces a validated JSON snapshot, and the deterministic `seed:d1` bridge converts it into batch-scoped D1 SQL. The production composer hash-checks that seed and adds only the explicitly approved retirement of the superseded run. Remote execution remains blocked until Agent D passes the exact frozen tree. Tests use explicitly test-only fixtures; product code never substitutes them when live data is absent.

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Data and truth pipeline | `src/` | Fetch GDELT/Tavily inputs, preserve evidence, geolocate events, cluster stories, and calculate raw/normalized prominence. |
| Live GDELT one-shot loader | `src/ingestion/gdelt-stream/`, `scripts/load-gdelt-snapshot.ts` | Download and verify one coherent Events/Mentions/GKG batch, join it, enforce truth gates, and write one bounded JSON artifact. |
| Public explorer | `ui/` | React, TypeScript, Vite, and MapLibre globe; requests the typed intelligence endpoint and renders explicit loading, stale, empty, and error states. |
| API and agent surface | `surface/` | Cloudflare Worker with REST, MCP, read-only A2A, health, D1 access, Cotal/sponsor receipts, machine discovery, schema, and the draft Runtype product definition. |
| Release shell | root `package.json`, `.github/workflows/ci.yml` | Reproducible install/check/test/build gate across all three packages. |

The deployment shape is one Cloudflare Worker plus one static-asset bundle. Cloudflare serves `ui/dist` and performs the SPA fallback; requests under `/api/*`, plus `/health` and `/mcp`, run the Worker first. This keeps browser routes and hashed assets on the static path while ensuring API-like navigations never fall through to `index.html`.

```text
GDELT (+ optional Tavily enrichment)
        │
        ▼
evidence-preserving pipeline ──► validated snapshot / verified D1 refresh
                                            │
                                            ▼
                       Cloudflare Worker: REST + MCP + A2A + health
                                            │
                                            ▼
                              MapLibre analyst explorer
```

## One-command release verification

From the repository root, run:

```bash
npm run verify:release
```

That one command performs clean lockfile installs for the data package, UI, and Surface; typechecks and tests each applicable package; emits the data package build; builds the Vite UI; and runs a Wrangler deployment dry-run that bundles the Worker with `ui/dist`. It does not authenticate, deploy, write D1, publish Runtype, call paid APIs, or use secrets.

Node.js 22 is the CI baseline. The same command runs in GitHub Actions with read-only repository permissions and npm dependency caching.

### Individual local commands

```bash
# Data package
npm ci
npm run typecheck
npm test
npm run build

# UI
npm --prefix ui ci
npm --prefix ui test
npm --prefix ui run build

# Surface
npm --prefix surface ci
npm --prefix surface run check
# Requires ui/dist, produced by the UI build above:
npm --prefix surface run build
```

For interactive local development, build the UI once for Wrangler's asset binding, initialize only the local D1 database, and start the Worker. In a second terminal, Vite can proxy `/api` requests to the Worker.

```bash
npm --prefix ui run build
(cd surface && npx wrangler d1 execute atlas-news-intelligence-local --local --file schema/schema.sql)
npm --prefix surface run dev

# Separate terminal:
npm --prefix ui run dev
```

Local D1 files and Wrangler state are ignored by Git.

## Live GDELT one-shot workflow

No key is required for the public GDELT stream. The bounded command below reads the latest coherent 15-minute batch and writes a local artifact:

```bash
npm run snapshot:gdelt -- --output artifacts/gdelt-latest.json --max-clusters 200
```

It follows this sequence:

1. Fetch and validate `lastupdate.txt` from `data.gdeltproject.org`.
2. Select exactly one matching Events, Mentions, and GKG batch.
3. Enforce compressed/decompressed size limits, timeouts, retries, and MD5 checks.
4. Join primary web mentions to events and GKG documents.
5. Keep only records that pass event-location, confidence, raw-text, title, and source gates.
6. Validate each emitted story against the Atlas contract and write an explicit success/failure envelope.

For a smaller read-only Document API connectivity probe:

```bash
npm run probe:gdelt -- "earthquake"
```

Neither command schedules polling, persists to D1, deploys, or fabricates fallback stories. See [`docs/GDELT_STREAM.md`](docs/GDELT_STREAM.md) for the join contract and safety bounds.

### Verified local data bridge

```bash
npm run snapshot:gdelt -- --output artifacts/gdelt-latest.json
npm run seed:d1 -- --input artifacts/gdelt-latest.json --output artifacts/gdelt-latest.sql
```

The first command reads the latest public GDELT stream once. The second performs a local, deterministic conversion into the Surface/D1 schema; it makes no cloud write. See [`docs/GDELT_STREAM.md`](docs/GDELT_STREAM.md) for the join, merge, evidence-retention, and idempotency rules.

## Truth and uncertainty rules

- Event location is the primary mapped geography. Publisher origin is a separate comparison layer and is never substituted for event location.
- Same-story heat is based only on each outlet's single evidence-backed primary editorial market. Direct outlet-market documentation is preferred; language plus publisher location may support a lower-confidence assessment. Event location never fills the heatmap.
- Audience/readership exposure is out of scope; Atlas makes no reader-location claim.
- Every mapped claim retains source identity, retrieval time, evidence, and geolocation method. Unsupported location precision remains unknown instead of being guessed.
- GDELT's documented event-country codes are preserved as provider codes; they are not silently relabeled as ISO-3166.
- Cluster membership keeps a reason and confidence. Related coverage is an analytical grouping, not a claim that every article makes the same assertion.
- Raw prominence reports observed coverage volume. Normalized prominence adjusts for source/output imbalance; both remain visible so normalization cannot hide the underlying count.
- “Underreported” and “conflicting” are comparative signals with supporting source records, not verdicts about truth or intent.
- Freshness is explicit. Stale or unavailable upstream data degrades the health state; an empty live result never triggers demo data.
- Test fixtures remain under test paths and cannot power the deployed explorer.

The canonical schema and field-level evidence rules are in [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md).

## Machine discovery

The deployed Worker exposes genuine public capabilities through conventional, no-key discovery routes:

- `/docs` and `/index.md` for HTML/Markdown documentation
- `/llms.txt`, `/robots.txt`, and `/sitemap.xml`
- `/.well-known/api-catalog` plus `/openapi.json`
- `/.well-known/mcp/server-card.json` plus the read-only `/mcp` endpoint
- `/.well-known/agent-card.json` plus the read-only `/a2a/message:send` endpoint

These surfaces are locally tested but are not claimed live until Cloudflare deployment and independent invocation evidence exist. The release-lane applicability audit and exact remaining blockers are in [`docs/RELEASE_READINESS.md`](docs/RELEASE_READINESS.md).

## Product defaults

- Event-location globe as the initial view
- Rolling 24-hour window
- Raw and source-normalized prominence shown together
- Analyst-grade public explorer
- Real records only, with visible freshness and uncertainty

See [`COORDINATION.md`](COORDINATION.md) for the execution contract and [`AGENT_TERMINAL_PROMPTS.md`](AGENT_TERMINAL_PROMPTS.md) for the approved agent lanes.
