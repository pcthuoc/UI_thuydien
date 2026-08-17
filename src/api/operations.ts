/**
 * api/operations.ts
 * ─────────────────
 * Types và fetcher functions cho Operations API:
 *   GET /api/v1/operations/snapshot
 *   GET /api/v1/operations/timeseries
 */

import { api } from './index';

// ── Types ────────────────────────────────────────────────────────────────────

export type RainSource = 'measured' | 'meteoblue';
export type GranularityOption = 'auto' | '5m' | '15m' | '30m' | '1h' | '2h' | '6h' | '24h';
export type TimeframePreset =
  | '6h' | '12h' | '1d' | '3d' | '7d' | '10d' | '30d' | '90d'
  | 'realtime' | 'today' | 'custom';

/** Một điểm dữ liệu trong time series — bao gồm cả thực đo và dự báo. */
export interface TimeSeriesPoint {
  time: string;           // Label hiển thị trên trục X
  timestamp: string;      // ISO timestamp đầy đủ
  is_forecast: boolean;   // true = dự báo, false = thực đo
  z_ho: number;           // Mực nước hồ (m)
  z_haluu: number;        // Mực nước hạ lưu (m)
  q_vao: number;          // Lưu lượng vào hồ (m³/s)
  q_phat: number;         // Lưu lượng phát điện (m³/s)
  q_h1: number;           // Lưu lượng tổ máy H1 (m³/s)
  q_h2: number;           // Lưu lượng tổ máy H2 (m³/s)
  q_xa: number;           // Tổng lưu lượng xả (m³/s)
  q_tran: number;         // Lưu lượng tràn đập (m³/s)
  q_xtt: number;          // Lưu lượng xả thường xuyên (m³/s)
  mua: number;            // Lượng mưa 15 phút (mm)
  mua_cum: number;        // Lượng mưa tích lũy (mm)
  power_mw: number;       // Công suất phát điện (MW)
  balance: number;        // Cân bằng nước: Q_vào - Q_xả (m³/s)
}

/** Domains tính toán từ BE để căn chỉnh trục Y */
export interface TimeSeriesDomains {
  zMin: number;
  zMax: number;
  qMax: number;
  rainMax: number;
  rainCumMax: number;
}

/** Summary metadata từ BE */
export interface TimeSeriesSummary {
  start: string;
  end: string;
  step_minutes: number;
  step_hours: number;
  total_points: number;
  forecast_points: number;
  cum_rain_total: number;
}

/** Response từ /api/v1/operations/timeseries */
export interface TimeSeriesApiResponse {
  points: TimeSeriesPoint[];
  domains: TimeSeriesDomains;
  summary: TimeSeriesSummary;
}

/** Một item trong snapshot response */
export interface SnapshotItem {
  id: number;
  code: string;
  name: string;
  value: number | null;
  unit: string;
  measured_at: string | null;
  quality: 'good' | 'stale' | 'expired' | 'missing';
  kind: string;
  group: string;
  is_turbine: boolean;
  source_ref: string;
}

/** Response từ /api/v1/operations/snapshot */
export interface SnapshotApiResponse {
  data: SnapshotItem[];
  meta: {
    requested_codes: string[];
    returned: number;
    updated_at: string | null;
  };
}

// ── Query param builders ─────────────────────────────────────────────────────

export interface TimeseriesParams {
  preset: TimeframePreset;
  rainSource: RainSource;
  forecastDays: number;
  granularity: GranularityOption;
  fromDate?: string;
  toDate?: string;
}

export function buildTimeseriesQP(params: TimeseriesParams): string {
  const qp = new URLSearchParams();
  qp.set('preset', params.preset);
  qp.set('rain_source', params.rainSource);
  qp.set('forecast_days', String(params.forecastDays));
  qp.set('granularity', params.granularity);
  if (params.preset === 'custom' && params.fromDate && params.toDate) {
    qp.set('from', params.fromDate);
    qp.set('to', params.toDate);
  }
  return qp.toString();
}

// ── Fetcher functions ────────────────────────────────────────────────────────

/** Lấy time series thủy văn (quá khứ + dự báo) */
export async function fetchTimeseries(params: TimeseriesParams): Promise<TimeSeriesApiResponse> {
  const qs = buildTimeseriesQP(params);
  return api.request<TimeSeriesApiResponse>(`/operations/timeseries?${qs}`);
}

/** Lấy snapshot trạng thái tức thời */
export async function fetchSnapshot(siteId?: number): Promise<SnapshotApiResponse> {
  const qs = siteId ? `?site_id=${siteId}` : '';
  return api.request<SnapshotApiResponse>(`/operations/snapshot${qs}`);
}
