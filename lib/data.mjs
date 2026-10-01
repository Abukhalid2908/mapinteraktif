export const categoryIds = [
  'resto_cafe',
  'hotel',
  'food_court',
  'atm',
  'medical',
  'public_facility',
];
export const normalize = (value) =>
  value.toLowerCase().trim().replace(/\s+/g, ' ');
export function filterFacilities(rows, query = '', category = 'all') {
  const q = normalize(query);
  return rows.filter(
    (f) =>
      (category === 'all' || f.category === category) &&
      normalize(
        [
          f.name,
          f.address,
          f.unit_number || '',
          rows.find((p) => p.id === f.parent_id)?.name || '',
          ...f.tags,
          ...(f.menu_keywords || []),
        ].join(' '),
      ).includes(q),
  );
}
export function distanceKm(a, b) {
  for (const p of [a, b])
    if (
      !Number.isFinite(p.latitude) ||
      !Number.isFinite(p.longitude) ||
      Math.abs(p.latitude) > 90 ||
      Math.abs(p.longitude) > 180
    )
      throw Error('Koordinat tidak valid');
  const r = Math.PI / 180,
    dlat = (b.latitude - a.latitude) * r,
    dlon = (b.longitude - a.longitude) * r;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * r) *
      Math.cos(b.latitude * r) *
      Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function lineLengthM(coordinates) {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1],
      [lng2, lat2] = coordinates[i];
    total += distanceKm(
      { latitude: lat1, longitude: lng1 },
      { latitude: lat2, longitude: lng2 },
    );
  }
  return total * 1000;
}
export function polygonAreaM2(coordinates) {
  let points = coordinates;
  if (
    points.length > 1 &&
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1]
  )
    points = points.slice(0, -1);
  if (points.length < 3) return 0;
  const r = Math.PI / 180;
  const refLat =
    (points.reduce((sum, p) => sum + p[1], 0) / points.length) * r;
  const radius = 6371000;
  const projected = points.map(([lng, lat]) => [
    radius * (lng * r) * Math.cos(refLat),
    radius * (lat * r),
  ]);
  let sum = 0;
  for (let i = 0; i < projected.length; i++) {
    const [x1, y1] = projected[i];
    const [x2, y2] = projected[(i + 1) % projected.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}
export function navigationUrl(f, origin = null) {
  if (f.demo) throw Error('Navigasi data contoh dinonaktifkan');
  distanceKm(f, f);
  const q = new URLSearchParams({
    api: '1',
    destination: f.latitude + ',' + f.longitude,
  });
  if (origin) {
    distanceKm(origin, origin);
    q.set('origin', origin.latitude + ',' + origin.longitude);
  }
  return 'https://www.google.com/maps/dir/?' + q;
}
export function streetViewUrl(f) {
  distanceKm(f, f);
  const q = new URLSearchParams({
    api: '1',
    map_action: 'pano',
    viewpoint: f.latitude + ',' + f.longitude,
  });
  return 'https://www.google.com/maps/@?' + q;
}
function dateValid(s) {
  return (
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s &&
    s <= new Date().toISOString().slice(0, 10)
  );
}
export function validateDataset(data, { publicOnly = false } = {}) {
  const errors = [],
    warnings = [];
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return { errors: ['Dataset harus berupa objek JSON.'], warnings };
  if (data.schema_version !== 1) errors.push('schema_version harus 1.');
  if (
    typeof data.updated_at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(data.updated_at) ||
    !Number.isFinite(Date.parse(data.updated_at)) ||
    Date.parse(data.updated_at) > Date.now() + 1000
  )
    errors.push('updated_at harus timestamp UTC valid, bukan masa depan.');
  if (!Array.isArray(data.facilities))
    return { errors: [...errors, 'facilities harus berupa array.'], warnings };
  let allowedCategories = categoryIds;
  if (data.categories !== undefined) {
    if (!Array.isArray(data.categories))
      return { errors: [...errors, 'Kategori harus berupa array.'], warnings };
    const ids = new Set();
    for (const c of data.categories) {
      if (
        !c ||
        typeof c.id !== 'string' ||
        !/^[a-z][a-z0-9_]{0,39}$/.test(c.id) ||
        typeof c.label !== 'string' ||
        !c.label.trim() ||
        c.label.length > 80 ||
        ![
          'resto_cafe',
          'cafe',
          'hotel',
          'food_court',
          'atm',
          'medical',
          'public_facility',
        ].includes(c.icon) ||
        ids.has(c.id)
      )
        errors.push('Definisi kategori tidak valid atau duplikat.');
      if (c) ids.add(c.id);
    }
    allowedCategories = [...ids];
  }
  const ids = new Set(),
    seen = [];
  data.facilities.forEach((f, i) => {
    const label = 'Entri ' + (i + 1) + ': ';
    if (!f || typeof f !== 'object' || Array.isArray(f)) {
      errors.push(label + 'harus berupa objek.');
      return;
    }
    for (const key of ['id', 'name'])
      if (typeof f[key] !== 'string' || !f[key].trim())
        errors.push(label + key + ' wajib diisi.');
    if (ids.has(f.id)) errors.push(label + 'ID duplikat.');
    ids.add(f.id);
    if (!allowedCategories.includes(f.category))
      errors.push(label + 'kategori tidak dikenal.');
    if (!['draft', 'published', 'archived'].includes(f.status))
      errors.push(label + 'status tidak valid.');
    if (publicOnly && f.status !== 'published')
      errors.push(label + 'dataset publik hanya boleh memuat published.');
    if (
      f.unit_number != null &&
      (typeof f.unit_number !== 'string' || f.unit_number.length > 80)
    )
      errors.push(label + 'nomor kios tidak valid.');
    if (f.parent_id != null) {
      const parent = data.facilities.find((p) => p.id === f.parent_id);
      if (
        typeof f.parent_id !== 'string' ||
        !parent ||
        parent.id === f.id ||
        parent.category !== 'food_court' ||
        parent.parent_id ||
        f.category !== 'resto_cafe'
      )
        errors.push(label + 'food court induk tidak valid.');
      else if (f.status === 'published' && parent.status !== 'published')
        errors.push(label + 'food court induk belum terbit.');
    }
    for (const [k, max] of [
      ['latitude', 90],
      ['longitude', 180],
    ])
      if (!Number.isFinite(f[k]) || Math.abs(f[k]) > max)
        errors.push(label + k + ' tidak valid.');
    for (const k of ['address', 'source'])
      if (typeof f[k] !== 'string') errors.push(label + k + ' harus teks.');
    for (const k of ['tags', 'menu_keywords'])
      if (
        !Array.isArray(f[k]) ||
        f[k].some((t) => typeof t !== 'string' || !t.trim())
      )
        errors.push(
          label + k + ' harus array teks tidak kosong (array boleh kosong).',
        );
    for (const k of ['phone', 'opening_hours', 'website'])
      if (f[k] !== null && typeof f[k] !== 'string')
        errors.push(label + k + ' harus teks atau null.');
    if (f.website !== null) {
      try {
        if (
          typeof f.website !== 'string' ||
          !['http:', 'https:'].includes(new URL(f.website).protocol)
        )
          throw Error();
      } catch {
        errors.push(label + 'website harus URL HTTP/HTTPS.');
      }
    }
    if (f.verified_at !== null && !dateValid(f.verified_at))
      errors.push(label + 'tanggal verifikasi tidak valid atau di masa depan.');
    if (f.status === 'published') {
      for (const k of ['address', 'source'])
        if (typeof f[k] !== 'string' || !f[k].trim())
          errors.push(label + k + ' wajib untuk publikasi.');
      if (!dateValid(f.verified_at))
        errors.push(label + 'verifikasi wajib sebelum publikasi.');
      if (f.demo === true)
        errors.push(
          label + 'contoh tidak boleh dipublikasikan sebagai data nyata.',
        );
    }
    if (
      typeof f.name === 'string' &&
      Number.isFinite(f.latitude) &&
      Number.isFinite(f.longitude)
    ) {
      for (const prev of seen)
        if (
          normalize(prev.name) === normalize(f.name) &&
          Math.abs(prev.latitude - f.latitude) < 0.001 &&
          Math.abs(prev.longitude - f.longitude) < 0.001
        )
          warnings.push(label + 'kemungkinan duplikat ' + prev.id + '.');
      seen.push(f);
    }
  });
  return { errors, warnings };
}
export function publicDataset(data) {
  const result = validateDataset(data);
  if (result.errors.length) throw Error(result.errors.join('\n'));
  const keys = [
    'id',
    'name',
    'category',
    'latitude',
    'longitude',
    'address',
    'opening_hours',
    'phone',
    'website',
    'tags',
    'menu_keywords',
    'source',
    'verified_at',
    'status',
    'parent_id',
    'unit_number',
  ];
  return {
    schema_version: 1,
    ...(data.categories
      ? {
          categories: data.categories.map(({ id, label, icon }) => ({
            id,
            label,
            icon,
          })),
        }
      : {}),
    updated_at: data.updated_at,
    facilities: data.facilities
      .filter((f) => f.status === 'published')
      .map((f) => Object.fromEntries(keys.map((k) => [k, f[k]]))),
  };
}
