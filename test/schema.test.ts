import { describe, expect, it } from "vitest";
import { assertStoryCluster, isHttpUrl, isIsoDateTime, validateStoryCluster } from "../src/schema/types.js";
import { makeValidCluster, tokyoA, tokyoLocation } from "./fixtures/articles.js";

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
