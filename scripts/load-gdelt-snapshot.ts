import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  loadGdeltSnapshotFromManifest,
  loadLatestGdeltSnapshot,
} from "../src/ingestion/gdelt-stream/loader.js";
import {
  DEFAULT_MASTER_FILE_LIST_URL,
  parseLastUpdate,
} from "../src/ingestion/gdelt-stream/manifest.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function positiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

const outputPath = resolve(argument("--output") ?? "artifacts/gdelt-latest.json");
const timeoutMs = positiveInteger(argument("--timeout-ms"), "--timeout-ms") ?? 25_000;
const maxClusters = positiveInteger(argument("--max-clusters"), "--max-clusters");
const manifestFile = argument("--manifest-file");
const loadOptions = {
  fetchPolicy: { timeoutMs, attempts: 2, initialBackoffMs: 750 },
  ...(maxClusters === undefined ? {} : { limits: { maxClusters } }),
};
const result = manifestFile === undefined
  ? await loadLatestGdeltSnapshot(loadOptions)
  : await loadGdeltSnapshotFromManifest(
      parseLastUpdate(
        await readFile(resolve(manifestFile), "utf8"),
        DEFAULT_MASTER_FILE_LIST_URL,
      ),
      loadOptions,
    );

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
try {
  await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, outputPath);
} finally {
  await unlink(temporaryPath).catch(() => undefined);
}

if (!result.ok) {
  console.error(
    JSON.stringify({
      ok: false,
      outputPath,
      stage: result.error.stage,
      kind: result.error.kind,
      message: result.error.message,
      diagnostics: result.diagnostics,
    }),
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify({
      ok: true,
      outputPath,
      batchId: result.snapshot.batchId,
      clusters: result.snapshot.statistics.clustersEmitted,
      articles: result.snapshot.statistics.articlesEmitted,
      health: result.snapshot.health.status,
    }),
  );
}
