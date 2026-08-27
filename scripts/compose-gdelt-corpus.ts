import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ArticleClusterDraft } from "../src/clustering/engine.js";
import { snapshotFromDocument } from "../src/export/d1-seed.js";
import { mergeDuplicateGdeltClusters, validateIntelligenceSnapshot } from "../src/ingestion/gdelt-stream/snapshot.js";
import type { GdeltSnapshotStatistics, IntelligenceSnapshot, ParseDiagnostics } from "../src/ingestion/gdelt-stream/types.js";
import { computeRegionalProminence } from "../src/prominence/metrics.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function idSet(name: string): Set<string> {
  return new Set((argument(name) ?? "").split(",").map((value) => value.trim()).filter(Boolean));
}

function addDiagnostics(left: ParseDiagnostics, right: ParseDiagnostics): ParseDiagnostics {
  return {
    rowsSeen: left.rowsSeen + right.rowsSeen,
    rowsAccepted: left.rowsAccepted + right.rowsAccepted,
    rowsMalformed: left.rowsMalformed + right.rowsMalformed,
    hitRowCap: left.hitRowCap || right.hitRowCap,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const oldPath = resolve(argument("--old") ?? "artifacts/gdelt-old-approved-enriched.json");
const freshPath = resolve(argument("--fresh") ?? "artifacts/gdelt-fresh-approved-enriched.json");
const outputPath = resolve(argument("--output") ?? "artifacts/gdelt-production-combined.json");
const excludeOld = idSet("--exclude-old-clusters");
const excludeFresh = idSet("--exclude-fresh-clusters");
const approvedIds = idSet("--approved-clusters");

const oldRaw = await readFile(oldPath, "utf8");
const freshRaw = await readFile(freshPath, "utf8");
const oldSnapshot = snapshotFromDocument(JSON.parse(oldRaw));
const freshSnapshot = snapshotFromDocument(JSON.parse(freshRaw));

const oldClusters = oldSnapshot.clusters.filter((cluster) => !excludeOld.has(cluster.id));
const freshClusters = freshSnapshot.clusters.filter((cluster) => !excludeFresh.has(cluster.id));
const clusters = mergeDuplicateGdeltClusters([...oldClusters, ...freshClusters]);
const drafts: ArticleClusterDraft[] = clusters.map((cluster) => ({
  id: cluster.id,
  canonicalTitle: cluster.canonicalTitle,
  articles: cluster.articles,
  memberships: cluster.memberships,
  eventLocations: cluster.eventLocations,
  firstObservedAt: cluster.firstObservedAt,
  lastObservedAt: cluster.lastObservedAt,
}));
const prominence = computeRegionalProminence(drafts);
const generatedAt = [oldSnapshot.generatedAt, freshSnapshot.generatedAt].sort().at(-1)!;
const warnings = [
  `Composed complete GDELT batches ${oldSnapshot.batchId} and ${freshSnapshot.batchId} into one corpus-wide prominence denominator.`,
  `Excluded ${excludeOld.size + excludeFresh.size} reviewed duplicate or continuation cluster(s) before composition.`,
];
const health = {
  status: "healthy" as const,
  fetchedAt: generatedAt,
  sourceCount: 4,
  successfulSourceCount: 4,
  warnings,
};
for (const cluster of clusters) {
  cluster.prominence = prominence.get(cluster.id) ?? [];
  cluster.health = health;
}

const oldStats = oldSnapshot.statistics;
const freshStats = freshSnapshot.statistics;
const statistics: GdeltSnapshotStatistics = {
  rows: {
    events: addDiagnostics(oldStats.rows.events, freshStats.rows.events),
    mentions: addDiagnostics(oldStats.rows.mentions, freshStats.rows.mentions),
    gkg: addDiagnostics(oldStats.rows.gkg, freshStats.rows.gkg),
  },
  eligibleMentions: oldStats.eligibleMentions + freshStats.eligibleMentions,
  joinedMentions: oldStats.joinedMentions + freshStats.joinedMentions,
  droppedWithoutGkg: oldStats.droppedWithoutGkg + freshStats.droppedWithoutGkg,
  droppedWithoutTitle: oldStats.droppedWithoutTitle + freshStats.droppedWithoutTitle,
  clustersBeforeCap: clusters.length,
  clustersEmitted: clusters.length,
  articlesEmitted: clusters.reduce((sum, cluster) => sum + cluster.articles.length, 0),
};

const snapshot: IntelligenceSnapshot = {
  ...structuredClone(freshSnapshot),
  generatedAt,
  batchId: freshSnapshot.batchId,
  batchTimestamp: freshSnapshot.batchTimestamp,
  limits: { ...freshSnapshot.limits, maxClusters: clusters.length },
  statistics,
  health,
  clusters,
  validationIssues: [],
};
const issues = validateIntelligenceSnapshot(snapshot);
if (issues.length > 0) {
  throw new Error(`Combined snapshot failed validation: ${issues.slice(0, 10).map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
}
const presentApprovedIds = new Set(clusters.filter((cluster) => approvedIds.has(cluster.id) && cluster.articles.length >= 3).map((cluster) => cluster.id));
const missingApprovedIds = [...approvedIds].filter((id) => !presentApprovedIds.has(id));
if (missingApprovedIds.length > 0) {
  throw new Error(`Approved multi-branch clusters missing or below three articles: ${missingApprovedIds.join(", ")}`);
}

const output = {
  ok: true,
  snapshot,
  diagnostics: warnings,
  composition: {
    old: { path: oldPath, sha256: sha256(oldRaw), batchId: oldSnapshot.batchId, retainedClusters: oldClusters.length },
    fresh: { path: freshPath, sha256: sha256(freshRaw), batchId: freshSnapshot.batchId, retainedClusters: freshClusters.length },
    approvedMultiBranchClusterIds: [...approvedIds],
    approvedMultiBranchStories: presentApprovedIds.size,
  },
};

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
try {
  await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, outputPath);
} finally {
  await unlink(temporaryPath).catch(() => undefined);
}

console.log(JSON.stringify({
  ok: true,
  outputPath,
  batchId: snapshot.batchId,
  clusters: statistics.clustersEmitted,
  articles: statistics.articlesEmitted,
  approvedMultiBranchStories: presentApprovedIds.size,
}));
