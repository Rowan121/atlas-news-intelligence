import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import type { IntelligenceSnapshot, NewsIntelligenceClient } from "./types";

vi.mock("./GlobeMap", () => ({
  GlobeMap: () => <div data-testid="globe-map" />,
}));

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
        },
      ],
      primaryRegionId: "AU",
      rawProminence: 2,
      normalizedProminence: 0.8,
      articleCount: 2,
      publisherCount: 2,
      languageCount: 1,
      firstObservedAt: "2026-08-27T00:00:00.000Z",
      lastObservedAt: "2026-08-27T01:00:00.000Z",
      membershipConfidence: 0.91,
      signals: {
        conflict: false,
        underreported: false,
        conflictSummary: null,
        undercoverageSummary: null,
      },
      sources: [
        {
          id: "source-1",
          publisher: "example.com",
          publisherOrigin: null,
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
          publisherOrigin: null,
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
    expect(screen.queryByText("Framing not assessed")).not.toBeInTheDocument();

    fireEvent.click(story);

    expect(await screen.findByRole("heading", { name: /News stories like.*Major flood response/i })).toBeInTheDocument();
    expect(screen.getAllByText("Framing not assessed")).toHaveLength(2);
    expect(screen.getByText("Coverage heat withheld")).toBeInTheDocument();
    expect(screen.getByText("Queensland begins recovery after flood")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "What happened where" })).toBeInTheDocument();
    expect(screen.queryByText("Framing not assessed")).not.toBeInTheDocument();
  });
});
