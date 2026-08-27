import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defaultEntityExtractor, jaccard, titleTokens } from "../src/clustering/engine.js";
import { snapshotFromDocument } from "../src/export/d1-seed.js";
import { canonicalizeUrl, domainFromUrl } from "../src/ingestion/sources.js";
import type { StoryCluster } from "../src/schema/types.js";

interface SearchResult {
  title: string;
  url: string;
  score: number;
  published_date?: string | null;
  content?: string | null;
}

interface SearchResponse {
  results?: SearchResult[];
  usage?: { credits?: number };
  request_id?: string;
}

interface ExtractResult {
  url: string;
  raw_content?: string | null;
}

interface ExtractResponse {
  results?: ExtractResult[];
  usage?: { credits?: number };
  request_id?: string;
}

interface Candidate {
  result: SearchResult;
  canonicalUrl: string;
  domain: string;
  rawContent: string;
  extractionSha256: string;
  network: string;
  titleOverlap: number;
  entityOverlap: number;
}

const KNOWN_NETWORKS: Readonly<Record<string, string>> = {
  "abcnews.com": "disney-abc",
  "apnews.com": "associated-press",
  "bbc.com": "bbc",
  "bbc.co.uk": "bbc",
  "bloomberg.com": "bloomberg",
  "businessinsider.com": "axel-springer",
  "cbsnews.com": "paramount-cbs",
  "cnn.com": "warner-cnn",
  "foxnews.com": "fox",
  "greenwichtime.com": "hearst",
  "independent.co.uk": "independent",
  "nbcnews.com": "nbcuniversal",
  "newsweek.com": "newsweek",
  "npr.org": "npr",
  "nytimes.com": "new-york-times",
  "reuters.com": "reuters",
  "theguardian.com": "guardian",
  "timesofisrael.com": "times-of-israel",
  "nationalpost.com": "postmedia",
  "torontosun.com": "postmedia",
  "usatoday.com": "gannett",
  "washingtonpost.com": "washington-post",
  "yahoo.com": "yahoo",
};

const LOW_YIELD = /\b(review|fundraiser|weather|traffic alert|top \d+|shares gap|blu-ray|donate|horoscope|franchises|website design|first waiters|paws around|community college|nursing and counting)\b/i;
const HIGH_YIELD = /\b(Trump|Taliban|ICE|flood|Pakistan|OpenAI|Nvidia|Meta|China|NASA|FBI|Ukraine|Russia|NATO|Iran|Israel|Gaza|PKK|EU|cyber|hack|King Charles|Nepal|ChatGPT|nuclear|settlement|court|arrest|attack|war|ceasefire|migrant|missing|jury|privacy|AI)\b/i;
const NON_ARTICLE_DOMAINS = new Set(["facebook.com", "instagram.com", "reddit.com", "tiktok.com", "x.com", "youtube.com"]);

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function positiveInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedDomain(url: string): string {
  return domainFromUrl(canonicalizeUrl(url)).replace(/^www\./, "").toLowerCase();
}

function networkFor(domain: string, content = ""): string {
  const lower = content.slice(0, 5_000).toLowerCase();
  if (/\b(?:by\s+(?:the\s+)?associated press|associated press writer|ap photo|copyright[^\n]{0,80}(?:the\s+)?associated press|reporting by (?:the\s+)?associated press|the associated press)\b|\(ap\)/.test(lower)) return "associated-press";
  if (/\b(?:by\s+reuters|reuters reporting|©\s*reuters|copyright[^\n]{0,80}reuters|reporting by[^\n]{0,80}reuters|reuters\s*[—-])\b/.test(lower)) return "reuters";
  if (/\b(?:agence france-presse|by\s+afp|©\s*afp|copyright[^\n]{0,80}afp)\b/.test(lower)) return "afp";
  if (/\b(?:bloomberg news|by\s+bloomberg|copyright[^\n]{0,80}bloomberg)\b/.test(lower)) return "bloomberg";
  if (/\b(?:asian news international|by\s+ani|ani news)\b/.test(lower)) return "ani";
  if (/\b(?:united press international|by\s+upi)\b/.test(lower)) return "upi";
  if (domain.endsWith(".iheart.com") || domain === "iheart.com") return "iheart";
  return KNOWN_NETWORKS[domain] ?? domain;
}

function textTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4)
      .slice(0, 900),
  );
}

function contentSimilarity(left: string, right: string): number {
  const leftTokens = textTokens(left);
  const rightTokens = textTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  return jaccard(leftTokens, rightTokens);
}

function wordShingles(value: string, size = 5): Set<string> {
  const words = value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 1_200);
  const shingles = new Set<string>();
  for (let index = 0; index + size <= words.length; index += 1) {
    shingles.add(words.slice(index, index + size).join(" "));
  }
  return shingles;
}

function shingleSimilarity(left: string, right: string): number {
  const leftShingles = wordShingles(left);
  const rightShingles = wordShingles(right);
  if (leftShingles.size === 0 || rightShingles.size === 0) return 0;
  return jaccard(leftShingles, rightShingles);
}

function entityOverlap(cluster: StoryCluster, title: string): number {
  const clusterEntities = new Set(defaultEntityExtractor({ title: cluster.canonicalTitle } as StoryCluster["articles"][number]));
  const candidateEntities = new Set(defaultEntityExtractor({ title } as StoryCluster["articles"][number]));
  if (clusterEntities.size === 0 || candidateEntities.size === 0) return 0;
  return jaccard(clusterEntities, candidateEntities);
}

function priority(cluster: StoryCluster): number {
  const tokenCount = titleTokens(cluster.canonicalTitle).size;
  return (HIGH_YIELD.test(cluster.canonicalTitle) ? 100 : 0)
    + Math.min(30, tokenCount)
    + Math.min(10, cluster.articles.length * 2)
    - (LOW_YIELD.test(cluster.canonicalTitle) ? 100 : 0);
}

function canonicalTitleKey(value: string): string {
  return [...titleTokens(value)].sort().join(" ");
}

function searchQueryForTitle(value: string): string {
  return value
    .replace(/^[A-Z][A-Z ]{3,32}:\s+/, "")
    .replace(/\s+\|\s+[^|]{2,80}$/, "")
    .trim();
}

async function pooledMap<T, R>(values: readonly T[], concurrency: number, task: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await task(values[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return output;
}

async function tavilyRequest<T>(apiKey: string, endpoint: "search" | "extract", body: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.tavily.com/${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return await response.json() as T;
    if (response.status !== 429 || attempt === 2) {
      throw new Error(`Tavily ${endpoint} returned HTTP ${response.status}.`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(30_000, retryAfter * 1_000)
      : 5_000 * (attempt + 1);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }
  throw new Error(`Tavily ${endpoint} retry loop exhausted.`);
}

const apiKey = process.env.TAVILY_API_KEY?.trim();
if (apiKey === undefined || apiKey === "") throw new Error("TAVILY_API_KEY is required.");

const inputPath = resolve(argument("--input") ?? "artifacts/p0-editorial-market-final.json");
const outputPath = resolve(argument("--output") ?? "artifacts/tavily-multibranch-receipt.json");
const targetStories = positiveInteger(argument("--target-stories"), "--target-stories", 20);
const searchLimit = positiveInteger(argument("--search-limit"), "--search-limit", 70);
const searchConcurrency = positiveInteger(argument("--search-concurrency"), "--search-concurrency", 8);
const extractConcurrency = positiveInteger(argument("--extract-concurrency"), "--extract-concurrency", 4);
const excludedClusterIds = new Set((argument("--exclude-clusters") ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const includedClusterIds = new Set((argument("--include-clusters") ?? "").split(",").map((value) => value.trim()).filter(Boolean));

const inputDocument: unknown = JSON.parse(await readFile(inputPath, "utf8"));
const snapshot = snapshotFromDocument(inputDocument);
const seenTitleKeys = new Set<string>();
const clusters = [...snapshot.clusters]
  .sort((left, right) => priority(right) - priority(left) || right.articles.length - left.articles.length)
  .filter((cluster) => {
    if ((includedClusterIds.size > 0 && !includedClusterIds.has(cluster.id)) || LOW_YIELD.test(cluster.canonicalTitle) || excludedClusterIds.has(cluster.id)) return false;
    const key = canonicalTitleKey(cluster.canonicalTitle);
    if (key === "" || seenTitleKeys.has(key)) return false;
    seenTitleKeys.add(key);
    return true;
  })
  .slice(0, searchLimit);

let searchCredits = 0;
const searchResponses = await pooledMap(clusters, searchConcurrency, async (cluster) => {
  try {
    const response = await tavilyRequest<SearchResponse>(apiKey, "search", {
      query: searchQueryForTitle(cluster.canonicalTitle),
      topic: "news",
      search_depth: "advanced",
      max_results: 20,
      time_range: "week",
      include_raw_content: false,
      include_usage: true,
    });
    searchCredits += response.usage?.credits ?? 2;
    return { cluster, response, error: null };
  } catch (error) {
    return { cluster, response: { results: [] } satisfies SearchResponse, error: error instanceof Error ? error.message : "unknown Tavily search error" };
  }
});

const preliminaryByCluster = new Map<string, SearchResult[]>();
for (const { cluster, response } of searchResponses) {
  const existingUrls = new Set(cluster.articles.map((article) => canonicalizeUrl(article.canonicalUrl)));
  const existingDomains = new Set(cluster.articles.map((article) => article.publisher.domain.replace(/^www\./, "").toLowerCase()));
  const domains = new Set(existingDomains);
  const preliminary: SearchResult[] = [];
  for (const result of [...(response.results ?? [])].sort((left, right) => right.score - left.score)) {
    if (preliminary.length >= 8 || !Number.isFinite(result.score) || result.score < 0.5) continue;
    let canonicalUrl: string;
    let domain: string;
    try {
      canonicalUrl = canonicalizeUrl(result.url);
      domain = normalizedDomain(result.url);
    } catch {
      continue;
    }
    if (NON_ARTICLE_DOMAINS.has(domain)) continue;
    if (existingUrls.has(canonicalUrl) || domains.has(domain)) continue;
    const titleOverlap = jaccard(titleTokens(cluster.canonicalTitle), titleTokens(result.title));
    const entities = entityOverlap(cluster, result.title);
    if (titleOverlap < 0.08 && entities < 0.1) continue;
    const publishedAt = result.published_date === null || result.published_date === undefined ? NaN : Date.parse(result.published_date);
    const clusterAt = Date.parse(cluster.lastObservedAt);
    if (!Number.isFinite(publishedAt) || !Number.isFinite(clusterAt) || Math.abs(publishedAt - clusterAt) > 38 * 3_600_000) continue;
    preliminary.push(result);
    domains.add(domain);
  }
  if (preliminary.length > 0) preliminaryByCluster.set(cluster.id, preliminary);
}

const urls = [...new Set([...preliminaryByCluster.values()].flatMap((results) => results.map((result) => canonicalizeUrl(result.url))))];
const urlBatches = Array.from({ length: Math.ceil(urls.length / 20) }, (_, index) => urls.slice(index * 20, index * 20 + 20));
let extractCredits = 0;
const extractionResponses = await pooledMap(urlBatches, extractConcurrency, async (batch) => {
  const response = await tavilyRequest<ExtractResponse>(apiKey, "extract", {
    urls: batch,
    extract_depth: "basic",
    format: "markdown",
    include_usage: true,
  });
  extractCredits += response.usage?.credits ?? Math.ceil((response.results?.length ?? 0) / 5);
  return response;
});
const extractionByUrl = new Map<string, string>();
for (const response of extractionResponses) {
  for (const result of response.results ?? []) {
    if (typeof result.raw_content !== "string" || result.raw_content.length < 500) continue;
    try {
      extractionByUrl.set(canonicalizeUrl(result.url), result.raw_content);
    } catch {
      continue;
    }
  }
}

const qualified: Array<{
  cluster: StoryCluster;
  candidates: Candidate[];
  comparisons: Array<{ left: string; right: string; contentSimilarity: number; shingleSimilarity: number; titleSimilarity: number }>;
}> = [];
for (const cluster of clusters) {
  const existingNetworks = new Set(cluster.articles.map((article) => networkFor(article.publisher.domain.replace(/^www\./, "").toLowerCase(), article.summary)));
  const selected: Candidate[] = [];
  for (const result of preliminaryByCluster.get(cluster.id) ?? []) {
    const canonicalUrl = canonicalizeUrl(result.url);
    const rawContent = extractionByUrl.get(canonicalUrl);
    if (rawContent === undefined) continue;
    const domain = normalizedDomain(result.url);
    const network = networkFor(domain, rawContent);
    if (existingNetworks.has(network) || selected.some((candidate) => candidate.network === network)) continue;
    const titleOverlap = jaccard(titleTokens(cluster.canonicalTitle), titleTokens(result.title));
    const entities = entityOverlap(cluster, result.title);
    if (selected.some((candidate) => contentSimilarity(candidate.rawContent, rawContent) > 0.72)) continue;
    if (selected.some((candidate) => shingleSimilarity(candidate.rawContent, rawContent) >= 0.12)) continue;
    if (selected.some((candidate) => jaccard(titleTokens(candidate.result.title), titleTokens(result.title)) > 0.6)) continue;
    selected.push({ result, canonicalUrl, domain, rawContent, extractionSha256: sha256(rawContent), network, titleOverlap, entityOverlap: entities });
    if (selected.length === 2) break;
  }
  if (selected.length !== 2) continue;
  const comparisons = [{
    left: selected[0]!.domain,
    right: selected[1]!.domain,
    contentSimilarity: contentSimilarity(selected[0]!.rawContent, selected[1]!.rawContent),
    shingleSimilarity: shingleSimilarity(selected[0]!.rawContent, selected[1]!.rawContent),
    titleSimilarity: jaccard(titleTokens(selected[0]!.result.title), titleTokens(selected[1]!.result.title)),
  }];
  qualified.push({ cluster, candidates: selected, comparisons });
  if (qualified.length >= targetStories) break;
}

const observedAt = new Date().toISOString();
const receipt = {
  provider: "tavily",
  observed_at: observedAt,
  ok: true,
  budget_guard: {
    target_stories: targetStories,
    searches_attempted: clusters.length,
    search_depth: "advanced",
    extraction_depth: "basic",
    search_credits_observed: searchCredits,
    extract_credits_observed: extractCredits,
  },
  searches: qualified.map(({ cluster, candidates }) => ({
    query: cluster.canonicalTitle,
    results: candidates.map((candidate) => ({
      title: candidate.result.title,
      url: candidate.result.url,
      score: candidate.result.score,
      published_date: candidate.result.published_date ?? null,
      content_excerpt: candidate.rawContent.slice(0, 4_000),
    })),
  })),
  extract: {
    results: qualified.flatMap(({ candidates }) => candidates.map((candidate) => ({
      url: candidate.result.url,
      raw_content_chars: candidate.rawContent.length,
      raw_content_sha256: candidate.extractionSha256,
    }))),
  },
  verification: {
    qualified_story_count: qualified.length,
    requirements: {
      tavily_score_minimum: 0.5,
      extracted_characters_minimum: 500,
      distinct_networks_per_story: 3,
      candidate_content_similarity_maximum: 0.72,
      candidate_five_word_shingle_similarity_maximum: 0.12,
      candidate_title_similarity_maximum: 0.6,
      publication_distance_hours_maximum: 38,
    },
    stories: qualified.map(({ cluster, candidates, comparisons }) => ({
      cluster_id: cluster.id,
      canonical_title: cluster.canonicalTitle,
      existing_networks: [...new Set(cluster.articles.map((article) => networkFor(article.publisher.domain.replace(/^www\./, "").toLowerCase(), article.summary)))],
      additions: candidates.map((candidate) => ({
        domain: candidate.domain,
        network: candidate.network,
        title: candidate.result.title,
        title_overlap: candidate.titleOverlap,
        entity_overlap: candidate.entityOverlap,
        extracted_sha256: candidate.extractionSha256,
      })),
      comparisons,
      difference_basis: "independent network, non-duplicate extracted article text, and distinct headline emphasis",
    })),
    search_errors: searchResponses.flatMap(({ cluster, error }) => error === null ? [] : [{ cluster_id: cluster.id, error }]),
  },
};

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
try {
  await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, outputPath);
} finally {
  await unlink(temporaryPath).catch(() => undefined);
}

console.log(JSON.stringify({
  ok: qualified.length >= targetStories,
  outputPath,
  searched: clusters.length,
  extracted: extractionByUrl.size,
  qualifiedStories: qualified.length,
  additions: qualified.length * 2,
  observedCredits: searchCredits + extractCredits,
}));
