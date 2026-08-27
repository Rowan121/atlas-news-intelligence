# Lane A — Atlas/Data

State: COMPLETE — LOCAL RECOVERY READY FOR COORDINATOR REVIEW

## Current contract

Deliver the smallest real Atlas truth layer: canonical article/cluster/location/claim schema, live-source clients, evidence-backed event geolocation, explainable hybrid clustering, source-normalized regional prominence, and a validated 24-hour truth slice.

## Receipts

- `10a894e` — `feat: add evidence-backed news truth layer`
  - 42 deterministic tests pass across schema, ingestion, geolocation, clustering, prominence, pipeline, and truth-slice selection.
  - `npm run typecheck` passes under strict TypeScript settings.
  - Product paths contain no demo or fallback story data; deterministic fixtures are confined to `test/`.
  - Tavily accepts an injected key but no credential was read, printed, or committed.
  - GDELT live probe was attempted twice with backoff: the first direct curl timed out and the implemented probe later returned a network-level `fetch failed`. The pipeline represented both failures honestly and created no records.
  - Key artifacts: `docs/DATA_CONTRACT.md`, `src/schema/types.ts`, `src/ingestion/`, `src/geolocation/geocoder.ts`, `src/clustering/engine.ts`, and `src/prominence/metrics.ts`.

## Dependencies / blockers

- No credential blocker. GDELT was unreachable from this host during the live probe; coordinator/runtime should re-run `npm run probe:gdelt -- <query>` from the deployment environment before claiming live-source success.

## HITL_REQUIRED

None beyond the canonical queue in `COORDINATION.md`.
