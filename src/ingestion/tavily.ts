import type { Article } from "../schema/types.js";
import {
  canonicalizeUrl,
  domainFromUrl,
  isAbortError,
  parseRetryAfter,
  safeSourceError,
  stableId,
  systemClock,
  type Clock,
  type NewsSourceClient,
  type SourceQuery,
  type SourceResult,
} from "./sources.js";

interface TavilyResultRecord {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  published_date?: unknown;
  score?: unknown;
}

interface TavilyResponse {
  results?: unknown;
}

export interface TavilyClientOptions {
  apiKey?: string;
  fetch?: typeof fetch;
  clock?: Clock;
  timeoutMs?: number;
  endpoint?: string;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseDate(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (raw === undefined) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function mapRecord(record: TavilyResultRecord, retrievedAt: string): Article | undefined {
  const url = stringValue(record.url);
  const title = stringValue(record.title);
  if (url === undefined || title === undefined) return undefined;
  let canonicalUrl: string;
  let domain: string;
  try {
    canonicalUrl = canonicalizeUrl(url);
    domain = domainFromUrl(canonicalUrl);
  } catch {
    return undefined;
  }
  const summary = stringValue(record.content);
  const publishedAt = parseDate(record.published_date);
  const providerScore = typeof record.score === "number" && Number.isFinite(record.score) ? record.score : undefined;
  return {
    id: stableId("article", canonicalUrl),
    url,
    canonicalUrl,
    title,
    ...(summary === undefined ? {} : { summary }),
    publisher: {
      id: stableId("publisher", domain),
      name: domain,
      domain,
    },
    ...(publishedAt === undefined ? {} : { publishedAt }),
    retrievedAt,
    source: {
      provider: "tavily",
      ...(providerScore === undefined ? {} : { providerScore }),
    },
  };
}

export class TavilyClient implements NewsSourceClient {
  readonly provider = "tavily" as const;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly clock: Clock;
  private readonly timeoutMs: number;
  private readonly endpoint: string;

  constructor(options: TavilyClientOptions = {}) {
    this.apiKey = options.apiKey?.trim() || undefined;
    this.fetchImpl = options.fetch ?? fetch;
    this.clock = options.clock ?? systemClock;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.endpoint = options.endpoint ?? "https://api.tavily.com/search";
  }

  async search(query: SourceQuery): Promise<SourceResult> {
    const startedAt = this.clock.now().toISOString();
    if (this.apiKey === undefined) {
      return {
        ok: false,
        provider: this.provider,
        startedAt,
        finishedAt: this.clock.now().toISOString(),
        query: query.query,
        kind: "missing_key",
        message: "Tavily is disabled because TAVILY_API_KEY was not supplied.",
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query: query.query,
          topic: "news",
          search_depth: "advanced",
          max_results: Math.max(1, Math.min(20, Math.floor(query.maxResults))),
          start_date: query.from.slice(0, 10),
          end_date: query.to.slice(0, 10),
          include_raw_content: false,
        }),
        signal: controller.signal,
      });
      const finishedAt = this.clock.now().toISOString();
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          provider: this.provider,
          startedAt,
          finishedAt,
          query: query.query,
          kind: "auth",
          message: "Tavily rejected the configured credential.",
        };
      }
      if (response.status === 429) {
        const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
        return {
          ok: false,
          provider: this.provider,
          startedAt,
          finishedAt,
          query: query.query,
          kind: "rate_limited",
          message: "Tavily rate limited the request.",
          ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          provider: this.provider,
          startedAt,
          finishedAt,
          query: query.query,
          kind: "http",
          message: `Tavily returned HTTP ${response.status}.`,
        };
      }
      let payload: TavilyResponse;
      try {
        payload = (await response.json()) as TavilyResponse;
      } catch {
        return {
          ok: false,
          provider: this.provider,
          startedAt,
          finishedAt,
          query: query.query,
          kind: "invalid_response",
          message: "Tavily returned malformed JSON.",
        };
      }
      if (!Array.isArray(payload.results)) {
        return {
          ok: false,
          provider: this.provider,
          startedAt,
          finishedAt,
          query: query.query,
          kind: "invalid_response",
          message: "Tavily response did not contain a results array.",
        };
      }
      const articles = payload.results
        .map((record) => mapRecord(record as TavilyResultRecord, finishedAt))
        .filter((article): article is Article => article !== undefined);
      const warnings =
        articles.length === payload.results.length
          ? []
          : [`${payload.results.length - articles.length} malformed Tavily records were omitted.`];
      return {
        ok: true,
        provider: this.provider,
        startedAt,
        finishedAt,
        query: query.query,
        articles,
        warnings,
      };
    } catch (error) {
      const finishedAt = this.clock.now().toISOString();
      return {
        ok: false,
        provider: this.provider,
        startedAt,
        finishedAt,
        query: query.query,
        kind: isAbortError(error) ? "timeout" : "network",
        message: isAbortError(error) ? "Tavily request timed out." : safeSourceError(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function tavilyFromEnvironment(environment: NodeJS.ProcessEnv = process.env): TavilyClient {
  const apiKey = environment.TAVILY_API_KEY;
  return new TavilyClient(apiKey === undefined ? {} : { apiKey });
}
