/**
 * Database Connection Utility
 *
 * Simple PostgreSQL connection for read-only queries.
 * Uses connection pooling for performance.
 */

import { Pool } from 'pg'

// Create connection pool (read-only access)
const pool = new Pool({
  connectionString: process.env.DATABASE_READONLY_URL,
  max: 10, // Max 10 connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // 10 seconds (Neon can be slow)
  ssl: {
    rejectUnauthorized: false // Required for Neon
  }
})

/**
 * Execute a read-only SQL query
 *
 * @param query - SQL query string
 * @param params - Query parameters (optional)
 * @returns Query results
 */
export async function query(query: string, params?: any[]) {
  const client = await pool.connect()
  try {
    const result = await client.query(query, params)
    return result.rows
  } finally {
    client.release()
  }
}

/**
 * Get a single row from the database
 *
 * @param sql - SQL query string
 * @param params - Query parameters (optional)
 * @returns Single row or null
 */
export async function queryOne(sql: string, params?: any[]) {
  const rows = await query(sql, params)
  return rows.length > 0 ? rows[0] : null
}
