import type {
  Article as SurfaceArticle,
  ClaimEvidence as SurfaceClaimEvidence,
  EventLocation as SurfaceEventLocation,
  PipelineHealth as SurfacePipelineHealth,
  PipelineRunInput,
  RegionalProminence as SurfaceRegionalProminence,
  StoryDetail,
} from "../../surface/src/contracts.js";
import type { ArticleClusterDraft } from "../clustering/engine.js";
import { eventRegionKey } from "../geolocation/geocoder.js";
import {
  mergeDuplicateGdeltClusters,
  validateIntelligenceSnapshot,
} from "../ingestion/gdelt-stream/snapshot.js";
import type { IntelligenceSnapshot } from "../ingestion/gdelt-stream/types.js";
import { computeRegionalProminence } from "../prominence/metrics.js";
import type { Article, Claim, ClusterMembership, EventLocation, StoryCluster } from "../schema/types.js";
import { stableId } from "../ingestion/sources.js";

export interface SeedArticle extends SurfaceArticle {
  ingestion_run_id: string;
  cluster_id: string;
  content_fingerprint: string;
  updated_at: string;
}

export interface SeedLocation extends SurfaceEventLocation {
  ingestion_run_id: string;
  cluster_id: string;
  updated_at: string;
}

export interface SeedLocationEvidence {
  location_evidence_id: string;
  ingestion_run_id: string;
  location_id: string;
  article_id: string;
  source_url: string;
  evidence_quote: string;
  evidence_start: number | null;
  evidence_end: number | null;
  evidence_method: "article_text" | "provider_event_geotag" | "manual_confirmed";
  updated_at: string;
}

export interface SeedClaim extends SurfaceClaimEvidence {
  ingestion_run_id: string;
  cluster_id: string;
  updated_at: string;
}

export interface SeedProminence extends SurfaceRegionalProminence {
  ingestion_run_id: string;
  cluster_id: string;
}

export interface SeedCluster {
  ingestion_run_id: string;
  story: StoryDetail;
  articles: SeedArticle[];
  locations: SeedLocation[];
  locationEvidence: SeedLocationEvidence[];
  claims: SeedClaim[];
  prominence: SeedProminence[];
  updated_at: string;
}

export interface D1SeedDataset {
  run: PipelineRunInput;
  health: SurfacePipelineHealth;
  clusters: SeedCluster[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accept either the successful loader envelope or the snapshot itself. */
export function snapshotFromDocument(document: unknown): IntelligenceSnapshot {
  const candidate = isRecord(document) && document.ok === true ? document.snapshot : document;
  if (
    !isRecord(candidate)
    || candidate.kind !== "atlas.intelligence_snapshot"
    || candidate.schemaVersion !== "1.0"
    || !Array.isArray(candidate.clusters)
  ) {
    throw new Error("Input is not a successful Atlas GDELT intelligence snapshot.");
  }
  const snapshot = candidate as unknown as IntelligenceSnapshot;
  const issues = validateIntelligenceSnapshot(snapshot);
  if (issues.length > 0) {
    throw new Error(
      `Snapshot failed validation: ${issues.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`,
    );
  }
  return snapshot;
}

function namespaced(runId: string, sourceId: string): string {
  return `${runId}:${sourceId}`;
}

function membershipMap(cluster: StoryCluster): Map<string, ClusterMembership> {
  return new Map(cluster.memberships.map((membership) => [membership.articleId, membership]));
}

function representativeSnippet(cluster: StoryCluster, articleId: string): string | null {
  for (const location of cluster.eventLocations) {
    const evidence = location.evidence.find((item) => item.articleId === articleId);
    if (evidence !== undefined) return evidence.quote;
  }
  for (const claim of cluster.claims) {
    const evidence = claim.evidence.find((item) => item.articleId === articleId);
    if (evidence !== undefined) return evidence.quote;
  }
  return null;
}

function contentFingerprint(article: Article): string {
  return stableId(
    "content",
    [article.canonicalUrl, article.title, article.publishedAt ?? "", article.publisher.domain].join("|"),
  );
}

function surfaceArticles(
  runId: string,
  clusterId: string,
  cluster: StoryCluster,
  generatedAt: string,
): SeedArticle[] {
  const memberships = membershipMap(cluster);
  return [...cluster.articles]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((article) => {
      const membership = memberships.get(article.id);
      if (membership === undefined) throw new Error(`Missing membership for article ${article.id}.`);
      if (article.publishedAt === undefined) {
        throw new Error(`GDELT article ${article.id} has no evidence-backed publication timestamp.`);
      }
      return {
        ingestion_run_id: runId,
        cluster_id: clusterId,
        article_id: namespaced(clusterId, article.id),
        canonical_url: article.canonicalUrl,
        source_url: article.url,
        title: article.title,
        publisher_name: article.publisher.name,
        publisher_domain: article.publisher.domain,
        publisher_origin_country: article.publisher.origin?.countryCode ?? article.publisher.origin?.countryName ?? null,
        audience_region_code: null,
        language: article.language ?? "und",
        published_at: article.publishedAt,
        retrieved_at: article.retrievedAt,
        evidence_snippet: representativeSnippet(cluster, article.id),
        membership_confidence: membership.confidence,
        membership_evidence: JSON.stringify(membership.evidence),
        content_fingerprint: contentFingerprint(article),
        updated_at: generatedAt,
      };
    });
}

function surfaceLocations(
  runId: string,
  clusterId: string,
  cluster: StoryCluster,
  generatedAt: string,
): { locations: SeedLocation[]; evidence: SeedLocationEvidence[] } {
  const articleIds = new Map(cluster.articles.map((article) => [article.id, namespaced(clusterId, article.id)]));
  const locations: SeedLocation[] = [];
  const evidenceRows: SeedLocationEvidence[] = [];
  for (const location of [...cluster.eventLocations].sort(
    (left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id),
  )) {
    const locationId = namespaced(runId, `${cluster.id}:${location.id}`);
    const evidence = [...location.evidence].sort((left, right) =>
      [left.articleId, left.url, left.quote].join("|").localeCompare([right.articleId, right.url, right.quote].join("|")),
    );
    const representative = evidence[0];
    locations.push({
      ingestion_run_id: runId,
      cluster_id: clusterId,
      location_id: locationId,
      location_type: "event",
      location_granularity: location.type,
      label: location.name,
      latitude: location.coordinates.latitude,
      longitude: location.coordinates.longitude,
      country_code: location.countryCode ?? null,
      region_code: eventRegionKey(location),
      confidence: location.confidence,
      evidence_article_id: representative === undefined ? null : (articleIds.get(representative.articleId) ?? null),
      evidence_quote: representative?.quote ?? null,
      evidence_start: representative?.start ?? null,
      evidence_end: representative?.end ?? null,
      evidence_count: evidence.length,
      updated_at: generatedAt,
    });
    for (const [index, item] of evidence.entries()) {
      const articleId = articleIds.get(item.articleId);
      if (articleId === undefined) throw new Error(`Location evidence references missing article ${item.articleId}.`);
      evidenceRows.push({
        location_evidence_id: namespaced(runId, `${cluster.id}:${location.id}:evidence:${index}`),
        ingestion_run_id: runId,
        location_id: locationId,
        article_id: articleId,
        source_url: item.url,
        evidence_quote: item.quote,
        evidence_start: item.start ?? null,
        evidence_end: item.end ?? null,
        evidence_method: item.method,
        updated_at: generatedAt,
      });
    }
  }
  return { locations, evidence: evidenceRows };
}

function stance(claim: Claim): SurfaceClaimEvidence["stance"] {
  if (claim.polarity === "asserts") return "supports";
  if (claim.polarity === "denies") return "disputes";
  return "unclear";
}

function surfaceClaims(
  runId: string,
  clusterId: string,
  cluster: StoryCluster,
  generatedAt: string,
): SeedClaim[] {
  const articleIds = new Map(cluster.articles.map((article) => [article.id, namespaced(clusterId, article.id)]));
  return cluster.claims
    .flatMap((claim) => claim.evidence.map((evidence) => ({ claim, evidence })))
    .sort((left, right) =>
      [left.claim.id, left.evidence.articleId, left.evidence.quote]
        .join("|")
        .localeCompare([right.claim.id, right.evidence.articleId, right.evidence.quote].join("|")),
    )
    .map(({ claim, evidence }, index) => {
      const articleId = articleIds.get(evidence.articleId);
      if (articleId === undefined) throw new Error(`Claim evidence references missing article ${evidence.articleId}.`);
      return {
        ingestion_run_id: runId,
        cluster_id: clusterId,
        claim_id: namespaced(clusterId, `${claim.id}:evidence:${index}`),
        normalized_claim: claim.text,
        stance: stance(claim),
        confidence: claim.confidence,
        evidence_article_id: articleId,
        evidence_quote: evidence.quote,
        updated_at: generatedAt,
      };
    });
}

function surfaceProminence(
  runId: string,
  clusterId: string,
  cluster: StoryCluster,
  generatedAt: string,
): SeedProminence[] {
  return [...cluster.prominence]
    .sort((left, right) => left.regionKey.localeCompare(right.regionKey))
    .map((entry) => ({
      ingestion_run_id: runId,
      cluster_id: clusterId,
      region_code: entry.regionKey,
      window_start: cluster.firstObservedAt,
      window_end: cluster.lastObservedAt,
      raw_article_count: entry.raw.articleCount,
      unique_publisher_count: entry.raw.outletCount,
      regional_source_volume: entry.normalized.denominators.regionalArticleMemberships,
      normalized_score: entry.normalized.score,
      formula_version: "atlas-regional-prominence-v1",
      computed_at: generatedAt,
    }));
}

function storyConfidence(cluster: StoryCluster): number {
  if (cluster.memberships.length === 0) return 0;
  return cluster.memberships.reduce((sum, membership) => sum + membership.confidence, 0) / cluster.memberships.length;
}

function recomputeMergedClusters(snapshot: IntelligenceSnapshot): StoryCluster[] {
  const merged = mergeDuplicateGdeltClusters(snapshot.clusters);
  const drafts: ArticleClusterDraft[] = merged.map((cluster) => ({
    id: cluster.id,
    canonicalTitle: cluster.canonicalTitle,
    articles: cluster.articles,
    memberships: cluster.memberships,
    eventLocations: cluster.eventLocations,
    firstObservedAt: cluster.firstObservedAt,
    lastObservedAt: cluster.lastObservedAt,
  }));
  const prominence = computeRegionalProminence(drafts);
  return merged.map((cluster) => ({ ...cluster, prominence: prominence.get(cluster.id) ?? [] }));
}

/** Pure, deterministic conversion from GDELT snapshot to Surface/D1 rows. */
export function convertSnapshotToD1(snapshot: IntelligenceSnapshot): D1SeedDataset {
  const issues = validateIntelligenceSnapshot(snapshot);
  if (issues.length > 0) throw new Error(`Refusing invalid snapshot with ${issues.length} validation issue(s).`);
  const runId = `gdelt:${snapshot.batchId}`;
  const clusters = recomputeMergedClusters(snapshot).map((cluster): SeedCluster => {
    const clusterId = namespaced(runId, cluster.id);
    const articles = surfaceArticles(runId, clusterId, cluster, snapshot.generatedAt);
    const convertedLocations = surfaceLocations(runId, clusterId, cluster, snapshot.generatedAt);
    const claims = surfaceClaims(runId, clusterId, cluster, snapshot.generatedAt);
    const prominence = surfaceProminence(runId, clusterId, cluster, snapshot.generatedAt);
    const primaryLocation = convertedLocations.locations[0] ?? null;
    const primaryProminence = prominence.find((entry) => entry.region_code === primaryLocation?.region_code)
      ?? prominence.sort((left, right) => right.normalized_score - left.normalized_score)[0];
    const story: StoryDetail = {
      cluster_id: clusterId,
      canonical_title: cluster.canonicalTitle,
      summary: null,
      primary_region_code: primaryLocation?.region_code ?? null,
      first_observed_at: cluster.firstObservedAt,
      last_observed_at: cluster.lastObservedAt,
      raw_article_count: articles.length,
      unique_publisher_count: new Set(articles.map((article) => article.publisher_domain)).size,
      normalized_prominence: primaryProminence?.normalized_score ?? 0,
      cluster_confidence: storyConfidence(cluster),
      membership_explanation: JSON.stringify(
        cluster.memberships.map((membership) => ({
          articleId: namespaced(clusterId, membership.articleId),
          confidence: membership.confidence,
          evidence: membership.evidence,
        })),
      ),
      primary_event_location: primaryLocation,
      articles: articles.map(({ ingestion_run_id: _run, cluster_id: _cluster, content_fingerprint: _fingerprint, updated_at: _updated, ...article }) => article),
      locations: convertedLocations.locations.map(({ ingestion_run_id: _run, cluster_id: _cluster, updated_at: _updated, ...location }) => location),
      claims: claims.map(({ ingestion_run_id: _run, cluster_id: _cluster, updated_at: _updated, ...claim }) => claim),
      regional_prominence: prominence.map(({ ingestion_run_id: _run, cluster_id: _cluster, ...entry }) => entry),
    };
    return {
      ingestion_run_id: runId,
      story,
      articles,
      locations: convertedLocations.locations,
      locationEvidence: convertedLocations.evidence,
      claims,
      prominence,
      updated_at: snapshot.generatedAt,
    };
  });

  const recordsSeen = Object.values(snapshot.statistics.rows).reduce(
    (sum, diagnostic) => sum + diagnostic.rowsSeen,
    0,
  );
  const recordsUpserted = clusters.reduce(
    (sum, cluster) =>
      sum
      + 1
      + cluster.articles.length
      + cluster.locations.length
      + cluster.locationEvidence.length
      + cluster.claims.length
      + cluster.prominence.length,
    0,
  );
  const runStatus = snapshot.health.status === "healthy" ? "succeeded" : "degraded";
  const fingerprint = `${snapshot.batchId}:${stableId(
    "snapshot",
    JSON.stringify({
      batchId: snapshot.batchId,
      files: snapshot.source.files.map((file) => ({ kind: file.kind, md5: file.md5 })).sort((a, b) => a.kind.localeCompare(b.kind)),
      clusterIds: clusters.map((cluster) => cluster.story.cluster_id),
    }),
  )}`;
  const run: PipelineRunInput = {
    run_id: runId,
    source: "gdelt",
    status: runStatus,
    input_fingerprint: fingerprint,
    started_at: snapshot.batchTimestamp,
    completed_at: snapshot.generatedAt,
    source_watermark_at: snapshot.batchTimestamp,
    records_seen: recordsSeen,
    records_upserted: recordsUpserted,
    error_kind: null,
    error_message: snapshot.health.warnings.length === 0 ? null : snapshot.health.warnings.join("; "),
    retryable: false,
    cotal_receipt: {
      agent: "atlas_data",
      task_id: "news.data.live-stream",
      commit: null,
      tests: ["snapshot contract validated", "D1 export invariants validated"],
      artifact_paths: ["artifacts/gdelt-latest.json"],
      evidence_urls: snapshot.source.files.map((file) => file.url),
      blockers: [],
      next: "apply the evidence-backed SQL only after the approved release gate",
    },
  };
  const latestStoryAt = clusters.map((cluster) => cluster.story.last_observed_at).sort().at(-1) ?? null;
  const health: SurfacePipelineHealth = {
    status: snapshot.health.status === "unavailable" ? "unavailable" : snapshot.health.status === "healthy" ? "ok" : "degraded",
    checked_at: snapshot.generatedAt,
    stale_after_seconds: 1800,
    latest_story_at: latestStoryAt,
    freshness_age_seconds: latestStoryAt === null
      ? null
      : Math.max(0, Math.floor((Date.parse(snapshot.generatedAt) - Date.parse(latestStoryAt)) / 1000)),
    latest_run: {
      run_id: run.run_id,
      source: run.source,
      status: run.status,
      started_at: run.started_at,
      completed_at: run.completed_at,
      source_watermark_at: run.source_watermark_at,
      records_seen: run.records_seen,
      records_upserted: run.records_upserted,
      error_kind: run.error_kind,
      error_message: run.error_message,
      retryable: run.retryable,
      cotal_receipt: run.cotal_receipt,
    },
    failures_24h: 0,
    cluster_count_24h: clusters.length,
    article_count_24h: clusters.reduce((sum, cluster) => sum + cluster.articles.length, 0),
    active_source_count: snapshot.health.successfulSourceCount,
    reasons: [...snapshot.health.warnings],
  };
  return { run, health, clusters };
}

function sqlValue(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot serialize a non-finite SQL number.");
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function insert(table: string, columns: string[], rows: Array<Array<string | number | null>>): string[] {
  return rows.map((row) => {
    if (row.length !== columns.length) throw new Error(`Column/value mismatch for ${table}.`);
    return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${row.map(sqlValue).join(", ")});`;
  });
}

/**
 * Render a byte-stable, SQL-escaped seed that replaces only this run id.
 * `wrangler d1 execute --file` supplies the atomic import transaction; the
 * file intentionally does not nest an explicit BEGIN/COMMIT around it.
 */
export function renderD1Seed(dataset: D1SeedDataset): string {
  const lines = [
    "-- Generated by Atlas from an evidence-backed GDELT snapshot.",
    `-- Run: ${dataset.run.run_id}`,
    "-- Execute as one atomic file with: wrangler d1 execute <database> --file <seed.sql>",
    "PRAGMA foreign_keys = ON;",
    `DELETE FROM story_location_evidence WHERE ingestion_run_id = ${sqlValue(dataset.run.run_id)};`,
    `DELETE FROM story_claims WHERE ingestion_run_id = ${sqlValue(dataset.run.run_id)};`,
    `DELETE FROM regional_prominence WHERE ingestion_run_id = ${sqlValue(dataset.run.run_id)};`,
    `DELETE FROM story_locations WHERE ingestion_run_id = ${sqlValue(dataset.run.run_id)};`,
    `DELETE FROM articles WHERE ingestion_run_id = ${sqlValue(dataset.run.run_id)};`,
    `DELETE FROM story_clusters WHERE ingestion_run_id = ${sqlValue(dataset.run.run_id)};`,
    `DELETE FROM pipeline_runs WHERE run_id = ${sqlValue(dataset.run.run_id)};`,
    ...insert(
      "pipeline_runs",
      [
        "run_id", "source", "status", "input_fingerprint", "started_at", "completed_at",
        "source_watermark_at", "records_seen", "records_upserted", "error_kind", "error_message",
        "retryable", "cotal_receipt_json", "updated_at",
      ],
      [[
        dataset.run.run_id,
        dataset.run.source,
        dataset.run.status,
        dataset.run.input_fingerprint,
        dataset.run.started_at,
        dataset.run.completed_at,
        dataset.run.source_watermark_at,
        dataset.run.records_seen,
        dataset.run.records_upserted,
        dataset.run.error_kind,
        dataset.run.error_message,
        dataset.run.retryable ? 1 : 0,
        dataset.run.cotal_receipt === null ? null : JSON.stringify(dataset.run.cotal_receipt),
        dataset.run.completed_at ?? dataset.run.started_at,
      ]],
    ),
  ];

  for (const cluster of [...dataset.clusters].sort((left, right) => left.story.cluster_id.localeCompare(right.story.cluster_id))) {
    const story = cluster.story;
    lines.push(...insert(
      "story_clusters",
      [
        "cluster_id", "ingestion_run_id", "canonical_title", "summary", "primary_region_code",
        "first_observed_at", "last_observed_at", "raw_article_count", "unique_publisher_count",
        "normalized_prominence", "cluster_confidence", "membership_explanation", "updated_at",
      ],
      [[
        story.cluster_id, cluster.ingestion_run_id, story.canonical_title, story.summary,
        story.primary_region_code, story.first_observed_at, story.last_observed_at,
        story.raw_article_count, story.unique_publisher_count, story.normalized_prominence,
        story.cluster_confidence, story.membership_explanation, cluster.updated_at,
      ]],
    ));
    lines.push(...insert(
      "articles",
      [
        "article_id", "ingestion_run_id", "cluster_id", "canonical_url", "source_url", "title",
        "publisher_name", "publisher_domain", "publisher_origin_country", "audience_region_code",
        "language", "published_at", "retrieved_at", "evidence_snippet", "membership_confidence",
        "membership_evidence", "content_fingerprint", "updated_at",
      ],
      cluster.articles.map((article) => [
        article.article_id, article.ingestion_run_id, article.cluster_id, article.canonical_url,
        article.source_url, article.title, article.publisher_name, article.publisher_domain,
        article.publisher_origin_country, article.audience_region_code, article.language,
        article.published_at, article.retrieved_at, article.evidence_snippet,
        article.membership_confidence, article.membership_evidence, article.content_fingerprint,
        article.updated_at,
      ]),
    ));
    lines.push(...insert(
      "story_locations",
      [
        "location_id", "ingestion_run_id", "cluster_id", "location_type", "location_granularity",
        "label", "latitude", "longitude", "country_code", "region_code", "confidence",
        "evidence_article_id", "evidence_quote", "evidence_start", "evidence_end", "updated_at",
      ],
      cluster.locations.map((location) => [
        location.location_id, location.ingestion_run_id, location.cluster_id, location.location_type,
        location.location_granularity, location.label, location.latitude, location.longitude,
        location.country_code, location.region_code, location.confidence,
        location.evidence_article_id, location.evidence_quote, location.evidence_start,
        location.evidence_end, location.updated_at,
      ]),
    ));
    lines.push(...insert(
      "story_location_evidence",
      [
        "location_evidence_id", "ingestion_run_id", "location_id", "article_id", "source_url",
        "evidence_quote", "evidence_start", "evidence_end", "evidence_method", "updated_at",
      ],
      cluster.locationEvidence.map((evidence) => [
        evidence.location_evidence_id, evidence.ingestion_run_id, evidence.location_id,
        evidence.article_id, evidence.source_url, evidence.evidence_quote, evidence.evidence_start,
        evidence.evidence_end, evidence.evidence_method, evidence.updated_at,
      ]),
    ));
    lines.push(...insert(
      "story_claims",
      [
        "claim_id", "ingestion_run_id", "cluster_id", "normalized_claim", "stance", "confidence",
        "evidence_article_id", "evidence_quote", "updated_at",
      ],
      cluster.claims.map((claim) => [
        claim.claim_id, claim.ingestion_run_id, claim.cluster_id, claim.normalized_claim,
        claim.stance, claim.confidence, claim.evidence_article_id, claim.evidence_quote,
        claim.updated_at,
      ]),
    ));
    lines.push(...insert(
      "regional_prominence",
      [
        "ingestion_run_id", "cluster_id", "region_code", "window_start", "window_end",
        "raw_article_count", "unique_publisher_count", "regional_source_volume",
        "normalized_score", "formula_version", "computed_at",
      ],
      cluster.prominence.map((entry) => [
        entry.ingestion_run_id, entry.cluster_id, entry.region_code, entry.window_start,
        entry.window_end, entry.raw_article_count, entry.unique_publisher_count,
        entry.regional_source_volume, entry.normalized_score, entry.formula_version,
        entry.computed_at,
      ]),
    ));
  }
  lines.push("");
  return lines.join("\n");
}
