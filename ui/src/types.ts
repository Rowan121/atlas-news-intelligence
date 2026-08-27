export type TimeWindow = "6h" | "24h" | "7d";
export type ProminenceMode = "raw" | "normalized";
export type PipelineStatus = "healthy" | "degraded" | "stale" | "connecting";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface EventLocation extends Coordinates {
  id: string;
  label: string;
  countryCode: string | null;
  regionId: string;
  locationType: "city" | "admin1" | "country" | "multi-region" | "unknown";
  confidence: number;
  evidenceCount: number;
  isPrimary: boolean;
}

export interface AssessmentEvidence {
  articleId: string;
  url: string;
  quote: string;
}

export type EditorialMarketEvidenceKind =
  | "outlet_market_documentation"
  | "outlet_language"
  | "publisher_location";

export interface EditorialMarketEvidence {
  kind: EditorialMarketEvidenceKind;
  url: string;
  quote: string;
  articleId?: string;
}

export type EditorialMarketMethod =
  | "documented_outlet_market"
  | "language_and_publisher_location"
  | "manual_confirmed";

export interface MarketRegion {
  regionCode: string;
  label: string;
  coordinates?: Coordinates;
}

export interface UnknownAssessment {
  status: "unknown";
  value: null;
  confidence: null;
  method: "unavailable";
  evidence: [];
  reason: string;
}

export interface ObservedAssessment<
  T,
  Method extends string,
  Evidence = AssessmentEvidence,
> {
  status: "observed";
  value: T;
  confidence: number;
  method: Method;
  evidence: Evidence[];
  reason: null;
}

export type PublisherOriginAssessment = UnknownAssessment | ObservedAssessment<MarketRegion, "provider_metadata" | "publisher_registry">;
export type EditorialMarketAssessment = UnknownAssessment | ObservedAssessment<MarketRegion, EditorialMarketMethod, EditorialMarketEvidence>;
export type FramingAssessment = UnknownAssessment | ObservedAssessment<"supports" | "disputes" | "straight_report" | "mixed" | "unclear", "claim_stance_comparison" | "model_analysis" | "manual_confirmed">;
export type ToneAssessment = UnknownAssessment | ObservedAssessment<"positive" | "negative" | "neutral" | "mixed" | "unclear", "model_analysis" | "manual_confirmed">;

export interface SourceCoverage {
  id: string;
  publisher: string;
  publisherDomain: string;
  publisherOrigin: PublisherOriginAssessment;
  editorialMarket: EditorialMarketAssessment;
  framing: FramingAssessment;
  tone: ToneAssessment;
  articleTitle: string;
  url: string;
  language: string;
  publishedAt: string;
  retrievedAt: string;
  excerpt: string | null;
  claimPosition: "supports" | "disputes" | "reports" | "unclear";
}

export interface ClusterSignals {
  conflict: SignalAssessment;
  omission: SignalAssessment;
}

export interface SignalAssessment {
  status: "detected" | "not_detected" | "not_assessed";
  confidence: number | null;
  method: "claim_stance_comparison" | "coverage_baseline_comparison" | "unavailable";
  summary: string | null;
  evidence: AssessmentEvidence[];
  reason: string | null;
}

export interface ClusterProminence {
  basis: "event_location";
  caveat: string;
  byRegion: Array<{
    regionId: string;
    regionLabel: string;
    raw: { articleCount: number; outletCount: number };
    normalized: {
      score: number;
      articleShare: number;
      outletShare: number;
      sourceNormalizedShare: number;
      denominators: { regionalArticleMemberships: number; regionalOutlets: number };
      formulaVersion: string;
    };
  }>;
}

export interface CoverageHeat {
  status: "observed" | "unavailable";
  basis: "editorial_market";
  markets: Array<{
    regionCode: string;
    label: string;
    rawArticleCount: number;
    uniqueOutletCount: number;
    sourceNormalizedShare: number;
    coordinates: null | (Coordinates & {
      confidence: number;
      method: EditorialMarketMethod;
      evidence: EditorialMarketEvidence[];
    });
  }>;
  reason: string | null;
}

export interface StoryCluster {
  id: string;
  canonicalTitle: string;
  summary: string;
  eventLocations: EventLocation[];
  primaryRegionId: string;
  rawProminence: number;
  normalizedProminence: number;
  prominence: ClusterProminence;
  coverageHeat: CoverageHeat;
  articleCount: number;
  outletCount: number;
  languageCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  membershipConfidence: number;
  signals: ClusterSignals;
  sources: SourceCoverage[];
}

export interface RegionDominance extends Coordinates {
  id: string;
  label: string;
  rawProminence: number;
  normalizedProminence: number;
  storyCount: number;
  sourceCount: number;
  topClusterIds: string[];
}

export interface PipelineHealth {
  status: PipelineStatus;
  lastSuccessfulIngestionAt: string | null;
  ingestionLagSeconds: number | null;
  activeSourceCount: number;
  regionCount: number;
  message: string | null;
}

export interface IntelligenceSnapshot {
  generatedAt: string;
  window: TimeWindow;
  health: PipelineHealth;
  regions: RegionDominance[];
  clusters: StoryCluster[];
}

export interface SnapshotQuery {
  window: TimeWindow;
  prominence: ProminenceMode;
  signal?: AbortSignal;
}

export interface NewsIntelligenceClient {
  getSnapshot(query: SnapshotQuery): Promise<IntelligenceSnapshot>;
}
