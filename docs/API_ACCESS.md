# Fixed API access matrix

Checked: 2026-08-27 PDT

This matrix is frozen for the build. Agents must use the working set and must not spend time hunting for new keys. If an essential credential is genuinely missing, stop the build and route the exact blocker to Rowan.

| Service | Access now | Credit/access reality | Build use |
|---|---|---|---|
| Immersive Commons | Working bearer token | Hackathon reads/team/submission scopes are reachable; consequential calls remain approval-gated | Event status only; no key polling |
| GitHub | Working CLI login as `Rowan121` | Public repository created | Source control and atomic branches |
| GDELT | No key required | Public global news APIs | Broad multilingual discovery and geo signals |
| MapLibre GL JS | No key required | Open-source browser globe | Primary globe renderer |
| Tavily | Working API key | Live `/usage` reports Researcher plan with 1,000 credits; advertised event add-on is not reflected | Fresh news search/extraction; target budget 800, reserve 200 |
| Cotal | `hack` mesh reachable; this machine lacks user-auth material for a live snapshot | No builder credits by design; $300 judged prize | Coordination/provenance only when a sanitized receipt is available |
| Tenki | Working key; hosted sandboxes active | $110 was last observed, while event copy advertises $100 | Hosted Cotal sandboxes; direct use only if necessary |
| Nebius | No direct key | Working indirectly through Cotal platform-issued Token Factory access | Models for hosted agents; never seek a direct key |
| Runtype | Working existing signed-in account; Atlas product/capability/surfaces created; one user-authorized eval-only management key | $5 promo balance and estimated bill $0 observed; eval usage remains 0/100 | Final A2A capability succeeds; named eval creation is blocked by Runtype returning 403 for the key's displayed `EVALS:READ`/`EVALS:WRITE` scopes, so surfaces stay draft |
| Mitosis | Working key | 500 account credits were last observed; event publishes no builder-credit offer | Optional provenance/memory if it materially improves the product |
| AIsa | Excluded from this build | $1 trial was last observed, not the advertised $100 | Do not use |
| Cloudflare | Working saved existing-account OAuth with Wrangler 4.127.0 | Existing production Worker and D1 only; no replacement resource or key | Approved atomic D1 refresh and final Worker deployment complete |
| Hacker Bob | No API key by design | One authorized scan consumed | HSTS/clickjacking observations remediated; do not rerun |
| HUD | Excluded from this build | Overall-winner training credits, not build money | Do not use |

## Non-negotiable access rules

- Never print, commit, message, or copy credential values.
- Do not request or mint any additional key beyond the one explicitly authorized `Atlas Eval Gate 2026-08-27` credential.
- Never attach a personal model/provider key to Cotal or Runtype.
- Use no-key public sources first, then fixed hackathon credits.
- Runtype and Cloudflare may use only their existing-account OAuth flows.
- If either OAuth flow fails at the required publish step, stop the entire build and notify Rowan rather than creating an account or finding another key.
