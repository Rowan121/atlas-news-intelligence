# External write payloads — drafts only, not executed

No command or request in this file has been run. Every block is a separate external write and requires Rowan's explicit approval after its stated preconditions are true. Atlas must use the existing Rowan accounts only: no new account, API key, credential, paid plan, or provider BYOK fallback.

The all-zero D1 ID in `surface/wrangler.jsonc` is a deliberate deploy blocker, not a value to publish. The application now uses a same-origin CORS policy (`CORS_ORIGIN=self`), so there is no hostname placeholder to guess before Cloudflare assigns the Worker origin.

## Local, read-only preflight

This does not authenticate or mutate an external system:

```sh
npm run verify:release
```

The candidate must also have one current, evidence-backed `artifacts/gdelt-latest.json` and its deterministic `artifacts/gdelt-latest.sql` export. Record the commit and both SHA-256 hashes before proposing any remote D1 write.

## Approval 1 — existing Cloudflare OAuth and D1 creation

This is the first exact external-write payload. It creates one empty D1 database and nothing else.
The current `wrangler whoami` state is unauthenticated. A temporary preview account is forbidden; authenticate only Rowan's existing Cloudflare account and stop if the account cannot be selected unambiguously.

```json
{
  "provider": "cloudflare",
  "candidate": "f7e7a6c21a44b5cff8ff95fb7422b9b51a4ca650",
  "working_directory": "/tmp/atlas-news-ui-correction/surface",
  "wrangler_version": "4.126.0",
  "actions": [
    {
      "action": "wrangler.oauth.login",
      "command": "npx --no-install wrangler login --use-keyring --scopes account:read user:read d1:write"
    },
    {
      "action": "d1.create",
      "database_name": "atlas-news-intelligence-prod",
      "command": "npx --no-install wrangler d1 create atlas-news-intelligence-prod"
    }
  ],
  "capture": [
    "selected_account_name",
    "selected_account_id",
    "database_name",
    "database_uuid"
  ],
  "abort_if": [
    "The Cloudflare account is ambiguous",
    "OAuth fails",
    "The database name already exists"
  ],
  "constraints": [
    "Use Rowan's existing Cloudflare account only",
    "Do not use or create a temporary preview account",
    "Do not mint or paste an API token",
    "Do not deploy a Worker in this approval"
  ]
}
```

The returned database UUID must be shown to Rowan in the next payload. Locally replace only `database_id` and `database_name` after that UUID is observed; never guess it.
Approval 1 does not authorize Approvals 2–7. Those remain separate approvals blocked on the observed database UUID, deployed HTTPS origin, remote-write receipts, and provider-returned IDs stated below.

## Approval 2 — remote schema

This payload is not exact until Approval 1 returns the real `database_id`; substitute that observed value and show the completed block before executing it.

```json
{
  "provider": "cloudflare",
  "action": "d1.execute",
  "database_id": "OBSERVED_DATABASE_UUID_REQUIRED",
  "database_name": "atlas-news-intelligence-prod",
  "remote": true,
  "file": "surface/schema/schema.sql",
  "file_sha256": "f3d30b54bd56066b149c19dc425f71778f2512073ebb86bb489bf1bda339f6ee",
  "command": "npx wrangler d1 execute atlas-news-intelligence-prod --remote --file schema/schema.sql"
}
```

Run the command from `surface/`.

## Approval 3 — current live seed

This payload is not exact until the release candidate has frozen the live artifact. Replace both required hashes with the locally observed values and show the completed block before the remote write.

```json
{
  "provider": "cloudflare",
  "action": "d1.execute",
  "database_name": "atlas-news-intelligence-prod",
  "remote": true,
  "file": "artifacts/gdelt-latest.sql",
  "source_artifact": "artifacts/gdelt-latest.json",
  "source_sha256": "CURRENT_LOCAL_SHA256_REQUIRED",
  "sql_sha256": "CURRENT_LOCAL_SHA256_REQUIRED",
  "command": "npx wrangler d1 execute atlas-news-intelligence-prod --remote --file ../artifacts/gdelt-latest.sql"
}
```

Run the command from `surface/`; the `../artifacts` path is therefore intentional. Only the verified current GDELT batch may be loaded. Sponsor enrichment must be loaded only if its source and sanitized usage receipt are present in the frozen artifact.

## Approval 4 — combined Worker and static explorer deployment

This payload is not exact until the real D1 UUID and successful remote row-count receipt exist. The product-code commit is frozen below. No final hostname is required because the Worker uses same-origin CORS and Cloudflare assigns the origin.

```json
{
  "provider": "cloudflare",
  "action": "workers.deploy",
  "worker_name": "atlas-news-intelligence-api",
  "entrypoint": "surface/src/index.ts",
  "commit_sha": "f7e7a6c21a44b5cff8ff95fb7422b9b51a4ca650",
  "compatibility_date": "2026-08-27",
  "bindings": {
    "DB": {
      "database_name": "atlas-news-intelligence-prod",
      "database_id": "OBSERVED_DATABASE_UUID_REQUIRED"
    }
  },
  "assets": {
    "directory": "ui/dist",
    "binding": "ASSETS",
    "not_found_handling": "none",
    "run_worker_first": [
      "/",
      "/api",
      "/api/*",
      "/health",
      "/mcp",
      "/a2a",
      "/a2a/*",
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      "/index.md",
      "/docs",
      "/docs/*",
      "/integrations",
      "/pricing",
      "/openapi.json",
      "/.well-known/*"
    ]
  },
  "vars": {
    "BUILD_VERSION": "f7e7a6c21a44b5cff8ff95fb7422b9b51a4ca650",
    "ENVIRONMENT": "production",
    "CORS_ORIGIN": "self",
    "STALE_AFTER_SECONDS": "1800"
  },
  "command": "npx wrangler deploy --config wrangler.jsonc"
}
```

Run the command from `surface/`. `assets.directory` is resolved relative to `surface/wrangler.jsonc`, so `../ui/dist` is correct in the config. The deployment must stop if the remote D1 health probe does not return the expected current batch.

## Approval 5 — Runtype draft convergence

Runtype access is treated as working. The platform definition is ready, but this write cannot be exact until Cloudflare returns the deployed HTTPS origin. Do not invent a CLI command: use the currently working Runtype interface and capture its returned product/surface IDs.

```json
{
  "provider": "runtype",
  "action": "product.ensure",
  "existing_account_only": true,
  "definition_file": "surface/runtype/atlas-product.json",
  "definition_sha256": "84c5f36777654ba376d5b1770e1ef00f84b6adeeca1def007345acf7c212513c",
  "product": "Atlas News Intelligence",
  "environment": "production",
  "ATLAS_API_BASE_URL": "DEPLOYED_HTTPS_ORIGIN_REQUIRED",
  "surfaces": [
    { "type": "rest_api", "status": "draft", "authentication": "none" },
    { "type": "mcp", "status": "draft", "authentication": "none", "path": "/mcp" },
    { "type": "a2a", "status": "draft", "authentication": "none", "path": "/a2a" }
  ],
  "provider_keys": "none",
  "byok": false,
  "constraints": [
    "Do not create another account",
    "Do not attach personal provider keys",
    "Do not activate surfaces in this approval",
    "Capture before/after Runtype usage if the account exposes it"
  ]
}
```

## Approval 6 — Runtype evals and activation

This remains blocked until the draft returns real surface IDs, every gate suite passes against the deployed origin, and the before/after usage receipt is sanitized and saved.

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

## Approval 7 — one final Hacker Bob scan

Hacker Bob is intentionally reserved for the final candidate. This is a quota-consuming external action and must not be run against localhost or a preview that is still changing.

```json
{
  "provider": "hacker_bob",
  "action": "security.scan",
  "target": "DEPLOYED_HTTPS_ORIGIN_REQUIRED",
  "commit_sha": "f7e7a6c21a44b5cff8ff95fb7422b9b51a4ca650",
  "scope": "public unauthenticated web, REST, MCP, A2A, discovery files",
  "max_runs": 1,
  "mutation": false,
  "constraints": [
    "Do not create an account or credential",
    "Do not scan third-party source URLs",
    "Preserve the sanitized report and exact target",
    "Any critical finding blocks submission"
  ]
}
```

Ora and IsItAgentReady scans are also deferred until this same frozen deployed origin exists. They are validation reads, but consume public scanner quota and must be run once at the final milestone rather than during code iteration.
