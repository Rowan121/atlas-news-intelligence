import type { StoryQuery } from "./contracts";
import { normalizeRfc3339DateTime } from "./date-time";
import { HttpProblem } from "./http";
import type { TruthStore } from "./store";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

const tools = [
  {
    name: "atlas.query_dominant_stories",
    title: "Query dominant stories",
    description: "Return current, evidence-backed story clusters for a region and time window.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        region: { type: "string", description: "Optional geographic region code." },
        since: { type: "string", format: "date-time" },
        until: { type: "string", format: "date-time" },
        metric: { type: "string", enum: ["raw", "normalized"], default: "normalized" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "atlas.explain_story_cluster",
    title: "Explain story cluster",
    description: "Explain one cluster with its articles, locations, claims, evidence, and prominence.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { cluster_id: { type: "string", minLength: 1 } },
      required: ["cluster_id"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "atlas.pipeline_health",
    title: "Inspect pipeline health",
    description: "Return source freshness, latest ingestion status, and explicit failure reasons.",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as const;

function rpcResult(id: JsonRpcRequest["id"], result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function toolResult(value: unknown, isError = false): Record<string, unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    isError,
  };
}

function objectParams(params: unknown): Record<string, unknown> {
  if (params === undefined) return {};
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new HttpProblem(400, "bad_request", "MCP params must be an object");
  }
  return params as Record<string, unknown>;
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], context: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined) {
    throw new HttpProblem(400, "bad_request", `${context} does not allow property ${unknown}`);
  }
}

function timestamp(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = typeof value === "string" ? normalizeRfc3339DateTime(value) : null;
  if (normalized === null) throw new HttpProblem(400, "bad_request", `${field} must be an RFC 3339 date-time`);
  return normalized;
}

function parseQuery(argumentsValue: unknown): StoryQuery {
  const args = objectParams(argumentsValue);
  assertOnlyKeys(args, ["region", "since", "until", "metric", "limit"], "query arguments");
  const metric = args.metric ?? "normalized";
  const limit = args.limit ?? 20;
  if (metric !== "raw" && metric !== "normalized") {
    throw new HttpProblem(400, "bad_request", "metric must be raw or normalized");
  }
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 100) {
    throw new HttpProblem(400, "bad_request", "limit must be an integer between 1 and 100");
  }
  const region = args.region === undefined ? undefined : typeof args.region === "string" ? args.region.trim().toUpperCase() : null;
  if (region === null || (region !== undefined && !/^[A-Z0-9_-]{2,16}$/.test(region))) {
    throw new HttpProblem(400, "bad_request", "region must be a 2-16 character geographic code");
  }
  const since = timestamp(args.since, "since");
  const until = timestamp(args.until, "until");
  if (since !== undefined && until !== undefined && since > until) {
    throw new HttpProblem(400, "bad_request", "since must not be after until");
  }
  return {
    metric,
    limit: limit as number,
    ...(region === undefined ? {} : { region }),
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
  };
}

export async function handleMcp(
  request: Request,
  store: TruthStore,
  now: Date,
  staleAfterSeconds: number,
): Promise<Record<string, unknown> | null> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return rpcError(null, -32600, "Invalid Request");
  }
  const body = parsed as JsonRpcRequest;
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(body.id, -32600, "Invalid Request");
  }

  // JSON-RPC notifications never receive a response. Atlas also avoids doing
  // unnecessary read work for a notification that cannot consume a result.
  if (body.id === undefined) return null;

  try {
    if (body.method === "server/discover") {
      return rpcResult(body.id, {
        resultType: "complete",
        supportedVersions: ["2026-07-28", "2025-06-18"],
        capabilities: { tools: {} },
        _meta: {
          "io.modelcontextprotocol/serverInfo": {
            name: "atlas-news-intelligence",
            version: "0.1.0",
          },
        },
        instructions: "Read-only global news intelligence. Preserve citations, event-location evidence, and coverage-region uncertainty.",
        ttlMs: 300_000,
        cacheScope: "public",
      });
    }
    if (body.method === "initialize") {
      return rpcResult(body.id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "atlas-news-intelligence", version: "0.1.0" },
        instructions: "Read-only global news intelligence. Preserve citations and location confidence.",
      });
    }
    if (body.method === "notifications/initialized") return null;
    if (body.method === "ping") return rpcResult(body.id, {});
    if (body.method === "tools/list") return rpcResult(body.id, { tools });
    if (body.method !== "tools/call") return rpcError(body.id, -32601, "Method not found");

    const params = objectParams(body.params);
    if (typeof params.name !== "string") return rpcError(body.id, -32602, "Tool name is required");
    const args = params.arguments;

    if (params.name === "atlas.query_dominant_stories") {
      const stories = await store.listStories(parseQuery(args), now, staleAfterSeconds);
      return rpcResult(body.id, toolResult({ stories }));
    }
    if (params.name === "atlas.explain_story_cluster") {
      const parsed = objectParams(args);
      assertOnlyKeys(parsed, ["cluster_id"], "explain arguments");
      if (typeof parsed.cluster_id !== "string" || parsed.cluster_id === "" || parsed.cluster_id.length > 200) {
        return rpcResult(body.id, toolResult({ error: "cluster_id is required" }, true));
      }
      const story = await store.getStory(parsed.cluster_id);
      return rpcResult(
        body.id,
        story === null ? toolResult({ error: "cluster not found" }, true) : toolResult(story),
      );
    }
    if (params.name === "atlas.pipeline_health") {
      const parsed = objectParams(args);
      assertOnlyKeys(parsed, [], "health arguments");
      return rpcResult(body.id, toolResult(await store.getHealth(now, staleAfterSeconds)));
    }
    return rpcResult(body.id, toolResult({ error: "unknown tool" }, true));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool execution failed";
    return rpcResult(body.id, toolResult({ error: message }, true));
  }
}
