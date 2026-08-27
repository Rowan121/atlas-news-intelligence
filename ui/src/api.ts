import { z } from "zod";
import type {
  EditorialMarketEvidenceKind,
  EditorialMarketMethod,
  IntelligenceSnapshot,
  NewsIntelligenceClient,
  SnapshotQuery,
} from "./types";

function evidenceSupportsEditorialMarketMethod(
  method: EditorialMarketMethod,
  evidence: Array<{ kind: EditorialMarketEvidenceKind }>,
) {
  const kinds = new Set(evidence.map((item) => item.kind));
  if (method === "documented_outlet_market") {
    return kinds.has("outlet_market_documentation");
  }
  if (method === "language_and_publisher_location") {
    return kinds.has("outlet_language") && kinds.has("publisher_location");
  }
  return true;
}

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
  isPrimary: z.boolean(),
});

const assessmentEvidenceSchema = z.object({
  articleId: z.string().min(1),
  url: z.url(),
  quote: z.string().min(1),
});

const editorialMarketEvidenceSchema = z.object({
  kind: z.enum(["outlet_market_documentation", "outlet_language", "publisher_location"]),
  url: z.url(),
  quote: z.string().min(1),
  articleId: z.string().min(1).optional(),
});

const marketRegionSchema = z.object({
  regionCode: z.string().min(1),
  label: z.string().min(1),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional(),
});

const unknownAssessmentSchema = z.object({
  status: z.literal("unknown"),
  value: z.null(),
  confidence: z.null(),
  method: z.literal("unavailable"),
  evidence: z.tuple([]),
  reason: z.string().min(1),
});

const publisherOriginSchema = z.discriminatedUnion("status", [
  unknownAssessmentSchema,
  z.object({
    status: z.literal("observed"),
    value: marketRegionSchema,
    confidence: z.number().min(0).max(1),
    method: z.enum(["provider_metadata", "publisher_registry"]),
    evidence: z.array(assessmentEvidenceSchema),
    reason: z.null(),
  }),
]);

const editorialMarketSchema = z.discriminatedUnion("status", [
  unknownAssessmentSchema,
  z.object({
    status: z.literal("observed"),
    value: marketRegionSchema,
    confidence: z.number().min(0).max(1),
    method: z.enum(["documented_outlet_market", "language_and_publisher_location", "manual_confirmed"]),
    evidence: z.array(editorialMarketEvidenceSchema).min(1),
    reason: z.null(),
  }),
]).superRefine((assessment, context) => {
  if (
    assessment.status === "observed"
    && !evidenceSupportsEditorialMarketMethod(assessment.method, assessment.evidence)
  ) {
    context.addIssue({
      code: "custom",
      message: "Editorial-market evidence does not support the declared method.",
      path: ["method"],
    });
  }
});

const framingSchema = z.discriminatedUnion("status", [
  unknownAssessmentSchema,
  z.object({
    status: z.literal("observed"),
    value: z.enum(["supports", "disputes", "straight_report", "mixed", "unclear"]),
    confidence: z.number().min(0).max(1),
    method: z.enum(["claim_stance_comparison", "model_analysis", "manual_confirmed"]),
    evidence: z.array(assessmentEvidenceSchema).min(1),
    reason: z.null(),
  }),
]);

const toneSchema = z.discriminatedUnion("status", [
  unknownAssessmentSchema,
  z.object({
    status: z.literal("observed"),
    value: z.enum(["positive", "negative", "neutral", "mixed", "unclear"]),
    confidence: z.number().min(0).max(1),
    method: z.enum(["model_analysis", "manual_confirmed"]),
    evidence: z.array(assessmentEvidenceSchema).min(1),
    reason: z.null(),
  }),
]);

const sourceSchema = z.object({
  id: z.string().min(1),
  publisher: z.string().min(1),
  publisherDomain: z.string().min(1),
  publisherOrigin: publisherOriginSchema,
  editorialMarket: editorialMarketSchema,
  framing: framingSchema,
  tone: toneSchema,
  articleTitle: z.string().min(1),
  url: z.url(),
  language: z.string().min(1),
  publishedAt: z.iso.datetime(),
  retrievedAt: z.iso.datetime(),
  excerpt: z.string().nullable(),
  claimPosition: z.enum(["supports", "disputes", "reports", "unclear"]),
});

const signalSchema = z.object({
  status: z.enum(["detected", "not_detected", "not_assessed"]),
  confidence: z.number().min(0).max(1).nullable(),
  method: z.enum(["claim_stance_comparison", "coverage_baseline_comparison", "unavailable"]),
  summary: z.string().nullable(),
  evidence: z.array(assessmentEvidenceSchema),
  reason: z.string().nullable(),
});

const prominenceSchema = z.object({
  basis: z.literal("event_location"),
  caveat: z.string().min(1),
  byRegion: z.array(z.object({
    regionId: z.string().min(1),
    regionLabel: z.string().min(1),
    raw: z.object({ articleCount: z.number().int().nonnegative(), outletCount: z.number().int().nonnegative() }),
    normalized: z.object({
      score: z.number().min(0).max(1),
      articleShare: z.number().min(0).max(1),
      outletShare: z.number().min(0).max(1),
      sourceNormalizedShare: z.number().min(0).max(1),
      denominators: z.object({
        regionalArticleMemberships: z.number().int().nonnegative(),
        regionalOutlets: z.number().int().nonnegative(),
      }),
      formulaVersion: z.string().min(1),
    }),
  })),
});

const editorialMarketCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  confidence: z.number().min(0).max(1),
  method: z.enum(["documented_outlet_market", "language_and_publisher_location", "manual_confirmed"]),
  evidence: z.array(editorialMarketEvidenceSchema).min(1),
}).superRefine((coordinates, context) => {
  if (!evidenceSupportsEditorialMarketMethod(coordinates.method, coordinates.evidence)) {
    context.addIssue({
      code: "custom",
      message: "Editorial-market coordinate evidence does not support the declared method.",
      path: ["method"],
    });
  }
});

const coverageHeatSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("observed"),
    basis: z.literal("editorial_market"),
    markets: z.array(z.object({
      regionCode: z.string().min(1),
      label: z.string().min(1),
      rawArticleCount: z.number().int().nonnegative(),
      uniquePublisherCount: z.number().int().nonnegative(),
      sourceNormalizedShare: z.number().min(0).max(1),
      coordinates: editorialMarketCoordinatesSchema.nullable(),
    })).min(1),
    reason: z.null(),
  }),
  z.object({
    status: z.literal("unavailable"),
    basis: z.literal("editorial_market"),
    markets: z.tuple([]),
    reason: z.string().min(1),
  }),
]);

const clusterSchema = z.object({
  id: z.string().min(1),
  canonicalTitle: z.string().min(1),
  summary: z.string(),
  eventLocations: z.array(locationSchema),
  primaryRegionId: z.string().min(1),
  rawProminence: z.number().nonnegative(),
  normalizedProminence: z.number().min(0).max(1),
  prominence: prominenceSchema,
  coverageHeat: coverageHeatSchema,
  articleCount: z.number().int().nonnegative(),
  publisherCount: z.number().int().nonnegative(),
  languageCount: z.number().int().nonnegative(),
  firstObservedAt: z.iso.datetime(),
  lastObservedAt: z.iso.datetime(),
  membershipConfidence: z.number().min(0).max(1),
  signals: z.object({ conflict: signalSchema, omission: signalSchema }),
  sources: z.array(sourceSchema),
}).superRefine((cluster, context) => {
  if (cluster.coverageHeat.status !== "observed") return;

  cluster.coverageHeat.markets.forEach((market, marketIndex) => {
    const sourceAssessments = cluster.sources.flatMap((source) => (
      source.editorialMarket.status === "observed"
      && source.editorialMarket.value.regionCode === market.regionCode
        ? [source.editorialMarket]
        : []
    ));
    if (sourceAssessments.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Coverage heat must be backed by an observed source editorial market.",
        path: ["coverageHeat", "markets", marketIndex],
      });
      return;
    }

    if (market.coordinates !== null && !sourceAssessments.some((assessment) => {
      const coordinates = assessment.value.coordinates;
      return coordinates !== undefined
        && coordinates.latitude === market.coordinates?.latitude
        && coordinates.longitude === market.coordinates?.longitude;
    })) {
      context.addIssue({
        code: "custom",
        message: "Coverage heat coordinates must come from an observed source editorial market.",
        path: ["coverageHeat", "markets", marketIndex, "coordinates"],
      });
    }
  });
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
