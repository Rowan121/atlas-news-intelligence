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
}

export interface PublisherOrigin {
  label: string;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface SourceCoverage {
  id: string;
  publisher: string;
  publisherOrigin: PublisherOrigin | null;
  articleTitle: string;
  url: string;
  language: string;
  publishedAt: string;
  retrievedAt: string;
  excerpt: string | null;
  claimPosition: "supports" | "disputes" | "reports" | "unclear";
}

export interface ClusterSignals {
  conflict: boolean;
  underreported: boolean;
  conflictSummary: string | null;
  undercoverageSummary: string | null;
}

export interface StoryCluster {
  id: string;
  canonicalTitle: string;
  summary: string;
  eventLocations: EventLocation[];
  primaryRegionId: string;
  rawProminence: number;
  normalizedProminence: number;
  articleCount: number;
  publisherCount: number;
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
