# Atlas local recovery: deployment and rescan package

This package was prepared on 2026-08-27 and is tracked in the repository.
Product commit `586d818` was subsequently deployed as Cloudflare version
`49f153cb-61ac-4584-aa8d-79323fa85e73`; this documentation audit performed no
deployment. Production scanner scores remain the stored baselines: Ora domain 50/C,
Ora MCP 67/C, Ora essentials 80, and IsItAgentReady level 1/5 until a
separate approved deployment and fresh production scans occur.

## Local verification

Run from the repository root:

```bash
npm run verify:release
```

That gate performs clean installs, data-package typecheck/tests/build, UI
tests/build, Surface typecheck/tests, and a Wrangler dry bundle. It does not
deploy.

## Deployment (requires separate approval)

The deployable change is the Worker/UI code only. Do not import the local
recovery data artifacts as part of this release: the current local batch has no
three-market evidence-backed cluster and would replace a stronger production
comparison slice.

```bash
ATLAS_RELEASE_SHA="$(git rev-parse HEAD)"
cd surface
npx wrangler deploy --var "BUILD_VERSION:${ATLAS_RELEASE_SHA}"
```

Do not create a new Worker, D1 database, route, account, or credential. The
existing `surface/wrangler.jsonc` names
`atlas-news-intelligence-api` and the existing
`atlas-news-intelligence-prod` binding.

## Production probes after an approved deployment

```bash
curl -fsS https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/robots.txt
curl -fsS https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/.well-known/ard.json
curl -fsS https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/.well-known/agent-skills/index.json
curl -fsS https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/openapi.json
curl -fsS -H 'Accept: text/markdown' https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/a-route-that-does-not-exist
```

The last command must return HTTP 404; inspect headers with `-i` when
capturing a receipt.

## Exact IsItAgentReady rescan

```bash
curl -sS -X POST \
  -H 'content-type: application/json' \
  --data '{"url":"https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/"}' \
  https://isitagentready.com/api/scan
```

## Exact Ora MCP rescans

Force a new production **domain** scan only after deployment:

```bash
curl -sS \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-06-18' \
  --data '{"jsonrpc":"2.0","id":"atlas-domain-rescan","method":"tools/call","params":{"name":"scan_domain","arguments":{"url":"https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/","force":true}}}' \
  https://ora.ai/api/mcp
```

Then force a separate **MCP endpoint** scan. Ora treats this as a distinct URL;
combining `mcpUrl` with the root request can return only the MCP audit:

```bash
curl -sS \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-06-18' \
  --data '{"jsonrpc":"2.0","id":"atlas-mcp-rescan","method":"tools/call","params":{"name":"scan_domain","arguments":{"url":"https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/mcp","force":true}}}' \
  https://ora.ai/api/mcp
```

Run the locally targeted catalog checks statelessly:

```bash
curl -sS \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-06-18' \
  --data '{"jsonrpc":"2.0","id":"atlas-targeted-rescan","method":"tools/call","params":{"name":"run_checks","arguments":{"url":"https://atlas-news-intelligence-api.atlas-news-surface.workers.dev/","checkIds":["content-no-js","api-error-model","response-schema-coverage","ard-catalog","robots-ai-policy-quality","agent-instruction","agent-friendly-404","json-ld","metadata-completeness","public-api-docs","sitemap-lastmod","api-versioning-policy"]}}}' \
  https://ora.ai/api/mcp
```

Preserve complete scanner JSON/SSE responses with timestamps. Do not infer an
improved score from local tests or endpoint existence.

## External-only blockers

These are not safely solved by a Worker patch: search-index/brand authority,
DNSSEC on a custom domain, third-party MCP or ChatGPT registry acceptance,
skills.sh publication, and any organization/contact assertions not supported by
real owner facts. The public API is anonymous and read-only; do not invent
OAuth, payment, idempotent writes, accounts, SDK packages, or a global
rate-limit guarantee merely to satisfy a scanner.
