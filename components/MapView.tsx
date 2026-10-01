'use client';
import { useRef, useState, useCallback } from 'react';
import { Box, Map as MapIcon, Satellite } from 'lucide-react';
import LeafletMap from './LeafletMap';
import Map3D from './Map3D';
import type { Facility } from '@/lib/facilities';
import type { Plot } from '@/lib/plots';
import type {
  Infrastructure,
  InfrastructureCategory,
} from '@/lib/infrastructure';
export type MapCamera = {
  center: [number, number];
  zoom: number;
};
export type MapProps = {
  claimLocation?: (origin: MapProps['origin']) => boolean;
  facilities: Facility[];
  selected: Facility | null;
  exploreTarget?: Facility | null;
  onSelect: (f: Facility) => void;
  origin?: { latitude: number; longitude: number; accuracy: number } | null;
  mode?: 'facilities' | 'plots' | 'infrastructure';
  plots?: Plot[];
  selectedPlot?: Plot | null;
  onPlotSelect?: (plot: Plot) => void;
  infrastructure?: Infrastructure[];
  infrastructureCategories?: InfrastructureCategory[];
  selectedInfrastructure?: Infrastructure | null;
  onInfrastructureSelect?: (item: Infrastructure) => void;
};
export default function MapView(props: MapProps) {
  const [mode, setMode] = useState<'2d' | '3d'>('3d');
  const [basemap, setBasemap] = useState<'street' | 'satellite' | 'hybrid'>(
    'street',
  );
  const [fallback, setFallback] = useState('');
  const camera = useRef<MapCamera>({ center: [107.099, -6.297], zoom: 14 });
  const lastLocatedOrigin = useRef<MapProps['origin']>(null);
  const claimLocation = useCallback((origin: MapProps['origin']) => {
    if (lastLocatedOrigin.current === origin) return false;
    lastLocatedOrigin.current = origin;
    return true;
  }, []);
  return (
    <>
      {mode === '2d' || props.mode === 'infrastructure' ? (
        <LeafletMap
          {...props}
          camera={camera}
          claimLocation={claimLocation}
          basemap={basemap}
        />
      ) : (
        <Map3D
          {...props}
          camera={camera}
          claimLocation={claimLocation}
          onFallback={() => {
            setMode('2d');
            setFallback(
              'Mode 3D tidak dapat dijalankan. Peta 2D tetap tersedia.',
            );
          }}
        />
      )}
      <fieldset
        className="view-mode"
        aria-label="Mode tampilan peta"
        hidden={props.mode === 'infrastructure'}
      >
        <button
          aria-pressed={mode === '2d'}
          onClick={() => {
            setMode('2d');
            setFallback('');
          }}
        >
          <MapIcon size={15} />
          2D
        </button>
        <button
          aria-pressed={mode === '3d'}
          onClick={() => {
            setMode('3d');
            setFallback('');
          }}
        >
          <Box size={15} />
          3D
        </button>
      </fieldset>
      <fieldset className="basemap-mode" aria-label="Latar peta">
        {(['street', 'satellite', 'hybrid'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={basemap === value}
            onClick={() => {
              setBasemap(value);
              if (value !== 'street') setMode('2d');
            }}
          >
            {value === 'street' ? (
              <MapIcon size={14} />
            ) : (
              <Satellite size={14} />
            )}
            {value === 'street'
              ? 'Peta'
              : value === 'satellite'
                ? 'Satelit'
                : 'Hybrid'}
          </button>
        ))}
      </fieldset>
      {fallback && <output className="three-status">{fallback}</output>}
    </>
  );
}
