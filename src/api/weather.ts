import { api } from './client';

export interface WeatherData {
  time?: string[];
  models?: string[];
  precipitation?: number[][];
  temperature?: number[][];
  source?: string;
  lat?: number;
  lon?: number;
}

export const weatherApi = {
  /** Get Meteoblue weather forecast for a watershed zone */
  getWatershedForecast: async (zoneId: number): Promise<WeatherData> => {
    const res = await api.request<any>(`/watersheds/${zoneId}/weather`);
    return res?.data || res;
  },

  /** Get point weather forecast by coordinates */
  getPointForecast: async (lat: number, lon: number): Promise<WeatherData> => {
    const res = await api.request<any>(`/weather/forecast?lat=${lat}&lon=${lon}`);
    return res?.data || res;
  },
};
