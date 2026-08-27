# Lane A — Atlas/Data

State: INTEGRATED — SAME-STORY CONTRACT VERIFIED LOCALLY

## Current contract

Deliver the smallest real Atlas truth layer: canonical article/cluster/location/claim schema, live-source clients, evidence-backed event geolocation, explainable hybrid clustering, source-normalized regional prominence, a validated 24-hour truth slice, and a truthful cross-regional SAME-STORY comparison contract.

## SAME-STORY integration decision

- Event location, publisher origin, and an outlet's single primary editorial market are separate fields and never proxy for one another. Audience/readership telemetry is out of scope.
- Source comparison assessments use observed/unknown discriminated records carrying value, confidence, method, evidence, and reason.
- A primary editorial market is observed only from documented outlet-market evidence, a validated combination of outlet language plus publisher location, or a manual confirmation. Unverified outlets remain explicitly unknown.
- Event-region prominence declares `basis: event_location`, retains raw and source-normalized components and denominators, and explicitly disclaims audience reach.
- Same-story coverage heat declares `basis: editorial_market` and is computed only from observed per-outlet editorial-market assessments; otherwise it is unavailable. Conflict requires opposed cited claims from independent publisher networks, not merely different outlet domains under one parent; omission is not assessed without a regional baseline.
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
- `d19e0ec` + `a30f5a9` — primary editorial-market contract and current outlet registry
  - The singular `editorialMarket` assessment replaces legacy plural coverage and audience fields throughout the data contract.
  - The live GDELT batch `20260827170000` yields 111 clusters and 123 cluster-scoped article records representing 121 distinct canonical URLs. Its 11-article Beyoncé/Colombia relief cluster maps 11 station editions to 11 distinct, cited primary editorial markets.
  - Unknown outlets remain unknown; event location and publisher origin are never substituted.
  - Data verification passes 85/85 tests plus strict TypeScript.
  - The production refresh composes the verified new seed with one explicit retirement of the superseded run, preventing independently normalized batches from being mixed by current reads.

## Dependencies / blockers

- No credential blocker. The GDELT raw stream is reachable and verified.
- The validated P0 snapshot and deterministic D1 seed are ready for the approved
  production refresh; exact hashes are recorded in the release-readiness ledger.

## HITL_REQUIRED

None beyond the canonical queue in `COORDINATION.md`.
