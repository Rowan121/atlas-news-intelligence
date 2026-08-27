export type IsoDateTime = string;
export type ArticleId = string;
export type ClusterId = string;

export type SourceProvider = "gdelt" | "tavily";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PublisherOrigin {
  countryName?: string;
  countryCode?: string;
  coordinates?: Coordinates;
  confidence: number;
  evidenceSource: "provider_metadata" | "publisher_registry";
}

export interface Publisher {
  id: string;
  name: string;
  domain: string;
  origin?: PublisherOrigin;
}

export interface ArticleSource {
  provider: SourceProvider;
  providerRecordId?: string;
  providerScore?: number;
}

export interface Article {
  id: ArticleId;
  url: string;
  canonicalUrl: string;
  title: string;
  summary?: string;
  publisher: Publisher;
  language?: string;
  publishedAt?: IsoDateTime;
  retrievedAt: IsoDateTime;
  source: ArticleSource;
}

export interface EvidenceSpan {
  articleId: ArticleId;
  url: string;
  quote: string;
  start?: number;
  end?: number;
}

export type EventLocationEvidenceMethod =
  | "article_text"
  | "provider_event_geotag"
  | "manual_confirmed";

export interface EventLocationEvidence extends EvidenceSpan {
  method: EventLocationEvidenceMethod;
}

export type LocationType = "city" | "admin1" | "country" | "region" | "point";

export interface EventLocation {
  id: string;
  name: string;
  countryCode?: string;
  admin1?: string;
  type: LocationType;
  coordinates: Coordinates;
  confidence: number;
  evidence: EventLocationEvidence[];
}

export interface Claim {
  id: string;
  text: string;
  polarity: "asserts" | "denies" | "uncertain";
  confidence: number;
  evidence: EvidenceSpan[];
}

export interface SimilarityComponent {
  score: number;
  weight: number;
  available: boolean;
}

export interface ClusterMembershipEvidence {
  matchedArticleId?: ArticleId;
  threshold: number;
  components: {
    title: SimilarityComponent;
    entities: SimilarityComponent;
    time: SimilarityComponent;
    location: SimilarityComponent;
    semantic: SimilarityComponent;
  };
  reasons: string[];
}

export interface ClusterMembership {
  articleId: ArticleId;
  confidence: number;
  evidence: ClusterMembershipEvidence;
}

export interface RawProminence {
  articleCount: number;
  outletCount: number;
}

export interface NormalizedProminence {
  score: number;
  articleShare: number;
  outletShare: number;
  sourceNormalizedShare: number;
  denominators: {
    regionalArticleMemberships: number;
    regionalOutlets: number;
  };
}

export interface RegionalProminence {
  regionKey: string;
  regionName: string;
  raw: RawProminence;
  normalized: NormalizedProminence;
}

export interface PipelineHealth {
  status: "healthy" | "degraded" | "unavailable";
  fetchedAt: IsoDateTime;
  sourceCount: number;
  successfulSourceCount: number;
  warnings: string[];
}

export interface StoryCluster {
  id: ClusterId;
  canonicalTitle: string;
  firstObservedAt: IsoDateTime;
  lastObservedAt: IsoDateTime;
  articles: Article[];
  memberships: ClusterMembership[];
  eventLocations: EventLocation[];
  claims: Claim[];
  prominence: RegionalProminence[];
  health: PipelineHealth;
}

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function isIsoDateTime(value: string): boolean {
  return ISO_DATE_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateConfidence(
  value: number,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    issues.push({ code: "invalid_confidence", path, message: "Must be between 0 and 1." });
  }
}

function validateEvidence(
  evidence: EvidenceSpan,
  path: string,
  articleIds: Set<string>,
  issues: ValidationIssue[],
): void {
  if (!articleIds.has(evidence.articleId)) {
    issues.push({
      code: "unknown_evidence_article",
      path: `${path}.articleId`,
      message: "Evidence must reference an article in the cluster.",
    });
  }
  if (!isHttpUrl(evidence.url)) {
    issues.push({ code: "invalid_url", path: `${path}.url`, message: "Must be HTTP(S)." });
  }
  if (evidence.quote.trim().length === 0) {
    issues.push({ code: "empty_quote", path: `${path}.quote`, message: "Evidence quote is required." });
  }
}

export function validateStoryCluster(cluster: StoryCluster): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (cluster.id.trim().length === 0) {
    issues.push({ code: "missing_id", path: "id", message: "Cluster id is required." });
  }
  if (cluster.canonicalTitle.trim().length === 0) {
    issues.push({ code: "missing_title", path: "canonicalTitle", message: "Title is required." });
  }
  if (!isIsoDateTime(cluster.firstObservedAt)) {
    issues.push({ code: "invalid_timestamp", path: "firstObservedAt", message: "Must be ISO UTC." });
  }
  if (!isIsoDateTime(cluster.lastObservedAt)) {
    issues.push({ code: "invalid_timestamp", path: "lastObservedAt", message: "Must be ISO UTC." });
  }
  if (
    Number.isFinite(Date.parse(cluster.firstObservedAt)) &&
    Number.isFinite(Date.parse(cluster.lastObservedAt)) &&
    Date.parse(cluster.firstObservedAt) > Date.parse(cluster.lastObservedAt)
  ) {
    issues.push({
      code: "inverted_observation_window",
      path: "firstObservedAt",
      message: "First observation cannot follow last observation.",
    });
  }
  if (cluster.articles.length === 0) {
    issues.push({ code: "empty_cluster", path: "articles", message: "At least one article is required." });
  }

  const articleIds = new Set<string>();
  const canonicalUrls = new Set<string>();
  cluster.articles.forEach((article, index) => {
    const path = `articles[${index}]`;
    if (articleIds.has(article.id)) {
      issues.push({ code: "duplicate_article_id", path: `${path}.id`, message: "Article id must be unique." });
    }
    articleIds.add(article.id);
    if (canonicalUrls.has(article.canonicalUrl)) {
      issues.push({
        code: "duplicate_canonical_url",
        path: `${path}.canonicalUrl`,
        message: "Canonical URL must be unique within a cluster.",
      });
    }
    canonicalUrls.add(article.canonicalUrl);
    if (!isHttpUrl(article.url) || !isHttpUrl(article.canonicalUrl)) {
      issues.push({ code: "invalid_url", path: `${path}.url`, message: "Article URLs must be HTTP(S)." });
    }
    if (!isIsoDateTime(article.retrievedAt)) {
      issues.push({ code: "invalid_timestamp", path: `${path}.retrievedAt`, message: "Must be ISO UTC." });
    }
    if (article.publishedAt !== undefined && !isIsoDateTime(article.publishedAt)) {
      issues.push({ code: "invalid_timestamp", path: `${path}.publishedAt`, message: "Must be ISO UTC." });
    }
    if (article.publisher.origin !== undefined) {
      validateConfidence(article.publisher.origin.confidence, `${path}.publisher.origin.confidence`, issues);
    }
  });

  const membershipIds = new Set(cluster.memberships.map((membership) => membership.articleId));
  for (const articleId of articleIds) {
    if (!membershipIds.has(articleId)) {
      issues.push({
        code: "missing_membership",
        path: "memberships",
        message: `Missing membership for article ${articleId}.`,
      });
    }
  }
  cluster.memberships.forEach((membership, index) => {
    validateConfidence(membership.confidence, `memberships[${index}].confidence`, issues);
    if (!articleIds.has(membership.articleId)) {
      issues.push({
        code: "unknown_membership_article",
        path: `memberships[${index}].articleId`,
        message: "Membership references an article outside this cluster.",
      });
    }
  });

  cluster.eventLocations.forEach((location, locationIndex) => {
    const path = `eventLocations[${locationIndex}]`;
    validateConfidence(location.confidence, `${path}.confidence`, issues);
    if (
      !Number.isFinite(location.coordinates.latitude) ||
      location.coordinates.latitude < -90 ||
      location.coordinates.latitude > 90
    ) {
      issues.push({ code: "invalid_latitude", path: `${path}.coordinates.latitude`, message: "Out of range." });
    }
    if (
      !Number.isFinite(location.coordinates.longitude) ||
      location.coordinates.longitude < -180 ||
      location.coordinates.longitude > 180
    ) {
      issues.push({ code: "invalid_longitude", path: `${path}.coordinates.longitude`, message: "Out of range." });
    }
    if (location.evidence.length === 0) {
      issues.push({ code: "missing_location_evidence", path: `${path}.evidence`, message: "Evidence is required." });
    }
    location.evidence.forEach((evidence, evidenceIndex) => {
      validateEvidence(evidence, `${path}.evidence[${evidenceIndex}]`, articleIds, issues);
      if (!["article_text", "provider_event_geotag", "manual_confirmed"].includes(evidence.method)) {
        issues.push({
          code: "invalid_event_location_evidence_method",
          path: `${path}.evidence[${evidenceIndex}].method`,
          message: "Publisher metadata cannot be used as event-location evidence.",
        });
      }
    });
  });

  cluster.claims.forEach((claim, claimIndex) => {
    validateConfidence(claim.confidence, `claims[${claimIndex}].confidence`, issues);
    if (claim.evidence.length === 0) {
      issues.push({
        code: "missing_claim_evidence",
        path: `claims[${claimIndex}].evidence`,
        message: "Claims require evidence.",
      });
    }
    claim.evidence.forEach((evidence, evidenceIndex) => {
      validateEvidence(evidence, `claims[${claimIndex}].evidence[${evidenceIndex}]`, articleIds, issues);
    });
  });

  cluster.prominence.forEach((entry, index) => {
    if (entry.raw.articleCount < 0 || entry.raw.outletCount < 0) {
      issues.push({ code: "invalid_raw_prominence", path: `prominence[${index}].raw`, message: "Counts cannot be negative." });
    }
    validateConfidence(entry.normalized.score, `prominence[${index}].normalized.score`, issues);
    validateConfidence(entry.normalized.articleShare, `prominence[${index}].normalized.articleShare`, issues);
    validateConfidence(entry.normalized.outletShare, `prominence[${index}].normalized.outletShare`, issues);
    validateConfidence(
      entry.normalized.sourceNormalizedShare,
      `prominence[${index}].normalized.sourceNormalizedShare`,
      issues,
    );
  });

  if (cluster.health.successfulSourceCount > cluster.health.sourceCount) {
    issues.push({
      code: "invalid_health_counts",
      path: "health.successfulSourceCount",
      message: "Successful source count cannot exceed total source count.",
    });
  }
  return issues;
}

export function assertStoryCluster(cluster: StoryCluster): void {
  const issues = validateStoryCluster(cluster);
  if (issues.length > 0) {
    throw new Error(`Invalid story cluster: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }
}
