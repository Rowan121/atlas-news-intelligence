# Atlas event-ecosystem usage ledger

Atlas used multiple companies and resources from the Agent Natives Builders
Hackathon ecosystem. This ledger preserves that work without pretending every
provider is part of the production request path or that every historical action
has the same strength of receipt.

The event page groups hosts, organizers, sponsors, and challenge providers in
different ways. “Event ecosystem” below is intentionally broader than a legal
or commercial definition of sponsor.

## Evidence levels

- **Machine receipt**: a sanitized provider response, invocation result, or
  deployed-system receipt is tracked in this repository.
- **Coordination/provider observation**: the coordinator observed the provider
  performing the work, and the project ledger records it, but a portable
  provider-generated invocation receipt was not retained.
- **Authenticated exercise**: the account or official SDK was genuinely used,
  but the evidence does not establish a shipped Atlas integration.

Configuration, an available key, and an account balance are never treated as
usage by themselves. Numeric usage is stated only where it was actually
observed, and no credential value is stored here.

## Event-listed resources actually used

| Resource | How Atlas used it | Evidence level and repository evidence | Truth boundary |
| --- | --- | --- | --- |
| **Immersive Commons** | Official hackathon status, team, capability, and submission-contract reads, followed by one separately approved final submission and read-only post-lock verification. | Machine receipt: [`HACKATHON_SUBMISSION_2026-08-27.md`](./HACKATHON_SUBMISSION_2026-08-27.md) and [`hackathon-submission-2026-08-27.json`](./receipts/hackathon-submission-2026-08-27.json); coordination context: [`API_ACCESS.md`](./API_ACCESS.md) and [`COORDINATION.md`](../COORDINATION.md). | Exactly one Atlas submission was created. No later overwrite, application, account creation, event message, credential disclosure, or unrelated event write is claimed. |
| **Cloudflare** | Existing Worker and D1 production hosting, static assets, security headers, REST, MCP, and A2A. | Machine receipts: [`production-version-2026-08-27T2209Z.json`](./receipts/production-version-2026-08-27T2209Z.json), [`production-smoke-2026-08-27.json`](./receipts/production-smoke-2026-08-27.json), and the [production release receipt](./PRODUCTION_RELEASE_2026-08-27.md). | Product commit `586d818` is live; this later attribution-ledger commit is documentation-only. |
| **Cotal** | Build-workforce coordination through the existing `hack` mesh and `team.rowan`; four hosted Atlas seats were observed working. A later recovery message was broker-accepted. | Coordination record plus machine recovery receipt: [`COORDINATION.md`](../COORDINATION.md#decision-log), [`cotal-recovery-2026-08-27.json`](./receipts/cotal-recovery-2026-08-27.json), and [`cotal-actor-spawn-recovery-2026-08-27.json`](./receipts/cotal-actor-spawn-recovery-2026-08-27.json). | The later manager recovery failed, the recovery message's recipient delivery was not verified, and the production D1 run has no embedded Cotal receipt. Those limits do not erase the earlier build coordination. |
| **Nebius** | Platform-issued model access for the Cotal-hosted Atlas agents. | Coordination/provider observation: the approved topology and four-agent launch are recorded in [`COORDINATION.md`](../COORDINATION.md#approved-runtime-and-model-placement). | No direct Nebius key was used or sought, and no numeric model usage is claimed. |
| **Tenki** | Sandbox substrate for the Cotal-hosted Atlas agents; the hosted-agent flow displayed a live Atlas sandbox. | Coordination/provider observation recorded in [`COORDINATION.md`](../COORDINATION.md#approved-runtime-and-model-placement) and the machine-readable ledger below. | No portable sandbox/job identifier or defensible before/after credit delta is in the repository. Direct account probes are not substituted for proof of Cotal-owned sandbox usage. |
| **Tavily** | Bounded current-news search, extraction, and source verification for a local recovery/enrichment candidate. | Machine receipts: [`tavily-recovery-2026-08-27.json`](./receipts/tavily-recovery-2026-08-27.json), [`data-recovery-local-2026-08-27.json`](./receipts/data-recovery-local-2026-08-27.json), and [`cotal-pipeline-handoff-2026-08-27.json`](./receipts/cotal-pipeline-handoff-2026-08-27.json). | Three advanced searches returned 21 results; six extracts succeeded; two articles were accepted and 19 candidates rejected. The provider meter stayed `2 → 2`, so no paid-credit delta is invented. This candidate was not deployed. |
| **Mitosis Labs** | The existing account and official SDK were authenticated and exercised during the build; the SDK returned one ready office and a credit balance. | Authenticated provider observation, preserved in the [machine-readable ledger](./receipts/event-ecosystem-usage-2026-08-27.json). | The observed balance was `499.651 / 500`, but the `0.349` difference is not attributed to Atlas. No Mitosis path exists in the shipped runtime, so this is build/tool usage rather than a production integration claim. |
| **Runtype** | Existing-account Atlas product, capability, API/MCP/A2A surfaces, and a successful production A2A debug execution. | Machine receipt: [production release](./PRODUCTION_RELEASE_2026-08-27.md#runtype-receipt) and [`runtype-eval-gate-2026-08-27.json`](./receipts/runtype-eval-gate-2026-08-27.json). | The five named eval suites were not created or run because Runtype returned HTTP 403 for the displayed eval scopes. All surfaces remain draft and eval usage remains `0/100`. |
| **Hacker Bob** | One authorized production HTTP security scan; its HSTS and clickjacking observations drove the final header remediation. | Sanitized release record and independent live-header verification in the [production release](./PRODUCTION_RELEASE_2026-08-27.md#security) and [Agent D report](../.agent-readiness/final-production-verification.md). | The raw provider report was not committed and the one-scan limit was respected. |

## Event-listed resources deliberately not used

- **AIsa** was excluded by Rowan's later directive.
- **HUD** was excluded by Rowan's later directive.

Neither is presented as an Atlas dependency, integration, or prize-track claim.

## Core infrastructure outside that attribution list

- **GDELT** is the real current-news discovery and event-evidence backbone.
- **MapLibre GL JS** renders the globe and selected-story heat layer.

These are central Atlas technologies, but this ledger keeps them separate from
the event-company attribution so the two categories are not conflated.

## Production-run versus build-time evidence

The frozen production D1 run correctly reports `cotal_receipt: null`. That
means that specific ingestion run does not embed a Cotal or sponsor receipt. It
does **not** mean Cotal, Tenki, Nebius, Tavily, Mitosis, Runtype, Cloudflare,
Hacker Bob, or Immersive Commons were unused elsewhere in the build. Claims in
this ledger are scoped to the evidence level and workflow phase shown above.
