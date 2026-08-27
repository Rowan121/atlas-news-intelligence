import type { Clock } from "../sources.js";
import { systemClock } from "../sources.js";
import { fetchCappedBytes, GdeltStreamError, unzipSingleCsv, verifyManifestBytes, type FetchPolicy } from "./download.js";
import {
  DEFAULT_LAST_UPDATE_URL,
  DEFAULT_MASTER_FILE_LIST_URL,
  parseLastUpdate,
  parseMasterFileTail,
} from "./manifest.js";
import { parseEventsTsv, parseGkgTsv, parseMentionsTsv } from "./parsers.js";
import { buildIntelligenceSnapshot, validateIntelligenceSnapshot } from "./snapshot.js";
import type {
  GdeltFileKind,
  GdeltJoinGates,
  GdeltLoadFailure,
  GdeltLoadResult,
  GdeltManifest,
  GdeltManifestEntry,
  GdeltStreamLimits,
  IntelligenceSnapshot,
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

export const DEFAULT_GDELT_FALLBACK_BATCHES = 4;
export const HARD_GDELT_FALLBACK_BATCHES = 8;

export type PartialLimits = Partial<{
  lastUpdateBytes: number;
  compressedBytes: Partial<Record<GdeltFileKind, number>>;
  decompressedBytes: Partial<Record<GdeltFileKind, number>>;
  rows: Partial<Record<GdeltFileKind, number>>;
  maxClusters: number;
  maxArticlesPerCluster: number;
}>;

export interface LoadLatestGdeltOptions {
  manifestUrl?: string;
  masterFileListUrl?: string;
  fallbackBatches?: number;
  limits?: PartialLimits;
  fetchPolicy?: FetchPolicy;
  clock?: Clock;
}

export interface LoadGdeltManifestOptions {
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

function fallbackBatchCount(value: number | undefined): number {
  if (value === undefined) return DEFAULT_GDELT_FALLBACK_BATCHES;
  if (!Number.isSafeInteger(value) || value < 0 || value > HARD_GDELT_FALLBACK_BATCHES) {
    throw new Error(`fallbackBatches must be an integer between 0 and ${HARD_GDELT_FALLBACK_BATCHES}.`);
  }
  return value;
}

function isMissingPublishedFile(error: unknown): error is GdeltStreamError {
  return error instanceof GdeltStreamError
    && error.kind === "http"
    && error.httpStatus === 404
    && (error.stage === "events" || error.stage === "mentions" || error.stage === "gkg");
}

async function loadManifestSnapshot(
  manifest: GdeltManifest,
  generatedAt: string,
  currentLimits: GdeltStreamLimits,
  policy: FetchPolicy,
  diagnostics: string[],
): Promise<IntelligenceSnapshot> {
  // GKG is the largest and historically latest-arriving member. Fetch it
  // first so an incomplete advertised batch fails before downloading the two
  // smaller tables that cannot form a usable Atlas join without it.
  const gkgText = await downloadTable(manifest.files.gkg, currentLimits, policy);

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
          mention.mentionType === DEFAULT_GDELT_JOIN_GATES.mentionType
          && mention.inRawText
          && mention.confidence >= DEFAULT_GDELT_JOIN_GATES.minimumConfidence
          && eventIdsWithCoordinates.has(mention.globalEventId),
      )
      .map((mention) => mention.mentionIdentifier),
  );

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
      "The selected GDELT batch contained no records passing all event/mention/GKG truth gates.",
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
  return snapshot;
}

export async function loadGdeltSnapshotFromManifest(
  manifest: GdeltManifest,
  options: LoadGdeltManifestOptions = {},
): Promise<GdeltLoadResult> {
  const generatedAt = (options.clock ?? systemClock).now().toISOString();
  const diagnostics = [`selected checksum manifest batch ${manifest.batchId}`];
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
  try {
    const snapshot = await loadManifestSnapshot(
      manifest,
      generatedAt,
      currentLimits,
      options.fetchPolicy ?? {},
      diagnostics,
    );
    return { ok: true, snapshot, diagnostics };
  } catch (error) {
    const normalized = error instanceof GdeltStreamError
      ? error
      : new GdeltStreamError("join", "parse_invalid", "Unexpected GDELT snapshot construction failure.", false);
    return failure(generatedAt, normalized, diagnostics);
  }
}

function markFallback(
  snapshot: IntelligenceSnapshot,
  advertisedBatchId: string,
): IntelligenceSnapshot {
  const warning = `latest advertised GDELT batch ${advertisedBatchId} was incomplete; used prior checksum-verified batch ${snapshot.batchId}.`;
  const health = {
    ...snapshot.health,
    status: "degraded" as const,
    warnings: [...snapshot.health.warnings, warning],
  };
  return {
    ...snapshot,
    health,
    clusters: snapshot.clusters.map((cluster) => ({ ...cluster, health })),
  };
}

export async function loadLatestGdeltSnapshot(
  options: LoadLatestGdeltOptions = {},
): Promise<GdeltLoadResult> {
  const clock = options.clock ?? systemClock;
  const generatedAt = clock.now().toISOString();
  const diagnostics: string[] = [];
  let currentLimits: GdeltStreamLimits;
  let maxFallbackBatches: number;
  try {
    currentLimits = limits(options.limits);
    maxFallbackBatches = fallbackBatchCount(options.fallbackBatches);
  } catch (error) {
    return failure(
      generatedAt,
      new GdeltStreamError("manifest", "manifest_invalid", error instanceof Error ? error.message : "Invalid limits.", false),
      diagnostics,
    );
  }
  const manifestUrl = options.manifestUrl ?? DEFAULT_LAST_UPDATE_URL;
  const masterFileListUrl = options.masterFileListUrl ?? DEFAULT_MASTER_FILE_LIST_URL;
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
    diagnostics.push(`advertised batch ${manifest.batchId}`);

    try {
      const snapshot = await loadManifestSnapshot(manifest, generatedAt, currentLimits, policy, diagnostics);
      return { ok: true, snapshot, diagnostics };
    } catch (latestError) {
      if (!isMissingPublishedFile(latestError) || maxFallbackBatches === 0) throw latestError;
      diagnostics.push(
        `advertised batch ${manifest.batchId} missing ${latestError.stage} (HTTP 404); checking prior checksum manifests`,
      );

      let candidates: GdeltManifest[];
      try {
        const masterBytes = await fetchCappedBytes(
          masterFileListUrl,
          "manifest",
          currentLimits.lastUpdateBytes,
          policy,
          { Range: `bytes=-${currentLimits.lastUpdateBytes}` },
        );
        const masterText = new TextDecoder("utf-8", { fatal: false }).decode(masterBytes);
        candidates = parseMasterFileTail(
          masterText,
          manifest.batchId,
          maxFallbackBatches,
          masterFileListUrl,
        );
      } catch (fallbackManifestError) {
        const normalizedFallbackManifestError =
          fallbackManifestError instanceof GdeltStreamError
            ? fallbackManifestError
            : new GdeltStreamError(
                "manifest",
                "manifest_invalid",
                fallbackManifestError instanceof Error
                  ? `GDELT fallback master list was invalid: ${fallbackManifestError.message}`
                  : "GDELT fallback master list was invalid.",
                false,
              );
        diagnostics.push(
          `fallback manifest unavailable: ${normalizedFallbackManifestError.kind}/${normalizedFallbackManifestError.stage}`,
        );
        throw normalizedFallbackManifestError;
      }

      for (const candidate of candidates) {
        diagnostics.push(`fallback candidate ${candidate.batchId}`);
        try {
          const snapshot = await loadManifestSnapshot(candidate, generatedAt, currentLimits, policy, diagnostics);
          const marked = markFallback(snapshot, manifest.batchId);
          diagnostics.push(`fallback selected ${candidate.batchId}`);
          return { ok: true, snapshot: marked, diagnostics };
        } catch (candidateError) {
          if (isMissingPublishedFile(candidateError)) {
            diagnostics.push(`fallback candidate ${candidate.batchId} missing ${candidateError.stage} (HTTP 404)`);
            continue;
          }
          throw candidateError;
        }
      }

      throw new GdeltStreamError(
        latestError.stage,
        "http",
        `Latest GDELT batch ${manifest.batchId} was incomplete and no prior complete checksum manifest was available within ${maxFallbackBatches * 15} minutes.`,
        true,
        404,
      );
    }
  } catch (error) {
    const normalized =
      error instanceof GdeltStreamError
        ? error
        : new GdeltStreamError("join", "parse_invalid", "Unexpected GDELT snapshot construction failure.", false);
    return failure(generatedAt, normalized, diagnostics);
  }
}
