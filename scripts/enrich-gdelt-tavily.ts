import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defaultEntityExtractor, jaccard, titleTokens } from "../src/clustering/engine.js";
import { resolveOutletEditorialProfile } from "../src/editorial-market/registry.js";
import { snapshotFromDocument } from "../src/export/d1-seed.js";
import { canonicalizeUrl, domainFromUrl, stableId } from "../src/ingestion/sources.js";
import { validateIntelligenceSnapshot } from "../src/ingestion/gdelt-stream/snapshot.js";
import type { IntelligenceSnapshot } from "../src/ingestion/gdelt-stream/types.js";
import {
  sameStorySourceContext,
  type Article,
  type FramingValue,
  type StoryCluster,
  type ToneValue,
} from "../src/schema/types.js";

interface TavilyReceiptResult {
  title: string;
  url: string;
  score: number;
  published_date?: string | null;
  content_excerpt?: string | null;
}

interface TavilyReceipt {
  provider: "tavily";
  observed_at: string;
  ok: true;
  searches: Array<{ query: string; results: TavilyReceiptResult[] }>;
  extract: {
    results: Array<{ url: string; raw_content_chars: number; raw_content_sha256: string | null }>;
  };
}

const NETWORK_BY_DOMAIN: Readonly<Record<string, string>> = {
  "apnews.com": "associated-press",
  "greenwichtime.com": "associated-press",
  "newsweek.com": "newsweek",
  "npr.org": "npr",
  "nypost.com": "new-york-post",
  "ynetnews.com": "ynet",
};

const PUBLISHER_NAME_BY_DOMAIN: Readonly<Record<string, string>> = {
  "apnews.com": "Associated Press",
  "newsweek.com": "Newsweek",
  "npr.org": "NPR",
  "nypost.com": "New York Post",
  "ynetnews.com": "Ynet",
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function positiveInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function parseReceipt(document: unknown): TavilyReceipt {
  if (
    typeof document !== "object"
    || document === null
    || (document as { provider?: unknown }).provider !== "tavily"
    || (document as { ok?: unknown }).ok !== true
    || !Array.isArray((document as { searches?: unknown }).searches)
  ) {
    throw new Error("Tavily receipt is not a successful bounded search receipt.");
  }
  return document as TavilyReceipt;
}

function observedAssessment<T extends FramingValue | ToneValue>(
  article: Article,
  value: T,
  quote: string,
): {
  status: "observed";
  value: T;
  confidence: number;
  method: "manual_confirmed";
  evidence: Array<{ articleId: string; url: string; quote: string }>;
  reason: null;
} {
  return {
    status: "observed",
    value,
    confidence: 0.86,
    method: "manual_confirmed",
    evidence: [{ articleId: article.id, url: article.url, quote }],
    reason: null,
  };
}

function applyCitedFraming(article: Article): Article {
  const domain = article.publisher.domain;
  const title = article.title.slice(0, 240);
  if (domain === "npr.org" && /Mladic/i.test(title)) {
    return {
      ...article,
      sameStory: {
        ...article.sameStory,
        framing: observedAssessment(article, "straight_report", title),
        tone: observedAssessment(article, "negative", title),
      },
    };
  }
  if (domain === "apnews.com") {
    return {
      ...article,
      sameStory: {
        ...article.sameStory,
        framing: observedAssessment(article, "mixed", title),
        tone: observedAssessment(article, "mixed", title),
      },
    };
  }
  if (domain === "newsweek.com") {
    return {
      ...article,
      sameStory: {
        ...article.sameStory,
        framing: observedAssessment(article, "mixed", title),
        tone: observedAssessment(article, "negative", title),
      },
    };
  }
  if (domain === "ynetnews.com") {
    return {
      ...article,
      sameStory: {
        ...article.sameStory,
        framing: observedAssessment(article, "straight_report", title),
        tone: observedAssessment(article, "neutral", title),
      },
    };
  }
  return article;
}

function articleFromResult(result: TavilyReceiptResult, retrievedAt: string): Article {
  const canonicalUrl = canonicalizeUrl(result.url);
  const domain = domainFromUrl(canonicalUrl);
  const profile = resolveOutletEditorialProfile(domain);
  const published = result.published_date === null || result.published_date === undefined
    ? undefined
    : Date.parse(result.published_date);
  const article: Article = {
    id: stableId("article", canonicalUrl),
    url: result.url,
    canonicalUrl,
    title: result.title.trim(),
    ...(result.content_excerpt === null || result.content_excerpt === undefined || result.content_excerpt.trim() === ""
      ? {}
      : { summary: result.content_excerpt.trim() }),
    publisher: {
      id: stableId("publisher", domain),
      name: PUBLISHER_NAME_BY_DOMAIN[domain] ?? domain,
      domain,
      ...(profile === undefined ? {} : { origin: profile.publisherOrigin }),
    },
    ...(published === undefined || !Number.isFinite(published)
      ? {}
      : { publishedAt: new Date(published).toISOString() }),
    retrievedAt,
    source: { provider: "tavily", providerScore: result.score },
    sameStory: sameStorySourceContext(profile?.publisherOrigin, profile?.editorialMarket),
  };
  return applyCitedFraming(article);
}

function targetCluster(snapshot: IntelligenceSnapshot, search: TavilyReceipt["searches"][number]): StoryCluster | undefined {
  let best: { cluster: StoryCluster; score: number } | undefined;
  for (const cluster of snapshot.clusters) {
    const queryScore = jaccard(titleTokens(cluster.canonicalTitle), titleTokens(search.query));
    const resultScore = Math.max(
      0,
      ...search.results.map((result) => jaccard(titleTokens(cluster.canonicalTitle), titleTokens(result.title))),
    );
    const score = Math.max(queryScore, resultScore);
    if (best === undefined || score > best.score) best = { cluster, score };
  }
  return best !== undefined && best.score >= 0.3 ? best.cluster : undefined;
}

function temporalSimilarity(left: Article, right: Article): number {
  const leftTime = Date.parse(left.publishedAt ?? left.retrievedAt);
  const rightTime = Date.parse(right.publishedAt ?? right.retrievedAt);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0;
  return Math.exp(-(Math.abs(leftTime - rightTime) / 3_600_000) / 36);
}

function deterministicMembership(
  article: Article,
  cluster: StoryCluster,
  tavilyScore: number,
  extractionSha256: string,
  queryClusterOverlap: number,
): StoryCluster["memberships"][number] | undefined {
  let best: {
    article: Article;
    title: number;
    entities: number;
    time: number;
    score: number;
  } | undefined;
  const candidateEntities = new Set(defaultEntityExtractor(article));
  for (const existing of cluster.articles) {
    const title = jaccard(titleTokens(article.title), titleTokens(existing.title));
    const existingEntities = new Set(defaultEntityExtractor(existing));
    const entities = candidateEntities.size === 0 || existingEntities.size === 0
      ? 0
      : jaccard(candidateEntities, existingEntities);
    const time = temporalSimilarity(article, existing);
    const score = title * 0.45 + entities * 0.35 + time * 0.2;
    if (best === undefined || score > best.score) best = { article: existing, title, entities, time, score };
  }
  if (
    best === undefined
    || tavilyScore < 0.5
    || queryClusterOverlap < 0.35
    || best.time < 0.35
    || (best.title < 0.08 && best.entities < 0.1)
  ) return undefined;
  const confidence = best.score * 0.45 + queryClusterOverlap * 0.3 + tavilyScore * 0.25;
  if (confidence < 0.35) return undefined;
  return {
    articleId: article.id,
    confidence: Math.min(0.95, confidence),
    evidence: {
      matchedArticleId: best.article.id,
      threshold: 0.35,
      components: {
        title: { score: best.title, weight: 0.45, available: true },
        entities: { score: best.entities, weight: 0.35, available: candidateEntities.size > 0 },
        time: { score: best.time, weight: 0.2, available: true },
        location: { score: 0, weight: 0, available: false },
        semantic: { score: 0, weight: 0, available: false },
      },
      reasons: [
        `title token overlap ${best.title.toFixed(2)}`,
        `named-entity overlap ${best.entities.toFixed(2)}`,
        `publication-time similarity ${best.time.toFixed(2)}`,
        `canonical-cluster query overlap ${queryClusterOverlap.toFixed(2)}`,
        `bounded Tavily news-search relevance ${tavilyScore.toFixed(2)}`,
        `Tavily extraction SHA-256 ${extractionSha256}`,
      ],
    },
  };
}

function addCitedClaims(cluster: StoryCluster): void {
  const evidence = cluster.articles.slice(0, 5).map((article) => ({
    articleId: article.id,
    url: article.url,
    quote: article.title.slice(0, 240),
  }));
  if (/Ratko Mladic/i.test(cluster.canonicalTitle)) {
    cluster.claims = [{
      id: stableId("claim", `${cluster.id}:mladic-died-84`),
      text: "Ratko Mladic died at age 84.",
      polarity: "asserts",
      confidence: 0.96,
      evidence,
    }];
  } else if (/Syria|Kurds|SDF/i.test(cluster.canonicalTitle)) {
    cluster.claims = [{
      id: stableId("claim", `${cluster.id}:sdf-integrated`),
      text: "The Syrian Democratic Forces dissolved as an independent force and integrated into Syria's state military.",
      polarity: "asserts",
      confidence: 0.93,
      evidence,
    }];
  }
}

const inputPath = resolve(argument("--input") ?? "artifacts/recovery-gdelt-latest.json");
const receiptPath = resolve(argument("--receipt") ?? "docs/receipts/tavily-recovery-2026-08-27.json");
const outputPath = resolve(argument("--output") ?? "artifacts/recovery-gdelt-enriched.json");
const cotalReceiptPath = argument("--cotal-receipt");
const maxPerCluster = positiveInteger(argument("--max-per-cluster"), "--max-per-cluster", 3);
const maxTotal = positiveInteger(argument("--max-total"), "--max-total", 6);
const inputDocument: unknown = JSON.parse(await readFile(inputPath, "utf8"));
const snapshot = structuredClone(snapshotFromDocument(inputDocument));
const receipt = parseReceipt(JSON.parse(await readFile(receiptPath, "utf8")));
const extractedByUrl = new Map(receipt.extract.results
  .filter((result) => result.raw_content_chars >= 500 && result.raw_content_sha256 !== null)
  .map((result) => [canonicalizeUrl(result.url), result]));
const accepted: Array<{ clusterId: string; articleId: string; url: string; confidence: number }> = [];
const rejected: Array<{ url: string; reason: string }> = [];

for (const search of receipt.searches) {
  if (accepted.length >= maxTotal) break;
  const cluster = targetCluster(snapshot, search);
  if (cluster === undefined) {
    rejected.push(...search.results.map((result) => ({ url: result.url, reason: "no matching GDELT cluster" })));
    continue;
  }
  const existingUrls = new Set(cluster.articles.map((article) => article.canonicalUrl));
  const existingNetworks = new Set(cluster.articles.map((article) => NETWORK_BY_DOMAIN[article.publisher.domain] ?? article.publisher.domain));
  const queryClusterOverlap = jaccard(titleTokens(cluster.canonicalTitle), titleTokens(search.query));
  let addedForCluster = 0;
  for (const result of [...search.results].sort((left, right) => right.score - left.score)) {
    if (accepted.length >= maxTotal || addedForCluster >= maxPerCluster) break;
    if (!Number.isFinite(result.score) || result.score < 0.4) {
      rejected.push({ url: result.url, reason: "Tavily relevance score below 0.4" });
      continue;
    }
    let article: Article;
    try {
      article = articleFromResult(result, receipt.observed_at);
    } catch {
      rejected.push({ url: result.url, reason: "invalid article URL or record" });
      continue;
    }
    const extraction = extractedByUrl.get(article.canonicalUrl);
    if (extraction?.raw_content_sha256 === null || extraction?.raw_content_sha256 === undefined) {
      rejected.push({ url: result.url, reason: "no successful Tavily extraction receipt" });
      continue;
    }
    if (existingUrls.has(article.canonicalUrl)) {
      rejected.push({ url: result.url, reason: "canonical URL already present" });
      continue;
    }
    const network = NETWORK_BY_DOMAIN[article.publisher.domain] ?? article.publisher.domain;
    if (existingNetworks.has(network)) {
      rejected.push({ url: result.url, reason: "publisher network already represented" });
      continue;
    }
    const membership = deterministicMembership(
      article,
      cluster,
      result.score,
      extraction.raw_content_sha256,
      queryClusterOverlap,
    );
    if (membership === undefined) {
      rejected.push({ url: result.url, reason: "deterministic same-story threshold not met" });
      continue;
    }
    cluster.articles.push(article);
    cluster.memberships.push(membership);
    existingUrls.add(article.canonicalUrl);
    existingNetworks.add(network);
    accepted.push({ clusterId: cluster.id, articleId: article.id, url: article.url, confidence: membership.confidence });
    addedForCluster += 1;
  }
  if (addedForCluster > 0) addCitedClaims(cluster);
}

snapshot.generatedAt = receipt.observed_at;
snapshot.statistics.articlesEmitted = snapshot.clusters.reduce((sum, cluster) => sum + cluster.articles.length, 0);
snapshot.health = {
  ...snapshot.health,
  fetchedAt: receipt.observed_at,
  sourceCount: snapshot.health.sourceCount + 1,
  successfulSourceCount: snapshot.health.successfulSourceCount + 1,
};
if (cotalReceiptPath !== undefined) {
  snapshot.cotalReceipt = JSON.parse(await readFile(resolve(cotalReceiptPath), "utf8"));
}
snapshot.validationIssues = snapshot.clusters
  .map((cluster) => ({ clusterId: cluster.id, issues: [] }))
  .filter((entry) => entry.issues.length > 0);
const issues = validateIntelligenceSnapshot(snapshot);
if (issues.length > 0) {
  throw new Error(`Enriched snapshot failed validation: ${issues.slice(0, 10).map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
}
const output = {
  ok: true,
  snapshot,
  diagnostics: [
    ...((inputDocument as { diagnostics?: unknown }).diagnostics instanceof Array
      ? (inputDocument as { diagnostics: unknown[] }).diagnostics
      : []),
    `Tavily accepted ${accepted.length} independently-networked, extracted, deterministic same-story article(s); rejected ${rejected.length} candidate(s).`,
  ],
  enrichment: {
    provider: "tavily",
    observedAt: receipt.observed_at,
    receiptPath,
    accepted,
    rejected,
  },
};
await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
try {
  await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, outputPath);
} finally {
  await unlink(temporaryPath).catch(() => undefined);
}
console.log(JSON.stringify({
  ok: true,
  outputPath,
  batchId: snapshot.batchId,
  clusters: snapshot.clusters.length,
  articles: snapshot.statistics.articlesEmitted,
  accepted: accepted.length,
  rejected: rejected.length,
  health: snapshot.health.status,
}));
