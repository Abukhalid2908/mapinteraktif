import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../backend/db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = await readFile(path.join(root, 'backend/schema.sql'), 'utf8');
const conn = await db().getConnection();
try {
  for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await conn.query(statement);
  }
  console.log('Schema database siap.');
} finally {
  conn.release();
  await db().end();
}
