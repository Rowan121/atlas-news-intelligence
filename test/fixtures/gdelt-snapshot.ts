import type { StoryCluster } from "../../src/schema/types.js";
import type { IntelligenceSnapshot } from "../../src/ingestion/gdelt-stream/types.js";

const generatedAt = "2026-08-27T06:35:00.000Z";

function cluster(
  eventId: string,
  articleId: string,
  url: string,
  publisher: string,
  title: string,
  confidence: number,
): StoryCluster {
  return {
    id: `gdelt_event_${eventId}`,
    canonicalTitle: title,
    firstObservedAt: "2026-08-27T06:30:00.000Z",
    lastObservedAt: "2026-08-27T06:31:00.000Z",
    articles: [{
      id: articleId,
      url,
      canonicalUrl: url,
      title,
      publisher: { id: `publisher_${publisher}`, name: publisher, domain: new URL(url).hostname },
      publishedAt: "2026-08-27T06:30:00.000Z",
      retrievedAt: generatedAt,
      source: { provider: "gdelt", providerRecordId: `${eventId}-1`, providerScore: confidence },
    }],
    memberships: [{
      articleId,
      confidence,
      evidence: {
        threshold: 0.8,
        components: {
          title: { score: 0, weight: 0, available: false },
          entities: { score: 0, weight: 0, available: false },
          time: { score: 0, weight: 0, available: false },
          location: { score: 0, weight: 0, available: false },
          semantic: { score: 0, weight: 0, available: false },
        },
        reasons: [`exact GlobalEventID join ${eventId}`],
      },
    }],
    eventLocations: [{
      id: "location_fixture_city",
      name: "Fixture City, Testland",
      countryCode: "TS",
      admin1: "TS01",
      type: "city",
      coordinates: { latitude: 10.25, longitude: 20.5 },
      confidence,
      evidence: [{
        articleId,
        url,
        quote: "GDELT ActionGeo: Fixture City, Testland",
        method: "provider_event_geotag",
      }],
    }],
    claims: [],
    prominence: [{
      regionKey: "TS",
      regionName: "TS",
      raw: { articleCount: 1, outletCount: 1 },
      normalized: {
        score: 0.5,
        articleShare: 0.5,
        outletShare: 0.5,
        sourceNormalizedShare: 0.5,
        denominators: { regionalArticleMemberships: 2, regionalOutlets: 2 },
      },
    }],
    health: {
      status: "healthy",
      fetchedAt: generatedAt,
      sourceCount: 3,
      successfulSourceCount: 3,
      warnings: [],
    },
  };
}

export const gdeltSnapshotFixture: IntelligenceSnapshot = {
  kind: "atlas.intelligence_snapshot",
  schemaVersion: "1.0",
  generatedAt,
  batchId: "20260827063000",
  batchTimestamp: "2026-08-27T06:30:00.000Z",
  source: {
    provider: "gdelt",
    attribution: "Data provided by The GDELT Project (https://www.gdeltproject.org/).",
    manifestUrl: "https://data.gdeltproject.org/gdeltv2/lastupdate.txt",
    files: [
      { kind: "events", compressedBytes: 100, md5: "11111111111111111111111111111111", url: "https://data.gdeltproject.org/gdeltv2/fixture.export.CSV.zip", batchId: "20260827063000" },
      { kind: "mentions", compressedBytes: 100, md5: "22222222222222222222222222222222", url: "https://data.gdeltproject.org/gdeltv2/fixture.mentions.CSV.zip", batchId: "20260827063000" },
      { kind: "gkg", compressedBytes: 100, md5: "33333333333333333333333333333333", url: "https://data.gdeltproject.org/gdeltv2/fixture.gkg.csv.zip", batchId: "20260827063000" },
    ],
  },
  gates: {
    mentionType: 1,
    inRawText: true,
    minimumConfidence: 80,
    requireActionGeoCoordinates: true,
    requireGkgPageTitle: true,
  },
  limits: {
    lastUpdateBytes: 64_000,
    compressedBytes: { events: 1_000, mentions: 1_000, gkg: 1_000 },
    decompressedBytes: { events: 10_000, mentions: 10_000, gkg: 10_000 },
    rows: { events: 10, mentions: 10, gkg: 10 },
    maxClusters: 10,
    maxArticlesPerCluster: 10,
  },
  statistics: {
    rows: {
      events: { rowsSeen: 2, rowsAccepted: 2, rowsMalformed: 0, hitRowCap: false },
      mentions: { rowsSeen: 2, rowsAccepted: 2, rowsMalformed: 0, hitRowCap: false },
      gkg: { rowsSeen: 2, rowsAccepted: 2, rowsMalformed: 0, hitRowCap: false },
    },
    eligibleMentions: 2,
    joinedMentions: 2,
    droppedWithoutGkg: 0,
    droppedWithoutTitle: 0,
    clustersBeforeCap: 2,
    clustersEmitted: 2,
    articlesEmitted: 2,
  },
  health: {
    status: "healthy",
    fetchedAt: generatedAt,
    sourceCount: 3,
    successfulSourceCount: 3,
    warnings: [],
  },
  clusters: [
    cluster(
      "1320000001",
      "article_fixture_1",
      "https://wire-one.example/fixture-city-flood",
      "Wire One",
      "City's flood response — live",
      0.92,
    ),
    cluster(
      "1320000002",
      "article_fixture_2",
      "https://wire-two.example/fixture-city-flood",
      "Wire Two",
      "CITY’S flood response: live",
      0.88,
    ),
  ],
  validationIssues: [],
};
