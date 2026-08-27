import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  convertSnapshotToD1,
  renderD1Seed,
  snapshotFromDocument,
} from "../src/export/d1-seed.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const inputPath = resolve(argument("--input") ?? "artifacts/gdelt-latest.json");
const outputPath = resolve(argument("--output") ?? "artifacts/gdelt-latest.sql");
const document: unknown = JSON.parse(await readFile(inputPath, "utf8"));
const snapshot = snapshotFromDocument(document);
const dataset = convertSnapshotToD1(snapshot);
const sql = renderD1Seed(dataset);

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
try {
  await writeFile(temporaryPath, sql, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, outputPath);
} finally {
  await unlink(temporaryPath).catch(() => undefined);
}

console.log(JSON.stringify({
  ok: true,
  inputPath,
  outputPath,
  runId: dataset.run.run_id,
  status: dataset.run.status,
  clusters: dataset.clusters.length,
  articles: dataset.clusters.reduce((sum, cluster) => sum + cluster.articles.length, 0),
  locationEvidence: dataset.clusters.reduce((sum, cluster) => sum + cluster.locationEvidence.length, 0),
}));
