import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalizeUrl } from "../src/ingestion/sources.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const inputPath = resolve(argument("--input") ?? "artifacts/tavily-multibranch-receipt.json");
const outputPath = resolve(argument("--output") ?? "artifacts/tavily-multibranch-receipt-curated.json");
const selectedIds = new Set((argument("--clusters") ?? "").split(",").map((value) => value.trim()).filter(Boolean));
if (selectedIds.size === 0) throw new Error("--clusters must name at least one verified cluster id.");

const receipt = JSON.parse(await readFile(inputPath, "utf8")) as any;
const stories = (receipt.verification?.stories ?? []).filter((story: any) => selectedIds.has(story.cluster_id));
const foundIds = new Set(stories.map((story: any) => story.cluster_id));
const missing = [...selectedIds].filter((id) => !foundIds.has(id));
if (missing.length > 0) throw new Error(`Selected cluster ids are absent from the receipt: ${missing.join(", ")}`);

const selectedTitles = new Set(stories.map((story: any) => story.canonical_title));
const searches = (receipt.searches ?? []).filter((search: any) => selectedTitles.has(search.query));
const selectedUrls = new Set(searches.flatMap((search: any) => search.results.map((result: any) => canonicalizeUrl(result.url))));
const extractions = (receipt.extract?.results ?? []).filter((result: any) => selectedUrls.has(canonicalizeUrl(result.url)));

const curated = {
  ...receipt,
  observed_at: receipt.observed_at,
  searches,
  extract: { ...receipt.extract, results: extractions },
  verification: {
    ...receipt.verification,
    qualified_story_count: stories.length,
    stories,
    curation: {
      selected_cluster_ids: [...selectedIds],
      basis: "manual audit retained distinct events with three publisher networks and materially different article emphasis; copied wires, social posts, press-release derivatives, and duplicate event facets were excluded",
    },
  },
};

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
try {
  await writeFile(temporaryPath, `${JSON.stringify(curated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, outputPath);
} finally {
  await unlink(temporaryPath).catch(() => undefined);
}

console.log(JSON.stringify({ ok: true, outputPath, stories: stories.length, searches: searches.length, extractions: extractions.length }));
