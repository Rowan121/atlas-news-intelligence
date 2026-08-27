# Lane A — Atlas/Data

State: INTEGRATED — SAME-STORY CONTRACT VERIFIED LOCALLY

## Current contract

Deliver the smallest real Atlas truth layer: canonical article/cluster/location/claim schema, live-source clients, evidence-backed event geolocation, explainable hybrid clustering, source-normalized regional prominence, a validated 24-hour truth slice, and a truthful cross-regional SAME-STORY comparison contract.

## SAME-STORY integration decision

- Event location, publisher origin, outlet coverage market, and measured audience exposure are separate fields and never proxy for one another.
- Source comparison assessments use observed/unknown discriminated records carrying value, confidence, method, evidence, and reason.
- GDELT coverage-market, audience, framing, and tone values remain unknown because the current raw stream does not supply defensible evidence for them.
- Event-region prominence declares `basis: event_location`, retains raw and source-normalized components and denominators, and explicitly disclaims audience reach.
- Coverage heat is computed only from observed coverage-market assessments; otherwise it is unavailable. Conflict requires opposed cited claims from distinct publishers; omission is not assessed without a regional baseline.
- Surface collapses duplicate summary rows by cluster id and chooses one primary event-location candidate by confidence, evidence count, then stable location id while retaining other cited candidates.

## Receipts

- `10a894e` — `feat: add evidence-backed news truth layer`
  - 42 deterministic tests pass across schema, ingestion, geolocation, clustering, prominence, pipeline, and truth-slice selection.
  - `npm run typecheck` passes under strict TypeScript settings.
  - Product paths contain no demo or fallback story data; deterministic fixtures are confined to `test/`.
  - Tavily accepts an injected key but no credential was read, printed, or committed.
  - GDELT live probe was attempted twice with backoff: the first direct curl timed out and the implemented probe later returned a network-level `fetch failed`. The pipeline represented both failures honestly and created no records.
  - Key artifacts: `docs/DATA_CONTRACT.md`, `src/schema/types.ts`, `src/ingestion/`, `src/geolocation/geocoder.ts`, `src/clustering/engine.ts`, and `src/prominence/metrics.ts`.
- `248046f` — `feat(data): ingest article-linked GDELT event streams`
  - Full root suite passes: 52/52 tests plus strict TypeScript.
  - A no-key live run joined the official 15-minute Events, Mentions, and GKG
    files for batch `20260827063000` into 100 capped clusters and 125 articles.
  - The live slice spans 23 event-country codes and contains 9 multi-outlet
    clusters; health is honestly `degraded` only because the requested
    100-cluster cap omitted lower-ranked clusters.
  - Exact `GlobalEventID` and `MentionIdentifier` joins preserve evidence,
    publisher identity, mention confidence, freshness, and source attribution.

## Dependencies / blockers

- No credential blocker. The GDELT raw stream is reachable and verified.
- Coordinator integration is merging obvious duplicate GDELT event IDs and
  exporting the validated snapshot to the D1 schema without any remote write.

## HITL_REQUIRED

None beyond the canonical queue in `COORDINATION.md`.
