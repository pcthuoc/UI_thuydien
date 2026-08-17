import { api } from './client';

export interface TransmissionFactor {
  id: number;
  transmission_id: number;
  factor_type: string;
  factor_type_display: string;
  data_type: string;
  data_type_display: string;
  status: 'live' | 'test' | 'error' | string;
  status_display: string;
  symbol: string;
  symbol_type: string;
  symbol_type_display: string;
  sub_symbol: string;
  unit: string;
  data_format: string;
  data_format_display: string;
  transmission_objects: string[];
  latitude: number | null;
  longitude: number | null;
  last_connected_at: string | null;
  current_value: number | null;
  calculated_value_id: number | null;
  calculated_value_code: string | null;
  calculated_value_name: string | null;
  station_sensor_id: number | null;
  station_sensor_code: string | null;
  station_sensor_name: string | null;
}

export interface TransmissionFactorLog {
  id: number;
  factor_id: number | null;
  symbol: string;
  sub_symbol: string;
  factor_type_display: string;
  unit: string;
  value: number | null;
  status: string;
  status_display: string;
  error_message: string;
}

export interface TransmissionSession {
  id: number;
  transmission_id: number;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  status: 'pending' | 'success' | 'partial' | 'error' | string;
  status_display: string;
  triggered_by: string;
  total_factors: number;
  success_count: number;
  fail_count: number;
  skip_count: number;
  http_status_code: number | null;
  noi_dung: string;
  response_body: string;
  error_message: string;
  attempt_count: number;
  factor_logs?: TransmissionFactorLog[];
}

export interface DataTransmissionItem {
  id: number;
  name: string;
  receiver_type: string;
  receiver_type_display: string;
  province_code: string;
  plant_symbol: string;
  endpoint_url: string;
  username: string;
  interval_minutes: number;
  delay_minutes: number;
  is_active: boolean;
  last_transmission_at: string | null;
  last_transmission_status: boolean;
  created_at: string;
  updated_at: string;
  station_id: number;
  station_name: string;
  factors_count: number;
  factors: TransmissionFactor[];
  recent_sessions: TransmissionSession[];
}

export interface TransmissionMetadata {
  receiver_choices: { code: string; name: string }[];
  factor_type_choices: { code: string; name: string }[];
  data_type_choices: { code: string; name: string }[];
  status_choices: { code: string; name: string }[];
  symbol_type_choices: { code: string; name: string }[];
  data_format_choices: { code: string; name: string }[];
  trans_obj_choices: { code: string; name: string }[];
  symbol_type_obj_map: Record<string, string[]>;
  calculated_values: { id: number; code: string; name: string; unit: string; display_group: string }[];
  station_sensors: { id: number; station_id: number; station_name: string; sensor_code: string; name: string; unit: string }[];
}

export interface TransmissionCollectionResponse {
  items: DataTransmissionItem[];
  total: number;
  metadata: TransmissionMetadata;
}

export interface CreateTransmissionPayload {
  name: string;
  receiver_type: string;
  province_code?: string;
  plant_symbol?: string;
  endpoint_url?: string;
  username?: string;
  password?: string;
  interval_minutes?: number;
  delay_minutes?: number;
  is_active?: boolean;
}

export interface CreateFactorPayload {
  symbol: string;
  symbol_type: string;
  sub_symbol?: string;
  factor_type?: string;
  unit?: string;
  data_format?: string;
  transmission_objects?: string[];
  data_type?: string;
  status?: string;
  calculated_value_id?: number | null;
  station_sensor_id?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export const transmissionsApi = {
  fetchTransmissions: () => api.request<TransmissionCollectionResponse>('/transmissions'),
  fetchTransmissionDetail: (id: number) => api.request<DataTransmissionItem>(`/transmissions/${id}`),
  createTransmission: (payload: CreateTransmissionPayload) =>
    api.request<DataTransmissionItem>('/transmissions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateTransmission: (id: number, payload: Partial<CreateTransmissionPayload>) =>
    api.request<DataTransmissionItem>(`/transmissions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteTransmission: (id: number) =>
    api.request<{ message: string }>(`/transmissions/${id}`, { method: 'DELETE' }),
  toggleTransmission: (id: number) =>
    api.request<{ id: number; is_active: boolean; message: string }>(`/transmissions/${id}/toggle`, {
      method: 'POST',
    }),
  testTransmission: (id: number) =>
    api.request<{ message: string; stats?: any }>(`/transmissions/${id}/test`, {
      method: 'POST',
    }),
  backfillTransmission: (id: number, fromTime: string, toTime: string) =>
    api.request<{ message: string; total_runs: number }>(`/transmissions/${id}/backfill`, {
      method: 'POST',
      body: JSON.stringify({ from_time: fromTime, to_time: toTime }),
    }),
  createFactor: (transmissionId: number, payload: CreateFactorPayload) =>
    api.request<TransmissionFactor>(`/transmissions/${transmissionId}/factors`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateFactor: (transmissionId: number, factorId: number, payload: Partial<CreateFactorPayload>) =>
    api.request<TransmissionFactor>(`/transmissions/${transmissionId}/factors/${factorId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteFactor: (transmissionId: number, factorId: number) =>
    api.request<{ message: string }>(`/transmissions/${transmissionId}/factors/${factorId}`, {
      method: 'DELETE',
    }),
  fetchSessions: (transmissionId: number, page: number = 1, pageSize: number = 20) =>
    api.request<{ items: TransmissionSession[]; total: number; page: number; page_size: number }>(
      `/transmissions/${transmissionId}/sessions?page=${page}&page_size=${pageSize}`
    ),
  retrySession: (sessionId: number) =>
    api.request<{ message: string; stats?: any }>(`/transmissions/sessions/${sessionId}/retry`, {
      method: 'POST',
    }),
};
