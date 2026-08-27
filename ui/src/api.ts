import { z } from "zod";
import type {
  IntelligenceSnapshot,
  NewsIntelligenceClient,
  SnapshotQuery,
} from "./types";

const locationSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  countryCode: z.string().nullable(),
  regionId: z.string().min(1),
  locationType: z.enum(["city", "admin1", "country", "multi-region", "unknown"]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  confidence: z.number().min(0).max(1),
  evidenceCount: z.number().int().nonnegative(),
});

const sourceSchema = z.object({
  id: z.string().min(1),
  publisher: z.string().min(1),
  publisherOrigin: z
    .object({
      label: z.string().min(1),
      countryCode: z.string().nullable(),
      latitude: z.number().min(-90).max(90).nullable(),
      longitude: z.number().min(-180).max(180).nullable(),
    })
    .nullable(),
  articleTitle: z.string().min(1),
  url: z.url(),
  language: z.string().min(1),
  publishedAt: z.iso.datetime(),
  retrievedAt: z.iso.datetime(),
  excerpt: z.string().nullable(),
  claimPosition: z.enum(["supports", "disputes", "reports", "unclear"]),
});

const clusterSchema = z.object({
  id: z.string().min(1),
  canonicalTitle: z.string().min(1),
  summary: z.string(),
  eventLocations: z.array(locationSchema),
  primaryRegionId: z.string().min(1),
  rawProminence: z.number().nonnegative(),
  normalizedProminence: z.number().min(0).max(1),
  articleCount: z.number().int().nonnegative(),
  publisherCount: z.number().int().nonnegative(),
  languageCount: z.number().int().nonnegative(),
  firstObservedAt: z.iso.datetime(),
  lastObservedAt: z.iso.datetime(),
  membershipConfidence: z.number().min(0).max(1),
  signals: z.object({
    conflict: z.boolean(),
    underreported: z.boolean(),
    conflictSummary: z.string().nullable(),
    undercoverageSummary: z.string().nullable(),
  }),
  sources: z.array(sourceSchema),
});

export const intelligenceSnapshotSchema = z.object({
  generatedAt: z.iso.datetime(),
  window: z.enum(["6h", "24h", "7d"]),
  health: z.object({
    status: z.enum(["healthy", "degraded", "stale", "connecting"]),
    lastSuccessfulIngestionAt: z.iso.datetime().nullable(),
    ingestionLagSeconds: z.number().nonnegative().nullable(),
    activeSourceCount: z.number().int().nonnegative(),
    regionCount: z.number().int().nonnegative(),
    message: z.string().nullable(),
  }),
  regions: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      rawProminence: z.number().nonnegative(),
      normalizedProminence: z.number().min(0).max(1),
      storyCount: z.number().int().nonnegative(),
      sourceCount: z.number().int().nonnegative(),
      topClusterIds: z.array(z.string()),
    }),
  ),
  clusters: z.array(clusterSchema),
});

export class AtlasApiError extends Error {
  constructor(
    message: string,
    readonly kind: "unavailable" | "invalid-response" | "request-failed",
    readonly status?: number,
  ) {
    super(message);
    this.name = "AtlasApiError";
  }
}

export interface HttpClientOptions {
  baseUrl?: string;
  endpointPath?: string;
  fetchImpl?: typeof fetch;
}

function resolveBaseUrl(baseUrl?: string) {
  if (baseUrl) return baseUrl;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost";
}

export class HttpNewsIntelligenceClient implements NewsIntelligenceClient {
  private readonly baseUrl: string;
  private readonly endpointPath: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    this.endpointPath = options.endpointPath ?? "/api/v1/intelligence";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async getSnapshot({ window, prominence, signal }: SnapshotQuery): Promise<IntelligenceSnapshot> {
    const url = new URL(this.endpointPath, this.baseUrl);
    url.searchParams.set("window", window);
    url.searchParams.set("prominence", prominence);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        signal,
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new AtlasApiError(
        "The live intelligence service could not be reached.",
        "unavailable",
      );
    }

    if (!response.ok) {
      const kind = response.status === 404 || response.status === 503 ? "unavailable" : "request-failed";
      throw new AtlasApiError(
        kind === "unavailable"
          ? "The live intelligence endpoint is not connected yet."
          : `The intelligence service returned ${response.status}.`,
        kind,
        response.status,
      );
    }

    const payload: unknown = await response.json();
    const parsed = intelligenceSnapshotSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AtlasApiError(
        "The live intelligence response did not match the published data contract.",
        "invalid-response",
      );
    }
    return parsed.data;
  }
}

export function createDefaultClient() {
  return new HttpNewsIntelligenceClient({
    baseUrl: import.meta.env.VITE_ATLAS_API_BASE_URL,
    endpointPath: import.meta.env.VITE_ATLAS_INTELLIGENCE_PATH,
  });
}
