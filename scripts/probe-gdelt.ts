import { GdeltClient } from "../src/ingestion/gdelt.js";

const query = process.argv.slice(2).join(" ").trim() || "earthquake";
const to = new Date();
const from = new Date(to.getTime() - 24 * 3_600_000);
const client = new GdeltClient({ timeoutMs: 25_000 });
const result = await client.search({
  query,
  from: from.toISOString(),
  to: to.toISOString(),
  maxResults: 10,
});

if (!result.ok) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        provider: result.provider,
        kind: result.kind,
        message: result.message,
        finishedAt: result.finishedAt,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: result.provider,
        articleCount: result.articles.length,
        sample: result.articles.slice(0, 3).map((article) => ({
          title: article.title,
          url: article.url,
          publishedAt: article.publishedAt ?? null,
          publisher: article.publisher.domain,
          publisherOrigin: article.publisher.origin?.countryName ?? null,
        })),
        warnings: result.warnings,
        finishedAt: result.finishedAt,
      },
      null,
      2,
    ),
  );
}
