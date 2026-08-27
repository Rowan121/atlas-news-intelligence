import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const base = (process.env.ATLAS_BASE_URL ?? "http://127.0.0.1:8788").replace(/\/$/, "");
const legacyExpectedClusters = optionalInteger("ATLAS_EXPECTED_CLUSTERS");
const expected = {
  runId: process.env.ATLAS_EXPECTED_RUN_ID,
  runStatus: process.env.ATLAS_EXPECTED_RUN_STATUS,
  dbClusters: optionalInteger("ATLAS_EXPECTED_DB_CLUSTERS") ?? legacyExpectedClusters,
  responseClusters: optionalInteger("ATLAS_EXPECTED_RESPONSE_CLUSTERS") ?? legacyExpectedClusters,
  articles: optionalInteger("ATLAS_EXPECTED_ARTICLES"),
  regions: optionalInteger("ATLAS_EXPECTED_REGIONS"),
  coverageStatus: process.env.ATLAS_EXPECTED_COVERAGE_STATUS,
  observedHeatClusters: optionalInteger("ATLAS_EXPECTED_OBSERVED_HEAT_CLUSTERS"),
};
const checks = [];

function optionalInteger(name) {
  const value = process.env[name];
  if (value === undefined) return undefined;
  assert.match(value, /^\d+$/, `${name} must be a non-negative integer`);
  return Number(value);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function check(name, route, init, validate) {
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(`${base}${route}`, init);
    const bytes = Buffer.from(await response.arrayBuffer());
    const text = bytes.toString("utf8");
    const contentType = response.headers.get("content-type") ?? "";
    await validate({ response, bytes, text, contentType });
    checks.push({
      name,
      method: init?.method ?? "GET",
      route,
      status: response.status,
      contentType,
      bytes: bytes.length,
      sha256: digest(bytes),
      startedAt,
      outcome: "pass",
    });
    return { text };
  } catch (error) {
    checks.push({
      name,
      method: init?.method ?? "GET",
      route,
      startedAt,
      outcome: "fail",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

const root = await check("root HTML + no-JS truth", "/", undefined, ({ response, text, contentType }) => {
  assert.equal(response.status, 200);
  assert.match(contentType, /^text\/html\b/);
  assert.match(text, /<noscript>/);
  assert.match(text, /compares how the same current story is covered/i);
  assert.match(response.headers.get("link") ?? "", /rel="api-catalog"/);
  assert.equal([...text.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].length, 2);
});

if (root !== null) {
  const assetRoutes = [...root.text.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  for (const route of assetRoutes) {
    await check(`static asset ${route.split("/").at(-1)}`, route, undefined, ({ response, bytes, contentType }) => {
      assert.equal(response.status, 200);
      assert.ok(bytes.length > 1_000);
      if (route.endsWith(".js")) assert.match(contentType, /javascript/);
      if (route.endsWith(".css")) assert.match(contentType, /text\/css/);
    });
  }
}

await check("D1 health", "/health", undefined, ({ response, text, contentType }) => {
  assert.equal(response.status, 200);
  assert.match(contentType, /^application\/json\b/);
  const body = JSON.parse(text);
  assert.equal(body.ok, true);
  if (expected.runStatus !== undefined) assert.equal(body.data.latest_run.status, expected.runStatus);
  if (body.data.latest_run.status === "degraded") {
    assert.ok(body.data.reasons.includes("latest_pipeline_run_degraded"));
  }
  if (expected.runId !== undefined) assert.equal(body.data.latest_run.run_id, expected.runId);
  if (expected.dbClusters !== undefined) assert.equal(body.data.cluster_count_24h, expected.dbClusters);
  if (expected.articles !== undefined) assert.equal(body.data.article_count_24h, expected.articles);
});

await check("24h normalized intelligence", "/api/v1/intelligence?window=24h&prominence=normalized", undefined, ({ response, text }) => {
  assert.equal(response.status, 200);
  const body = JSON.parse(text);
  assert.equal(body.window, "24h");
  assert.ok(body.clusters.some((cluster) => cluster.sources.length > 1));
  assert.ok(body.clusters.every((cluster) => cluster.eventLocations.length > 0));
  assert.ok(body.clusters.every((cluster) => cluster.prominence.basis === "event_location"));
  assert.ok(body.clusters.every((cluster) => cluster.coverageHeat.basis === "editorial_market"));
  assert.ok(body.clusters.every((cluster) => cluster.sources.every((source) => (
    !Object.hasOwn(source, "coverageMarkets") && !Object.hasOwn(source, "audienceExposure")
  ))));
  for (const cluster of body.clusters) {
    if (cluster.coverageHeat.status !== "observed") continue;
    for (const market of cluster.coverageHeat.markets) {
      assert.ok(cluster.sources.some((source) => (
        source.editorialMarket.status === "observed"
        && source.editorialMarket.value.regionCode === market.regionCode
        && source.editorialMarket.value.coordinates?.latitude === market.coordinates?.latitude
        && source.editorialMarket.value.coordinates?.longitude === market.coordinates?.longitude
      )), `heat market ${market.regionCode} must be backed by a matching observed source editorial market`);
    }
  }
  if (expected.responseClusters !== undefined) assert.equal(body.clusters.length, expected.responseClusters);
  if (expected.regions !== undefined) assert.equal(body.regions.length, expected.regions);
  if (expected.coverageStatus !== undefined) {
    assert.ok(body.clusters.every((cluster) => cluster.coverageHeat.status === expected.coverageStatus));
  }
  if (expected.observedHeatClusters !== undefined) {
    assert.equal(
      body.clusters.filter((cluster) => cluster.coverageHeat.status === "observed").length,
      expected.observedHeatClusters,
    );
  }
});

await check("docs HTML", "/docs", { headers: { Accept: "text/html" } }, ({ response, text, contentType }) => {
  assert.equal(response.status, 200);
  assert.match(contentType, /^text\/html\b/);
  assert.match(text, /<!doctype html>/i);
  assert.match(text, /clusters reports about the same event/i);
  assert.match(response.headers.get("vary") ?? "", /Accept/);
});

await check("docs Markdown", "/docs", { headers: { Accept: "text/markdown" } }, ({ response, text, contentType }) => {
  assert.equal(response.status, 200);
  assert.match(contentType, /^text\/markdown\b/);
  assert.match(text, /^# Atlas News Intelligence/m);
  assert.match(text, /## MCP/);
});

await check("docs 406", "/docs", { headers: { Accept: "application/pdf" } }, ({ response, text, contentType }) => {
  assert.equal(response.status, 406);
  assert.match(contentType, /^application\/problem\+json\b/);
  assert.deepEqual(JSON.parse(text), {
    type: "about:blank",
    title: "Not Acceptable",
    status: 406,
    detail: "This documentation is available as text/html or text/markdown.",
  });
});

await check("robots", "/robots.txt", undefined, ({ response, text, contentType }) => {
  assert.equal(response.status, 200);
  assert.match(contentType, /^text\/plain\b/);
  assert.match(text, /User-agent: \*/);
  assert.ok(text.includes(`Sitemap: ${base}/sitemap.xml`));
});

await check("sitemap", "/sitemap.xml", undefined, ({ response, text, contentType }) => {
  assert.equal(response.status, 200);
  assert.match(contentType, /^application\/xml\b/);
  assert.ok(text.includes(`<loc>${base}/docs</loc>`));
  assert.ok(text.includes(`<loc>${base}/integrations</loc>`));
});

await check("OpenAPI 3.1", "/openapi.json", undefined, ({ response, text, contentType }) => {
  assert.equal(response.status, 200);
  assert.match(contentType, /^application\/vnd\.oai\.openapi\+json/);
  const body = JSON.parse(text);
  assert.equal(body.openapi, "3.1.0");
  assert.deepEqual(Object.keys(body.paths).sort(), ["/api/stories", "/api/stories/{cluster_id}", "/api/v1/intelligence", "/health"].sort());
  assert.ok(Object.values(body.paths).every((pathItem) => Object.keys(pathItem).every((key) => key === "get")));
});

const jsonHeaders = { "Content-Type": "application/json" };
await check("MCP initialize", "/mcp", {
  method: "POST",
  headers: jsonHeaders,
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "smoke-init",
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "atlas-local-smoke", version: "1.0" } },
  }),
}, ({ response, text }) => {
  assert.equal(response.status, 200);
  const body = JSON.parse(text);
  assert.equal(body.id, "smoke-init");
  assert.equal(body.result.protocolVersion, "2025-06-18");
  assert.equal(body.result.serverInfo.name, "atlas-news-intelligence");
});

await check("MCP tools/list", "/mcp", {
  method: "POST",
  headers: jsonHeaders,
  body: JSON.stringify({ jsonrpc: "2.0", id: "smoke-tools", method: "tools/list", params: {} }),
}, ({ response, text }) => {
  assert.equal(response.status, 200);
  const body = JSON.parse(text);
  assert.equal(body.result.tools.length, 3);
  assert.ok(body.result.tools.every((tool) => tool.annotations.readOnlyHint === true));
  assert.ok(body.result.tools.every((tool) => tool.annotations.destructiveHint === false));
});

await check("A2A Agent Card", "/.well-known/agent-card.json", undefined, ({ response, text }) => {
  assert.equal(response.status, 200);
  const body = JSON.parse(text);
  assert.equal(body.supportedInterfaces[0].url, `${base}/a2a`);
  assert.equal(body.supportedInterfaces[0].protocolBinding, "HTTP+JSON");
  assert.equal(body.capabilities.streaming, false);
  assert.equal(body.capabilities.pushNotifications, false);
});

await check("A2A message:send query", "/a2a/message:send", {
  method: "POST",
  headers: { ...jsonHeaders, "A2A-Version": "1.0" },
  body: JSON.stringify({
    message: {
      messageId: "smoke-a2a-query",
      role: "ROLE_USER",
      parts: [{ data: { operation: "query_stories", metric: "normalized", limit: 2 } }],
    },
  }),
}, ({ response, text, contentType }) => {
  assert.equal(response.status, 200);
  assert.match(contentType, /^application\/a2a\+json\b/);
  assert.equal(response.headers.get("a2a-version"), "1.0");
  const data = JSON.parse(text).message.parts[0].data;
  assert.equal(data.operation, "query_stories");
  assert.equal(data.count, 2);
  assert.equal(data.stories.length, 2);
});

await check("malformed percent cluster route", "/api/stories/%E0%A4%A", undefined, ({ response, text }) => {
  assert.equal(response.status, 400);
  const body = JSON.parse(text);
  assert.equal(body.ok, false);
  assert.equal(body.error.kind, "bad_request");
  assert.match(body.error.message, /malformed percent-encoding/);
});

await check("missing route", "/definitely-missing", undefined, ({ response, text }) => {
  assert.equal(response.status, 404);
  const body = JSON.parse(text);
  assert.equal(body.ok, false);
  assert.equal(body.error.kind, "not_found");
});

const receipt = { base, completedAt: new Date().toISOString(), checks };
const serializedReceipt = `${JSON.stringify(receipt, null, 2)}\n`;
const receiptOutput = process.env.ATLAS_RECEIPT_OUTPUT;
if (receiptOutput !== undefined) {
  const outputPath = resolve(receiptOutput);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializedReceipt, { encoding: "utf8", mode: 0o600 });
}
console.log(serializedReceipt);
if (checks.some((result) => result.outcome !== "pass")) process.exitCode = 1;
