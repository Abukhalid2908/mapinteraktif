'use client';
import { Cable, CircleDot, Layers, Search, Waypoints } from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import type {
  Infrastructure,
  InfrastructureCategory,
} from '@/lib/infrastructure';

export default function InfrastructureDirectory({
  rows,
  categories,
  query,
  setQuery,
  selectedCategory,
  setSelectedCategory,
  selected,
  onSelect,
}: {
  rows: Infrastructure[];
  categories: InfrastructureCategory[];
  query: string;
  setQuery: (value: string) => void;
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  selected: Infrastructure | null;
  onSelect: (item: Infrastructure) => void;
}) {
  return (
    <>
      <div className="directory-head plot-directory-head">
        <span className="eyebrow">INFRASTRUKTUR KAWASAN</span>
        <h1>Jaringan & aset</h1>
        <p>Pilih kategori untuk menampilkan titik aset dan jalur utilitas.</p>
        <label className="search-box infra-category-select">
          <Layers size={18} />
          <NativeSelect
            aria-label="Pilih kategori infrastruktur"
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            className="w-full"
          >
            <NativeSelectOption value="">
              Pilih kategori…
            </NativeSelectOption>
            <NativeSelectOption value="all">
              Semua kategori
            </NativeSelectOption>
            {categories.map((entry) => (
              <NativeSelectOption key={entry.id} value={entry.id}>
                {entry.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Cari infrastruktur"
            placeholder="Cari nama atau jenis aset…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!selectedCategory}
          />
        </label>
        <div className="plot-summary infra-summary">
          <span>
            <strong>
              {rows.filter((item) => item.geometry_type === 'point').length}
            </strong>{' '}
            titik
          </span>
          <span>
            <strong>
              {rows.filter((item) => item.geometry_type === 'line').length}
            </strong>{' '}
            jalur
          </span>
        </div>
      </div>
      <div className="result-bar">
        <strong>{rows.length} aset</strong>
      </div>
      <div className="facility-list infra-public-list" aria-live="polite">
        {rows.length ? (
          rows.map((item) => {
            const category = categories.find(
              (entry) => entry.id === item.category,
            );
            const Icon = item.geometry_type === 'point' ? CircleDot : Waypoints;
            const notOk = item.condition === 'not_ok';
            return (
              <button
                key={item.id}
                className="facility-card"
                aria-pressed={selected?.id === item.id}
                onClick={() => onSelect(item)}
              >
                <span
                  className="infra-public-icon"
                  style={{
                    backgroundColor: notOk
                      ? '#dc2626'
                      : category?.color || '#397fc0',
                  }}
                >
                  <Icon size={21} />
                </span>
                <span className="facility-copy">
                  <span className="category-label">
                    {category?.label || item.category}
                    {notOk && (
                      <span className="infra-condition-flag"> · Tidak OK</span>
                    )}
                  </span>
                  <strong>{item.name}</strong>
                  <span className="facility-address">
                    {item.description ||
                      (item.geometry_type === 'point'
                        ? 'Aset titik'
                        : 'Jalur utilitas')}
                    {item.geometry_type === 'line' && item.length_m
                      ? ' · ' +
                        item.length_m.toLocaleString('id-ID', {
                          maximumFractionDigits: 1,
                        }) +
                        ' m'
                      : ''}
                  </span>
                </span>
                <Cable size={17} className="card-arrow" />
              </button>
            );
          })
        ) : (
          <div className="empty-state">
            <Cable />
            <h2>
              {selectedCategory
                ? 'Belum ada infrastruktur'
                : 'Pilih kategori dahulu'}
            </h2>
            <p>
              {selectedCategory
                ? 'Ubah pencarian atau terbitkan data melalui halaman admin.'
                : 'Gunakan dropdown di atas untuk menampilkan titik atau jalur infrastruktur.'}
            </p>
          </div>
        )}
      </div>
      <footer className="directory-footer">
        <span className="status-dot" /> Data infrastruktur terverifikasi
      </footer>
    </>
  );
}
