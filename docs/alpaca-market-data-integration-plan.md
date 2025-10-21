# Alpaca Market Data Integration Plan

## Why We’re Switching
- **Problem:** Polygon’s free tier now gates intraday bars behind end-of-day access, so our every-5-minute ETL loop fails to ingest fresh data.
- **Goal:** Source intraday (or near real-time, ≤15-minute delay) OHLCV data that we can call all trading day long without breaching rate limits.
- **Decision:** Use Alpaca Market Data v2 (Basic/IEX feed). It provides 1-second snapshots of IEX trades/quotes, bar aggregation endpoints that mirror our current data shape, and free usage limits that comfortably exceed our ingestion cadence.
- **Non-goal:** Maintain Polygon as a fallback. Once we switch, Alpaca becomes the sole data source.

## Baseline Inventory
- **Legacy provider class:** `packages/providers/polygon_provider.py` exposed `get_last_quote`, `get_aggregates`, `get_intraday_prices`, `get_previous_close` (now replaced by `packages/providers/alpaca_provider.py` with the same interface).
- **Consumers:** `ops/scripts/market_data_etl.py` (polls every 5 minutes) and `ops/scripts/settle_trades.py` (previous close at 4:05 PM ET).
- **ETL load:** Default portfolio of 10 tickers → 10 API calls per ETL run. Runs every 5 minutes (market open), so ~78 runs/day → 780 calls/day. Average call rate ≈2 requests/minute.
- **Infrastructure:** Requests-based HTTP, `.env` for credentials, no async requirements, indicators computed locally.

## Alpaca API Snapshot
- **Base URL:** `https://data.alpaca.markets/v2`
- **Credentials:** `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY` headers; optional `APCA_DATA_BASE_URL` override.
- **Endpoints to use:**
  - Latest quote: `GET /stocks/{symbol}/quotes/latest`
  - Intraday bars: `GET /stocks/{symbol}/bars?timeframe=5Min&limit=100&adjustment=all`
  - Previous close: `GET /stocks/{symbol}/bars?timeframe=1Day&limit=2` (use most recent completed bar) or `GET /stocks/{symbol}/snapshot` (has `dailyBar`).
- **Response fields:** Bars include `t` (ISO8601), `o/h/l/c/v/vw`. Quotes include `bp/ap/bp` etc.
- **Rate limits (Basic plan):** 200 requests/minute and 10,000 requests/day (documented limit as of 2024). Soft-enforced with `X-RateLimit-*` headers; exceeding returns HTTP 429.
- **Latency:** ~1–2 seconds vs IEX real-time prints. This is suitable for day-trading simulations; only SIP-level feeds surpass it but require paid plans and more complex compliance.

## Feasibility Check
- **Daily budget:** We perform ~780 data calls + ~10 quote/close calls. Margin vs 10,000 limit is >12×.
- **Per-minute budget:** ≈2 calls/minute vs 200 limit. We can safely reduce or remove the 12-second sleep.
- **Data fidelity:** Bars include VWAP, matching our `vwap` usage. Quotes provide bid/ask/last. Daily bars deliver previous close.
- **Market coverage:** IEX trades only; expect occasional spread vs consolidated tape. Acceptable for simulation/training. (Document any need for SIP-grade data later.)

## Integration Tasks (Ordered)
1. **Credentials & Config** *(Owner: You)*
   - Obtain Alpaca Market Data v2 API access (Basic/IEX) and generate `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY`.
   - Store keys in your secrets manager and local `.env`; share through your normal secret-handling channel (no check-in).
   - Create or confirm `APCA_DATA_BASE_URL` (defaults to `https://data.alpaca.markets` if unset).
   - Plan to remove `POLYGON_API_KEY` from secrets once rollout completes.

2. **Provider Implementation** *(Owner: Codex)*
   - Create `packages/providers/alpaca_provider.py` with the existing Polygon methods (`get_last_quote`, `get_aggregates`, `get_intraday_prices`, `get_previous_close`).
   - Implement `_make_request` using Alpaca headers, add 429-aware backoff, surface `X-RateLimit-*` metrics in logs.
   - Map Alpaca responses to the current dict shape and normalize timestamps to `%Y-%m-%d %H:%M:%S`.
   - Update `packages/providers/__init__.py` to export the new provider; remove the Polygon class after validation.

3. **Consumer Updates** *(Owner: Codex)*
   - Swap provider imports in `ops/scripts/market_data_etl.py` and `ops/scripts/settle_trades.py`.
   - Retire the hard-coded 12-second delay; optionally add a configurable `SAFETY_DELAY_SECONDS` defaulting to zero with logging.
   - Update previous-close retrieval to use Alpaca bars or snapshot data.
   - Ensure ETL transformation and indicators handle the normalized timestamp/field names.

4. **Docs & Tooling** *(Owner: Codex, with review from You)*
   - Update `README.md`, `docs/SETUP.md`, ops runbooks, and `.env.example` to reference Alpaca credentials, limits, and troubleshooting steps.
   - Provide a quick verification script (e.g., `python -m packages.providers.alpaca_provider`) for you to run with real keys.
   - Once reviewed, you confirm messaging reflects operational processes and remove legacy Polygon references elsewhere.

5. **Testing & Verification** *(Joint)*
   - Codex: Run local dry runs (quote, bars, daily bar) using mock or test credentials if available; otherwise supply scripts/logging for you.
   - You: Execute ETL and settlement scripts end-to-end with real credentials in a safe environment (e.g., staging DB) and confirm data arrives, indicators compute, and rate-limit headers remain comfortable.
   - Joint: Monitor for 429s or schema issues; adjust retries or field mappings if Alpaca responses differ for specific symbols.

6. **Deployment Sequencing** *(Joint)*
   - Codex: Prepare merge-ready changes and highlight rollout instructions.
   - You: Deploy updated code, set environment secrets, restart schedulers/cron jobs, and validate first trading session.
   - Joint: After successful run, remove Polygon API keys, delete unused provider code, and document the cutover in ops logs.

## Code Impact Summary
- **Minimal surface change:** Provider swap + timestamp parsing. No schema or indicator changes.
- **Rate limit handling:** Delete hard-coded `RATE_LIMIT_DELAY`; rely on Alpaca’s generous limits and backoff logic.
- **Error handling:** Alpaca uses `code`/`message` in JSON body; adjust exception text accordingly.
- **Dependencies:** `requests` stays; no extra packages required.
- **Scheduling:** Optionally tighten ETL interval (e.g., 1-minute bars) because rate limits allow it. Default remains 5 minutes for stability.

## Risks & Mitigations
- **Credential misconfiguration:** Provide validation script; fail fast with descriptive error if headers missing.
- **Data gaps (IEX vs SIP):** Communicate expected differences; if unacceptable, evaluate paid SIP feed later.
- **429 throttling:** Implement exponential backoff with jitter; log metrics to confirm call volume.
- **Breaking change in Alpaca API:** Keep provider methods centralized for quick updates; document current API version.

## Validation Checklist
- [ ] Provider demo script returns data for target symbols.
- [ ] ETL inserts expected number of rows for one run.
- [ ] Rate-limit headers stay well above zero during load test.
- [ ] Technical indicators compute without errors using Alpaca timestamps.
- [ ] Settlement script closes positions with Alpaca daily bar data.
- [ ] Ops docs, runbooks, and env templates updated.
- [ ] Polygon provider and secrets removed from repo and deployment.

## Day-Trading Data Cadence
- Alpaca’s near-real-time IEX feed lets us poll as frequently as 1 request per symbol per minute without issue, which is ideal for day-trading simulations.
- For strategies needing faster reactions, consider moving ETL interval from 5 minutes to 1 minute once the integration is stable, as the rate limits allow ~200 symbols/minute.
- Remaining within free-tier limits while maximizing intraday updates gives the trading agent the best approximation of live market dynamics without paid SIP data.

## Open Questions
- Do we want to expand the ticker list beyond 10 symbols post-migration? (Permitted by limit, but affects DB growth.)
- Should we implement per-symbol caching to avoid redundant calls when consecutive runs overlap in time?
- Any compliance/logging requirements for storing IEX market data long-term?
