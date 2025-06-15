-- Add a password column to the urls table
ALTER TABLE urls
ADD COLUMN password TEXT;

-- If you need to encrypt existing passwords or set default values, do it here.
-- For new entries, the password column will be null by default if not provided. 