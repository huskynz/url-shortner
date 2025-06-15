-- Create the urls table
CREATE TABLE IF NOT EXISTS urls (
    id BIGSERIAL PRIMARY KEY,
    short_path TEXT UNIQUE NOT NULL,
    redirect_url TEXT NOT NULL,
    deprecated BOOLEAN DEFAULT FALSE,
    password TEXT,
    schedule_start TIMESTAMP WITH TIME ZONE,
    schedule_end TIMESTAMP WITH TIME ZONE,
    usage_quota INTEGER,
    custom_rules JSONB,
    is_private BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create the github_admins table
CREATE TABLE IF NOT EXISTS github_admins (
    id BIGSERIAL PRIMARY KEY,
    github_username TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create an index on short_path for faster lookups
CREATE INDEX IF NOT EXISTS idx_urls_short_path ON urls(short_path);

-- Create an index on github_username for faster lookups
CREATE INDEX IF NOT EXISTS idx_github_admins_username ON github_admins(github_username);

-- Add RLS policies
ALTER TABLE urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_admins ENABLE ROW LEVEL SECURITY;

-- Create policies for urls table
CREATE POLICY "Allow public read access to non-private urls"
    ON urls FOR SELECT
    USING (is_private = false);

CREATE POLICY "Allow admin full access to urls"
    ON urls FOR ALL
    USING (EXISTS (
        SELECT 1 FROM github_admins
        WHERE github_username = auth.jwt()->>'preferred_username'
    ));

-- Create policies for github_admins table
CREATE POLICY "Allow admin read access to github_admins"
    ON github_admins FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM github_admins
        WHERE github_username = auth.jwt()->>'preferred_username'
    )); 