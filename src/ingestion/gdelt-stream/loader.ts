import type { Clock } from "../sources.js";
import { systemClock } from "../sources.js";
import { fetchCappedBytes, GdeltStreamError, unzipSingleCsv, verifyManifestBytes, type FetchPolicy } from "./download.js";
import { DEFAULT_LAST_UPDATE_URL, parseLastUpdate } from "./manifest.js";
import { parseEventsTsv, parseGkgTsv, parseMentionsTsv } from "./parsers.js";
import { buildIntelligenceSnapshot, validateIntelligenceSnapshot } from "./snapshot.js";
import type {
  GdeltFileKind,
  GdeltJoinGates,
  GdeltLoadFailure,
  GdeltLoadResult,
  GdeltManifestEntry,
  GdeltStreamLimits,
} from "./types.js";

const MEBIBYTE = 1024 * 1024;

export const HARD_GDELT_STREAM_LIMITS: GdeltStreamLimits = {
  lastUpdateBytes: 64 * 1024,
  compressedBytes: { events: 32 * MEBIBYTE, mentions: 128 * MEBIBYTE, gkg: 128 * MEBIBYTE },
  decompressedBytes: { events: 192 * MEBIBYTE, mentions: 384 * MEBIBYTE, gkg: 512 * MEBIBYTE },
  rows: { events: 250_000, mentions: 500_000, gkg: 500_000 },
  maxClusters: 500,
  maxArticlesPerCluster: 50,
};

export const DEFAULT_GDELT_STREAM_LIMITS: GdeltStreamLimits = {
  lastUpdateBytes: 32 * 1024,
  compressedBytes: { events: 16 * MEBIBYTE, mentions: 64 * MEBIBYTE, gkg: 64 * MEBIBYTE },
  decompressedBytes: { events: 96 * MEBIBYTE, mentions: 256 * MEBIBYTE, gkg: 256 * MEBIBYTE },
  rows: { events: 25_000, mentions: 100_000, gkg: 100_000 },
  maxClusters: 200,
  maxArticlesPerCluster: 25,
};

export const DEFAULT_GDELT_JOIN_GATES: GdeltJoinGates = {
  mentionType: 1,
  inRawText: true,
  minimumConfidence: 80,
  requireActionGeoCoordinates: true,
  requireGkgPageTitle: true,
};

type PartialLimits = Partial<{
  lastUpdateBytes: number;
  compressedBytes: Partial<Record<GdeltFileKind, number>>;
  decompressedBytes: Partial<Record<GdeltFileKind, number>>;
  rows: Partial<Record<GdeltFileKind, number>>;
  maxClusters: number;
  maxArticlesPerCluster: number;
}>;

export interface LoadLatestGdeltOptions {
  manifestUrl?: string;
  limits?: PartialLimits;
  fetchPolicy?: FetchPolicy;
  clock?: Clock;
}

function boundedLimit(value: number | undefined, fallback: number, hard: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) throw new Error("GDELT limits must be positive finite numbers.");
  return Math.floor(Math.min(value, hard));
}

function limits(input: PartialLimits = {}): GdeltStreamLimits {
  const kinds: GdeltFileKind[] = ["events", "mentions", "gkg"];
  const compressedBytes = Object.fromEntries(
    kinds.map((kind) => [
      kind,
      boundedLimit(
        input.compressedBytes?.[kind],
        DEFAULT_GDELT_STREAM_LIMITS.compressedBytes[kind],
        HARD_GDELT_STREAM_LIMITS.compressedBytes[kind],
      ),
    ]),
  ) as Record<GdeltFileKind, number>;
  const decompressedBytes = Object.fromEntries(
    kinds.map((kind) => [
      kind,
      boundedLimit(
        input.decompressedBytes?.[kind],
        DEFAULT_GDELT_STREAM_LIMITS.decompressedBytes[kind],
        HARD_GDELT_STREAM_LIMITS.decompressedBytes[kind],
      ),
    ]),
  ) as Record<GdeltFileKind, number>;
  const rowLimits = Object.fromEntries(
    kinds.map((kind) => [
      kind,
      boundedLimit(input.rows?.[kind], DEFAULT_GDELT_STREAM_LIMITS.rows[kind], HARD_GDELT_STREAM_LIMITS.rows[kind]),
    ]),
  ) as Record<GdeltFileKind, number>;
  return {
    lastUpdateBytes: boundedLimit(
      input.lastUpdateBytes,
      DEFAULT_GDELT_STREAM_LIMITS.lastUpdateBytes,
      HARD_GDELT_STREAM_LIMITS.lastUpdateBytes,
    ),
    compressedBytes,
    decompressedBytes,
    rows: rowLimits,
    maxClusters: boundedLimit(
      input.maxClusters,
      DEFAULT_GDELT_STREAM_LIMITS.maxClusters,
      HARD_GDELT_STREAM_LIMITS.maxClusters,
    ),
    maxArticlesPerCluster: boundedLimit(
      input.maxArticlesPerCluster,
      DEFAULT_GDELT_STREAM_LIMITS.maxArticlesPerCluster,
      HARD_GDELT_STREAM_LIMITS.maxArticlesPerCluster,
    ),
  };
}

function failure(
  generatedAt: string,
  error: GdeltStreamError,
  diagnostics: string[],
): GdeltLoadFailure {
  return {
    ok: false,
    generatedAt,
    error: {
      stage: error.stage,
      kind: error.kind,
      message: error.message,
      retryable: error.retryable,
    },
    diagnostics,
  };
}

async function downloadTable(
  entry: GdeltManifestEntry,
  currentLimits: GdeltStreamLimits,
  policy: FetchPolicy,
): Promise<string> {
  if (entry.compressedBytes > currentLimits.compressedBytes[entry.kind]) {
    throw new GdeltStreamError(
      entry.kind,
      "too_large",
      `GDELT ${entry.kind} manifest size exceeded the configured cap.`,
      false,
    );
  }
  const bytes = await fetchCappedBytes(entry.url, entry.kind, currentLimits.compressedBytes[entry.kind], policy);
  verifyManifestBytes(entry, bytes);
  return unzipSingleCsv(bytes, entry.kind, currentLimits.decompressedBytes[entry.kind]);
}

export async function loadLatestGdeltSnapshot(
  options: LoadLatestGdeltOptions = {},
): Promise<GdeltLoadResult> {
  const clock = options.clock ?? systemClock;
  const generatedAt = clock.now().toISOString();
  const diagnostics: string[] = [];
  let currentLimits: GdeltStreamLimits;
  try {
    currentLimits = limits(options.limits);
  } catch (error) {
    return failure(
      generatedAt,
      new GdeltStreamError("manifest", "manifest_invalid", error instanceof Error ? error.message : "Invalid limits.", false),
      diagnostics,
    );
  }
  const manifestUrl = options.manifestUrl ?? DEFAULT_LAST_UPDATE_URL;
  const policy = options.fetchPolicy ?? {};
  try {
    const manifestBytes = await fetchCappedBytes(manifestUrl, "manifest", currentLimits.lastUpdateBytes, policy);
    const manifestText = new TextDecoder("utf-8", { fatal: false }).decode(manifestBytes);
    let manifest;
    try {
      manifest = parseLastUpdate(manifestText, manifestUrl);
    } catch (error) {
      throw new GdeltStreamError(
        "manifest",
        "manifest_invalid",
        error instanceof Error ? error.message : "GDELT manifest was invalid.",
        false,
      );
    }
    diagnostics.push(`batch ${manifest.batchId}`);

    const eventsText = await downloadTable(manifest.files.events, currentLimits, policy);
    const events = parseEventsTsv(eventsText, currentLimits.rows.events);
    diagnostics.push(`events ${events.diagnostics.rowsAccepted}/${events.diagnostics.rowsSeen}`);

    const mentionsText = await downloadTable(manifest.files.mentions, currentLimits, policy);
    const mentions = parseMentionsTsv(mentionsText, currentLimits.rows.mentions);
    diagnostics.push(`mentions ${mentions.diagnostics.rowsAccepted}/${mentions.diagnostics.rowsSeen}`);

    const eventIdsWithCoordinates = new Set(
      events.records.filter((event) => event.actionGeo !== undefined).map((event) => event.globalEventId),
    );
    const candidateDocuments = new Set(
      mentions.records
        .filter(
          (mention) =>
            mention.mentionType === DEFAULT_GDELT_JOIN_GATES.mentionType &&
            mention.inRawText &&
            mention.confidence >= DEFAULT_GDELT_JOIN_GATES.minimumConfidence &&
            eventIdsWithCoordinates.has(mention.globalEventId),
        )
        .map((mention) => mention.mentionIdentifier),
    );

    const gkgText = await downloadTable(manifest.files.gkg, currentLimits, policy);
    const gkg = parseGkgTsv(gkgText, currentLimits.rows.gkg, candidateDocuments);
    diagnostics.push(`gkg joined candidates ${gkg.diagnostics.rowsAccepted}/${gkg.diagnostics.rowsSeen}`);

    const snapshot = buildIntelligenceSnapshot({
      manifest,
      events,
      mentions,
      gkg,
      generatedAt,
      limits: currentLimits,
      gates: DEFAULT_GDELT_JOIN_GATES,
    });
    if (snapshot.clusters.length === 0) {
      throw new GdeltStreamError(
        "join",
        "no_qualified_records",
        "The latest GDELT batch contained no records passing all event/mention/GKG truth gates.",
        true,
      );
    }
    const snapshotIssues = validateIntelligenceSnapshot(snapshot);
    if (snapshotIssues.length > 0 || snapshot.validationIssues.length > 0) {
      throw new GdeltStreamError(
        "validation",
        "parse_invalid",
        `GDELT snapshot failed ${snapshotIssues.length + snapshot.validationIssues.length} validation checks.`,
        false,
      );
    }
    diagnostics.push(`emitted ${snapshot.statistics.clustersEmitted} clusters / ${snapshot.statistics.articlesEmitted} articles`);
    return { ok: true, snapshot, diagnostics };
  } catch (error) {
    const normalized =
      error instanceof GdeltStreamError
        ? error
        : new GdeltStreamError("join", "parse_invalid", "Unexpected GDELT snapshot construction failure.", false);
    return failure(generatedAt, normalized, diagnostics);
  }
}
