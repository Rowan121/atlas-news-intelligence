import type { Article, SourceProvider } from "../schema/types.js";

export interface SourceQuery {
  query: string;
  from: string;
  to: string;
  maxResults: number;
}

export type SourceFailureKind =
  | "timeout"
  | "network"
  | "http"
  | "rate_limited"
  | "auth"
  | "invalid_response"
  | "missing_key";

export interface SourceRunMeta {
  provider: SourceProvider;
  startedAt: string;
  finishedAt: string;
  query: string;
}

export interface SourceSuccess extends SourceRunMeta {
  ok: true;
  articles: Article[];
  warnings: string[];
}

export interface SourceFailure extends SourceRunMeta {
  ok: false;
  kind: SourceFailureKind;
  message: string;
  retryAfterSeconds?: number;
}

export type SourceResult = SourceSuccess | SourceFailure;

export interface NewsSourceClient {
  readonly provider: SourceProvider;
  search(query: SourceQuery): Promise<SourceResult>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref_src",
  "s_cid",
]);

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  // Reject non-network schemes so a provider-returned javascript:/data:/blob:
  // URL can never flow into a stored article URL that the UI renders in an
  // href. http/https are the only schemes the product treats as citations.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`Refusing to canonicalize a non-http(s) URL: ${url.protocol}`);
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  url.searchParams.sort();
  return url.toString();
}

export function domainFromUrl(value: string): string {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
}

export function stableId(prefix: string, value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  const absolute = Date.parse(value);
  if (!Number.isFinite(absolute)) return undefined;
  return Math.max(0, Math.ceil((absolute - Date.now()) / 1000));
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError" || error.name === "TimeoutError"
    : error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export function safeSourceError(error: unknown): string {
  if (error instanceof SyntaxError) return "Upstream returned malformed JSON.";
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.replace(/(?:tvly-|Bearer\s+)[A-Za-z0-9._-]+/gi, "[redacted]");
  }
  return "Unknown upstream failure.";
}
