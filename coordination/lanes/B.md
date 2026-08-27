# Lane B — Globe/UI

State: READY_FOR_INTEGRATION

## Current contract

The UI requests the versioned live intelligence snapshot at:

`GET /api/v1/intelligence?window=6h|24h|7d&prominence=raw|normalized`

Runtime validation is in `ui/src/api.ts`; full UI-side types are in
`ui/src/types.ts`. Event locations and publisher origins are intentionally
separate fields. Missing/malformed endpoints render honest unavailable or
contract-mismatch states and never fall back to product fixtures.

## Receipts

- `{agent: ui_bridge, task_id: lane-b-recovery, commit: c9511bd, tests: "npm test — 5/5; npm run build — pass", artifact_paths: ["ui/src/App.tsx", "ui/src/GlobeMap.tsx", "ui/src/api.ts", "ui/src/types.ts", "ui/src/styles.css"], evidence_urls: ["https://maplibre.org/maplibre-gl-js/docs/", "https://openfreemap.org/"], blockers: ["Lane A/C must either implement the snapshot contract or coordinate a field adapter before merge"], next: "Coordinator reviews/cherry-picks and aligns live Worker response"}`

## Dependencies / blockers

- Lane A/C response shape is not yet present on the remote branches. The UI is
  integration-ready behind a typed adapter; reconcile contract fields during
  coordinator merge rather than emitting sample news.

## HITL_REQUIRED

None beyond the canonical queue in `COORDINATION.md`.
