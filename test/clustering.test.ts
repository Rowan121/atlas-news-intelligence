import { describe, expect, it } from "vitest";
import { clusterArticles, jaccard, titleTokens } from "../src/clustering/engine.js";
import { makeArticle, parisA, parisB, tokyoA, tokyoB, tokyoLocation } from "./fixtures/articles.js";

describe("explainable clustering", () => {
  it("computes normalized title-token Jaccard similarity", () => {
    expect(jaccard(titleTokens("The quake in Tokyo"), titleTokens("Tokyo quake update"))).toBeCloseTo(2 / 3);
  });

  it("groups related coverage from different outlets", async () => {
    const clusters = await clusterArticles([tokyoA, tokyoB]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.articles).toHaveLength(2);
  });

  it("keeps unrelated stories separate", async () => {
    const clusters = await clusterArticles([tokyoA, parisA]);
    expect(clusters).toHaveLength(2);
  });

  it("deduplicates canonical URLs before clustering", async () => {
    const duplicate = { ...tokyoA, id: "duplicate", title: "Syndicated title" };
    const clusters = await clusterArticles([tokyoA, duplicate]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.articles).toHaveLength(1);
  });

  it("records the strongest matched article and component reasons", async () => {
    const clusters = await clusterArticles([tokyoA, tokyoB], { locations: [tokyoLocation] });
    const joined = clusters[0]!.memberships.find((membership) => membership.articleId === tokyoB.id)!;
    expect(joined.evidence.matchedArticleId).toBe(tokyoA.id);
    expect(joined.evidence.components.location.score).toBe(1);
    expect(joined.evidence.reasons.join(" ")).toMatch(/title|location/);
  });

  it("uses an optional semantic signal without inventing it when absent", async () => {
    const left = makeArticle({
      id: "semantic_a",
      url: "https://one.example/a",
      title: "Markets digest policy",
    });
    const right = makeArticle({
      id: "semantic_b",
      url: "https://two.example/b",
      title: "Central bank decision",
    });
    const without = await clusterArticles([left, right], { threshold: 0.3 });
    const withSemantic = await clusterArticles([left, right], {
      threshold: 0.3,
      semantic: { similarity: async () => 0.98 },
    });
    expect(without).toHaveLength(2);
    expect(withSemantic).toHaveLength(1);
    expect(withSemantic[0]!.memberships[1]!.evidence.components.semantic.available).toBe(true);
  });

  it("forms two coherent clusters independent of input ordering", async () => {
    const forward = await clusterArticles([tokyoA, tokyoB, parisA, parisB]);
    const reverse = await clusterArticles([parisB, parisA, tokyoB, tokyoA]);
    expect(forward.map((cluster) => cluster.id).sort()).toEqual(reverse.map((cluster) => cluster.id).sort());
    expect(forward.map((cluster) => cluster.articles.length).sort()).toEqual([2, 2]);
  });
});
