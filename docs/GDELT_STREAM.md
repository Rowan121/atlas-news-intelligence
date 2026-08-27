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
6. Use GKG `SourceCommonName` plus the URL domain for publisher identity. Publisher location is never inferred and never substituted for event location.

Every emitted cluster is validated against Atlas's `StoryCluster` contract. Membership reasons retain the exact event/document joins, the mention confidence, and the `InRawText` gate. Event-location evidence is explicitly marked `provider_event_geotag`.

GDELT can assign more than one `GlobalEventID` to facets or syndicated copies
of the same published story. Atlas conservatively merges clusters only when an
exact Unicode/punctuation-normalized headline has a second identity gate:
either the primary event location matches or at least one exact canonical
article URL overlaps. Cross-location matches therefore require a shared source
document; Atlas does not treat its URL-derived metadata fingerprint as an
independent content hash. Connected matches are consolidated deterministically,
every distinct article and cited event location is retained, membership and
location evidence are unioned, and prominence is recomputed over the merged
corpus. Headline similarity by itself is never a merge gate.

The raw stream does not itself provide verified primary editorial markets,
framing, or tone. Atlas emits typed unknown assessments rather than inferring
them from `ActionGeo`, publisher name, or domain. A deliberately narrow outlet
registry may add a primary editorial market only when it retains direct market
documentation, or both documented language and publisher location, plus a
method and confidence. Publisher location or language alone is insufficient;
audience/readership telemetry is out of scope. `ActionGeo` remains cited
provider event-geotag evidence and is never market evidence; when a cluster
has multiple cited event-location candidates, the Surface selects one
primary deterministically by confidence, evidence count, then location id and
retains the remaining candidates for inspection.

## Incomplete latest-batch recovery

GDELT 2.x publishes quarter-hour batches and exposes both a latest-file list
and a checksum-bearing master file list. In practice, the latest list can
briefly reference a GKG object that its file host still returns as HTTP 404.
Atlas handles only that narrow publication-lag case:

1. Fetch the advertised GKG first. Events and Mentions are not useful to Atlas
   without the exact-batch GKG join.
2. On a file HTTP 404 only, request a size-capped HTTP range from the tail of
   `masterfilelist.txt`.
3. Consider at most four prior 15-minute slots by default (hard maximum eight),
   newest first, and require one Events, one Mentions, and one GKG checksum row
   with the exact same batch timestamp.
4. Download the candidate GKG first, then Events and Mentions. Every file must
   match the master list's byte count and MD5 before parsing.
5. Mark the resulting snapshot `degraded` and name both the advertised and
   selected batch in its warnings and diagnostics.

Network errors, HTTP 5xx, rate limits, checksum mismatches, malformed archives,
parse failures, and empty joins never trigger older-data fallback. A fallback
candidate with an integrity failure stops the run rather than silently walking
farther back. Callers can set `fallbackBatches: 0` to disable recovery. Atlas
never synthesizes records or trusts guessed historical filenames.

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
- GDELT 2.x checksum-bearing master list: https://data.gdeltproject.org/gdeltv2/masterfilelist.txt
- GDELT 2.0 realtime and master/latest lists: https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/
- Events and Mentions codebook: https://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf
- GKG 2.1 codebook: https://data.gdeltproject.org/documentation/GDELT-Global_Knowledge_Graph_Codebook-V2.1.pdf
- GKG page-title encoding: https://blog.gdeltproject.org/unescaping-article-titles-in-the-gkg-2-0/
