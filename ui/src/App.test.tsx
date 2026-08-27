import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { IntelligenceSnapshot, NewsIntelligenceClient } from "./types";

vi.mock("./GlobeMap", () => ({
  GlobeMap: ({ coverageHeatPoints }: { coverageHeatPoints: unknown[] }) => (
    <div data-testid="globe-map">{coverageHeatPoints.length} coverage heat points</div>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    {
      id: "IN",
      label: "India",
      latitude: 20.6,
      longitude: 78.9,
      rawProminence: 1,
      normalizedProminence: 0.4,
      storyCount: 1,
      sourceCount: 1,
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
        {
          id: "location-2",
          label: "Assam, India",
          countryCode: "IN",
          regionId: "IN",
          locationType: "admin1",
          latitude: 26.2,
          longitude: 92.9,
          confidence: 0.91,
          evidenceCount: 1,
          isPrimary: false,
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
        basis: "editorial_market",
        markets: [],
        reason: "No evidence-backed primary editorial-market metadata.",
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
          editorialMarket: unknownAssessment("Primary editorial market unavailable."),
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
          editorialMarket: unknownAssessment("Primary editorial market unavailable."),
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

const editorialMarketEvidence = [{
  kind: "outlet_market_documentation" as const,
  articleId: "source-1",
  url: "https://example.com/about",
  quote: "Our Australian newsroom covers national and regional audiences.",
}];

const observedComparisonSnapshot: IntelligenceSnapshot = {
  ...comparisonSnapshot,
  clusters: [{
    ...comparisonSnapshot.clusters[0]!,
    coverageHeat: {
      status: "observed",
      basis: "editorial_market",
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
          evidence: editorialMarketEvidence,
        },
      }],
      reason: null,
    },
    sources: comparisonSnapshot.clusters[0]!.sources.map((source, index) => ({
      ...source,
      editorialMarket: {
        status: "observed" as const,
        value: { regionCode: "AU", label: "Australia", coordinates: { latitude: -25.3, longitude: 133.8 } },
        confidence: 0.93,
        method: "manual_confirmed" as const,
        evidence: editorialMarketEvidence,
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

    const storyList = story.closest(".story-list") as HTMLDivElement;
    storyList.scrollTop = 240;
    fireEvent.click(story);

    expect(await screen.findByRole("heading", { name: /News stories like.*Major flood response/i })).toBeInTheDocument();
    await waitFor(() => expect(storyList.scrollTop).toBe(0));
    expect(screen.getAllByText("Tone not assessed")).toHaveLength(2);
    expect(screen.getByText("Editorial-market heat withheld")).toBeInTheDocument();
    expect(screen.getByText("Queensland begins recovery after flood")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "What happened where" })).toBeInTheDocument();
    expect(screen.queryByText("Tone not assessed")).not.toBeInTheDocument();
  });

  it("keeps one story discoverable from every cited event location", async () => {
    const client: NewsIntelligenceClient = {
      getSnapshot: vi.fn().mockResolvedValue(comparisonSnapshot),
    };
    render(<App client={client} />);

    await screen.findByRole("button", { name: /Major flood response begins in Queensland/i });
    fireEvent.click(screen.getByRole("button", { name: /India\s*40%/ }));

    expect(screen.getAllByRole("button", { name: /Major flood response begins in Queensland/i })).toHaveLength(1);
    expect(screen.getByText(/Event: Assam, India/)).toBeInTheDocument();
  });

  it("renders evidenced tone and primary editorial-market heat only inside comparison mode", async () => {
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
    expect(screen.getAllByText("Primary editorial market")).toHaveLength(2);
    expect(screen.getAllByText("93% confidence · manual confirmed")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /outlet market documentation/i })).toHaveLength(2);
    expect(screen.queryByText("Editorial-market heat withheld")).not.toBeInTheDocument();
  });

  it("distinguishes outlet editions that share a parent publisher", async () => {
    const sharedNetworkSnapshot: IntelligenceSnapshot = {
      ...comparisonSnapshot,
      clusters: [{
        ...comparisonSnapshot.clusters[0]!,
        sources: comparisonSnapshot.clusters[0]!.sources.map((source, index) => ({
          ...source,
          publisher: "iheart.com",
          publisherDomain: index === 0 ? "1075theriver.iheart.com" : "q102.iheart.com",
        })),
      }],
    };
    const client: NewsIntelligenceClient = {
      getSnapshot: vi.fn().mockResolvedValue(sharedNetworkSnapshot),
    };
    render(<App client={client} />);

    fireEvent.click(await screen.findByRole("button", { name: /Major flood response begins in Queensland/i }));

    expect(await screen.findByText("1075theriver.iheart.com")).toBeInTheDocument();
    expect(screen.getByText("q102.iheart.com")).toBeInTheDocument();
    expect(screen.getAllByText(/Publisher\/network: iheart\.com/)).toHaveLength(2);
  });

  it("never turns event geography or publisher origin into editorial-market heat", async () => {
    const sourceWithoutEditorialMarket = {
      ...comparisonSnapshot.clusters[0]!.sources[0]!,
      publisherOrigin: {
        status: "observed" as const,
        value: {
          regionCode: "AU",
          label: "Australia",
          coordinates: { latitude: -25.3, longitude: 133.8 },
        },
        confidence: 0.98,
        method: "publisher_registry" as const,
        evidence: observedEvidence,
        reason: null,
      },
    };
    const snapshot: IntelligenceSnapshot = {
      ...observedComparisonSnapshot,
      clusters: [{
        ...observedComparisonSnapshot.clusters[0]!,
        sources: [sourceWithoutEditorialMarket],
      }],
    };
    const client: NewsIntelligenceClient = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
    };
    render(<App client={client} />);

    fireEvent.click(await screen.findByRole("button", { name: /Major flood response begins in Queensland/i }));

    expect(await screen.findByText("0 coverage heat points")).toBeInTheDocument();
    expect(screen.getByText("Editorial-market heat withheld")).toBeInTheDocument();
  });

  it("keeps the closed mobile panel inert and restores focus to its trigger", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      media: "(max-width: 760px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const client: NewsIntelligenceClient = {
      getSnapshot: vi.fn().mockResolvedValue(emptySnapshot),
    };
    const { container } = render(<App client={client} />);

    await screen.findByText("No eligible clusters in this window.");
    const trigger = screen.getByRole("button", { name: "Toggle story panel" });
    const panel = container.querySelector("#story-feed") as HTMLElement;
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");

    fireEvent.click(trigger);
    expect(panel).not.toHaveAttribute("aria-hidden");
    expect(panel).not.toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Close story panel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
  });

  it("keeps the visible tablet panel interactive above the 760px drawer breakpoint", async () => {
    const viewportWidth = 800;
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 760px)" && viewportWidth <= 760,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const client: NewsIntelligenceClient = {
      getSnapshot: vi.fn().mockResolvedValue(emptySnapshot),
    };
    const { container } = render(<App client={client} />);

    await screen.findByText("No eligible clusters in this window.");
    const panel = container.querySelector("#story-feed") as HTMLElement;
    expect(globalThis.matchMedia).toHaveBeenCalledWith("(max-width: 760px)");
    expect(panel).not.toHaveAttribute("aria-hidden");
    expect(panel).not.toHaveAttribute("inert");
  });
});
