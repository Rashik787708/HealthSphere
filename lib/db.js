import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let clientInstance = null;

export function getClient() {
  if (clientInstance) {
    return clientInstance;
  }

  const url = process.env.TURSO_DATABASE_URL || 'file:healthsphere.db';
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

  clientInstance = createClient({
    url,
    authToken,
  });

  return clientInstance;
}

/**
 * Execute a query that returns rows
 */
export async function query(sql, args = []) {
  const client = getClient();
  const result = await client.execute({ sql, args });
  return result.rows || [];
}

/**
 * Execute a query that returns a single row or null
 */
export async function queryOne(sql, args = []) {
  const rows = await query(sql, args);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute an insert/update/delete operation
 */
export async function execute(sql, args = []) {
  const client = getClient();
  return await client.execute({ sql, args });
}

/**
 * Execute multiple statements in batch
 */
export async function batch(statements) {
  const client = getClient();
  return await client.batch(statements);
}

/**
 * Ensure database schema exists (can be run automatically or via npm run db:init)
 */
export async function initDatabase() {
  const schemaPath = path.resolve(__dirname, '../database/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // Split by semicolon statements, avoiding comments and empty lines
  const statements = sql
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  const client = getClient();
  for (const stmt of statements) {
    await client.execute(stmt);
  }
}
