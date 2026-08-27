import type {
  Article,
  Claim,
  ClusterMembership,
  EventLocation,
  EventLocationEvidence,
  LocationType,
  PipelineHealth,
  StoryCluster,
  ValidationIssue,
} from "../../schema/types.js";
import { sameStorySourceContext, validateStoryCluster } from "../../schema/types.js";
import { resolveOutletEditorialProfile } from "../../editorial-market/registry.js";
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

/**
 * Conservative headline normalization used only to collapse GDELT event ids
 * with an exact normalized headline and a second piece of identity evidence:
 * either the same primary event location or an overlapping canonical article
 * URL. Title similarity alone never merges clusters.
 */
export function normalizeGdeltHeadline(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedPrimaryLocation(location: EventLocation): string {
  return [
    location.type,
    location.countryCode?.toUpperCase() ?? "",
    location.admin1?.toUpperCase() ?? "",
    normalizeGdeltHeadline(location.name),
    location.coordinates.latitude.toFixed(5),
    location.coordinates.longitude.toFixed(5),
  ].join("|");
}

export function gdeltDuplicateClusterKey(cluster: StoryCluster): string | undefined {
  const primary = cluster.eventLocations[0];
  const title = normalizeGdeltHeadline(cluster.canonicalTitle);
  if (primary === undefined || title.length === 0) return undefined;
  return `${title}|${normalizedPrimaryLocation(primary)}`;
}

function gdeltDuplicateEvidenceKeys(cluster: StoryCluster): string[] {
  const title = normalizeGdeltHeadline(cluster.canonicalTitle);
  if (title.length === 0) return [];
  const keys = new Set<string>();
  const locationKey = gdeltDuplicateClusterKey(cluster);
  if (locationKey !== undefined) keys.add(`location|${locationKey}`);
  for (const canonicalUrl of cluster.articles.map((article) => article.canonicalUrl).sort()) {
    if (canonicalUrl.length > 0) keys.add(`document|${title}|${canonicalUrl}`);
  }
  return [...keys];
}

function mergeMemberships(memberships: ClusterMembership[]): ClusterMembership[] {
  const byArticle = new Map<string, ClusterMembership>();
  for (const candidate of memberships) {
    const existing = byArticle.get(candidate.articleId);
    if (existing === undefined) {
      byArticle.set(candidate.articleId, structuredClone(candidate));
      continue;
    }
    const preferred = candidate.confidence > existing.confidence ? candidate : existing;
    const matchedArticleIds = [existing.evidence.matchedArticleId, candidate.evidence.matchedArticleId]
      .filter((value): value is string => value !== undefined)
      .sort();
    byArticle.set(candidate.articleId, {
      articleId: candidate.articleId,
      confidence: Math.max(existing.confidence, candidate.confidence),
      evidence: {
        ...(matchedArticleIds[0] === undefined ? {} : { matchedArticleId: matchedArticleIds[0] }),
        threshold: Math.min(existing.evidence.threshold, candidate.evidence.threshold),
        components: structuredClone(preferred.evidence.components),
        reasons: [...new Set([...existing.evidence.reasons, ...candidate.evidence.reasons])].sort(),
      },
    });
  }
  return [...byArticle.values()].sort((left, right) => left.articleId.localeCompare(right.articleId));
}

function evidenceKey(evidence: EventLocationEvidence): string {
  return [
    evidence.articleId,
    evidence.url,
    evidence.quote,
    evidence.start ?? "",
    evidence.end ?? "",
    evidence.method,
  ].join("|");
}

function mergeLocations(locations: EventLocation[]): EventLocation[] {
  const byLocation = new Map<string, EventLocation>();
  for (const candidate of locations) {
    const key = normalizedPrimaryLocation(candidate);
    const existing = byLocation.get(key);
    if (existing === undefined) {
      byLocation.set(key, structuredClone(candidate));
      continue;
    }
    const evidence = new Map<string, EventLocationEvidence>();
    for (const item of [...existing.evidence, ...candidate.evidence]) evidence.set(evidenceKey(item), item);
    const preferred = candidate.confidence > existing.confidence ? candidate : existing;
    byLocation.set(key, {
      ...structuredClone(preferred),
      confidence: Math.max(existing.confidence, candidate.confidence),
      evidence: [...evidence.values()].sort((left, right) => evidenceKey(left).localeCompare(evidenceKey(right))),
    });
  }
  return [...byLocation.values()].sort(
    (left, right) => right.confidence - left.confidence || normalizedPrimaryLocation(left).localeCompare(normalizedPrimaryLocation(right)),
  );
}

function claimEvidenceKey(claim: Claim): string {
  return `${claim.id}|${claim.text}|${claim.polarity}`;
}

function mergeClaims(claims: Claim[]): Claim[] {
  const byClaim = new Map<string, Claim>();
  for (const candidate of claims) {
    const key = claimEvidenceKey(candidate);
    const existing = byClaim.get(key);
    if (existing === undefined) {
      byClaim.set(key, structuredClone(candidate));
      continue;
    }
    const evidence = new Map<string, Claim["evidence"][number]>();
    for (const item of [...existing.evidence, ...candidate.evidence]) {
      evidence.set([item.articleId, item.url, item.quote, item.start ?? "", item.end ?? ""].join("|"), item);
    }
    byClaim.set(key, {
      ...structuredClone(existing),
      confidence: Math.max(existing.confidence, candidate.confidence),
      evidence: [...evidence.values()],
    });
  }
  return [...byClaim.values()].sort((left, right) => claimEvidenceKey(left).localeCompare(claimEvidenceKey(right)));
}

/**
 * Merge only clusters connected by an exact normalized title plus either a
 * matching primary location or an overlapping canonical article URL. A shared
 * canonical document is direct evidence that different GlobalEventIDs are
 * facets of the same published story; all distinct event locations remain.
 * The output is stable across input ordering, retains each distinct article
 * and all membership/location evidence, and leaves prominence empty for
 * corpus-wide recomputation by the caller.
 */
export function mergeDuplicateGdeltClusters(clusters: StoryCluster[]): StoryCluster[] {
  const parent = clusters.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[index] !== index) {
      const next = parent[index]!;
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (leftRoot < rightRoot) parent[rightRoot] = leftRoot;
    else parent[leftRoot] = rightRoot;
  };
  const firstClusterByEvidence = new Map<string, number>();
  clusters.forEach((cluster, index) => {
    for (const key of gdeltDuplicateEvidenceKeys(cluster)) {
      const existing = firstClusterByEvidence.get(key);
      if (existing === undefined) firstClusterByEvidence.set(key, index);
      else union(existing, index);
    }
  });

  const groups = new Map<number, StoryCluster[]>();
  clusters.forEach((cluster, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(cluster);
    groups.set(root, group);
  });

  for (const group of groups.values()) {
    group.sort((left, right) => left.id.localeCompare(right.id));
  }

  const merged: StoryCluster[] = [];
  for (const group of groups.values()) {
    const canonical = group[0]!;
    const articlesById = new Map<string, Article>();
    for (const article of group.flatMap((cluster) => cluster.articles)) {
      const existing = articlesById.get(article.id);
      if (
        existing === undefined
        || (article.source.providerScore ?? 0) > (existing.source.providerScore ?? 0)
        || ((article.source.providerScore ?? 0) === (existing.source.providerScore ?? 0)
          && article.canonicalUrl.localeCompare(existing.canonicalUrl) < 0)
      ) {
        articlesById.set(article.id, structuredClone(article));
      }
    }
    const articles = [...articlesById.values()].sort(
      (left, right) =>
        (right.source.providerScore ?? 0) - (left.source.providerScore ?? 0)
        || (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "")
        || left.canonicalUrl.localeCompare(right.canonicalUrl),
    );
    merged.push({
      ...structuredClone(canonical),
      id: group.map((cluster) => cluster.id).sort()[0]!,
      canonicalTitle: canonical.canonicalTitle,
      firstObservedAt: group.map((cluster) => cluster.firstObservedAt).sort()[0]!,
      lastObservedAt: group.map((cluster) => cluster.lastObservedAt).sort().at(-1)!,
      articles,
      memberships: mergeMemberships(group.flatMap((cluster) => cluster.memberships)),
      eventLocations: mergeLocations(group.flatMap((cluster) => cluster.eventLocations)),
      claims: mergeClaims(group.flatMap((cluster) => cluster.claims)),
      prominence: [],
    });
  }
  return merged.sort((left, right) => left.id.localeCompare(right.id));
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
  const editorialProfile = resolveOutletEditorialProfile(domain);
  return {
    id: stableId("article", canonicalUrl),
    url: joined.mention.mentionIdentifier,
    canonicalUrl,
    title: joined.gkg.pageTitle,
    publisher: {
      id: stableId("publisher", domain),
      name: joined.gkg.sourceCommonName || joined.mention.mentionSourceName || domain,
      domain,
      ...(editorialProfile === undefined ? {} : { origin: editorialProfile.publisherOrigin }),
    },
    ...(language === undefined ? {} : { language }),
    publishedAt: joined.gkg.publishedAt,
    retrievedAt: generatedAt,
    source: {
      provider: "gdelt",
      providerRecordId: joined.gkg.recordId,
      providerScore: joined.mention.confidence / 100,
    },
    sameStory: sameStorySourceContext(
      editorialProfile?.publisherOrigin,
      editorialProfile?.editorialMarket,
    ),
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
  const merged = mergeDuplicateGdeltClusters(provisional);
  merged.sort((left, right) => {
    const leftOutlets = new Set(left.articles.map((article) => article.publisher.id)).size;
    const rightOutlets = new Set(right.articles.map((article) => article.publisher.id)).size;
    return rightOutlets - leftOutlets || right.articles.length - left.articles.length || right.lastObservedAt.localeCompare(left.lastObservedAt);
  });
  const clustersBeforeCap = merged.length;
  const clusters = merged.slice(0, input.limits.maxClusters);
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
  const duplicateClustersMerged = provisional.length - merged.length;
  if (duplicateClustersMerged > 0) {
    warnings.push(
      `merged ${duplicateClustersMerged} duplicate GlobalEventID cluster(s) by exact normalized title plus matching primary event location or overlapping canonical article URL.`,
    );
  }
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
