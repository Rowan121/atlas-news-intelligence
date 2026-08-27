# Atlas truth-layer contract

The truth layer deliberately separates **where an event happened** from **where a publisher is based**. A publisher-origin country supplied by an upstream provider is stored only on `article.publisher.origin`; it is never promoted to `cluster.eventLocations`.

## Canonical records

- `Article` retains canonical and source URLs, publisher identity and optional origin, language, publish/retrieval times, and source-provider metadata.
- `EventLocation` requires coordinates, a type, confidence, and at least one article-text or provider-geotag evidence span. Publisher metadata is forbidden as event-location evidence.
- `Claim` retains the claim text, polarity, confidence, and linked evidence spans. The initial pipeline preserves this schema but does not invent claims when extraction is unavailable.
- `StoryCluster` retains every article, explainable membership evidence, event locations, raw prominence, source-normalized prominence, and pipeline health.

All timestamps are ISO-8601 UTC strings. Confidence values are finite numbers in `[0, 1]`. URLs must be HTTP(S). `validateStoryCluster` and `validateTruthSlice` return structured issues; they never silently repair truth records.

## Event geolocation

`EvidenceBackedGeocoder` accepts a real gazetteer implementation. It searches article titles and summaries, retains an exact quote window and URL for every match, penalizes ambiguous aliases, and increases confidence only when independent articles/outlets corroborate the same place. The core package contains no production demo gazetteer; deterministic places live only in tests.

## Explainable clustering

Membership combines title-token overlap, named-entity overlap, time proximity, event-location overlap, and optional semantic similarity. Available components are weight-normalized, so a missing embedding provider is visible in `available:false` and does not become a fabricated zero. Every non-seed member points to the strongest matched article and preserves component scores and human-readable reasons.

## Regional prominence

For each event region the pipeline reports:

- raw article and unique-outlet counts;
- article share among all clusters mapped to that region;
- outlet share among the region's observed outlets; and
- source-normalized share, which gives each observed outlet equal weight before averaging its share devoted to the cluster.

The normalized score is the mean of article share and source-normalized share. Denominators are always included so the UI can explain the number and avoid presenting it as audience reach.

## Source behavior

GDELT is public and requires no key. Tavily accepts a key only through constructor/environment injection; keys never appear in URLs, errors, diagnostics, or records. Source calls return typed failures for timeout, authentication, rate limiting, HTTP, network, and malformed responses. An empty or failed upstream response produces an empty/degraded pipeline result—never fallback stories.

The 24-hour truth slice is valid only when a current cluster has a cited event location and at least two independent outlets. If no cluster meets that bar, the result explicitly reports why.

## Coordination and integration receipts

Each persisted pipeline run may carry one sanitized Cotal coordination receipt. It identifies the agent/task, optional commit, exercised checks, artifact paths, public evidence URLs, blockers, and next step. The latest run exposes that receipt through `/health`; invalid stored receipt JSON is never treated as proof.

A receipt may contain integration observations for Tavily, Tenki, Runtype, Mitosis, Cotal/Nebius, or another genuinely invoked provider. Each observation records provider, capability, status, ISO timestamp, optional sanitized external request ID, public evidence URLs, and optional usage `{unit,before,after,delta}`. When usage is present, `delta` must equal `after - before`; when a provider does not expose usage it remains `null`. Configuration, an account balance, or an available key is never enough to claim integration usage. Receipts must not contain credentials, authorization headers, cookies, PII, or internal URLs.
