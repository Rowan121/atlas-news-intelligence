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
`http://localhost:8787`). The default globe bundles public-domain Natural Earth
country geometry and a coordinate graticule, so it remains legible without a tile
service. `VITE_MAP_STYLE_URL` may opt into a richer MapLibre provider style; Atlas
keeps the reference geography beneath its news layers.

The runtime validator in `src/api.ts` is the canonical UI-side contract. It keeps
event locations, publisher origins, and each source's singular primary editorial
market as separate dimensions and refuses malformed records. An observed
editorial market carries one region, confidence, method, and cited evidence;
otherwise it remains explicitly unknown. Source framing/tone and cluster
conflict/omission signals likewise carry assessed status and provenance.
Event-region prominence declares its basis and denominators; story heat is
unavailable unless source records contain observed editorial-market evidence. A
heat coordinate remains null unless that same editorial-market assessment
supplied coordinates with confidence, method, and evidence. Event markers and
publisher origins are never heat or coordinate fallbacks. A
missing endpoint renders a visible connection-pending state. It never falls back to
mock news; deterministic records live only in test files.

## Commands

```bash
npm install
npm test
npm run build
npm run dev
```
