import { describe, it } from "node:test";
import { HttpProblem } from "../http";
import { attachCotalReceipt, parseCotalReceipt } from "../provenance/cotal";
import { expect } from "./expect";

describe("Cotal provenance adapter", () => {
  const receipt = {
    agent: "surface_runtime",
    task_id: "surface-001",
    commit: "6876276",
    tests: ["11 tests passed"],
    artifact_paths: ["surface/src/index.ts"],
    evidence_urls: ["https://docs.runtype.com/"],
    blockers: [],
    next: "await coordinator",
  };

  it("accepts the canonical coordination receipt", () => {
    expect(parseCotalReceipt(receipt)).toEqual(receipt);
  });

  it("rejects an invalid commit without leaking content", () => {
    expect(() => parseCotalReceipt({ ...receipt, commit: "not a sha" })).toThrow(HttpProblem);
  });

  it("attaches provenance to a pipeline run", () => {
    const run = attachCotalReceipt(
      {
        run_id: "run-test",
        source: "test-only",
        status: "succeeded",
        input_fingerprint: "fixture-fingerprint",
        started_at: "2026-08-26T10:00:00.000Z",
        completed_at: "2026-08-26T10:01:00.000Z",
        source_watermark_at: "2026-08-26T09:59:00.000Z",
        records_seen: 1,
        records_upserted: 1,
        error_kind: null,
        error_message: null,
        retryable: false,
      },
      receipt,
    );
    expect(run.cotal_receipt?.agent).toBe("surface_runtime");
  });

  it("preserves consistent before/after sponsor usage without credentials", () => {
    const parsed = parseCotalReceipt({
      ...receipt,
      integrations: [{
        provider: "tavily",
        capability: "news_enrichment",
        status: "succeeded",
        observed_at: "2026-08-27T08:00:00.000Z",
        external_request_id: "sanitized-request-id",
        usage: { unit: "credits", before: 1000, after: 998, delta: -2 },
        evidence_urls: ["https://docs.tavily.com/"],
      }],
    });
    expect(parsed.integrations?.[0]).toMatchObject({
      provider: "tavily",
      usage: { before: 1000, after: 998, delta: -2 },
    });
  });

  it("rejects inconsistent sponsor usage deltas", () => {
    expect(() => parseCotalReceipt({
      ...receipt,
      integrations: [{
        provider: "mitosis",
        capability: "workflow_provenance",
        status: "succeeded",
        observed_at: "2026-08-27T08:00:00.000Z",
        external_request_id: null,
        usage: { unit: "credits", before: 500, after: 499, delta: 0 },
        evidence_urls: [],
      }],
    })).toThrow(HttpProblem);
  });
});
