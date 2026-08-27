import type {
  Article,
  ClusterMembership,
  EventLocation,
  LocationType,
  PipelineHealth,
  StoryCluster,
  ValidationIssue,
} from "../../schema/types.js";
import { validateStoryCluster } from "../../schema/types.js";
import type { ArticleClusterDraft } from "../../clustering/engine.js";
import { canonicalizeUrl, domainFromUrl, stableId } from "../sources.js";
import { computeRegionalProminence } from "../../prominence/metrics.js";
import type {
  GdeltEventRecord,
  GdeltGkgRecord,
  GdeltJoinGates,
  GdeltManifest,
  GdeltMentionRecord,
  GdeltSnapshotStatistics,
  GdeltStreamLimits,
  IntelligenceSnapshot,
  ParsedTable,
} from "./types.js";

export interface BuildSnapshotInput {
  manifest: GdeltManifest;
  events: ParsedTable<GdeltEventRecord>;
  mentions: ParsedTable<GdeltMentionRecord>;
  gkg: ParsedTable<GdeltGkgRecord>;
  generatedAt: string;
  limits: GdeltStreamLimits;
  gates: GdeltJoinGates;
}

interface JoinedDocument {
  event: GdeltEventRecord & { actionGeo: NonNullable<GdeltEventRecord["actionGeo"]> };
  mention: GdeltMentionRecord;
  gkg: GdeltGkgRecord & { pageTitle: string };
}

function locationType(value: number): LocationType {
  if (value === 1) return "country";
  if (value === 2 || value === 5) return "admin1";
  if (value === 3 || value === 4) return "city";
  return "point";
}

function sourceLanguage(translationInfo?: string): string | undefined {
  return translationInfo?.match(/(?:^|;\s*)srclc:([^;\s]+)/i)?.[1]?.toLowerCase();
}

function membership(articleId: string, mention: GdeltMentionRecord): ClusterMembership {
  return {
    articleId,
    confidence: mention.confidence / 100,
    evidence: {
      threshold: 0.8,
      components: {
        title: { score: 0, weight: 0, available: false },
        entities: { score: 0, weight: 0, available: false },
        time: { score: 0, weight: 0, available: false },
        location: { score: 0, weight: 0, available: false },
        semantic: { score: 0, weight: 0, available: false },
      },
      reasons: [
        `exact GlobalEventID join ${mention.globalEventId}`,
        "exact MentionIdentifier to GKG DocumentIdentifier join",
        `GDELT mention confidence ${mention.confidence}% with InRawText=1`,
      ],
    },
  };
}

function articleFromJoin(joined: JoinedDocument, generatedAt: string): Article | undefined {
  let canonicalUrl: string;
  let domain: string;
  try {
    canonicalUrl = canonicalizeUrl(joined.mention.mentionIdentifier);
    domain = domainFromUrl(canonicalUrl);
  } catch {
    return undefined;
  }
  const language = sourceLanguage(joined.gkg.translationInfo ?? joined.mention.translationInfo);
  return {
    id: stableId("article", canonicalUrl),
    url: joined.mention.mentionIdentifier,
    canonicalUrl,
    title: joined.gkg.pageTitle,
    publisher: {
      id: stableId("publisher", domain),
      name: joined.gkg.sourceCommonName || joined.mention.mentionSourceName || domain,
      domain,
    },
    ...(language === undefined ? {} : { language }),
    publishedAt: joined.gkg.publishedAt,
    retrievedAt: generatedAt,
    source: {
      provider: "gdelt",
      providerRecordId: joined.gkg.recordId,
      providerScore: joined.mention.confidence / 100,
    },
  };
}

function eventLocation(event: JoinedDocument["event"], articles: Article[]): EventLocation {
  const geo = event.actionGeo;
  const evidence = articles.map((article) => ({
    articleId: article.id,
    url: article.url,
    quote: `GDELT ActionGeo: ${geo.fullName}`,
    method: "provider_event_geotag" as const,
  }));
  return {
    id: stableId(
      "location",
      geo.featureId ?? `${geo.fullName}|${geo.latitude.toFixed(5)}|${geo.longitude.toFixed(5)}`,
    ),
    name: geo.fullName,
    ...(geo.countryCode === undefined ? {} : { countryCode: geo.countryCode }),
    ...(geo.adm1Code === undefined ? {} : { admin1: geo.adm1Code }),
    type: locationType(geo.type),
    coordinates: { latitude: geo.latitude, longitude: geo.longitude },
    confidence:
      articles.length === 0
        ? 0
        : Math.min(1, articles.reduce((sum, article) => sum + (article.source.providerScore ?? 0), 0) / articles.length),
    evidence,
  };
}

function parseWarnings(input: BuildSnapshotInput): string[] {
  const warnings: string[] = [];
  for (const [kind, table] of Object.entries({ events: input.events, mentions: input.mentions, gkg: input.gkg })) {
    if (table.diagnostics.rowsMalformed > 0) {
      warnings.push(`${kind}: omitted ${table.diagnostics.rowsMalformed} malformed rows.`);
    }
    if (table.diagnostics.hitRowCap) warnings.push(`${kind}: row cap reached; snapshot is partial.`);
  }
  return warnings;
}

export function buildIntelligenceSnapshot(input: BuildSnapshotInput): IntelligenceSnapshot {
  const eventById = new Map(input.events.records.map((event) => [event.globalEventId, event]));
  const eligibleByKey = new Map<string, GdeltMentionRecord>();
  for (const mention of input.mentions.records) {
    const event = eventById.get(mention.globalEventId);
    if (
      mention.mentionType !== input.gates.mentionType ||
      mention.inRawText !== input.gates.inRawText ||
      mention.confidence < input.gates.minimumConfidence ||
      event?.actionGeo === undefined
    ) {
      continue;
    }
    const key = `${mention.globalEventId}|${mention.mentionIdentifier}`;
    const existing = eligibleByKey.get(key);
    if (
      existing === undefined ||
      mention.confidence > existing.confidence ||
      (mention.confidence === existing.confidence && mention.mentionTimeDate > existing.mentionTimeDate)
    ) {
      eligibleByKey.set(key, mention);
    }
  }
  const gkgByDocument = new Map<string, GdeltGkgRecord>();
  for (const record of input.gkg.records) {
    if (record.sourceCollectionIdentifier !== 1) continue;
    const existing = gkgByDocument.get(record.documentIdentifier);
    if (
      existing === undefined ||
      (record.pageTitle !== undefined && existing.pageTitle === undefined) ||
      record.publishedAt > existing.publishedAt
    ) {
      gkgByDocument.set(record.documentIdentifier, record);
    }
  }

  let droppedWithoutGkg = 0;
  let droppedWithoutTitle = 0;
  const byEvent = new Map<string, JoinedDocument[]>();
  for (const mention of eligibleByKey.values()) {
    const event = eventById.get(mention.globalEventId)!;
    const gkg = gkgByDocument.get(mention.mentionIdentifier);
    if (gkg === undefined) {
      droppedWithoutGkg += 1;
      continue;
    }
    if (gkg.pageTitle === undefined) {
      droppedWithoutTitle += 1;
      continue;
    }
    const joined: JoinedDocument = {
      event: event as JoinedDocument["event"],
      mention,
      gkg: gkg as JoinedDocument["gkg"],
    };
    const group = byEvent.get(event.globalEventId) ?? [];
    group.push(joined);
    byEvent.set(event.globalEventId, group);
  }

  const provisional: StoryCluster[] = [];
  for (const [eventId, documents] of byEvent) {
    documents.sort(
      (left, right) =>
        right.mention.confidence - left.mention.confidence ||
        right.mention.mentionTimeDate.localeCompare(left.mention.mentionTimeDate),
    );
    const articleMention = new Map<string, GdeltMentionRecord>();
    const byCanonicalUrl = new Map<string, Article>();
    for (const document of documents) {
      const article = articleFromJoin(document, input.generatedAt);
      if (article === undefined) continue;
      const existing = byCanonicalUrl.get(article.canonicalUrl);
      if (existing === undefined) {
        byCanonicalUrl.set(article.canonicalUrl, article);
        articleMention.set(article.id, document.mention);
      }
    }
    const articles = [...byCanonicalUrl.values()].slice(0, input.limits.maxArticlesPerCluster);
    if (articles.length === 0) continue;
    const mentions = articles.map((article) => articleMention.get(article.id)!);
    const timestamps = mentions.map((mention) => Date.parse(mention.mentionTimeDate));
    const location = eventLocation(documents[0]!.event, articles);
    provisional.push({
      id: `gdelt_event_${eventId}`,
      canonicalTitle: articles[0]!.title,
      firstObservedAt: new Date(Math.min(...timestamps)).toISOString(),
      lastObservedAt: new Date(Math.max(...timestamps)).toISOString(),
      articles,
      memberships: articles.map((article) => membership(article.id, articleMention.get(article.id)!)),
      eventLocations: [location],
      claims: [],
      prominence: [],
      health: {
        status: "healthy",
        fetchedAt: input.generatedAt,
        sourceCount: 3,
        successfulSourceCount: 3,
        warnings: [],
      },
    });
  }
  provisional.sort((left, right) => {
    const leftOutlets = new Set(left.articles.map((article) => article.publisher.id)).size;
    const rightOutlets = new Set(right.articles.map((article) => article.publisher.id)).size;
    return rightOutlets - leftOutlets || right.articles.length - left.articles.length || right.lastObservedAt.localeCompare(left.lastObservedAt);
  });
  const clustersBeforeCap = provisional.length;
  const clusters = provisional.slice(0, input.limits.maxClusters);
  const drafts: ArticleClusterDraft[] = clusters.map((cluster) => ({
    id: cluster.id,
    canonicalTitle: cluster.canonicalTitle,
    articles: cluster.articles,
    memberships: cluster.memberships,
    eventLocations: cluster.eventLocations,
    firstObservedAt: cluster.firstObservedAt,
    lastObservedAt: cluster.lastObservedAt,
  }));
  const prominence = computeRegionalProminence(drafts);
  const warnings = parseWarnings(input);
  if (clustersBeforeCap > clusters.length) warnings.push("cluster cap reached; snapshot is partial.");
  const partial = warnings.some((warning) => warning.includes("cap reached"));
  const health: PipelineHealth = {
    status: partial ? "degraded" : "healthy",
    fetchedAt: input.generatedAt,
    sourceCount: 3,
    successfulSourceCount: 3,
    warnings,
  };
  for (const cluster of clusters) {
    cluster.prominence = prominence.get(cluster.id) ?? [];
    cluster.health = health;
  }
  const validationIssues = clusters
    .map((cluster) => ({ clusterId: cluster.id, issues: validateStoryCluster(cluster) }))
    .filter((entry) => entry.issues.length > 0);
  const statistics: GdeltSnapshotStatistics = {
    rows: {
      events: input.events.diagnostics,
      mentions: input.mentions.diagnostics,
      gkg: input.gkg.diagnostics,
    },
    eligibleMentions: eligibleByKey.size,
    joinedMentions: [...byEvent.values()].reduce((sum, records) => sum + records.length, 0),
    droppedWithoutGkg,
    droppedWithoutTitle,
    clustersBeforeCap,
    clustersEmitted: clusters.length,
    articlesEmitted: clusters.reduce((sum, cluster) => sum + cluster.articles.length, 0),
  };
  return {
    kind: "atlas.intelligence_snapshot",
    schemaVersion: "1.0",
    generatedAt: input.generatedAt,
    batchId: input.manifest.batchId,
    batchTimestamp: input.manifest.batchTimestamp,
    source: {
      provider: "gdelt",
      attribution: "Data provided by The GDELT Project (https://www.gdeltproject.org/).",
      manifestUrl: input.manifest.manifestUrl,
      files: [input.manifest.files.events, input.manifest.files.mentions, input.manifest.files.gkg],
    },
    gates: input.gates,
    limits: input.limits,
    statistics,
    health,
    clusters,
    validationIssues,
  };
}

export function validateIntelligenceSnapshot(snapshot: IntelligenceSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (snapshot.kind !== "atlas.intelligence_snapshot" || snapshot.schemaVersion !== "1.0") {
    issues.push({ code: "invalid_snapshot_version", path: "schemaVersion", message: "Unsupported snapshot schema." });
  }
  if (snapshot.source.files.length !== 3 || new Set(snapshot.source.files.map((file) => file.kind)).size !== 3) {
    issues.push({ code: "missing_source_files", path: "source.files", message: "Snapshot requires Events, Mentions, and GKG files." });
  }
  if (snapshot.clusters.length !== snapshot.statistics.clustersEmitted) {
    issues.push({ code: "invalid_cluster_count", path: "statistics.clustersEmitted", message: "Count does not match clusters." });
  }
  for (const [index, cluster] of snapshot.clusters.entries()) {
    for (const issue of validateStoryCluster(cluster)) {
      issues.push({ ...issue, path: `clusters[${index}].${issue.path}` });
    }
  }
  return issues;
}
