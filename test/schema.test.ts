import { describe, expect, it } from "vitest";
import { assertStoryCluster, isHttpUrl, isIsoDateTime, validateStoryCluster } from "../src/schema/types.js";
import { makeArticle, makeValidCluster, tokyoA, tokyoLocation } from "./fixtures/articles.js";

describe("story-cluster schema", () => {
  it("accepts a valid evidence-backed cluster", () => {
    expect(validateStoryCluster(makeValidCluster())).toEqual([]);
  });

  it("assertion reports validation paths", () => {
    const cluster = makeValidCluster({ canonicalTitle: "" });
    expect(() => assertStoryCluster(cluster)).toThrow(/canonicalTitle/);
  });

  it("rejects duplicate canonical URLs", () => {
    const duplicate = { ...tokyoA, id: "another_id" };
    const cluster = makeValidCluster({ articles: [tokyoA, duplicate] });
    expect(validateStoryCluster(cluster).map((issue) => issue.code)).toContain("duplicate_canonical_url");
  });

  it("rejects event evidence from an unknown article", () => {
    const location = {
      ...tokyoLocation,
      evidence: [{ ...tokyoLocation.evidence[0]!, articleId: "missing" }],
    };
    expect(validateStoryCluster(makeValidCluster({ eventLocations: [location] })).map((issue) => issue.code)).toContain(
      "unknown_evidence_article",
    );
  });

  it("forbids publisher metadata as event-location evidence", () => {
    const cluster = structuredClone(makeValidCluster());
    (cluster.eventLocations[0]!.evidence[0]! as unknown as { method: string }).method = "publisher_metadata";
    expect(validateStoryCluster(cluster).map((issue) => issue.code)).toContain(
      "invalid_event_location_evidence_method",
    );
  });

  it("keeps publisher origin separate from the primary editorial market", () => {
    const article = makeArticle({
      id: "origin-separated",
      url: "https://origin.example/story",
      title: "Test-only source geography",
      publisher: {
        id: "publisher-origin",
        name: "Origin Publisher",
        domain: "origin.example",
        origin: {
          countryName: "Originland",
          countryCode: "OR",
          confidence: 0.8,
          evidenceSource: "publisher_registry",
        },
      },
    });
    expect(article.sameStory.publisherOrigin).toMatchObject({
      status: "observed",
      value: { regionCode: "OR", label: "Originland" },
    });
    expect(article.sameStory.editorialMarket).toMatchObject({ status: "unknown", value: null });
    expect(article.sameStory).not.toHaveProperty("audienceExposure");
  });

  it("requires direct evidence for a documented primary editorial market", () => {
    const cluster = structuredClone(makeValidCluster());
    cluster.articles[0]!.sameStory.editorialMarket = {
      status: "observed",
      value: { regionCode: "JP", label: "Japan" },
      confidence: 0.8,
      method: "documented_outlet_market",
      evidence: [],
      reason: null,
    };
    expect(validateStoryCluster(cluster).map((issue) => issue.code)).toContain("missing_assessment_evidence");
    expect(validateStoryCluster(cluster).map((issue) => issue.code)).toContain(
      "editorial_market_method_evidence_mismatch",
    );
  });

  it("requires both language and publisher-location evidence for a triangulated editorial market", () => {
    const cluster = structuredClone(makeValidCluster());
    cluster.articles[0]!.sameStory.editorialMarket = {
      status: "observed",
      value: { regionCode: "JP", label: "Japan" },
      confidence: 0.7,
      method: "language_and_publisher_location",
      evidence: [{
        kind: "outlet_language",
        articleId: cluster.articles[0]!.id,
        url: cluster.articles[0]!.url,
        quote: "Japanese-language edition",
      }],
      reason: null,
    };
    expect(validateStoryCluster(cluster).map((issue) => issue.code)).toContain(
      "editorial_market_method_evidence_mismatch",
    );
  });

  it("requires an explicit event-location prominence basis", () => {
    const cluster = structuredClone(makeValidCluster());
    (cluster.prominence[0]! as { basis: string }).basis = "audience";
    expect(validateStoryCluster(cluster).map((issue) => issue.code)).toContain("invalid_prominence_basis");
  });

  it("rejects out-of-range coordinates and confidence", () => {
    const location = { ...tokyoLocation, confidence: 1.2, coordinates: { latitude: 91, longitude: -181 } };
    const codes = validateStoryCluster(makeValidCluster({ eventLocations: [location] })).map((issue) => issue.code);
    expect(codes).toContain("invalid_confidence");
    expect(codes).toContain("invalid_latitude");
    expect(codes).toContain("invalid_longitude");
  });

  it("requires evidence for extracted claims", () => {
    const cluster = makeValidCluster({
      claims: [{ id: "claim_1", text: "A claim", polarity: "asserts", confidence: 0.7, evidence: [] }],
    });
    expect(validateStoryCluster(cluster).map((issue) => issue.code)).toContain("missing_claim_evidence");
  });

  it("recognizes strict UTC timestamps and HTTP URLs", () => {
    expect(isIsoDateTime("2026-08-27T01:00:00.000Z")).toBe(true);
    expect(isIsoDateTime("August 27")).toBe(false);
    expect(isHttpUrl("https://example.com/story")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
  });
});
