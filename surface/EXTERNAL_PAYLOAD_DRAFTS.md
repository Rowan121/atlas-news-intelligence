# Approved external payload ledger — Atlas P0

Rowan approved payloads 1–7 in the main task on 2026-08-27. This ledger distinguishes completed historical actions from the exact remaining P0 operations. Approval does not waive the recorded safety gates, product-truth checks, or one-run limits.

Use Rowan's existing accounts and saved sessions only. Do not create an account, mint or replace a key, attach BYOK, enable AIsa/HUD, spend money, or broaden a payload. Never print tokens, cookies, or authorization headers.

## Frozen release identity

| Item | Exact value |
|---|---|
| Deployed runtime build | `074da0c4683686d17d5b7b4ea31541384a31d2d6` |
| Final Cloudflare deployment version | `af5a6aee-18e6-4467-b4e4-b9fb93c87e58` |
| Frozen final-verification tree | The documentation/receipt commit immediately preceding Agent D; its exact SHA is supplied in the final handoff |
| Existing Cloudflare account | `70311d13372e29742a6ae45f6788bcc9` |
| Existing D1 database | `atlas-news-intelligence-prod` |
| Existing D1 UUID | `a4b64588-32ff-4e18-950e-f603e3c7d3d2` |
| Existing Worker | `atlas-news-intelligence-api` |
| Existing production origin | `https://atlas-news-intelligence-api.atlas-news-surface.workers.dev` |
| Schema SHA-256 | `f3d30b54bd56066b149c19dc425f71778f2512073ebb86bb489bf1bda339f6ee` |
| Replay manifest SHA-256 | `09a7ed399857bf1f4703b7c82564a3499fb8d23064bade21a35dccddb136574b` |
| P0 source JSON SHA-256 | `fff27207417aba310ada64a0653d944e391224b15973be7102fafda40a19c94c` |
| Generated P0 seed SHA-256 | `4cde8920229744e4de0ffeb584069836b92a22234700af116a3681755c8c102b` |
| Atomic production refresh SHA-256 | `27bab7330daf7ae944af731be61c89aa6076bf647a68b73ef5493f759d14802c` |
| Runtype definition SHA-256 | `19330bb27ce93ba69160779a22718c33a4644998e9031b6296cc494222febc54` |

The current saved Cloudflare OAuth session identifies the one account above and exposes D1 and Workers write scopes. Read-only D1 access succeeded with Wrangler `4.127.0`. The project-pinned `4.126.0` client returned Cloudflare code `7403` for the same valid session, so remaining remote commands must use the explicit `4.127.0` client rather than triggering a login or searching for another credential.

The production database currently contains the superseded run `gdelt:20260827091500`: 20 clusters, 21 article rows, and 25 event-location rows. Current Surface reads do not select only the latest run, and each run's prominence scores were normalized against a different batch. Loading the new seed without retiring the old run would therefore mix incomparable rankings and retain obsolete stories. The approved production file loads `gdelt:20260827170000` and retires only `gdelt:20260827091500` in the same Wrangler D1 import. An exact local schema-and-old-run proof left only the new run and passed `PRAGMA foreign_key_check`.

## Required local gate

Before either remaining Cloudflare write:

```sh
npm run verify:release
```

The final gate passed with root 85/85, UI 29/29 plus build, Surface 70/70 plus typecheck, zero audit vulnerabilities, and a Wrangler dry bundle carrying `BUILD_VERSION=074da0c4683686d17d5b7b4ea31541384a31d2d6`. The same existing Agent D receives the completed deployed tree last for the independent ORA/IsItAgentReady verdict.

## Payload 1 — Cloudflare identity and D1 creation

**Status: completed previously; do not rerun.**

The existing account and D1 identifiers are recorded above. Re-running creation would create a duplicate resource and is outside the approval.

Current read-only identity check:

```sh
npx wrangler@4.127.0 whoami
npx wrangler@4.127.0 d1 list
```

## Payload 2 — remote schema

**Status: completed previously; do not rerun as part of P0.**

The existing production tables are queryable and the earlier real run is present. The P0 contract did not add a D1 column or table, so no migration is required. The schema file remains the canonical idempotent definition with the hash above.

## Payload 3 — exact atomic P0 D1 refresh

**Status: completed once. Do not rerun.**

```json
{
  "provider": "cloudflare",
  "action": "d1.execute",
  "account_id": "70311d13372e29742a6ae45f6788bcc9",
  "database_id": "a4b64588-32ff-4e18-950e-f603e3c7d3d2",
  "database_name": "atlas-news-intelligence-prod",
  "remote": true,
  "file": "artifacts/p0-editorial-market-production.sql",
  "generated_seed": "artifacts/p0-editorial-market-final.sql",
  "source_artifact": "artifacts/p0-editorial-market-final.json",
  "replay_manifest": "artifacts/gdelt-20260827170000.manifest.txt",
  "source_sha256": "fff27207417aba310ada64a0653d944e391224b15973be7102fafda40a19c94c",
  "generated_seed_sha256": "4cde8920229744e4de0ffeb584069836b92a22234700af116a3681755c8c102b",
  "production_sql_sha256": "27bab7330daf7ae944af731be61c89aa6076bf647a68b73ef5493f759d14802c",
  "manifest_sha256": "09a7ed399857bf1f4703b7c82564a3499fb8d23064bade21a35dccddb136574b",
  "run_id": "gdelt:20260827170000",
  "retire_run_id": "gdelt:20260827091500",
  "command": "npx wrangler@4.127.0 d1 execute atlas-news-intelligence-prod --remote --file ../artifacts/p0-editorial-market-production.sql"
}
```

Run from `surface/`. Preconditions and receipts:

- Recompute the manifest, source, generated-seed, and production-refresh hashes immediately before the write and stop on any mismatch.
- The production file must reproduce exactly with `npm run seed:d1:production -- --input artifacts/p0-editorial-market-final.sql --output artifacts/p0-editorial-market-production.sql --input-sha 4cde8920229744e4de0ffeb584069836b92a22234700af116a3681755c8c102b --retire-run gdelt:20260827091500`.
- Record the existing runs/counts before the write.
- Execute the production refresh only; do not substitute the raw seed, legacy f7 proof, moving `gdelt-latest` pointer, or superseded P0 v2 artifact.
- Query both named run IDs after the write and require only `gdelt:20260827170000`, with 111 clusters, 123 article rows, 131 story-location rows, 143 location-evidence rows, 0 claims, 122 regional-prominence rows, `status=succeeded`, and `cotal_receipt_json IS NULL`.
- Require `PRAGMA foreign_key_check` to return no rows.
- Verify all 11 observed market assessments are cited and no station publisher-origin assessment contains the editorial-market coordinates.
- Preserve the sanitized Cloudflare response; never preserve OAuth material.

Production receipt: the approved import left only `gdelt:20260827170000` and
returned 111 clusters, 123 articles, 131 story locations, 143 location-evidence
rows, 0 claims, 122 prominence rows, a succeeded run, a null Cotal receipt, and
no foreign-key violations. Eleven editorial-market assessments are observed;
zero publisher-origin assessments contain editorial-market coordinates and
zero rows retain the legacy coverage/audience contexts. Before/after details are
in `docs/PRODUCTION_RELEASE_2026-08-27.md`.

## Payload 4 — update the existing Worker and static explorer

**Status: completed; final deployment version `af5a6aee-18e6-4467-b4e4-b9fb93c87e58`.**

```json
{
  "provider": "cloudflare",
  "action": "workers.deploy",
  "account_id": "70311d13372e29742a6ae45f6788bcc9",
  "worker_name": "atlas-news-intelligence-api",
  "existing_resource_only": true,
  "entrypoint": "surface/src/index.ts",
  "frozen_tree": "FINAL_AGENT_D_HANDOFF_SHA_RECORDED_IN_FINAL_REPORT",
  "product_commit": "074da0c4683686d17d5b7b4ea31541384a31d2d6",
  "compatibility_date": "2026-08-27",
  "bindings": {
    "DB": {
      "database_name": "atlas-news-intelligence-prod",
      "database_id": "a4b64588-32ff-4e18-950e-f603e3c7d3d2"
    }
  },
  "assets": {
    "directory": "../ui/dist",
    "binding": "ASSETS",
    "not_found_handling": "none"
  },
  "vars": {
    "BUILD_VERSION": "074da0c4683686d17d5b7b4ea31541384a31d2d6",
    "ENVIRONMENT": "production",
    "CORS_ORIGIN": "self",
    "STALE_AFTER_SECONDS": "1800"
  },
  "command": "npx wrangler@4.127.0 deploy --config wrangler.jsonc"
}
```

Run from `surface/`. This updates the existing Worker; it must not create a differently named Worker or Cloudflare account resource. Preserve the returned deployment/version ID and origin. Then verify HTTPS browser/UI, REST, MCP, A2A, discovery/OpenAPI, self-only CORS, controlled errors, and HTTP→HTTPS redirect behavior. The live same-story response must expose `coverageHeat.basis=editorial_market`, `outletCount`, and `uniqueOutletCount`; it must contain one observed 11-market comparison and no public legacy coverage/audience or publisher-count keys.

Final receipt: the live origin passed 25/25 production checks and browser checks
for the initial globe, focused 11-market comparison, and Back transition. The
one-run security findings caused two follow-up deployments; the final runtime
also routes `/assets/*` through the Worker so JS/CSS receive CSP, XFO, and HSTS
without losing representation metadata.

## Payload 5 — Runtype product/surface convergence

**Status: completed to the truthful draft boundary; existing product/capability/surfaces created and the final A2A capability executed successfully.**

```json
{
  "provider": "runtype",
  "action": "product.ensure",
  "existing_account_only": true,
  "definition_file": "surface/runtype/atlas-product.json",
  "definition_sha256": "19330bb27ce93ba69160779a22718c33a4644998e9031b6296cc494222febc54",
  "product": "Atlas News Intelligence",
  "environment": "production",
  "ATLAS_API_BASE_URL": "https://atlas-news-intelligence-api.atlas-news-surface.workers.dev",
  "surfaces": [
    { "type": "rest_api", "status": "draft", "authentication": "none" },
    { "type": "mcp", "status": "draft", "authentication": "none", "path": "/mcp" },
    { "type": "a2a", "status": "draft", "authentication": "none", "path": "/a2a" }
  ],
  "provider_keys": "none",
  "byok": false
}
```

Use the existing working Runtype interface only; do not invent a CLI or create another account. Capture returned product/surface IDs and sanitized before/after usage. If no executable interface is actually addressable, record that as the blocker instead of fabricating sponsor usage.

Observed IDs: product `prod_01m12akcm1em7rbjzf7d7tegr1`, capability
`prodcap_01m12anppbejfrsxtvvampcngg`, external agent
`agent_01m12anp9ze0va72dmvns83zt6`, A2A surface
`surf_01m12aken9eppbfvt2vspwcp20`, REST surface
`surf_01m12ax8j0et4vrb7a33q09c7g`, and MCP surface
`surf_01m12ay152ekssg2a8a63vb3mq`. The final production debug execution
completed four events in 0.188 seconds. Product counters remained runs/errors
`0/0` because debug tests are not product activity; no numeric usage delta is
invented.

## Payload 6 — Runtype evals and activation

**Status: blocked at the required eval gate; no surface was activated.**

```json
{
  "provider": "runtype",
  "action": "surfaces.set_status",
  "product_id": "prod_01m12akcm1em7rbjzf7d7tegr1",
  "surface_ids": [
    "surf_01m12aken9eppbfvt2vspwcp20",
    "surf_01m12ax8j0et4vrb7a33q09c7g",
    "surf_01m12ay152ekssg2a8a63vb3mq"
  ],
  "from": "draft",
  "to": "active",
  "required_gate_suites": [
    "geolocation-fidelity",
    "citation-integrity",
    "cluster-coherence",
    "abstention-and-failure",
    "agent-surface-conformance"
  ]
}
```

Do not activate on a partial or failed eval. Preserve returned IDs, results, and sanitized usage evidence.

The signed-in Evals page showed zero saved evals and `0/100` for the day but no
create control. Saved suites require the SDK/API, whose available path requires
an API key. The no-key-hunting/no-key-minting boundary therefore blocks this
payload exactly; draft is the correct final status.

## Payload 7 — one final Hacker Bob scan

**Status: completed exactly once; do not rerun. The two response observations were remediated afterward.**

```json
{
  "provider": "hacker_bob",
  "action": "security.scan",
  "target": "https://atlas-news-intelligence-api.atlas-news-surface.workers.dev",
  "scan_runtime": "a59d171a2a2eee755242602d2fda3945e5d85500",
  "remediated_runtime": "074da0c4683686d17d5b7b4ea31541384a31d2d6",
  "final_deployment_version": "af5a6aee-18e6-4467-b4e4-b9fb93c87e58",
  "scope": "public unauthenticated web, REST, MCP, A2A, and discovery files",
  "max_runs": 1,
  "mutation": false
}
```

Do not scan localhost, source publishers, or a changing preview. Do not create an account or credential. Preserve the sanitized report and exact target; any critical finding blocks release.

The sole scan ran at `2026-08-27T19:49:19.844Z` in paranoid mode with
`block_internal_hosts=true`, reached the exact root with HTTP 200 in 162 ms,
and exposed no secret. Its response analysis called out missing HSTS and
clickjacking protection. Those observations produced the final CSP/XFO/HSTS
implementation and the production-only `/assets/*` routing correction. Live
header verification and the strengthened smoke pass on the remediated runtime;
the one-scan ceiling prevents a second Hacker Bob run.

Ora and IsItAgentReady are also final-origin validation reads. Agent D owns their applicability checklist and final independent verification; historical f7 readiness files are not evidence for the P0 deployment.
