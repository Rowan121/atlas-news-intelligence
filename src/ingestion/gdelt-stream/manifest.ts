import type { GdeltFileKind, GdeltManifest, GdeltManifestEntry } from "./types.js";

export const DEFAULT_LAST_UPDATE_URL = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
export const DEFAULT_MASTER_FILE_LIST_URL = "https://data.gdeltproject.org/gdeltv2/masterfilelist.txt";

const SUFFIXES: Record<GdeltFileKind, string> = {
  events: ".export.CSV.zip",
  mentions: ".mentions.CSV.zip",
  gkg: ".gkg.csv.zip",
};

function kindFromUrl(url: URL): GdeltFileKind | undefined {
  return (Object.entries(SUFFIXES) as Array<[GdeltFileKind, string]>).find(([, suffix]) =>
    url.pathname.endsWith(suffix),
  )?.[0];
}

export function gdeltTimestampToIso(value: string): string | undefined {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (match === null) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const parsed = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function parseLine(line: string): GdeltManifestEntry {
  const match = line.trim().match(/^(\d+)\s+([a-fA-F0-9]{32})\s+(https?:\/\/\S+)$/);
  if (match === null) throw new Error("Each lastupdate row must contain bytes, MD5, and a URL.");
  const compressedBytes = Number(match[1]);
  const url = new URL(match[3]!);
  if (url.hostname.toLowerCase() !== "data.gdeltproject.org") {
    throw new Error("GDELT manifest file URL used an unexpected host.");
  }
  url.protocol = "https:";
  url.username = "";
  url.password = "";
  const kind = kindFromUrl(url);
  if (kind === undefined) throw new Error("GDELT manifest contained an unexpected file suffix.");
  const filename = url.pathname.split("/").at(-1) ?? "";
  const batchId = filename.match(/^(\d{14})\./)?.[1];
  if (batchId === undefined || gdeltTimestampToIso(batchId) === undefined) {
    throw new Error("GDELT manifest filename did not contain a valid batch timestamp.");
  }
  if (!Number.isSafeInteger(compressedBytes) || compressedBytes <= 0) {
    throw new Error("GDELT manifest declared an invalid compressed size.");
  }
  return {
    kind,
    compressedBytes,
    md5: match[2]!.toLowerCase(),
    url: url.toString(),
    batchId,
  };
}

export function parseLastUpdate(
  text: string,
  manifestUrl = DEFAULT_LAST_UPDATE_URL,
): GdeltManifest {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 3) throw new Error("GDELT lastupdate.txt must contain exactly three files.");
  const entries = lines.map(parseLine);
  const byKind = new Map(entries.map((entry) => [entry.kind, entry]));
  if (byKind.size !== 3) throw new Error("GDELT lastupdate.txt must contain one file of each kind.");
  const batchIds = new Set(entries.map((entry) => entry.batchId));
  if (batchIds.size !== 1) throw new Error("GDELT lastupdate files did not share one batch timestamp.");
  const batchId = entries[0]!.batchId;
  return {
    manifestUrl,
    batchId,
    batchTimestamp: gdeltTimestampToIso(batchId)!,
    files: {
      events: byKind.get("events")!,
      mentions: byKind.get("mentions")!,
      gkg: byKind.get("gkg")!,
    },
  };
}

/**
 * Parse only a bounded HTTP range from the tail of masterfilelist.txt and
 * return prior coherent 15-minute batches newest-first. The first line may be
 * truncated by the range boundary; every subsequent non-empty row remains
 * strict and checksum-bearing.
 */
export function parseMasterFileTail(
  text: string,
  beforeBatchId: string,
  maxAgeBatches = 8,
  manifestUrl = DEFAULT_MASTER_FILE_LIST_URL,
): GdeltManifest[] {
  const beforeIso = gdeltTimestampToIso(beforeBatchId);
  if (beforeIso === undefined) throw new Error("Fallback boundary did not contain a valid GDELT timestamp.");
  if (!Number.isSafeInteger(maxAgeBatches) || maxAgeBatches < 1 || maxAgeBatches > 8) {
    throw new Error("Fallback batch window must be between 1 and 8.");
  }

  const lines = text.split(/\r?\n/);
  const entries: GdeltManifestEntry[] = [];
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (line.length === 0) continue;
    try {
      entries.push(parseLine(line));
    } catch (error) {
      if (index === 0) continue;
      throw error;
    }
  }

  const beforeMs = Date.parse(beforeIso);
  const byBatch = new Map<string, Map<GdeltFileKind, GdeltManifestEntry>>();
  for (const entry of entries) {
    const timestamp = gdeltTimestampToIso(entry.batchId);
    if (timestamp === undefined) continue;
    const ageMs = beforeMs - Date.parse(timestamp);
    if (ageMs <= 0 || ageMs % (15 * 60_000) !== 0 || ageMs > maxAgeBatches * 15 * 60_000) continue;
    const group = byBatch.get(entry.batchId) ?? new Map<GdeltFileKind, GdeltManifestEntry>();
    if (group.has(entry.kind)) throw new Error(`GDELT master list repeated ${entry.kind} for batch ${entry.batchId}.`);
    group.set(entry.kind, entry);
    byBatch.set(entry.batchId, group);
  }

  return [...byBatch.entries()]
    .filter(([, group]) => group.size === 3)
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([batchId, group]) => ({
      manifestUrl,
      batchId,
      batchTimestamp: gdeltTimestampToIso(batchId)!,
      files: {
        events: group.get("events")!,
        mentions: group.get("mentions")!,
        gkg: group.get("gkg")!,
      },
    }));
}
