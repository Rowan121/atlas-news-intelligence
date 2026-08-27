import type { ProminenceMetric, StoryQuery } from "./contracts";
import { handleA2aJsonRpc, handleA2aSend } from "./a2a";
import {
  a2aAgentCard,
  agentMode,
  agentSkill,
  agentSkillsIndex,
  apiCatalogMarkdown,
  apiCatalog,
  ardCatalog,
  attachDiscoveryHeaders,
  authMarkdown,
  documentationRepresentation,
  docs,
  integrations,
  llms,
  mcpServerCard,
  notFoundMarkdown,
  openApiMarkdown,
  openApi,
  robots,
  scopedLlms,
  sitemap,
  trustDocument,
} from "./discovery";
import { failure, HttpProblem, json, parsePositiveInt, parseTimestamp, success } from "./http";
import { buildIntelligenceSnapshot, type IntelligenceWindow } from "./intelligence";
import { handleMcp } from "./mcp";
import type { TruthStore } from "./store";
import { D1TruthStore } from "./storage/d1";

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
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

const PUBLIC_READ_LIMIT = 120;
const PUBLIC_READ_WINDOW_MS = 60_000;
const rateWindows = new Map<string, { count: number; resetAt: number }>();
let nextRateWindowCleanupAt = 0;

interface RateLimitResult {
  headers: Record<string, string>;
  limited: boolean;
  retryAfterSeconds: number;
}

function rateLimitFor(request: Request, env: Env, now: Date, pathname: string): RateLimitResult {
  const isMachineRead = pathname === "/health"
    || pathname.startsWith("/api/")
    || pathname === "/mcp"
    || pathname === "/a2a"
    || pathname.startsWith("/a2a/");
  const source = request.headers.get("CF-Connecting-IP")?.trim();
  if (env.ENVIRONMENT !== "production" || source === undefined || source === "" || !isMachineRead || request.method === "OPTIONS") {
    return { headers: {}, limited: false, retryAfterSeconds: 0 };
  }

  const nowMs = now.getTime();
  if (nowMs >= nextRateWindowCleanupAt || rateWindows.size > 5_000) {
    for (const [key, value] of rateWindows) {
      if (value.resetAt <= nowMs) rateWindows.delete(key);
    }
    nextRateWindowCleanupAt = nowMs + PUBLIC_READ_WINDOW_MS;
  }
  const existing = rateWindows.get(source);
  const window = existing === undefined || existing.resetAt <= nowMs
    ? { count: 0, resetAt: nowMs + PUBLIC_READ_WINDOW_MS }
    : existing;
  window.count += 1;
  rateWindows.set(source, window);
  const remaining = Math.max(0, PUBLIC_READ_LIMIT - window.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - nowMs) / 1_000));
  const headers = {
    RateLimit: `"atlas-public-read";r=${remaining};t=${retryAfterSeconds}`,
    "RateLimit-Policy": `"atlas-public-read";q=${PUBLIC_READ_LIMIT};w=${PUBLIC_READ_WINDOW_MS / 1_000}`,
    "RateLimit-Limit": String(PUBLIC_READ_LIMIT),
    "RateLimit-Remaining": String(remaining),
    "RateLimit-Reset": String(retryAfterSeconds),
  };
  return { headers, limited: window.count > PUBLIC_READ_LIMIT, retryAfterSeconds };
}

function isAgentCrawler(request: Request): boolean {
  return /(?:GPTBot|ChatGPT-User|ClaudeBot|PerplexityBot|Google-Extended|Applebot-Extended|ora-agent|DeepSeekBot)/i.test(
    request.headers.get("User-Agent") ?? "",
  );
}

function withAccept(request: Request, accept: string): Request {
  const headers = new Headers(request.headers);
  headers.set("Accept", accept);
  return new Request(request, { headers });
}

function parseStaleAfter(value: string | undefined): number {
  if (value === undefined) return 1800;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 60 ? Math.floor(parsed) : 1800;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  const unbracketed = normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
    || unbracketed === "::1";
}

function methodProblem(): HttpProblem {
  return new HttpProblem(405, "method_not_allowed", "Method not allowed");
}

function readMethod(request: Request): void {
  if (request.method !== "GET" && request.method !== "HEAD") throw methodProblem();
}

function withoutBodyForHead(request: Request, response: Response): Response {
  if (request.method !== "HEAD") return response;
  return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function corsValues(request: Request, configured: string | undefined): Record<string, string> {
  const origin = request.headers.get("Origin");
  const ownOrigin = new URL(request.url).origin;
  const policy = configured ?? "self";
  const allowed = policy === "*"
    ? "*"
    : policy === "self"
      ? origin === ownOrigin ? origin : undefined
      : policy;
  return {
    ...(allowed === undefined ? {} : { "Access-Control-Allow-Origin": allowed }),
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, A2A-Version, A2A-Extensions",
    Vary: "Origin, Accept",
  };
}

function securityValues(request: Request, environment: string | undefined): Record<string, string> {
  const url = new URL(request.url);
  return {
    "Content-Security-Policy": "frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    ...(environment === "production" && url.protocol === "https:"
      ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
      : {}),
  };
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
      const url = new URL(request.url);
      if (
        env.ENVIRONMENT === "production"
        && url.protocol === "http:"
        && !isLoopbackHostname(url.hostname)
      ) {
        url.protocol = "https:";
        return new Response(null, { status: 308, headers: { Location: url.toString() } });
      }

      const now = dependencies.clock?.() ?? new Date();
      const requestId = dependencies.requestId?.() ?? crypto.randomUUID();
      const staleAfterSeconds = parseStaleAfter(env.STALE_AFTER_SECONDS);
      const store = dependencies.store ?? new D1TruthStore(env.DB);
      const rateLimit = rateLimitFor(request, env, now, url.pathname);

      const corsHeaders = {
        ...corsValues(request, env.CORS_ORIGIN),
        ...securityValues(request, env.ENVIRONMENT),
        ...rateLimit.headers,
      };

      try {
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
        if (rateLimit.limited) {
          throw new HttpProblem(429, "rate_limited", "Public read limit exceeded", true, {
            scope: "best_effort_worker_instance",
            retry_after_seconds: rateLimit.retryAfterSeconds,
          });
        }

        if (url.pathname === "/robots.txt") {
          readMethod(request);
          const response = withoutBodyForHead(request, robots(url.origin));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/sitemap.xml") {
          readMethod(request);
          const response = withoutBodyForHead(request, sitemap(url.origin));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/llms.txt") {
          readMethod(request);
          const response = withoutBodyForHead(request, llms(url.origin));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/docs/llms.txt" || url.pathname === "/api/llms.txt") {
          readMethod(request);
          const response = withoutBodyForHead(request, scopedLlms(url.origin, url.pathname.startsWith("/api/") ? "api" : "docs"));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/auth.md") {
          readMethod(request);
          const response = withoutBodyForHead(request, authMarkdown(url.origin));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/docs" || url.pathname === "/docs.md" || url.pathname === "/docs/index.md" || url.pathname === "/index.md" || url.pathname === "/api") {
          readMethod(request);
          const response = withoutBodyForHead(request, docs(request));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/integrations" || url.pathname === "/integrations.md") {
          readMethod(request);
          const response = withoutBodyForHead(request, integrations(request));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        const trustPath = url.pathname.endsWith(".md") ? url.pathname.slice(0, -3) : url.pathname;
        const trustKind = trustPath === "/about" ? "about"
          : trustPath === "/contact" ? "contact"
            : trustPath === "/privacy" ? "privacy"
              : trustPath === "/security" ? "security"
                : trustPath === "/api/versioning" ? "versioning"
                  : null;
        if (trustKind !== null) {
          readMethod(request);
          const response = withoutBodyForHead(request, trustDocument(request, trustKind));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/.well-known/api-catalog") {
          readMethod(request);
          const response = apiCatalog(url.origin, request.method === "HEAD");
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/.well-known/api-catalog.md") {
          readMethod(request);
          const response = withoutBodyForHead(request, apiCatalogMarkdown(url.origin));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/.well-known/ard.json" || url.pathname === "/.well-known/ai-catalog.json") {
          readMethod(request);
          const response = withoutBodyForHead(request, ardCatalog(url.origin));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/.well-known/agent-skills/index.json" || url.pathname === "/.well-known/skills/index.json") {
          readMethod(request);
          const response = withoutBodyForHead(request, await agentSkillsIndex(url.origin));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        const skillMatch = url.pathname.match(/^\/\.well-known\/(?:agent-skills|skills)\/([a-z0-9-]+)\/SKILL\.md$/i);
        if (skillMatch !== null) {
          readMethod(request);
          const response = agentSkill(skillMatch[1] ?? "");
          if (response === null) throw new HttpProblem(404, "not_found", "Agent skill not found");
          const output = withoutBodyForHead(request, response);
          corsHeadersFor(output.headers, corsHeaders);
          return output;
        }

        if (url.pathname === "/openapi.json") {
          readMethod(request);
          const response = withoutBodyForHead(request, openApi(url.origin));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/openapi.json.md") {
          readMethod(request);
          const response = withoutBodyForHead(request, openApiMarkdown(url.origin));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/.well-known/mcp/server-card.json" || url.pathname === "/.well-known/mcp.json") {
          readMethod(request);
          const response = withoutBodyForHead(request, mcpServerCard(url.origin));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/.well-known/agent-card.json") {
          readMethod(request);
          const response = withoutBodyForHead(request, a2aAgentCard(url.origin));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/a2a") {
          if (request.method === "GET" || request.method === "HEAD") {
            const response = withoutBodyForHead(request, a2aAgentCard(url.origin));
            corsHeadersFor(response.headers, corsHeaders);
            return response;
          }
          if (request.method !== "POST") throw methodProblem();
          const response = await handleA2aJsonRpc(request, store, now, staleAfterSeconds, requestId);
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/a2a/message:send") {
          if (request.method !== "POST") throw methodProblem();
          const response = await handleA2aSend(request, store, now, staleAfterSeconds, requestId);
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/a2a/tasks") {
          readMethod(request);
          const response = withoutBodyForHead(request, json({ tasks: [] }, {
            headers: { "Content-Type": "application/a2a+json; charset=utf-8", "Cache-Control": "no-store", "A2A-Version": "1.0" },
          }));
          response.headers.set("Content-Type", "application/a2a+json; charset=utf-8");
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname.startsWith("/assets/") || url.pathname === "/atlas-social.svg") {
          readMethod(request);
          if (env.ASSETS === undefined) throw new HttpProblem(404, "not_found", "Asset not found");
          const asset = await env.ASSETS.fetch(request);
          const response = new Response(request.method === "HEAD" ? null : asset.body, {
            status: asset.status,
            statusText: asset.statusText,
            headers: asset.headers,
          });
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/") {
          readMethod(request);
          if (url.searchParams.get("mode") === "agent") {
            const response = withoutBodyForHead(request, agentMode(url.origin));
            corsHeadersFor(response.headers, corsHeaders);
            return response;
          }
          if (isAgentCrawler(request)) {
            const response = withoutBodyForHead(request, docs(withAccept(request, "text/markdown")));
            corsHeadersFor(response.headers, corsHeaders);
            return response;
          }
          if (documentationRepresentation(request) !== "html") {
            const response = withoutBodyForHead(request, docs(request));
            corsHeadersFor(response.headers, corsHeaders);
            return response;
          }
          if (env.ASSETS !== undefined) {
            const asset = await env.ASSETS.fetch(request);
            const response = attachDiscoveryHeaders(new Response(request.method === "HEAD" ? null : asset.body, {
              status: asset.status,
              statusText: asset.statusText,
              headers: asset.headers,
            }), "/index.md");
            corsHeadersFor(response.headers, corsHeaders);
            return response;
          }
          const response = success(
            {
              service: "atlas-news-intelligence",
              version: env.BUILD_VERSION ?? "development",
              data_policy: "real records only; uncertainty and source evidence are preserved",
              links: {
                health: "/health",
                stories: "/api/v1/stories",
                story: "/api/v1/stories/{cluster_id}",
                intelligence: "/api/v1/intelligence?window=24h&prominence=normalized",
                mcp: "/mcp",
                a2a: "/.well-known/agent-card.json",
                docs: "/docs",
                openapi: "/openapi.json",
                api_catalog: "/.well-known/api-catalog",
              },
            },
            requestId,
            now,
            { headers: { "Cache-Control": "public, max-age=300" } },
          );
          attachDiscoveryHeaders(response);
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if (url.pathname === "/health") {
          readMethod(request);
          const health = await store.getHealth(now, staleAfterSeconds);
          const response = success(health, requestId, now, {
            status: health.status === "unavailable" ? 503 : 200,
            headers: { "Cache-Control": "no-store" },
          });
          const output = withoutBodyForHead(request, response);
          corsHeadersFor(output.headers, corsHeaders);
          return output;
        }

        if (url.pathname === "/api/stories" || url.pathname === "/api/v1/stories") {
          readMethod(request);
          const query = parseStoryQuery(url);
          const stories = await store.listStories(query, now, staleAfterSeconds);
          const response = success(
            { stories, query, count: stories.length },
            requestId,
            now,
            { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
          );
          const output = withoutBodyForHead(request, response);
          corsHeadersFor(output.headers, corsHeaders);
          return output;
        }

        if (url.pathname === "/api/v1/intelligence") {
          readMethod(request);
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
          const output = withoutBodyForHead(request, response);
          corsHeadersFor(output.headers, corsHeaders);
          return output;
        }

        const match = url.pathname.match(/^\/api\/(?:v1\/)?stories\/([^/]+)$/);
        if (match !== null) {
          readMethod(request);
          const rawId = match[1];
          if (rawId === undefined) throw new HttpProblem(400, "bad_request", "cluster_id is required");
          let clusterId: string;
          try {
            clusterId = decodeURIComponent(rawId);
          } catch {
            throw new HttpProblem(400, "bad_request", "cluster_id contains malformed percent-encoding");
          }
          if (clusterId === "" || clusterId.length > 200) {
            throw new HttpProblem(400, "bad_request", "cluster_id is invalid");
          }
          const story = await store.getStory(clusterId);
          if (story === null) throw new HttpProblem(404, "not_found", "Story cluster not found");
          const response = success(story, requestId, now, {
            headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
          });
          const output = withoutBodyForHead(request, response);
          corsHeadersFor(output.headers, corsHeaders);
          return output;
        }

        if (url.pathname === "/mcp") {
          if (request.method !== "POST") throw methodProblem();
          const rpc = await handleMcp(request, store, now, staleAfterSeconds);
          if (rpc === null) return new Response(null, { status: 202, headers: corsHeaders });
          const response = json(rpc, { headers: { "Cache-Control": "no-store" } });
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }

        if ((request.method === "GET" || request.method === "HEAD") && !url.pathname.startsWith("/api/")) {
          const response = withoutBodyForHead(request, notFoundMarkdown(url.origin, url.pathname));
          corsHeadersFor(response.headers, corsHeaders);
          return response;
        }
        throw new HttpProblem(404, "not_found", "Route not found", false, {
          docs: `${url.origin}/docs`,
          llms: `${url.origin}/llms.txt`,
          sitemap: `${url.origin}/sitemap.xml`,
        });
      } catch (error) {
        const problem = error instanceof HttpProblem
          ? error
          : new HttpProblem(503, "database_unavailable", "News intelligence storage is temporarily unavailable", true);
        const response = failure(problem, requestId, now);
        if (problem.status === 429) response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
        corsHeadersFor(response.headers, corsHeaders);
        return response;
      }
    },
  };
}

function corsHeadersFor(headers: Headers, values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    if (name === "Content-Security-Policy") {
      const preserved = (headers.get(name) ?? "")
        .split(";")
        .map((directive) => directive.trim())
        .filter((directive) => directive !== "" && !/^frame-ancestors(?:\s|$)/i.test(directive));
      headers.set(name, [...preserved, value].join("; "));
      continue;
    }
    headers.set(name, value);
  }
}

export default createWorker();
