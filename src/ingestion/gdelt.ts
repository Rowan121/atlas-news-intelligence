import { sameStorySourceContext, type Article } from "../schema/types.js";
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

interface GdeltArticleRecord {
  url?: unknown;
  title?: unknown;
  seendate?: unknown;
  domain?: unknown;
  language?: unknown;
  sourcecountry?: unknown;
}

interface GdeltResponse {
  articles?: unknown;
}

export interface GdeltClientOptions {
  fetch?: typeof fetch;
  clock?: Clock;
  timeoutMs?: number;
  endpoint?: string;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseGdeltDate(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (raw === undefined) return undefined;
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (match === null) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  }
  const [, year, month, day, hour, minute, second] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
}

function gdeltDate(value: string): string {
  const date = new Date(value);
  return date.toISOString().replace(/[-:T]/g, "").replace(/\.\d{3}Z$/, "");
}

function mapRecord(record: GdeltArticleRecord, retrievedAt: string): Article | undefined {
  const url = stringValue(record.url);
  const title = stringValue(record.title);
  if (url === undefined || title === undefined) return undefined;
  let canonicalUrl: string;
  let domain: string;
  try {
    canonicalUrl = canonicalizeUrl(url);
    domain = stringValue(record.domain)?.toLowerCase() ?? domainFromUrl(canonicalUrl);
  } catch {
    return undefined;
  }
  const countryName = stringValue(record.sourcecountry);
  const publishedAt = parseGdeltDate(record.seendate);
  const language = stringValue(record.language);
  const publisherOrigin = countryName === undefined
    ? undefined
    : {
        countryName,
        confidence: 0.8,
        evidenceSource: "provider_metadata" as const,
      };
  return {
    id: stableId("article", canonicalUrl),
    url,
    canonicalUrl,
    title,
    publisher: {
      id: stableId("publisher", domain),
      name: domain,
      domain,
      ...(publisherOrigin === undefined ? {} : { origin: publisherOrigin }),
    },
    ...(language === undefined ? {} : { language }),
    ...(publishedAt === undefined ? {} : { publishedAt }),
    retrievedAt,
    source: { provider: "gdelt" },
    sameStory: sameStorySourceContext(publisherOrigin),
  };
}

export class GdeltClient implements NewsSourceClient {
  readonly provider = "gdelt" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly clock: Clock;
  private readonly timeoutMs: number;
  private readonly endpoint: string;

  constructor(options: GdeltClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.clock = options.clock ?? systemClock;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.endpoint = options.endpoint ?? "https://api.gdeltproject.org/api/v2/doc/doc";
  }

  async search(query: SourceQuery): Promise<SourceResult> {
    const startedAt = this.clock.now().toISOString();
    const params = new URLSearchParams({
      query: query.query,
      mode: "ArtList",
      format: "json",
      maxrecords: String(Math.max(1, Math.min(250, Math.floor(query.maxResults)))),
      startdatetime: gdeltDate(query.from),
      enddatetime: gdeltDate(query.to),
      sort: "DateDesc",
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.endpoint}?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const finishedAt = this.clock.now().toISOString();
      if (response.status === 429) {
        const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
        return {
          ok: false,
          provider: this.provider,
          startedAt,
          finishedAt,
          query: query.query,
          kind: "rate_limited",
          message: "GDELT rate limited the request.",
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
          message: `GDELT returned HTTP ${response.status}.`,
        };
      }
      let payload: GdeltResponse;
      try {
        payload = (await response.json()) as GdeltResponse;
      } catch {
        return {
          ok: false,
          provider: this.provider,
          startedAt,
          finishedAt,
          query: query.query,
          kind: "invalid_response",
          message: "GDELT returned malformed JSON.",
        };
      }
      if (!Array.isArray(payload.articles)) {
        return {
          ok: false,
          provider: this.provider,
          startedAt,
          finishedAt,
          query: query.query,
          kind: "invalid_response",
          message: "GDELT response did not contain an articles array.",
        };
      }
      const warnings: string[] = [];
      const retrievedAt = finishedAt;
      const mapped = payload.articles
        .map((record) => mapRecord(record as GdeltArticleRecord, retrievedAt))
        .filter((article): article is Article => article !== undefined);
      if (mapped.length < payload.articles.length) {
        warnings.push(`${payload.articles.length - mapped.length} malformed GDELT records were omitted.`);
      }
      return {
        ok: true,
        provider: this.provider,
        startedAt,
        finishedAt,
        query: query.query,
        articles: mapped,
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
        message: isAbortError(error) ? "GDELT request timed out." : safeSourceError(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
