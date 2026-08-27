import type {
  Article,
  ClaimEvidence,
  EventLocation,
  PipelineHealth,
  ProminenceMetric,
  StoryDetail,
} from "./contracts";
import type { TruthStore } from "./store";

export type IntelligenceWindow = "6h" | "24h" | "7d";

interface UiLocation {
  id: string;
  label: string;
  countryCode: string | null;
  regionId: string;
  locationType: "city" | "admin1" | "country" | "multi-region" | "unknown";
  latitude: number;
  longitude: number;
  confidence: number;
  evidenceCount: number;
}

interface UiSource {
  id: string;
  publisher: string;
  publisherOrigin: {
    label: string;
    countryCode: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  articleTitle: string;
  url: string;
  language: string;
  publishedAt: string;
  retrievedAt: string;
  excerpt: string | null;
  claimPosition: "supports" | "disputes" | "reports" | "unclear";
}

interface UiCluster {
  id: string;
  canonicalTitle: string;
  summary: string;
  eventLocations: UiLocation[];
  primaryRegionId: string;
  rawProminence: number;
  normalizedProminence: number;
  articleCount: number;
  publisherCount: number;
  languageCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  membershipConfidence: number;
  signals: {
    conflict: boolean;
    underreported: boolean;
    conflictSummary: string | null;
    undercoverageSummary: string | null;
  };
  sources: UiSource[];
}

interface RegionAccumulator {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  locationConfidence: number;
  rawProminence: number;
  normalizedProminence: number;
  clusterScores: Array<{ id: string; raw: number; normalized: number }>;
  publisherIds: Set<string>;
}

export interface IntelligenceSnapshot {
  generatedAt: string;
  window: IntelligenceWindow;
  health: {
    status: "healthy" | "degraded" | "stale" | "connecting";
    lastSuccessfulIngestionAt: string | null;
    ingestionLagSeconds: number | null;
    activeSourceCount: number;
    regionCount: number;
    message: string | null;
  };
  regions: Array<{
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    rawProminence: number;
    normalizedProminence: number;
    storyCount: number;
    sourceCount: number;
    topClusterIds: string[];
  }>;
  clusters: UiCluster[];
}

const windowHours: Record<IntelligenceWindow, number> = { "6h": 6, "24h": 24, "7d": 168 };

function uiLocation(location: EventLocation): UiLocation {
  const locationType = location.location_granularity === "region"
    ? "multi-region"
    : location.location_granularity === "point"
      ? "unknown"
      : location.location_granularity;
  return {
    id: location.location_id,
    label: location.label,
    countryCode: location.country_code,
    regionId: location.region_code ?? location.country_code ?? location.location_id,
    locationType,
    latitude: location.latitude,
    longitude: location.longitude,
    confidence: location.confidence,
    evidenceCount: location.evidence_count,
  };
}

function claimPosition(article: Article, claims: ClaimEvidence[]): UiSource["claimPosition"] {
  const stances = new Set(
    claims
      .filter((claim) => claim.evidence_article_id === article.article_id)
      .map((claim) => claim.stance),
  );
  if (stances.has("disputes")) return "disputes";
  if (stances.has("supports")) return "supports";
  if (stances.has("unclear")) return "unclear";
  return "reports";
}

function uiSource(article: Article, claims: ClaimEvidence[]): UiSource {
  return {
    id: article.article_id,
    publisher: article.publisher_name,
    publisherOrigin: article.publisher_origin_country === null
      ? null
      : {
          label: article.publisher_origin_country,
          countryCode: article.publisher_origin_country,
          latitude: null,
          longitude: null,
        },
    articleTitle: article.title,
    url: article.canonical_url,
    language: article.language,
    publishedAt: article.published_at,
    retrievedAt: article.retrieved_at,
    excerpt: article.evidence_snippet,
    claimPosition: claimPosition(article, claims),
  };
}

function conflictSignal(claims: ClaimEvidence[]): { conflict: boolean; summary: string | null } {
  const byClaim = new Map<string, Set<ClaimEvidence["stance"]>>();
  for (const claim of claims) {
    const stances = byClaim.get(claim.normalized_claim) ?? new Set<ClaimEvidence["stance"]>();
    stances.add(claim.stance);
    byClaim.set(claim.normalized_claim, stances);
  }
  const conflict = [...byClaim.entries()].find(([, stances]) => stances.has("supports") && stances.has("disputes"));
  if (conflict === undefined) return { conflict: false, summary: null };
  return { conflict: true, summary: `Sources disagree on: ${conflict[0]}` };
}

function meanConfidence(story: StoryDetail): number {
  if (story.articles.length === 0) return story.cluster_confidence;
  return story.articles.reduce((sum, article) => sum + article.membership_confidence, 0) / story.articles.length;
}

function mapCluster(story: StoryDetail): UiCluster | null {
  const eventLocations = story.locations
    .filter((location) => location.location_type === "event" && location.evidence_article_id !== null)
    .sort((left, right) => right.confidence - left.confidence)
    .map(uiLocation);
  const primary = eventLocations[0];
  if (primary === undefined) return null;

  const conflict = conflictSignal(story.claims);
  return {
    id: story.cluster_id,
    canonicalTitle: story.canonical_title,
    summary: story.summary ?? "",
    eventLocations,
    primaryRegionId: primary.regionId,
    rawProminence: story.raw_article_count,
    normalizedProminence: Math.max(0, Math.min(1, story.normalized_prominence)),
    articleCount: story.articles.length,
    publisherCount: new Set(story.articles.map((article) => article.publisher_domain)).size,
    languageCount: new Set(story.articles.map((article) => article.language)).size,
    firstObservedAt: story.first_observed_at,
    lastObservedAt: story.last_observed_at,
    membershipConfidence: Math.max(0, Math.min(1, meanConfidence(story))),
    signals: {
      conflict: conflict.conflict,
      underreported: false,
      conflictSummary: conflict.summary,
      undercoverageSummary: null,
    },
    sources: story.articles.map((article) => uiSource(article, story.claims)),
  };
}

function mapHealth(
  health: PipelineHealth,
  regionCount: number,
  omittedUnlocated: number,
): IntelligenceSnapshot["health"] {
  const reasons = [...health.reasons];
  if (omittedUnlocated > 0) reasons.push(`${omittedUnlocated} cluster(s) omitted without cited event locations`);
  return {
    status: health.status === "ok" ? "healthy" : health.status === "unavailable" ? "stale" : "degraded",
    lastSuccessfulIngestionAt: health.latest_story_at,
    ingestionLagSeconds: health.freshness_age_seconds,
    activeSourceCount: health.active_source_count,
    regionCount,
    message: reasons.length === 0 ? null : reasons.join("; "),
  };
}

export async function buildIntelligenceSnapshot(
  store: TruthStore,
  window: IntelligenceWindow,
  metric: ProminenceMetric,
  now: Date,
  staleAfterSeconds: number,
): Promise<IntelligenceSnapshot> {
  const since = new Date(now.getTime() - windowHours[window] * 3_600_000).toISOString();
  const summaries = await store.listStories(
    { since, until: now.toISOString(), metric, limit: 100 },
    now,
    staleAfterSeconds,
  );
  const details = await Promise.all(summaries.map((summary) => store.getStory(summary.cluster_id)));
  const mapped = details.flatMap((detail) => {
    if (detail === null) return [];
    const cluster = mapCluster(detail);
    return cluster === null ? [] : [cluster];
  });

  const regions = new Map<string, RegionAccumulator>();
  for (const cluster of mapped) {
    const story = details.find((detail) => detail?.cluster_id === cluster.id);
    if (story === null || story === undefined) continue;
    for (const location of cluster.eventLocations) {
      const existing = regions.get(location.regionId) ?? {
        id: location.regionId,
        label: location.label,
        latitude: location.latitude,
        longitude: location.longitude,
        locationConfidence: location.confidence,
        rawProminence: 0,
        normalizedProminence: 0,
        clusterScores: [],
        publisherIds: new Set<string>(),
      };
      if (location.confidence > existing.locationConfidence) {
        existing.label = location.label;
        existing.latitude = location.latitude;
        existing.longitude = location.longitude;
        existing.locationConfidence = location.confidence;
      }
      existing.rawProminence += cluster.rawProminence;
      existing.normalizedProminence = Math.max(existing.normalizedProminence, cluster.normalizedProminence);
      existing.clusterScores.push({ id: cluster.id, raw: cluster.rawProminence, normalized: cluster.normalizedProminence });
      for (const article of story.articles) existing.publisherIds.add(article.publisher_domain);
      regions.set(location.regionId, existing);
    }
  }

  const regionList = [...regions.values()].map((region) => ({
    id: region.id,
    label: region.label,
    latitude: region.latitude,
    longitude: region.longitude,
    rawProminence: region.rawProminence,
    normalizedProminence: region.normalizedProminence,
    storyCount: new Set(region.clusterScores.map((entry) => entry.id)).size,
    sourceCount: region.publisherIds.size,
    topClusterIds: [...region.clusterScores]
      .sort((left, right) => metric === "raw" ? right.raw - left.raw : right.normalized - left.normalized)
      .map((entry) => entry.id),
  }));
  regionList.sort((left, right) => metric === "raw"
    ? right.rawProminence - left.rawProminence
    : right.normalizedProminence - left.normalizedProminence);

  const health = await store.getHealth(now, staleAfterSeconds);
  return {
    generatedAt: now.toISOString(),
    window,
    health: mapHealth(health, regionList.length, details.length - mapped.length),
    regions: regionList,
    clusters: mapped,
  };
}
