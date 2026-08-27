import { describe, expect, it, vi } from "vitest";
import { AtlasApiError, HttpNewsIntelligenceClient, intelligenceSnapshotSchema } from "./api";

const unknown = (reason: string) => ({
  status: "unknown" as const,
  value: null,
  confidence: null,
  method: "unavailable" as const,
  evidence: [] as [],
  reason,
});

const fixture = {
  generatedAt: "2026-08-27T01:00:00.000Z",
  window: "24h",
  health: {
    status: "healthy",
    lastSuccessfulIngestionAt: "2026-08-27T00:58:00.000Z",
    ingestionLagSeconds: 120,
    activeSourceCount: 8,
    regionCount: 1,
    message: null,
  },
  regions: [
    {
      id: "region-test",
      label: "Test region",
      latitude: 10,
      longitude: 20,
      rawProminence: 12,
      normalizedProminence: 0.65,
      storyCount: 1,
      sourceCount: 2,
      topClusterIds: ["cluster-test"],
    },
  ],
  clusters: [
    {
      id: "cluster-test",
      canonicalTitle: "Test-only verified story",
      summary: "A deterministic fixture used only by automated tests.",
      eventLocations: [
        {
          id: "location-test",
          label: "Test location",
          countryCode: "TS",
          regionId: "region-test",
          locationType: "city",
          latitude: 10,
          longitude: 20,
          confidence: 0.9,
          evidenceCount: 2,
          isPrimary: true,
        },
      ],
      primaryRegionId: "region-test",
      rawProminence: 12,
      normalizedProminence: 0.65,
      prominence: {
        basis: "event_location",
        caveat: "Event geography, not audience reach.",
        byRegion: [{
          regionId: "region-test",
          regionLabel: "Test region",
          raw: { articleCount: 12, outletCount: 2 },
          normalized: {
            score: 0.65,
            articleShare: 0.6,
            outletShare: 0.5,
            sourceNormalizedShare: 0.7,
            denominators: { regionalArticleMemberships: 20, regionalOutlets: 4 },
            formulaVersion: "atlas-regional-prominence-v1",
          },
        }],
      },
      coverageHeat: {
        status: "unavailable",
        basis: "editorial_market",
        markets: [],
        reason: "No evidence-backed primary editorial-market metadata.",
      },
      articleCount: 2,
      publisherCount: 2,
      languageCount: 1,
      firstObservedAt: "2026-08-27T00:00:00.000Z",
      lastObservedAt: "2026-08-27T00:58:00.000Z",
      membershipConfidence: 0.88,
      signals: {
        conflict: {
          status: "not_assessed",
          confidence: null,
          method: "unavailable",
          summary: null,
          evidence: [],
          reason: "No evidence-backed claims.",
        },
        omission: {
          status: "not_assessed",
          confidence: null,
          method: "unavailable",
          summary: null,
          evidence: [],
          reason: "No regional baseline.",
        },
      },
      sources: [
        {
          id: "source-test",
          publisher: "Fixture Publisher",
          publisherDomain: "fixture.example",
          publisherOrigin: {
            status: "observed",
            value: { regionCode: "PO", label: "Publisher test origin" },
            confidence: 0.8,
            method: "publisher_registry",
            evidence: [],
            reason: null,
          },
          editorialMarket: unknown("No verified primary editorial market."),
          framing: unknown("No framing analysis."),
          tone: unknown("No tone analysis."),
          articleTitle: "Fixture article",
          url: "https://example.com/test-fixture",
          language: "en",
          publishedAt: "2026-08-27T00:10:00.000Z",
          retrievedAt: "2026-08-27T00:20:00.000Z",
          excerpt: null,
          claimPosition: "reports",
        },
      ],
    },
  ],
} as const;

describe("HttpNewsIntelligenceClient", () => {
  it("preserves the browser global as the default fetch receiver", async () => {
    const originalFetch = globalThis.fetch;
    const receiverCheckingFetch = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }));
    });
    globalThis.fetch = receiverCheckingFetch as typeof fetch;

    try {
      const client = new HttpNewsIntelligenceClient({ baseUrl: "https://atlas.example" });
      await client.getSnapshot({ window: "24h", prominence: "normalized" });
      expect(receiverCheckingFetch).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("requests the selected window and prominence and validates the response", async () => {
    const fixtureValidation = intelligenceSnapshotSchema.safeParse(fixture);
    expect(fixtureValidation.success, fixtureValidation.error?.message).toBe(true);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new HttpNewsIntelligenceClient({
      baseUrl: "https://atlas.example",
      fetchImpl,
    });

    const result = await client.getSnapshot({ window: "24h", prominence: "normalized" });

    expect(result.clusters[0].eventLocations[0].label).toBe("Test location");
    const requestedUrl = fetchImpl.mock.calls[0][0] as URL;
    expect(requestedUrl.pathname).toBe("/api/v1/intelligence");
    expect(requestedUrl.searchParams.get("window")).toBe("24h");
    expect(requestedUrl.searchParams.get("prominence")).toBe("normalized");
  });

  it("refuses malformed live records", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...fixture, clusters: [{ id: "missing-truth-fields" }] }), {
        status: 200,
      }),
    );
    const client = new HttpNewsIntelligenceClient({ baseUrl: "https://atlas.example", fetchImpl });

    await expect(client.getSnapshot({ window: "6h", prominence: "raw" })).rejects.toMatchObject({
      kind: "invalid-response",
    } satisfies Partial<AtlasApiError>);
  });

  it("requires a source editorial-market assessment", () => {
    const source = fixture.clusters[0].sources[0];
    const legacyPayload = {
      ...fixture,
      clusters: [{
        ...fixture.clusters[0],
        sources: [{
          ...source,
          editorialMarket: undefined,
        }],
      }],
    };

    expect(intelligenceSnapshotSchema.safeParse(legacyPayload).success).toBe(false);
  });

  it("rejects editorial-market heat that is not backed by a matching source assessment", () => {
    const unbackedHeatPayload = {
      ...fixture,
      clusters: [{
        ...fixture.clusters[0],
        coverageHeat: {
          status: "observed" as const,
          basis: "editorial_market" as const,
          markets: [{
            regionCode: "PO",
            label: "Publisher test origin",
            rawArticleCount: 1,
            uniquePublisherCount: 1,
            sourceNormalizedShare: 1,
            coordinates: {
              latitude: 10,
              longitude: 20,
              confidence: 0.9,
              method: "documented_outlet_market" as const,
              evidence: [{
                kind: "outlet_market_documentation" as const,
                url: "https://fixture.example/about",
                quote: "Fixture Publisher serves the test market.",
              }],
            },
          }],
          reason: null,
        },
      }],
    };

    expect(intelligenceSnapshotSchema.safeParse(unbackedHeatPayload).success).toBe(false);
  });

  it("rejects an editorial-market method without its required evidence kinds", () => {
    const mismatchedMethodPayload = {
      ...fixture,
      clusters: [{
        ...fixture.clusters[0],
        sources: [{
          ...fixture.clusters[0].sources[0],
          editorialMarket: {
            status: "observed" as const,
            value: { regionCode: "EM", label: "Primary test market" },
            confidence: 0.75,
            method: "language_and_publisher_location" as const,
            evidence: [{
              kind: "outlet_language" as const,
              url: "https://fixture.example/article",
              quote: "The article is written in the market language.",
            }],
            reason: null,
          },
        }],
      }],
    };

    expect(intelligenceSnapshotSchema.safeParse(mismatchedMethodPayload).success).toBe(false);
  });

  it("accepts heat derived from the same observed source editorial market", () => {
    const evidence = [{
      kind: "outlet_market_documentation" as const,
      url: "https://fixture.example/about",
      quote: "Fixture Publisher serves the test market.",
    }];
    const observedPayload = {
      ...fixture,
      clusters: [{
        ...fixture.clusters[0],
        coverageHeat: {
          status: "observed" as const,
          basis: "editorial_market" as const,
          markets: [{
            regionCode: "EM",
            label: "Primary test market",
            rawArticleCount: 1,
            uniquePublisherCount: 1,
            sourceNormalizedShare: 1,
            coordinates: {
              latitude: 11,
              longitude: 21,
              confidence: 0.91,
              method: "documented_outlet_market" as const,
              evidence,
            },
          }],
          reason: null,
        },
        sources: [{
          ...fixture.clusters[0].sources[0],
          editorialMarket: {
            status: "observed" as const,
            value: {
              regionCode: "EM",
              label: "Primary test market",
              coordinates: { latitude: 11, longitude: 21 },
            },
            confidence: 0.91,
            method: "documented_outlet_market" as const,
            evidence,
            reason: null,
          },
        }],
      }],
    };

    expect(intelligenceSnapshotSchema.safeParse(observedPayload).success).toBe(true);
  });

  it("reports a missing endpoint as unavailable without fabricating data", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const client = new HttpNewsIntelligenceClient({ baseUrl: "https://atlas.example", fetchImpl });

    await expect(client.getSnapshot({ window: "7d", prominence: "raw" })).rejects.toMatchObject({
      kind: "unavailable",
      status: 404,
    } satisfies Partial<AtlasApiError>);
  });
});
