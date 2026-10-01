'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Plus, Minus, Maximize, RefreshCw } from 'lucide-react';
import { groupPoints } from '@/lib/map-markers.mjs';
import { markerFace, clusterChoices } from '@/lib/marker-elements';
import { distanceKm } from '@/lib/data.mjs';
import type * as Leaflet from 'leaflet';
import type { MapCamera } from './MapView';
import type { Facility } from '@/lib/facilities';
export default function LeafletMap({
  facilities,
  selected,
  exploreTarget,
  mode = 'facilities',
  plots = [],
  selectedPlot,
  onPlotSelect,
  infrastructure = [],
  infrastructureCategories = [],
  selectedInfrastructure,
  onInfrastructureSelect,
  onSelect,
  origin,
  camera,
  claimLocation,
  basemap = 'street',
}: {
  camera: RefObject<MapCamera>;
  claimLocation?: (
    origin:
      | { latitude: number; longitude: number; accuracy: number }
      | null
      | undefined,
  ) => boolean;
  facilities: Facility[];
  selected: Facility | null;
  exploreTarget?: Facility | null;
  onSelect: (f: Facility) => void;
  origin?: { latitude: number; longitude: number; accuracy: number } | null;
  mode?: 'facilities' | 'plots' | 'infrastructure';
  plots?: import('@/lib/plots').Plot[];
  selectedPlot?: import('@/lib/plots').Plot | null;
  onPlotSelect?: (p: import('@/lib/plots').Plot) => void;
  infrastructure?: import('@/lib/infrastructure').Infrastructure[];
  infrastructureCategories?: import('@/lib/infrastructure').InfrastructureCategory[];
  selectedInfrastructure?: import('@/lib/infrastructure').Infrastructure | null;
  onInfrastructureSelect?: (
    item: import('@/lib/infrastructure').Infrastructure,
  ) => void;
  basemap?: 'street' | 'satellite' | 'hybrid';
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    layer = useRef<Leaflet.LayerGroup | null>(null),
    leaflet = useRef<typeof Leaflet | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false,
      observer: ResizeObserver | undefined;
    Promise.all([
      import('leaflet'),
      fetch('/map-config.json').then(async (r) => {
        if (!r.ok) throw Error();
        return r.json() as Promise<{
          tile_url: string;
          attribution: string;
          center: [number, number];
          zoom: number;
        }>;
      }),
    ])
      .then(([L, config]) => {
        if (disposed || !container.current) return;
        if (
          typeof config.tile_url !== 'string' ||
          !config.tile_url.startsWith('https://') ||
          !Array.isArray(config.center) ||
          config.center.length !== 2 ||
          !config.center.every(Number.isFinite)
        )
          throw Error();
        leaflet.current = L;
        const m = L.map(container.current, { zoomControl: false }).setView(
          [camera.current.center[1], camera.current.center[0]],
          camera.current.zoom,
        );
        map.current = m;
        m.on('moveend', () => {
          camera.current = {
            ...camera.current,
            center: [m.getCenter().lng, m.getCenter().lat],
            zoom: m.getZoom(),
          };
        });
        const imageryUrl =
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        const tileUrl = basemap === 'street' ? config.tile_url : imageryUrl;
        const tiles = L.tileLayer(tileUrl, {
          maxZoom: 19,
          attribution:
            basemap === 'street'
              ? config.attribution
              : 'Tiles &copy; Esri and imagery providers',
        }).addTo(m);
        tiles.on('tileerror', () => setError(true));
        if (basemap === 'hybrid')
          L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
            { maxZoom: 19, attribution: '&copy; Esri' },
          ).addTo(m);
        layer.current = L.layerGroup().addTo(m);
        setReady(true);
        observer = new ResizeObserver(() => m.invalidateSize());
        observer.observe(container.current);
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      if (map.current) {
        camera.current = {
          ...camera.current,
          center: [map.current.getCenter().lng, map.current.getCenter().lat],
          zoom: map.current.getZoom(),
        };
        map.current.remove();
      }
      map.current = null;
    };
  }, [attempt, basemap, camera]);
  useEffect(() => {
    if (!ready || !layer.current || !leaflet.current || !map.current) return;
    const L = leaflet.current,
      m = map.current,
      layerGroup = layer.current;
    function render() {
      layerGroup.clearLayers();
      for (const group of groupPoints(
        mode === 'facilities' ? facilities : [],
        (f) => m.latLngToContainerPoint([f.latitude, f.longitude]),
        48,
      )) {
        const first = group.items[0],
          cluster = group.items.length > 1,
          same = group.items.every((f) => f.category === first.category);
        const icon = L.divIcon({
          className: 'category-pin tone-' + (same ? first.category : 'mixed'),
          html: markerFace(group.items),
          iconSize: [44, 50],
          iconAnchor: [22, 50],
        });
        const marker = L.marker([group.latitude, group.longitude], {
          icon,
          title: cluster
            ? group.items.length + ' lokasi berdekatan'
            : first.name,
          alt: cluster
            ? 'Buka ' + group.items.length + ' lokasi berdekatan'
            : first.name,
        }).addTo(layerGroup);
        marker.on('click', () => {
          if (!cluster) {
            onSelect(first);
            return;
          }
          if (m.getZoom() < 17.9)
            m.setView(
              [group.latitude, group.longitude],
              Math.min(19, m.getZoom() + 2),
            );
          else
            marker
              .bindPopup(
                clusterChoices(group.items, (f) => {
                  m.closePopup();
                  onSelect(f);
                }),
              )
              .openPopup();
        });
      }
    }
    render();
    m.on('moveend', render);
    return () => {
      m.off('moveend', render);
      layerGroup.clearLayers();
      m.closePopup();
    };
  }, [facilities, mode, ready, onSelect]);
  useEffect(() => {
    if (!ready || !leaflet.current || !map.current) return;
    const L = leaflet.current;
    const m = map.current;
    const group = L.layerGroup().addTo(m);
    const colors = {
      available: '#279266',
      reserved: '#d59a20',
      occupied: '#c65c51',
      utility: '#397fc0',
    };
    if (mode === 'plots') {
      const bounds: L.LatLngExpression[] = [];
      for (const p of plots) {
        const points = p.coordinates.map(
          ([lng, lat]) => [lat, lng] as L.LatLngTuple,
        );
        bounds.push(...points);
        L.polygon(points, {
          color: p.id === selectedPlot?.id ? '#173f31' : '#fff',
          weight: p.id === selectedPlot?.id ? 4 : 2,
          fillColor: colors[p.status],
          fillOpacity: p.id === selectedPlot?.id ? 0.65 : 0.43,
        })
          .on('click', () => onPlotSelect?.(p))
          .addTo(group);
      }
      if (bounds.length)
        m.fitBounds(L.latLngBounds(bounds), { padding: [45, 45] });
    }
    return () => {
      group.remove();
    };
  }, [mode, plots, selectedPlot?.id, onPlotSelect, ready]);
  useEffect(() => {
    if (!ready || !leaflet.current || !map.current) return;
    const L = leaflet.current,
      m = map.current,
      group = L.layerGroup().addTo(m),
      bounds: L.LatLngExpression[] = [];
    if (mode === 'infrastructure') {
      for (const item of infrastructure) {
        const points = item.coordinates.map(
          ([lng, lat]) => [lat, lng] as L.LatLngTuple,
        );
        bounds.push(...points);
        const active = selectedInfrastructure?.id === item.id;
        const notOk = item.condition === 'not_ok';
        const categoryColor = infrastructureCategories.find(
          (entry) => entry.id === item.category,
        )?.color;
        const baseColor = notOk ? '#dc2626' : categoryColor || '#397fc0';
        const shape =
          item.geometry_type === 'point'
            ? L.circleMarker(points[0], {
                radius: active ? 11 : 8,
                color: '#fff',
                weight: 3,
                fillColor: baseColor,
                fillOpacity: 1,
              })
            : L.polyline(points, {
                color: baseColor,
                weight: active ? 7 : 5,
                opacity: 0.9,
              });
        shape
          .bindTooltip(item.name + (notOk ? ' — Tidak OK' : ''), {
            direction: 'top',
          })
          .on('click', () => onInfrastructureSelect?.(item))
          .addTo(group);
      }
      if (bounds.length && !selectedInfrastructure)
        m.fitBounds(L.latLngBounds(bounds), { padding: [55, 55], maxZoom: 17 });
      if (selectedInfrastructure) {
        const selectedPoints = selectedInfrastructure.coordinates.map(
          ([lng, lat]) => [lat, lng] as L.LatLngTuple,
        );
        if (selectedInfrastructure.geometry_type === 'point')
          m.panTo(selectedPoints[0]);
        else
          m.fitBounds(L.latLngBounds(selectedPoints), {
            padding: [70, 70],
            maxZoom: 18,
          });
      }
    }
    return () => {
      group.remove();
    };
  }, [
    mode,
    infrastructure,
    infrastructureCategories,
    selectedInfrastructure?.id,
    onInfrastructureSelect,
    ready,
  ]);
  useEffect(() => {
    if (ready && selected)
      map.current?.panTo([selected.latitude, selected.longitude]);
  }, [selected, ready]);
  useEffect(() => {
    if (!ready || !container.current) return;
    const observer = new ResizeObserver(() =>
      map.current?.invalidateSize({ pan: false }),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [ready]);
  useEffect(() => {
    if (ready && exploreTarget)
      map.current?.setView(
        [exploreTarget.latitude, exploreTarget.longitude],
        16,
        {
          animate: !window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches,
        },
      );
  }, [exploreTarget, ready]);
  useEffect(() => {
    if (!ready || !origin || !map.current || !leaflet.current) return;
    if (claimLocation?.(origin)) {
      map.current.setView([origin.latitude, origin.longitude], 16);
    }
    const L = leaflet.current;
    const circle = L.circle([origin.latitude, origin.longitude], {
      radius: origin.accuracy,
      color: '#397fc0',
      fillOpacity: 0.08,
      weight: 1,
    }).addTo(map.current);
    const dot = L.circleMarker([origin.latitude, origin.longitude], {
      radius: 7,
      color: '#fff',
      weight: 3,
      fillColor: '#397fc0',
      fillOpacity: 1,
    }).addTo(map.current);
    return () => {
      circle.remove();
      dot.remove();
    };
  }, [origin, ready, claimLocation]);
  return (
    <>
      <div ref={container} className="leaflet-map" />
      {origin &&
        distanceKm(origin, { latitude: -6.297, longitude: 107.099 }) > 10 && (
          <button
            className="area-return"
            onClick={() => map.current?.setView([-6.297, 107.099], 14)}
          >
            Ke kawasan MM2100 →
          </button>
        )}
      <div className="map-controls">
        <button
          aria-label="Perbesar peta"
          onClick={() => map.current?.zoomIn()}
        >
          <Plus size={19} />
        </button>
        <button
          aria-label="Perkecil peta"
          onClick={() => map.current?.zoomOut()}
        >
          <Minus size={19} />
        </button>
        <button
          aria-label="Kembali ke kawasan"
          onClick={() => map.current?.setView([-6.297, 107.099], 14)}
        >
          <Maximize size={18} />
        </button>
      </div>
      {error && (
        <output className="map-error">
          Sebagian peta gagal dimuat. Daftar tetap bisa digunakan.
          <button
            onClick={() => {
              setError(false);
              setReady(false);
              setAttempt((n) => n + 1);
            }}
          >
            <RefreshCw size={14} />
            Coba lagi
          </button>
        </output>
      )}
    </>
  );
}
