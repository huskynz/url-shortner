-- Queue table for deferred visit processing
CREATE TABLE IF NOT EXISTS visit_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  short_path text NOT NULL,
  ip_address text,
  user_agent text,
  environment text,
  version_number text,
  user_id uuid,
  browser text,
  os text,
  received_at timestamptz DEFAULT now() NOT NULL,
  processed_at timestamptz,
  processing_status text DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_visit_queue_status_received_at
  ON visit_queue (processing_status, received_at);
