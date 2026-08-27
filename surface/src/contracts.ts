export type IsoTimestamp = string;
export type LocationType = "event" | "mentioned" | "publisher_origin" | "audience_region";
export type LocationGranularity = "city" | "admin1" | "country" | "region" | "point" | "unknown";
export type PipelineState = "ok" | "degraded" | "unavailable";
export type ProminenceMetric = "raw" | "normalized";

export interface EventLocation {
  location_id: string;
  location_type: LocationType;
  location_granularity: LocationGranularity;
  label: string;
  latitude: number;
  longitude: number;
  country_code: string | null;
  region_code: string | null;
  confidence: number;
  evidence_article_id: string | null;
  evidence_quote: string | null;
  evidence_start: number | null;
  evidence_end: number | null;
  evidence_count: number;
}

export interface Article {
  article_id: string;
  canonical_url: string;
  source_url: string;
  title: string;
  publisher_name: string;
  publisher_domain: string;
  publisher_origin_country: string | null;
  audience_region_code: string | null;
  language: string;
  published_at: IsoTimestamp;
  retrieved_at: IsoTimestamp;
  evidence_snippet: string | null;
  membership_confidence: number;
  membership_evidence: string;
}

export interface ClaimEvidence {
  claim_id: string;
  normalized_claim: string;
  stance: "supports" | "disputes" | "unclear";
  confidence: number;
  evidence_article_id: string;
  evidence_quote: string;
}

export interface RegionalProminence {
  region_code: string;
  window_start: IsoTimestamp;
  window_end: IsoTimestamp;
  raw_article_count: number;
  unique_publisher_count: number;
  regional_source_volume: number;
  normalized_score: number;
  formula_version: string;
  computed_at: IsoTimestamp;
}

export interface StorySummary {
  cluster_id: string;
  canonical_title: string;
  summary: string | null;
  primary_region_code: string | null;
  first_observed_at: IsoTimestamp;
  last_observed_at: IsoTimestamp;
  raw_article_count: number;
  unique_publisher_count: number;
  normalized_prominence: number;
  cluster_confidence: number;
  membership_explanation: string;
  primary_event_location: EventLocation | null;
}

export interface StoryDetail extends StorySummary {
  articles: Article[];
  locations: EventLocation[];
  claims: ClaimEvidence[];
  regional_prominence: RegionalProminence[];
}

export interface StoryQuery {
  region?: string;
  since?: IsoTimestamp;
  until?: IsoTimestamp;
  metric: ProminenceMetric;
  limit: number;
}

export interface PipelineRun {
  run_id: string;
  source: string;
  status: "running" | "succeeded" | "degraded" | "failed";
  started_at: IsoTimestamp;
  completed_at: IsoTimestamp | null;
  source_watermark_at: IsoTimestamp | null;
  records_seen: number;
  records_upserted: number;
  error_kind: string | null;
  error_message: string | null;
  retryable: boolean;
  cotal_receipt: CotalReceipt | null;
}

export interface PipelineHealth {
  status: PipelineState;
  checked_at: IsoTimestamp;
  stale_after_seconds: number;
  latest_story_at: IsoTimestamp | null;
  freshness_age_seconds: number | null;
  latest_run: PipelineRun | null;
  failures_24h: number;
  cluster_count_24h: number;
  article_count_24h: number;
  active_source_count: number;
  reasons: string[];
}

export interface CotalReceipt {
  agent: string;
  task_id: string;
  commit: string | null;
  tests: string[];
  artifact_paths: string[];
  evidence_urls: string[];
  blockers: string[];
  next: string | null;
  integrations?: IntegrationReceipt[];
}

export interface IntegrationReceipt {
  provider: string;
  capability: string;
  status: "succeeded" | "degraded" | "failed";
  observed_at: IsoTimestamp;
  external_request_id: string | null;
  usage: {
    unit: string;
    before: number;
    after: number;
    delta: number;
  } | null;
  evidence_urls: string[];
}

export interface PipelineRunInput {
  run_id: string;
  source: string;
  status: PipelineRun["status"];
  input_fingerprint: string;
  started_at: IsoTimestamp;
  completed_at: IsoTimestamp | null;
  source_watermark_at: IsoTimestamp | null;
  records_seen: number;
  records_upserted: number;
  error_kind: string | null;
  error_message: string | null;
  retryable: boolean;
  cotal_receipt: CotalReceipt | null;
}

export interface ApiMeta {
  request_id: string;
  generated_at: IsoTimestamp;
}

export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
  meta: ApiMeta;
}

export type ErrorKind =
  | "bad_request"
  | "not_found"
  | "method_not_allowed"
  | "conflict"
  | "database_unavailable"
  | "internal_error";

export interface FailureEnvelope {
  ok: false;
  error: {
    kind: ErrorKind;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  meta: ApiMeta;
}
