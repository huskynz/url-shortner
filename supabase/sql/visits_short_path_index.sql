-- Ensure lookups by short_path are indexed for visit processing
CREATE INDEX IF NOT EXISTS idx_visits_short_path ON visits (short_path);
