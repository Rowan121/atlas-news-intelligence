# Approved external payload ledger — Atlas P0

Rowan approved payloads 1–7 in the main task on 2026-08-27. This ledger distinguishes completed historical actions from the exact remaining P0 operations. Approval does not waive the recorded safety gates, product-truth checks, or one-run limits.

Use Rowan's existing accounts and saved sessions only. Do not create an account, mint or replace a key, attach BYOK, enable AIsa/HUD, spend money, or broaden a payload. Never print tokens, cookies, or authorization headers.

## Frozen release identity

| Item | Exact value |
|---|---|
| Product/truth logic | `55f9627d6c7c5baf1d165be8e0ffb3dec7de0bb0` |
| Frozen predeploy tree | The release-control commit containing this ledger; its exact SHA is supplied to Agent D and in the deployment handoff |
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

The frozen gate must pass with root 85/85, UI 29/29 plus build, Surface 61/61 plus typecheck, zero audit vulnerabilities, and a Wrangler dry bundle carrying `BUILD_VERSION=55f9627d6c7c5baf1d165be8e0ffb3dec7de0bb0`. Agent D must independently return `PASS` on the final release-control SHA before Payload 3.

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

**Status: approved and pending Agent D predeploy PASS.**

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

## Payload 4 — update the existing Worker and static explorer

**Status: approved and pending Payload 3 receipt.**

```json
{
  "provider": "cloudflare",
  "action": "workers.deploy",
  "account_id": "70311d13372e29742a6ae45f6788bcc9",
  "worker_name": "atlas-news-intelligence-api",
  "existing_resource_only": true,
  "entrypoint": "surface/src/index.ts",
  "frozen_tree": "DOCUMENTATION_RECONCILED_SHA_REQUIRED",
  "product_commit": "55f9627d6c7c5baf1d165be8e0ffb3dec7de0bb0",
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
    "BUILD_VERSION": "55f9627d6c7c5baf1d165be8e0ffb3dec7de0bb0",
    "ENVIRONMENT": "production",
    "CORS_ORIGIN": "self",
    "STALE_AFTER_SECONDS": "1800"
  },
  "command": "npx wrangler@4.127.0 deploy --config wrangler.jsonc"
}
```

Run from `surface/`. This updates the existing Worker; it must not create a differently named Worker or Cloudflare account resource. Preserve the returned deployment/version ID and origin. Then verify HTTPS browser/UI, REST, MCP, A2A, discovery/OpenAPI, self-only CORS, controlled errors, and HTTP→HTTPS redirect behavior. The live same-story response must expose `coverageHeat.basis=editorial_market`, `outletCount`, and `uniqueOutletCount`; it must contain one observed 11-market comparison and no public legacy coverage/audience or publisher-count keys.

## Payload 5 — Runtype product/surface convergence

**Status: approved conditionally; blocked until Payload 4 returns the final HTTPS origin and the working Runtype interface is addressable.**

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

## Payload 6 — Runtype evals and activation

**Status: approved conditionally; blocked until Payload 5 returns real IDs and all evals pass.**

```json
{
  "provider": "runtype",
  "action": "surfaces.set_status",
  "product_id": "OBSERVED_RUNTYPE_PRODUCT_ID_REQUIRED",
  "surface_ids": "OBSERVED_REST_MCP_A2A_IDS_REQUIRED",
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

## Payload 7 — one final Hacker Bob scan

**Status: approved once; blocked until the final frozen HTTPS deployment and live verification pass.**

```json
{
  "provider": "hacker_bob",
  "action": "security.scan",
  "target": "https://atlas-news-intelligence-api.atlas-news-surface.workers.dev",
  "product_commit": "55f9627d6c7c5baf1d165be8e0ffb3dec7de0bb0",
  "frozen_tree": "FINAL_DEPLOYED_SHA_REQUIRED",
  "scope": "public unauthenticated web, REST, MCP, A2A, and discovery files",
  "max_runs": 1,
  "mutation": false
}
```

Do not scan localhost, source publishers, or a changing preview. Do not create an account or credential. Preserve the sanitized report and exact target; any critical finding blocks release.

Ora and IsItAgentReady are also final-origin validation reads. Agent D owns their applicability checklist and final independent verification; historical f7 readiness files are not evidence for the P0 deployment.
