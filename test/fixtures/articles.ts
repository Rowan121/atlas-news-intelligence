import {
  sameStorySourceContext,
  type Article,
  type EventLocation,
  type StoryCluster,
} from "../../src/schema/types.js";
import type {
  Gazetteer,
  GazetteerPlace,
  GazetteerTextMatch,
} from "../../src/geolocation/geocoder.js";

export const FIXED_NOW = "2026-08-27T01:00:00.000Z";

export function makeArticle(
  overrides: Partial<Article> & Pick<Article, "id" | "title" | "url">,
): Article {
  const domain = new URL(overrides.url).hostname;
  return {
    canonicalUrl: overrides.url,
    publisher: {
      id: `publisher_${domain}`,
      name: domain,
      domain,
    },
    retrievedAt: FIXED_NOW,
    publishedAt: "2026-08-27T00:00:00.000Z",
    source: { provider: "gdelt" },
    sameStory: sameStorySourceContext(overrides.publisher?.origin),
    ...overrides,
  };
}

export const tokyoA = makeArticle({
  id: "article_tokyo_a",
  url: "https://alpha.example/world/tokyo-earthquake",
  title: "Strong earthquake shakes Tokyo region",
  summary: "Emergency crews in Tokyo inspected rail lines after the earthquake.",
  publishedAt: "2026-08-27T00:00:00.000Z",
});

export const tokyoB = makeArticle({
  id: "article_tokyo_b",
  url: "https://bravo.example/asia/tokyo-quake",
  title: "Tokyo region shaken by strong earthquake",
  summary: "Officials in Tokyo reported no major damage after the quake.",
  publishedAt: "2026-08-27T00:25:00.000Z",
  source: { provider: "tavily", providerScore: 0.9 },
});

export const parisA = makeArticle({
  id: "article_paris_a",
  url: "https://charlie.example/climate/paris-summit",
  title: "Climate summit opens in Paris",
  summary: "Delegates gathered in Paris for negotiations.",
  publishedAt: "2026-08-27T00:10:00.000Z",
});

export const parisB = makeArticle({
  id: "article_paris_b",
  url: "https://delta.example/europe/climate-talks",
  title: "Paris hosts opening of climate summit",
  summary: "The climate summit began in Paris with calls for faster action.",
  publishedAt: "2026-08-27T00:35:00.000Z",
});

export const tokyoPlace: GazetteerPlace = {
  id: "geo_tokyo",
  name: "Tokyo",
  countryCode: "JP",
  admin1: "Tokyo",
  type: "city",
  latitude: 35.6762,
  longitude: 139.6503,
};

export const parisPlace: GazetteerPlace = {
  id: "geo_paris",
  name: "Paris",
  countryCode: "FR",
  admin1: "Île-de-France",
  type: "city",
  latitude: 48.8566,
  longitude: 2.3522,
};

interface AliasedPlace {
  place: GazetteerPlace;
  aliases: string[];
  ambiguityCount?: number;
}

export class TestGazetteer implements Gazetteer {
  constructor(
    private readonly places: AliasedPlace[] = [
      { place: tokyoPlace, aliases: ["Tokyo"] },
      { place: parisPlace, aliases: ["Paris"] },
    ],
  ) {}

  async matchText(text: string): Promise<GazetteerTextMatch[]> {
    const matches: GazetteerTextMatch[] = [];
    for (const entry of this.places) {
      for (const alias of entry.aliases) {
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${alias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu");
        for (const match of text.matchAll(pattern)) {
          const matchedText = match[0];
          const start = match.index;
          if (matchedText === undefined || start === undefined) continue;
          matches.push({
            place: entry.place,
            start,
            end: start + matchedText.length,
            matchedText,
            ambiguityCount: entry.ambiguityCount ?? 1,
          });
        }
      }
    }
    return matches;
  }
}

export const tokyoLocation: EventLocation = {
  id: tokyoPlace.id,
  name: tokyoPlace.name,
  countryCode: "JP",
  admin1: "Tokyo",
  type: tokyoPlace.type,
  coordinates: { latitude: tokyoPlace.latitude, longitude: tokyoPlace.longitude },
  confidence: 0.9,
  evidence: [
    {
      articleId: tokyoA.id,
      url: tokyoA.url,
      quote: tokyoA.title,
      method: "article_text",
    },
    {
      articleId: tokyoB.id,
      url: tokyoB.url,
      quote: tokyoB.title,
      method: "article_text",
    },
  ],
};

export function makeValidCluster(overrides: Partial<StoryCluster> = {}): StoryCluster {
  return {
    id: "cluster_tokyo",
    canonicalTitle: tokyoA.title,
    firstObservedAt: tokyoA.publishedAt!,
    lastObservedAt: tokyoB.publishedAt!,
    articles: [tokyoA, tokyoB],
    memberships: [tokyoA, tokyoB].map((article, index) => ({
      articleId: article.id,
      confidence: index === 0 ? 1 : 0.82,
      evidence: {
        ...(index === 0 ? {} : { matchedArticleId: tokyoA.id }),
        threshold: 0.56,
        components: {
          title: { score: 0.8, weight: 0.38, available: true },
          entities: { score: 0.7, weight: 0.23, available: true },
          time: { score: 0.99, weight: 0.14, available: true },
          location: { score: 1, weight: 0.1, available: true },
          semantic: { score: 0, weight: 0.15, available: false },
        },
        reasons: [index === 0 ? "seed article" : "matching title, entity, time and location"],
      },
    })),
    eventLocations: [tokyoLocation],
    claims: [],
    prominence: [
      {
        basis: "event_location",
        regionKey: "JP",
        regionName: "JP",
        raw: { articleCount: 2, outletCount: 2 },
        normalized: {
          score: 1,
          articleShare: 1,
          outletShare: 1,
          sourceNormalizedShare: 1,
          denominators: { regionalArticleMemberships: 2, regionalOutlets: 2 },
        },
      },
    ],
    health: {
      status: "healthy",
      fetchedAt: FIXED_NOW,
      sourceCount: 2,
      successfulSourceCount: 2,
      warnings: [],
    },
    ...overrides,
  };
}
