# Supabase operational notes

## Visit queue processing
- `src/app/utils.js` now enqueues visit payloads into the `visit_queue` table instead of inserting directly into `visits`.
- A scheduled cron or Supabase Edge Function should batch-consume `visit_queue` rows (ordered by `received_at`), insert them into `visits`, and mark them processed.
- The queue table definition lives at `supabase/sql/visit_queue_table.sql`.

## Performance indexes
- Ensure the `visits` table has `idx_visits_short_path` to accelerate lookups; the SQL to create it if missing is in `supabase/sql/visits_short_path_index.sql`.
