import { describe, expect, it } from "vitest";
import { EvidenceBackedGeocoder } from "../src/geolocation/geocoder.js";
import { NewsTruthPipeline } from "../src/ingestion/pipeline.js";
import { selectTruthSlice, validateTruthSlice } from "../src/ingestion/truth-slice.js";
import type { NewsSourceClient, SourceQuery, SourceResult } from "../src/ingestion/sources.js";
import { FIXED_NOW, TestGazetteer, makeValidCluster, tokyoA, tokyoB } from "./fixtures/articles.js";

const clock = { now: () => new Date(FIXED_NOW) };

function source(provider: "gdelt" | "tavily", result: (query: SourceQuery) => SourceResult): NewsSourceClient {
  return { provider, search: async (query) => result(query) };
}

function success(provider: "gdelt" | "tavily", articles: typeof tokyoA[]): NewsSourceClient {
  return source(provider, (query) => ({
    ok: true,
    provider,
    query: query.query,
    startedAt: FIXED_NOW,
    finishedAt: FIXED_NOW,
    articles,
    warnings: [],
  }));
}

function pipeline(sources: NewsSourceClient[], gazetteer = new TestGazetteer()): NewsTruthPipeline {
  return new NewsTruthPipeline({
    sources,
    geocoder: new EvidenceBackedGeocoder(gazetteer),
    clock,
  });
}

describe("truth pipeline", () => {
  it("builds a real-schema cluster from two source clients", async () => {
    const result = await pipeline([success("gdelt", [tokyoA]), success("tavily", [tokyoB])]).run({
      query: "Tokyo earthquake",
    });
    expect(result.health.status).toBe("healthy");
    expect(result.articles).toHaveLength(2);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]!.eventLocations[0]!.countryCode).toBe("JP");
    expect(result.clusters[0]!.prominence[0]!.raw.outletCount).toBe(2);
    expect(result.validationIssues).toEqual([]);
  });

  it("uses a rolling 24-hour window by default", async () => {
    const result = await pipeline([success("gdelt", [tokyoA])]).run({ query: "Tokyo" });
    expect(result.window.hours).toBe(24);
    expect(Date.parse(result.window.to) - Date.parse(result.window.from)).toBe(24 * 3_600_000);
  });

  it("returns unavailable and no fabricated records when sources fail", async () => {
    const failed = source("gdelt", (query) => ({
      ok: false,
      provider: "gdelt",
      query: query.query,
      startedAt: FIXED_NOW,
      finishedAt: FIXED_NOW,
      kind: "timeout",
      message: "Timed out.",
    }));
    const result = await pipeline([failed]).run({ query: "earthquake" });
    expect(result.health.status).toBe("unavailable");
    expect(result.articles).toEqual([]);
    expect(result.clusters).toEqual([]);
    expect(result.health.warnings.join(" ")).toMatch(/No live articles/);
  });

  it("selects a current, geolocated, multi-outlet truth slice", async () => {
    const result = await pipeline([success("gdelt", [tokyoA]), success("tavily", [tokyoB])]).run({
      query: "Tokyo earthquake",
    });
    const truth = selectTruthSlice(result);
    expect(truth.ok).toBe(true);
    if (truth.ok) {
      expect(truth.evidence.outletCount).toBe(2);
      expect(truth.evidence.locationEvidenceCount).toBeGreaterThanOrEqual(2);
    }
  });

  it("refuses to claim a geolocation when no event text matches", async () => {
    const result = await pipeline([success("gdelt", [tokyoA]), success("tavily", [tokyoB])], new TestGazetteer([])).run({
      query: "Tokyo earthquake",
    });
    expect(selectTruthSlice(result)).toMatchObject({ ok: false, reason: "no_geolocated_cluster" });
  });

  it("refuses a single-outlet truth slice", async () => {
    const result = await pipeline([success("gdelt", [tokyoA])]).run({ query: "Tokyo earthquake" });
    expect(selectTruthSlice(result)).toMatchObject({ ok: false, reason: "no_multi_outlet_cluster" });
  });

  it("flags a cluster whose observations are outside the requested window", () => {
    const issues = validateTruthSlice(
      makeValidCluster(),
      "2026-08-28T00:00:00.000Z",
      "2026-08-29T00:00:00.000Z",
    );
    expect(issues.map((issue) => issue.code)).toContain("outside_window");
  });

  it("rejects invalid windows before calling an upstream", async () => {
    await expect(pipeline([success("gdelt", [tokyoA])]).run({ query: "x", windowHours: 0 })).rejects.toThrow(
      /windowHours/,
    );
  });
});
