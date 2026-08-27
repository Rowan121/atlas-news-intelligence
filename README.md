# Atlas News Intelligence

Atlas is an analyst-grade public explorer for current global news. It maps real stories to event locations, clusters related coverage across outlets, compares publisher geography, and exposes raw versus normalized regional prominence, undercoverage, disagreement, freshness, and confidence.

## Locked product defaults

- Event location is the primary geography; publisher origin is a comparison layer.
- Rolling 24 hours is the default window.
- Raw coverage volume and source-normalized prominence appear side by side.
- Every mapped claim must preserve evidence, source identity, retrieval time, and uncertainty.
- The product uses live data only. Test fixtures never power the deployed UI.

## Planned stack

- React + TypeScript + MapLibre GL JS
- Cloudflare Workers, D1, and Queues
- GDELT discovery plus Tavily retrieval/enrichment
- Runtype API/MCP/A2A product surface and evals
- Cotal multi-agent coordination and provenance

See [COORDINATION.md](./COORDINATION.md) for the execution contract and [AGENT_TERMINAL_PROMPTS.md](./AGENT_TERMINAL_PROMPTS.md) for the approved agent lanes.
