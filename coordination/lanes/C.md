# Lane C — Surface/Runtime

State: READY FOR COORDINATOR INTEGRATION

## Current contract

Serve the canonical truth store through a Cloudflare Worker, D1, REST,
MCP, and Runtype-ready machine surfaces. The browser contract is available at
`GET /api/v1/intelligence?window=6h|24h|7d&prominence=raw|normalized` and
never substitutes fixture or fallback stories when storage is empty.

## Receipts

- `8dc6fa6` — `feat(surface): add Worker, D1, MCP, and Runtype interfaces`
  - 26/26 Worker, D1-store, MCP, error-envelope, CORS, and Cotal provenance
    tests pass.
  - Strict TypeScript typecheck passes.
  - The UI snapshot adapter preserves cited event location separately from
    publisher origin and returns an honest 503 when no current truth exists.
  - External Cloudflare and Runtype writes remain unexecuted exact drafts in
    `surface/EXTERNAL_PAYLOAD_DRAFTS.md`.

## Dependencies / blockers

- No implementation credential blocker.
- Existing-account Cloudflare and Runtype OAuth is required only after Rowan
  separately approves the exact resource and publish payloads.

## HITL_REQUIRED

None beyond the canonical queue in `COORDINATION.md`.
