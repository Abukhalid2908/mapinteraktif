import type { Facility, Category } from './facilities';
import type { Plot } from './plots';
import type { Infrastructure, InfrastructureCategory } from './infrastructure';
export type Dataset = {
  schema_version: number;
  updated_at: string;
  authenticated?: boolean;
  account?: { email: string; role: string } | null;
  csrf?: string;
  facilities: Facility[];
  categories?: Category[];
  plots?: Plot[];
  infrastructure?: Infrastructure[];
  infrastructure_categories?: InfrastructureCategory[];
};
export function filterFacilities(
  rows: Facility[],
  query?: string,
  category?: string,
): Facility[];
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number;
export function navigationUrl(
  f: Facility,
  origin?: { latitude: number; longitude: number } | null,
): string;
export function streetViewUrl(f: Facility): string;
export function validateDataset(
  data: unknown,
  options?: { publicOnly?: boolean; clockSkewMs?: number },
): { errors: string[]; warnings: string[] };
export function publicDataset(data: Dataset): Dataset;
export function normalize(value: string): string;
