'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  MapPin,
  Search,
  ArrowUpRight,
  LocateFixed,
  Coffee,
  BedDouble,
  Utensils,
  Landmark,
  HeartPulse,
  Building2,
  ArrowRight,
  Layers,
  X,
  Compass,
  LandPlot,
  Cable,
  LogIn,
  LogOut,
  LockKeyhole,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  distanceKm,
  filterFacilities,
  navigationUrl,
  streetViewUrl,
  validateDataset,
} from '@/lib/data.mjs';
import Link from 'next/link';
import { flushSync } from 'react-dom';
import MapView from '@/components/MapView';
import PlotDirectory from '@/components/PlotDirectory';
import InfrastructureDirectory from '@/components/InfrastructureDirectory';
import {
  demoPlots,
  plotStatuses,
  type Plot,
  type PlotStatus,
} from '@/lib/plots';
import { useDeviceLocation } from '@/hooks/use-device-location';
import type {
  Infrastructure,
  InfrastructureCategory,
} from '@/lib/infrastructure';
import {
  categories as defaultCategories,
  demoFacilities,
  type Facility,
  type Category,
} from '@/lib/facilities';

export default function Home() {
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [surface, setSurface] = useState<
    'facilities' | 'plots' | 'infrastructure'
  >('facilities');
  const [plots, setPlots] = useState<Plot[]>([]),
    [selectedPlot, setSelectedPlot] = useState<Plot | null>(null);
  const [plotQuery, setPlotQuery] = useState(''),
    [plotStatus, setPlotStatus] = useState<'all' | PlotStatus>('all');
  const [infrastructure, setInfrastructure] = useState<Infrastructure[]>([]),
    [infrastructureCategories, setInfrastructureCategories] = useState<
      InfrastructureCategory[]
    >([]),
    [infrastructureQuery, setInfrastructureQuery] = useState(''),
    [infrastructureCategory, setInfrastructureCategory] = useState(''),
    [selectedInfrastructure, setSelectedInfrastructure] =
      useState<Infrastructure | null>(null);
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('all');
  const [selectedRecord, setSelected] = useState<Facility | null>(null);
  const [rows, setRows] = useState<Facility[]>([]),
    [demo, setDemo] = useState(false),
    [loading, setLoading] = useState(true),
    [dataError, setDataError] = useState(''),
    [retry, setRetry] = useState(0),
    [updated, setUpdated] = useState('');
  const { origin, gpsState, locating, locate, clear } = useDeviceLocation();
  const [info, setInfo] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [exploreTarget, setExploreTarget] = useState<Facility | null>(null);
  const [account, setAccount] = useState<{
    email: string;
    role: string;
  } | null>(null);
  const [csrf, setCsrf] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/facilities.json', { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw Error('Data fasilitas gagal dimuat.');
        const d = (await r.json()) as import('@/lib/data.mjs').Dataset;
        if (validateDataset(d, { publicOnly: true }).errors.length)
          throw Error('Dataset tidak valid. Silakan hubungi pengelola.');
        const definitions = d.categories || defaultCategories;
        setCategories(definitions);
        setPlots(d.plots || []);
        setInfrastructure(d.infrastructure || []);
        setInfrastructureCategories(d.infrastructure_categories || []);
        setAccount(d.account || null);
        setCsrf(d.csrf || '');
        setRows(
          d.facilities.map((f) => ({
            ...f,
            category_icon: definitions.find((c) => c.id === f.category)?.icon,
          })),
        );
        setUpdated(d.updated_at);
        setDemo(d.facilities.length === 0);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setDataError(e.message);
          setDemo(false);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [retry]);
  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError('');
    try {
      const response = await fetch('/api/index.php?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const result = (await response.json()) as {
        error?: string;
        email: string;
        role: string;
        csrf: string;
      };
      if (!response.ok) throw Error(result.error || 'Login gagal.');
      setAccount({ email: result.email, role: result.role });
      setCsrf(result.csrf);
      setLoginPassword('');
      setLoading(true);
      setRetry((value) => value + 1);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Login gagal.');
    } finally {
      setLoginBusy(false);
    }
  }
  async function logout() {
    const response = await fetch('/api/index.php?action=logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: '{}',
    });
    const result = (await response.json()) as { csrf: string };
    if (!response.ok) return;
    setAccount(null);
    setCsrf(result.csrf);
    setSurface('facilities');
    setPlots([]);
    setInfrastructure([]);
    setInfrastructureCategories([]);
  }
  const activeRows = useMemo(
    () =>
      demo
        ? demoFacilities
            .filter((f) => categories.some((c) => c.id === f.category))
            .map((f) => ({
              ...f,
              category_icon: categories.find((c) => c.id === f.category)?.icon,
            }))
        : rows,
    [demo, rows, categories],
  );
  const activePlots = plots.length ? plots : demoPlots;
  const filteredPlots = useMemo(
    () =>
      activePlots.filter(
        (p) =>
          (plotStatus === 'all' || p.status === plotStatus) &&
          [p.plot_number, p.zonation, p.tenant_name || '']
            .join(' ')
            .toLowerCase()
            .includes(plotQuery.trim().toLowerCase()),
      ),
    [activePlots, plotStatus, plotQuery],
  );
  const filteredInfrastructure = useMemo(() => {
    if (!infrastructureCategory) return [];
    const normalized = infrastructureQuery.trim().toLowerCase();
    return infrastructure.filter((item) => {
      if (
        infrastructureCategory !== 'all' &&
        item.category !== infrastructureCategory
      )
        return false;
      const category = infrastructureCategories.find(
        (entry) => entry.id === item.category,
      );
      return [item.name, item.description, category?.label || item.category]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [
    infrastructure,
    infrastructureCategories,
    infrastructureQuery,
    infrastructureCategory,
  ]);
  const iconSet: Record<string, typeof Coffee> = {
    resto_cafe: Utensils,
    cafe: Coffee,
    hotel: BedDouble,
    food_court: Utensils,
    atm: Landmark,
    medical: HeartPulse,
    public_facility: Building2,
  };
  const icons = categories.map((c) => iconSet[c.icon || c.id] || Building2);
  const filtered = useMemo(
    () => filterFacilities(activeRows, query, category),
    [activeRows, query, category],
  );
  const selected = activeRows.find((f) => f.id === selectedRecord?.id) ?? null;
  const parent = activeRows.find((f) => f.id === selected?.parent_id);
  const tenants = activeRows.filter((f) => f.parent_id === selected?.id);
  const mapRows = useMemo(() => {
    const result = new Map<string, Facility>();
    for (const f of filtered) {
      const root = activeRows.find((p) => p.id === f.parent_id) || f;
      result.set(root.id, {
        ...root,
        tenant_count: activeRows.filter((t) => t.parent_id === root.id).length,
      });
    }
    return [...result.values()];
  }, [filtered, activeRows]);
  function chooseCategory(id: string) {
    setCategory(id);
    setBrowsing(true);
    setSelected(null);
    setExploreTarget(filterFacilities(activeRows, query, id)[0] || null);
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool = {
      name: 'search_facilities',
      description:
        'Cari fasilitas dan terapkan pencarian serta kategori pada peta dan daftar yang terlihat. Hasil demo diberi penanda.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          category: {
            type: 'string',
            enum: ['all', ...categories.map((c) => c.id)],
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input: unknown) => {
        const value = input as { query?: unknown; category?: unknown };
        if (
          !value ||
          typeof value.query !== 'string' ||
          Object.keys(value).some((k) => !['query', 'category'].includes(k)) ||
          (value.category !== undefined &&
            !['all', ...categories.map((c) => c.id)].includes(
              value.category as string,
            ))
        )
          throw Error('Input pencarian tidak valid.');
        if (loading || dataError) throw Error('Data belum tersedia.');
        const q = value.query,
          c = (value.category as string) || 'all';
        flushSync(() => {
          setBrowsing(true);
          setQuery(q);
          setCategory(c);
          setSelected(null);
        });
        return {
          demo,
          results: filterFacilities(activeRows, q, c).map((f) => ({
            id: f.id,
            name: f.name,
            category: f.category,
          })),
        };
      },
    };
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [activeRows, categories, demo, loading, dataError]);
  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <MapPin size={23} />
          </span>
          <span>
            MM<span className="brand-number">2100</span>
            <small>JELAJAH KAWASAN</small>
          </span>
        </Link>
        <div className="header-location">
          <span className="status-dot" /> Cikarang Barat, Bekasi
        </div>
        <nav className="surface-switch" aria-label="Jenis peta">
          <button
            aria-pressed={surface === 'facilities'}
            onClick={() => {
              setSurface('facilities');
              setSelectedPlot(null);
            }}
          >
            <MapPin size={16} />
            Fasilitas
          </button>
          {account && (
            <>
              <button
                aria-pressed={surface === 'plots'}
                onClick={() => {
                  setSurface('plots');
                  setSelected(null);
                  setBrowsing(true);
                }}
              >
                <LandPlot size={16} />
                Bidang Kawasan
              </button>
              <button
                aria-pressed={surface === 'infrastructure'}
                onClick={() => {
                  setSurface('infrastructure');
                  setSelected(null);
                  setSelectedPlot(null);
                  setBrowsing(true);
                }}
              >
                <Cable size={16} />
                Infrastruktur
              </button>
            </>
          )}
        </nav>
        <div className="header-actions">
          <button className="header-note" onClick={() => setInfo(true)}>
            Tentang <ArrowUpRight size={15} />
          </button>
          {account ? (
            <button className="login-button is-authenticated" onClick={logout}>
              <span>{account.email}</span>
              <LogOut size={16} />
            </button>
          ) : (
            <details className="login-menu">
              <summary className="login-button">
                <LogIn size={16} /> Login internal
              </summary>
              <div className="login-popover">
                <div className="login-symbol">
                  <LockKeyhole size={21} />
                </div>
                <strong>Akses internal MM2100</strong>
                <p>Masuk untuk membuka data bidang dan infrastruktur.</p>
                <form onSubmit={submitLogin} className="login-form">
                  <label>
                    Email
                    <input
                      type="email"
                      autoComplete="username"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      required
                    />
                  </label>
                  {loginError && <p role="alert">{loginError}</p>}
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={loginBusy}
                  >
                    {loginBusy ? 'Memeriksa…' : 'Masuk'}
                  </button>
                </form>
              </div>
            </details>
          )}
        </div>
      </header>
      <div
        className={
          'workspace explorer-workspace ' +
          (browsing ? 'is-browsing' : 'is-welcome')
        }
      >
        <aside className="directory">
          {surface === 'facilities' ? (
            <>
              <div className="directory-head">
                <div className="explorer-label">
                  <span className="eyebrow">JELAJAHI MM2100</span>
                  {browsing && (
                    <button onClick={() => setBrowsing(false)}>
                      Kategori <Layers size={14} />
                    </button>
                  )}
                </div>
                <h1>
                  {browsing
                    ? 'Temukan pilihan Anda.'
                    : 'Mau cari apa hari ini?'}
                </h1>
                <p>Pilih tujuan Anda. Jelajahi tempatnya di peta.</p>
                <label className="search-box">
                  <Search size={19} />
                  <input
                    aria-label="Cari fasilitas"
                    placeholder="Cari tempat, fasilitas, atau menu…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setBrowsing(true);
                    }}
                  />
                  {query && (
                    <button
                      aria-label="Hapus pencarian"
                      onClick={() => setQuery('')}
                    >
                      <X size={16} />
                    </button>
                  )}
                </label>
                {!browsing && (
                  <div
                    className="category-launcher"
                    aria-label="Jelajahi kategori"
                  >
                    {categories.map((c, i) => {
                      const Icon = icons[i];
                      return (
                        <button
                          key={c.id}
                          className={'category-launch tone-' + c.id}
                          onClick={() => chooseCategory(c.id)}
                          aria-label={'Jelajahi ' + c.label}
                        >
                          <span className="launch-icon">
                            <Icon size={30} strokeWidth={1.7} />
                          </span>
                          <span>{c.label}</span>
                          <ArrowUpRight size={13} className="launch-arrow" />
                        </button>
                      );
                    })}
                  </div>
                )}
                {!browsing && (
                  <button
                    className="browse-all"
                    onClick={() => chooseCategory('all')}
                  >
                    Lihat semua tempat <ArrowRight size={16} />
                  </button>
                )}
                {!browsing && dataError && (
                  <p role="alert">
                    {dataError}{' '}
                    <button onClick={() => setBrowsing(true)}>
                      Lihat status data
                    </button>
                  </p>
                )}
                <div className="category-chips" hidden={!browsing}>
                  <button
                    className={category === 'all' ? 'active' : ''}
                    onClick={() => chooseCategory('all')}
                  >
                    <Layers size={14} />
                    Semua
                  </button>
                  {categories.map((c, i) => {
                    const Icon = icons[i];
                    return (
                      <button
                        key={c.id}
                        className={category === c.id ? 'active' : ''}
                        onClick={() => chooseCategory(c.id)}
                      >
                        <Icon size={14} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="result-bar">
                <strong>{filtered.length} tempat</strong>
                <button
                  className="demo-toggle"
                  onClick={() => {
                    setDemo(!demo);
                    setSelected(null);
                  }}
                >
                  {demo ? 'Lihat data nyata' : 'Coba demo'}
                </button>
              </div>
              <div className="facility-list" aria-live="polite">
                {loading ? (
                  <div className="empty-state">Memuat data fasilitas…</div>
                ) : dataError && !demo ? (
                  <div className="empty-state" role="alert">
                    <h2>Data belum bisa dimuat</h2>
                    <p>{dataError}</p>
                    <button
                      onClick={() => {
                        setLoading(true);
                        setDataError('');
                        setRetry((n) => n + 1);
                      }}
                    >
                      Coba lagi
                    </button>
                  </div>
                ) : (
                  filtered.map((f) => {
                    const ci = categories.findIndex((c) => c.id === f.category),
                      Icon = icons[ci] || Building2;
                    return (
                      <button
                        className="facility-card"
                        key={f.id}
                        onClick={() => setSelected(f)}
                      >
                        <span className={'facility-icon tone-' + f.category}>
                          <Icon size={23} />
                        </span>
                        <span className="facility-copy">
                          <span className="category-label">
                            {categories[ci]?.label || f.category}
                          </span>
                          <strong>{f.name}</strong>
                          {f.parent_id && (
                            <span className="facility-address">
                              {
                                activeRows.find((p) => p.id === f.parent_id)
                                  ?.name
                              }{' '}
                              {f.unit_number ? '· Kios ' + f.unit_number : ''}
                            </span>
                          )}
                          <span className="facility-address">{f.address}</span>
                          <span className="facility-tags">
                            {f.tags.slice(0, 2).map((t) => (
                              <span key={t}>{t}</span>
                            ))}
                          </span>
                        </span>
                        <ArrowRight size={17} className="card-arrow" />
                      </button>
                    );
                  })
                )}
                {!loading && !dataError && !filtered.length && (
                  <div className="empty-state">
                    <Search />
                    <h2>
                      {!rows.length && !demo
                        ? 'Data terverifikasi belum tersedia'
                        : 'Belum ada hasil'}
                    </h2>
                    <p>
                      {!rows.length && !demo
                        ? 'Coba mode demo untuk menjelajahi fitur aplikasi.'
                        : 'Coba kata kunci lain atau tampilkan semua kategori.'}
                    </p>
                    <button
                      onClick={() => {
                        setQuery('');
                        setCategory('all');
                      }}
                    >
                      Reset pencarian
                    </button>
                  </div>
                )}
              </div>
              <footer className="directory-footer">
                <span className="status-dot" />
                {demo
                  ? 'Contoh fasilitas · Belum untuk panduan perjalanan'
                  : updated
                    ? 'Data diperbarui ' +
                      new Date(updated).toLocaleDateString('id-ID')
                    : 'Belum ada dataset'}
              </footer>
            </>
          ) : surface === 'plots' ? (
            <PlotDirectory
              plots={filteredPlots}
              query={plotQuery}
              setQuery={setPlotQuery}
              status={plotStatus}
              setStatus={setPlotStatus}
              onSelect={setSelectedPlot}
              demo={!plots.length}
            />
          ) : (
            <InfrastructureDirectory
              rows={filteredInfrastructure}
              categories={infrastructureCategories}
              query={infrastructureQuery}
              setQuery={setInfrastructureQuery}
              selectedCategory={infrastructureCategory}
              setSelectedCategory={setInfrastructureCategory}
              selected={selectedInfrastructure}
              onSelect={setSelectedInfrastructure}
            />
          )}
        </aside>
        <section className="map-area" aria-label="Peta kawasan">
          <MapView
            facilities={mapRows}
            selected={selected}
            onSelect={setSelected}
            origin={origin}
            exploreTarget={exploreTarget}
            mode={surface}
            plots={filteredPlots}
            selectedPlot={selectedPlot}
            onPlotSelect={setSelectedPlot}
            infrastructure={filteredInfrastructure}
            infrastructureCategories={infrastructureCategories}
            selectedInfrastructure={selectedInfrastructure}
            onInfrastructureSelect={setSelectedInfrastructure}
          />
          <div className="map-heading">
            <Compass size={18} />
            <span>
              <strong>Jelajahi MM2100</strong>
              <small>Peta fasilitas kawasan</small>
            </span>
          </div>
          <div className="location-control">
            <button onClick={locate} disabled={locating}>
              <LocateFixed size={16} />
              {locating ? 'Mencari lokasi…' : 'Gunakan lokasi saya'}
            </button>
            {origin && (
              <button aria-label="Hapus lokasi perangkat" onClick={clear}>
                <X size={15} />
              </button>
            )}
            <small>Lokasi hanya dipakai selama sesi ini.</small>
            {gpsState && <output>{gpsState}</output>}
          </div>
          <div className="demo-notice">
            <span className="notice-dot" />
            {surface === 'infrastructure'
              ? 'Infrastruktur kawasan'
              : demo
                ? 'Mode demo'
                : 'Direktori kawasan'}
            <span>
              {surface === 'infrastructure'
                ? infrastructureCategory
                  ? 'Pilih titik atau jalur untuk melihat namanya.'
                  : 'Pilih kategori di panel kiri untuk menampilkan infrastruktur.'
                : demo
                  ? 'Nama dan titik fasilitas adalah contoh.'
                  : origin
                    ? 'Jarak langsung dari lokasi perangkat.'
                    : 'Pilih fasilitas untuk melihat detail.'}
            </span>
          </div>
        </section>
      </div>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="detail-sheet">
          {selected && (
            <>
              <div className={'detail-visual tone-' + selected.category}>
                <MapPin size={55} />
                <span>
                  {selected.demo ? 'CONTOH FASILITAS' : 'DIREKTORI KAWASAN'}
                </span>
              </div>
              <div className="detail-body">
                <span className="eyebrow">
                  {categories.find((c) => c.id === selected.category)?.label}
                </span>
                <SheetTitle className="detail-title">
                  {selected.name}
                </SheetTitle>
                <SheetDescription>{selected.address}</SheetDescription>
                {parent && (
                  <div className="detail-note">
                    <button
                      className="text-button"
                      onClick={() => setSelected(parent)}
                    >
                      Di dalam {parent.name}
                    </button>
                    <p>
                      {selected.unit_number
                        ? 'Kios / unit ' + selected.unit_number + '. '
                        : ''}
                      Navigasi menuju lokasi food court induk.
                    </p>
                  </div>
                )}
                {selected.category === 'food_court' && (
                  <section>
                    <h3>Kantin & resto ({tenants.length})</h3>
                    {tenants.length ? (
                      tenants.map((tenant) => (
                        <button
                          className="facility-card"
                          key={tenant.id}
                          onClick={() => setSelected(tenant)}
                        >
                          <span>
                            <strong>{tenant.name}</strong>
                            <span className="facility-address">
                              {tenant.unit_number
                                ? 'Kios ' + tenant.unit_number
                                : 'Nomor kios belum tersedia'}
                            </span>
                          </span>
                          <ArrowRight size={17} />
                        </button>
                      ))
                    ) : (
                      <p>Belum ada tenant terbit.</p>
                    )}
                  </section>
                )}
                {selected.demo && (
                  <div className="detail-note">
                    Data ini merupakan contoh untuk mencoba aplikasi. Lokasi
                    belum diverifikasi; navigasi dinonaktifkan.
                  </div>
                )}
                <h3>Fasilitas & informasi</h3>
                <div className="facility-tags">
                  {selected.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <dl>
                  <dt>Jam buka</dt>
                  <dd>{selected.opening_hours || 'Belum tersedia'}</dd>
                  <dt>Telepon</dt>
                  <dd>{selected.phone || 'Belum tersedia'}</dd>
                  <dt>Website</dt>
                  <dd>
                    {selected.website ? (
                      <a
                        href={selected.website}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Buka website ↗
                      </a>
                    ) : (
                      'Belum tersedia'
                    )}
                  </dd>
                  <dt>Verifikasi</dt>
                  <dd>{selected.verified_at || 'Belum diverifikasi'}</dd>
                  <dt>Sumber</dt>
                  <dd>{selected.source || 'Data demonstrasi'}</dd>
                </dl>
                {origin && (
                  <p className="distance-note">
                    <strong>
                      {distanceKm(origin, selected).toFixed(2)} km
                    </strong>
                    <br />
                    Jarak langsung (garis lurus), bukan jarak perjalanan.
                    <br />
                    Asal: lokasi perangkat{' '}
                    {selected.demo ? '· Tujuan ilustrasi' : ''}
                  </p>
                )}
                {!selected.demo ? (
                  <>
                    <a
                      className="primary-button"
                      href={navigationUrl(selected, origin)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Buka navigasi Google Maps <ArrowUpRight size={16} />
                    </a>
                    <a
                      className="secondary-map-button"
                      href={streetViewUrl(selected)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Buka Street View <ArrowUpRight size={16} />
                    </a>
                    <p className="privacy-note">
                      Koordinat tujuan
                      {origin ? ' dan lokasi perangkat Anda' : ''} diteruskan ke
                      Google Maps saat tautan dibuka.
                    </p>
                  </>
                ) : (
                  <button className="primary-button" disabled>
                    Navigasi tidak tersedia untuk demo
                  </button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <Sheet
        open={!!selectedPlot}
        onOpenChange={(open) => {
          if (!open) setSelectedPlot(null);
        }}
      >
        <SheetContent side="right" className="detail-sheet">
          {selectedPlot && (
            <div className="detail-body plot-detail">
              <span className="eyebrow">BIDANG KAWASAN</span>
              <SheetTitle className="detail-title">
                {selectedPlot.plot_number}
              </SheetTitle>
              <span
                className={'plot-status-badge status-' + selectedPlot.status}
              >
                {plotStatuses.find((s) => s.id === selectedPlot.status)?.label}
              </span>
              {selectedPlot.demo && (
                <div className="detail-note">
                  Polygon dan atribut ini merupakan ilustrasi, bukan batas
                  survei atau data legal.
                </div>
              )}
              <dl>
                <dt>Luas</dt>
                <dd>
                  {selectedPlot.area_m2.toLocaleString('id-ID')} m² ·{' '}
                  {(selectedPlot.area_m2 / 10000).toLocaleString('id-ID', {
                    maximumFractionDigits: 3,
                  })}{' '}
                  ha
                </dd>
                <dt>Peruntukan</dt>
                <dd>{selectedPlot.zonation}</dd>
                <dt>Tenant</dt>
                <dd>{selectedPlot.tenant_name || 'Belum ada'}</dd>
              </dl>
              <p className="privacy-note">
                Luas dan batas pada peta bersifat informatif. Gunakan dokumen
                survei untuk keputusan resmi.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Sheet
        open={!!selectedInfrastructure}
        onOpenChange={(open) => {
          if (!open) setSelectedInfrastructure(null);
        }}
      >
        <SheetContent side="right" className="detail-sheet">
          {selectedInfrastructure && (
            <div className="detail-body plot-detail">
              <span className="eyebrow">INFRASTRUKTUR KAWASAN</span>
              <SheetTitle className="detail-title">
                {selectedInfrastructure.name}
              </SheetTitle>
              <dl>
                <dt>Kategori</dt>
                <dd>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      marginRight: 6,
                      verticalAlign: 'middle',
                      backgroundColor:
                        infrastructureCategories.find(
                          (entry) =>
                            entry.id === selectedInfrastructure.category,
                        )?.color || '#397fc0',
                    }}
                  />
                  {infrastructureCategories.find(
                    (entry) => entry.id === selectedInfrastructure.category,
                  )?.label || selectedInfrastructure.category}
                </dd>
                <dt>Status</dt>
                <dd>
                  {selectedInfrastructure.status === 'published'
                    ? 'Terbit'
                    : selectedInfrastructure.status}
                </dd>
                <dt>Kondisi</dt>
                <dd>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#fff',
                      backgroundColor:
                        selectedInfrastructure.condition === 'not_ok'
                          ? '#dc2626'
                          : '#16a34a',
                    }}
                  >
                    {selectedInfrastructure.condition === 'not_ok'
                      ? 'Tidak OK'
                      : 'OK'}
                  </span>
                </dd>
                <dt>Jenis</dt>
                <dd>
                  {selectedInfrastructure.geometry_type === 'point'
                    ? 'Titik'
                    : 'Jalur'}
                </dd>
                {selectedInfrastructure.geometry_type === 'line' && (
                  <>
                    <dt>Panjang</dt>
                    <dd>
                      {selectedInfrastructure.length_m
                        ? selectedInfrastructure.length_m.toLocaleString(
                            'id-ID',
                            { maximumFractionDigits: 1 },
                          ) + ' m'
                        : '—'}
                    </dd>
                  </>
                )}
                <dt>Deskripsi</dt>
                <dd>
                  {selectedInfrastructure.description || 'Tidak ada deskripsi.'}
                </dd>
                <dt>Sumber</dt>
                <dd>{selectedInfrastructure.source || '—'}</dd>
                <dt>Verifikasi</dt>
                <dd>
                  {selectedInfrastructure.verified_at
                    ? new Date(
                        selectedInfrastructure.verified_at,
                      ).toLocaleDateString('id-ID')
                    : 'Belum diverifikasi'}
                </dd>
              </dl>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={info} onOpenChange={setInfo}>
        <DialogContent className="about-dialog">
          <DialogTitle>Tentang direktori MM2100</DialogTitle>
          <DialogDescription>
            Temukan fasilitas di sekitar kawasan melalui peta atau daftar.
          </DialogDescription>
          <p>
            Data fasilitas diperbarui oleh pengelola, bukan secara real-time.
            Periksa tanggal verifikasi pada detail. Mode demo berisi contoh,
            bukan rekomendasi tempat nyata.
          </p>
          <p>
            Izin lokasi perangkat diminta saat aplikasi dibuka untuk memusatkan
            peta. Koordinat disimpan di memori sesi, dan tidak masuk dataset.
            Titik acuan pintu tol belum tersedia karena belum diverifikasi.
          </p>
          <p>
            Peta 2D menggunakan OpenStreetMap; peta 3D menggunakan OpenFreeMap
            dengan data OpenStreetMap. Bentuk dan tinggi bangunan mengikuti data
            penyedia dan belum diverifikasi melalui survei. Tidak ada unduhan
            peta offline.
          </p>
          <a
            href="https://www.openstreetmap.org/fixthemap"
            target="_blank"
            rel="noopener noreferrer"
          >
            Laporkan masalah peta ↗
          </a>
        </DialogContent>
      </Dialog>
    </main>
  );
}
