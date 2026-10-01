import crypto from 'node:crypto';
import { allowedOrigins, query } from './db.mjs';

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export async function newSession(conn, adminId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(32).toString('hex');
  const expires = Math.floor(Date.now() / 1000) + 28800;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await query(conn, 'INSERT INTO app_sessions(token_hash,admin_id,csrf,expires_at) VALUES (?,?,?,?)', [tokenHash, adminId, csrf, expires]);
  if (res) {
    const origins = allowedOrigins();
    const secure = origins.length > 0 && origins.every((o) => o.startsWith('https://'));
    const attrs = [
      `mm2100_session=${token}`,
      'Path=/',
      `Expires=${new Date(expires * 1000).toUTCString()}`,
      'HttpOnly',
      'SameSite=Strict',
    ];
    if (secure) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
  }
  return { token_hash: tokenHash, admin_id: adminId, csrf, expires_at: expires };
}

export async function currentSession(conn, req, res) {
  const token = parseCookies(req.headers.cookie).mm2100_session || '';
  let session = null;
  if (/^[a-f0-9]{64}$/.test(token)) {
    const rows = await query(conn, 'SELECT * FROM app_sessions WHERE token_hash=? AND expires_at>?', [
      crypto.createHash('sha256').update(token).digest('hex'),
      Math.floor(Date.now() / 1000),
    ]);
    session = rows[0] || null;
  }
  return session || newSession(conn, null, res);
}

export function localSetup(setting_, remoteAddr) {
  const addr = (remoteAddr || '').replace(/^::ffff:/, '');
  if (setting_('ALLOW_LOCAL_SETUP') !== '1' || !['127.0.0.1', '::1'].includes(addr)) return false;
  return allowedOrigins().some((value) => {
    let origin;
    try {
      origin = new URL(value);
    } catch {
      return false;
    }
    return (
      origin.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(origin.hostname) &&
      !origin.username &&
      !origin.password &&
      (origin.pathname === '' || origin.pathname === '/') &&
      !origin.search &&
      !origin.hash
    );
  });
}

export function resolveParents(rows) {
  const index = new Map(rows.map((r) => [r.id, r]));
  return rows.map((row) => {
    if (row.parent_id && index.has(row.parent_id)) {
      const parent = index.get(row.parent_id);
      return { ...row, latitude: parent.latitude, longitude: parent.longitude, address: parent.address };
    }
    return row;
  });
}
