# External payload drafts — not executed

These drafts require Rowan's separate approval. No command or request below has been run. The all-zero D1 ID in `wrangler.jsonc` is an intentional non-production sentinel.

## Cloudflare D1 resource

```json
{
  "provider": "cloudflare",
  "action": "d1.create",
  "account": "existing authenticated Rowan account",
  "database_name": "atlas-news-intelligence-prod",
  "jurisdiction": "default"
}
```

Proposed command after approval:

```sh
npx wrangler d1 create atlas-news-intelligence-prod
```

After the command returns a real database UUID, replace only the sentinel `database_id` and change `database_name` to `atlas-news-intelligence-prod` in `wrangler.jsonc`.

## D1 schema application

```json
{
  "provider": "cloudflare",
  "action": "d1.execute",
  "database_name": "atlas-news-intelligence-prod",
  "remote": true,
  "file": "surface/schema/schema.sql"
}
```

Proposed command after resource creation and separate approval:

```sh
npx wrangler d1 execute atlas-news-intelligence-prod --remote --file surface/schema/schema.sql
```

## Worker deployment

```json
{
  "provider": "cloudflare",
  "action": "workers.deploy",
  "worker_name": "atlas-news-intelligence-api",
  "entrypoint": "surface/src/index.ts",
  "compatibility_date": "2026-08-26",
  "bindings": {
    "DB": "atlas-news-intelligence-prod"
  },
  "vars": {
    "ENVIRONMENT": "production",
    "CORS_ORIGIN": "https://REPLACE_WITH_APPROVED_UI_HOST",
    "STALE_AFTER_SECONDS": "1800"
  }
}
```

Proposed command only after the final hostname and binding are approved:

```sh
npx wrangler deploy --config surface/wrangler.jsonc
```

## Runtype convergence and publish intent

The portable definition is `surface/runtype/atlas-product.json`. Exact platform IDs and generated URLs cannot truthfully be supplied before Runtype converges the draft, so they are deliberately absent rather than guessed.

```json
{
  "provider": "runtype",
  "action": "product.ensure",
  "environment": "development",
  "definition_file": "surface/runtype/atlas-product.json",
  "product": "Atlas News Intelligence",
  "capabilities": [
    "Query Dominant Stories",
    "Explain Story Cluster",
    "Compare Regional Coverage",
    "Inspect Pipeline Health"
  ],
  "surfaces": [
    { "type": "rest_api", "status": "draft" },
    { "type": "mcp", "status": "draft", "authentication": "api_key" },
    { "type": "a2a", "status": "draft", "authentication": "api_key" }
  ],
  "eval_suites": [
    "geolocation-fidelity",
    "citation-integrity",
    "cluster-coherence",
    "abstention-and-failure",
    "cost-and-latency"
  ],
  "provider_keys": "platform_only",
  "byok": false
}
```

Promotion remains a separate write after eval evidence exists:

```json
{
  "provider": "runtype",
  "action": "surfaces.set_status",
  "product": "Atlas News Intelligence",
  "from": "draft",
  "to": "active",
  "required_gate_suites": [
    "geolocation-fidelity",
    "citation-integrity",
    "cluster-coherence",
    "abstention-and-failure"
  ]
}
```
