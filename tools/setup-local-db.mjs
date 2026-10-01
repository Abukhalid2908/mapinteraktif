// Creates only the dedicated application database and least-privileged account.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { LOCAL_CONFIG_PATH } from '../backend/db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = LOCAL_CONFIG_PATH;

try {
  await access(configPath);
  console.error('Local config already exists; no changes made.');
  process.exit(1);
} catch {}

const rootConn = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: '' });
const [[{ n: dbExists }]] = await rootConn.query(
  "SELECT COUNT(*) n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='mm2100_map'",
);
if (dbExists) {
  console.error('Database already exists; no changes made.');
  process.exit(1);
}
const [[{ n: userExists }]] = await rootConn.query("SELECT COUNT(*) n FROM mysql.user WHERE User='mm2100_app'");
if (userExists) {
  console.error('Account already exists; no changes made.');
  process.exit(1);
}
const password = crypto.randomBytes(32).toString('hex');
await rootConn.query('CREATE DATABASE mm2100_map CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
await rootConn.query("CREATE USER 'mm2100_app'@'127.0.0.1' IDENTIFIED BY ?", [password]);
await rootConn.query("GRANT SELECT,INSERT,UPDATE,DELETE ON mm2100_map.* TO 'mm2100_app'@'127.0.0.1'");
await rootConn.query('USE mm2100_map');
await rootConn.query(await readFile(path.join(root, 'backend/schema.sql'), 'utf8'));
await rootConn.end();

const config = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_NAME: 'mm2100_map',
  DB_USER: 'mm2100_app',
  DB_PASSWORD: password,
  APP_ORIGIN: 'http://127.0.0.1:2801',
  ALLOW_LOCAL_SETUP: '1',
};
await mkdir(path.dirname(configPath), { recursive: true });
await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
console.log(`Database mm2100_map created. Dedicated application account configured. Config written to ${configPath} (outside the repo). No administrator created; use /admin/ on local port 2801.`);
