import type { ProminenceMetric, StoryQuery } from "./contracts";
import { failure, HttpProblem, json, parsePositiveInt, parseTimestamp, success } from "./http";
import { buildIntelligenceSnapshot, type IntelligenceWindow } from "./intelligence";
import { handleMcp } from "./mcp";
import type { TruthStore } from "./store";
import { D1TruthStore } from "./storage/d1";

export interface Env {
  DB: D1Database;
  BUILD_VERSION?: string;
  CORS_ORIGIN?: string;
  ENVIRONMENT?: string;
  STALE_AFTER_SECONDS?: string;
}

export interface RuntimeDependencies {
  clock?: () => Date;
  requestId?: () => string;
  store?: TruthStore;
}

function parseStaleAfter(value: string | undefined): number {
  if (value === undefined) return 1800;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 60 ? Math.floor(parsed) : 1800;
}

function methodProblem(): HttpProblem {
  return new HttpProblem(405, "method_not_allowed", "Method not allowed");
}

function parseStoryQuery(url: URL): StoryQuery {
  const metricValue = url.searchParams.get("metric") ?? "normalized";
  if (metricValue !== "raw" && metricValue !== "normalized") {
    throw new HttpProblem(400, "bad_request", "metric must be raw or normalized");
  }
  const metric: ProminenceMetric = metricValue;
  const region = url.searchParams.get("region")?.trim().toUpperCase();
  if (region !== undefined && (region.length < 2 || region.length > 16 || !/^[A-Z0-9_-]+$/.test(region))) {
    throw new HttpProblem(400, "bad_request", "region must be a 2-16 character geographic code");
  }
  const since = parseTimestamp(url.searchParams.get("since"), "since");
  const until = parseTimestamp(url.searchParams.get("until"), "until");
  if (since !== undefined && until !== undefined && since > until) {
    throw new HttpProblem(400, "bad_request", "since must not be after until");
  }
  return {
    metric,
    limit: parsePositiveInt(url.searchParams.get("limit"), 20, 100),
    ...(region === undefined || region === "" ? {} : { region }),
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
  };
}

export function createWorker(dependencies: RuntimeDependencies = {}): ExportedHandler<Env> {
  return {
    async fetch(request, env): Promise<Response> {
      const now = dependencies.clock?.() ?? new Date();
      const requestId = dependencies.requestId?.() ?? crypto.randomUUID();
      const url = new URL(request.url);
      const staleAfterSeconds = parseStaleAfter(env.STALE_AFTER_SECONDS);
      const store = dependencies.store ?? new D1TruthStore(env.DB);

      const corsHeaders = {
        "Access-Control-Allow-Origin": env.CORS_ORIGIN ?? "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
        Vary: "Origin",
      };

      try {
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

        if (url.pathname === "/") {
          if (request.method !== "GET") throw methodProblem();
          const response = success(
            {
              service: "atlas-news-intelligence",
              version: env.BUILD_VERSION ?? "development",
              data_policy: "real records only; uncertainty and source evidence are preserved",
              links: {
                health: "/health",
                stories: "/api/stories",
                story: "/api/stories/{cluster_id}",
                intelligence: "/api/v1/intelligence?window=24h&prominence=normalized",
                mcp: "/mcp",
              },
            },
            requestId,
            now,
            { headers: { "Cache-Control": "public, max-age=300" } },
          );
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/health") {
          if (request.method !== "GET") throw methodProblem();
          const health = await store.getHealth(now, staleAfterSeconds);
          const response = success(health, requestId, now, {
            status: health.status === "unavailable" ? 503 : 200,
            headers: { "Cache-Control": "no-store" },
          });
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/api/stories") {
          if (request.method !== "GET") throw methodProblem();
          const query = parseStoryQuery(url);
          const stories = await store.listStories(query, now, staleAfterSeconds);
          const response = success(
            { stories, query, count: stories.length },
            requestId,
            now,
            { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
          );
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/api/v1/intelligence") {
          if (request.method !== "GET") throw methodProblem();
          const windowValue = url.searchParams.get("window") ?? "24h";
          const prominenceValue = url.searchParams.get("prominence") ?? "normalized";
          if (windowValue !== "6h" && windowValue !== "24h" && windowValue !== "7d") {
            throw new HttpProblem(400, "bad_request", "window must be 6h, 24h, or 7d");
          }
          if (prominenceValue !== "raw" && prominenceValue !== "normalized") {
            throw new HttpProblem(400, "bad_request", "prominence must be raw or normalized");
          }
          const snapshot = await buildIntelligenceSnapshot(
            store,
            windowValue as IntelligenceWindow,
            prominenceValue,
            now,
            staleAfterSeconds,
          );
          if (snapshot.health.status === "stale" && snapshot.clusters.length === 0) {
            throw new HttpProblem(503, "database_unavailable", "No current evidence-backed intelligence is available", true);
          }
          const response = json(snapshot, {
            headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
          });
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        const match = url.pathname.match(/^\/api\/stories\/([^/]+)$/);
        if (match !== null) {
          if (request.method !== "GET") throw methodProblem();
          const rawId = match[1];
          if (rawId === undefined) throw new HttpProblem(400, "bad_request", "cluster_id is required");
          const clusterId = decodeURIComponent(rawId);
          if (clusterId === "" || clusterId.length > 200) {
            throw new HttpProblem(400, "bad_request", "cluster_id is invalid");
          }
          const story = await store.getStory(clusterId);
          if (story === null) throw new HttpProblem(404, "not_found", "Story cluster not found");
          const response = success(story, requestId, now, {
            headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
          });
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/mcp") {
          if (request.method !== "POST") throw methodProblem();
          const rpc = await handleMcp(request, store, now, staleAfterSeconds);
          if (rpc === null) return new Response(null, { status: 202, headers: corsHeaders });
          const response = json(rpc, { headers: { "Cache-Control": "no-store" } });
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        throw new HttpProblem(404, "not_found", "Route not found");
      } catch (error) {
        const problem = error instanceof HttpProblem
          ? error
          : new HttpProblem(503, "database_unavailable", "News intelligence storage is temporarily unavailable", true);
        const response = failure(problem, requestId, now);
        corsHeadersFor(response.headers, corsHeaders);
        return response;
      }
    },
  };
}

function corsHeadersFor(headers: Headers, values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) headers.set(name, value);
}

export default createWorker();
