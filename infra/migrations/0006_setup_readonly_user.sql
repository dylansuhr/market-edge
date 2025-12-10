-- Setup read-only user for dashboard

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'market_edge_readonly') THEN
        ALTER ROLE market_edge_readonly WITH PASSWORD 'GwAkwNDjff2Y2PfBbuVPQFhrKbgmy5co';
    ELSE
        CREATE ROLE market_edge_readonly WITH LOGIN PASSWORD 'GwAkwNDjff2Y2PfBbuVPQFhrKbgmy5co';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE market_edge TO market_edge_readonly;
GRANT USAGE ON SCHEMA public TO market_edge_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO market_edge_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO market_edge_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO market_edge_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO market_edge_readonly;

SELECT 'market_edge_readonly configured' as status;
