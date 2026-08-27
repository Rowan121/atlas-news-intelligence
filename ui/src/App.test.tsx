import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import type { IntelligenceSnapshot, NewsIntelligenceClient } from "./types";

vi.mock("./GlobeMap", () => ({
  GlobeMap: ({ coverageHeatPoints }: { coverageHeatPoints: unknown[] }) => (
    <div data-testid="globe-map">{coverageHeatPoints.length} coverage heat points</div>
  ),
}));

const unknownAssessment = (reason: string) => ({
  status: "unknown" as const,
  value: null,
  confidence: null,
  method: "unavailable" as const,
  evidence: [] as [],
  reason,
});

const notAssessedSignal = (reason: string) => ({
  status: "not_assessed" as const,
  confidence: null,
  method: "unavailable" as const,
  summary: null,
  evidence: [],
  reason,
});

const emptySnapshot: IntelligenceSnapshot = {
  generatedAt: "2026-08-27T01:00:00.000Z",
  window: "24h",
  health: {
    status: "healthy",
    lastSuccessfulIngestionAt: "2026-08-27T01:00:00.000Z",
    ingestionLagSeconds: 0,
    activeSourceCount: 0,
    regionCount: 0,
    message: null,
  },
  regions: [],
  clusters: [],
};

const comparisonSnapshot: IntelligenceSnapshot = {
  ...emptySnapshot,
  health: {
    ...emptySnapshot.health,
    activeSourceCount: 2,
    regionCount: 1,
  },
  regions: [
    {
      id: "AU",
      label: "Australia",
      latitude: -25.3,
      longitude: 133.8,
      rawProminence: 2,
      normalizedProminence: 0.8,
      storyCount: 1,
      sourceCount: 2,
      topClusterIds: ["story-1"],
    },
  ],
  clusters: [
    {
      id: "story-1",
      canonicalTitle: "Major flood response begins in Queensland",
      summary: "Officials and residents respond after severe flooding.",
      eventLocations: [
        {
          id: "location-1",
          label: "Queensland, Australia",
          countryCode: "AU",
          regionId: "AU",
          locationType: "admin1",
          latitude: -22.5,
          longitude: 144.5,
          confidence: 0.97,
          evidenceCount: 2,
          isPrimary: true,
        },
      ],
      primaryRegionId: "AU",
      rawProminence: 2,
      normalizedProminence: 0.8,
      prominence: {
        basis: "event_location",
        caveat: "Event geography, not audience reach.",
        byRegion: [{
          regionId: "AU",
          regionLabel: "Queensland, Australia",
          raw: { articleCount: 2, outletCount: 2 },
          normalized: {
            score: 0.8,
            articleShare: 1,
            outletShare: 1,
            sourceNormalizedShare: 1,
            denominators: { regionalArticleMemberships: 2, regionalOutlets: 2 },
            formulaVersion: "atlas-regional-prominence-v1",
          },
        }],
      },
      coverageHeat: {
        status: "unavailable",
        basis: "coverage_market",
        markets: [],
        reason: "No evidence-backed coverage-market metadata.",
      },
      articleCount: 2,
      publisherCount: 2,
      languageCount: 1,
      firstObservedAt: "2026-08-27T00:00:00.000Z",
      lastObservedAt: "2026-08-27T01:00:00.000Z",
      membershipConfidence: 0.91,
      signals: {
        conflict: notAssessedSignal("No comparable claims."),
        omission: notAssessedSignal("No regional baseline."),
      },
      sources: [
        {
          id: "source-1",
          publisher: "example.com",
          publisherDomain: "example.com",
          publisherOrigin: unknownAssessment("Publisher origin unavailable."),
          coverageMarkets: unknownAssessment("Coverage market unavailable."),
          audienceExposure: unknownAssessment("Audience exposure unavailable."),
          framing: unknownAssessment("Framing unavailable."),
          tone: unknownAssessment("Tone unavailable."),
          articleTitle: "Queensland begins recovery after flood",
          url: "https://example.com/flood",
          language: "en",
          publishedAt: "2026-08-27T01:00:00.000Z",
          retrievedAt: "2026-08-27T01:01:00.000Z",
          excerpt: "Emergency crews began recovery work.",
          claimPosition: "reports",
        },
        {
          id: "source-2",
          publisher: "another.example",
          publisherDomain: "another.example",
          publisherOrigin: unknownAssessment("Publisher origin unavailable."),
          coverageMarkets: unknownAssessment("Coverage market unavailable."),
          audienceExposure: unknownAssessment("Audience exposure unavailable."),
          framing: unknownAssessment("Framing unavailable."),
          tone: unknownAssessment("Tone unavailable."),
          articleTitle: "Communities assess Queensland flood damage",
          url: "https://another.example/flood",
          language: "en",
          publishedAt: "2026-08-27T00:30:00.000Z",
          retrievedAt: "2026-08-27T01:01:00.000Z",
          excerpt: "Residents described the damage.",
          claimPosition: "reports",
        },
      ],
    },
  ],
};

const observedEvidence = [{
  articleId: "source-1",
  url: "https://example.com/flood",
  quote: "Emergency crews began recovery work.",
}];

const observedComparisonSnapshot: IntelligenceSnapshot = {
  ...comparisonSnapshot,
  clusters: [{
    ...comparisonSnapshot.clusters[0]!,
    coverageHeat: {
      status: "observed",
      basis: "coverage_market",
      markets: [{
        regionCode: "AU",
        label: "Australia",
        rawArticleCount: 2,
        uniquePublisherCount: 2,
        sourceNormalizedShare: 1,
        coordinates: {
          latitude: -25.3,
          longitude: 133.8,
          confidence: 0.93,
          method: "manual_confirmed",
          evidence: observedEvidence,
        },
      }],
      reason: null,
    },
    sources: comparisonSnapshot.clusters[0]!.sources.map((source, index) => ({
      ...source,
      coverageMarkets: {
        status: "observed" as const,
        value: [{ regionCode: "AU", label: "Australia", coordinates: { latitude: -25.3, longitude: 133.8 } }],
        confidence: 0.93,
        method: "manual_confirmed" as const,
        evidence: observedEvidence,
        reason: null,
      },
      framing: {
        status: "observed" as const,
        value: index === 0 ? "straight_report" as const : "supports" as const,
        confidence: 0.82,
        method: "manual_confirmed" as const,
        evidence: observedEvidence,
        reason: null,
      },
      tone: {
        status: "observed" as const,
        value: index === 0 ? "negative" as const : "positive" as const,
        confidence: 0.88,
        method: "manual_confirmed" as const,
        evidence: observedEvidence,
        reason: null,
      },
    })),
  }],
};

describe("App live-data states", () => {
  it("shows a truthful empty state and preserves the 24-hour default", async () => {
    const client: NewsIntelligenceClient = {
      getSnapshot: vi.fn().mockResolvedValue(emptySnapshot),
    };
    render(<App client={client} />);

    expect(screen.getByRole("button", { name: "24 hours" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Normalized" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("No eligible clusters in this window.")).toBeInTheDocument();
    expect(screen.queryByText(/sample story/i)).not.toBeInTheDocument();
  });

  it("changes the time-window query through the client contract", async () => {
    const getSnapshot = vi.fn().mockResolvedValue(emptySnapshot);
    const client: NewsIntelligenceClient = { getSnapshot };
    render(<App client={client} />);
    await screen.findByText("No eligible clusters in this window.");

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(getSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ window: "7d" })));
  });

  it("enters same-story comparison only after selection and returns to the event overview", async () => {
    const client: NewsIntelligenceClient = {
      getSnapshot: vi.fn().mockResolvedValue(comparisonSnapshot),
    };
    render(<App client={client} />);

    const story = await screen.findByRole("button", { name: /Major flood response begins in Queensland/i });
    expect(screen.getByRole("heading", { name: "What happened where" })).toBeInTheDocument();
    expect(screen.queryByText(/News stories like/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Tone not assessed")).not.toBeInTheDocument();

    fireEvent.click(story);

    expect(await screen.findByRole("heading", { name: /News stories like.*Major flood response/i })).toBeInTheDocument();
    expect(screen.getAllByText("Tone not assessed")).toHaveLength(2);
    expect(screen.getByText("Coverage heat withheld")).toBeInTheDocument();
    expect(screen.getByText("Queensland begins recovery after flood")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "What happened where" })).toBeInTheDocument();
    expect(screen.queryByText("Tone not assessed")).not.toBeInTheDocument();
  });

  it("renders evidenced tone and coverage heat only inside comparison mode", async () => {
    const client: NewsIntelligenceClient = {
      getSnapshot: vi.fn().mockResolvedValue(observedComparisonSnapshot),
    };
    render(<App client={client} />);

    expect(await screen.findByText("0 coverage heat points")).toBeInTheDocument();
    expect(screen.queryByText("negative · 88% confidence")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Major flood response begins in Queensland/i }));

    expect(await screen.findByText("1 coverage heat points")).toBeInTheDocument();
    expect(screen.getByText("negative · 88% confidence")).toBeInTheDocument();
    expect(screen.getByText("positive · 88% confidence")).toBeInTheDocument();
    expect(screen.queryByText("Coverage heat withheld")).not.toBeInTheDocument();
  });
});
