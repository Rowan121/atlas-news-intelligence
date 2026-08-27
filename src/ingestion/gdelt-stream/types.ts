import type { PipelineHealth, StoryCluster, ValidationIssue } from "../../schema/types.js";

export type GdeltFileKind = "events" | "mentions" | "gkg";

export interface GdeltManifestEntry {
  kind: GdeltFileKind;
  compressedBytes: number;
  md5: string;
  url: string;
  batchId: string;
}

export interface GdeltManifest {
  manifestUrl: string;
  batchId: string;
  batchTimestamp: string;
  files: Record<GdeltFileKind, GdeltManifestEntry>;
}

export interface GdeltActionGeo {
  type: number;
  fullName: string;
  countryCode?: string;
  adm1Code?: string;
  adm2Code?: string;
  latitude: number;
  longitude: number;
  featureId?: string;
}

export interface GdeltEventRecord {
  globalEventId: string;
  dateAdded: string;
  sourceUrl?: string;
  actionGeo?: GdeltActionGeo;
}

export interface GdeltMentionRecord {
  globalEventId: string;
  eventTimeDate: string;
  mentionTimeDate: string;
  mentionType: number;
  mentionSourceName: string;
  mentionIdentifier: string;
  sentenceId?: number;
  inRawText: boolean;
  confidence: number;
  translationInfo?: string;
}

export interface GdeltGkgRecord {
  recordId: string;
  publishedAt: string;
  sourceCollectionIdentifier: number;
  sourceCommonName: string;
  documentIdentifier: string;
  translationInfo?: string;
  pageTitle?: string;
}

export interface ParseDiagnostics {
  rowsSeen: number;
  rowsAccepted: number;
  rowsMalformed: number;
  hitRowCap: boolean;
}

export interface ParsedTable<T> {
  records: T[];
  diagnostics: ParseDiagnostics;
}

export interface GdeltStreamLimits {
  lastUpdateBytes: number;
  compressedBytes: Record<GdeltFileKind, number>;
  decompressedBytes: Record<GdeltFileKind, number>;
  rows: Record<GdeltFileKind, number>;
  maxClusters: number;
  maxArticlesPerCluster: number;
}

export interface GdeltJoinGates {
  mentionType: 1;
  inRawText: true;
  minimumConfidence: number;
  requireActionGeoCoordinates: true;
  requireGkgPageTitle: true;
}

export interface GdeltSnapshotStatistics {
  rows: Record<GdeltFileKind, ParseDiagnostics>;
  eligibleMentions: number;
  joinedMentions: number;
  droppedWithoutGkg: number;
  droppedWithoutTitle: number;
  clustersBeforeCap: number;
  clustersEmitted: number;
  articlesEmitted: number;
}

export interface IntelligenceSnapshot {
  kind: "atlas.intelligence_snapshot";
  schemaVersion: "1.0";
  generatedAt: string;
  batchId: string;
  batchTimestamp: string;
  source: {
    provider: "gdelt";
    attribution: string;
    manifestUrl: string;
    files: GdeltManifestEntry[];
  };
  gates: GdeltJoinGates;
  limits: GdeltStreamLimits;
  statistics: GdeltSnapshotStatistics;
  health: PipelineHealth;
  clusters: StoryCluster[];
  validationIssues: Array<{ clusterId: string; issues: ValidationIssue[] }>;
  /** Optional, explicit provenance supplied with the source artifact. */
  cotalReceipt?: unknown;
}

export type GdeltLoadStage = "manifest" | "events" | "mentions" | "gkg" | "join" | "validation";

export type GdeltLoadErrorKind =
  | "timeout"
  | "network"
  | "http"
  | "rate_limited"
  | "too_large"
  | "manifest_invalid"
  | "checksum_mismatch"
  | "archive_invalid"
  | "parse_invalid"
  | "no_qualified_records";

export interface GdeltLoadFailure {
  ok: false;
  generatedAt: string;
  error: {
    stage: GdeltLoadStage;
    kind: GdeltLoadErrorKind;
    message: string;
    retryable: boolean;
  };
  diagnostics: string[];
}

export interface GdeltLoadSuccess {
  ok: true;
  snapshot: IntelligenceSnapshot;
  diagnostics: string[];
}

export type GdeltLoadResult = GdeltLoadSuccess | GdeltLoadFailure;
