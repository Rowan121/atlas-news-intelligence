import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { D1TruthStore, parseSameStoryContext } from "../storage/d1";
import { expect } from "./expect";

function sqliteD1(database: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values;
          return statement;
        },
        async all<T>() {
          const results = database.prepare(sql).all(...bindings as never[]) as T[];
          return { success: true, results, meta: {} };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe("D1 truth-store region filtering", () => {
  it("matches every evidenced event region without treating publisher origin as an event", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec(readFileSync(new URL("../../schema/schema.sql", import.meta.url), "utf8"));
    database.exec(`
      INSERT INTO pipeline_runs (
        run_id, source, status, input_fingerprint, started_at, completed_at,
        source_watermark_at, records_seen, records_upserted, retryable, updated_at
      ) VALUES (
        'run-nepal', 'gdelt', 'succeeded', 'fixture', '2026-08-27T06:00:00.000Z',
        '2026-08-27T06:01:00.000Z', '2026-08-27T06:00:00.000Z', 1, 1, 0,
        '2026-08-27T06:01:00.000Z'
      );
      INSERT INTO story_clusters (
        cluster_id, ingestion_run_id, canonical_title, primary_region_code,
        first_observed_at, last_observed_at, raw_article_count,
        unique_publisher_count, normalized_prominence, cluster_confidence,
        membership_explanation, updated_at
      ) VALUES (
        'nepal-flood', 'run-nepal', 'Nepal flood', 'IN',
        '2026-08-27T06:00:00.000Z', '2026-08-27T06:01:00.000Z', 2, 2,
        0.8, 0.9, 'same cited event', '2026-08-27T06:01:00.000Z'
      );
      INSERT INTO articles (
        article_id, ingestion_run_id, cluster_id, canonical_url, source_url, title,
        publisher_name, publisher_domain, language, published_at, retrieved_at,
        membership_confidence, membership_evidence, same_story_json,
        content_fingerprint, updated_at
      ) VALUES (
        'article-nepal', 'run-nepal', 'nepal-flood', 'https://example.invalid/nepal',
        'https://example.invalid/nepal', 'Nepal flood', 'Fixture Wire',
        'example.invalid', 'en', '2026-08-27T06:00:00.000Z',
        '2026-08-27T06:01:00.000Z', 0.9, 'fixture', '{}', 'fixture',
        '2026-08-27T06:01:00.000Z'
      );
      INSERT INTO story_locations (
        location_id, ingestion_run_id, cluster_id, location_type, location_granularity,
        label, latitude, longitude, country_code, region_code, confidence,
        evidence_article_id, evidence_quote, updated_at
      ) VALUES
        ('event-in', 'run-nepal', 'nepal-flood', 'event', 'country', 'India', 20, 78,
         'IN', 'IN', 0.9, 'article-nepal', 'Cited India event location', '2026-08-27T06:01:00.000Z'),
        ('event-ch', 'run-nepal', 'nepal-flood', 'event', 'country', 'China', 35, 103,
         'CN', 'CH', 0.8, 'article-nepal', 'Cited China event location', '2026-08-27T06:01:00.000Z'),
        ('origin-us', 'run-nepal', 'nepal-flood', 'publisher_origin', 'country', 'United States', 38, -97,
         'US', 'US', 1, 'article-nepal', 'Publisher registry origin', '2026-08-27T06:01:00.000Z');
      INSERT INTO story_location_evidence (
        location_evidence_id, ingestion_run_id, location_id, article_id, source_url,
        evidence_quote, evidence_method, updated_at
      ) VALUES
        ('evidence-in', 'run-nepal', 'event-in', 'article-nepal', 'https://example.invalid/nepal',
         'Cited India event location', 'provider_event_geotag', '2026-08-27T06:01:00.000Z'),
        ('evidence-ch', 'run-nepal', 'event-ch', 'article-nepal', 'https://example.invalid/nepal',
         'Cited China event location', 'provider_event_geotag', '2026-08-27T06:01:00.000Z'),
        ('evidence-us', 'run-nepal', 'origin-us', 'article-nepal', 'https://example.invalid/nepal',
         'Publisher registry origin', 'manual_confirmed', '2026-08-27T06:01:00.000Z');
    `);

    const store = new D1TruthStore(sqliteD1(database));
    const query = { metric: "normalized" as const, limit: 10 };
    expect((await store.listStories({ ...query, region: "IN" }, new Date(), 1800)).map((item) => item.cluster_id))
      .toEqual(["nepal-flood"]);
    expect((await store.listStories({ ...query, region: "CH" }, new Date(), 1800)).map((item) => item.cluster_id))
      .toEqual(["nepal-flood"]);
    expect(await store.listStories({ ...query, region: "US" }, new Date(), 1800)).toEqual([]);
    database.close();
  });
});

describe("D1 SAME-STORY context normalization", () => {
  const unknown = (reason: string) => ({
    status: "unknown",
    value: null,
    confidence: null,
    method: "unavailable",
    evidence: [],
    reason,
  });

  it("normalizes a legacy row to an explicit unknown editorial market without reinterpreting plural fields", () => {
    const context = parseSameStoryContext(JSON.stringify({
      publisherOrigin: unknown("No origin."),
      coverageMarkets: {
        status: "observed",
        value: [{ regionCode: "WRONG", label: "Must not be reused" }],
        confidence: 1,
        method: "manual_confirmed",
        evidence: [{ url: "https://example.invalid/legacy", quote: "Legacy field." }],
        reason: null,
      },
      audienceExposure: {
        status: "observed",
        value: [{ regionCode: "ALSO-WRONG", label: "Must not be reused" }],
        confidence: 1,
        method: "manual_confirmed",
        evidence: [{ url: "https://example.invalid/legacy", quote: "Legacy field." }],
        reason: null,
      },
      framing: unknown("No framing."),
      tone: unknown("No tone."),
    }));

    expect(context).toEqual({
      publisherOrigin: unknown("No origin."),
      editorialMarket: unknown(
        "Legacy row has no verified primary editorial-market assessment; superseded fields are not reinterpreted.",
      ),
      framing: unknown("No framing."),
      tone: unknown("No tone."),
    });
  });

  it("preserves a valid singular evidence-backed editorial market", () => {
    const context = parseSameStoryContext(JSON.stringify({
      publisherOrigin: unknown("No origin."),
      editorialMarket: {
        status: "observed",
        value: {
          regionCode: "US-NM-ABQ",
          label: "Albuquerque metropolitan area, New Mexico",
          coordinates: { latitude: 35.0844, longitude: -106.6504 },
        },
        confidence: 0.99,
        method: "documented_outlet_market",
        evidence: [{
          kind: "outlet_market_documentation",
          url: "https://example.invalid/about",
          quote: "The outlet documents its Albuquerque editorial market.",
          articleId: "article-1",
        }],
        reason: null,
      },
      framing: unknown("No framing."),
      tone: unknown("No tone."),
    }));

    expect(context.editorialMarket).toMatchObject({
      status: "observed",
      value: { regionCode: "US-NM-ABQ", coordinates: { latitude: 35.0844, longitude: -106.6504 } },
      confidence: 0.99,
      method: "documented_outlet_market",
      evidence: [{ kind: "outlet_market_documentation", articleId: "article-1" }],
    });
  });
});
