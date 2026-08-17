import { api } from './client';

export interface StationSensor {
  id: number;
  sensor_type: string;
  name: string;
  unit: string;
  last_value?: number | null;
  last_measured_at?: string | null;
  is_online?: boolean;
}

export interface Station {
  id: number;
  name: string;
  device_id?: string;
  plant_code: string;
  province_code: string;
  province_name?: string;
  latitude: number | string | null;
  longitude: number | string | null;
  status: 'online' | 'warning' | 'offline' | string;
  is_online?: boolean;
  station_status?: string;
  last_seen_at?: string | null;
  sensor_total_count?: number;
  sensor_online_count?: number;
  sensors?: StationSensor[];
  // Detail fields
  mqtt_password_set?: boolean;
  mqtt_password?: string;
  debug_mode?: boolean;
  firmware_version?: string;
  device?: {
    wifi_ssid?: string;
    mqtt_host?: string;
    mqtt_port?: number;
    firmware_version?: string;
  };
  ota?: {
    status?: string | null;
    progress?: number;
    message?: string | null;
    firmware_uploaded_at?: string | null;
    firmware_checksum?: string | null;
  };
}

export interface StationFilterParams {
  status?: string;
  province_code?: string;
  search?: string;
}

export const stationsApi = {
  /** Get list of all monitoring stations */
  getAll: async (params?: StationFilterParams): Promise<Station[]> => {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.province_code) query.append('province_code', params.province_code);
    if (params?.search) query.append('search', params.search);
    
    const qs = query.toString();
    const res = await api.request<any>(`/stations${qs ? `?${qs}` : ''}`);
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.stations)) return res.stations;
    if (Array.isArray(res?.data?.stations)) return res.data.stations;
    if (Array.isArray(res)) return res;
    return [];
  },

  /** Get detail of a specific station */
  getById: async (id: number): Promise<Station> => {
    const res = await api.request<any>(`/stations/${id}`);
    return res?.data || res;
  },

  /** Create a new station */
  create: async (data: Partial<Station>): Promise<Station> => {
    const res = await api.request<any>('/stations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res?.data || res;
  },

  /** Update station metadata */
  update: async (id: number, data: Partial<Station>): Promise<Station> => {
    const res = await api.request<any>(`/stations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res?.data || res;
  },

  /** Delete station */
  delete: async (id: number): Promise<void> => {
    await api.request(`/stations/${id}`, { method: 'DELETE' });
  },

  /** Get sensors attached to station (via workbench endpoint) */
  getSensors: async (stationId: number): Promise<StationSensor[]> => {
    const res = await api.request<any>(`/stations/${stationId}/workbench`);
    const data = res?.data || res;
    const channels: StationSensor[] = [];
    const typeMap: Record<string, string> = {
      analog_channels: 'analog',
      encoder_channels: 'encoder',
      digital_inputs: 'digital',
      rs485_bus1_sensors: 'rs485_1',
      rs485_bus2_sensors: 'rs485_2',
      modbus_tcp_sensors: 'modbus_tcp',
      iec62056_sensors: 'iec62056',
    };
    for (const [key, sensorType] of Object.entries(typeMap)) {
      for (const ch of data?.[key] ?? []) {
        const reading = data?.last_readings?.[sensorType]?.[ch.channel_code];
        channels.push({
          id: ch.id,
          sensor_type: sensorType,
          name: ch.display_name || ch.channel_code,
          unit: ch.unit || '',
          last_value: reading?.real ?? null,
          last_measured_at: reading?.ts ? reading.ts : null,
          is_online: reading != null,
        });
      }
    }
    return channels;
  },

  /** Push config to IoT station via MQTT */
  pushConfig: async (stationId: number): Promise<{ success: boolean; message: string }> => {
    const res = await api.request<any>(`/stations/${stationId}/cmd`, {
      method: 'POST',
      body: JSON.stringify({ action: 'sync_config' }),
    });
    return { success: res?.data?.ok ?? res?.ok ?? false, message: res?.data?.message || res?.message || '' };
  },

  /** Send control command to station */
  sendCmd: async (stationId: number, action: string, params?: Record<string, any>): Promise<any> => {
    return api.request(`/stations/${stationId}/cmd`, {
      method: 'POST',
      body: JSON.stringify({ action, ...params }),
    });
  },
};
