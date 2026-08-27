import type {
  GdeltActionGeo,
  GdeltEventRecord,
  GdeltGkgRecord,
  GdeltMentionRecord,
  ParsedTable,
} from "./types.js";
import { gdeltTimestampToIso } from "./manifest.js";

function rows(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.length > 0);
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function finiteNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integer(value: string | undefined): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function httpUrl(value: string | undefined): string | undefined {
  const candidate = optional(value);
  if (candidate === undefined) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function actionGeo(fields: string[]): GdeltActionGeo | undefined {
  const type = integer(fields[51]);
  const fullName = optional(fields[52]);
  const latitude = finiteNumber(fields[56]);
  const longitude = finiteNumber(fields[57]);
  if (
    type === undefined ||
    fullName === undefined ||
    latitude === undefined ||
    longitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return undefined;
  }
  const countryCode = optional(fields[53]);
  const adm1Code = optional(fields[54]);
  const adm2Code = optional(fields[55]);
  const featureId = optional(fields[58]);
  return {
    type,
    fullName,
    ...(countryCode === undefined ? {} : { countryCode }),
    ...(adm1Code === undefined ? {} : { adm1Code }),
    ...(adm2Code === undefined ? {} : { adm2Code }),
    latitude,
    longitude,
    ...(featureId === undefined ? {} : { featureId }),
  };
}

export function parseEventsTsv(text: string, maxRows: number): ParsedTable<GdeltEventRecord> {
  const records: GdeltEventRecord[] = [];
  let malformed = 0;
  const sourceRows = rows(text);
  const count = Math.min(sourceRows.length, maxRows);
  for (let index = 0; index < count; index += 1) {
    const fields = sourceRows[index]!.split("\t");
    const globalEventId = optional(fields[0]);
    const dateAdded = gdeltTimestampToIso(fields[59] ?? "");
    if (fields.length < 61 || globalEventId === undefined || dateAdded === undefined) {
      malformed += 1;
      continue;
    }
    const geo = actionGeo(fields);
    const sourceUrl = httpUrl(fields[60]);
    records.push({
      globalEventId,
      dateAdded,
      ...(sourceUrl === undefined ? {} : { sourceUrl }),
      ...(geo === undefined ? {} : { actionGeo: geo }),
    });
  }
  return {
    records,
    diagnostics: {
      rowsSeen: count,
      rowsAccepted: records.length,
      rowsMalformed: malformed,
      hitRowCap: sourceRows.length > maxRows,
    },
  };
}

export function parseMentionsTsv(text: string, maxRows: number): ParsedTable<GdeltMentionRecord> {
  const records: GdeltMentionRecord[] = [];
  let malformed = 0;
  const sourceRows = rows(text);
  const count = Math.min(sourceRows.length, maxRows);
  for (let index = 0; index < count; index += 1) {
    const fields = sourceRows[index]!.split("\t");
    const globalEventId = optional(fields[0]);
    const eventTimeDate = gdeltTimestampToIso(fields[1] ?? "");
    const mentionTimeDate = gdeltTimestampToIso(fields[2] ?? "");
    const mentionType = integer(fields[3]);
    const mentionSourceName = optional(fields[4]);
    const mentionIdentifier = httpUrl(fields[5]);
    const inRawText = integer(fields[10]);
    const confidence = finiteNumber(fields[11]);
    if (
      fields.length < 15 ||
      globalEventId === undefined ||
      eventTimeDate === undefined ||
      mentionTimeDate === undefined ||
      mentionType === undefined ||
      mentionSourceName === undefined ||
      mentionIdentifier === undefined ||
      (inRawText !== 0 && inRawText !== 1) ||
      confidence === undefined ||
      confidence < 0 ||
      confidence > 100
    ) {
      malformed += 1;
      continue;
    }
    const sentenceId = integer(fields[6]);
    const translationInfo = optional(fields[14]);
    records.push({
      globalEventId,
      eventTimeDate,
      mentionTimeDate,
      mentionType,
      mentionSourceName,
      mentionIdentifier,
      ...(sentenceId === undefined ? {} : { sentenceId }),
      inRawText: inRawText === 1,
      confidence,
      ...(translationInfo === undefined ? {} : { translationInfo }),
    });
  }
  return {
    records,
    diagnostics: {
      rowsSeen: count,
      rowsAccepted: records.length,
      rowsMalformed: malformed,
      hitRowCap: sourceRows.length > maxRows,
    },
  };
}

export function decodeGdeltHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
    nbsp: " ",
  };
  return value
    .replace(/&#x([a-fA-F0-9]+);/g, (_whole, digits: string) => {
      const codepoint = Number.parseInt(digits, 16);
      try {
        return Number.isFinite(codepoint) ? String.fromCodePoint(codepoint) : _whole;
      } catch {
        return _whole;
      }
    })
    .replace(/&#(\d+);/g, (_whole, digits: string) => {
      const codepoint = Number.parseInt(digits, 10);
      try {
        return Number.isFinite(codepoint) ? String.fromCodePoint(codepoint) : _whole;
      } catch {
        return _whole;
      }
    })
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) => named[name.toLowerCase()] ?? whole);
}

export function extractPageTitle(extras: string | undefined): string | undefined {
  if (extras === undefined) return undefined;
  const raw = extras.match(/<PAGE_TITLE>([\s\S]*?)<\/PAGE_TITLE>/i)?.[1];
  if (raw === undefined) return undefined;
  const decoded = decodeGdeltHtmlEntities(raw).replace(/\s+/g, " ").trim();
  return decoded.length === 0 ? undefined : decoded.slice(0, 600);
}

export function parseGkgTsv(
  text: string,
  maxRows: number,
  documentFilter?: ReadonlySet<string>,
): ParsedTable<GdeltGkgRecord> {
  const records: GdeltGkgRecord[] = [];
  let malformed = 0;
  const sourceRows = rows(text);
  const count = Math.min(sourceRows.length, maxRows);
  for (let index = 0; index < count; index += 1) {
    const fields = sourceRows[index]!.split("\t");
    const recordId = optional(fields[0]);
    const publishedAt = gdeltTimestampToIso(fields[1] ?? "");
    const sourceCollectionIdentifier = integer(fields[2]);
    const sourceCommonName = optional(fields[3]);
    const documentIdentifier = httpUrl(fields[4]);
    if (
      fields.length < 27 ||
      recordId === undefined ||
      publishedAt === undefined ||
      sourceCollectionIdentifier === undefined ||
      sourceCommonName === undefined ||
      documentIdentifier === undefined
    ) {
      malformed += 1;
      continue;
    }
    if (documentFilter !== undefined && !documentFilter.has(documentIdentifier)) continue;
    const translationInfo = optional(fields[25]);
    const pageTitle = extractPageTitle(fields[26]);
    records.push({
      recordId,
      publishedAt,
      sourceCollectionIdentifier,
      sourceCommonName,
      documentIdentifier,
      ...(translationInfo === undefined ? {} : { translationInfo }),
      ...(pageTitle === undefined ? {} : { pageTitle }),
    });
  }
  return {
    records,
    diagnostics: {
      rowsSeen: count,
      rowsAccepted: records.length,
      rowsMalformed: malformed,
      hitRowCap: sourceRows.length > maxRows,
    },
  };
}
