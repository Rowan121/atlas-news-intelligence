import type { StoryCluster, ValidationIssue } from "../schema/types.js";
import { validateStoryCluster } from "../schema/types.js";
import type { PipelineResult } from "./pipeline.js";

export type TruthSliceFailureReason =
  | "no_articles"
  | "no_current_cluster"
  | "no_geolocated_cluster"
  | "no_multi_outlet_cluster"
  | "invalid_cluster";

export interface TruthSliceSuccess {
  ok: true;
  cluster: StoryCluster;
  evidence: {
    outletCount: number;
    providerCount: number;
    locationEvidenceCount: number;
    window: { from: string; to: string };
  };
}

export interface TruthSliceFailure {
  ok: false;
  reason: TruthSliceFailureReason;
  message: string;
  issues: ValidationIssue[];
}

export type TruthSliceResult = TruthSliceSuccess | TruthSliceFailure;

function withinWindow(cluster: StoryCluster, from: string, to: string): boolean {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return cluster.articles.some((article) => {
    const timestamp = Date.parse(article.publishedAt ?? article.retrievedAt);
    return timestamp >= start && timestamp <= end;
  });
}

export function validateTruthSlice(cluster: StoryCluster, from: string, to: string): ValidationIssue[] {
  const issues = validateStoryCluster(cluster);
  const outlets = new Set(cluster.articles.map((article) => article.publisher.id));
  if (outlets.size < 2) {
    issues.push({
      code: "insufficient_independent_outlets",
      path: "articles",
      message: "Truth slice requires at least two distinct publishers.",
    });
  }
  if (cluster.eventLocations.length === 0) {
    issues.push({
      code: "missing_event_location",
      path: "eventLocations",
      message: "Truth slice requires an evidence-backed event location.",
    });
  }
  if (!withinWindow(cluster, from, to)) {
    issues.push({
      code: "outside_window",
      path: "articles",
      message: "No article observation falls inside the requested window.",
    });
  }
  return issues;
}

export function selectTruthSlice(pipeline: PipelineResult): TruthSliceResult {
  if (pipeline.articles.length === 0) {
    return {
      ok: false,
      reason: "no_articles",
      message: "No live articles were returned; no truth slice can be claimed.",
      issues: [],
    };
  }
  const current = pipeline.clusters.filter((cluster) => withinWindow(cluster, pipeline.window.from, pipeline.window.to));
  if (current.length === 0) {
    return {
      ok: false,
      reason: "no_current_cluster",
      message: "No cluster contains an observation in the requested window.",
      issues: [],
    };
  }
  const geolocated = current.filter((cluster) => cluster.eventLocations.length > 0);
  if (geolocated.length === 0) {
    return {
      ok: false,
      reason: "no_geolocated_cluster",
      message: "No current cluster has evidence-backed event geolocation.",
      issues: [],
    };
  }
  const multiOutlet = geolocated.filter(
    (cluster) => new Set(cluster.articles.map((article) => article.publisher.id)).size >= 2,
  );
  if (multiOutlet.length === 0) {
    return {
      ok: false,
      reason: "no_multi_outlet_cluster",
      message: "No current geolocated cluster has two independent outlets.",
      issues: [],
    };
  }
  const ranked = [...multiOutlet].sort((left, right) => {
    const leftOutlets = new Set(left.articles.map((article) => article.publisher.id)).size;
    const rightOutlets = new Set(right.articles.map((article) => article.publisher.id)).size;
    return rightOutlets - leftOutlets || right.articles.length - left.articles.length;
  });
  for (const cluster of ranked) {
    const issues = validateTruthSlice(cluster, pipeline.window.from, pipeline.window.to);
    if (issues.length === 0) {
      return {
        ok: true,
        cluster,
        evidence: {
          outletCount: new Set(cluster.articles.map((article) => article.publisher.id)).size,
          providerCount: new Set(cluster.articles.map((article) => article.source.provider)).size,
          locationEvidenceCount: cluster.eventLocations.reduce(
            (sum, location) => sum + location.evidence.length,
            0,
          ),
          window: { from: pipeline.window.from, to: pipeline.window.to },
        },
      };
    }
  }
  return {
    ok: false,
    reason: "invalid_cluster",
    message: "Candidate clusters failed truth validation.",
    issues: ranked.flatMap((cluster) => validateTruthSlice(cluster, pipeline.window.from, pipeline.window.to)),
  };
}
