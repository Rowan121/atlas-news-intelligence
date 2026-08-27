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
});
