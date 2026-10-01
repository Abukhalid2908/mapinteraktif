import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';

// Kept outside the repository/served project tree on purpose: the local dev
// server (vinext/sites plugin) serves the whole project directory statically,
// so any file under the repo root is reachable over HTTP regardless of app-level checks.
export const LOCAL_CONFIG_PATH = process.env.MM2100_CONFIG_PATH || path.join(os.homedir(), '.mm2100', 'config.local.json');

let local = null;
function loadLocal() {
  if (local !== null) return local;
  local = existsSync(LOCAL_CONFIG_PATH) ? JSON.parse(readFileSync(LOCAL_CONFIG_PATH, 'utf8')) : {};
  return local;
}

export function setting(key, def = '') {
  const value = process.env[key];
  if (value !== undefined) return value;
  const value2 = loadLocal()[key];
  return value2 !== undefined ? String(value2) : def;
}

// APP_ORIGIN may hold several comma-separated origins (e.g. one for
// localhost, one for a LAN IP) so the same dev machine can be reached from
// more than one address without weakening the exact-match CSRF/origin check.
export function allowedOrigins() {
  return setting('APP_ORIGIN').split(',').map((s) => s.trim()).filter(Boolean);
}

let pool = null;
export function db() {
  if (!pool) {
    const sslCa = setting('DB_SSL_CA');
    pool = mysql.createPool({
      host: setting('DB_HOST', '127.0.0.1'),
      port: Number(setting('DB_PORT', '3306')),
      database: setting('DB_NAME', 'mm2100_map'),
      user: setting('DB_USER'),
      password: setting('DB_PASSWORD'),
      charset: 'utf8mb4_general_ci',
      waitForConnections: true,
      connectionLimit: 10,
      ssl: sslCa ? { ca: readFileSync(sslCa, 'utf8'), rejectUnauthorized: true } : undefined,
    });
  }
  return pool;
}

export async function query(runner, sql, args = []) {
  const [rows] = await runner.execute(sql, args);
  return rows;
}

export async function withConnection(work) {
  const conn = await db().getConnection();
  try {
    return await work(conn);
  } finally {
    conn.release();
  }
}

export async function withTransaction(work) {
  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  });
}
