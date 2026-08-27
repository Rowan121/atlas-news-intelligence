import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import type { GdeltFileKind, GdeltLoadErrorKind, GdeltLoadStage, GdeltManifestEntry } from "./types.js";

export interface FetchPolicy {
  fetch?: typeof fetch;
  timeoutMs?: number;
  attempts?: number;
  initialBackoffMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class GdeltStreamError extends Error {
  constructor(
    readonly stage: GdeltLoadStage,
    readonly kind: GdeltLoadErrorKind,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GdeltStreamError";
  }
}

const defaultSleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryAfterMilliseconds(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(5_000, seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, Math.min(5_000, timestamp - Date.now())) : undefined;
}

async function responseBytes(response: Response, maxBytes: number, stage: GdeltLoadStage): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new GdeltStreamError(stage, "too_large", `GDELT ${stage} response exceeded its compressed-size cap.`, false);
  }
  if (response.body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new GdeltStreamError(stage, "too_large", `GDELT ${stage} response exceeded its compressed-size cap.`, false);
    }
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("size cap exceeded");
        throw new GdeltStreamError(stage, "too_large", `GDELT ${stage} response exceeded its compressed-size cap.`, false);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function networkError(stage: GdeltLoadStage, error: unknown): GdeltStreamError {
  const aborted =
    error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
  return new GdeltStreamError(
    stage,
    aborted ? "timeout" : "network",
    aborted ? `GDELT ${stage} download timed out.` : `GDELT ${stage} download failed at the network layer.`,
    true,
  );
}

export async function fetchCappedBytes(
  url: string,
  stage: GdeltLoadStage,
  maxBytes: number,
  policy: FetchPolicy = {},
): Promise<Uint8Array> {
  const fetchImpl = policy.fetch ?? fetch;
  const timeoutMs = policy.timeoutMs ?? 20_000;
  const attempts = Math.max(1, Math.min(3, policy.attempts ?? 2));
  const initialBackoffMs = Math.max(0, Math.min(5_000, policy.initialBackoffMs ?? 500));
  const sleep = policy.sleep ?? defaultSleep;
  let finalError: GdeltStreamError | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let retryDelay = initialBackoffMs * 2 ** attempt;
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "text/plain, application/zip, application/octet-stream" },
        redirect: "follow",
        signal: controller.signal,
      });
      if (response.status === 429) {
        retryDelay = retryAfterMilliseconds(response) ?? retryDelay;
        throw new GdeltStreamError(stage, "rate_limited", `GDELT rate limited the ${stage} download.`, true);
      }
      if (!response.ok) {
        throw new GdeltStreamError(
          stage,
          "http",
          `GDELT ${stage} download returned HTTP ${response.status}.`,
          response.status === 408 || response.status >= 500,
        );
      }
      return await responseBytes(response, maxBytes, stage);
    } catch (error) {
      finalError = error instanceof GdeltStreamError ? error : networkError(stage, error);
      if (!finalError.retryable || attempt === attempts - 1) throw finalError;
    } finally {
      clearTimeout(timer);
    }
    await sleep(Math.min(5_000, retryDelay));
  }
  throw finalError ?? new GdeltStreamError(stage, "network", "GDELT download failed.", true);
}

export function verifyManifestBytes(entry: GdeltManifestEntry, bytes: Uint8Array): void {
  if (bytes.byteLength !== entry.compressedBytes) {
    throw new GdeltStreamError(
      entry.kind,
      "checksum_mismatch",
      `GDELT ${entry.kind} byte count differed from lastupdate.txt.`,
      true,
    );
  }
  const digest = createHash("md5").update(bytes).digest("hex");
  if (digest !== entry.md5) {
    throw new GdeltStreamError(
      entry.kind,
      "checksum_mismatch",
      `GDELT ${entry.kind} MD5 differed from lastupdate.txt.`,
      true,
    );
  }
}

export function unzipSingleCsv(
  bytes: Uint8Array,
  kind: GdeltFileKind,
  maxDecompressedBytes: number,
): string {
  let rejectedForSize = false;
  let rejectedForPath = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (file.originalSize > maxDecompressedBytes) {
          rejectedForSize = true;
          return false;
        }
        if (file.name.startsWith("/") || file.name.split("/").includes("..")) {
          rejectedForPath = true;
          return false;
        }
        return file.name.toLowerCase().endsWith(".csv");
      },
    });
  } catch {
    throw new GdeltStreamError(kind, "archive_invalid", `GDELT ${kind} ZIP could not be decompressed.`, false);
  }
  if (rejectedForSize) {
    throw new GdeltStreamError(kind, "too_large", `GDELT ${kind} CSV exceeded its decompressed-size cap.`, false);
  }
  if (rejectedForPath) {
    throw new GdeltStreamError(kind, "archive_invalid", `GDELT ${kind} ZIP contained an unsafe path.`, false);
  }
  const entries = Object.entries(files);
  if (entries.length !== 1) {
    throw new GdeltStreamError(kind, "archive_invalid", `GDELT ${kind} ZIP must contain exactly one CSV.`, false);
  }
  const csv = entries[0]![1];
  if (csv.byteLength > maxDecompressedBytes) {
    throw new GdeltStreamError(kind, "too_large", `GDELT ${kind} CSV exceeded its decompressed-size cap.`, false);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(csv);
}
