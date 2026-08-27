import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { composeD1ProductionRefresh } from "../src/export/d1-refresh.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function argumentsFor(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1] !== undefined) {
      values.push(process.argv[index + 1]!);
    }
  }
  return values;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const inputPath = resolve(argument("--input") ?? "artifacts/p0-editorial-market-final.sql");
const outputPath = resolve(argument("--output") ?? "artifacts/p0-editorial-market-production.sql");
const expectedInputSha = argument("--input-sha");
if (expectedInputSha === undefined || !/^[0-9a-f]{64}$/.test(expectedInputSha)) {
  throw new Error("--input-sha must provide the approved 64-character SHA-256.");
}
const retiredRunIds = argumentsFor("--retire-run");
const seedSql = await readFile(inputPath, "utf8");
const inputSha = sha256(seedSql);
if (inputSha !== expectedInputSha) {
  throw new Error(`Input SQL hash mismatch: expected ${expectedInputSha}, received ${inputSha}.`);
}
const productionSql = composeD1ProductionRefresh(seedSql, retiredRunIds);

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
try {
  await writeFile(temporaryPath, productionSql, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, outputPath);
} finally {
  await unlink(temporaryPath).catch(() => undefined);
}

console.log(JSON.stringify({
  ok: true,
  inputPath,
  inputSha256: inputSha,
  outputPath,
  outputSha256: sha256(productionSql),
  retiredRunIds,
}));
