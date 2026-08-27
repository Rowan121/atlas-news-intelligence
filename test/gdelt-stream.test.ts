import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { fetchCappedBytes, GdeltStreamError, unzipSingleCsv, verifyManifestBytes } from "../src/ingestion/gdelt-stream/download.js";
import { loadLatestGdeltSnapshot } from "../src/ingestion/gdelt-stream/loader.js";
import { parseLastUpdate, parseMasterFileTail } from "../src/ingestion/gdelt-stream/manifest.js";
import { parseEventsTsv, parseGkgTsv, parseMentionsTsv } from "../src/ingestion/gdelt-stream/parsers.js";
import { buildIntelligenceSnapshot, validateIntelligenceSnapshot } from "../src/ingestion/gdelt-stream/snapshot.js";
import type { GdeltFileKind, GdeltManifest, GdeltStreamLimits } from "../src/ingestion/gdelt-stream/types.js";

const BATCH = "20260827060000";
const NOW = "2026-08-27T06:05:00.000Z";
const ARTICLE_URL = "https://wire.example/world/tokyo-event";

function eventRow(overrides: { id?: string; withGeo?: boolean } = {}): string {
  const fields = Array<string>(61).fill("");
  fields[0] = overrides.id ?? "123456789";
  if (overrides.withGeo !== false) {
    fields[51] = "4";
    fields[52] = "Tokyo, Tokyo, Japan";
    fields[53] = "JA";
    fields[54] = "JA40";
    fields[55] = "";
    fields[56] = "35.6762";
    fields[57] = "139.6503";
    fields[58] = "-246227";
  }
  fields[59] = BATCH;
  fields[60] = ARTICLE_URL;
  return fields.join("\t");
}

function mentionRow(
  overrides: Partial<{
    eventId: string;
    type: number;
    url: string;
    raw: number;
    confidence: number;
  }> = {},
): string {
  const fields = Array<string>(16).fill("");
  fields[0] = overrides.eventId ?? "123456789";
  fields[1] = BATCH;
  fields[2] = BATCH;
  fields[3] = String(overrides.type ?? 1);
  fields[4] = "wire.example";
  fields[5] = overrides.url ?? ARTICLE_URL;
  fields[6] = "1";
  fields[10] = String(overrides.raw ?? 1);
  fields[11] = String(overrides.confidence ?? 92);
  fields[12] = "1200";
  fields[13] = "-1.25";
  fields[14] = "srclc:jpn; eng:GT-JPN";
  return fields.join("\t");
}

function gkgRow(
  overrides: Partial<{ url: string; title: string; collection: number }> = {},
): string {
  const fields = Array<string>(27).fill("");
  fields[0] = `${BATCH}-1`;
  fields[1] = BATCH;
  fields[2] = String(overrides.collection ?? 1);
  fields[3] = "wire.example";
  fields[4] = overrides.url ?? ARTICLE_URL;
  fields[25] = "srclc:jpn; eng:GT-JPN";
  fields[26] = `<PAGE_TITLE>${overrides.title ?? "Tokyo leaders meet &#x2013; live"}</PAGE_TITLE>`;
  return fields.join("\t");
}

function zipped(name: string, text: string): Uint8Array {
  return zipSync({ [name]: strToU8(`${text}\n`) }, { level: 1, mtime: new Date("2020-01-01T00:00:00Z") });
}

function md5(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

function streamFixture(mentionText = mentionRow()): {
  manifest: string;
  files: Record<string, Uint8Array>;
} {
  return streamFixtureAt(BATCH, mentionText);
}

function streamFixtureAt(batchId: string, mentionText?: string): {
  manifest: string;
  files: Record<string, Uint8Array>;
} {
  const eventText = eventRow().replaceAll(BATCH, batchId);
  const resolvedMentions = (mentionText ?? mentionRow()).replaceAll(BATCH, batchId);
  const gkgText = gkgRow().replaceAll(BATCH, batchId);
  const files = {
    [`https://data.gdeltproject.org/gdeltv2/${batchId}.export.CSV.zip`]: zipped(`${batchId}.export.CSV`, eventText),
    [`https://data.gdeltproject.org/gdeltv2/${batchId}.mentions.CSV.zip`]: zipped(`${batchId}.mentions.CSV`, resolvedMentions),
    [`https://data.gdeltproject.org/gdeltv2/${batchId}.gkg.csv.zip`]: zipped(`${batchId}.gkg.csv`, gkgText),
  };
  const manifest = Object.entries(files)
    .map(([url, bytes]) => `${bytes.byteLength} ${md5(bytes)} ${url.replace("https:", "http:")}`)
    .join("\n");
  return { manifest, files };
}

function fixtureManifest(): GdeltManifest {
  const fixture = streamFixture();
  return parseLastUpdate(fixture.manifest);
}

function tinyLimits(): GdeltStreamLimits {
  return {
    lastUpdateBytes: 64_000,
    compressedBytes: { events: 1_000_000, mentions: 1_000_000, gkg: 1_000_000 },
    decompressedBytes: { events: 1_000_000, mentions: 1_000_000, gkg: 1_000_000 },
    rows: { events: 100, mentions: 100, gkg: 100 },
    maxClusters: 20,
    maxArticlesPerCluster: 10,
  };
}

describe("GDELT 2.x stream loader", () => {
  it("parses one coherent three-file manifest and upgrades HTTP links", () => {
    const parsed = fixtureManifest();
    expect(parsed.batchId).toBe(BATCH);
    expect(parsed.batchTimestamp).toBe("2026-08-27T06:00:00.000Z");
    expect(parsed.files.events.url).toMatch(/^https:/);
    expect(parsed.files.mentions.kind).toBe("mentions");
    expect(parsed.files.gkg.kind).toBe("gkg");
  });

  it("rejects untrusted file hosts and mismatched batches", () => {
    const fixture = streamFixture();
    expect(() => parseLastUpdate(fixture.manifest.replace("data.gdeltproject.org", "evil.example"))).toThrow(
      /unexpected host/,
    );
    expect(() => parseLastUpdate(fixture.manifest.replace(`${BATCH}.gkg`, "20260827061500.gkg"))).toThrow(
      /one batch timestamp/,
    );
  });

  it("extracts only prior coherent quarter-hour batches from a bounded master-list tail", () => {
    const prior = streamFixtureAt("20260827054500");
    const older = streamFixtureAt("20260827053000");
    const latest = streamFixtureAt(BATCH);
    const candidates = parseMasterFileTail(
      ["truncated range-boundary row", older.manifest, prior.manifest, latest.manifest].join("\n"),
      BATCH,
      2,
    );

    expect(candidates.map((candidate) => candidate.batchId)).toEqual([
      "20260827054500",
      "20260827053000",
    ]);
    expect(candidates[0]!.files.gkg.md5).toBe(parseLastUpdate(prior.manifest).files.gkg.md5);
  });

  it("rejects malformed complete rows inside the master-list tail", () => {
    const prior = streamFixtureAt("20260827054500");
    expect(() => parseMasterFileTail(
      ["partial-first-row", prior.manifest, "1 bad row"].join("\n"),
      BATCH,
      1,
    )).toThrow(/bytes, MD5, and a URL/);
  });

  it("parses official Events/Mentions/GKG columns and unescapes page titles", () => {
    const events = parseEventsTsv(eventRow(), 10);
    const mentions = parseMentionsTsv(mentionRow(), 10);
    const gkg = parseGkgTsv(gkgRow(), 10);
    expect(events.records[0]!.actionGeo).toMatchObject({
      fullName: "Tokyo, Tokyo, Japan",
      countryCode: "JA",
      latitude: 35.6762,
      longitude: 139.6503,
    });
    expect(mentions.records[0]).toMatchObject({ mentionType: 1, inRawText: true, confidence: 92 });
    expect(gkg.records[0]).toMatchObject({
      documentIdentifier: ARTICLE_URL,
      pageTitle: "Tokyo leaders meet – live",
      sourceCommonName: "wire.example",
    });
  });

  it("joins event to mention to GKG exactly and keeps event geography distinct", () => {
    const manifest = fixtureManifest();
    const events = parseEventsTsv(eventRow(), 10);
    const mentions = parseMentionsTsv(mentionRow(), 10);
    const gkg = parseGkgTsv(gkgRow(), 10);
    const snapshot = buildIntelligenceSnapshot({
      manifest,
      events,
      mentions,
      gkg,
      generatedAt: NOW,
      limits: tinyLimits(),
      gates: {
        mentionType: 1,
        inRawText: true,
        minimumConfidence: 80,
        requireActionGeoCoordinates: true,
        requireGkgPageTitle: true,
      },
    });
    expect(snapshot.clusters).toHaveLength(1);
    expect(snapshot.clusters[0]!.eventLocations[0]).toMatchObject({
      name: "Tokyo, Tokyo, Japan",
      countryCode: "JA",
      type: "city",
    });
    expect(snapshot.clusters[0]!.eventLocations[0]!.evidence[0]!.method).toBe("provider_event_geotag");
    expect(snapshot.clusters[0]!.articles[0]!.publisher.origin).toBeUndefined();
    expect(snapshot.clusters[0]!.memberships[0]!.evidence.reasons.join(" ")).toContain("MentionIdentifier");
    expect(validateIntelligenceSnapshot(snapshot)).toEqual([]);
  });

  it("deterministically merges duplicate event ids and recomputes prominence", () => {
    const secondUrl = "https://second-wire.example/world/tokyo-event";
    const snapshot = buildIntelligenceSnapshot({
      manifest: fixtureManifest(),
      events: parseEventsTsv(
        [eventRow({ id: "123456789" }), eventRow({ id: "123456790" })].join("\n"),
        10,
      ),
      mentions: parseMentionsTsv(
        [
          mentionRow({ eventId: "123456789", url: ARTICLE_URL, confidence: 92 }),
          mentionRow({ eventId: "123456790", url: secondUrl, confidence: 88 }),
        ].join("\n"),
        10,
      ),
      gkg: parseGkgTsv(
        [
          gkgRow({ url: ARTICLE_URL, title: "Tokyo leaders meet – live" }),
          gkgRow({ url: secondUrl, title: "TOKYO leaders meet: live" }),
        ].join("\n"),
        10,
      ),
      generatedAt: NOW,
      limits: tinyLimits(),
      gates: {
        mentionType: 1,
        inRawText: true,
        minimumConfidence: 80,
        requireActionGeoCoordinates: true,
        requireGkgPageTitle: true,
      },
    });

    expect(snapshot.clusters).toHaveLength(1);
    expect(snapshot.clusters[0]!.id).toBe("gdelt_event_123456789");
    expect(snapshot.clusters[0]!.articles).toHaveLength(2);
    expect(snapshot.clusters[0]!.memberships).toHaveLength(2);
    expect(snapshot.clusters[0]!.eventLocations[0]!.evidence).toHaveLength(2);
    expect(snapshot.clusters[0]!.prominence[0]).toMatchObject({
      raw: { articleCount: 2, outletCount: 2 },
      normalized: { articleShare: 1, sourceNormalizedShare: 1 },
    });
    expect(snapshot.health.warnings.join(" ")).toContain("duplicate GlobalEventID");
    expect(validateIntelligenceSnapshot(snapshot)).toEqual([]);
  });

  it("enforces web, InRawText, confidence, coordinates, exact GKG, and page-title gates", () => {
    const mentionsText = [
      mentionRow(),
      mentionRow({ type: 2, url: "https://wire.example/type-2" }),
      mentionRow({ raw: 0, url: "https://wire.example/synthesized" }),
      mentionRow({ confidence: 79, url: "https://wire.example/low-confidence" }),
      mentionRow({ eventId: "event_without_geo", url: "https://wire.example/no-geo" }),
      mentionRow({ url: "https://wire.example/no-gkg" }),
    ].join("\n");
    const eventsText = [eventRow(), eventRow({ id: "event_without_geo", withGeo: false })].join("\n");
    const snapshot = buildIntelligenceSnapshot({
      manifest: fixtureManifest(),
      events: parseEventsTsv(eventsText, 20),
      mentions: parseMentionsTsv(mentionsText, 20),
      gkg: parseGkgTsv(gkgRow(), 20),
      generatedAt: NOW,
      limits: tinyLimits(),
      gates: {
        mentionType: 1,
        inRawText: true,
        minimumConfidence: 80,
        requireActionGeoCoordinates: true,
        requireGkgPageTitle: true,
      },
    });
    expect(snapshot.statistics.eligibleMentions).toBe(2);
    expect(snapshot.statistics.joinedMentions).toBe(1);
    expect(snapshot.statistics.droppedWithoutGkg).toBe(1);
    expect(snapshot.statistics.articlesEmitted).toBe(1);
  });

  it("rejects unsafe, oversized, or multi-file ZIPs", () => {
    const oversized = zipped("large.csv", "x".repeat(100));
    expect(() => unzipSingleCsv(oversized, "events", 10)).toThrowError(GdeltStreamError);
    const multiple = zipSync({ "a.csv": strToU8("a"), "b.csv": strToU8("b") });
    expect(() => unzipSingleCsv(multiple, "events", 100)).toThrow(/exactly one CSV/);
    const unsafe = zipSync({ "../escape.csv": strToU8("a") });
    expect(() => unzipSingleCsv(unsafe, "events", 100)).toThrow(/unsafe path/);
  });

  it("checks manifest byte counts and MD5", () => {
    const entry = fixtureManifest().files.events;
    const bytes = streamFixture().files[entry.url]!;
    expect(() => verifyManifestBytes(entry, bytes)).not.toThrow();
    const changed = bytes.slice();
    changed[10] = changed[10]! ^ 1;
    expect(() => verifyManifestBytes(entry, changed)).toThrow(/MD5/);
  });

  it("retries a retryable response once with bounded backoff", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const sleeps: number[] = [];
    const bytes = await fetchCappedBytes("https://data.gdeltproject.org/test", "manifest", 100, {
      fetch: fetchMock,
      attempts: 2,
      initialBackoffMs: 25,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });
    expect(new TextDecoder().decode(bytes)).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([25]);
  });

  it("builds a validated snapshot end-to-end from three ZIP downloads", async () => {
    const fixture = streamFixture();
    const manifestUrl = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === manifestUrl) return new Response(fixture.manifest, { status: 200 });
      const bytes = fixture.files[url];
      return bytes === undefined
        ? new Response("missing", { status: 404 })
        : new Response(bytes as unknown as BodyInit, {
            status: 200,
            headers: { "content-length": String(bytes.byteLength) },
          });
    });
    const result = await loadLatestGdeltSnapshot({
      manifestUrl,
      fetchPolicy: { fetch: fetchMock, attempts: 1 },
      clock: { now: () => new Date(NOW) },
      limits: tinyLimits(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.statistics).toMatchObject({ clustersEmitted: 1, articlesEmitted: 1 });
    expect(result.snapshot.validationIssues).toEqual([]);
    expect(result.snapshot.source.attribution).toContain("GDELT Project");
  });

  it("falls back to the newest checksum-verified prior batch when an advertised GKG is missing", async () => {
    const latest = streamFixtureAt(BATCH);
    const missingPrior = streamFixtureAt("20260827054500");
    const completePrior = streamFixtureAt("20260827053000");
    const manifestUrl = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
    const masterFileListUrl = "https://data.gdeltproject.org/gdeltv2/masterfilelist.txt";
    const masterTail = [
      "truncated range-boundary row",
      completePrior.manifest,
      missingPrior.manifest,
      latest.manifest,
    ].join("\n");
    const requests: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      requests.push(url);
      if (url === manifestUrl) return new Response(latest.manifest, { status: 200 });
      if (url === masterFileListUrl) {
        expect(new Headers(init?.headers).get("range")).toBe("bytes=-64000");
        return new Response(masterTail, { status: 206 });
      }
      if (
        url === parseLastUpdate(latest.manifest).files.gkg.url
        || url === parseLastUpdate(missingPrior.manifest).files.gkg.url
      ) {
        return new Response(null, { status: 404 });
      }
      const bytes = completePrior.files[url] ?? missingPrior.files[url] ?? latest.files[url];
      return bytes === undefined
        ? new Response(null, { status: 404 })
        : new Response(bytes as unknown as BodyInit, {
            status: 200,
            headers: { "content-length": String(bytes.byteLength) },
          });
    });

    const result = await loadLatestGdeltSnapshot({
      manifestUrl,
      masterFileListUrl,
      fallbackBatches: 4,
      fetchPolicy: { fetch: fetchMock, attempts: 1 },
      clock: { now: () => new Date(NOW) },
      limits: tinyLimits(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.batchId).toBe("20260827053000");
    expect(result.snapshot.health.status).toBe("degraded");
    expect(result.snapshot.health.warnings.join(" ")).toContain("prior checksum-verified batch");
    expect(result.snapshot.clusters[0]!.health).toEqual(result.snapshot.health);
    expect(result.diagnostics.join(" ")).toContain("fallback candidate 20260827054500 missing gkg");
    expect(result.diagnostics.join(" ")).toContain("fallback selected 20260827053000");
    expect(requests).not.toContain(parseLastUpdate(latest.manifest).files.events.url);
    expect(validateIntelligenceSnapshot(result.snapshot)).toEqual([]);
  });

  it("does not reinterpret non-404 failures as publication lag", async () => {
    const latest = streamFixtureAt(BATCH);
    const manifestUrl = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
    const masterFileListUrl = "https://data.gdeltproject.org/gdeltv2/masterfilelist.txt";
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === manifestUrl) return new Response(latest.manifest, { status: 200 });
      if (url === parseLastUpdate(latest.manifest).files.gkg.url) return new Response(null, { status: 503 });
      if (url === masterFileListUrl) throw new Error("master list must not be requested");
      return new Response(null, { status: 404 });
    });

    const result = await loadLatestGdeltSnapshot({
      manifestUrl,
      masterFileListUrl,
      fetchPolicy: { fetch: fetchMock, attempts: 1 },
      clock: { now: () => new Date(NOW) },
      limits: tinyLimits(),
    });

    expect(result).toMatchObject({ ok: false, error: { stage: "gkg", kind: "http", retryable: true } });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(masterFileListUrl);
  });

  it("stops on a fallback checksum mismatch instead of silently walking farther back", async () => {
    const latest = streamFixtureAt(BATCH);
    const prior = streamFixtureAt("20260827054500");
    const older = streamFixtureAt("20260827053000");
    const manifestUrl = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
    const masterFileListUrl = "https://data.gdeltproject.org/gdeltv2/masterfilelist.txt";
    const latestGkg = parseLastUpdate(latest.manifest).files.gkg.url;
    const priorGkg = parseLastUpdate(prior.manifest).files.gkg.url;
    const olderGkg = parseLastUpdate(older.manifest).files.gkg.url;
    const corrupt = prior.files[priorGkg]!.slice();
    corrupt[10] = corrupt[10]! ^ 1;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === manifestUrl) return new Response(latest.manifest, { status: 200 });
      if (url === masterFileListUrl) {
        return new Response(
          ["partial", older.manifest, prior.manifest, latest.manifest].join("\n"),
          { status: 206 },
        );
      }
      if (url === latestGkg) return new Response(null, { status: 404 });
      if (url === priorGkg) return new Response(corrupt as unknown as BodyInit, { status: 200 });
      const bytes = older.files[url] ?? prior.files[url] ?? latest.files[url];
      return bytes === undefined ? new Response(null, { status: 404 }) : new Response(bytes as unknown as BodyInit);
    });

    const result = await loadLatestGdeltSnapshot({
      manifestUrl,
      masterFileListUrl,
      fetchPolicy: { fetch: fetchMock, attempts: 1 },
      clock: { now: () => new Date(NOW) },
      limits: tinyLimits(),
    });

    expect(result).toMatchObject({ ok: false, error: { stage: "gkg", kind: "checksum_mismatch" } });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(olderGkg);
  });

  it("allows callers to disable bounded prior-batch fallback", async () => {
    const latest = streamFixtureAt(BATCH);
    const manifestUrl = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
    const masterFileListUrl = "https://data.gdeltproject.org/gdeltv2/masterfilelist.txt";
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === manifestUrl) return new Response(latest.manifest, { status: 200 });
      if (url === parseLastUpdate(latest.manifest).files.gkg.url) return new Response(null, { status: 404 });
      if (url === masterFileListUrl) throw new Error("master list must not be requested");
      return new Response(null, { status: 404 });
    });

    const result = await loadLatestGdeltSnapshot({
      manifestUrl,
      masterFileListUrl,
      fallbackBatches: 0,
      fetchPolicy: { fetch: fetchMock, attempts: 1 },
      clock: { now: () => new Date(NOW) },
      limits: tinyLimits(),
    });

    expect(result).toMatchObject({ ok: false, error: { stage: "gkg", kind: "http" } });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(masterFileListUrl);
  });

  it("returns an honest no-qualified-records envelope", async () => {
    const fixture = streamFixture(mentionRow({ confidence: 20 }));
    const manifestUrl = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === manifestUrl) return new Response(fixture.manifest, { status: 200 });
      const bytes = fixture.files[url];
      return bytes === undefined
        ? new Response("missing", { status: 404 })
        : new Response(bytes as unknown as BodyInit, { status: 200 });
    });
    const result = await loadLatestGdeltSnapshot({
      manifestUrl,
      fetchPolicy: { fetch: fetchMock, attempts: 1 },
      clock: { now: () => new Date(NOW) },
      limits: tinyLimits(),
    });
    expect(result).toMatchObject({ ok: false, error: { stage: "join", kind: "no_qualified_records" } });
    if (!result.ok) expect(result.error.message).not.toMatch(/fallback|demo/i);
  });
});
