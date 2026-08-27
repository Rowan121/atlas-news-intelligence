# One-shot GDELT 2.x stream loader

Atlas can build a current, no-key intelligence snapshot from GDELT's latest 15-minute raw-data batch:

```bash
npm run snapshot:gdelt -- --output artifacts/gdelt-latest.json --max-clusters 200
```

This command runs once. It does not schedule polling, persist to a database, deploy, or contact a credential service. The JSON output is an explicit success/failure envelope. Upstream timeout, rate limit, checksum, archive, size, parse, empty-join, and validation failures never fall back to demo data.

## Join and truth gates

The implementation follows the official GDELT 2.0/2.1 raw schemas:

1. Read `https://data.gdeltproject.org/gdeltv2/lastupdate.txt`, require exactly one Events export, Mentions, and GKG ZIP from one batch, upgrade file links to HTTPS, and restrict them to `data.gdeltproject.org`.
2. Join `Events.GlobalEventID = Mentions.GlobalEventID`.
3. Retain primary web mentions only: `MentionType = 1`, `InRawText = 1`, `Confidence >= 80`, and an Events `ActionGeo` with valid coordinates.
4. Join `Mentions.MentionIdentifier = GKG.DocumentIdentifier` exactly, require GKG source collection `1` (WEB), and require a real `<PAGE_TITLE>` from the GKG Extras field.
5. Use Events columns 52–59 (one-based) for the event location. The `ActionGeo_CountryCode` value is GDELT's documented FIPS10-4/GENC-transition value, not silently relabeled as ISO-3166.
6. Use GKG `SourceCommonName` plus the URL domain for publisher metadata. Publisher location is never inferred and never substituted for event location.

Every emitted cluster is validated against Atlas's `StoryCluster` contract. Membership reasons retain the exact event/document joins, the mention confidence, and the `InRawText` gate. Event-location evidence is explicitly marked `provider_event_geotag`.

GDELT can assign more than one `GlobalEventID` to syndicated copies of the same
story. Atlas conservatively merges only clusters whose Unicode/punctuation-
normalized headline **and** primary event location match. Every distinct
article is retained; membership reasons and location-evidence rows are unioned;
raw and source-normalized prominence are then recomputed over the merged corpus.
Headline similarity by itself is never a merge gate.

## Local D1 seed export

Convert a successful snapshot into the existing Surface schema without making
any cloud request:

```bash
npm run seed:d1 -- \
  --input artifacts/gdelt-latest.json \
  --output artifacts/gdelt-latest.sql
```

Both JSON and SQL artifacts are ignored by Git. The export is pure and
byte-stable for the same input, SQL-escapes all text, namespaces record ids by
batch and cluster, records the evidence-backed pipeline run and non-secret Cotal
receipt, and retains every location-evidence row in
`story_location_evidence`. Re-running a batch deletes only rows with that
batch's `ingestion_run_id`; other ingestion runs are untouched.

Cloudflare's file importer provides the atomic transaction. The generated file
therefore intentionally omits `BEGIN`/`COMMIT`, which would otherwise nest a
transaction under `wrangler d1 execute --file`. A future, separately approved
write uses:

```bash
wrangler d1 execute <database-name> --file artifacts/gdelt-latest.sql
```

Generating the file does not execute this command, provision D1, authenticate,
deploy, or schedule ingestion.

## Safety bounds

- Fetches have abort timeouts, at most three attempts, and bounded exponential/retry-after backoff.
- The manifest's declared byte count is checked before download; actual byte count and MD5 are verified afterward.
- Responses are read incrementally and stopped at compressed-size caps.
- ZIP entries use the pure-JavaScript `fflate` reader, reject traversal/multiple CSVs, and enforce decompressed-size caps.
- Events, Mentions, GKG rows, articles per cluster, and total clusters are capped. A reached cap marks the snapshot partial/degraded.
- Generated artifacts are ignored by Git and contain only public GDELT records and Atlas metadata.

## Attribution and schema sources

Data attribution: **The GDELT Project**, https://www.gdeltproject.org/.

- GDELT data streams and 15-minute cadence: https://www.gdeltproject.org/data.html
- Events and Mentions codebook: https://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf
- GKG 2.1 codebook: https://data.gdeltproject.org/documentation/GDELT-Global_Knowledge_Graph_Codebook-V2.1.pdf
- GKG page-title encoding: https://blog.gdeltproject.org/unescaping-article-titles-in-the-gkg-2-0/
