import { describe, expect, it, vi } from "vitest";
import { GdeltClient } from "../src/ingestion/gdelt.js";
import { TavilyClient, tavilyFromEnvironment } from "../src/ingestion/tavily.js";
import { canonicalizeUrl } from "../src/ingestion/sources.js";

const clock = { now: () => new Date("2026-08-27T01:00:00.000Z") };
const query = {
  query: "earthquake",
  from: "2026-08-26T01:00:00.000Z",
  to: "2026-08-27T01:00:00.000Z",
  maxResults: 10,
};

describe("source ingestion", () => {
  it("canonicalizes tracking URLs deterministically", () => {
    expect(canonicalizeUrl("https://WWW.Example.com/story/?utm_source=x&b=2&a=1#top")).toBe(
      "https://www.example.com/story?a=1&b=2",
    );
  });

  it("rejects non-http(s) URL schemes so a provider-returned javascript:/data: URL cannot become a citation", () => {
    expect(() => canonicalizeUrl("javascript:alert(1)//")).toThrow();
    expect(() => canonicalizeUrl("data:text/html,<script>alert(1)</script>")).toThrow();
    expect(() => canonicalizeUrl("blob:https://example.com/abc")).toThrow();
    expect(canonicalizeUrl("http://example.com/x")).toBe("http://example.com/x");
    expect(canonicalizeUrl("https://example.com/x")).toBe("https://example.com/x");
  });

  it("maps GDELT publisher origin without treating it as event location", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          articles: [
            {
              url: "https://news.example/world/story?utm_source=feed",
              title: "A real headline",
              seendate: "20260827T001500Z",
              domain: "news.example",
              language: "English",
              sourcecountry: "United States",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await new GdeltClient({ fetch: fetchMock, clock }).search(query);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.articles[0]!.publisher.origin?.countryName).toBe("United States");
    expect(result.articles[0]!.canonicalUrl).not.toContain("utm_source");
    expect(result.articles[0]!).not.toHaveProperty("eventLocations");
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(requestedUrl.searchParams.get("startdatetime")).toBe("20260826010000");
    expect(requestedUrl.searchParams.get("enddatetime")).toBe("20260827010000");
  });

  it("omits malformed GDELT records and reports the count", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ articles: [{ title: "Missing URL" }] }), { status: 200 }),
    );
    const result = await new GdeltClient({ fetch: fetchMock, clock }).search(query);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.articles).toEqual([]);
    expect(result.warnings[0]).toMatch(/1 malformed/);
  });

  it("classifies GDELT rate limiting without retrying", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("slow down", { status: 429, headers: { "retry-after": "30" } }),
    );
    const result = await new GdeltClient({ fetch: fetchMock, clock }).search(query);
    expect(result).toMatchObject({ ok: false, kind: "rate_limited", retryAfterSeconds: 30 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports malformed GDELT JSON as an invalid response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("not json", { status: 200 }));
    const result = await new GdeltClient({ fetch: fetchMock, clock }).search(query);
    expect(result).toMatchObject({ ok: false, kind: "invalid_response" });
  });

  it("reports aborts as timeouts", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("aborted", "AbortError"));
    const result = await new GdeltClient({ fetch: fetchMock, clock }).search(query);
    expect(result).toMatchObject({ ok: false, kind: "timeout" });
  });

  it("fails closed when Tavily key is missing", async () => {
    const result = await new TavilyClient({ clock }).search(query);
    expect(result).toMatchObject({ ok: false, kind: "missing_key" });
  });

  it("maps Tavily results and sends the key only in an authorization header", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Fresh report",
              url: "https://wire.example/fresh",
              content: "A sourced summary.",
              published_date: "2026-08-27T00:15:00Z",
              score: 0.87,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await new TavilyClient({ apiKey: "tvly-test-secret", fetch: fetchMock, clock }).search(query);
    expect(result.ok).toBe(true);
    const [requestUrl, options] = fetchMock.mock.calls[0]!;
    expect(String(requestUrl)).not.toContain("tvly-test-secret");
    expect(options?.body).not.toContain("tvly-test-secret");
    expect(new Headers(options?.headers).get("authorization")).toBe("Bearer tvly-test-secret");
    if (result.ok) expect(result.articles[0]!.summary).toBe("A sourced summary.");
  });

  it("attaches a documented primary editorial market without using publisher location as the market", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        results: [{
          title: "Nepal floods update",
          url: "https://www.australiannews.net/news/nepal-floods",
          content: "A sourced report.",
          published_date: "2026-08-27T00:15:00Z",
          score: 0.9,
        }],
      }), { status: 200 }),
    );
    const result = await new TavilyClient({ apiKey: "tvly-test-secret", fetch: fetchMock, clock }).search(query);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const article = result.articles[0]!;
    expect(article.publisher.origin?.countryCode).toBe("AE");
    expect(article.sameStory.editorialMarket).toMatchObject({
      status: "observed",
      value: { regionCode: "AU", label: "Australia" },
      method: "documented_outlet_market",
    });
    expect(article.sameStory).not.toHaveProperty("audienceExposure");
  });

  it("classifies rejected Tavily credentials without echoing them", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("denied", { status: 401 }));
    const result = await new TavilyClient({ apiKey: "tvly-never-print", fetch: fetchMock, clock }).search(query);
    expect(result).toMatchObject({ ok: false, kind: "auth" });
    expect(JSON.stringify(result)).not.toContain("tvly-never-print");
  });

  it("can construct Tavily from an injected environment", () => {
    expect(tavilyFromEnvironment({ TAVILY_API_KEY: "injected" })).toBeInstanceOf(TavilyClient);
  });
});
