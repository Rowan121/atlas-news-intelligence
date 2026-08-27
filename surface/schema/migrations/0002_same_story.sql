-- Local migration for a D1 database created from schema.sql before the
-- SAME-STORY contract. Apply before deploying the matching Worker, then
-- re-seed a current GDELT run so prominence component rows are complete.

ALTER TABLE articles ADD COLUMN same_story_json TEXT NOT NULL DEFAULT '{"publisherOrigin":{"status":"unknown","value":null,"confidence":null,"method":"unavailable","evidence":[],"reason":"Legacy row has no verified publisher-origin assessment."},"coverageMarkets":{"status":"unknown","value":null,"confidence":null,"method":"unavailable","evidence":[],"reason":"Legacy row has no evidence-backed coverage-market metadata."},"audienceExposure":{"status":"unknown","value":null,"confidence":null,"method":"unavailable","evidence":[],"reason":"Legacy row has no measured audience geography; publisher origin is not used as a proxy."},"framing":{"status":"unknown","value":null,"confidence":null,"method":"unavailable","evidence":[],"reason":"Legacy row has no evidence-backed framing assessment."},"tone":{"status":"unknown","value":null,"confidence":null,"method":"unavailable","evidence":[],"reason":"Legacy row has no evidence-backed tone assessment."}}';

ALTER TABLE regional_prominence ADD COLUMN regional_outlet_count INTEGER NOT NULL DEFAULT 0 CHECK (regional_outlet_count >= 0);
ALTER TABLE regional_prominence ADD COLUMN article_share REAL NOT NULL DEFAULT 0 CHECK (article_share BETWEEN 0 AND 1);
ALTER TABLE regional_prominence ADD COLUMN outlet_share REAL NOT NULL DEFAULT 0 CHECK (outlet_share BETWEEN 0 AND 1);
ALTER TABLE regional_prominence ADD COLUMN source_normalized_share REAL NOT NULL DEFAULT 0 CHECK (source_normalized_share BETWEEN 0 AND 1);
ALTER TABLE regional_prominence ADD COLUMN basis TEXT NOT NULL DEFAULT 'event_location' CHECK (basis = 'event_location');

UPDATE regional_prominence
SET regional_outlet_count = unique_publisher_count,
    formula_version = 'atlas-regional-prominence-v1-legacy-components-unavailable';
