# Atlas UI

Responsive React/TypeScript interface for the Atlas global news intelligence graph.

## Live contract

The browser requests:

```text
GET /api/v1/intelligence?window=6h|24h|7d&prominence=raw|normalized
```

Set `VITE_ATLAS_API_BASE_URL` when the API is on another origin, and optionally set
`VITE_ATLAS_INTELLIGENCE_PATH` if the Worker mounts the endpoint elsewhere. During
local development, Vite proxies `/api` to `ATLAS_API_PROXY` (default
`http://localhost:8787`). `VITE_MAP_STYLE_URL` may replace the no-key OpenFreeMap
Liberty style.

The runtime validator in `src/api.ts` is the canonical UI-side contract. It keeps
event locations, publisher origins, cited outlet coverage markets, and measured
audience exposure as separate dimensions and refuses malformed records. Source
framing/tone and cluster conflict/omission signals carry an observed/unknown or
assessed/not-assessed status with confidence, method, evidence, and reason.
Event-region prominence declares its basis and denominators; coverage heat is
unavailable unless source records contain cited coverage-market evidence. A
coverage-heat coordinate remains null unless that same market assessment
supplied coordinates with confidence, method, and evidence. Event markers and
publisher origins are never coordinate fallbacks. A
missing endpoint renders a visible connection-pending state. It never falls back to
mock news; deterministic records live only in test files.

## Commands

```bash
npm install
npm test
npm run build
npm run dev
```
