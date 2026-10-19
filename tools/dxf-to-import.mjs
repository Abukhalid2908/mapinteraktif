// Mengubah DXF ASCII (LWPOLYLINE/TEXT) berkoordinat UTM menjadi data impor aplikasi peta MM2100.
// Tidak menyentuh database. Hasil ditulis ke outputs/dxf/ (folder ini diabaikan git) lalu diimpor lewat admin.
//
// Pemakaian:
//   node tools/dxf-to-import.mjs "test pak pras.dxf" [--zone 48] [--south] [--out outputs/dxf]
//
// Asumsi koordinat: UTM WGS84, zona 48 belahan selatan (diperiksa: pusat DXF jatuh di sekitar 107.095 BT, 6.30 LS).
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const src = args.find((a) => !a.startsWith('--') && a !== flag('--zone') && a !== flag('--out'));
if (!src) {
  console.error('Berkas DXF belum diberikan.');
  process.exit(1);
}
const ZONE = Number(flag('--zone', 48));
const SOUTH = args.includes('--south') || !args.includes('--north');
const OUT = path.resolve(flag('--out', 'outputs/dxf'));
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- DXF
function readPairs(file) {
  const lines = fs.readFileSync(file, 'latin1').split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push([code, lines[i + 1].trim()]);
  }
  return pairs;
}
function entitiesOf(pairs) {
  const s = pairs.findIndex((p, i) => p[0] === 0 && p[1] === 'SECTION' && pairs[i + 1]?.[1] === 'ENTITIES');
  const e = pairs.findIndex((p, i) => i > s && p[0] === 0 && p[1] === 'ENDSEC');
  const out = [];
  let cur = null;
  for (const [c, v] of pairs.slice(s + 2, e)) {
    if (c === 0) {
      if (cur) out.push(cur);
      cur = { type: v, d: [] };
    } else if (cur) cur.d.push([c, v]);
  }
  if (cur) out.push(cur);
  return out;
}
function arc(p, q, bulge, stepDeg = 6) {
  if (Math.abs(bulge) < 1e-9) return [q];
  const dx = q[0] - p[0], dy = q[1] - p[1], c = Math.hypot(dx, dy);
  if (c < 1e-9) return [q];
  const theta = 4 * Math.atan(bulge);
  const r = c / (2 * Math.sin(Math.abs(theta) / 2));
  const h = r * Math.cos(theta / 2);
  const sign = bulge > 0 ? 1 : -1;
  const cx = (p[0] + q[0]) / 2 + sign * h * (-dy / c);
  const cy = (p[1] + q[1]) / 2 + sign * h * (dx / c);
  const a0 = Math.atan2(p[1] - cy, p[0] - cx);
  const n = Math.max(2, Math.floor(Math.abs((theta * 180) / Math.PI) / stepDeg));
  const pts = [];
  for (let k = 1; k < n; k++) pts.push([cx + r * Math.cos(a0 + (theta * k) / n), cy + r * Math.sin(a0 + (theta * k) / n)]);
  pts.push(q);
  return pts;
}
function lwpolyline(en) {
  const verts = [];
  let flags = 0;
  for (const [c, v] of en.d) {
    if (c === 70) flags = parseInt(v, 10);
    else if (c === 10) verts.push({ x: parseFloat(v), y: null, b: 0 });
    else if (c === 20 && verts.length && verts.at(-1).y === null) verts.at(-1).y = parseFloat(v);
    else if (c === 42 && verts.length) verts.at(-1).b = parseFloat(v);
  }
  const closed = Boolean(flags & 1);
  const pts = [[verts[0].x, verts[0].y]];
  const n = verts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    pts.push(...arc([a.x, a.y], [b.x, b.y], a.b));
  }
  if (closed) {
    const f = pts[0], l = pts.at(-1);
    if (f[0] === l[0] && f[1] === l[1]) pts.pop();
  }
  return { closed, pts };
}

// ---------------------------------------------------------------- UTM -> WGS84 (Kruger)
function utmToLatLng(E, N, zone, south) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, E0 = 500000, N0 = south ? 10000000 : 0;
  const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
  const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64);
  const beta = [n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360, n2 / 48 + n3 / 15 - (437 * n4) / 1440, (17 * n3) / 480 - (37 * n4) / 840, (4397 * n4) / 161280];
  const delta = [2 * n - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45, (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45, (56 * n3) / 15 - (136 * n4) / 35, (4279 * n4) / 630];
  const xi = (N - N0) / (k0 * A), eta = (E - E0) / (k0 * A);
  let xi2 = xi, eta2 = eta;
  beta.forEach((b, j) => {
    const k = 2 * (j + 1);
    xi2 -= b * Math.sin(k * xi) * Math.cosh(k * eta);
    eta2 -= b * Math.cos(k * xi) * Math.sinh(k * eta);
  });
  const chi = Math.asin(Math.sin(xi2) / Math.cosh(eta2));
  let phi = chi;
  delta.forEach((d, j) => (phi += d * Math.sin(2 * (j + 1) * chi)));
  const lon0 = (zone * 6 - 183) * (Math.PI / 180);
  const lam = lon0 + Math.atan2(Math.sinh(eta2), Math.cos(xi2));
  return [(lam * 180) / Math.PI, (phi * 180) / Math.PI]; // [lng, lat]
}

// ---------------------------------------------------------------- bangun data
const ents = entitiesOf(readPairs(src));
const polys = [];
const texts = [];
for (const en of ents) {
  const layer = en.d.find(([c]) => c === 8)?.[1] ?? '0';
  if (en.type === 'LWPOLYLINE') polys.push({ layer, ...lwpolyline(en) });
  else if (en.type === 'TEXT' || en.type === 'MTEXT') {
    const x = parseFloat(en.d.find(([c]) => c === 10)[1]), y = parseFloat(en.d.find(([c]) => c === 20)[1]);
    texts.push({ layer, text: en.d.find(([c]) => c === 1)?.[1] ?? '', x, y });
  }
}
const lengthM = (pts, closed) => {
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  if (closed) L += Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]);
  return Math.round(L * 10) / 10;
};
const areaM2 = (pts) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.round(Math.abs(s) / 2);
};
const toLL = (pts) => pts.map(([x, y]) => utmToLatLng(x, y, ZONE, SOUTH).map((v) => Math.round(v * 1e7) / 1e7));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const source = `CAD: ${path.basename(src)} (UTM ${ZONE}${SOUTH ? 'S' : 'N'} -> WGS84), belum disurvei ulang`;

const plots = [];
const infrastructure = [];
const skipped = [];
const plotLayer = /KAVLING/i;
const infraNames = {
  '01-ASET JALAN JATIWANGI': 'Aset Jalan Jatiwangi (garis ROW dari CAD)',
  '02-ASET JALAN RAWA INTAN': 'Aset Jalan Rawa Intan (garis ROW dari CAD)',
  ROAD: 'Garis tepi jalan (layer ROAD dari CAD)',
  'PANJANG JALAN': 'Sumbu/panjang jalan (layer PANJANG JALAN dari CAD)',
};
for (const p of polys) {
  if (plotLayer.test(p.layer) && p.closed) {
    const ring = toLL(p.pts);
    ring.push(ring[0]);
    plots.push({
      id: `cad-${slug(p.layer)}-${plots.length + 1}`,
      plot_number: `${p.layer.replace(/^\d+-/, '')} (dari CAD)`,
      status: 'draft',
      area_m2: areaM2(p.pts),
      zonation: 'Belum diverifikasi',
      tenant_name: null,
      source,
      verified_at: null,
      coordinates: ring,
    });
  } else if (infraNames[p.layer]) {
    const ll = toLL(p.pts);
    if (p.closed) ll.push(ll[0]);
    infrastructure.push({
      id: `cad-${slug(p.layer)}`,
      name: infraNames[p.layer],
      category: 'road',
      geometry_type: 'line',
      status: 'draft',
      condition: 'ok',
      length_m: lengthM(p.pts, p.closed),
      description: `Diimpor dari layer "${p.layer}" pada DXF. ${p.closed ? 'Garis tertutup (tepi koridor), panjang = keliling.' : 'Garis terbuka.'} Belum diverifikasi lapangan.`,
      source,
      verified_at: null,
      coordinates: ll,
    });
  } else skipped.push(`${p.layer} (${p.pts.length} titik)`);
}
for (const t of texts) skipped.push(`TEKS "${t.text}" pada layer ${t.layer}`);

// ---------------------------------------------------------------- tulis keluaran
fs.mkdirSync(OUT, { recursive: true });
const write = (name, data) => fs.writeFileSync(path.join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
write('plots.json', plots);
write('infrastructure.json', infrastructure);
write('add-road-category.sql', "INSERT IGNORE INTO infrastructure_categories(id,label,color) VALUES ('road','Jalan','#52665a');\n");
write('preview.geojson', {
  type: 'FeatureCollection',
  features: [
    ...plots.map((p) => ({ type: 'Feature', properties: { kind: 'plot', name: p.plot_number, area_m2: p.area_m2 }, geometry: { type: 'Polygon', coordinates: [p.coordinates] } })),
    ...infrastructure.map((i) => ({ type: 'Feature', properties: { kind: 'infra', name: i.name, length_m: i.length_m, layer: i.id }, geometry: { type: 'LineString', coordinates: i.coordinates } })),
  ],
});
const all = [...plots, ...infrastructure].flatMap((x) => x.coordinates);
const lngs = all.map((c) => c[0]), lats = all.map((c) => c[1]);
console.log(JSON.stringify({
  keluaran: OUT,
  bidang: plots.map((p) => ({ id: p.id, luas_m2: p.area_m2, titik: p.coordinates.length })),
  infrastruktur: infrastructure.map((i) => ({ id: i.id, panjang_m: i.length_m, titik: i.coordinates.length })),
  dilewati: skipped,
  bbox_lnglat: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)].map((v) => +v.toFixed(5)),
}, null, 2));
