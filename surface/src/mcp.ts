import type { StoryQuery } from "./contracts";
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

function parseQuery(argumentsValue: unknown): StoryQuery {
  const args = objectParams(argumentsValue);
  const metric = args.metric ?? "normalized";
  const limit = args.limit ?? 20;
  if (metric !== "raw" && metric !== "normalized") {
    throw new HttpProblem(400, "bad_request", "metric must be raw or normalized");
  }
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 100) {
    throw new HttpProblem(400, "bad_request", "limit must be an integer between 1 and 100");
  }
  for (const field of ["region", "since", "until"] as const) {
    if (args[field] !== undefined && typeof args[field] !== "string") {
      throw new HttpProblem(400, "bad_request", `${field} must be a string`);
    }
  }
  return {
    metric,
    limit: limit as number,
    ...(typeof args.region === "string" ? { region: args.region } : {}),
    ...(typeof args.since === "string" ? { since: args.since } : {}),
    ...(typeof args.until === "string" ? { until: args.until } : {}),
  };
}

export async function handleMcp(
  request: Request,
  store: TruthStore,
  now: Date,
  staleAfterSeconds: number,
): Promise<Record<string, unknown> | null> {
  let body: JsonRpcRequest;
  try {
    body = await request.json() as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(body.id, -32600, "Invalid Request");
  }

  try {
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
      if (typeof parsed.cluster_id !== "string" || parsed.cluster_id === "") {
        return rpcResult(body.id, toolResult({ error: "cluster_id is required" }, true));
      }
      const story = await store.getStory(parsed.cluster_id);
      return rpcResult(
        body.id,
        story === null ? toolResult({ error: "cluster not found" }, true) : toolResult(story),
      );
    }
    if (params.name === "atlas.pipeline_health") {
      return rpcResult(body.id, toolResult(await store.getHealth(now, staleAfterSeconds)));
    }
    return rpcResult(body.id, toolResult({ error: "unknown tool" }, true));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool execution failed";
    return rpcResult(body.id, toolResult({ error: message }, true));
  }
}
