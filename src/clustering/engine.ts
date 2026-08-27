import type {
  Article,
  ClusterMembership,
  ClusterMembershipEvidence,
  EventLocation,
  SimilarityComponent,
} from "../schema/types.js";
import { stableId } from "../ingestion/sources.js";

export interface SemanticSimilarityProvider {
  similarity(left: Article, right: Article): Promise<number | undefined>;
}

export interface ClusterEngineOptions {
  threshold?: number;
  semantic?: SemanticSimilarityProvider;
  locations?: EventLocation[];
  entityExtractor?: (article: Article) => string[];
}

export interface ArticleClusterDraft {
  id: string;
  canonicalTitle: string;
  articles: Article[];
  memberships: ClusterMembership[];
  eventLocations: EventLocation[];
  firstObservedAt: string;
  lastObservedAt: string;
}

interface PairScore {
  score: number;
  evidence: ClusterMembershipEvidence;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "in",
  "is",
  "it",
  "of",
  "on",
  "that",
  "the",
  "to",
  "was",
  "were",
  "will",
  "with",
]);

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function titleTokens(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? [],
  );
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

export function defaultEntityExtractor(article: Article): string[] {
  const text = `${article.title}. ${article.summary ?? ""}`;
  const candidates = text.match(/(?:\p{Lu}[\p{L}\p{M}'’-]*)(?:\s+\p{Lu}[\p{L}\p{M}'’-]*){0,3}/gu) ?? [];
  return [...new Set(candidates.map((candidate) => candidate.normalize("NFKC").toLocaleLowerCase()))];
}

function articleLocations(articleId: string, locations: EventLocation[]): Set<string> {
  return new Set(
    locations
      .filter((location) => location.evidence.some((evidence) => evidence.articleId === articleId))
      .map((location) => location.id),
  );
}

function temporalSimilarity(left: Article, right: Article): number | undefined {
  const leftDate = Date.parse(left.publishedAt ?? left.retrievedAt);
  const rightDate = Date.parse(right.publishedAt ?? right.retrievedAt);
  if (!Number.isFinite(leftDate) || !Number.isFinite(rightDate)) return undefined;
  const hours = Math.abs(leftDate - rightDate) / 3_600_000;
  return Math.exp(-hours / 36);
}

function component(score: number | undefined, weight: number): SimilarityComponent {
  return {
    score: score === undefined ? 0 : bounded(score),
    weight,
    available: score !== undefined,
  };
}

async function compareArticles(
  left: Article,
  right: Article,
  options: Required<Pick<ClusterEngineOptions, "threshold" | "entityExtractor">> &
    Pick<ClusterEngineOptions, "semantic" | "locations">,
): Promise<PairScore> {
  const title = jaccard(titleTokens(left.title), titleTokens(right.title));
  const leftEntities = new Set(options.entityExtractor(left));
  const rightEntities = new Set(options.entityExtractor(right));
  const entities = leftEntities.size > 0 && rightEntities.size > 0 ? jaccard(leftEntities, rightEntities) : undefined;
  const time = temporalSimilarity(left, right);
  const leftLocations = articleLocations(left.id, options.locations ?? []);
  const rightLocations = articleLocations(right.id, options.locations ?? []);
  const location =
    leftLocations.size > 0 && rightLocations.size > 0 ? jaccard(leftLocations, rightLocations) : undefined;
  let semantic: number | undefined;
  if (options.semantic !== undefined) {
    try {
      semantic = await options.semantic.similarity(left, right);
    } catch {
      semantic = undefined;
    }
  }
  const components = {
    title: component(title, 0.38),
    entities: component(entities, 0.23),
    time: component(time, 0.14),
    location: component(location, 0.1),
    semantic: component(semantic, 0.15),
  };
  const values = Object.values(components);
  const availableWeight = values.filter((value) => value.available).reduce((sum, value) => sum + value.weight, 0);
  const score =
    availableWeight === 0
      ? 0
      : values.reduce((sum, value) => sum + (value.available ? value.score * value.weight : 0), 0) /
        availableWeight;
  const reasons: string[] = [];
  if (title >= 0.45) reasons.push(`title token overlap ${title.toFixed(2)}`);
  if (entities !== undefined && entities >= 0.35) reasons.push(`named-entity overlap ${entities.toFixed(2)}`);
  if (time !== undefined && time >= 0.7) reasons.push(`publication times are close (${time.toFixed(2)})`);
  if (location !== undefined && location > 0) reasons.push(`shared event-location evidence ${location.toFixed(2)}`);
  if (semantic !== undefined && semantic >= 0.65) reasons.push(`semantic similarity ${semantic.toFixed(2)}`);
  if (reasons.length === 0) reasons.push(`weighted similarity ${score.toFixed(2)}`);
  return {
    score: bounded(score),
    evidence: { threshold: options.threshold, components, reasons },
  };
}

function seedMembership(articleId: string, threshold: number): ClusterMembership {
  return {
    articleId,
    confidence: 1,
    evidence: {
      threshold,
      components: {
        title: { score: 1, weight: 1, available: true },
        entities: { score: 0, weight: 0, available: false },
        time: { score: 0, weight: 0, available: false },
        location: { score: 0, weight: 0, available: false },
        semantic: { score: 0, weight: 0, available: false },
      },
      reasons: ["seed article"],
    },
  };
}

function observationTime(article: Article): number {
  return Date.parse(article.publishedAt ?? article.retrievedAt);
}

export async function clusterArticles(
  input: Article[],
  options: ClusterEngineOptions = {},
): Promise<ArticleClusterDraft[]> {
  const threshold = options.threshold ?? 0.5;
  const entityExtractor = options.entityExtractor ?? defaultEntityExtractor;
  const byCanonicalUrl = new Map<string, Article>();
  for (const article of input) {
    const existing = byCanonicalUrl.get(article.canonicalUrl);
    if (existing === undefined || observationTime(article) < observationTime(existing)) {
      byCanonicalUrl.set(article.canonicalUrl, article);
    }
  }
  const articles = [...byCanonicalUrl.values()].sort(
    (left, right) => observationTime(left) - observationTime(right) || left.id.localeCompare(right.id),
  );
  const groups: Array<{ articles: Article[]; memberships: ClusterMembership[] }> = [];
  const pairCache = new Map<string, PairScore>();
  const scorePair = async (left: Article, right: Article): Promise<PairScore> => {
    const key = [left.id, right.id].sort().join("|");
    const cached = pairCache.get(key);
    if (cached !== undefined) return cached;
    const scored = await compareArticles(left, right, {
      threshold,
      entityExtractor,
      ...(options.semantic === undefined ? {} : { semantic: options.semantic }),
      ...(options.locations === undefined ? {} : { locations: options.locations }),
    });
    pairCache.set(key, scored);
    return scored;
  };

  for (const article of articles) {
    let best:
      | { groupIndex: number; maximum: PairScore; matchedArticle: Article; average: number }
      | undefined;
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex]!;
      const scores = await Promise.all(group.articles.map((member) => scorePair(article, member)));
      let maximumIndex = 0;
      for (let index = 1; index < scores.length; index += 1) {
        if (scores[index]!.score > scores[maximumIndex]!.score) maximumIndex = index;
      }
      const maximum = scores[maximumIndex]!;
      const average = scores.reduce((sum, score) => sum + score.score, 0) / scores.length;
      if (
        maximum.score >= threshold &&
        average >= threshold - 0.08 &&
        (best === undefined || maximum.score > best.maximum.score)
      ) {
        best = {
          groupIndex,
          maximum,
          matchedArticle: group.articles[maximumIndex]!,
          average,
        };
      }
    }
    if (best === undefined) {
      groups.push({ articles: [article], memberships: [seedMembership(article.id, threshold)] });
      continue;
    }
    const group = groups[best.groupIndex]!;
    group.articles.push(article);
    group.memberships.push({
      articleId: article.id,
      confidence: best.maximum.score,
      evidence: {
        ...best.maximum.evidence,
        matchedArticleId: best.matchedArticle.id,
        reasons: [...best.maximum.evidence.reasons, `cluster-average similarity ${best.average.toFixed(2)}`],
      },
    });
  }

  const drafts: ArticleClusterDraft[] = [];
  for (const group of groups) {
    let canonicalArticle = group.articles[0]!;
    let canonicalScore = -1;
    for (const candidate of group.articles) {
      const comparisons = await Promise.all(
        group.articles.filter((article) => article.id !== candidate.id).map((article) => scorePair(candidate, article)),
      );
      const average = comparisons.length === 0 ? 1 : comparisons.reduce((sum, score) => sum + score.score, 0) / comparisons.length;
      if (average > canonicalScore) {
        canonicalScore = average;
        canonicalArticle = candidate;
      }
    }
    const timestamps = group.articles.map((article) => observationTime(article)).filter(Number.isFinite);
    const articleIds = new Set(group.articles.map((article) => article.id));
    const eventLocations = (options.locations ?? [])
      .map((location) => ({
        ...location,
        evidence: location.evidence.filter((evidence) => articleIds.has(evidence.articleId)),
      }))
      .filter((location) => location.evidence.length > 0);
    const sortedIds = [...articleIds].sort();
    drafts.push({
      id: stableId("cluster", sortedIds.join("|")),
      canonicalTitle: canonicalArticle.title,
      articles: group.articles,
      memberships: group.memberships,
      eventLocations,
      firstObservedAt: new Date(Math.min(...timestamps)).toISOString(),
      lastObservedAt: new Date(Math.max(...timestamps)).toISOString(),
    });
  }
  return drafts.sort((left, right) => Date.parse(right.lastObservedAt) - Date.parse(left.lastObservedAt));
}
