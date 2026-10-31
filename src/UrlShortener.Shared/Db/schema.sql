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
  password_hash   text,
  schedule_start  timestamptz,
  schedule_end    timestamptz,
  usage_quota     integer,
  usage_count     bigint NOT NULL DEFAULT 0,
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
  session_stamp    uuid NOT NULL DEFAULT gen_random_uuid(),
  role             text,               -- 'owner' | 'admin' | 'viewer'
  passset          boolean DEFAULT false,
  github_username  text,
  github_id        text,
  created_at       timestamptz DEFAULT now()
);

-- HUS-15: abort safely on legacy duplicate identities; never merge accounts automatically.
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_admins_normalized_email
  ON github_admins (lower(btrim(email))) WHERE email IS NOT NULL;

-- HUS-10: explicit separate hash column avoids confusing legacy passwords with
-- hash-looking plaintext. Prehash UTF-8 passwords before bcrypt (no truncation).
ALTER TABLE urls ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE urls ADD COLUMN IF NOT EXISTS usage_count bigint NOT NULL DEFAULT 0;
UPDATE urls SET password_hash = 'bcrypt-sha256:' ||
  crypt(encode(digest(convert_to(password, 'UTF8'), 'sha256'), 'base64'), gen_salt('bf', 10)),
  password = NULL
WHERE private AND password_hash IS NULL AND password IS NOT NULL AND password <> '';
UPDATE urls SET password = NULL WHERE password IS NOT NULL;
UPDATE urls SET password_hash = NULL WHERE NOT private AND password_hash IS NOT NULL;

-- API keys -------------------------------------------------------------------
-- HUS-9: upgrade existing installations as well as newly created tables.
ALTER TABLE github_admins ADD COLUMN IF NOT EXISTS session_stamp uuid NOT NULL DEFAULT gen_random_uuid();

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
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scopes text NOT NULL DEFAULT 'urls:read';
-- HUS-17: one-way, idempotent conversion. Existing bearer strings remain valid;
-- all application lookups hash the presented key. Never accept a stored digest.
UPDATE api_keys SET key = 'sha256:' || encode(digest(key, 'sha256'), 'hex')
WHERE key !~ '^sha256:[0-9a-f]{64}$';

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

-- HUS-66: additive identity/lifecycle foundation. Public short paths remain the
-- primary key for compatibility; link_id is unique and never changes on edits.
ALTER TABLE urls ADD COLUMN IF NOT EXISTS link_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE urls ADD COLUMN IF NOT EXISTS edit_version bigint NOT NULL DEFAULT 1;
ALTER TABLE urls ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE urls ADD COLUMN IF NOT EXISTS listed boolean NOT NULL DEFAULT true;
ALTER TABLE github_admins ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'reset';
CREATE UNIQUE INDEX IF NOT EXISTS idx_urls_link_id ON urls(link_id);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS link_id uuid;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'legacy';
ALTER TABLE visit_queue ADD COLUMN IF NOT EXISTS link_id uuid;
ALTER TABLE visit_queue ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'legacy';
-- Historical rows cannot reliably be assigned to a link incarnation. Keep them
-- explicitly legacy; new admissions carry the exact immutable identity.
CREATE INDEX IF NOT EXISTS idx_visits_link_id_time ON visits(link_id, visited_at);
CREATE TABLE IF NOT EXISTS link_revisions (
  id uuid PRIMARY KEY, link_id uuid NOT NULL, version bigint NOT NULL,
  destination_url text NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL,
  UNIQUE(link_id, version)
);
INSERT INTO link_revisions(id, link_id, version, destination_url, actor, created_at)
 SELECT gen_random_uuid(), link_id, edit_version, redirect_url, 'migration', now() FROM urls u
 WHERE NOT EXISTS (SELECT 1 FROM link_revisions r WHERE r.link_id = u.link_id)
 ON CONFLICT(link_id, version) DO NOTHING;
CREATE TABLE IF NOT EXISTS scheduled_link_changes (
  id uuid PRIMARY KEY, link_id uuid NOT NULL, expected_version bigint NOT NULL,
  destination_url text NOT NULL, actor text NOT NULL, run_at timestamptz NOT NULL,
  status text NOT NULL, created_at timestamptz NOT NULL, completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_scheduled_link_changes_due ON scheduled_link_changes(status, run_at);
CREATE TABLE IF NOT EXISTS api_operations (
  id uuid PRIMARY KEY, actor text NOT NULL, kind text NOT NULL, status text NOT NULL,
  payload text NOT NULL, results text NOT NULL, created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL, completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_api_operations_actor_created ON api_operations(actor, created_at);
CREATE TABLE IF NOT EXISTS api_idempotency (
  actor text NOT NULL, route text NOT NULL, key text NOT NULL, fingerprint text NOT NULL,
  resource_id uuid NOT NULL, created_at timestamptz NOT NULL,
  PRIMARY KEY(actor, route, key)
);
