-- URL Shortener schema for local Postgres.
-- Mirrors the columns the application reads/writes so an existing Supabase
-- dump imports cleanly. Table names match the defaults in UrlShortenerOptions
-- (urls / github_admins / api_keys); override those options if your dump uses
-- different names (e.g. the legacy SUPABASE_DB_NAME / ADMINS_DB / APIKEY_DB).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- Shortened URLs -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS urls (
  short_path      text PRIMARY KEY,
  redirect_url    text NOT NULL,
  private         boolean NOT NULL DEFAULT false,
  deprecated      boolean NOT NULL DEFAULT false,
  password        text,
  schedule_start  timestamptz,
  schedule_end    timestamptz,
  usage_quota     integer,
  custom_rules    jsonb,
  created_at      timestamptz DEFAULT now()
);

-- Admin users ----------------------------------------------------------------
-- Both password_hash and legacy password columns are present for parity with
-- older schemas; the app prefers password_hash. Hashes are bcrypt ($2a/$2b).
CREATE TABLE IF NOT EXISTS github_admins (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text UNIQUE,
  password_hash    text,
  password         text,
  role             text,               -- 'owner' | 'admin' | 'viewer'
  passset          boolean DEFAULT false,
  github_username  text,
  github_id        text,
  created_at       timestamptz DEFAULT now()
);

-- API keys -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  key         text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz,
  use_count   bigint NOT NULL DEFAULT 0,
  last_used   timestamptz,
  last_ip     text,
  metadata    jsonb
);
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys (key);

-- Processed visits -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS visits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_path      text,
  ip_address      text,
  user_agent      text,
  environment     text,
  version_number  text,
  user_id         uuid,
  browser         text,
  os              text,
  visited_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visits_short_path ON visits (short_path);
CREATE INDEX IF NOT EXISTS idx_visits_visited_at ON visits (visited_at);

-- Deferred visit queue -------------------------------------------------------
CREATE TABLE IF NOT EXISTS visit_queue (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  short_path        text NOT NULL,
  ip_address        text,
  user_agent        text,
  environment       text,
  version_number    text,
  user_id           uuid,
  browser           text,
  os                text,
  received_at       timestamptz DEFAULT now() NOT NULL,
  processed_at      timestamptz,
  processing_status text DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_visit_queue_status_received_at
  ON visit_queue (processing_status, received_at);

-- IP -> stable user id mapping ----------------------------------------------
CREATE TABLE IF NOT EXISTS user_ip_mapping (
  ip_address  text PRIMARY KEY,
  user_id     uuid NOT NULL
);

-- One-time password-set tokens ----------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  token       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used        boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens (token);
