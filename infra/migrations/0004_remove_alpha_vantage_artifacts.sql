-- Migration: Remove deprecated Alpha Vantage artifacts
-- Date: 2025-10-18
--
-- Drops the unused api_usage_log table that tracked Alpha Vantage calls.
-- Alpaca Market Data is now the sole market data provider.

DROP TABLE IF EXISTS api_usage_log;
