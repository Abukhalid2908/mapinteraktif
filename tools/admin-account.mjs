// Server operator only. Pass secrets via environment, never command-line arguments.
import { db, query, withTransaction } from '../backend/db.mjs';
import { hashPassword } from '../backend/crypto-utils.mjs';

const mode = process.argv[2] ?? '';
const email = String(process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

if (!['create', 'create-user', 'reset'].includes(mode) || !emailValid || email.length > 254 || password.length < 12 || password.length > 72) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12-72 bytes), then run admin-account.mjs create|create-user|reset.');
  process.exit(1);
}

try {
  await withTransaction(async (conn) => {
    if (mode === 'create' || mode === 'create-user') {
      await query(conn, 'INSERT INTO admins(email,password_hash,role) VALUES (?,?,?)', [
        email,
        hashPassword(password),
        mode === 'create' ? 'admin' : 'internal',
      ]);
    } else {
      const [row] = await query(conn, 'SELECT id FROM admins WHERE email=? FOR UPDATE', [email]);
      if (!row) throw new Error('Admin not found.');
      await query(conn, 'UPDATE admins SET password_hash=? WHERE id=?', [hashPassword(password), row.id]);
      await query(conn, 'DELETE FROM app_sessions WHERE admin_id=?', [row.id]);
    }
  });
  console.log('Account updated.');
} catch {
  console.error('Account operation failed. Verify email and database configuration.');
  process.exit(1);
} finally {
  await db().end();
}
