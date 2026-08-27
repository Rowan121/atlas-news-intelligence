import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  convertSnapshotToD1,
  renderD1Seed,
  snapshotFromDocument,
} from "../src/export/d1-seed.js";
import { gdeltSnapshotFixture } from "./fixtures/gdelt-snapshot.js";

describe("GDELT snapshot to D1 seed", () => {
  it("converts the successful loader envelope and preserves merged evidence", () => {
    const snapshot = snapshotFromDocument({ ok: true, snapshot: gdeltSnapshotFixture, diagnostics: [] });
    const dataset = convertSnapshotToD1(snapshot);

    expect(dataset.clusters).toHaveLength(1);
    expect(dataset.clusters[0]!.articles).toHaveLength(2);
    expect(dataset.clusters[0]!.locationEvidence).toHaveLength(2);
    expect(dataset.clusters[0]!.prominence[0]).toMatchObject({
      basis: "event_location",
      raw_article_count: 2,
      unique_publisher_count: 2,
      regional_source_volume: 2,
      regional_outlet_count: 2,
      normalized_score: 1,
      source_normalized_share: 1,
    });
    expect(dataset.clusters[0]!.articles[0]!.same_story).toMatchObject({
      coverageMarkets: { status: "unknown", value: null },
      audienceExposure: { status: "unknown", value: null },
      framing: { status: "unknown", value: null },
      tone: { status: "unknown", value: null },
    });
    expect(dataset.clusters[0]!.story.articles[0]).not.toHaveProperty("audience_region_code");
    expect(dataset.clusters[0]!.story.articles[0]).not.toHaveProperty("publisher_origin_country");
    expect(dataset.clusters[0]!.story.membership_explanation).toContain("1320000001");
    expect(dataset.clusters[0]!.story.membership_explanation).toContain("1320000002");
    expect(dataset.run).toMatchObject({
      run_id: "gdelt:20260827063000",
      source: "gdelt",
      status: "succeeded",
      records_seen: 6,
      records_upserted: 7,
      cotal_receipt: { agent: "atlas_data", task_id: "news.data.live-stream", commit: null },
    });
  });

  it("renders byte-stable escaped SQL scoped to the same run", () => {
    const dataset = convertSnapshotToD1(gdeltSnapshotFixture);
    const first = renderD1Seed(dataset);
    const second = renderD1Seed(dataset);

    expect(first).toBe(second);
    expect(first).not.toContain("BEGIN IMMEDIATE;");
    expect(first).not.toContain("COMMIT;");
    expect(first).toContain("wrangler d1 execute");
    expect(first).toContain("DELETE FROM pipeline_runs WHERE run_id = 'gdelt:20260827063000';");
    expect(first).toContain("DELETE FROM story_clusters WHERE ingestion_run_id = 'gdelt:20260827063000';");
    expect(first).toContain("DELETE FROM articles WHERE ingestion_run_id = 'gdelt:20260827063000';");
    expect(first).not.toMatch(/DELETE FROM [a-z_]+;/);
    expect(first).toContain("City''s flood response");
    expect(first).toContain("same_story_json");
    expect(first).toContain("source_normalized_share");
    expect(first).toContain("'event_location'");
    expect(first).toContain("atlas_data");
  });

  it("executes twice against the Surface schema without touching another run", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync(new URL("../surface/schema/schema.sql", import.meta.url), "utf8"));
    db.exec(
      `INSERT INTO pipeline_runs (
        run_id, source, status, input_fingerprint, started_at, completed_at,
        source_watermark_at, records_seen, records_upserted, error_kind,
        error_message, retryable, cotal_receipt_json, updated_at
      ) VALUES (
        'gdelt:other-batch', 'gdelt', 'succeeded', 'other',
        '2026-08-27T05:00:00.000Z', '2026-08-27T05:01:00.000Z',
        '2026-08-27T05:00:00.000Z', 1, 1, NULL, NULL, 0, NULL,
        '2026-08-27T05:01:00.000Z'
      );`,
    );
    const sql = renderD1Seed(convertSnapshotToD1(gdeltSnapshotFixture));
    db.exec(`BEGIN IMMEDIATE;\n${sql}\nCOMMIT;`);
    db.exec(`BEGIN IMMEDIATE;\n${sql}\nCOMMIT;`);

    expect(db.prepare("SELECT COUNT(*) AS count FROM pipeline_runs").get()).toEqual({ count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM story_clusters").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM articles").get()).toEqual({ count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM story_location_evidence").get()).toEqual({ count: 2 });
    expect(db.prepare("SELECT basis, regional_outlet_count, source_normalized_share FROM regional_prominence").get())
      .toEqual({ basis: "event_location", regional_outlet_count: 2, source_normalized_share: 1 });
    const sameStory = db.prepare("SELECT same_story_json FROM articles LIMIT 1").get() as { same_story_json: string };
    expect(JSON.parse(sameStory.same_story_json)).toMatchObject({ audienceExposure: { status: "unknown" } });
    expect(db.prepare("SELECT COUNT(*) AS count FROM pipeline_runs WHERE run_id = 'gdelt:other-batch'").get()).toEqual({ count: 1 });
    db.close();
  });

  it("migrates legacy rows to explicit unknown source context without fabricating prominence components", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE articles (article_id TEXT PRIMARY KEY);
      CREATE TABLE regional_prominence (
        unique_publisher_count INTEGER NOT NULL,
        formula_version TEXT NOT NULL
      );
      INSERT INTO articles (article_id) VALUES ('legacy-article');
      INSERT INTO regional_prominence (unique_publisher_count, formula_version)
      VALUES (3, 'atlas-regional-prominence-v1');
    `);
    db.exec(readFileSync(
      new URL("../surface/schema/migrations/0002_same_story.sql", import.meta.url),
      "utf8",
    ));

    const article = db.prepare("SELECT same_story_json FROM articles").get() as { same_story_json: string };
    expect(JSON.parse(article.same_story_json)).toMatchObject({
      coverageMarkets: { status: "unknown", value: null },
      audienceExposure: { status: "unknown", value: null },
    });
    expect(db.prepare(`SELECT regional_outlet_count, article_share, source_normalized_share,
      basis, formula_version FROM regional_prominence`).get()).toEqual({
      regional_outlet_count: 3,
      article_share: 0,
      source_normalized_share: 0,
      basis: "event_location",
      formula_version: "atlas-regional-prominence-v1-legacy-components-unavailable",
    });
    db.close();
  });
});
