import { api } from './client';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertSourceType = 'sensor' | 'calculated';
export type AlertCondition = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

export interface AlertRule {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  severity: AlertSeverity;
  source_type: AlertSourceType;
  // Sensor source
  station_id: number | null;
  station_name: string | null;
  station_device_id: string | null;
  channel_type: string;
  channel_code: string;
  // Calculated source
  calculated_value_id: number | null;
  calculated_value_code: string | null;
  calculated_value_name: string | null;
  calculated_value_unit: string | null;
  // Condition & Threshold
  condition: AlertCondition;
  condition_display: string;
  threshold: number;
  // Message & Cooldown
  message: string;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  is_in_cooldown: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertEvent {
  id: number;
  rule_id: number;
  rule_name: string;
  rule_severity: AlertSeverity;
  severity: AlertSeverity;
  triggered_at: string;
  value_at_trigger: number;
  message: string;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export interface AlertEventsResponse {
  items: AlertEvent[];
  total: number;
  unacknowledged: number;
}

export interface CreateAlertRulePayload {
  name: string;
  description?: string;
  is_active?: boolean;
  severity?: AlertSeverity;
  source_type?: AlertSourceType;
  station_id?: number | null;
  channel_type?: string;
  channel_code?: string;
  calculated_value_id?: number | null;
  condition?: AlertCondition;
  threshold: number;
  message: string;
  cooldown_minutes?: number;
}

export interface UpdateAlertRulePayload extends Partial<CreateAlertRulePayload> {}

export const alertsApi = {
  // ── Alert Rules ──
  getAlertRules: async (): Promise<AlertRule[]> => {
    const res = await api.request<any>('/alert-rules');
    return Array.isArray(res) ? res : res?.data || [];
  },

  getAlertRule: async (id: number): Promise<AlertRule> => {
    const res = await api.request<any>(`/alert-rules/${id}`);
    return res?.data ?? res;
  },

  createAlertRule: async (payload: CreateAlertRulePayload): Promise<AlertRule> => {
    const res = await api.request<any>('/alert-rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res?.data ?? res;
  },

  updateAlertRule: async (id: number, payload: UpdateAlertRulePayload): Promise<AlertRule> => {
    const res = await api.request<any>(`/alert-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res?.data ?? res;
  },

  deleteAlertRule: async (id: number): Promise<{ deleted: number }> => {
    const res = await api.request<any>(`/alert-rules/${id}`, {
      method: 'DELETE',
    });
    return res?.data ?? res;
  },

  toggleAlertRule: async (id: number): Promise<{ id: number; is_active: boolean; message: string }> => {
    const res = await api.request<any>(`/alert-rules/${id}/toggle`, {
      method: 'POST',
    });
    return res?.data ?? res;
  },

  // ── Alert Events ──
  getAlertEvents: async (params?: {
    rule_id?: number;
    acknowledged?: boolean;
    severity?: AlertSeverity;
    limit?: number;
  }): Promise<AlertEventsResponse> => {
    const qs = new URLSearchParams();
    if (params?.rule_id != null) qs.set('rule_id', String(params.rule_id));
    if (params?.acknowledged !== undefined) qs.set('acknowledged', String(params.acknowledged));
    if (params?.severity) qs.set('severity', params.severity);
    if (params?.limit) qs.set('limit', String(params.limit));

    const query = qs.toString();
    const endpoint = `/alert-events${query ? '?' + query : ''}`;
    
    // Note: Django API returns success(items, meta={ total, unacknowledged })
    // api.request unwraps json.data if present unless it has items & total
    const res = await api.request<any>(endpoint);

    if (Array.isArray(res)) {
      const unacked = res.filter((e: AlertEvent) => !e.is_acknowledged).length;
      return {
        items: res,
        total: res.length,
        unacknowledged: unacked,
      };
    }

    const items = res?.data || res?.items || [];
    const meta = res?.meta || {};
    return {
      items,
      total: meta.total ?? items.length,
      unacknowledged: meta.unacknowledged ?? items.filter((e: AlertEvent) => !e.is_acknowledged).length,
    };
  },

  getAlertEvent: async (id: number): Promise<AlertEvent> => {
    const res = await api.request<any>(`/alert-events/${id}`);
    return res?.data ?? res;
  },

  acknowledgeEvent: async (id: number): Promise<{ id: number; acknowledged: boolean }> => {
    const res = await api.request<any>(`/alert-events/${id}/acknowledge`, {
      method: 'POST',
    });
    return res?.data ?? res;
  },

  acknowledgeAllEvents: async (): Promise<{ acknowledged_count: number }> => {
    const res = await api.request<any>('/alert-events/acknowledge-all', {
      method: 'POST',
    });
    return res?.data ?? res;
  },
};
