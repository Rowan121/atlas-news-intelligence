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
      raw_article_count: 2,
      unique_publisher_count: 2,
      regional_source_volume: 2,
      normalized_score: 1,
    });
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
    expect(db.prepare("SELECT COUNT(*) AS count FROM pipeline_runs WHERE run_id = 'gdelt:other-batch'").get()).toEqual({ count: 1 });
    db.close();
  });
});
