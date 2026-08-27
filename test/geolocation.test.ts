import { describe, expect, it } from "vitest";
import { EvidenceBackedGeocoder } from "../src/geolocation/geocoder.js";
import { TestGazetteer, makeArticle, parisPlace, tokyoA, tokyoB, tokyoPlace } from "./fixtures/articles.js";

describe("evidence-backed event geolocation", () => {
  it("extracts a title mention with its article evidence", async () => {
    const locations = await new EvidenceBackedGeocoder(new TestGazetteer()).geocode([tokyoA]);
    expect(locations[0]!.id).toBe(tokyoPlace.id);
    expect(locations[0]!.evidence[0]!.articleId).toBe(tokyoA.id);
    expect(locations[0]!.evidence[0]!.quote).toContain("Tokyo");
    expect(locations[0]!.evidence[0]!.method).toBe("article_text");
  });

  it("corroboration by another outlet raises confidence", async () => {
    const geocoder = new EvidenceBackedGeocoder(new TestGazetteer());
    const one = await geocoder.geocode([tokyoA]);
    const two = await geocoder.geocode([tokyoA, tokyoB]);
    expect(two[0]!.confidence).toBeGreaterThan(one[0]!.confidence);
  });

  it("penalizes ambiguous aliases", async () => {
    const article = makeArticle({
      id: "paris_ambiguous",
      url: "https://example.net/paris",
      title: "Talks continue in Paris",
    });
    const certain = await new EvidenceBackedGeocoder(
      new TestGazetteer([{ place: parisPlace, aliases: ["Paris"], ambiguityCount: 1 }]),
    ).geocode([article]);
    const ambiguous = await new EvidenceBackedGeocoder(
      new TestGazetteer([{ place: parisPlace, aliases: ["Paris"], ambiguityCount: 4 }]),
    ).geocode([article]);
    expect(ambiguous[0]!.confidence).toBeLessThan(certain[0]!.confidence);
  });

  it("does not infer event location from publisher origin", async () => {
    const article = makeArticle({
      id: "origin_only",
      url: "https://tokyo-publisher.example/story",
      title: "Markets rise after central bank announcement",
      publisher: {
        id: "publisher_tokyo",
        name: "Tokyo Publisher",
        domain: "tokyo-publisher.example",
        origin: {
          countryName: "Japan",
          countryCode: "JP",
          confidence: 1,
          evidenceSource: "publisher_registry",
        },
      },
    });
    expect(await new EvidenceBackedGeocoder(new TestGazetteer()).geocode([article])).toEqual([]);
  });

  it("ignores malformed gazetteer spans", async () => {
    const locations = await new EvidenceBackedGeocoder({
      matchText: async () => [
        { place: tokyoPlace, start: -1, end: 4, matchedText: "Tokyo", ambiguityCount: 1 },
      ],
    }).geocode([tokyoA]);
    expect(locations).toEqual([]);
  });
});
