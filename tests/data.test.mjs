import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distanceKm,
  filterFacilities,
  lineLengthM,
  navigationUrl,
  polygonAreaM2,
  validateDataset,
  publicDataset,
} from '../lib/data.mjs';
const facility = {
  id: 'a',
  name: 'Kedai Kopi',
  category: 'resto_cafe',
  latitude: 0,
  longitude: 0,
  address: 'Alamat terverifikasi',
  opening_hours: null,
  phone: null,
  website: null,
  tags: ['WiFi'],
  menu_keywords: ['Nasi goreng'],
  source: 'Survei pengelola',
  verified_at: '2026-09-01',
  status: 'published',
};
const dataset = (facilities = [facility]) => ({
  schema_version: 1,
  updated_at: '2026-09-06T00:00:00Z',
  facilities,
});
await test('Haversine: identik, seperempat bumi, dan input invalid', () => {
  assert.equal(distanceKm(facility, facility), 0);
  assert.ok(
    Math.abs(
      distanceKm(facility, { latitude: 0, longitude: 90 }) - 10007.543398,
    ) < 0.001,
  );
  assert.throws(() => distanceKm(facility, { latitude: NaN, longitude: 0 }));
});
await test('Luas polygon: persegi di ekuator, bentuk tidak tertutup, dan input tidak valid', () => {
  const square = [
    [0, 0],
    [0.01, 0],
    [0.01, 0.01],
    [0, 0.01],
    [0, 0],
  ];
  const area = polygonAreaM2(square);
  assert.ok(area > 1200000 && area < 1250000, `luas tidak masuk akal: ${area}`);
  assert.equal(
    polygonAreaM2(square.slice(0, -1)),
    area,
    'harus sama walau titik penutup tidak diulang',
  );
  assert.equal(polygonAreaM2([[0, 0], [1, 1]]), 0);
  assert.equal(polygonAreaM2([]), 0);
});
await test('Panjang jalur: dua segmen di ekuator dan titik tunggal', () => {
  const length = lineLengthM([
    [0, 0],
    [0.01, 0],
    [0.01, 0.01],
  ]);
  assert.ok(
    length > 2200 && length < 2250,
    `panjang tidak masuk akal: ${length}`,
  );
  assert.equal(lineLengthM([[0, 0]]), 0);
  assert.equal(lineLengthM([]), 0);
});
await test('Pencarian menu, whitespace, kapitalisasi, dan AND kategori', () => {
  assert.equal(
    filterFacilities([facility], ' NASI   GORENG ', 'resto_cafe').length,
    1,
  );
  assert.equal(filterFacilities([facility], 'kopi', 'hotel').length, 0);
  assert.equal(filterFacilities([facility], 'WiFi').length, 1);
});
await test('Schema menolak duplikat, rentang, tanggal palsu, dan URL berbahaya', () => {
  assert.deepEqual(validateDataset(dataset()).errors, []);
  for (const patch of [
    { latitude: 91 },
    { longitude: Infinity },
    { verified_at: '2026-02-30' },
    { verified_at: '2099-01-01' },
    { website: 'javascript:alert(1)' },
    { tags: 'bad' },
    { source: '' },
    { status: 'unknown' },
    { demo: true },
  ])
    assert.ok(
      validateDataset(dataset([{ ...facility, ...patch }])).errors.length,
    );
  assert.ok(validateDataset(dataset([facility, facility])).errors.length);
});
await test('Dataset publik tidak membocorkan draft, arsip, atau field tambahan', () => {
  const input = dataset([
    { ...facility, private_note: 'secret' },
    { ...facility, id: 'b', status: 'draft', verified_at: null },
    { ...facility, id: 'c', status: 'archived' },
  ]);
  const out = publicDataset(input);
  assert.equal(out.facilities.length, 1);
  assert.equal('private_note' in out.facilities[0], false);
  assert.ok(validateDataset(input, { publicOnly: true }).errors.length);
  assert.deepEqual(publicDataset(JSON.parse(JSON.stringify(input))), out);
});
await test('Navigasi menolak demo dan hanya mengirim asal bila diminta', () => {
  const url = new URL(navigationUrl(facility));
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('origin'), null);
  assert.equal(
    new URL(
      navigationUrl(facility, { latitude: 1, longitude: 2 }),
    ).searchParams.get('origin'),
    '1,2',
  );
  assert.throws(() => navigationUrl({ ...facility, demo: true }));
});
