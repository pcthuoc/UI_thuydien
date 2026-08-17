import { api } from './client';

export interface WatershedZone {
  id: number;
  name: string;
  color: string;
  coordinates: [number, number][];
  forecast_lat?: number | null;
  forecast_lon?: number | null;
}

export interface CreateWatershedPayload {
  name: string;
  color: string;
  coordinates: [number, number][];
}

export const watershedsApi = {
  /** Get all watershed zones */
  getAll: async (): Promise<WatershedZone[]> => {
    const res = await api.request<any>('/watersheds');
    if (Array.isArray(res?.data?.zones)) return res.data.zones;
    if (Array.isArray(res?.zones)) return res.zones;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res)) return res;
    return [];
  },

  /** Get detail of a specific watershed zone */
  getById: async (id: number): Promise<WatershedZone> => {
    const res = await api.request<any>(`/watersheds/${id}`);
    return res?.data || res;
  },

  /** Create a new watershed zone polygon */
  create: async (payload: CreateWatershedPayload): Promise<WatershedZone> => {
    const res = await api.request<any>('/watersheds', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res?.data || res;
  },

  /** Delete a watershed zone */
  delete: async (id: number): Promise<void> => {
    await api.request(`/watersheds/${id}`, { method: 'DELETE' });
  },

  /** Update forecast point location for a watershed */
  updateForecastPoint: async (zoneId: number, lat: number, lon: number): Promise<WatershedZone> => {
    const res = await api.request<any>(`/watersheds/${zoneId}/forecast-point`, {
      method: 'PATCH',
      body: JSON.stringify({ forecast_lat: lat, forecast_lon: lon }),
    });
    return res?.data || res;
  },
};

// ── SCS-CN Types ─────────────────────────────────────────────────────────────

export interface ScsCnParams {
  cn_input: number; cn_used: number; amc: string;
  area_km2: number; tc_hours: number; S_mm: number; Ia_mm: number;
}

export interface ScsCnTotals {
  total_precip_mm: number; total_runoff_mm: number;
  runoff_coeff: number; q_peak_m3s: number; q_avg_m3s: number;
}

export interface ReservoirWarning {
  hour: number; type: 'SPILL' | 'MNC_WARNING'; message: string;
}

export interface SimulationResult {
  time_steps: string[];
  z_sim: number[]; q_in_total: number[]; q_turb: number[];
  q_spill: number[]; power_mw: number[]; dv_m3: number[];
  warnings: ReservoirWarning[];
  z_min: number; z_max: number; z_final: number;
  vol_spill_total_m3: number; energy_mwh: number;
  z_mndbt: number; z_mnc: number;
}

export interface PlantParams {
  z_init: number; z_mndbt: number; z_mnc: number;
  nwl: number; dwl: number; z_tailwater: number;
  turbine_eta: number; p_rated: number; q_max_total: number;
}

export interface SimulateResponse {
  zone_id: number; zone_name: string; forecast_date: string;
  time: string[]; q_in_mode: 'scscn' | 'manual';
  schedule_mode: 'recommended' | 'manual'; explanation: string;
  precip_mm_hourly: number[];
  scscn: {
    params: ScsCnParams; totals: ScsCnTotals;
    q_runoff_mm: number[]; p_accum_mm: number[]; q_flow_m3s: number[];
  } | null;
  schedule_mw: number[];
  simulation: SimulationResult;
  plant_params: PlantParams;
}

export interface SimulatePayload {
  date?: string; z_init?: number; z_target?: number;
  q_in_mode: 'scscn' | 'manual';
  q_in_manual?: number; q_in_hourly?: number[];
  schedule_mode: 'recommended' | 'manual';
  recommend_mode?: 'evn_peak' | 'run_of_river' | 'flood_drawdown';
  schedule_mw_hourly?: number[];
  cn_override?: number; amc?: 'I' | 'II' | 'III';
  tc_hours?: number; area_km2?: number;
}

// ── SCS-CN API Functions ──────────────────────────────────────────────────────

export async function simulateReservoir(
  zoneId: number,
  payload: SimulatePayload,
): Promise<SimulateResponse> {
  const res = await api.request<any>(`/watersheds/${zoneId}/simulate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res?.data || res;
}

