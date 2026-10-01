import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 10;

export function safeEquals(a, b) {
  const ab = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, BCRYPT_COST);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function passwordNeedsRehash(hash) {
  const m = /^\$2[aby]\$(\d+)\$/.exec(hash);
  return !m || Number(m[1]) !== BCRYPT_COST;
}
