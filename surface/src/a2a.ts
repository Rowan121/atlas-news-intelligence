import type { ProminenceMetric, StoryQuery } from "./contracts";
import { normalizeRfc3339DateTime } from "./date-time";
import type { TruthStore } from "./store";

interface A2AMessage {
  messageId: string;
  contextId?: string;
  role: "ROLE_USER" | string;
  parts: Array<{ data?: unknown; text?: unknown; [key: string]: unknown }>;
}

interface SendMessageRequest {
  message?: A2AMessage;
}

type A2AOperation =
  | { operation: "query_stories"; region?: string; since?: string; until?: string; metric?: ProminenceMetric; limit?: number }
  | { operation: "explain_story"; cluster_id: string }
  | { operation: "pipeline_health" };

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

function a2aResponse(value: unknown, requestId: string, contextId?: string): Response {
  return new Response(JSON.stringify({
    message: {
      messageId: `${requestId}:response`,
      contextId: contextId ?? `${requestId}:context`,
      role: "ROLE_AGENT",
      parts: [{ data: value, mediaType: "application/json" }],
    },
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

export async function handleA2aSend(
  request: Request,
  store: TruthStore,
  now: Date,
  staleAfterSeconds: number,
  requestId: string,
): Promise<Response> {
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
  let body: SendMessageRequest;
  try {
    body = await request.json() as SendMessageRequest;
  } catch {
    return problem(400, "Invalid A2A request", "Request body must be valid JSON");
  }
  const message = body.message;
  if (
    message === undefined
    || typeof message.messageId !== "string"
    || message.messageId === ""
    || message.role !== "ROLE_USER"
    || !Array.isArray(message.parts)
  ) {
    return problem(400, "Invalid A2A request", "messageId, ROLE_USER, and a parts array are required");
  }
  const dataParts = message.parts.filter((part) => Object.hasOwn(part, "data"));
  if (dataParts.length !== 1) {
    return problem(400, "Invalid A2A request", "Exactly one structured data part is required");
  }

  let operation: A2AOperation;
  try {
    operation = parseOperation(dataParts[0]?.data);
  } catch (error) {
    return problem(400, "Invalid A2A operation", error instanceof Error ? error.message : "Invalid operation");
  }

  if (operation.operation === "pipeline_health") {
    return a2aResponse({ operation: operation.operation, health: await store.getHealth(now, staleAfterSeconds) }, requestId, message.contextId);
  }
  if (operation.operation === "explain_story") {
    const story = await store.getStory(operation.cluster_id);
    if (story === null) return problem(404, "Story not found", "No story cluster exists for cluster_id");
    return a2aResponse({ operation: operation.operation, story }, requestId, message.contextId);
  }
  const query: StoryQuery = {
    metric: operation.metric ?? "normalized",
    limit: operation.limit ?? 20,
    ...(operation.region === undefined ? {} : { region: operation.region }),
    ...(operation.since === undefined ? {} : { since: operation.since }),
    ...(operation.until === undefined ? {} : { until: operation.until }),
  };
  const stories = await store.listStories(query, now, staleAfterSeconds);
  return a2aResponse({ operation: operation.operation, query, count: stories.length, stories }, requestId, message.contextId);
}
