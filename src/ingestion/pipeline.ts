import type { Article, PipelineHealth, StoryCluster, ValidationIssue } from "../schema/types.js";
import { validateStoryCluster } from "../schema/types.js";
import { clusterArticles, type ClusterEngineOptions } from "../clustering/engine.js";
import { EvidenceBackedGeocoder } from "../geolocation/geocoder.js";
import { computeRegionalProminence } from "../prominence/metrics.js";
import { systemClock, type Clock, type NewsSourceClient, type SourceResult } from "./sources.js";

export interface PipelineRequest {
  query: string;
  from?: string;
  to?: string;
  windowHours?: number;
  maxResultsPerSource?: number;
}

export interface PipelineResult {
  query: string;
  window: { from: string; to: string; hours: number };
  producedAt: string;
  articles: Article[];
  clusters: StoryCluster[];
  sources: SourceResult[];
  health: PipelineHealth;
  validationIssues: Array<{ clusterId: string; issues: ValidationIssue[] }>;
}

export interface NewsPipelineOptions {
  sources: NewsSourceClient[];
  geocoder: EvidenceBackedGeocoder;
  cluster?: Omit<ClusterEngineOptions, "locations">;
  clock?: Clock;
}

function uniqueArticles(results: SourceResult[]): Article[] {
  const byUrl = new Map<string, Article>();
  for (const result of results) {
    if (!result.ok) continue;
    for (const article of result.articles) {
      const existing = byUrl.get(article.canonicalUrl);
      if (existing === undefined) {
        byUrl.set(article.canonicalUrl, article);
        continue;
      }
      const existingSummary = existing.summary?.length ?? 0;
      const candidateSummary = article.summary?.length ?? 0;
      if (candidateSummary > existingSummary) byUrl.set(article.canonicalUrl, article);
    }
  }
  return [...byUrl.values()];
}

function pipelineHealth(results: SourceResult[], articleCount: number, fetchedAt: string): PipelineHealth {
  const successful = results.filter((result) => result.ok).length;
  const warnings = results.flatMap((result) =>
    result.ok ? result.warnings : [`${result.provider}: ${result.kind} — ${result.message}`],
  );
  if (articleCount === 0) warnings.push("No live articles were returned; no fallback records were created.");
  const status =
    successful === 0 ? "unavailable" : successful < results.length || articleCount === 0 ? "degraded" : "healthy";
  return {
    status,
    fetchedAt,
    sourceCount: results.length,
    successfulSourceCount: successful,
    warnings,
  };
}

function requestWindow(request: PipelineRequest, clock: Clock): { from: string; to: string; hours: number } {
  const hours = request.windowHours ?? 24;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
    throw new Error("windowHours must be in (0, 168].");
  }
  const to = request.to ?? clock.now().toISOString();
  const from = request.from ?? new Date(Date.parse(to) - hours * 3_600_000).toISOString();
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) {
    throw new Error("Pipeline window must contain valid increasing ISO timestamps.");
  }
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), hours };
}

export class NewsTruthPipeline {
  private readonly sources: NewsSourceClient[];
  private readonly geocoder: EvidenceBackedGeocoder;
  private readonly clusterOptions: Omit<ClusterEngineOptions, "locations">;
  private readonly clock: Clock;

  constructor(options: NewsPipelineOptions) {
    this.sources = options.sources;
    this.geocoder = options.geocoder;
    this.clusterOptions = options.cluster ?? {};
    this.clock = options.clock ?? systemClock;
  }

  async run(request: PipelineRequest): Promise<PipelineResult> {
    if (request.query.trim().length === 0) throw new Error("A non-empty query is required.");
    const window = requestWindow(request, this.clock);
    const sourceQuery = {
      query: request.query,
      from: window.from,
      to: window.to,
      maxResults: request.maxResultsPerSource ?? 50,
    };
    const sources = await Promise.all(this.sources.map((source) => source.search(sourceQuery)));
    const articles = uniqueArticles(sources);
    const producedAt = this.clock.now().toISOString();
    const health = pipelineHealth(sources, articles.length, producedAt);
    const allLocations = await this.geocoder.geocode(articles);
    const drafts = await clusterArticles(articles, {
      ...this.clusterOptions,
      locations: allLocations,
    });
    for (const draft of drafts) {
      draft.eventLocations = await this.geocoder.geocode(draft.articles);
    }
    const prominence = computeRegionalProminence(drafts);
    const clusters: StoryCluster[] = drafts.map((draft) => ({
      ...draft,
      claims: [],
      prominence: prominence.get(draft.id) ?? [],
      health,
    }));
    const validationIssues = clusters
      .map((cluster) => ({ clusterId: cluster.id, issues: validateStoryCluster(cluster) }))
      .filter((entry) => entry.issues.length > 0);
    return {
      query: request.query,
      window,
      producedAt,
      articles,
      clusters,
      sources,
      health,
      validationIssues,
    };
  }
}
