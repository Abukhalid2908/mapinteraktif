import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { markerIcons } from '../../lib/marker-icons';
import { polygonAreaM2, lineLengthM } from '../../lib/data.mjs';
const $ = (id) => document.getElementById(id);
let csrf = '',
  setup = false,
  records = [],
  selected = null,
  dirty = false,
  map,
  marker;
const categories = {
  resto_cafe: 'Resto & Cafe',
  hotel: 'Hotel',
  food_court: 'Food Court',
  atm: 'ATM',
  medical: 'Kesehatan',
  public_facility: 'Fasilitas umum',
};
const statuses = { draft: 'Draft', published: 'Terbit', archived: 'Arsip' };
function addBasemaps(target) {
  const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  });
  const imagery = () =>
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri and imagery providers',
      },
    );
  const labels = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: '&copy; Esri' },
  );
  street.addTo(target);
  L.control
    .layers(
      {
        Peta: street,
        Satelit: imagery(),
        Hybrid: L.layerGroup([imagery(), labels]),
      },
      {},
      { position: 'topright', collapsed: false },
    )
    .addTo(target);
}
let categoryRows = [],
  categoryRecord = null,
  categoryDirty = false,
  plotRecords = [],
  selectedPlot = null,
  plotDirty = false,
  plotAreaAuto = true,
  plotMap,
  plotLayer,
  plotVertexLayer,
  plotPoints = [],
  infraRecords = [],
  selectedInfra = null,
  infraDirty = false,
  infraLengthAuto = true,
  infraMap,
  infraShape,
  infraVertices,
  infraPoints = [],
  infraTypeRows = [],
  infraTypeRecord = null,
  infraTypeDirty = false,
  accountRows = [];
async function loadAccounts() {
  const data = await api('account_list');
  accountRows = data.accounts;
  $('account-list').replaceChildren();
  for (const account of accountRows) {
    const card = document.createElement('article');
    card.className = 'account-card';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = account.email;
    const meta = document.createElement('span');
    meta.textContent =
      account.role === 'admin' ? 'Administrator' : 'Pengguna internal';
    copy.append(name, meta);
    card.append(copy);
    if (account.role === 'internal') {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Atur akun';
      edit.onclick = () => editAccount(account);
      card.append(edit);
    }
    $('account-list').append(card);
  }
}
function editAccount(account = null) {
  $('account-form').hidden = false;
  $('account-id').value = account?.id || '';
  $('account-email').value = account?.email || '';
  $('account-password').value = '';
  $('account-form-title').textContent = account
    ? 'Atur pengguna'
    : 'Tambah pengguna';
  $('delete-account').hidden = !account;
  $('account-email').focus();
}
$('new-account').onclick = () => editAccount();
$('close-account-form').onclick = () => {
  $('account-form').hidden = true;
};
$('account-form').onsubmit = async (event) => {
  event.preventDefault();
  try {
    const id = $('account-id').value;
    await api('account_save', {
      id: id ? Number(id) : null,
      email: $('account-email').value,
      password: $('account-password').value,
    });
    $('account-form').hidden = true;
    message('Akun internal tersimpan.');
    await loadAccounts();
  } catch (error) {
    message(error.message, true);
  }
};
$('delete-account').onclick = async () => {
  const id = Number($('account-id').value);
  if (
    !id ||
    !confirm('Hapus akun internal ini? Pengguna akan langsung keluar.')
  )
    return;
  try {
    await api('account_delete', { id });
    $('account-form').hidden = true;
    message('Akun internal dihapus.');
    await loadAccounts();
  } catch (error) {
    message(error.message, true);
  }
};
async function loadCategories() {
  const data = await api('categories');
  categoryRows = data.categories;
  for (const key of Object.keys(categories)) delete categories[key];
  for (const c of categoryRows) categories[c.id] = c.label;
  const value = $('f-category').value;
  $('f-category').replaceChildren();
  for (const c of categoryRows.filter((c) => Number(c.enabled) === 1)) {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.label;
    $('f-category').append(option);
  }
  $('f-category').value = value;
  $('category-list').replaceChildren();
  for (const c of categoryRows) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent =
      c.label + ' · ' + (Number(c.enabled) === 1 ? 'Aktif' : 'Nonaktif');
    b.onclick = () => {
      if (
        !categoryDirty ||
        confirm('Abaikan perubahan kategori yang belum disimpan?')
      )
        editCategory(c);
    };
    $('category-list').append(b);
  }
}
function previewCategoryIcon() {
  $('category-icon-preview').innerHTML =
    markerIcons[$('category-icon').value] || markerIcons.public_facility;
}
$('category-icon').onchange = previewCategoryIcon;
function editCategory(c) {
  categoryRecord = c;
  categoryDirty = false;
  $('category-form').hidden = false;
  $('category-name').value = c.label;
  $('category-icon').value = c.icon;
  $('category-enabled').value = String(c.enabled);
  previewCategoryIcon();
}
function showAdminSection(section) {
  $('dashboard-overview').hidden = section !== 'dashboard';
  $('facility-manager').hidden = section !== 'facilities';
  $('plot-manager').hidden = section !== 'plots';
  $('infra-manager').hidden = section !== 'infra';
  $('category-manager').hidden = section !== 'categories';
  $('account-manager').hidden = section !== 'accounts';
  $('add').hidden = section !== 'facilities';
  const headings = {
    dashboard: [
      'Dashboard MM2100',
      'Pilih data yang ingin dikelola atau lihat ringkasan kawasan.',
    ],
    facilities: [
      'Kelola fasilitas',
      'Tambah lokasi, atur kategori, dan publikasikan fasilitas kawasan.',
    ],
    plots: [
      'Kelola bidang kawasan',
      'Gambar batas lahan dan perbarui status serta data tenant.',
    ],
    infra: [
      'Kelola infrastruktur',
      'Petakan titik aset dan jalur utilitas kawasan.',
    ],
    categories: [
      'Kelola kategori',
      'Atur kategori yang tersedia pada direktori fasilitas.',
    ],
    accounts: [
      'Kelola pengguna internal',
      'Daftarkan akses untuk data bidang dan infrastruktur.',
    ],
  };
  $('workspace-title').textContent = headings[section][0];
  $('workspace-description').textContent = headings[section][1];
  for (const [id, value] of [
    ['manage-dashboard', 'dashboard'],
    ['manage-facilities', 'facilities'],
    ['manage-plots', 'plots'],
    ['manage-infra', 'infra'],
    ['manage-categories', 'categories'],
    ['manage-accounts', 'accounts'],
  ])
    $(id).setAttribute('aria-pressed', String(section === value));
}
$('manage-dashboard').onclick = () => {
  if (canLeave()) showAdminSection('dashboard');
};
$('manage-facilities').onclick = () => {
  if (!canLeave()) return;
  showAdminSection('facilities');
  ensureFacilityMap();
  requestAnimationFrame(() => map?.invalidateSize());
};
$('manage-categories').onclick = () => {
  if (!canLeave()) return;
  showAdminSection('categories');
};
$('manage-accounts').onclick = async () => {
  if (!canLeave()) return;
  showAdminSection('accounts');
  try {
    await loadAccounts();
  } catch (error) {
    message(error.message, true);
  }
};
$('manage-plots').onclick = async () => {
  if (!canLeave()) return;
  showAdminSection('plots');
  await refreshPlots();
  ensurePlotMap();
  requestAnimationFrame(() => plotMap?.invalidateSize());
};
$('manage-infra').onclick = async () => {
  if (!canLeave()) return;
  showAdminSection('infra');
  await refreshInfra();
  ensureInfraMap();
  requestAnimationFrame(() => infraMap.invalidateSize());
};
$('dashboard-open-facilities').onclick = $('manage-facilities').onclick;
$('dashboard-open-plots').onclick = $('manage-plots').onclick;
$('dashboard-open-infra').onclick = $('manage-infra').onclick;
$('new-category').onclick = () => {
  if (
    !categoryDirty ||
    confirm('Abaikan perubahan kategori yang belum disimpan?')
  )
    editCategory({
      id: 'cat_' + crypto.randomUUID().replaceAll('-', ''),
      label: '',
      icon: 'public_facility',
      enabled: 1,
      revision: 0,
    });
};
$('category-form').oninput = () => {
  categoryDirty = true;
};
$('category-form').onsubmit = async (e) => {
  e.preventDefault();
  if (!categoryRecord) return;
  $('save-category').disabled = true;
  try {
    await api('category_save', {
      id: categoryRecord.id,
      revision: Number(categoryRecord.revision),
      label: $('category-name').value.trim(),
      icon: $('category-icon').value,
      enabled: $('category-enabled').value === '1',
    });
    categoryDirty = false;
    await loadCategories();
    editCategory(categoryRows.find((c) => c.id === categoryRecord.id));
    renderList();
    message('Kategori tersimpan. Pilihan kategori fasilitas telah diperbarui.');
  } catch (error) {
    message(error.message, true);
  } finally {
    $('save-category').disabled = false;
  }
};
/** @type {Array<[string, string, Record<string, string>?]>} */
const fields = [
  ['name', 'Nama fasilitas'],
  ['category', 'Kategori', categories],
  [
    'parent_id',
    'Food court induk',
    { '': 'Mandiri / tidak berada di food court' },
  ],
  ['unit_number', 'Nomor kios / unit'],
  ['address', 'Alamat'],
  ['latitude', 'Latitude'],
  ['longitude', 'Longitude'],
  ['opening_hours', 'Jam buka'],
  ['phone', 'Telepon bisnis'],
  ['website', 'Website'],
  ['tags', 'Tag (pisahkan koma)'],
  ['menu_keywords', 'Menu (pisahkan koma)'],
  ['source', 'Sumber verifikasi'],
  ['verified_at', 'Tanggal verifikasi'],
  ['status', 'Status', statuses],
];
function message(text, error = false) {
  $('message').textContent = text;
  $('message').className = error ? 'error' : '';
}
async function api(action, body) {
  const response = await fetch('/api/index.php?action=' + action, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body
      ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error('Server tidak merespons. Periksa koneksi dan coba kembali.');
  }
  if (!response.ok) {
    if (response.status === 401 && action !== 'login') {
      await boot();
    }
    throw Error(data.error || 'Permintaan gagal.');
  }
  return data;
}
for (const [key, label, options] of fields) {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const input = document.createElement(
    options ? 'select' : key === 'address' ? 'textarea' : 'input',
  );
  input.id = 'f-' + key;
  input.setAttribute('aria-label', label);
  if (key === 'category') input.required = true;
  if (options)
    for (const [value, text] of Object.entries(options)) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = text;
      input.append(o);
    }
  if (['latitude', 'longitude'].includes(key)) {
    input.type = 'number';
    input.step = 'any';
    input.min = key === 'latitude' ? -90 : -180;
    input.max = key === 'latitude' ? 90 : 180;
    input.required = true;
  }
  if (key === 'verified_at') {
    input.type = 'date';
    input.max = new Date().toISOString().slice(0, 10);
  }
  if (key === 'website') input.type = 'url';
  if (key === 'name') {
    input.required = true;
    input.maxLength = 200;
  }
  if (['address', 'source'].includes(key)) wrap.className = 'wide';
  wrap.append(input);
  $('fields').append(wrap);
}
function renderList() {
  $('list').replaceChildren();
  const q = $('search').value.trim().toLowerCase();
  const filtered = records.filter((r) =>
    (r.facility.name + ' ' + categories[r.facility.category])
      .toLowerCase()
      .includes(q),
  );
  $('count').textContent = filtered.length + ' fasilitas';
  for (const record of filtered) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute(
      'aria-pressed',
      String(selected?.facility.id === record.facility.id),
    );
    const name = document.createElement('strong');
    name.textContent = record.facility.name;
    const meta = document.createElement('small');
    meta.textContent =
      categories[record.facility.category] +
      ' · ' +
      statuses[record.facility.status];
    b.append(name, meta);
    b.onclick = () => {
      if (canLeave()) select(record);
    };
    $('list').append(b);
  }
}
function canLeave() {
  return (
    !(dirty || categoryDirty || plotDirty || infraDirty || infraTypeDirty) ||
    confirm('Perubahan belum disimpan. Lanjutkan tanpa menyimpan?')
  );
}

const plotStatuses = {
  draft: 'Draft',
  available: 'Tersedia',
  reserved: 'Dipesan',
  occupied: 'Terisi',
  utility: 'Utilitas',
  archived: 'Arsip',
};
function ensurePlotMap() {
  if (plotMap) return;
  plotMap = L.map('plot-map').setView([-6.297, 107.095], 15);
  addBasemaps(plotMap);
  plotMap.on('click', (e) => {
    if (!selectedPlot) {
      message('Klik “Tambah bidang” sebelum menggambar polygon.', true);
      return;
    }
    plotPoints.push([e.latlng.lng, e.latlng.lat]);
    plotDirty = true;
    renderPlotShape(false);
  });
}
function renderPlotShape(fit = true) {
  ensurePlotMap();
  plotLayer?.remove();
  plotVertexLayer?.remove();
  const latlngs = plotPoints.map(([lng, lat]) => [lat, lng]);
  plotLayer =
    latlngs.length > 2
      ? L.polygon(latlngs, { color: '#215d47', fillOpacity: 0.28 }).addTo(
          plotMap,
        )
      : latlngs.length
        ? L.polyline(latlngs, { color: '#215d47', weight: 3 }).addTo(plotMap)
        : null;
  plotVertexLayer = L.layerGroup().addTo(plotMap);
  plotPoints.forEach(([lng, lat], index) => {
    const vertex = L.marker([lat, lng], {
      draggable: true,
      keyboard: true,
      title: 'Titik ' + (index + 1) + ' — geser untuk mengubah',
      icon: L.divIcon({
        className: 'plot-vertex',
        html: '<span>' + (index + 1) + '</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    }).addTo(plotVertexLayer);
    vertex.on('dragend', (event) => {
      const point = event.target.getLatLng();
      plotPoints[index] = [point.lng, point.lat];
      plotDirty = true;
      renderPlotShape(false);
    });
  });
  $('point-count').textContent = plotPoints.length + ' titik';
  $('form-point-count').textContent = plotPoints.length + ' titik';
  $('open-plot-form').disabled = !selectedPlot || plotPoints.length < 3;
  if (plotAreaAuto && plotPoints.length >= 3)
    $('p-area').value = polygonAreaM2([...plotPoints, plotPoints[0]]).toFixed(
      2,
    );
  if (fit && plotLayer && plotPoints.length)
    plotMap.fitBounds(plotLayer.getBounds(), {
      padding: [28, 28],
      maxZoom: 17,
    });
}
function renderPlotList() {
  $('plot-list').replaceChildren();
  const q = $('plot-search').value.trim().toLowerCase();
  const filtered = plotRecords.filter(({ plot }) =>
    [plot.plot_number, plot.tenant_name, plot.zonation]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
  $('plot-count').textContent = filtered.length + ' bidang';
  for (const record of filtered) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(
      'aria-pressed',
      String(selectedPlot?.plot.id === record.plot.id),
    );
    const name = document.createElement('strong');
    name.textContent = record.plot.plot_number;
    const meta = document.createElement('small');
    meta.textContent =
      plotStatuses[record.plot.status] +
      ' · ' +
      Number(record.plot.area_m2).toLocaleString('id-ID') +
      ' m²';
    const action = document.createElement('span');
    action.className = 'plot-edit-label';
    action.textContent = 'Edit bidang →';
    button.setAttribute('aria-label', 'Edit bidang ' + record.plot.plot_number);
    button.append(name, meta, action);
    button.onclick = () => {
      if (canLeave()) selectPlot(record);
    };
    $('plot-list').append(button);
  }
}
async function refreshPlots() {
  const data = await api('plot_list');
  plotRecords = data.plots;
  $('dashboard-plot-count').textContent = plotRecords.length;
  renderPlotList();
}
function selectPlot(record) {
  selectedPlot = structuredClone(record);
  plotDirty = false;
  plotAreaAuto = true;
  $('plot-empty').hidden = true;
  $('plot-form-modal').hidden = true;
  $('plot-form-message').textContent = '';
  $('plot-form-title').textContent = record.revision
    ? 'Edit bidang'
    : 'Tambah bidang';
  $('delete-plot').hidden = !record.revision;
  const plot = record.plot;
  $('p-number').value = plot.plot_number || '';
  $('p-status').value = plot.status || 'draft';
  $('p-area').value = plot.area_m2 || '';
  $('p-zonation').value = plot.zonation || '';
  $('p-tenant').value = plot.tenant_name || '';
  $('p-source').value = plot.source || '';
  $('p-verified').value = plot.verified_at || '';
  plotPoints = (plot.coordinates || []).slice(0, -1);
  ensurePlotMap();
  plotMap.invalidateSize();
  renderPlotShape();
  renderPlotList();
}
$('new-plot').onclick = () => {
  if (!canLeave()) return;
  selectPlot({
    revision: 0,
    plot: {
      id: crypto.randomUUID(),
      plot_number: '',
      status: 'draft',
      area_m2: '',
      zonation: 'Industri',
      tenant_name: null,
      source: '',
      verified_at: null,
      coordinates: [],
    },
  });
};
$('plot-search').oninput = renderPlotList;
$('open-plot-form').onclick = () => {
  if (!selectedPlot || plotPoints.length < 3) return;
  $('plot-form-message').textContent = '';
  $('plot-form-modal').hidden = false;
  $('p-number').focus();
};
$('close-plot-form').onclick = () => {
  $('plot-form-modal').hidden = true;
};
$('plot-form-modal').onclick = (event) => {
  if (event.target === $('plot-form-modal')) $('plot-form-modal').hidden = true;
};
$('plot-form').oninput = () => {
  plotDirty = true;
};
$('p-area').oninput = () => {
  plotAreaAuto = false;
};
$('recalc-area').onclick = () => {
  if (plotPoints.length < 3) {
    message('Gambar polygon minimal 3 titik dahulu.', true);
    return;
  }
  plotAreaAuto = true;
  plotDirty = true;
  $('p-area').value = polygonAreaM2([...plotPoints, plotPoints[0]]).toFixed(
    2,
  );
};
$('undo-point').onclick = () => {
  plotPoints.pop();
  plotDirty = true;
  renderPlotShape(false);
};
$('clear-polygon').onclick = () => {
  plotPoints = [];
  plotDirty = true;
  renderPlotShape();
  message(
    'Gambar dikosongkan. Klik peta minimal tiga kali untuk menggambar ulang bidang.',
  );
};
$('delete-plot').onclick = async () => {
  if (!selectedPlot?.revision) return;
  if (!confirm('Hapus bidang ini secara permanen?')) return;
  $('delete-plot').disabled = true;
  try {
    await api('plot_delete', {
      id: selectedPlot.plot.id,
      revision: selectedPlot.revision,
    });
    plotDirty = false;
    selectedPlot = null;
    plotPoints = [];
    $('plot-form-modal').hidden = true;
    $('plot-empty').hidden = false;
    renderPlotShape(false);
    await refreshPlots();
    message('Bidang berhasil dihapus.');
  } catch (error) {
    $('plot-form-message').className = 'error';
    $('plot-form-message').textContent = error.message;
  } finally {
    $('delete-plot').disabled = false;
  }
};
$('plot-form').onsubmit = async (e) => {
  e.preventDefault();
  if (!selectedPlot || plotPoints.length < 3) {
    $('plot-form-message').textContent = 'Gambar minimal tiga titik polygon.';
    $('plot-form-message').className = 'error';
    return;
  }
  const coordinates = [...plotPoints, plotPoints[0]];
  const plot = {
    id: selectedPlot.plot.id,
    plot_number: $('p-number').value.trim(),
    status: $('p-status').value,
    area_m2: Number($('p-area').value),
    zonation: $('p-zonation').value.trim(),
    tenant_name: $('p-tenant').value.trim() || null,
    source: $('p-source').value.trim(),
    verified_at: $('p-verified').value || null,
    coordinates,
  };
  $('save-plot').disabled = true;
  try {
    const saved = await api('plot_save', {
      plot,
      revision: selectedPlot.revision,
    });
    plotDirty = false;
    await refreshPlots();
    selectPlot(saved);
    $('plot-form-modal').hidden = false;
    $('plot-form-message').className = 'success';
    $('plot-form-message').textContent =
      plot.status === 'draft'
        ? 'Bidang tersimpan sebagai draft.'
        : 'Bidang tersimpan dan tampil pada peta publik.';
    message('Bidang berhasil disimpan.');
  } catch (error) {
    $('plot-form-message').className = 'error';
    $('plot-form-message').textContent = error.message;
  } finally {
    $('save-plot').disabled = false;
  }
};

const infraLabels = {
  water_pipe: 'Pipa air',
  fiber_optic: 'Kabel optik',
  electricity: 'Listrik',
  drainage: 'Drainase',
  other: 'Lainnya',
};
async function loadInfraTypes() {
  const data = await api('infra_categories');
  infraTypeRows = data.categories;
  for (const key of Object.keys(infraLabels)) delete infraLabels[key];
  for (const row of infraTypeRows) infraLabels[row.id] = row.label;
  const current = $('i-category').value;
  $('i-category').replaceChildren();
  for (const row of infraTypeRows.filter((r) => Number(r.enabled) === 1)) {
    const option = document.createElement('option');
    option.value = row.id;
    option.textContent = row.label;
    $('i-category').append(option);
  }
  $('i-category').value = current;
  $('infra-type-list').replaceChildren();
  for (const row of infraTypeRows) {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = '<i></i><strong></strong><small></small>';
    button.querySelector('i').style.background = row.color;
    button.querySelector('strong').textContent = row.label;
    button.querySelector('small').textContent = Number(row.enabled)
      ? 'Aktif'
      : 'Nonaktif';
    button.onclick = () => editInfraType(row);
    $('infra-type-list').append(button);
  }
}
function editInfraType(row) {
  infraTypeRecord = row;
  infraTypeDirty = false;
  $('infra-type-form').hidden = false;
  $('it-label').value = row.label;
  $('it-color').value = row.color;
  $('it-enabled').value = String(row.enabled);
}
$('manage-infra-types').onclick = () => {
  $('infra-type-modal').hidden = false;
};
$('close-infra-types').onclick = () => {
  $('infra-type-modal').hidden = true;
};
$('new-infra-type').onclick = () =>
  editInfraType({
    id: 'infra_' + crypto.randomUUID().replaceAll('-', ''),
    label: '',
    color: '#397fc0',
    enabled: 1,
    revision: 0,
  });
$('infra-type-form').oninput = () => {
  infraTypeDirty = true;
};
$('infra-type-form').onsubmit = async (e) => {
  e.preventDefault();
  if (!infraTypeRecord) return;
  $('save-infra-type').disabled = true;
  try {
    await api('infra_category_save', {
      id: infraTypeRecord.id,
      label: $('it-label').value.trim(),
      color: $('it-color').value,
      enabled: $('it-enabled').value === '1',
      revision: Number(infraTypeRecord.revision),
    });
    infraTypeDirty = false;
    await loadInfraTypes();
    editInfraType(infraTypeRows.find((r) => r.id === infraTypeRecord.id));
    message('Jenis aset berhasil disimpan.');
  } catch (error) {
    message(error.message, true);
  } finally {
    $('save-infra-type').disabled = false;
  }
};
function ensureInfraMap() {
  if (infraMap) return;
  infraMap = L.map('infra-map').setView([-6.297, 107.095], 15);
  addBasemaps(infraMap);
  infraMap.on('click', (e) => {
    if (!selectedInfra) {
      message('Klik “Tambah infrastruktur” terlebih dahulu.', true);
      return;
    }
    if ($('infra-geometry-mode').value === 'point')
      infraPoints = [[e.latlng.lng, e.latlng.lat]];
    else infraPoints.push([e.latlng.lng, e.latlng.lat]);
    infraDirty = true;
    renderInfra(false);
  });
}
function renderInfra(fit = true) {
  ensureInfraMap();
  infraShape?.remove();
  infraVertices?.remove();
  const latlngs = infraPoints.map(([lng, lat]) => [lat, lng]);
  const point = $('infra-geometry-mode').value === 'point';
  infraShape =
    point && latlngs.length
      ? L.circleMarker(latlngs[0], {
          radius: 10,
          color: '#fff',
          weight: 3,
          fillColor: '#397fc0',
          fillOpacity: 1,
        }).addTo(infraMap)
      : latlngs.length
        ? L.polyline(latlngs, { color: '#397fc0', weight: 5 }).addTo(infraMap)
        : null;
  infraVertices = L.layerGroup().addTo(infraMap);
  latlngs.forEach((ll, index) => {
    const marker = L.marker(ll, {
      draggable: true,
      icon: L.divIcon({
        className: 'infra-vertex',
        html: '<span>' + (index + 1) + '</span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }).addTo(infraVertices);
    marker.on('dragend', (e) => {
      const p = e.target.getLatLng();
      infraPoints[index] = [p.lng, p.lat];
      infraDirty = true;
      renderInfra(false);
    });
  });
  $('infra-point-count').textContent = infraPoints.length + ' titik';
  $('open-infra-form').disabled =
    !selectedInfra || infraPoints.length < (point ? 1 : 2);
  $('infra-length-field').hidden = point;
  if (!point && infraLengthAuto && infraPoints.length >= 2)
    $('i-length').value = lineLengthM(infraPoints).toFixed(2);
  if (fit && infraShape) {
    if (point) infraMap.setView(latlngs[0], 17);
    else
      infraMap.fitBounds(infraShape.getBounds(), {
        padding: [30, 30],
        maxZoom: 17,
      });
  }
}
function renderInfraList() {
  $('infra-list').replaceChildren();
  const q = $('infra-search').value.trim().toLowerCase();
  const rows = infraRecords.filter((r) =>
    (r.item.name + ' ' + infraLabels[r.item.category])
      .toLowerCase()
      .includes(q),
  );
  $('infra-count').textContent = rows.length + ' infrastruktur';
  for (const record of rows) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Edit infrastruktur ' + record.item.name);
    b.innerHTML =
      '<strong></strong><small></small><span class="plot-edit-label">Edit →</span>';
    b.querySelector('strong').textContent = record.item.name;
    b.querySelector('small').textContent =
      infraLabels[record.item.category] +
      ' · ' +
      record.item.geometry_type +
      (record.item.condition === 'not_ok' ? ' · Tidak OK' : '');
    if (record.item.condition === 'not_ok') b.classList.add('infra-not-ok');
    b.onclick = () => {
      if (canLeave()) selectInfra(record);
    };
    $('infra-list').append(b);
  }
}
async function refreshInfra() {
  const data = await api('infra_list');
  infraRecords = data.infrastructure;
  $('dashboard-infra-count').textContent = infraRecords.length;
  renderInfraList();
}
let infraImportItems = [];
function parseCsv(text) {
  const rows = [];
  let row = [],
    value = '',
    quoted = false;
  for (let i = 0; i <= text.length; i++) {
    const char = text[i] ?? '\n';
    if (char === '"' && quoted && text[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  if (rows.length < 2) throw Error('CSV tidak memiliki baris data.');
  const headers = rows[0].map((cell) => cell.trim().toLowerCase());
  return rows
    .slice(1)
    .map((cells) =>
      Object.fromEntries(
        headers.map((header, index) => [header, cells[index] ?? '']),
      ),
    );
}
function resolveInfraCategory(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return infraTypeRows.find(
    (row) =>
      Number(row.enabled) === 1 &&
      (row.id.toLowerCase() === normalized ||
        row.label.toLowerCase() === normalized),
  )?.id;
}
function parseCoordinateText(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  if (text.startsWith('[')) return JSON.parse(text);
  return text.split(';').map((pair) => {
    const [lng, lat] = pair.split(/\s*,\s*/).map(Number);
    return [lng, lat];
  });
}
function normalizeImportedItem(source, geometry) {
  const geometryType = String(
    geometry?.type === 'Point'
      ? 'point'
      : geometry?.type === 'LineString'
        ? 'line'
        : source.geometry_type || source.geometry || '',
  ).toLowerCase();
  const category = resolveInfraCategory(source.category || source.jenis_aset);
  const coordinates = geometry
    ? geometry.type === 'Point'
      ? [geometry.coordinates]
      : geometry.coordinates
    : parseCoordinateText(source.coordinates || source.koordinat);
  if (!source.name && !source.nama) throw Error('Nama wajib diisi.');
  if (!category) throw Error('Jenis aset tidak ditemukan atau nonaktif.');
  if (!['point', 'line'].includes(geometryType))
    throw Error('Geometri harus point atau line.');
  const minimum = geometryType === 'point' ? 1 : 2;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < minimum ||
    coordinates.some(
      (point) =>
        !Array.isArray(point) ||
        point.length !== 2 ||
        !Number.isFinite(Number(point[0])) ||
        !Number.isFinite(Number(point[1])),
    )
  )
    throw Error('Koordinat tidak sesuai dengan jenis geometri.');
  return {
    id: crypto.randomUUID(),
    name: String(source.name || source.nama).trim(),
    category,
    geometry_type: geometryType,
    status: String(source.status || 'draft')
      .trim()
      .toLowerCase(),
    description: String(source.description || source.deskripsi || '').trim(),
    source: String(source.source || source.sumber || '').trim(),
    verified_at:
      String(source.verified_at || source.tanggal_verifikasi || '').trim() ||
      null,
    coordinates: coordinates.map(([lng, lat]) => [Number(lng), Number(lat)]),
  };
}
function renderInfraImportPreview() {
  const rows = infraImportItems.slice(0, 10);
  $('infra-import-preview').hidden = false;
  $('infra-import-preview').innerHTML =
    '<table><thead><tr><th>Nama</th><th>Jenis</th><th>Bentuk</th><th>Titik</th><th>Status</th></tr></thead><tbody></tbody></table>';
  const body = $('infra-import-preview').querySelector('tbody');
  for (const item of rows) {
    const tr = document.createElement('tr');
    for (const value of [
      item.name,
      infraLabels[item.category],
      item.geometry_type === 'point' ? 'Titik' : 'Jalur',
      item.coordinates.length,
      item.status,
    ]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    body.append(tr);
  }
  $('infra-import-message').className = '';
  $('infra-import-message').textContent =
    infraImportItems.length +
    ' data siap diimport' +
    (infraImportItems.length > 10 ? ' · menampilkan 10 data pertama.' : '.');
  $('save-infra-import').disabled = false;
}
$('open-infra-import').onclick = () => {
  infraImportItems = [];
  $('infra-import-file').value = '';
  $('infra-import-preview').hidden = true;
  $('infra-import-message').className = '';
  $('infra-import-message').textContent = 'Pilih file untuk melihat pratinjau.';
  $('save-infra-import').disabled = true;
  $('infra-import-modal').hidden = false;
};
function closeInfraImport() {
  $('infra-import-modal').hidden = true;
}
$('close-infra-import').onclick = closeInfraImport;
$('cancel-infra-import').onclick = closeInfraImport;
$('infra-import-modal').onclick = (event) => {
  if (event.target === $('infra-import-modal')) closeInfraImport();
};
$('infra-import-file').onchange = async () => {
  infraImportItems = [];
  $('save-infra-import').disabled = true;
  try {
    const file = $('infra-import-file').files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw Error('Ukuran file maksimal 5 MB.');
    const text = await file.text();
    const isJson = /\.(json|geojson)$/i.test(file.name);
    if (isJson) {
      const data = JSON.parse(text);
      if (data.type !== 'FeatureCollection' || !Array.isArray(data.features))
        throw Error('GeoJSON harus berupa FeatureCollection.');
      infraImportItems = data.features.map((feature, index) => {
        try {
          return normalizeImportedItem(
            feature.properties || {},
            feature.geometry,
          );
        } catch (error) {
          throw Error('Fitur ' + (index + 1) + ': ' + error.message);
        }
      });
    } else {
      infraImportItems = parseCsv(text).map((row, index) => {
        try {
          return normalizeImportedItem(row);
        } catch (error) {
          throw Error('Baris ' + (index + 2) + ': ' + error.message);
        }
      });
    }
    if (!infraImportItems.length) throw Error('File tidak berisi data.');
    if (infraImportItems.length > 1000)
      throw Error('Maksimal 1.000 data per file.');
    renderInfraImportPreview();
  } catch (error) {
    $('infra-import-preview').hidden = true;
    $('infra-import-message').className = 'error';
    $('infra-import-message').textContent = error.message;
  }
};
$('download-infra-template').onclick = () => {
  const content =
    'name,category,geometry_type,status,coordinates,description,source,verified_at\n' +
    'PJU 01,PJU,point,draft,"107.099,-6.297",Lampu jalan,,\n' +
    'Pipa Utama,Pipa air,line,draft,"107.099,-6.297;107.101,-6.298",Jalur pipa,,\n';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(
    new Blob([content], { type: 'text/csv;charset=utf-8' }),
  );
  link.download = 'template-infrastruktur-mm2100.csv';
  link.click();
  URL.revokeObjectURL(link.href);
};
$('save-infra-import').onclick = async () => {
  if (!infraImportItems.length) return;
  $('save-infra-import').disabled = true;
  try {
    const result = await api('infra_import', { items: infraImportItems });
    await refreshInfra();
    infraDirty = false;
    closeInfraImport();
    message(result.imported + ' data infrastruktur berhasil diimport.');
  } catch (error) {
    $('infra-import-message').className = 'error';
    $('infra-import-message').textContent = error.message;
    $('save-infra-import').disabled = false;
  }
};
function selectInfra(record) {
  selectedInfra = structuredClone(record);
  infraDirty = false;
  infraLengthAuto = true;
  const i = record.item;
  $('infra-title').textContent = record.revision
    ? 'Edit infrastruktur'
    : 'Tambah infrastruktur';
  $('delete-infra').hidden = !record.revision;
  $('i-name').value = i.name || '';
  $('i-category').value = i.category || 'water_pipe';
  $('i-geometry').value = i.geometry_type || 'line';
  $('infra-geometry-mode').value = i.geometry_type || 'line';
  $('i-status').value = i.status || 'draft';
  $('i-condition').value = i.condition || 'ok';
  $('i-length').value = i.length_m || '';
  $('i-description').value = i.description || '';
  $('i-source').value = i.source || '';
  $('i-verified').value = i.verified_at || '';
  infraPoints = i.coordinates || [];
  $('infra-draw-status').hidden = false;
  $('infra-draw-help').textContent =
    (i.geometry_type || 'line') === 'point'
      ? 'Klik peta untuk menentukan titik aset.'
      : 'Klik peta beberapa kali untuk membuat jalur.';
  $('infra-form-modal').hidden = true;
  ensureInfraMap();
  renderInfra();
  renderInfraList();
}
$('new-infra').onclick = () => {
  if (canLeave()) {
    selectInfra({
      revision: 0,
      item: {
        id: crypto.randomUUID(),
        name: '',
        category: 'water_pipe',
        geometry_type: 'line',
        status: 'draft',
        condition: 'ok',
        length_m: null,
        description: '',
        source: '',
        verified_at: null,
        coordinates: [],
      },
    });
    message('Mode gambar infrastruktur aktif. Pilih bentuk lalu klik peta.');
  }
};
$('infra-search').oninput = renderInfraList;
$('infra-geometry-mode').onchange = () => {
  const geometry = $('infra-geometry-mode').value;
  $('i-geometry').value = geometry;
  if (geometry === 'point' && infraPoints.length > 1)
    infraPoints = [infraPoints[0]];
  infraDirty = true;
  $('infra-draw-help').textContent =
    geometry === 'point'
      ? 'Klik peta untuk menentukan titik aset.'
      : 'Klik peta beberapa kali untuk membuat jalur.';
  renderInfra(false);
};
$('i-geometry').onchange = () => {
  $('infra-geometry-mode').value = $('i-geometry').value;
  if ($('i-geometry').value === 'point' && infraPoints.length > 1)
    infraPoints = [infraPoints[0]];
  infraDirty = true;
  renderInfra(false);
};
$('infra-undo').onclick = () => {
  infraPoints.pop();
  infraDirty = true;
  renderInfra(false);
};
$('infra-clear').onclick = () => {
  infraPoints = [];
  infraDirty = true;
  renderInfra();
  message(
    'Gambar dikosongkan. Klik peta untuk menggambar ulang infrastruktur.',
  );
};
$('delete-infra').onclick = async () => {
  if (!selectedInfra?.revision) return;
  if (!confirm('Hapus infrastruktur ini secara permanen?')) return;
  $('delete-infra').disabled = true;
  try {
    await api('infra_delete', {
      id: selectedInfra.item.id,
      revision: selectedInfra.revision,
    });
    infraDirty = false;
    selectedInfra = null;
    infraPoints = [];
    $('infra-form-modal').hidden = true;
    $('infra-draw-status').hidden = true;
    renderInfra(false);
    await refreshInfra();
    message('Infrastruktur berhasil dihapus.');
  } catch (error) {
    $('infra-form-message').className = 'error';
    $('infra-form-message').textContent = error.message;
  } finally {
    $('delete-infra').disabled = false;
  }
};
$('open-infra-form').onclick = () => {
  $('infra-form-message').textContent = '';
  $('infra-form-modal').hidden = false;
  $('i-name').focus();
};
$('close-infra-form').onclick = () => {
  $('infra-form-modal').hidden = true;
};
$('infra-form').oninput = () => {
  infraDirty = true;
};
$('i-length').oninput = () => {
  infraLengthAuto = false;
};
$('recalc-length').onclick = () => {
  if (infraPoints.length < 2) {
    message('Gambar jalur minimal 2 titik dahulu.', true);
    return;
  }
  infraLengthAuto = true;
  infraDirty = true;
  $('i-length').value = lineLengthM(infraPoints).toFixed(2);
};
$('infra-form').onsubmit = async (e) => {
  e.preventDefault();
  if (!selectedInfra) return;
  const item = {
    id: selectedInfra.item.id,
    name: $('i-name').value.trim(),
    category: $('i-category').value,
    geometry_type: $('i-geometry').value,
    status: $('i-status').value,
    condition: $('i-condition').value,
    length_m:
      $('i-geometry').value === 'line' ? Number($('i-length').value) : null,
    description: $('i-description').value.trim(),
    source: $('i-source').value.trim(),
    verified_at: $('i-verified').value || null,
    coordinates: infraPoints,
  };
  $('save-infra').disabled = true;
  try {
    const saved = await api('infra_save', {
      item,
      revision: selectedInfra.revision,
    });
    infraDirty = false;
    await refreshInfra();
    selectInfra(saved);
    $('infra-form-modal').hidden = false;
    $('infra-form-message').className = 'success';
    $('infra-form-message').textContent = 'Infrastruktur berhasil disimpan.';
  } catch (error) {
    $('infra-form-message').className = 'error';
    $('infra-form-message').textContent = error.message;
  } finally {
    $('save-infra').disabled = false;
  }
};
function updateMarker() {
  const lat = Number($('f-latitude').value),
    lng = Number($('f-longitude').value);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return;
  if (marker) marker.setLatLng([lat, lng]);
  else
    marker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'admin-map-pin',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(map);
  // Never pull the editor away from the admin's current detail level.
  map.setView([lat, lng], Math.max(map.getZoom(), 16));
}
function ensureFacilityMap() {
  if (map) return;
  map = L.map('map').setView([-6.297, 107.099], 14);
  addBasemaps(map);
  map.on('click', (e) => {
    if (!selected) {
      message('Klik “Tambah fasilitas” sebelum memilih koordinat.', true);
      return;
    }
    if ($('f-parent_id').value) return;
    $('f-latitude').value = e.latlng.lat.toFixed(6);
    $('f-longitude').value = e.latlng.lng.toFixed(6);
    dirty = true;
    updateMarker();
  });
}
function select(record) {
  selected = structuredClone(record);
  dirty = false;
  $('empty').hidden = true;
  $('facility-form-modal').hidden = true;
  $('facility-form-message').textContent = '';
  $('delete-facility').hidden = !record.revision;
  $('open-facility-form').disabled = false;
  const parentSelect = $('f-parent_id');
  parentSelect.replaceChildren();
  for (const [id, name] of [
    ['', 'Mandiri / tidak berada di food court'],
    ...records
      .filter(
        (r) =>
          r.facility.category === 'food_court' &&
          r.facility.id !== record.facility.id,
      )
      .map((r) => [
        r.facility.id,
        r.facility.name + ' · ' + statuses[r.facility.status],
      ]),
  ]) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    parentSelect.append(option);
  }
  for (const [key] of fields) {
    const v = record.facility[key];
    $('f-' + key).value = Array.isArray(v) ? v.join(', ') : (v ?? '');
  }
  $('form-title').textContent = record.revision
    ? 'Edit fasilitas'
    : 'Tambah fasilitas';
  ensureFacilityMap();
  map.invalidateSize();
  syncParent();
  updateMarker();
  renderList();
}
async function refresh() {
  const d = await api('list');
  records = d.facilities;
  $('dashboard-facility-count').textContent = records.length;
  renderList();
}
function syncParent() {
  const control = $('f-parent_id');
  control.disabled = $('f-category').value !== 'resto_cafe';
  if (control.disabled) control.value = '';
  const parent = records.find((r) => r.facility.id === control.value)?.facility;
  for (const key of ['latitude', 'longitude', 'address']) {
    $('f-' + key).readOnly = !!parent;
    if (parent) $('f-' + key).value = parent[key];
  }
  $('f-unit_number').disabled = !parent;
  $('coordinate-hint').textContent = parent
    ? 'Alamat dan koordinat mengikuti food court induk. Isi nomor kios untuk petunjuk di dalam lokasi.'
    : 'Klik peta untuk memilih koordinat. Periksa posisi dan akses masuk sebelum publikasi.';
  if (!parent) $('f-unit_number').value = '';
  if (map) updateMarker();
}
$('f-category').onchange = syncParent;
$('f-parent_id').onchange = syncParent;
async function boot() {
  const d = await api('session');
  csrf = d.csrf;
  setup = d.setup;
  $('workspace').hidden = !d.email;
  $('auth').hidden = !!d.email;
  $('logout').hidden = !d.email;
  $('account').textContent = d.email || '';
  if (d.email) {
    await loadCategories();
    await refresh();
    await refreshPlots();
    await loadInfraTypes();
    await refreshInfra();
    showAdminSection('dashboard');
    message('Database terhubung.');
  } else {
    categoryDirty = false;
    $('category-manager').hidden = true;
    $('category-form').hidden = true;
    $('category-list').replaceChildren();
    records = [];
    selected = null;
    dirty = false;
    $('facility').reset();
    $('facility-form-modal').hidden = true;
    $('open-facility-form').disabled = true;
    $('empty').hidden = false;
    renderList();
    $('password').value = '';
    $('auth-title').textContent = setup
      ? 'Buat admin pertama'
      : 'Masuk ke pengelola';
    $('auth-description').textContent = setup
      ? 'Gunakan email Anda dan password 12–72 karakter. Setup ini hanya tersedia di komputer server.'
      : 'Kelola lokasi dan publikasikan informasi fasilitas.';
    $('password').minLength = setup ? 12 : 1;
    $('password').autocomplete = setup ? 'new-password' : 'current-password';
    $('login-submit').textContent = setup ? 'Buat akun admin' : 'Masuk';
    message('');
  }
}
$('login').onsubmit = async (e) => {
  e.preventDefault();
  $('login-submit').disabled = true;
  try {
    const d = await api(setup ? 'setup' : 'login', {
      email: $('email').value,
      password: $('password').value,
    });
    csrf = d.csrf;
    $('password').value = '';
    await boot();
  } catch (error) {
    message(error.message, true);
  } finally {
    $('login-submit').disabled = false;
  }
};
$('logout').onclick = async () => {
  if (!canLeave()) return;
  try {
    await api('logout', { logout: true });
    await boot();
  } catch (e) {
    message(e.message, true);
  }
};
$('add').onclick = () => {
  if (!categoryRows.some((c) => Number(c.enabled) === 1)) {
    message('Aktifkan atau tambahkan kategori terlebih dahulu.', true);
    return;
  }
  if (canLeave())
    select({
      revision: 0,
      facility: {
        id: crypto.randomUUID(),
        name: '',
        category:
          categoryRows.find(
            (c) => c.id === 'resto_cafe' && Number(c.enabled) === 1,
          )?.id || categoryRows.find((c) => Number(c.enabled) === 1).id,
        latitude: -6.297,
        longitude: 107.099,
        address: '',
        source: '',
        tags: [],
        menu_keywords: [],
        status: 'draft',
        verified_at: null,
        phone: null,
        website: null,
        opening_hours: null,
      },
    });
};
$('refresh').onclick = async () => {
  if (!canLeave()) return;
  try {
    await refresh();
    selected = null;
    dirty = false;
    $('facility-form-modal').hidden = true;
    $('open-facility-form').disabled = true;
    $('empty').hidden = false;
    renderList();
    message('Data terbaru dimuat.');
  } catch (e) {
    message(e.message, true);
  }
};
$('search').oninput = renderList;
$('open-facility-form').onclick = () => {
  if (!selected) return;
  $('facility-form-message').textContent = '';
  $('facility-form-modal').hidden = false;
  $('f-name').focus();
};
$('close-facility-form').onclick = () => {
  $('facility-form-modal').hidden = true;
};
$('delete-facility').onclick = async () => {
  if (!selected?.revision) return;
  if (!confirm('Hapus fasilitas ini secara permanen?')) return;
  $('delete-facility').disabled = true;
  try {
    await api('delete', {
      id: selected.facility.id,
      revision: selected.revision,
    });
    dirty = false;
    selected = null;
    marker?.remove();
    marker = null;
    $('facility-form-modal').hidden = true;
    $('open-facility-form').disabled = true;
    $('empty').hidden = false;
    await refresh();
    message('Fasilitas berhasil dihapus.');
  } catch (error) {
    $('facility-form-message').className = 'error';
    $('facility-form-message').textContent = error.message;
  } finally {
    $('delete-facility').disabled = false;
  }
};
$('facility').oninput = () => {
  dirty = true;
};
for (const key of ['latitude', 'longitude'])
  $('f-' + key).onchange = () => updateMarker();
$('facility').onsubmit = async (e) => {
  e.preventDefault();
  if (!selected) return;
  const f = { id: selected.facility.id };
  for (const [key] of fields) {
    let v = $('f-' + key).value.trim();
    if (['latitude', 'longitude'].includes(key)) v = Number(v);
    if (['tags', 'menu_keywords'].includes(key))
      v = v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    if (
      [
        'phone',
        'website',
        'opening_hours',
        'verified_at',
        'parent_id',
        'unit_number',
      ].includes(key) &&
      !v
    )
      v = null;
    f[key] = v;
  }
  $('save').disabled = true;
  try {
    const d = await api('save', { facility: f, revision: selected.revision });
    dirty = false;
    await refresh();
    select(d);
    $('facility-form-modal').hidden = false;
    $('facility-form-message').className = 'success';
    $('facility-form-message').textContent =
      f.status === 'published'
        ? 'Tersimpan dan terbit. Muat ulang peta untuk melihat perubahan.'
        : 'Tersimpan ke database. Status: ' + statuses[f.status] + '.';
    message('Fasilitas berhasil disimpan.');
  } catch (error) {
    $('facility-form-message').className = 'error';
    $('facility-form-message').textContent = error.message;
  } finally {
    $('save').disabled = false;
  }
};
window.addEventListener('beforeunload', (e) => {
  if (dirty || categoryDirty || plotDirty || infraDirty || infraTypeDirty) {
    e.preventDefault();
  }
});
boot().catch((e) => message(e.message, true));
