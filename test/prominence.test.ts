import { describe, expect, it } from "vitest";
import type { ArticleClusterDraft } from "../src/clustering/engine.js";
import { computeRegionalProminence } from "../src/prominence/metrics.js";
import { makeArticle, parisA, tokyoA, tokyoB, tokyoLocation } from "./fixtures/articles.js";

function draft(id: string, articles: typeof tokyoA[], locations = [tokyoLocation]): ArticleClusterDraft {
  return {
    id,
    canonicalTitle: articles[0]!.title,
    articles,
    memberships: [],
    eventLocations: locations,
    firstObservedAt: articles[0]!.publishedAt!,
    lastObservedAt: articles.at(-1)!.publishedAt!,
  };
}

describe("regional prominence", () => {
  it("reports raw article and unique-outlet counts", () => {
    const metrics = computeRegionalProminence([draft("tokyo", [tokyoA, tokyoB])]).get("tokyo")!;
    expect(metrics[0]!.raw).toEqual({ articleCount: 2, outletCount: 2 });
  });

  it("includes explainable denominators", () => {
    const metrics = computeRegionalProminence([draft("tokyo", [tokyoA, tokyoB])]).get("tokyo")!;
    expect(metrics[0]!.normalized.denominators).toEqual({ regionalArticleMemberships: 2, regionalOutlets: 2 });
    expect(metrics[0]!.normalized.score).toBe(1);
  });

  it("gives outlets equal weight in source-normalized share", () => {
    const prolific2 = makeArticle({
      ...tokyoA,
      id: "prolific_2",
      url: "https://alpha.example/world/tokyo-earthquake-2",
    });
    const prolific3 = makeArticle({
      ...tokyoA,
      id: "prolific_3",
      url: "https://alpha.example/world/tokyo-earthquake-3",
    });
    const clusters = [draft("prolific", [tokyoA, prolific2, prolific3]), draft("single", [tokyoB])];
    const result = computeRegionalProminence(clusters);
    expect(result.get("prolific")![0]!.normalized.sourceNormalizedShare).toBeCloseTo(0.5);
    expect(result.get("single")![0]!.normalized.sourceNormalizedShare).toBeCloseTo(0.5);
    expect(result.get("prolific")![0]!.normalized.articleShare).toBeCloseTo(0.75);
  });

  it("does not assign prominence to an ungeolocated cluster", () => {
    const result = computeRegionalProminence([draft("unlocated", [parisA], [])]);
    expect(result.get("unlocated")).toEqual([]);
  });
});
