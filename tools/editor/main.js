import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { validateDataset, publicDataset } from '../../lib/data.mjs';
// crypto.randomUUID() hanya ada di localhost/HTTPS; di http://IP-jaringan fungsinya tidak ada dan menambah titik gagal.
// getRandomValues tersedia di semua konteks, jadi UUID v4 dibuat darinya bila perlu.
function newUuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let data = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    facilities: [],
  },
  selected = null,
  dirty = false,
  formDirty = false;
const el = (id) => document.getElementById(id),
  message = (text) => {
    el('message').textContent = text;
  },
  stamp = () => {
    data.updated_at = new Date().toISOString();
    dirty = true;
    el('dirty').textContent = 'Perubahan belum diekspor.';
  };
const map = L.map('map').setView([-6.297, 107.099], 14);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
})
  .addTo(map)
  .on('tileerror', () =>
    message('Sebagian tile gagal dimuat. Form tetap dapat digunakan.'),
  );
const markers = L.layerGroup().addTo(map);
let pendingMarker = null;
const defs = [
  ['id', 'ID (stabil)'],
  ['name', 'Nama'],
  [
    'category',
    'Kategori',
    ['resto_cafe', 'hotel', 'food_court', 'atm', 'medical', 'public_facility'],
  ],
  ['latitude', 'Latitude'],
  ['longitude', 'Longitude'],
  ['address', 'Alamat'],
  ['opening_hours', 'Jam buka (Asia/Jakarta)'],
  ['phone', 'Telepon bisnis'],
  ['website', 'Website'],
  ['tags', 'Tag (pisahkan koma)'],
  ['menu_keywords', 'Menu (pisahkan koma)'],
  ['source', 'Sumber verifikasi (informasi publik saja)'],
  ['verified_at', 'Tanggal verifikasi'],
  ['status', 'Status', ['draft', 'published', 'archived']],
];
for (const [id, title, options] of defs) {
  const label = document.createElement('label');
  label.textContent = title;
  const input = document.createElement(options ? 'select' : 'input');
  input.id = 'f-' + id;
  if (options)
    for (const option of options) {
      const o = document.createElement('option');
      o.value = option;
      o.textContent = option;
      input.append(o);
    }
  else {
    input.type =
      id === 'verified_at'
        ? 'date'
        : ['latitude', 'longitude'].includes(id)
          ? 'number'
          : 'text';
    if (input.type === 'number') {
      input.step = 'any';
      input.min = id === 'latitude' ? '-90' : '-180';
      input.max = id === 'latitude' ? '90' : '180';
    }
    if (['id', 'name', 'latitude', 'longitude'].includes(id))
      input.required = true;
  }
  label.append(input);
  el('fields').append(label);
}
const field = (k) => el('f-' + k);
function discardForm() {
  return !formDirty || confirm('Buang perubahan form yang belum diterapkan?');
}
function render() {
  el('entries').replaceChildren();
  markers.clearLayers();
  for (const f of data.facilities) {
    const button = document.createElement('button');
    button.textContent = f.name + ' · ' + f.status;
    button.className = f.id === selected ? 'selected' : '';
    button.onclick = () => {
      if (discardForm()) open(f.id);
    };
    el('entries').append(button);
    L.circleMarker([f.latitude, f.longitude], { radius: 9, color: '#245c43' })
      .addTo(markers)
      .on('click', () => {
        if (discardForm()) open(f.id);
      });
  }
  el('form').hidden = !selected;
}
function open(id) {
  const f = data.facilities.find((x) => x.id === id);
  selected = id;
  for (const [k] of defs) {
    field(k).value = Array.isArray(f[k]) ? f[k].join(', ') : (f[k] ?? '');
  }
  field('id').readOnly = true;
  formDirty = false;
  pendingMarker?.remove();
  pendingMarker = null;
  map.panTo([f.latitude, f.longitude]);
  render();
}
function candidate() {
  const f = {};
  for (const [k] of defs) {
    const value = field(k).value.trim();
    f[k] = ['tags', 'menu_keywords'].includes(k)
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : ['latitude', 'longitude'].includes(k)
        ? value === ''
          ? NaN
          : Number(value)
        : ['opening_hours', 'phone', 'website', 'verified_at'].includes(k)
          ? value || null
          : value;
  }
  return f;
}
el('form').addEventListener('input', () => {
  formDirty = true;
  el('dirty').textContent =
    'Form modifié — belum diterapkan atau diekspor.'.replace(
      'modifié',
      'berubah',
    );
});
el('form').onsubmit = (e) => {
  e.preventDefault();
  const f = candidate();
  if (
    f.status === 'published' &&
    !confirm(
      'Sudah memverifikasi alamat, akses masuk, koordinat, sumber, dan tanggal?',
    )
  )
    return;
  const next = {
    ...data,
    updated_at: new Date().toISOString(),
    facilities: data.facilities.map((x) => (x.id === selected ? f : x)),
  };
  const result = validateDataset(next);
  if (result.errors.length) {
    message(result.errors.join('\n'));
    return;
  }
  data = next;
  formDirty = false;
  stamp();
  message(
    result.warnings.join('\n') ||
      'Perubahan diterapkan di sesi. Ekspor untuk menyimpan.',
  );
  open(f.id);
};
map.on('click', (e) => {
  if (!selected) {
    message('Tambah atau pilih fasilitas terlebih dahulu.');
    return;
  }
  field('latitude').value = e.latlng.lat.toFixed(6);
  field('longitude').value = e.latlng.lng.toFixed(6);
  formDirty = true;
  el('dirty').textContent = 'Koordinat belum diterapkan atau diekspor.';
  pendingMarker?.remove();
  pendingMarker = L.circleMarker(e.latlng, {
    radius: 11,
    color: '#c28838',
  }).addTo(map);
  el('coordinates').textContent =
    field('latitude').value +
    ', ' +
    field('longitude').value +
    ' — periksa sebelum verifikasi.';
});
el('add').onclick = () => {
  if (!discardForm()) return;
  const center = map.getCenter();
  const f = {
    id: newUuid(),
    name: 'Fasilitas baru',
    category: 'public_facility',
    latitude: center.lat,
    longitude: center.lng,
    address: '',
    opening_hours: null,
    phone: null,
    website: null,
    tags: [],
    menu_keywords: [],
    source: '',
    verified_at: null,
    status: 'draft',
  };
  data.facilities.push(f);
  stamp();
  open(f.id);
};
el('delete').onclick = () => {
  if (!selected || !confirm('Hapus fasilitas ini dari sesi editor?')) return;
  data.facilities = data.facilities.filter((x) => x.id !== selected);
  selected = null;
  formDirty = false;
  pendingMarker?.remove();
  stamp();
  render();
};
el('import').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (
    (dirty || formDirty) &&
    !confirm('Ganti dataset dan buang perubahan yang belum diekspor?')
  )
    return;
  try {
    if (file.size > 5 * 1024 * 1024) throw Error('Maksimum ukuran JSON 5 MB.');
    const incoming = JSON.parse((await file.text()).replace(/^\uFEFF/, '')),
      result = validateDataset(incoming);
    if (result.errors.length) throw Error(result.errors.join('\n'));
    data = incoming;
    selected = null;
    dirty = false;
    formDirty = false;
    pendingMarker?.remove();
    render();
    el('dirty').textContent = 'Dataset diimpor. Belum ada perubahan.';
    message(result.warnings.join('\n') || 'Impor berhasil.');
  } catch (error) {
    message(error.message);
  }
};
function download(publicOnly) {
  if (formDirty) {
    message('Terapkan perubahan form terlebih dahulu sebelum ekspor.');
    return;
  }
  const result = validateDataset(data);
  if (result.errors.length) {
    message(result.errors.join('\n'));
    return;
  }
  const value = publicOnly ? publicDataset(data) : data,
    url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    ),
    a = document.createElement('a');
  a.href = url;
  a.download = publicOnly ? 'facilities.json' : 'facilities-master.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (!publicOnly) {
    dirty = false;
    el('dirty').textContent =
      'Unduhan master dibuat. Pastikan file sudah tersimpan.';
  }
  message(
    publicOnly
      ? 'Unduhan publik dibuat: hanya entri published. Dataset master tetap perlu diekspor.'
      : 'Unduhan master dibuat; server tidak diperbarui.',
  );
}
el('export').onclick = () => download(false);
el('export-public').onclick = () => download(true);
window.addEventListener('beforeunload', (e) => {
  if (dirty || formDirty) {
    e.preventDefault();
  }
});
render();
