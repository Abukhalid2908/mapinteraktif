import { fail } from './errors.mjs';
import { query } from './db.mjs';
import { lineLengthM } from '../lib/data.mjs';

export function validDate(date) {
  if (typeof date !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== mo || dt.getUTCDate() !== d) return false;
  return date <= new Date().toISOString().slice(0, 10);
}

function isNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function trimOrNull(v) {
  return v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim();
}

export async function validateFacility(conn, input) {
  const out = {};
  for (const [key, max] of Object.entries({ parent_id: 80, unit_number: 80 })) {
    const v = input[key] ?? null;
    if (v !== null && (typeof v !== 'string' || v.length > max)) fail(`Kolom ${key} tidak valid.`, 422);
    out[key] = trimOrNull(v);
  }
  for (const [key, max] of Object.entries({ id: 80, name: 200, category: 40, address: 1000, source: 1000, status: 16 })) {
    if (typeof input[key] !== 'string' || input[key].length > max) fail(`Kolom ${key} tidak valid.`, 422);
    out[key] = input[key].trim();
  }
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(out.id) || !out.name) fail('ID atau nama tidak valid.', 422);
  const categoryRows = await query(conn, 'SELECT id FROM categories WHERE id=? AND enabled=1', [out.category]);
  if (!categoryRows.length) fail('Kategori tidak tersedia atau nonaktif.', 422);
  if (!['draft', 'published', 'archived'].includes(out.status)) fail('Status tidak valid.', 422);
  for (const [key, max] of Object.entries({ latitude: 90, longitude: 180 })) {
    const n = input[key] ?? null;
    if (!isNumber(n) || Math.abs(n) > max) fail('Koordinat tidak valid.', 422);
    out[key] = n;
  }
  for (const key of ['tags', 'menu_keywords']) {
    const items = input[key] ?? null;
    if (!Array.isArray(items) || items.length > 50) fail(`Daftar ${key} tidak valid.`, 422);
    for (const item of items) if (typeof item !== 'string' || !item.trim() || item.length > 100) fail(`Isi ${key} tidak valid.`, 422);
    out[key] = [...new Set(items.map((item) => item.trim()))];
  }
  for (const key of ['opening_hours', 'phone', 'website', 'verified_at']) {
    const value = input[key] ?? null;
    if (value !== null && (typeof value !== 'string' || value.length > 1000)) fail(`Kolom ${key} tidak valid.`, 422);
    out[key] = trimOrNull(value);
  }
  if (out.website !== null) {
    let scheme = '';
    try {
      scheme = new URL(out.website).protocol.replace(':', '').toLowerCase();
    } catch {
      fail('Website harus URL HTTP/HTTPS.', 422);
    }
    if (!['http', 'https'].includes(scheme)) fail('Website harus URL HTTP/HTTPS.', 422);
  }
  if (out.verified_at !== null && !validDate(out.verified_at)) fail('Tanggal verifikasi tidak valid.', 422);
  if (out.status === 'published' && (!out.address || !out.source || !validDate(out.verified_at) || input.demo)) {
    fail('Alamat, sumber, dan tanggal verifikasi wajib sebelum publikasi; data demo tidak boleh diterbitkan.', 422);
  }
  return out;
}

export async function validatePlot(_conn, input) {
  const out = {};
  for (const [key, max] of Object.entries({ id: 80, plot_number: 100, status: 16, zonation: 100, source: 1000 })) {
    if (typeof input[key] !== 'string' || input[key].length > max) fail(`Kolom ${key} tidak valid.`, 422);
    out[key] = input[key].trim();
  }
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(out.id) || !out.plot_number || !out.zonation) fail('ID, nomor bidang, atau zonasi tidak valid.', 422);
  if (!['draft', 'available', 'reserved', 'occupied', 'utility', 'archived'].includes(out.status)) fail('Status bidang tidak valid.', 422);
  const tenant = input.tenant_name ?? null;
  if (tenant !== null && (typeof tenant !== 'string' || tenant.length > 200)) fail('Nama tenant tidak valid.', 422);
  out.tenant_name = trimOrNull(tenant);
  const area = input.area_m2 ?? null;
  if (!isNumber(area) || area <= 0 || area > 1000000000) fail('Luas bidang tidak valid.', 422);
  out.area_m2 = area;
  const coordinates = input.coordinates ?? null;
  if (!Array.isArray(coordinates) || coordinates.length < 4 || coordinates.length > 500) fail('Polygon memerlukan minimal tiga titik.', 422);
  const clean = [];
  for (const point of coordinates) {
    if (!Array.isArray(point) || point.length !== 2 || !isNumber(point[0]) || !isNumber(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) {
      fail('Koordinat polygon tidak valid.', 422);
    }
    clean.push([point[0], point[1]]);
  }
  if (clean[0][0] !== clean[clean.length - 1][0] || clean[0][1] !== clean[clean.length - 1][1]) fail('Polygon harus tertutup.', 422);
  out.coordinates = clean;
  const verified = input.verified_at ?? null;
  if (verified !== null && (typeof verified !== 'string' || !validDate(verified))) fail('Tanggal verifikasi tidak valid.', 422);
  out.verified_at = verified === null || verified === '' ? null : verified;
  if (!['draft', 'archived'].includes(out.status) && (!out.source || !out.verified_at)) fail('Sumber dan tanggal verifikasi wajib sebelum bidang ditampilkan.', 422);
  return out;
}

export async function validateInfrastructure(conn, input) {
  const out = {};
  for (const [key, max] of Object.entries({ id: 80, name: 160, category: 40, geometry_type: 10, status: 16, description: 1000, source: 1000 })) {
    if (typeof input[key] !== 'string' || input[key].length > max) fail(`Kolom ${key} tidak valid.`, 422);
    out[key] = input[key].trim();
  }
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(out.id) || !out.name) fail('ID atau nama infrastruktur tidak valid.', 422);
  const categoryRows = await query(conn, 'SELECT id FROM infrastructure_categories WHERE id=? AND enabled=1', [out.category]);
  if (!categoryRows.length || !['point', 'line'].includes(out.geometry_type) || !['draft', 'published', 'archived'].includes(out.status)) {
    fail('Jenis infrastruktur tidak valid atau nonaktif.', 422);
  }
  const condition = input.condition ?? 'ok';
  if (!['ok', 'not_ok'].includes(condition)) fail('Kondisi aset tidak valid.', 422);
  out.condition = condition;
  const coordinates = input.coordinates ?? null;
  const minimum = out.geometry_type === 'point' ? 1 : 2;
  if (!Array.isArray(coordinates) || coordinates.length < minimum || coordinates.length > 1000) fail('Koordinat infrastruktur tidak valid.', 422);
  out.coordinates = [];
  for (const p of coordinates) {
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number' || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) {
      fail('Koordinat infrastruktur tidak valid.', 422);
    }
    out.coordinates.push([p[0], p[1]]);
  }
  if (out.geometry_type === 'point') out.coordinates = [out.coordinates[0]];
  if (out.geometry_type === 'line') {
    const length = input.length_m ?? lineLengthM(out.coordinates);
    if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0) fail('Panjang jalur tidak valid.', 422);
    out.length_m = length;
  } else {
    out.length_m = null;
  }
  const verified = input.verified_at ?? null;
  if (verified !== null && (typeof verified !== 'string' || !validDate(verified))) fail('Tanggal verifikasi tidak valid.', 422);
  out.verified_at = verified || null;
  if (out.status === 'published' && (!out.source || !out.verified_at)) fail('Sumber dan tanggal verifikasi wajib sebelum publikasi.', 422);
  return out;
}
