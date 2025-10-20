-- Setup Read-Only User for Dashboard
-- This creates a truly read-only PostgreSQL user with limited permissions
--
-- Security benefits:
-- - Dashboard can only SELECT data (no INSERT/UPDATE/DELETE)
-- - Follows principle of least privilege
-- - Isolates dashboard from write operations

-- Create or update the read-only role
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'market_edge_readonly') THEN
        -- User exists, just update the password
        ALTER ROLE market_edge_readonly WITH PASSWORD 'GwAkwNDjff2Y2PfBbuVPQFhrKbgmy5co';
        RAISE NOTICE 'Updated password for existing market_edge_readonly user';
    ELSE
        -- Create new user
        CREATE ROLE market_edge_readonly WITH LOGIN PASSWORD 'GwAkwNDjff2Y2PfBbuVPQFhrKbgmy5co';
        RAISE NOTICE 'Created new market_edge_readonly user';
    END IF;
END
$$;

-- Grant necessary permissions (read-only)
GRANT CONNECT ON DATABASE market_edge TO market_edge_readonly;
GRANT USAGE ON SCHEMA public TO market_edge_readonly;

-- Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO market_edge_readonly;

-- Grant SELECT on all existing views (important!)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO market_edge_readonly;

-- Grant SELECT on sequences (needed to read serial IDs)
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO market_edge_readonly;

-- Automatically grant SELECT on future tables/views
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO market_edge_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO market_edge_readonly;

-- Verify permissions
SELECT
    'market_edge_readonly user configured successfully!' as status,
    datname as database
FROM pg_database
WHERE datname = current_database();

-- Show what the user can access
\du market_edge_readonly
