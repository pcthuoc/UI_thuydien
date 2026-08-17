import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import {
  SlidersHorizontal,
  Save,
  RotateCcw,
  RefreshCw,
  Calculator,
  CloudRain,
  Power,
  Factory,
  Clock,
  X,
  ChevronDown,
  Search,
  CheckSquare,
  Square,
} from 'lucide-react';

interface ChoiceOption {
  value: any;
  label: string;
}

interface StationBrief {
  id: number;
  device_id: string;
  name: string;
  plant_code?: string;
  province_name?: string;
  province_code?: string;
  status?: string;
  is_online?: boolean;
}

interface RainfallResetRow {
  station_id: number;
  device_id: string;
  station_name: string;
  plant_code: string;
  status: 'acked' | 'pending' | 'failed' | 'not_sent' | string;
  retry_count: number;
  sent_at: string | null;
  acked_at: string | null;
  cmd_id: string | null;
}

interface AutoResetRow {
  station_id: number;
  device_id: string;
  station_name: string;
  plant_code: string;
  last_sent_at: string | null;
  success: boolean | null;
  source: 'auto' | 'manual' | string | null;
}

interface SiteProfileData {
  id: number;
  delta_t_seconds: number;
  moving_avg_points: number;
  negative_flow_handling: string;
  calc_interval_minutes: number;
  auto_reset_interval_minutes: number;
  rainfall_station_ids: number[];
  auto_reset_station_ids: number[];
  // Plant Specs
  nwl: number | null;
  dwl: number | null;
  dfwl: number | null;
  z_dam_crest: number | null;
  z_tailwater: number | null;
  turbine_count: number;
  q_max_total: number | null;
  p_rated: number | null;
  p_overload: number | null;
  turbine_eta: number | null;
  q_spill_design: number | null;
  watershed_area_km2: number | null;
  curve_number: number | null;
}

interface ProjectSettingsApiResponse {
  profile: SiteProfileData;
  choices?: {
    delta_t_choices?: ChoiceOption[];
    negative_flow_choices?: ChoiceOption[];
    calc_interval_choices?: ChoiceOption[];
    auto_reset_interval_choices?: ChoiceOption[];
  };
  all_stations?: StationBrief[];
  rainfall_reset_rows?: RainfallResetRow[];
  auto_reset_rows?: AutoResetRow[];
}

const DEFAULT_DELTA_T_CHOICES: ChoiceOption[] = [
  { value: 60, label: '1 phút (60s)' },
  { value: 300, label: '5 phút (300s)' },
  { value: 900, label: '15 phút (900s)' },
  { value: 1800, label: '30 phút (1800s)' },
  { value: 3600, label: '1 giờ (3600s)' },
];

const DEFAULT_NEGATIVE_FLOW_CHOICES: ChoiceOption[] = [
  { value: 'keep', label: 'Giữ nguyên giá trị âm' },
  { value: 'approximate', label: 'Gán bằng xấp xỉ giá trị dương gần nhất' },
  { value: 'zero', label: 'Gán bằng 0' },
];

const DEFAULT_CALC_INTERVAL_CHOICES: ChoiceOption[] = [
  { value: 1, label: '1 phút' },
  { value: 5, label: '5 phút' },
  { value: 10, label: '10 phút' },
  { value: 15, label: '15 phút' },
  { value: 30, label: '30 phút' },
  { value: 60, label: '60 phút (1 giờ)' },
];

const DEFAULT_AUTO_RESET_INTERVAL_CHOICES: ChoiceOption[] = [
  { value: 30, label: '30 phút' },
  { value: 60, label: '1 giờ (60 phút)' },
  { value: 120, label: '2 giờ (120 phút)' },
  { value: 180, label: '3 giờ (180 phút)' },
  { value: 240, label: '4 giờ (240 phút)' },
  { value: 300, label: '5 giờ (300 phút)' },
  { value: 360, label: '6 giờ (360 phút)' },
  { value: 720, label: '12 giờ (720 phút)' },
  { value: 1440, label: '24 giờ (1 ngày)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: Robust Station Multi-Select Dropdown
// ─────────────────────────────────────────────────────────────────────────────
interface StationMultiSelectProps {
  stations: StationBrief[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  badgeColor?: 'sky' | 'amber' | 'emerald';
}

function StationMultiSelect({
  stations,
  selectedIds,
  onChange,
  placeholder = 'Chọn trạm...',
  badgeColor = 'sky',
}: StationMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedSet = useMemo(() => new Set((selectedIds || []).map(Number)), [selectedIds]);

  const filteredStations = useMemo(() => {
    if (!searchTerm.trim()) return stations;
    const term = searchTerm.toLowerCase();
    return stations.filter(
      (st) =>
        (st.device_id && String(st.device_id).toLowerCase().includes(term)) ||
        (st.name && String(st.name).toLowerCase().includes(term)) ||
        (st.plant_code && String(st.plant_code).toLowerCase().includes(term))
    );
  }, [stations, searchTerm]);

  const toggleStation = (id: number) => {
    const numId = Number(id);
    const next = new Set(Array.from(selectedSet));
    if (next.has(numId)) {
      next.delete(numId);
    } else {
      next.add(numId);
    }
    onChange(Array.from(next));
  };

  const removeStation = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const numId = Number(id);
    const next = new Set(Array.from(selectedSet));
    next.delete(numId);
    onChange(Array.from(next));
  };

  const selectAll = () => {
    const allIds = stations.map((s) => Number(s.id));
    onChange(allIds);
  };

  const deselectAll = () => {
    onChange([]);
  };

  const badgeClass =
    badgeColor === 'amber'
      ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
      : badgeColor === 'emerald'
      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
      : 'bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30';

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Box display with tags and toggle */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="min-h-[42px] p-2 pr-9 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs cursor-pointer flex flex-wrap gap-1.5 items-center shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-200 dark:border-zinc-800/80"
      >
        {selectedIds.length === 0 ? (
          <span className="text-slate-400 dark:text-zinc-400 select-none">{placeholder}</span>
        ) : (
          stations
            .filter((st) => selectedSet.has(Number(st.id)))
            .map((st) => (
              <span
                key={`st-badge-${st.id}`}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border shadow-2xs ${badgeClass}`}
              >
                <span>{st.device_id}{st.name ? ` — ${st.name}` : ''}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => removeStation(e, st.id)}
                  className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                >
                  <X className="w-3 h-3 hover:text-rose-600" />
                </span>
              </span>
            ))
        )}
        <div className="absolute right-3 top-3 text-slate-400 pointer-events-none">
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search bar & quick actions */}
          <div className="p-2.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/50 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm trạm theo mã, tên..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] px-1">
              <span className="font-bold text-slate-500 dark:text-zinc-400">
                Đã chọn {selectedIds.length} / {stations.length} trạm
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAll();
                  }}
                  className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                >
                  Chọn tất cả
                </button>
                <span className="text-slate-300 dark:text-bambu-dark-tertiary">•</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deselectAll();
                  }}
                  className="text-rose-600 hover:text-rose-700 dark:text-rose-400 font-bold hover:underline cursor-pointer"
                >
                  Bỏ chọn tất cả
                </button>
              </div>
            </div>
          </div>

          {/* Items List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/60">
            {filteredStations.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 dark:text-zinc-400">
                Không tìm thấy trạm đo nào.
              </div>
            ) : (
              filteredStations.map((st) => {
                const isSelected = selectedSet.has(Number(st.id));
                const isOnline = Boolean(st.is_online || st.status === 'online');
                return (
                  <div
                    key={`station-opt-${st.id}`}
                    onClick={() => toggleStation(st.id)}
                    className={`p-2.5 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-slate-50 dark:bg-zinc-950/80 text-slate-900 dark:text-white font-bold'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-50/70 dark:bg-zinc-950/40 text-slate-700 dark:text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300 dark:text-bambu-dark-tertiary flex-shrink-0" />
                      )}
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                      <div className="truncate">
                        <span className="font-mono font-bold text-slate-900 dark:text-white mr-1.5">
                          {st.device_id}
                        </span>
                        {st.name && (
                          <span className="text-slate-600 dark:text-zinc-400 font-medium">
                            — {st.name}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                        Đã chọn
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT: ProjectSettingsPage
// ─────────────────────────────────────────────────────────────────────────────
export function ProjectSettingsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Local editable form state
  const [formData, setFormData] = useState<Partial<SiteProfileData>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Trigger loading states for manual resets
  const [actionLoadingStationId, setActionLoadingStationId] = useState<{ id: number; type: 'rain' | 'esp' } | null>(null);

  // 1. Fetch Project Settings API
  const { data: settingsData, isLoading: isSettingsLoading, isFetching, refetch } = useQuery<ProjectSettingsApiResponse>({
    queryKey: ['project-settings-data'],
    queryFn: async () => {
      const res = await api.request<any>('/project-settings');
      return res?.data ?? res;
    },
    refetchInterval: 30000,
  });

  // 2. Fetch Stations List (Guarantees stations exist even if project-settings is empty)
  const { data: rawStationsData } = useQuery({
    queryKey: ['stations-list'],
    queryFn: async () => {
      const res = await api.request<any>('/stations');
      if (Array.isArray(res)) return res as StationBrief[];
      if (Array.isArray(res?.items)) return res.items as StationBrief[];
      if (Array.isArray(res?.data?.items)) return res.data.items as StationBrief[];
      if (Array.isArray(res?.data)) return res.data as StationBrief[];
      return [] as StationBrief[];
    },
  });

  // Consolidated Stations List
  const allStations: StationBrief[] = useMemo(() => {
    if (Array.isArray(settingsData?.all_stations) && settingsData.all_stations.length > 0) {
      return settingsData.all_stations;
    }
    if (Array.isArray(rawStationsData) && rawStationsData.length > 0) {
      return rawStationsData;
    }
    return [];
  }, [rawStationsData, settingsData?.all_stations]);

  // Stations map for fast lookup
  const stationsMap = useMemo(() => {
    const map = new Map<number, StationBrief>();
    allStations.forEach((st) => {
      map.set(Number(st.id), st);
    });
    return map;
  }, [allStations]);

  // Sync initial or refetched data to local form
  useEffect(() => {
    if (settingsData?.profile) {
      setFormData(settingsData.profile);
      setIsDirty(false);
    }
  }, [settingsData?.profile]);

  const updateField = useCallback(<K extends keyof SiteProfileData>(key: K, value: SiteProfileData[K]) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      setIsDirty(true);
      return next;
    });
  }, []);

  // Save Settings Mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<SiteProfileData>) => {
      return api.request('/project-settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      showToast('Đã lưu cấu hình dự án thành công!', 'success');
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['project-settings-data'] });
    },
    onError: (err: any) => {
      showToast(`Không thể lưu cài đặt: ${err?.message || 'Lỗi không xác định'}`, 'error');
    },
  });

  // Manual Rainfall DI1 Reset Mutation
  const manualRainResetMutation = useMutation({
    mutationFn: async (stationId: number) => {
      setActionLoadingStationId({ id: stationId, type: 'rain' });
      return api.request(`/project-settings/rainfall-reset/${stationId}/manual`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      showToast('Đã gửi lệnh Reset DI1 tới trạm thành công!', 'success');
      queryClient.invalidateQueries({ queryKey: ['project-settings-data'] });
    },
    onError: (err: any) => {
      showToast(`Gửi lệnh reset DI1 thất bại: ${err?.message || 'Lỗi gửi lệnh'}`, 'error');
    },
    onSettled: () => {
      setActionLoadingStationId(null);
    },
  });

  // Manual ESP Reset Mutation
  const manualEspResetMutation = useMutation({
    mutationFn: async (stationId: number) => {
      setActionLoadingStationId({ id: stationId, type: 'esp' });
      return api.request(`/project-settings/auto-reset/${stationId}/manual`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      showToast('Đã gửi lệnh Khởi động lại (Reset ESP) tới trạm!', 'success');
      queryClient.invalidateQueries({ queryKey: ['project-settings-data'] });
    },
    onError: (err: any) => {
      showToast(`Gửi lệnh Reset ESP thất bại: ${err?.message || 'Lỗi gửi lệnh'}`, 'error');
    },
    onSettled: () => {
      setActionLoadingStationId(null);
    },
  });

  // Keyboard shortcut: Ctrl + S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveMutation.mutate(formData);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formData, saveMutation]);

  // Derived head calculation H = NWL - Z_tailwater
  const calculatedHead = useMemo(() => {
    const nwl = formData.nwl;
    const ztw = formData.z_tailwater;
    if (nwl != null && ztw != null && nwl > ztw) {
      return (nwl - ztw).toFixed(2);
    }
    return null;
  }, [formData.nwl, formData.z_tailwater]);

  const selectedRainfallIds = useMemo(() => (formData.rainfall_station_ids || []).map(Number), [formData.rainfall_station_ids]);
  const selectedAutoResetIds = useMemo(() => (formData.auto_reset_station_ids || []).map(Number), [formData.auto_reset_station_ids]);

  const negativeFlowChoices = useMemo(() => {
    return settingsData?.choices?.negative_flow_choices?.length
      ? settingsData.choices.negative_flow_choices
      : DEFAULT_NEGATIVE_FLOW_CHOICES;
  }, [settingsData?.choices?.negative_flow_choices]);

  const calcIntervalChoices = useMemo(() => {
    return settingsData?.choices?.calc_interval_choices?.length
      ? settingsData.choices.calc_interval_choices
      : DEFAULT_CALC_INTERVAL_CHOICES;
  }, [settingsData?.choices?.calc_interval_choices]);

  const autoResetIntervalChoices = useMemo(() => {
    return settingsData?.choices?.auto_reset_interval_choices?.length
      ? settingsData.choices.auto_reset_interval_choices
      : DEFAULT_AUTO_RESET_INTERVAL_CHOICES;
  }, [settingsData?.choices?.auto_reset_interval_choices]);

  // Display rows for Rainfall Reset
  const rainfallDisplayRows = useMemo(() => {
    return selectedRainfallIds.map((id) => {
      const st = stationsMap.get(id) || {
        id,
        device_id: `Trạm #${id}`,
        name: '',
      };
      const log = settingsData?.rainfall_reset_rows?.find((r) => Number(r.station_id) === id);
      return {
        station: st,
        status: log?.status || 'not_sent',
        retry_count: log?.retry_count ?? 0,
        sent_at: log?.sent_at || null,
        acked_at: log?.acked_at || null,
      };
    });
  }, [selectedRainfallIds, stationsMap, settingsData?.rainfall_reset_rows]);

  // Display rows for Auto-Reset
  const autoResetDisplayRows = useMemo(() => {
    return selectedAutoResetIds.map((id) => {
      const st = stationsMap.get(id) || {
        id,
        device_id: `Trạm #${id}`,
        name: '',
      };
      const log = settingsData?.auto_reset_rows?.find((r) => Number(r.station_id) === id);
      return {
        station: st,
        last_sent_at: log?.last_sent_at || null,
        success: log?.success ?? null,
        source: log?.source || null,
      };
    });
  }, [selectedAutoResetIds, stationsMap, settingsData?.auto_reset_rows]);

  if (isSettingsLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-semibold text-slate-500 dark:text-zinc-400">Đang tải cấu hình dự án...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto px-2 sm:px-4">
      {/* ── HEADER BANNER ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 shadow-xs">
              <SlidersHorizontal className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Cài Đặt Dự Án
            </h1>
            {isDirty && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 animate-pulse">
                Có thay đổi chưa lưu
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-zinc-800 bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-700 dark:text-white transition shadow-xs cursor-pointer"
            title="Làm mới dữ liệu từ máy chủ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Làm mới
          </button>

          {isDirty && (
            <button
              onClick={() => {
                if (settingsData?.profile) {
                  setFormData(settingsData.profile);
                  setIsDirty(false);
                  showToast('Đã hoàn tác các thay đổi', 'info');
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-zinc-800 bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 transition shadow-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Hoàn tác
            </button>
          )}

          <button
            onClick={() => saveMutation.mutate(formData)}
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md shadow-emerald-500/20 active:scale-95 cursor-pointer"
          >
            {saveMutation.isPending ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4 text-white" />
            )}
            Lưu tất cả (Ctrl+S)
          </button>
        </div>
      </div>

      {/* ── 2-COLUMN MAIN LAYOUT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ═══════════════════════════════════════════════════════════════════════
            CỘT TRÁI: CÀI ĐẶT HỆ THỐNG, TÍNH TOÁN, MƯA & AUTO-RESET
        ═══════════════════════════════════════════════════════════════════════ */}
        <div className="space-y-6">

          {/* Section 1: Tính toán lưu lượng vào hồ (Q vào) */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-5 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-zinc-800/60 pb-3">
              <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Calculator className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Tính toán lưu lượng vào hồ (Q vào)
              </h2>
            </div>

            {/* Field: Δt */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Δt trong công thức cân bằng nước (giây)
                </label>
                <div className="flex items-center gap-1">
                  {DEFAULT_DELTA_T_CHOICES.slice(0, 3).map((c) => (
                    <button
                      key={`dt-preset-${c.value}`}
                      type="button"
                      onClick={() => updateField('delta_t_seconds', c.value)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        formData.delta_t_seconds === c.value
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800'
                      }`}
                    >
                      {c.value}s
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min={60}
                max={86400}
                step={60}
                value={formData.delta_t_seconds ?? 900}
                onChange={(e) => updateField('delta_t_seconds', Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all shadow-xs"
              />
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                Khoảng thời gian giữa V(t) và V(t-1) trong công thức:{' '}
                <code className="bg-slate-100 dark:bg-zinc-950 px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                  Q vào = (V(t) − V(t-1)) / Δt + Q phát + Q xả
                </code>. Ví dụ: 900 = 15 phút, 300 = 5 phút, 60 = 1 phút.
              </p>
            </div>

            {/* Field: Số điểm trung bình trượt */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Số điểm tính lưu lượng trung bình trượt
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={formData.moving_avg_points ?? 1}
                onChange={(e) => updateField('moving_avg_points', Math.max(1, Number(e.target.value)))}
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all shadow-xs"
              />
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Số điểm Q vào dùng để tính trung bình trượt (Q vào tbt). Giá trị = 1 nghĩa là không làm trơn.
              </p>
            </div>

            {/* Field: Phương pháp xử lý lưu lượng vào sau khi tính toán */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Phương pháp xử lý lưu lượng vào sau khi tính toán
              </label>
              <select
                value={formData.negative_flow_handling || 'approximate'}
                onChange={(e) => updateField('negative_flow_handling', e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all shadow-xs"
              >
                {negativeFlowChoices.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Xử lý khi Q vào tính ra giá trị âm (do dao động mực nước).
              </p>
            </div>

            <div className="h-px bg-slate-100 dark:bg-zinc-950-tertiary/60 my-4" />

            {/* Section 1.2: Engine tính toán */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                  Engine tính toán
                </h3>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Chu kỳ chạy engine tính toán
                </label>
                <select
                  value={formData.calc_interval_minutes ?? 15}
                  onChange={(e) => updateField('calc_interval_minutes', Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all shadow-xs"
                >
                  {calcIntervalChoices.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Tần suất tính toán các giá trị dẫn xuất. Khuyến nghị đặt bằng chu kỳ gửi dữ liệu của thiết bị.
                </p>
              </div>
            </div>

            <div className="h-px bg-slate-100 dark:bg-zinc-950-tertiary/60 my-4" />

            {/* Section 1.3: Cảm biến mưa — Reset lúc 0h */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                  Cảm biến mưa — Reset lúc 0h
                </h3>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Trạm có cảm biến mưa (DI1) cần reset về 0 lúc 00:00
                </label>

                {/* Station Multi-Select */}
                <StationMultiSelect
                  stations={allStations}
                  selectedIds={selectedRainfallIds}
                  onChange={(ids) => updateField('rainfall_station_ids', ids)}
                  placeholder="Chọn trạm đo mưa..."
                  badgeColor="sky"
                />

                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Click để mở danh sách, click lại để bỏ chọn trạm.
                </p>
              </div>

              {/* Table: Trạng thái reset hôm nay */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Trạng thái reset hôm nay
                </label>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-[11px]">
                        <th className="py-2.5 px-3">Trạm</th>
                        <th className="py-2.5 px-3">Trạng thái</th>
                        <th className="py-2.5 px-3 text-center">Lần thử</th>
                        <th className="py-2.5 px-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                      {rainfallDisplayRows.map(({ station: st, status, retry_count }) => {
                        const isActing = actionLoadingStationId?.id === st.id && actionLoadingStationId?.type === 'rain';

                        return (
                          <tr key={`rf-row-${st.id}`} className="hover:bg-slate-50/50 dark:hover:bg-white dark:bg-zinc-950/50 text-slate-800 dark:text-white">
                            <td className="py-2 px-3 font-bold">
                              <div>{st.device_id}</div>
                              {st.name && <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-normal">{st.name}</div>}
                            </td>
                            <td className="py-2 px-3">
                              {status === 'acked' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                                  ✓ Đã xác nhận
                                </span>
                              ) : status === 'failed' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
                                  ✕ Thất bại
                                </span>
                              ) : status === 'pending' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 animate-pulse">
                                  Đang chờ ack
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800">
                                  Chưa gửi
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center font-mono">
                              {retry_count > 0 ? retry_count : '—'}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => manualRainResetMutation.mutate(st.id)}
                                disabled={isActing}
                                className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white dark:bg-sky-500/15 dark:hover:bg-sky-600 dark:text-sky-400 dark:hover:text-white border border-sky-200 dark:border-sky-500/30 text-[11px] font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                {isActing ? (
                                  <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3 h-3 text-current" />
                                )}
                                Reset thủ công
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {rainfallDisplayRows.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400 dark:text-zinc-400">
                            Chưa chọn trạm đo mưa nào.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100 dark:bg-zinc-950-tertiary/60 my-4" />

            {/* Section 1.4: Tự động reset ESP theo chu kỳ */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Power className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                  Tự động reset ESP theo chu kỳ
                </h3>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Trạm cần tự động reset ESP
                </label>

                {/* Station Multi-Select */}
                <StationMultiSelect
                  stations={allStations}
                  selectedIds={selectedAutoResetIds}
                  onChange={(ids) => updateField('auto_reset_station_ids', ids)}
                  placeholder="Chọn trạm reset định kỳ..."
                  badgeColor="amber"
                />

                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Click để mở danh sách, click lại để bỏ chọn.
                </p>
              </div>

              {/* Chu kỳ reset */}
              <div className="space-y-1.5 max-w-xs">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Chu kỳ reset (áp dụng cho tất cả trạm đã chọn)
                </label>
                <select
                  value={formData.auto_reset_interval_minutes ?? 60}
                  onChange={(e) => updateField('auto_reset_interval_minutes', Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all shadow-xs"
                >
                  {autoResetIntervalChoices.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Hệ thống tự cập nhật lịch Celery Beat khi bấm Cập nhật.
                </p>
              </div>

              {/* Table: Trạng thái reset gần nhất */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Trạng thái reset hôm nay
                </label>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-[11px]">
                        <th className="py-2.5 px-3">Trạm</th>
                        <th className="py-2.5 px-3">Reset lần cuối</th>
                        <th className="py-2.5 px-3 text-center">Nguồn</th>
                        <th className="py-2.5 px-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                      {autoResetDisplayRows.map(({ station: st, last_sent_at, success, source }) => {
                        const isActing = actionLoadingStationId?.id === st.id && actionLoadingStationId?.type === 'esp';

                        return (
                          <tr key={`ar-row-${st.id}`} className="hover:bg-slate-50/50 dark:hover:bg-white dark:bg-zinc-950/50 text-slate-800 dark:text-white">
                            <td className="py-2 px-3 font-bold">
                              <div>{st.device_id}</div>
                              {st.name && <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-normal">{st.name}</div>}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px]">
                              {last_sent_at ? (
                                <div>
                                  <span>{new Date(last_sent_at).toLocaleString('vi-VN')}</span>
                                  {success === false && (
                                    <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                                      Thất bại
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 dark:text-zinc-400">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {source === 'manual' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-zinc-950 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800">
                                  Thủ công
                                </span>
                              ) : source ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                                  Tự động
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-zinc-400">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => manualEspResetMutation.mutate(st.id)}
                                disabled={isActing}
                                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-600 text-amber-700 hover:text-white dark:bg-amber-500/15 dark:hover:bg-amber-600 dark:text-amber-400 dark:hover:text-white border border-amber-200 dark:border-amber-500/30 text-[11px] font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                {isActing ? (
                                  <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Power className="w-3 h-3 text-current" />
                                )}
                                Reset ngay
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {autoResetDisplayRows.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400 dark:text-zinc-400">
                            Chưa chọn trạm nào.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Nút lưu riêng cột trái */}
            <div className="pt-4 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-zinc-400">
                Áp dụng các tham số hệ thống & engine
              </span>
              <button
                type="button"
                onClick={() => saveMutation.mutate(formData)}
                disabled={saveMutation.isPending}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-white" />
                Cập nhật Cài đặt Hệ thống
              </button>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            CỘT PHẢI: THÔNG SỐ KỸ THUẬT NHÀ MÁY THỦY ĐIỆN
        ═══════════════════════════════════════════════════════════════════════ */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400">
                  <Factory className="w-4 h-4" />
                </span>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Thông số kỹ thuật nhà máy thủy điện
                </h2>
              </div>
            </div>

            {/* Nhóm 1: Cao trình vận hành */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center justify-between">
                <span>Cao trình vận hành (m)</span>
                {calculatedHead && (
                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold lowercase">
                    (H = NWL − Z_HL = {calculatedHead} m)
                  </span>
                )}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* NWL */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    NWL <span className="text-[10px] text-slate-500 font-normal">— Mực nước bình thường</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="VD: 970"
                    value={formData.nwl ?? ''}
                    onChange={(e) => updateField('nwl', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>

                {/* DWL */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    DWL <span className="text-[10px] text-slate-500 font-normal">— Mực nước chết</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="VD: 942"
                    value={formData.dwl ?? ''}
                    onChange={(e) => updateField('dwl', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>

                {/* DFWL */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    DFWL <span className="text-[10px] text-slate-500 font-normal">— Mực nước lũ thiết kế</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="VD: 974"
                    value={formData.dfwl ?? ''}
                    onChange={(e) => updateField('dfwl', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>

                {/* Đỉnh đập */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Đỉnh đập (m)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="VD: 977"
                    value={formData.z_dam_crest ?? ''}
                    onChange={(e) => updateField('z_dam_crest', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>

                {/* Mực nước hạ lưu */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Mực nước hạ lưu Z_HL (m) <span className="text-[10px] text-slate-500 font-normal">— H = NWL − Z_hạlưu</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="VD: 805.759"
                    value={formData.z_tailwater ?? ''}
                    onChange={(e) => updateField('z_tailwater', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100 dark:bg-zinc-950-tertiary/60 my-4" />

            {/* Nhóm 2: Tua-bin & phát điện */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                Tua-bin & phát điện
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Số tổ máy */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Số tổ máy
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.turbine_count ?? 2}
                    onChange={(e) => updateField('turbine_count', Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>

                {/* Qmax tổng */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Q<sub>max</sub> tổng (m³/s)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="VD: 10"
                    value={formData.q_max_total ?? ''}
                    onChange={(e) => updateField('q_max_total', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>

                {/* Công suất định mức */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Công suất định mức (MW)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="VD: 12"
                    value={formData.p_rated ?? ''}
                    onChange={(e) => updateField('p_rated', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>

                {/* Công suất vượt tải */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Công suất vượt tải (MW)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="VD: 13.2"
                    value={formData.p_overload ?? ''}
                    onChange={(e) => updateField('p_overload', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>

                {/* Hiệu suất η */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Hiệu suất η
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min={0.1}
                    max={1}
                    placeholder="VD: 0.9"
                    value={formData.turbine_eta ?? 0.9}
                    onChange={(e) => updateField('turbine_eta', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>

                {/* Q xả đập thiết kế */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Q xả đập thiết kế (m³/s)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="VD: 0.502"
                    value={formData.q_spill_design ?? ''}
                    onChange={(e) => updateField('q_spill_design', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100 dark:bg-zinc-950-tertiary/60 my-4" />

            {/* Nhóm 3: Lưu vực — Dự báo dòng chảy (SCS-CN) */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                Lưu vực — Dự báo dòng chảy (SCS-CN)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Diện tích lưu vực */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Diện tích lưu vực (km²)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="VD: 45.8"
                    value={formData.watershed_area_km2 ?? ''}
                    onChange={(e) => updateField('watershed_area_km2', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>

                {/* Curve Number */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Curve Number (CN)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={30}
                    max={100}
                    placeholder="VD: 75.0"
                    value={formData.curve_number ?? ''}
                    onChange={(e) => updateField('curve_number', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
                  />
                </div>
              </div>
            </div>

            {/* Nút lưu riêng cột phải */}
            <div className="pt-4 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-zinc-400">
                Lưu toàn bộ thông số kỹ thuật đập & hồ chứa
              </span>
              <button
                type="button"
                onClick={() => saveMutation.mutate(formData)}
                disabled={saveMutation.isPending}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-white" />
                Cập nhật Thông số Nhà máy
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
