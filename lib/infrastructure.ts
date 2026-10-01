export type InfrastructureCategory = {
  id: string;
  label: string;
  color: string;
};

export type Infrastructure = {
  id: string;
  name: string;
  category: string;
  geometry_type: 'point' | 'line';
  status: 'published';
  condition?: 'ok' | 'not_ok';
  length_m?: number | null;
  description: string;
  source: string;
  verified_at: string | null;
  coordinates: [number, number][];
};
