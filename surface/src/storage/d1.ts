import type {
  Article,
  ClaimEvidence,
  EventLocation,
  PipelineHealth,
  PipelineRun,
  PipelineRunInput,
  RegionalProminence,
  SameStorySourceContext,
  StoryDetail,
  StoryQuery,
  StorySummary,
} from "../contracts";
import { HttpProblem } from "../http";
import { parseCotalReceipt } from "../provenance/cotal";
import type { TruthStore } from "../store";

interface ClusterRow {
  cluster_id: string;
  canonical_title: string;
  summary: string | null;
  primary_region_code: string | null;
  first_observed_at: string;
  last_observed_at: string;
  raw_article_count: number;
  unique_publisher_count: number;
  normalized_prominence: number;
  cluster_confidence: number;
  membership_explanation: string;
}

interface LocationRow {
  location_id: string;
  location_type: EventLocation["location_type"];
  location_granularity: EventLocation["location_granularity"];
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

interface ArticleRow extends Omit<Article, "same_story"> {
  publisher_origin_country: string | null;
  audience_region_code: string | null;
  same_story_json: string;
}
interface ClaimRow extends ClaimEvidence {}
interface ProminenceRow extends RegionalProminence {}

interface PipelineRow {
  run_id: string;
  source: string;
  status: PipelineRun["status"];
  started_at: string;
  completed_at: string | null;
  source_watermark_at: string | null;
  records_seen: number;
  records_upserted: number;
  error_kind: string | null;
  error_message: string | null;
  retryable: number;
  cotal_receipt_json: string | null;
}

interface HealthRow {
  latest_story_at: string | null;
  cluster_count_24h: number;
  article_count_24h: number;
  failures_24h: number;
  active_source_count: number;
}

const CLUSTER_COLUMNS = `
  cluster_id, canonical_title, summary, primary_region_code, first_observed_at,
  last_observed_at, raw_article_count, unique_publisher_count,
  normalized_prominence, cluster_confidence, membership_explanation`;

function mapLocation(row: LocationRow): EventLocation {
  return { ...row };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameStoryContext(value: string): SameStorySourceContext {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("D1 article same_story_json was not valid JSON");
  }
  if (!isRecord(parsed)) throw new Error("D1 article same_story_json was not an object");
  for (const field of ["publisherOrigin", "coverageMarkets", "audienceExposure", "framing", "tone"] as const) {
    const assessment = parsed[field];
    if (
      !isRecord(assessment)
      || (assessment.status !== "observed" && assessment.status !== "unknown")
      || !Array.isArray(assessment.evidence)
    ) {
      throw new Error(`D1 article same_story_json had an invalid ${field} assessment`);
    }
  }
  return parsed as unknown as SameStorySourceContext;
}

function mapArticle(row: ArticleRow): Article {
  const {
    publisher_origin_country: _legacyPublisherOrigin,
    audience_region_code: _legacyAudienceRegion,
    same_story_json,
    ...article
  } = row;
  return { ...article, same_story: sameStoryContext(same_story_json) };
}

function mapSummary(row: ClusterRow, location: LocationRow | null): StorySummary {
  return { ...row, primary_event_location: location === null ? null : mapLocation(location) };
}

function mapPipeline(row: PipelineRow | null): PipelineRun | null {
  if (row === null) return null;
  let cotalReceipt = null;
  if (row.cotal_receipt_json !== null) {
    try {
      cotalReceipt = parseCotalReceipt(JSON.parse(row.cotal_receipt_json));
    } catch {
      cotalReceipt = null;
    }
  }
  const { cotal_receipt_json: _storedReceipt, ...pipeline } = row;
  return { ...pipeline, retryable: row.retryable === 1, cotal_receipt: cotalReceipt };
}

export class D1TruthStore implements TruthStore {
  constructor(private readonly db: D1Database) {}

  async listStories(query: StoryQuery, _now: Date, _staleAfterSeconds: number): Promise<StorySummary[]> {
    const predicates: string[] = [];
    const bindings: unknown[] = [];
    if (query.region !== undefined) {
      predicates.push(`EXISTS (
        SELECT 1
        FROM story_locations AS region_location
        INNER JOIN story_location_evidence AS region_evidence
          ON region_evidence.location_id = region_location.location_id
        WHERE region_location.cluster_id = story_clusters.cluster_id
          AND region_location.location_type = 'event'
          AND region_location.region_code = ?
      )`);
      bindings.push(query.region);
    }
    if (query.since !== undefined) {
      predicates.push("last_observed_at >= ?");
      bindings.push(query.since);
    }
    if (query.until !== undefined) {
      predicates.push("first_observed_at <= ?");
      bindings.push(query.until);
    }

    const where = predicates.length === 0 ? "" : `WHERE ${predicates.join(" AND ")}`;
    const order = query.metric === "raw" ? "raw_article_count" : "normalized_prominence";
    const clusters = await this.db
      .prepare(`SELECT ${CLUSTER_COLUMNS} FROM story_clusters ${where} ORDER BY ${order} DESC, last_observed_at DESC LIMIT ?`)
      .bind(...bindings, query.limit)
      .all<ClusterRow>();

    if (clusters.results.length === 0) return [];
    const locations = await this.db
      .prepare(
        `SELECT location_id, cluster_id, location_type, location_granularity, label, latitude, longitude,
                country_code, region_code, confidence, evidence_article_id,
                evidence_quote, evidence_start, evidence_end,
                (SELECT COUNT(*) FROM story_location_evidence evidence
                  WHERE evidence.location_id = story_locations.location_id) AS evidence_count
         FROM story_locations
         WHERE location_type = 'event' AND cluster_id IN (${clusters.results.map(() => "?").join(",")})
         ORDER BY confidence DESC, evidence_count DESC, location_id ASC`,
      )
      .bind(...clusters.results.map((cluster) => cluster.cluster_id))
      .all<LocationRow & { cluster_id: string }>();

    const primaryLocations = new Map<string, LocationRow>();
    for (const location of locations.results) {
      if (!primaryLocations.has(location.cluster_id)) primaryLocations.set(location.cluster_id, location);
    }
    return clusters.results.map((cluster) => mapSummary(cluster, primaryLocations.get(cluster.cluster_id) ?? null));
  }

  async getStory(clusterId: string): Promise<StoryDetail | null> {
    const cluster = await this.db
      .prepare(`SELECT ${CLUSTER_COLUMNS} FROM story_clusters WHERE cluster_id = ?`)
      .bind(clusterId)
      .first<ClusterRow>();
    if (cluster === null) return null;

    const related = await this.db.batch([
      this.db.prepare(
        `SELECT article_id, canonical_url, source_url, title, publisher_name, publisher_domain,
                publisher_origin_country, audience_region_code, language, published_at, retrieved_at,
                evidence_snippet, membership_confidence, membership_evidence, same_story_json
         FROM articles WHERE cluster_id = ? ORDER BY published_at DESC`,
      ).bind(clusterId),
      this.db.prepare(
        `SELECT location_id, location_type, location_granularity, label, latitude, longitude, country_code, region_code,
                confidence, evidence_article_id, evidence_quote, evidence_start, evidence_end,
                (SELECT COUNT(*) FROM story_location_evidence evidence
                  WHERE evidence.location_id = story_locations.location_id) AS evidence_count
         FROM story_locations WHERE cluster_id = ? ORDER BY location_type, confidence DESC`,
      ).bind(clusterId),
      this.db.prepare(
        `SELECT claim_id, normalized_claim, stance, confidence, evidence_article_id, evidence_quote
         FROM story_claims WHERE cluster_id = ? ORDER BY confidence DESC`,
      ).bind(clusterId),
      this.db.prepare(
        `SELECT region_code, window_start, window_end, raw_article_count, unique_publisher_count,
                regional_source_volume, regional_outlet_count, normalized_score, article_share,
                outlet_share, source_normalized_share, basis, formula_version, computed_at
         FROM regional_prominence WHERE cluster_id = ? ORDER BY normalized_score DESC`,
      ).bind(clusterId),
    ]);

    const articleResult = related[0];
    const locationResult = related[1];
    const claimResult = related[2];
    const prominenceResult = related[3];
    if (
      articleResult === undefined
      || locationResult === undefined
      || claimResult === undefined
      || prominenceResult === undefined
    ) {
      throw new Error("D1 returned an incomplete story-detail batch");
    }

    const articles = (articleResult.results ?? []) as unknown as ArticleRow[];
    const locations = (locationResult.results ?? []) as unknown as LocationRow[];
    const claims = (claimResult.results ?? []) as unknown as ClaimRow[];
    const regionalProminence = (prominenceResult.results ?? []) as unknown as ProminenceRow[];
    const primary = locations.find((location) => location.location_type === "event") ?? null;

    return {
      ...mapSummary(cluster, primary),
      articles: articles.map(mapArticle),
      locations: locations.map(mapLocation),
      claims,
      regional_prominence: regionalProminence,
    };
  }

  async getHealth(now: Date, staleAfterSeconds: number): Promise<PipelineHealth> {
    const since = new Date(now.getTime() - 86_400_000).toISOString();
    const healthResults = await this.db.batch([
      this.db.prepare(
        `SELECT
           (SELECT MAX(last_observed_at) FROM story_clusters) AS latest_story_at,
           (SELECT COUNT(*) FROM story_clusters WHERE last_observed_at >= ?) AS cluster_count_24h,
           (SELECT COUNT(*) FROM articles WHERE published_at >= ?) AS article_count_24h,
           (SELECT COUNT(*) FROM pipeline_runs WHERE status = 'failed' AND started_at >= ?) AS failures_24h,
           (SELECT COUNT(DISTINCT source) FROM pipeline_runs
              WHERE status IN ('succeeded', 'degraded') AND started_at >= ?) AS active_source_count`,
      ).bind(since, since, since, since),
      this.db.prepare(
        `SELECT run_id, source, status, started_at, completed_at, source_watermark_at,
                records_seen, records_upserted, error_kind, error_message, retryable, cotal_receipt_json
         FROM pipeline_runs ORDER BY started_at DESC LIMIT 1`,
      ),
    ]);

    const aggregateResult = healthResults[0];
    const latestRunResult = healthResults[1];
    if (aggregateResult === undefined || latestRunResult === undefined) {
      throw new Error("D1 returned an incomplete health batch");
    }

    const aggregate = ((aggregateResult.results ?? [])[0] ?? {
      latest_story_at: null,
      cluster_count_24h: 0,
      article_count_24h: 0,
      failures_24h: 0,
      active_source_count: 0,
    }) as unknown as HealthRow;
    const latestRun = (((latestRunResult.results ?? [])[0] ?? null) as unknown as PipelineRow | null);
    const ageSeconds = aggregate.latest_story_at === null
      ? null
      : Math.max(0, Math.floor((now.getTime() - new Date(aggregate.latest_story_at).getTime()) / 1000));
    const reasons: string[] = [];
    if (aggregate.latest_story_at === null) reasons.push("no_story_watermark");
    if (ageSeconds !== null && ageSeconds > staleAfterSeconds) reasons.push("story_watermark_stale");
    if (latestRun?.status === "failed") reasons.push("latest_pipeline_run_failed");
    if (latestRun?.status === "degraded") reasons.push("latest_pipeline_run_degraded");
    const status = aggregate.latest_story_at === null
      ? "unavailable"
      : reasons.length === 0
        ? "ok"
        : "degraded";

    return {
      status,
      checked_at: now.toISOString(),
      stale_after_seconds: staleAfterSeconds,
      latest_story_at: aggregate.latest_story_at,
      freshness_age_seconds: ageSeconds,
      latest_run: mapPipeline(latestRun),
      failures_24h: Number(aggregate.failures_24h),
      cluster_count_24h: Number(aggregate.cluster_count_24h),
      article_count_24h: Number(aggregate.article_count_24h),
      active_source_count: Number(aggregate.active_source_count),
      reasons,
    };
  }

  async upsertPipelineRun(
    run: PipelineRunInput,
    now: Date,
  ): Promise<"inserted" | "updated" | "replayed"> {
    const existing = await this.db
      .prepare("SELECT input_fingerprint, status FROM pipeline_runs WHERE run_id = ?")
      .bind(run.run_id)
      .first<{ input_fingerprint: string; status: PipelineRun["status"] }>();

    if (existing !== null && existing.input_fingerprint !== run.input_fingerprint) {
      throw new HttpProblem(409, "conflict", "run_id was already used for different input");
    }
    if (existing?.status === run.status) return "replayed";

    await this.db.prepare(
      `INSERT INTO pipeline_runs (
         run_id, source, status, input_fingerprint, started_at, completed_at,
         source_watermark_at, records_seen, records_upserted, error_kind,
         error_message, retryable, cotal_receipt_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET
         status = excluded.status,
         completed_at = excluded.completed_at,
         source_watermark_at = excluded.source_watermark_at,
         records_seen = excluded.records_seen,
         records_upserted = excluded.records_upserted,
         error_kind = excluded.error_kind,
         error_message = excluded.error_message,
         retryable = excluded.retryable,
         cotal_receipt_json = excluded.cotal_receipt_json,
         updated_at = excluded.updated_at
       WHERE pipeline_runs.input_fingerprint = excluded.input_fingerprint`,
    ).bind(
      run.run_id,
      run.source,
      run.status,
      run.input_fingerprint,
      run.started_at,
      run.completed_at,
      run.source_watermark_at,
      run.records_seen,
      run.records_upserted,
      run.error_kind,
      run.error_message,
      run.retryable ? 1 : 0,
      run.cotal_receipt === null ? null : JSON.stringify(run.cotal_receipt),
      now.toISOString(),
    ).run();
    return existing === null ? "inserted" : "updated";
  }
}
