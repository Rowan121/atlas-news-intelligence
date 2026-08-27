import { describe, expect, it, vi } from "vitest";
import { AtlasApiError, HttpNewsIntelligenceClient } from "./api";

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
        },
      ],
      primaryRegionId: "region-test",
      rawProminence: 12,
      normalizedProminence: 0.65,
      articleCount: 2,
      publisherCount: 2,
      languageCount: 1,
      firstObservedAt: "2026-08-27T00:00:00.000Z",
      lastObservedAt: "2026-08-27T00:58:00.000Z",
      membershipConfidence: 0.88,
      signals: {
        conflict: false,
        underreported: false,
        conflictSummary: null,
        undercoverageSummary: null,
      },
      sources: [
        {
          id: "source-test",
          publisher: "Fixture Publisher",
          publisherOrigin: {
            label: "Publisher test origin",
            countryCode: "PO",
            latitude: null,
            longitude: null,
          },
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

  it("reports a missing endpoint as unavailable without fabricating data", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const client = new HttpNewsIntelligenceClient({ baseUrl: "https://atlas.example", fetchImpl });

    await expect(client.getSnapshot({ window: "7d", prominence: "raw" })).rejects.toMatchObject({
      kind: "unavailable",
      status: 404,
    } satisfies Partial<AtlasApiError>);
  });
});
