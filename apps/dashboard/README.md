# Market Edge Dashboard

Simple Next.js dashboard for viewing Q-Learning trading agent results.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure database connection:
```bash
cp .env.local.example .env.local
# Edit .env.local and set DATABASE_READONLY_URL
```

3. Run development server:
```bash
npm run dev
```

4. Open http://localhost:3000

## Pages

- **/** - Overview: Bankroll, active positions, recent trades
- **/trades** - Complete trade history
- **/performance** - Daily performance metrics
- **/agent** - Q-Learning agent stats and decision logs
- **/capital** - Capital discipline dashboard (cash buckets, exposure, rewards, indicator freshness)

## Architecture

- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **PostgreSQL** via `pg` library (read-only connection)
- **Server-side rendering** for real-time data (no caching)

## Database Connection

The dashboard uses `DATABASE_READONLY_URL` for read-only access. This prevents accidental writes and follows security best practices.

All database queries are in `lib/db.ts` using connection pooling.

## Development

- Keep pages simple and barebones (learning project)
- All data fetching happens server-side
- API routes are in `app/api/`
- Pages are in `app/`
