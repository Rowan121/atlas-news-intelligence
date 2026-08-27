PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS story_clusters (
  cluster_id TEXT PRIMARY KEY,
  ingestion_run_id TEXT NOT NULL REFERENCES pipeline_runs(run_id) ON DELETE CASCADE,
  canonical_title TEXT NOT NULL,
  summary TEXT,
  primary_region_code TEXT,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  raw_article_count INTEGER NOT NULL DEFAULT 0 CHECK (raw_article_count >= 0),
  unique_publisher_count INTEGER NOT NULL DEFAULT 0 CHECK (unique_publisher_count >= 0),
  normalized_prominence REAL NOT NULL DEFAULT 0 CHECK (normalized_prominence >= 0),
  cluster_confidence REAL NOT NULL CHECK (cluster_confidence BETWEEN 0 AND 1),
  membership_explanation TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  article_id TEXT PRIMARY KEY,
  ingestion_run_id TEXT NOT NULL REFERENCES pipeline_runs(run_id) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL REFERENCES story_clusters(cluster_id) ON DELETE CASCADE,
  canonical_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher_name TEXT NOT NULL,
  publisher_domain TEXT NOT NULL,
  publisher_origin_country TEXT,
  audience_region_code TEXT,
  language TEXT NOT NULL,
  published_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  evidence_snippet TEXT,
  membership_confidence REAL NOT NULL CHECK (membership_confidence BETWEEN 0 AND 1),
  membership_evidence TEXT NOT NULL,
  same_story_json TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (cluster_id, canonical_url)
);

CREATE TABLE IF NOT EXISTS story_locations (
  location_id TEXT PRIMARY KEY,
  ingestion_run_id TEXT NOT NULL REFERENCES pipeline_runs(run_id) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL REFERENCES story_clusters(cluster_id) ON DELETE CASCADE,
  location_type TEXT NOT NULL CHECK (location_type IN ('event', 'mentioned', 'publisher_origin', 'audience_region')),
  location_granularity TEXT NOT NULL CHECK (location_granularity IN ('city', 'admin1', 'country', 'region', 'point', 'unknown')),
  label TEXT NOT NULL,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  country_code TEXT,
  region_code TEXT,
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_article_id TEXT REFERENCES articles(article_id) ON DELETE SET NULL,
  evidence_quote TEXT,
  evidence_start INTEGER,
  evidence_end INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS story_location_evidence (
  location_evidence_id TEXT PRIMARY KEY,
  ingestion_run_id TEXT NOT NULL REFERENCES pipeline_runs(run_id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES story_locations(location_id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  evidence_quote TEXT NOT NULL,
  evidence_start INTEGER,
  evidence_end INTEGER,
  evidence_method TEXT NOT NULL CHECK (evidence_method IN ('article_text', 'provider_event_geotag', 'manual_confirmed')),
  updated_at TEXT NOT NULL,
  UNIQUE (location_id, article_id, source_url, evidence_quote)
);

CREATE TABLE IF NOT EXISTS story_claims (
  claim_id TEXT PRIMARY KEY,
  ingestion_run_id TEXT NOT NULL REFERENCES pipeline_runs(run_id) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL REFERENCES story_clusters(cluster_id) ON DELETE CASCADE,
  normalized_claim TEXT NOT NULL,
  stance TEXT NOT NULL CHECK (stance IN ('supports', 'disputes', 'unclear')),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_article_id TEXT NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
  evidence_quote TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS regional_prominence (
  ingestion_run_id TEXT NOT NULL REFERENCES pipeline_runs(run_id) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL REFERENCES story_clusters(cluster_id) ON DELETE CASCADE,
  region_code TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  raw_article_count INTEGER NOT NULL CHECK (raw_article_count >= 0),
  unique_publisher_count INTEGER NOT NULL CHECK (unique_publisher_count >= 0),
  regional_source_volume INTEGER NOT NULL CHECK (regional_source_volume >= 0),
  regional_outlet_count INTEGER NOT NULL CHECK (regional_outlet_count >= 0),
  normalized_score REAL NOT NULL CHECK (normalized_score >= 0),
  article_share REAL NOT NULL CHECK (article_share BETWEEN 0 AND 1),
  outlet_share REAL NOT NULL CHECK (outlet_share BETWEEN 0 AND 1),
  source_normalized_share REAL NOT NULL CHECK (source_normalized_share BETWEEN 0 AND 1),
  basis TEXT NOT NULL CHECK (basis = 'event_location'),
  formula_version TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (cluster_id, region_code, window_start, window_end)
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  run_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'degraded', 'failed')),
  input_fingerprint TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  source_watermark_at TEXT,
  records_seen INTEGER NOT NULL DEFAULT 0 CHECK (records_seen >= 0),
  records_upserted INTEGER NOT NULL DEFAULT 0 CHECK (records_upserted >= 0),
  error_kind TEXT,
  error_message TEXT,
  retryable INTEGER NOT NULL DEFAULT 0 CHECK (retryable IN (0, 1)),
  cotal_receipt_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_story_clusters_last_observed ON story_clusters(last_observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_clusters_run ON story_clusters(ingestion_run_id);
CREATE INDEX IF NOT EXISTS idx_story_clusters_region_raw ON story_clusters(primary_region_code, raw_article_count DESC);
CREATE INDEX IF NOT EXISTS idx_story_clusters_region_normalized ON story_clusters(primary_region_code, normalized_prominence DESC);
CREATE INDEX IF NOT EXISTS idx_articles_cluster_published ON articles(cluster_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_publisher_domain ON articles(publisher_domain);
CREATE INDEX IF NOT EXISTS idx_articles_retrieved ON articles(retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_run ON articles(ingestion_run_id);
CREATE INDEX IF NOT EXISTS idx_locations_cluster_type ON story_locations(cluster_id, location_type);
CREATE INDEX IF NOT EXISTS idx_location_evidence_location ON story_location_evidence(location_id);
CREATE INDEX IF NOT EXISTS idx_claims_cluster ON story_claims(cluster_id);
