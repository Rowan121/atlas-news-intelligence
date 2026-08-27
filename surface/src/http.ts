import type { ErrorKind, FailureEnvelope, SuccessEnvelope } from "./contracts";

export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly kind: ErrorKind,
    message: string,
    readonly retryable = false,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpProblem";
  }
}

export function success<T>(
  data: T,
  requestId: string,
  now: Date,
  init: ResponseInit = {},
): Response {
  const body: SuccessEnvelope<T> = {
    ok: true,
    data,
    meta: { request_id: requestId, generated_at: now.toISOString() },
  };
  return json(body, init);
}

export function failure(problem: HttpProblem, requestId: string, now: Date): Response {
  const body: FailureEnvelope = {
    ok: false,
    error: {
      kind: problem.kind,
      message: problem.message,
      retryable: problem.retryable,
      ...(problem.details === undefined ? {} : { details: problem.details }),
    },
    meta: { request_id: requestId, generated_at: now.toISOString() },
  };
  return json(body, { status: problem.status, headers: { "Cache-Control": "no-store" } });
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new HttpProblem(400, "bad_request", "limit must be a positive integer");
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > max) {
    throw new HttpProblem(400, "bad_request", `limit must be between 1 and ${max}`);
  }
  return parsed;
}

export function parseTimestamp(value: string | null, field: string): string | undefined {
  if (value === null) return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new HttpProblem(400, "bad_request", `${field} must be an ISO-8601 timestamp`);
  }
  return parsed.toISOString();
}
