# Agent Natives Builders Hackathon submission receipt

## Outcome

Immersive Commons accepted the separately approved Atlas News Intelligence
submission at `2026-08-27T22:59:39.587Z`. A later read-only `ic_hack_get` and
`ic_hack_me` verification observed event phase `LOCKED` and
`submission.locked: true`.

The submission did not deploy code, change D1, create an account, mint a
credential, or overwrite an earlier Atlas submission. Agent tokens, member IDs,
and team-member IDs are deliberately absent from this public receipt.

## Submitted payload

```json
{
  "title": "Atlas News Intelligence",
  "blurb": "Atlas maps current global stories, clusters the same event across independently owned outlets, and compares how differently primary editorial markets cover it with evidence-backed heatmaps, tone, claims, contradictions, omissions, citations, and source-normalized prominence.",
  "repo_url": "https://github.com/Rowan121/atlas-news-intelligence",
  "demo_url": "https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/",
  "agent_surface": "Public MCP: https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/mcp ; A2A: https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/.well-known/agent-card.json ; OpenAPI: https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/openapi.json"
}
```

No optional `folder_id` was supplied.

## Verified public status

| Field | Value |
| --- | --- |
| Event | `anb-hack-01` |
| Team | `Atlas News Intelligence` |
| Team ID | `t_7ce870f710b12b49` |
| Submitted at | `2026-08-27T22:59:39.587Z` |
| Event phase after lock | `LOCKED` |
| Submission locked | `true` |
| Repository | <https://github.com/Rowan121/atlas-news-intelligence> |
| Demo | <https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/> |

The initial write response returned `locked: false` while submissions were
still open. The later read-only verification returned `locked: true`; no second
write or overwrite was made.

## Truth boundary

This receipt proves that the event system accepted and subsequently locked the
payload above. It does not convert outstanding Ora, IsItAgentReady, Runtype
eval, or deployment-version verification items into passes. Those limitations
remain documented in the README and release records.

The matching sanitized machine receipt is
[`receipts/hackathon-submission-2026-08-27.json`](./receipts/hackathon-submission-2026-08-27.json).
