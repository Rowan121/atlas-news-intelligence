import type { ProminenceMetric, StoryQuery } from "./contracts";
import { normalizeRfc3339DateTime } from "./date-time";
import type { TruthStore } from "./store";

interface A2AMessage {
  messageId: string;
  contextId?: string;
  role: "ROLE_USER" | string;
  parts: Array<{ data?: unknown; text?: unknown; mediaType?: unknown; [key: string]: unknown }>;
}

interface SendMessageRequest {
  message?: unknown;
}

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

type A2AOperation =
  | { operation: "query_stories"; region?: string; since?: string; until?: string; metric?: ProminenceMetric; limit?: number }
  | { operation: "explain_story"; cluster_id: string }
  | { operation: "pipeline_health" };

class A2AContentTypeError extends Error {}
class StoryNotFoundError extends Error {}

function problem(status: number, title: string, detail: string): Response {
  return new Response(JSON.stringify({
    type: "about:blank",
    title,
    status,
    detail,
  }), {
    status,
    headers: {
      "Content-Type": "application/problem+json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requestMediaType(request: Request): string | null {
  const contentType = request.headers.get("Content-Type");
  return contentType === null ? null : contentType.split(";", 1)[0]!.trim().toLowerCase();
}

function partMediaType(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new A2AContentTypeError("Part mediaType must be a string");
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

function parseTimestamp(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = typeof value === "string" ? normalizeRfc3339DateTime(value) : null;
  if (normalized === null) throw new Error(`${field} must be an RFC 3339 date-time`);
  return normalized;
}

function parseOperation(raw: unknown): A2AOperation {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("message data must be an object");
  }
  const input = raw as Record<string, unknown>;
  if (input.operation === "pipeline_health") return { operation: "pipeline_health" };
  if (input.operation === "explain_story") {
    if (typeof input.cluster_id !== "string" || input.cluster_id.length < 1 || input.cluster_id.length > 200) {
      throw new Error("cluster_id must be a non-empty string of at most 200 characters");
    }
    return { operation: "explain_story", cluster_id: input.cluster_id };
  }
  if (input.operation === "query_stories") {
    const metric = input.metric ?? "normalized";
    if (metric !== "raw" && metric !== "normalized") throw new Error("metric must be raw or normalized");
    const limit = input.limit ?? 20;
    if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 100) {
      throw new Error("limit must be an integer between 1 and 100");
    }
    const region = input.region;
    if (region !== undefined && (typeof region !== "string" || !/^[A-Za-z0-9_-]{2,16}$/.test(region))) {
      throw new Error("region must be a 2-16 character geographic code");
    }
    const since = parseTimestamp(input.since, "since");
    const until = parseTimestamp(input.until, "until");
    if (since !== undefined && until !== undefined && since > until) throw new Error("since must not be after until");
    return {
      operation: "query_stories",
      metric,
      limit: limit as number,
      ...(typeof region === "string" ? { region: region.toUpperCase() } : {}),
      ...(since === undefined ? {} : { since }),
      ...(until === undefined ? {} : { until }),
    };
  }
  throw new Error("operation must be query_stories, explain_story, or pipeline_health");
}

function parseMessage(raw: unknown): A2AMessage {
  if (
    !isRecord(raw)
    || typeof raw.messageId !== "string"
    || raw.messageId === ""
    || raw.role !== "ROLE_USER"
    || !Array.isArray(raw.parts)
  ) {
    throw new Error("messageId, ROLE_USER, and a parts array are required");
  }
  if (!raw.parts.every(isRecord)) throw new Error("Every message part must be an object");
  return raw as unknown as A2AMessage;
}

function operationFromMessage(message: A2AMessage): A2AOperation {
  const candidates: unknown[] = [];
  for (const part of message.parts) {
    const hasData = Object.hasOwn(part, "data");
    const hasText = Object.hasOwn(part, "text");
    if (!hasData && !hasText) continue;
    if (hasData && hasText) throw new Error("An operation part must contain data or text, not both");

    if (hasData) {
      const mediaType = partMediaType(part.mediaType);
      if (mediaType !== undefined && mediaType !== "application/json") {
        throw new A2AContentTypeError("Structured operation parts support only application/json");
      }
      candidates.push(part.data);
      continue;
    }

    const mediaType = partMediaType(part.mediaType);
    if (mediaType !== undefined && mediaType !== "application/json" && mediaType !== "text/plain") {
      throw new A2AContentTypeError("Text operation parts support only application/json or text/plain");
    }
    if (typeof part.text !== "string") throw new Error("A text operation part must contain a string");
    try {
      candidates.push(JSON.parse(part.text));
    } catch {
      throw new Error("A text operation part must contain strict JSON for a read-only operation");
    }
  }
  if (candidates.length !== 1) {
    throw new Error("Exactly one structured data or strict-JSON text operation part is required");
  }
  return parseOperation(candidates[0]);
}

async function executeOperation(
  operation: A2AOperation,
  store: TruthStore,
  now: Date,
  staleAfterSeconds: number,
): Promise<unknown> {
  if (operation.operation === "pipeline_health") {
    return { operation: operation.operation, health: await store.getHealth(now, staleAfterSeconds) };
  }
  if (operation.operation === "explain_story") {
    const story = await store.getStory(operation.cluster_id);
    if (story === null) throw new StoryNotFoundError("No story cluster exists for cluster_id");
    return { operation: operation.operation, story };
  }
  const query: StoryQuery = {
    metric: operation.metric ?? "normalized",
    limit: operation.limit ?? 20,
    ...(operation.region === undefined ? {} : { region: operation.region }),
    ...(operation.since === undefined ? {} : { since: operation.since }),
    ...(operation.until === undefined ? {} : { until: operation.until }),
  };
  const stories = await store.listStories(query, now, staleAfterSeconds);
  return { operation: operation.operation, query, count: stories.length, stories };
}

function responseMessage(value: unknown, requestId: string, contextId?: string): Record<string, unknown> {
  return {
    messageId: `${requestId}:response`,
    contextId: contextId ?? `${requestId}:context`,
    role: "ROLE_AGENT",
    parts: [{ data: value, mediaType: "application/json" }],
  };
}

function a2aResponse(value: unknown, requestId: string, contextId?: string): Response {
  return new Response(JSON.stringify({
    message: responseMessage(value, requestId, contextId),
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/a2a+json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "A2A-Version": "1.0",
    },
  });
}

function jsonRpcResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "A2A-Version": "1.0",
    },
  });
}

function jsonRpcError(id: unknown, code: number, message: string, detail?: string): Response {
  return jsonRpcResponse({
    jsonrpc: "2.0",
    id: typeof id === "string" || typeof id === "number" || id === null ? id : null,
    error: {
      code,
      message,
      ...(detail === undefined ? {} : {
        data: [{
          "@type": "type.googleapis.com/google.rpc.BadRequest",
          fieldViolations: [{ field: "params", description: detail }],
        }],
      }),
    },
  });
}

export async function handleA2aJsonRpc(
  request: Request,
  store: TruthStore,
  now: Date,
  staleAfterSeconds: number,
  requestId: string,
): Promise<Response> {
  if (requestMediaType(request) !== "application/json") {
    return jsonRpcError(null, -32005, "Content type not supported", "JSON-RPC requests require application/json");
  }
  const requestedVersion = request.headers.get("A2A-Version");
  if (requestedVersion !== null && requestedVersion !== "1.0") {
    return jsonRpcError(null, -32009, "Protocol version not supported", `Supported versions: 1.0; received ${requestedVersion}`);
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Invalid JSON payload");
  }
  if (!isRecord(parsed)) return jsonRpcError(null, -32600, "Request payload validation error");
  const body = parsed as JsonRpcRequest;
  const validId = body.id === undefined || body.id === null || typeof body.id === "string" || typeof body.id === "number";
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string" || !validId) {
    return jsonRpcError(body.id, -32600, "Request payload validation error");
  }
  if (body.id === undefined) return new Response(null, { status: 202, headers: { "A2A-Version": "1.0" } });
  if (body.method !== "SendMessage" && body.method !== "message/send") {
    return jsonRpcError(body.id, -32601, "Method not found");
  }
  if (!isRecord(body.params)) return jsonRpcError(body.id, -32602, "Invalid parameters", "params must be an object");

  let message: A2AMessage;
  let operation: A2AOperation;
  try {
    message = parseMessage(body.params.message);
    operation = operationFromMessage(message);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid SendMessage parameters";
    return jsonRpcError(
      body.id,
      error instanceof A2AContentTypeError ? -32005 : -32602,
      error instanceof A2AContentTypeError ? "Content type not supported" : "Invalid parameters",
      detail,
    );
  }

  try {
    const value = await executeOperation(operation, store, now, staleAfterSeconds);
    return jsonRpcResponse({
      jsonrpc: "2.0",
      id: body.id,
      result: { message: responseMessage(value, requestId, message.contextId) },
    });
  } catch (error) {
    if (error instanceof StoryNotFoundError) {
      return jsonRpcError(body.id, -32602, "Invalid parameters", error.message);
    }
    return jsonRpcError(body.id, -32603, "Internal error");
  }
}

export async function handleA2aSend(
  request: Request,
  store: TruthStore,
  now: Date,
  staleAfterSeconds: number,
  requestId: string,
): Promise<Response> {
  const mediaType = requestMediaType(request);
  if (mediaType !== null && mediaType !== "application/a2a+json" && mediaType !== "application/json") {
    return problem(400, "A2A content type not supported", "Use application/a2a+json for HTTP+JSON SendMessage requests");
  }
  const requestedVersion = request.headers.get("A2A-Version");
  if (requestedVersion !== null && requestedVersion !== "1.0") {
    return new Response(JSON.stringify({
      type: "https://a2a-protocol.org/errors/version-not-supported",
      title: "Protocol Version Not Supported",
      status: 400,
      detail: `The requested A2A protocol version ${requestedVersion} is not supported by Atlas`,
      supportedVersions: ["1.0"],
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/problem+json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "A2A-Version": "1.0",
      },
    });
  }
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return problem(400, "Invalid A2A request", "Request body must be valid JSON");
  }
  if (!isRecord(parsed)) {
    return problem(400, "Invalid A2A request", "Request body must be a JSON object");
  }
  const body = parsed as SendMessageRequest;
  let message: A2AMessage;
  try {
    message = parseMessage(body.message);
  } catch (error) {
    return problem(400, "Invalid A2A request", error instanceof Error ? error.message : "Invalid message");
  }
  let operation: A2AOperation;
  try {
    operation = operationFromMessage(message);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid operation";
    return error instanceof A2AContentTypeError
      ? problem(400, "A2A content type not supported", detail)
      : problem(400, "Invalid A2A operation", detail);
  }

  try {
    return a2aResponse(await executeOperation(operation, store, now, staleAfterSeconds), requestId, message.contextId);
  } catch (error) {
    if (error instanceof StoryNotFoundError) return problem(404, "Story not found", error.message);
    throw error;
  }
}
