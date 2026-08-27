/// <reference path="../../surface/src/cloudflare.d.ts" />

import { describe, expect, it } from "vitest";
import { convertSnapshotToD1 } from "../../src/export/d1-seed";
import { gdeltSnapshotFixture } from "../../test/fixtures/gdelt-snapshot";
import { createWorker, type Env } from "../../surface/src/index";
import { MemoryTruthStore } from "../../surface/src/__tests__/fixtures";
import { intelligenceSnapshotSchema } from "./api";

describe("live GDELT → Surface → UI contract", () => {
  it("serves a converted real-shape snapshot accepted by the UI Zod schema", async () => {
    const converted = convertSnapshotToD1(gdeltSnapshotFixture);
    const store = new MemoryTruthStore();
    store.stories = converted.clusters.map((cluster) => cluster.story);
    store.health = converted.health;
    const worker = createWorker({
      store,
      clock: () => new Date(gdeltSnapshotFixture.generatedAt),
      requestId: () => "contract-test",
    });
    const response = await worker.fetch!(
      new Request("https://atlas.example/api/v1/intelligence?window=24h&prominence=normalized"),
      { STALE_AFTER_SECONDS: "1800" } as Env,
      {} as ExecutionContext,
    );
    const payload: unknown = await response.json();
    const parsed = intelligenceSnapshotSchema.safeParse(payload);

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.clusters).toHaveLength(1);
    expect(parsed.data.clusters[0]).toMatchObject({
      rawProminence: 2,
      publisherCount: 2,
      languageCount: 1,
      sources: [
        { publisher: "Wire One", language: "und" },
        { publisher: "Wire Two", language: "und" },
      ],
    });
    expect(parsed.data.clusters[0]!.eventLocations[0]).toMatchObject({
      label: "Fixture City, Testland",
      evidenceCount: 2,
    });
  });
});
