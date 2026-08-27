import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composeD1ProductionRefresh } from "../src/export/d1-refresh.js";
import { convertSnapshotToD1, renderD1Seed } from "../src/export/d1-seed.js";
import { gdeltSnapshotFixture } from "./fixtures/gdelt-snapshot.js";

describe("atomic D1 production refresh", () => {
  it("loads the verified current seed and retires only the named superseded run", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync(new URL("../surface/schema/schema.sql", import.meta.url), "utf8"));
    db.exec(`
      INSERT INTO pipeline_runs (
        run_id, source, status, input_fingerprint, started_at, completed_at,
        source_watermark_at, records_seen, records_upserted, error_kind,
        error_message, retryable, cotal_receipt_json, updated_at
      ) VALUES (
        'gdelt:superseded', 'gdelt', 'degraded', 'old',
        '2026-08-27T05:00:00.000Z', '2026-08-27T05:01:00.000Z',
        '2026-08-27T05:00:00.000Z', 1, 1, NULL, 'partial', 0, NULL,
        '2026-08-27T05:01:00.000Z'
      );
      INSERT INTO story_clusters (
        cluster_id, ingestion_run_id, canonical_title, summary, primary_region_code,
        first_observed_at, last_observed_at, raw_article_count, unique_publisher_count,
        normalized_prominence, cluster_confidence, membership_explanation, updated_at
      ) VALUES (
        'old-cluster', 'gdelt:superseded', 'Old', NULL, 'US',
        '2026-08-27T05:00:00.000Z', '2026-08-27T05:00:00.000Z', 0, 0,
        0, 1, '[]', '2026-08-27T05:01:00.000Z'
      );
    `);

    const seed = renderD1Seed(convertSnapshotToD1(gdeltSnapshotFixture));
    const refresh = composeD1ProductionRefresh(seed, ["gdelt:superseded"]);
    db.exec(`BEGIN IMMEDIATE;\n${refresh}\nCOMMIT;`);

    expect(db.prepare("SELECT run_id FROM pipeline_runs").all()).toEqual([
      { run_id: "gdelt:20260827063000" },
    ]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM story_clusters").get()).toEqual({ count: 1 });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
  });

  it("rejects unsafe or self-retiring run identifiers", () => {
    const seed = renderD1Seed(convertSnapshotToD1(gdeltSnapshotFixture));
    expect(() => composeD1ProductionRefresh(seed, [])).toThrow(/At least one/);
    expect(() => composeD1ProductionRefresh(seed, ["gdelt:20260827063000"])).toThrow(/cannot retire itself/);
    expect(() => composeD1ProductionRefresh(seed, ["bad'; DELETE FROM pipeline_runs;"])).toThrow(/Invalid/);
  });
});
