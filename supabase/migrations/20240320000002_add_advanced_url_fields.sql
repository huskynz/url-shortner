-- Add schedule_start, schedule_end, usage_quota, and custom_rules columns to the urls table
ALTER TABLE urls
ADD COLUMN schedule_start TIMESTAMP WITH TIME ZONE,
ADD COLUMN schedule_end TIMESTAMP WITH TIME ZONE,
ADD COLUMN usage_quota INTEGER,
ADD COLUMN custom_rules JSONB;

-- You can add indexes later if needed for performance on these new columns. 