const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/;

function seedRunId(seedSql: string): string {
  const matches = [...seedSql.matchAll(/^-- Run: ([^\r\n]+)$/gm)];
  if (matches.length !== 1 || matches[0]?.[1] === undefined) {
    throw new Error("Seed SQL must declare exactly one '-- Run: <run-id>' header.");
  }
  return matches[0][1].trim();
}

/**
 * Compose one Wrangler-atomic production refresh from a verified generated seed.
 * Only explicitly named superseded pipeline runs are retired; D1 foreign-key
 * cascades remove their child rows inside the same file import transaction.
 */
export function composeD1ProductionRefresh(seedSql: string, retiredRunIds: readonly string[]): string {
  if (!seedSql.includes("PRAGMA foreign_keys = ON;")) {
    throw new Error("Seed SQL must enable foreign keys before a production refresh.");
  }
  const currentRunId = seedRunId(seedSql);
  const retired = [...new Set(retiredRunIds)];
  if (retired.length === 0) throw new Error("At least one superseded run id is required.");
  for (const runId of retired) {
    if (!RUN_ID_PATTERN.test(runId)) throw new Error(`Invalid retired run id: ${runId}`);
    if (runId === currentRunId) throw new Error("The current seed run cannot retire itself.");
  }

  const cleanup = retired
    .sort((left, right) => left.localeCompare(right))
    .map((runId) => `DELETE FROM pipeline_runs WHERE run_id = '${runId}';`);
  return [
    seedSql.trimEnd(),
    "-- Retire only the explicitly superseded production run(s) in this same atomic import.",
    ...cleanup,
    "",
  ].join("\n");
}
