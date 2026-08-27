import type { CotalReceipt, PipelineRunInput } from "../contracts";
import { HttpProblem } from "../http";

const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/;

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new HttpProblem(400, "bad_request", `${field} must be an array of strings`);
  }
  return value;
}

export function parseCotalReceipt(value: unknown): CotalReceipt {
  if (value === null || typeof value !== "object") {
    throw new HttpProblem(400, "bad_request", "Cotal receipt must be an object");
  }

  const input = value as Record<string, unknown>;
  if (typeof input.agent !== "string" || input.agent.trim() === "") {
    throw new HttpProblem(400, "bad_request", "Cotal receipt agent is required");
  }
  if (typeof input.task_id !== "string" || input.task_id.trim() === "") {
    throw new HttpProblem(400, "bad_request", "Cotal receipt task_id is required");
  }

  const commit = input.commit === null || input.commit === undefined ? null : input.commit;
  if (commit !== null && (typeof commit !== "string" || !COMMIT_PATTERN.test(commit))) {
    throw new HttpProblem(400, "bad_request", "Cotal receipt commit must be a Git SHA");
  }

  const next = input.next === null || input.next === undefined ? null : input.next;
  if (next !== null && typeof next !== "string") {
    throw new HttpProblem(400, "bad_request", "Cotal receipt next must be a string or null");
  }

  return {
    agent: input.agent.trim(),
    task_id: input.task_id.trim(),
    commit,
    tests: stringArray(input.tests ?? [], "tests"),
    artifact_paths: stringArray(input.artifact_paths ?? [], "artifact_paths"),
    evidence_urls: stringArray(input.evidence_urls ?? [], "evidence_urls"),
    blockers: stringArray(input.blockers ?? [], "blockers"),
    next,
  };
}

export function attachCotalReceipt(
  run: Omit<PipelineRunInput, "cotal_receipt">,
  rawReceipt: unknown,
): PipelineRunInput {
  return { ...run, cotal_receipt: parseCotalReceipt(rawReceipt) };
}
