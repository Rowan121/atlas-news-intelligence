import type { CotalReceipt, IntegrationReceipt, PipelineRunInput } from "../contracts";
import { HttpProblem } from "../http";

const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/;

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new HttpProblem(400, "bad_request", `${field} must be an array of strings`);
  }
  return value;
}

function integrationReceipt(value: unknown, index: number): IntegrationReceipt {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpProblem(400, "bad_request", `integrations[${index}] must be an object`);
  }
  const input = value as Record<string, unknown>;
  for (const field of ["provider", "capability", "observed_at"] as const) {
    if (typeof input[field] !== "string" || input[field] === "") {
      throw new HttpProblem(400, "bad_request", `integrations[${index}].${field} is required`);
    }
  }
  if (!Number.isFinite(Date.parse(input.observed_at as string))) {
    throw new HttpProblem(400, "bad_request", `integrations[${index}].observed_at must be ISO-8601`);
  }
  if (input.status !== "succeeded" && input.status !== "degraded" && input.status !== "failed") {
    throw new HttpProblem(400, "bad_request", `integrations[${index}].status is invalid`);
  }
  const externalRequestId = input.external_request_id ?? null;
  if (externalRequestId !== null && typeof externalRequestId !== "string") {
    throw new HttpProblem(400, "bad_request", `integrations[${index}].external_request_id must be a string or null`);
  }
  let usage: IntegrationReceipt["usage"] = null;
  if (input.usage !== undefined && input.usage !== null) {
    if (typeof input.usage !== "object" || Array.isArray(input.usage)) {
      throw new HttpProblem(400, "bad_request", `integrations[${index}].usage must be an object or null`);
    }
    const rawUsage = input.usage as Record<string, unknown>;
    if (
      typeof rawUsage.unit !== "string"
      || rawUsage.unit === ""
      || typeof rawUsage.before !== "number"
      || !Number.isFinite(rawUsage.before)
      || typeof rawUsage.after !== "number"
      || !Number.isFinite(rawUsage.after)
      || typeof rawUsage.delta !== "number"
      || !Number.isFinite(rawUsage.delta)
      || Math.abs((rawUsage.after - rawUsage.before) - rawUsage.delta) > 1e-9
    ) {
      throw new HttpProblem(400, "bad_request", `integrations[${index}].usage must contain a consistent unit, before, after, and delta`);
    }
    usage = {
      unit: rawUsage.unit,
      before: rawUsage.before,
      after: rawUsage.after,
      delta: rawUsage.delta,
    };
  }
  return {
    provider: input.provider as string,
    capability: input.capability as string,
    status: input.status,
    observed_at: new Date(input.observed_at as string).toISOString(),
    external_request_id: externalRequestId,
    usage,
    evidence_urls: stringArray(input.evidence_urls ?? [], `integrations[${index}].evidence_urls`),
  };
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

  const integrations = input.integrations;
  if (integrations !== undefined && !Array.isArray(integrations)) {
    throw new HttpProblem(400, "bad_request", "integrations must be an array");
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
    ...(integrations === undefined
      ? {}
      : { integrations: integrations.map((entry, index) => integrationReceipt(entry, index)) }),
  };
}

export function attachCotalReceipt(
  run: Omit<PipelineRunInput, "cotal_receipt">,
  rawReceipt: unknown,
): PipelineRunInput {
  return { ...run, cotal_receipt: parseCotalReceipt(rawReceipt) };
}
