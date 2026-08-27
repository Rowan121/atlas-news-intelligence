import type {
  PipelineHealth,
  PipelineRunInput,
  StoryDetail,
  StoryQuery,
  StorySummary,
} from "../contracts";
import type { TruthStore } from "../store";

// Test-only synthetic records. These values never ship through the production store.
export const story: StoryDetail = {
  cluster_id: "test-cluster-001",
  canonical_title: "Test-only port authority closes synthetic harbor",
  summary: "A deterministic fixture used only for route tests.",
  primary_region_code: "TEST-EU",
  first_observed_at: "2026-08-26T10:00:00.000Z",
  last_observed_at: "2026-08-26T11:30:00.000Z",
  raw_article_count: 2,
  unique_publisher_count: 2,
  normalized_prominence: 0.4,
  cluster_confidence: 0.92,
  membership_explanation: "Fixture articles share a synthetic event entity and time window.",
  primary_event_location: {
    location_id: "test-location-event",
    location_type: "event",
    location_granularity: "city",
    label: "Test Harbor",
    latitude: 12.5,
    longitude: 22.5,
    country_code: "ZZ",
    region_code: "TEST-EU",
    confidence: 0.9,
    evidence_article_id: "test-article-1",
    evidence_quote: "The synthetic port authority closed Test Harbor.",
    evidence_start: 0,
    evidence_end: 48,
    evidence_count: 1,
  },
  articles: [
    {
      article_id: "test-article-1",
      canonical_url: "https://example.invalid/test-only/article-1",
      source_url: "https://example.invalid/test-only/article-1?ref=fixture",
      title: "Synthetic harbor closure",
      publisher_name: "Fixture Wire",
      publisher_domain: "example.invalid",
      publisher_origin_country: "ZZ",
      audience_region_code: "TEST-EU",
      language: "en",
      published_at: "2026-08-26T11:00:00.000Z",
      retrieved_at: "2026-08-26T11:31:00.000Z",
      evidence_snippet: "Test-only evidence.",
      membership_confidence: 0.93,
      membership_evidence: "Synthetic fixture entities match.",
    },
  ],
  locations: [],
  claims: [],
  regional_prominence: [],
};
story.locations = story.primary_event_location === null ? [] : [story.primary_event_location];

export const healthy: PipelineHealth = {
  status: "ok",
  checked_at: "2026-08-26T12:00:00.000Z",
  stale_after_seconds: 1800,
  latest_story_at: "2026-08-26T11:50:00.000Z",
  freshness_age_seconds: 600,
  latest_run: null,
  failures_24h: 0,
  cluster_count_24h: 1,
  article_count_24h: 2,
  active_source_count: 2,
  reasons: [],
};

export class MemoryTruthStore implements TruthStore {
  readonly queries: StoryQuery[] = [];
  health: PipelineHealth = healthy;
  stories: StoryDetail[] = [story];

  async listStories(query: StoryQuery, _now: Date, _staleAfterSeconds: number): Promise<StorySummary[]> {
    this.queries.push(query);
    return this.stories.map(({ articles: _articles, locations: _locations, claims: _claims, regional_prominence: _prominence, ...summary }) => summary);
  }

  async getStory(clusterId: string): Promise<StoryDetail | null> {
    return this.stories.find((candidate) => candidate.cluster_id === clusterId) ?? null;
  }

  async getHealth(_now: Date, _staleAfterSeconds: number): Promise<PipelineHealth> {
    return this.health;
  }

  async upsertPipelineRun(
    _run: PipelineRunInput,
    _now: Date,
  ): Promise<"inserted" | "updated" | "replayed"> {
    return "inserted";
  }
}
