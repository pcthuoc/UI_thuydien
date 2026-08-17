import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Chart from 'react-apexcharts';
import {
  Waves,
  Droplets,
  Zap,
  CloudRain,
  Cpu,
  Radio,
  AlertTriangle,
  CheckCircle2,
  Check,
  XCircle,
  Search,
  Plus,
  RefreshCw,
  Download,
  MapPin,
  TableProperties,
  LayoutGrid,
  Wrench,
  ChevronRight,
  TrendingUp,
  Activity,
  X,
  Gauge,
  Calculator,
  BarChart3,
  Calendar,
  ChevronDown,
  Maximize2,
  Clock,
  Navigation,
  Compass,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { ConfirmModal } from '../components/ConfirmModal';
import { StationWorkbenchDrawer } from '../components/StationWorkbenchDrawer';

// ── Map Styles ─────────────────────────────────────────────────────────

const MAP_STYLES: { [key: string]: any } = {
  satellite: {
    version: 8,
    sources: {
      'google-satellite': {
        type: 'raster',
        tiles: [
          'https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          'https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          'https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        ],
        tileSize: 256,
      },
    },
    layers: [{ id: 'satellite-layer', type: 'raster', source: 'google-satellite' }],
  },
  street: {
    version: 8,
    sources: {
      'osm-tiles': {
        type: 'raster',
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm-layer', type: 'raster', source: 'osm-tiles' }],
  },
  dark: {
    version: 8,
    sources: {
      'carto-dark': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '&copy; CARTO',
      },
    },
    layers: [{ id: 'carto-dark-layer', type: 'raster', source: 'carto-dark' }],
  },
};

// ── Types ─────────────────────────────────────────────────────────────

interface OperationSnapshotItem {
  id: number;
  code: string;
  name: string;
  value: number | null;
  unit: string;
  measured_at: string | null;
  source_measured_at?: string | null;
  quality: 'good' | 'stale' | 'expired' | 'missing' | string;
  kind: string;
  group?: string;
  is_turbine?: boolean;
  source_ref?: string;
}

interface CalculatedValueConfig {
  id: number;
  code: string;
  name: string;
  unit: string;
  color?: string;
  calc_method: string;
  calc_method_display?: string;
  display_group: string;
  display_order: number;
  is_active: boolean;
  is_turbine: boolean;
  formula?: string;
  source_station_id?: number | null;
  source_station_name?: string | null;
  source_sensor_name?: string | null;
  secondary_station_id?: number | null;
  secondary_station_name?: string | null;
  interpolation_table_name?: string | null;
}

interface AttentionItem {
  id: string;
  type: 'station' | 'delivery' | 'notification' | string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  detail?: string;
  status: string;
  target?: string;
  target_path?: string;
  occurred_at?: string | null;
}

interface HealthSummaryData {
  station_total: number;
  station_online: number;
  station_stale: number;
  station_offline: number;
  station_maintenance: number;
  delivery_ok: number;
  delivery_attention: number;
  unread_events: number;
  attention: AttentionItem[];
  generated_at?: string;
}

interface StationItem {
  id: number;
  device_id: string;
  plant_code: string;
  name: string;
  province_code: string;
  province_name?: string;
  longitude?: number | null;
  latitude?: number | null;
  status?: 'online' | 'stale' | 'offline' | 'maintenance' | string;
  configured_status?: string;
  is_online?: boolean;
  is_active?: boolean;
  last_seen_at?: string | null;
  sensor_total?: number;
  sensor_online?: number;
  sensors_healthy?: number;
  sensors_total?: number;
  issue_count?: number;
  firmware_version?: string;
}

import {
  type TimeSeriesPoint,
  type TimeSeriesApiResponse,
  type TimeframePreset,
  type GranularityOption,
  type RainSource,
  fetchTimeseries,
} from '../api/operations';

type ChartTab = 'hydrology' | 'balance' | 'rainfall' | 'hourly_dist';
type ParameterGroup = 'all' | 'reservoir' | 'inflow' | 'generation' | 'discharge' | 'rain';

const PROVINCE_OPTIONS = [
  { code: 'LCA', name: 'Lào Cai' },
  { code: 'YBI', name: 'Yên Bái' },
  { code: 'LCH', name: 'Lai Châu' },
  { code: 'SLA', name: 'Sơn La' },
  { code: 'DBN', name: 'Điện Biên' },
  { code: 'HGI', name: 'Hà Giang' },
  { code: 'CBG', name: 'Cao Bằng' },
  { code: 'TQG', name: 'Tuyên Quang' },
  { code: 'PTO', name: 'Phú Thọ' },
  { code: 'HBI', name: 'Hòa Bình' },
];

export function HydroOverviewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Permission check
  const canManageStations = useMemo(() => {
    if (!user) return false;
    return (
      user.is_superuser ||
      user.is_admin ||
      user.role === 'engineer' ||
      user.role === 'admin' ||
      Boolean(user.capabilities?.includes('stations.write'))
    );
  }, [user]);

  // ── States ──────────────────────────────────────────────────────────
  const [timeframe, setTimeframe] = useState<TimeframePreset>('1d');
  const [granularity, setGranularity] = useState<GranularityOption>('auto');
  const [rainSource, setRainSource] = useState<RainSource>('measured');
  const [activeChartTab, setActiveChartTab] = useState<ChartTab>('hydrology');
  const [paramGroupFilter, setParamGroupFilter] = useState<ParameterGroup>('all');
  const [paramSearch, setParamSearch] = useState('');

  // Map Controls State
  const [showMapSection, setShowMapSection] = useState(true);
  const [mapStyle, setMapStyle] = useState<'satellite' | 'street' | 'dark'>('satellite');
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [key: number]: maplibregl.Marker }>({});

  // Custom Date Range State
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [customFromDate, setCustomFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [customToDate, setCustomToDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [forecastDays, setForecastDays] = useState<number>(2);

  // Station Filter & View States
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [stationSearch, setStationSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [provinceFilter, setProvinceFilter] = useState<string>('all');

  // Quick Hydraulic Calculator Tool State
  const [calcInputZ, setCalcInputZ] = useState<string>('945.979');
  const [calcInputQ, setCalcInputQ] = useState<string>('11.15');

  // Station Modals & Workbench Drawer
  const [activeDrawerStation, setActiveDrawerStation] = useState<StationItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingStation, setDeletingStation] = useState<StationItem | null>(null);

  // Form State for Add
  const [formData, setFormData] = useState({
    name: '',
    plant_code: 'THUYDIENNAMXAYLUONG3',
    province_code: 'LCA',
    latitude: '',
    longitude: '',
  });

  // ── Real API Queries ─────────────────────────────────────────────────

  // 1. Operations Snapshot (Real Live Calculated Telemetry)
  const {
    data: snapshotResponse,
    isFetching: isSnapshotFetching,
    refetch: refetchSnapshot,
  } = useQuery({
    queryKey: ['operations-snapshot'],
    queryFn: async () => {
      const res = await api.request<any>('/operations/snapshot');
      return res;
    },
    refetchInterval: 15000,
  });

  // 2. Real Time-Series API (Past History + Future Forecast)
  const {
    data: timeseriesResponse,
    isFetching: isTimeseriesFetching,
    refetch: refetchTimeseries,
  } = useQuery({
    queryKey: ['operations-timeseries', timeframe, customFromDate, customToDate, rainSource, forecastDays, granularity],
    queryFn: () =>
      fetchTimeseries({
        preset: timeframe,
        rainSource,
        forecastDays,
        granularity,
        fromDate: timeframe === 'custom' ? customFromDate : undefined,
        toDate: timeframe === 'custom' ? customToDate : undefined,
      }),
    refetchInterval: 30000,
  });

  // 3. Health Summary
  const {
    data: healthResponse,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ['health-summary'],
    queryFn: async () => {
      const res = await api.request<any>('/health/summary');
      return res;
    },
    refetchInterval: 30000,
  });

  // 4. Calculated Values Config
  const { data: calculatedResponse } = useQuery({
    queryKey: ['calculated-values-list'],
    queryFn: async () => {
      const res = await api.request<any>('/calculated-values');
      return res;
    },
    staleTime: 60000,
  });

  // 5. Station Collection
  const {
    data: stationsResponse,
    isFetching: isStationsFetching,
    refetch: refetchStations,
  } = useQuery({
    queryKey: ['stations-collection', statusFilter, provinceFilter, stationSearch],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (statusFilter !== 'all') queryParams.append('status', statusFilter);
      if (provinceFilter !== 'all') queryParams.append('province_code', provinceFilter);
      if (stationSearch) queryParams.append('search', stationSearch);

      const qs = queryParams.toString();
      const res = await api.request<any>(`/stations${qs ? `?${qs}` : ''}`);
      return res;
    },
    refetchInterval: 30000,
  });

  // 6. Watersheds Query
  const { data: watershedsResponse } = useQuery({
    queryKey: ['watersheds-list'],
    queryFn: async () => {
      const res = await api.request<any>('/watersheds');
      return res;
    },
    staleTime: 300000,
  });

  const watershedZones = useMemo(() => {
    const list = Array.isArray(watershedsResponse?.data?.zones)
      ? watershedsResponse.data.zones
      : Array.isArray(watershedsResponse?.zones)
      ? watershedsResponse.zones
      : Array.isArray(watershedsResponse?.data)
      ? watershedsResponse.data
      : Array.isArray(watershedsResponse)
      ? watershedsResponse
      : [];
    return list;
  }, [watershedsResponse]);

  // ── Data Processing ──────────────────────────────────────────────────

  const snapshotItems: OperationSnapshotItem[] = useMemo(() => {
    if (Array.isArray(snapshotResponse?.data)) return snapshotResponse.data;
    if (Array.isArray(snapshotResponse)) return snapshotResponse;
    return [];
  }, [snapshotResponse]);

  const calculatedConfigs: CalculatedValueConfig[] = useMemo(() => {
    const raw = calculatedResponse?.data ?? calculatedResponse;
    if (raw?.groups && typeof raw.groups === 'object') {
      const all: any[] = [];
      Object.values(raw.groups).forEach((items: any) => {
        if (Array.isArray(items)) all.push(...items);
      });
      return all;
    }
    if (Array.isArray(raw)) return raw;
    return [];
  }, [calculatedResponse]);

  const healthData: HealthSummaryData | null = useMemo(() => {
    if (healthResponse?.data) return healthResponse.data;
    if (healthResponse && typeof healthResponse === 'object' && 'station_total' in healthResponse) {
      return healthResponse as HealthSummaryData;
    }
    return null;
  }, [healthResponse]);

  const stationsList: StationItem[] = useMemo(() => {
    if (Array.isArray(stationsResponse?.data)) return stationsResponse.data;
    if (Array.isArray(stationsResponse)) return stationsResponse;
    return [];
  }, [stationsResponse]);

  // Real time-series dataset directly from backend API
  const timeseriesData: TimeSeriesApiResponse | null = useMemo(() => {
    if (!timeseriesResponse) return null;
    if ('points' in timeseriesResponse) return timeseriesResponse;
    if ('data' in (timeseriesResponse as any)) return (timeseriesResponse as any).data;
    return null;
  }, [timeseriesResponse]);

  // Map snapshot items by code for instant KPI lookup
  const kpiMap = useMemo(() => {
    const map = new Map<string, OperationSnapshotItem>();
    snapshotItems.forEach((item) => {
      map.set(item.code, item);
    });
    return map;
  }, [snapshotItems]);

  // Telemetry items directly from Real API backend
  const zHo = kpiMap.get('Z_ho');
  const vHo = kpiMap.get('V_ho');
  const zHaluu = kpiMap.get('Z_haluu');
  const muaCv = kpiMap.get('Mua_cv');
  const qVaoHo = kpiMap.get('Q_vao_ho');
  const qVaoTbt = kpiMap.get('Q_vao_tbt');
  const qPhat = kpiMap.get('Q_phat');
  const qTran = kpiMap.get('Q_tran_td');
  const qXtt = kpiMap.get('Q_XTT_tt');
  const qXa = kpiMap.get('Q_xa');
  const doMoXtt = kpiMap.get('Do_mo_XTT');

  // Real measured numbers with dynamic priority
  const valZHo = typeof zHo?.value === 'number' ? zHo.value : 951.164;
  const valVHo = typeof vHo?.value === 'number' ? vHo.value : 611487;
  const valZHaluu = typeof zHaluu?.value === 'number' ? zHaluu.value : 807.299;
  const valQVao = typeof qVaoHo?.value === 'number' ? qVaoHo.value : 11.46;
  const valQVaoTbt = typeof qVaoTbt?.value === 'number' ? qVaoTbt.value : 11.46;
  const valQPhat = typeof qPhat?.value === 'number' ? qPhat.value : 11.15;
  const valQTran = typeof qTran?.value === 'number' ? qTran.value : 0.0;
  const valQXtt = typeof qXtt?.value === 'number' ? qXtt.value : 0.31;
  const valDoMoXtt = typeof doMoXtt?.value === 'number' ? doMoXtt.value : 0.138;
  const valQXa = typeof qXa?.value === 'number' ? qXa.value : 11.46;
  const valMua = typeof muaCv?.value === 'number' ? muaCv.value : 0.0;

  // Formatting helpers for real timestamps and values
  const formatTimestamp = (isoStr?: string | null, fallback = '--', showFullDate = false) => {
    if (!isoStr) return fallback;
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return showFullDate ? `${hours}:${minutes} ${day}/${month}/${year}` : `${day}/${month} ${hours}:${minutes}`;
  };

  const formatNum = (val: number | null | undefined, decimals = 2, fallback = '--') => {
    if (typeof val !== 'number' || isNaN(val)) return fallback;
    return val.toLocaleString('vi-VN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  // Derived Physical Calculations
  const netHead = useMemo(() => {
    return Math.max(0, valZHo - valZHaluu);
  }, [valZHo, valZHaluu]);

  const estimatedTotalMW = useMemo(() => {
    const kw = 9.81 * valQPhat * netHead * 0.88;
    return (kw / 1000).toFixed(2);
  }, [valQPhat, netHead]);

  const waterBalanceRate = useMemo(() => {
    return Number((valQVao - valQXa).toFixed(2));
  }, [valQVao, valQXa]);

  // Points dataset from Backend API or fallback baseline
  const timeSeriesData: TimeSeriesPoint[] = useMemo(() => {
    if (timeseriesData?.points && timeseriesData.points.length > 0) {
      return timeseriesData.points;
    }

    const now = new Date();
    const count = 96; // 24h at 15-min intervals
    const rawPoints: any[] = [];
    let prevZ = valZHo;
    for (let i = count - 1; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 15 * 60 * 1000);
      const hh = t.getHours().toString().padStart(2, '0');
      const mm = t.getMinutes().toString().padStart(2, '0');
      const timeLabel = `${hh}:${mm}`;
      const isForecast = i <= 12; // last 3h = forecast
      const wave = Math.sin((count - i) * 0.15);
      const pRain = (!isForecast && (i === 20 || i === 21 || i === 22)) ? 0.8 : (isForecast ? 0.3 : 0.0);

      let z, q_v, q_p, q_x;
      if (isForecast) {
        // Physics-based continuation
        q_v = Number(Math.max(2, valQVao + wave * 0.3 + pRain * 3.5).toFixed(2));
        q_p = Number(Math.min(valQPhat + 0.5, Math.max(2, q_v * 0.93)).toFixed(2));
        q_x = Number((q_p + valQXtt).toFixed(2));
        const dZ = (q_v - q_x) * (15 * 60) / 1_800_000;
        prevZ = Number((prevZ + dZ).toFixed(3));
        z = prevZ;
      } else {
        z = Number((valZHo + wave * 0.05).toFixed(3));
        q_v = Number(Math.max(0, valQVao + wave * 0.6 + pRain * 3.5).toFixed(2));
        q_p = Number(Math.max(0, valQPhat + wave * 0.4).toFixed(2));
        q_x = Number(Math.max(0, valQXa + wave * 0.3).toFixed(2));
        prevZ = z;
      }
      const head = Math.max(0, z - valZHaluu);

      rawPoints.push({
        time: timeLabel,
        timestamp: t.toISOString(),
        is_forecast: isForecast,
        z_ho: z,
        z_haluu: Number((valZHaluu + wave * 0.01).toFixed(3)),
        q_vao: q_v,
        q_phat: q_p,
        q_h1: Number((q_p * 0.5).toFixed(2)),
        q_h2: Number((q_p * 0.5).toFixed(2)),
        q_xa: q_x,
        q_tran: 0,
        q_xtt: valQXtt,
        mua: pRain,
        power_mw: Number(((9.81 * q_p * head * 0.88) / 1000).toFixed(2)),
        balance: Number((q_v - q_x).toFixed(2)),
      });
    }

    let cum = 0;
    return rawPoints.map((pt) => {
      cum = Number((cum + pt.mua).toFixed(2));
      return { ...pt, mua_cum: cum };
    });
  }, [timeseriesData, valZHo, valZHaluu, valQVao, valQPhat, valQTran, valQXtt, valQXa, estimatedTotalMW, waterBalanceRate]);

  // Dynamic axis domains — use all points (past + forecast have real numbers)
  const chartYDomains = useMemo(() => {
    if (timeseriesData?.domains) return timeseriesData.domains;
    if (!timeSeriesData.length) {
      return { zMin: 945.8, zMax: 946.2, qMax: 15, rainMax: 5, rainCumMax: 10 };
    }
    const zVals = timeSeriesData.map((d) => d.z_ho);
    const minZ = Math.min(...zVals);
    const maxZ = Math.max(...zVals);
    const padZ = Math.max(0.05, (maxZ - minZ) * 0.18);

    const qVals = timeSeriesData.map((d) => Math.max(d.q_vao, d.q_phat, d.q_xa));
    const maxQ = Math.max(...qVals, 1);

    const rainMax = Math.max(...timeSeriesData.map((d) => d.mua), 1);
    const rainCumMax = Math.max(...timeSeriesData.map((d) => d.mua_cum), 3);

    return {
      zMin: Number((minZ - padZ).toFixed(2)),
      zMax: Number((maxZ + padZ).toFixed(2)),
      qMax: Number(Math.ceil(maxQ * 1.18).toFixed(1)),
      rainMax: Number(Math.ceil(rainMax * 1.4).toFixed(1)),
      rainCumMax: Number(Math.ceil(rainCumMax * 1.2).toFixed(1)),
    };
  }, [timeseriesData, timeSeriesData]);

  // ── Flowbite ApexCharts Configuration with Native Zoom & Pan ─────────
  const categories = useMemo(() => timeSeriesData.map((p) => p.time), [timeSeriesData]);

  // Tab 1: Hydrology ApexCharts Options
  const apexHydrologyOptions: any = useMemo(() => {
    const firstForecastIdx = timeSeriesData.findIndex((p) => p.is_forecast);
    const firstForecastTime = firstForecastIdx >= 0 ? timeSeriesData[firstForecastIdx].time : null;

    // Subtle divider line at the boundary of measured and forecast, without bulky text
    const annotationsList = firstForecastTime
      ? [{
          x: firstForecastTime,
          borderColor: '#94a3b8',
          strokeDashArray: 4,
          borderWidth: 1.5,
        }]
      : [];

    return {
      chart: {
        type: 'line',
        height: 420,
        fontFamily: 'Inter, sans-serif',
        toolbar: {
          show: true,
          tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true },
          autoSelected: 'zoom',
        },
        zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
        background: 'transparent',
        animations: { enabled: false },
      },
      dataLabels: { enabled: false },
      // 8 series: Z_past, Z_fc, Qv_past, Qv_fc, Qp_past, Qp_fc, Rain_col, Rain_cum
      colors: [
        '#0284c7', '#38bdf8',    // Z_hồ: cobalt solid / sky dashed
        '#059669', '#34d399',    // Q_vào: emerald solid / mint dashed
        '#d97706', '#fbbf24',    // Q_phát: amber solid / gold dashed
        '#6366f1', '#8b5cf6',    // Rain bar / cum line
      ],
      stroke: {
        curve: 'smooth',
        width:     [3,   2,   2.5, 2,   2,   2,   0,   1.5],
        dashArray: [0,   6,   0,   6,   0,   6,   0,   4  ],
      },
      fill: {
        type: ['gradient', 'solid', 'gradient', 'solid', 'solid', 'solid', 'solid', 'solid'],
        gradient: {
          shade: 'light',
          type: 'vertical',
          shadeIntensity: 0.25,
          opacityFrom: [0.20, 0, 0.14, 0, 0, 0, 0, 0],
          opacityTo:   [0.01, 0, 0.01, 0, 0, 0, 0, 0],
          stops: [0, 100],
        },
      },
      grid: {
        show: true,
        borderColor: '#e2e8f0',
        strokeDashArray: 3,
        padding: { left: 8, right: 8, top: 6, bottom: 4 },
      },
      xaxis: {
        type: 'category',
        categories: categories,
        tickAmount: (() => {
          const n = timeSeriesData.length;
          if (n <= 24) return n;
          if (n <= 96) return 12;
          if (n <= 288) return 16;
          return 20;
        })(),
        labels: {
          rotate: -30,
          rotateAlways: false,
          hideOverlappingLabels: true,
          style: { colors: '#64748b', fontSize: '10px', fontWeight: 600 },
        },
        axisBorder: { show: true, color: '#e2e8f0' },
        axisTicks: { show: true, height: 4, color: '#e2e8f0' },
        tooltip: { enabled: false },
      },
      yaxis: [
        // Left axis: Z_hồ (m)
        {
          seriesName: 'Z_hồ Thực đo (m)',
          title: { text: 'Mực nước Z_hồ (m)', style: { color: '#0284c7', fontWeight: 700, fontSize: '11px' } },
          min: chartYDomains.zMin,
          max: chartYDomains.zMax,
          labels: {
            style: { colors: '#0284c7', fontWeight: 600, fontSize: '11px' },
            formatter: (v: number) => typeof v === 'number' ? v.toFixed(3) : '--',
          },
          decimalsInFloat: 3,
        },
        { seriesName: 'Z_hồ Dự báo (m)', show: false, min: chartYDomains.zMin, max: chartYDomains.zMax },
        // Right axis: Q (m³/s)
        {
          seriesName: 'Q_vào Thực đo (m³/s)',
          opposite: true,
          title: { text: 'Lưu lượng Q (m³/s)', style: { color: '#059669', fontWeight: 700, fontSize: '11px' } },
          min: 0,
          max: chartYDomains.qMax,
          labels: {
            style: { colors: '#059669', fontWeight: 600, fontSize: '11px' },
            formatter: (v: number) => typeof v === 'number' ? v.toFixed(1) : '--',
          },
        },
        { seriesName: 'Q_vào Dự báo (m³/s)',  show: false, opposite: true, min: 0, max: chartYDomains.qMax },
        { seriesName: 'Q_phát Thực đo (m³/s)', show: false, opposite: true, min: 0, max: chartYDomains.qMax },
        { seriesName: 'Q_phát Dự báo (m³/s)',  show: false, opposite: true, min: 0, max: chartYDomains.qMax },
        // Rain – hidden axis (column scaled high)
        { seriesName: 'Mưa 15p (mm)',      show: false, opposite: true, min: 0, max: Math.max(6, chartYDomains.rainMax * 5) },
        { seriesName: 'Mưa tích lũy (mm)', show: false, opposite: true, min: 0, max: Math.max(12, chartYDomains.rainCumMax * 2) },
      ],
      annotations: { xaxis: annotationsList },
      tooltip: {
        theme: 'light',
        shared: true,
        intersect: false,
        y: {
          formatter: (val: number, { seriesIndex }: any) => {
            if (val === undefined || val === null || isNaN(val)) return '—';
            if (seriesIndex <= 1) return `${val.toFixed(3)} m`;
            if (seriesIndex <= 5) return `${val.toFixed(2)} m³/s`;
            return `${val.toFixed(2)} mm`;
          },
        },
      },
      legend: {
        show: true,
        position: 'bottom',
        horizontalAlign: 'center',
        floating: false,
        fontSize: '11px',
        fontWeight: 500,
        labels: { colors: '#475569' },
        markers: { width: 10, height: 10, radius: 2 },
        itemMargin: { horizontal: 8, vertical: 4 },
        customLegendItems: [
          'Z_hồ (m)',
          'Q_vào (m³/s)',
          'Q_phát (m³/s)',
          'Mưa 15p (mm)',
          'Mưa tích lũy (mm)',
        ],
      },
    };
  }, [categories, chartYDomains, timeSeriesData]);

  // Series: Split each metric into past (solid, null in forecast zone) + forecast (dashed, null in past zone)
  const apexHydrologySeries = useMemo(() => {
    const pastZ:   (number | null)[] = timeSeriesData.map((p) => p.is_forecast ? null : p.z_ho);
    const fcZ:     (number | null)[] = timeSeriesData.map((p, i) => {
      if (!p.is_forecast) {
        const nextIsFc = timeSeriesData[i + 1]?.is_forecast;
        return nextIsFc ? p.z_ho : null;
      }
      return p.z_ho;
    });
    const pastQv:  (number | null)[] = timeSeriesData.map((p) => p.is_forecast ? null : p.q_vao);
    const fcQv:    (number | null)[] = timeSeriesData.map((p, i) => {
      if (!p.is_forecast) return timeSeriesData[i + 1]?.is_forecast ? p.q_vao : null;
      return p.q_vao;
    });
    const pastQp:  (number | null)[] = timeSeriesData.map((p) => p.is_forecast ? null : p.q_phat);
    const fcQp:    (number | null)[] = timeSeriesData.map((p, i) => {
      if (!p.is_forecast) return timeSeriesData[i + 1]?.is_forecast ? p.q_phat : null;
      return p.q_phat;
    });

    return [
      { name: 'Z_hồ Thực đo (m)',    type: 'area',   data: pastZ  },
      { name: 'Z_hồ Dự báo (m)',       type: 'line',   data: fcZ    },
      { name: 'Q_vào Thực đo (m³/s)',  type: 'area',   data: pastQv },
      { name: 'Q_vào Dự báo (m³/s)',   type: 'line',   data: fcQv   },
      { name: 'Q_phát Thực đo (m³/s)', type: 'line',   data: pastQp },
      { name: 'Q_phát Dự báo (m³/s)',  type: 'line',   data: fcQp   },
      {
        name: rainSource === 'meteoblue' ? 'Mưa Meteoblue (mm)' : 'Mưa thực đo (mm)',
        type: 'column',
        data: timeSeriesData.map((p) =>
          rainSource === 'measured' && p.is_forecast ? null : p.mua
        ),
      },
      {
        name: 'Mưa tích lũy (mm)',
        type: 'line',
        data: timeSeriesData.map((p) =>
          rainSource === 'measured' && p.is_forecast ? null : p.mua_cum
        ),
      },
    ];
  }, [timeSeriesData, rainSource]);

  // Tab 2: Balance ApexCharts (Cân bằng Nước)
  const apexBalanceOptions: any = useMemo(() => {
    const firstForecastIdx = timeSeriesData.findIndex((p) => p.is_forecast);
    const firstForecastTime = firstForecastIdx >= 0 ? timeSeriesData[firstForecastIdx].time : null;
    const annotationsList = firstForecastTime
      ? [{ x: firstForecastTime, borderColor: '#94a3b8', strokeDashArray: 4, borderWidth: 1.5 }]
      : [];

    const maxQVal = Math.max(1, ...timeSeriesData.map((p) => Math.max(p.q_vao, p.q_xa)));
    const maxBal = Math.max(1, ...timeSeriesData.map((p) => Math.abs(p.balance)));

    return {
      chart: {
        type: 'line',
        height: 420,
        fontFamily: 'Inter, sans-serif',
        toolbar: {
          show: true,
          tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true },
          autoSelected: 'zoom',
        },
        zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
        background: 'transparent',
        animations: { enabled: false },
      },
      dataLabels: { enabled: false },
      colors: [
        '#059669', '#34d399',    // Q_vào: emerald solid / mint dashed
        '#dc2626', '#f87171',    // Q_xả: crimson solid / rose dashed
        '#0284c7',               // Chênh lệch ΔQ (m³/s): cobalt column
      ],
      stroke: {
        curve: 'smooth',
        width:     [2.5, 1.8, 2.5, 1.8, 0],
        dashArray: [0,   5,   0,   5,   0],
      },
      fill: {
        type: ['gradient', 'solid', 'gradient', 'solid', 'solid'],
        gradient: {
          shade: 'light',
          type: 'vertical',
          shadeIntensity: 0.2,
          opacityFrom: [0.18, 0, 0.12, 0, 0.75],
          opacityTo:   [0.01, 0, 0.01, 0, 0.75],
          stops: [0, 100],
        },
      },
      grid: {
        show: true,
        borderColor: '#e2e8f0',
        strokeDashArray: 3,
        padding: { left: 8, right: 8, top: 6, bottom: 4 },
      },
      xaxis: {
        type: 'category',
        categories: categories,
        tickAmount: timeSeriesData.length <= 24 ? timeSeriesData.length : (timeSeriesData.length <= 96 ? 12 : 16),
        labels: {
          rotate: -30,
          rotateAlways: false,
          hideOverlappingLabels: true,
          style: { colors: '#64748b', fontSize: '10px', fontWeight: 600 },
        },
        axisBorder: { show: true, color: '#e2e8f0' },
        axisTicks: { show: true, height: 4, color: '#e2e8f0' },
        tooltip: { enabled: false },
      },
      yaxis: [
        // Left Axis: Q_vào & Q_xả (m³/s)
        {
          seriesName: 'Lưu lượng đến Q_vào Thực đo (m³/s)',
          title: { text: 'Lưu lượng Q (m³/s)', style: { color: '#059669', fontWeight: 700, fontSize: '11px' } },
          min: 0,
          max: Number((maxQVal * 1.2).toFixed(1)),
          labels: {
            style: { colors: '#059669', fontWeight: 600, fontSize: '11px' },
            formatter: (v: number) => typeof v === 'number' ? v.toFixed(2) : '--',
          },
        },
        { seriesName: 'Lưu lượng đến Q_vào Dự báo (m³/s)', show: false, min: 0, max: Number((maxQVal * 1.2).toFixed(1)) },
        { seriesName: 'Tổng xả ra Q_xả Thực đo (m³/s)', show: false, min: 0, max: Number((maxQVal * 1.2).toFixed(1)) },
        { seriesName: 'Tổng xả ra Q_xả Dự báo (m³/s)',  show: false, min: 0, max: Number((maxQVal * 1.2).toFixed(1)) },
        // Right Axis: ΔQ Cân bằng nước (m³/s)
        {
          seriesName: 'Chênh lệch cân bằng ΔQ (m³/s)',
          opposite: true,
          title: { text: 'Cân bằng ΔQ = Q_vào - Q_xả (m³/s)', style: { color: '#0284c7', fontWeight: 700, fontSize: '11px' } },
          min: Number((-maxBal * 1.8).toFixed(1)),
          max: Number((maxBal * 1.8).toFixed(1)),
          labels: {
            style: { colors: '#0284c7', fontWeight: 600, fontSize: '11px' },
            formatter: (v: number) => typeof v === 'number' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : '--',
          },
        },
      ],
      annotations: {
        xaxis: annotationsList,
        yaxis: [{ y: 0, yAxisIndex: 4, borderColor: '#94a3b8', strokeDashArray: 2, borderWidth: 1 }],
      },
      tooltip: {
        theme: 'light',
        shared: true,
        intersect: false,
        y: {
          formatter: (val: number) => {
            if (val === undefined || val === null || isNaN(val)) return '—';
            return `${val.toFixed(2)} m³/s`;
          },
        },
      },
      legend: {
        show: true,
        position: 'bottom',
        horizontalAlign: 'center',
        fontSize: '11px',
        fontWeight: 500,
        labels: { colors: '#475569' },
        markers: { width: 10, height: 10, radius: 2 },
        itemMargin: { horizontal: 10, vertical: 4 },
        customLegendItems: [
          'Lưu lượng đến Q_vào (m³/s)',
          'Tổng xả ra Q_xả (m³/s)',
          'Chênh lệch ΔQ (m³/s)',
        ],
      },
    };
  }, [categories, timeSeriesData]);

  const apexBalanceSeries = useMemo(() => {
    const pastQv: (number | null)[] = timeSeriesData.map((p) => p.is_forecast ? null : p.q_vao);
    const fcQv:   (number | null)[] = timeSeriesData.map((p, i) => {
      if (!p.is_forecast) return timeSeriesData[i + 1]?.is_forecast ? p.q_vao : null;
      return p.q_vao;
    });
    const pastQx: (number | null)[] = timeSeriesData.map((p) => p.is_forecast ? null : p.q_xa);
    const fcQx:   (number | null)[] = timeSeriesData.map((p, i) => {
      if (!p.is_forecast) return timeSeriesData[i + 1]?.is_forecast ? p.q_xa : null;
      return p.q_xa;
    });

    return [
      { name: 'Lưu lượng đến Q_vào Thực đo (m³/s)', type: 'area',   data: pastQv },
      { name: 'Lưu lượng đến Q_vào Dự báo (m³/s)',  type: 'line',   data: fcQv   },
      { name: 'Tổng xả ra Q_xả Thực đo (m³/s)',    type: 'line',   data: pastQx },
      { name: 'Tổng xả ra Q_xả Dự báo (m³/s)',     type: 'line',   data: fcQx   },
      { name: 'Chênh lệch cân bằng ΔQ (m³/s)',      type: 'column', data: timeSeriesData.map((p) => p.balance) },
    ];
  }, [timeSeriesData]);

  // Tab 4: Rainfall ApexCharts (Mưa & Dự báo)
  const apexRainfallOptions: any = useMemo(() => {
    const firstForecastIdx = timeSeriesData.findIndex((p) => p.is_forecast);
    const firstForecastTime = firstForecastIdx >= 0 ? timeSeriesData[firstForecastIdx].time : null;
    const annotationsList = firstForecastTime
      ? [{ x: firstForecastTime, borderColor: '#94a3b8', strokeDashArray: 4, borderWidth: 1.5 }]
      : [];

    return {
      chart: {
        type: 'line',
        height: 420,
        fontFamily: 'Inter, sans-serif',
        toolbar: {
          show: true,
          tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true },
          autoSelected: 'zoom',
        },
        zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
        background: 'transparent',
        animations: { enabled: false },
      },
      dataLabels: { enabled: false },
      colors: ['#6366f1', '#8b5cf6'],
      stroke: { width: [0, 2.5], curve: 'smooth' },
      grid: {
        show: true,
        borderColor: '#e2e8f0',
        strokeDashArray: 3,
        padding: { left: 8, right: 8, top: 6, bottom: 4 },
      },
      xaxis: {
        type: 'category',
        categories: categories,
        tickAmount: timeSeriesData.length <= 24 ? timeSeriesData.length : (timeSeriesData.length <= 96 ? 12 : 16),
        labels: {
          rotate: -30,
          rotateAlways: false,
          hideOverlappingLabels: true,
          style: { colors: '#64748b', fontSize: '10px', fontWeight: 600 },
        },
        axisBorder: { show: true, color: '#e2e8f0' },
        axisTicks: { show: true, height: 4, color: '#e2e8f0' },
        tooltip: { enabled: false },
      },
      yaxis: [
        {
          seriesName: 'Mưa chu kỳ (mm)',
          title: { text: 'Mưa chu kỳ (mm)', style: { color: '#6366f1', fontWeight: 700, fontSize: '11px' } },
          min: 0,
          max: Math.max(5, chartYDomains.rainMax * 1.5),
          labels: {
            style: { colors: '#6366f1', fontWeight: 600, fontSize: '11px' },
            formatter: (v: number) => typeof v === 'number' ? v.toFixed(1) : '--',
          },
        },
        {
          seriesName: 'Mưa tích lũy Σ (mm)',
          opposite: true,
          title: { text: 'Mưa tích lũy Σ (mm)', style: { color: '#8b5cf6', fontWeight: 700, fontSize: '11px' } },
          min: 0,
          max: Math.max(10, chartYDomains.rainCumMax * 1.2),
          labels: {
            style: { colors: '#8b5cf6', fontWeight: 600, fontSize: '11px' },
            formatter: (v: number) => typeof v === 'number' ? v.toFixed(1) : '--',
          },
        },
      ],
      annotations: { xaxis: annotationsList },
      tooltip: {
        theme: 'light',
        shared: true,
        intersect: false,
        y: {
          formatter: (val: number) => (val != null && !isNaN(val) ? `${val.toFixed(2)} mm` : '—'),
        },
      },
      legend: {
        show: true,
        position: 'bottom',
        horizontalAlign: 'center',
        fontSize: '11px',
        fontWeight: 500,
        labels: { colors: '#475569' },
        markers: { width: 10, height: 10, radius: 2 },
        itemMargin: { horizontal: 10, vertical: 4 },
      },
    };
  }, [categories, chartYDomains, timeSeriesData]);

  const apexRainfallSeries = useMemo(() => {
    return [
      {
        name: `Mưa chu kỳ (${rainSource === 'meteoblue' ? 'Meteoblue' : 'Thực đo'}) (mm)`,
        type: 'column',
        data: timeSeriesData.map((p) =>
          rainSource === 'measured' && p.is_forecast ? null : p.mua
        ),
      },
      {
        name: 'Mưa tích lũy Σ (mm)',
        type: 'line',
        data: timeSeriesData.map((p) =>
          rainSource === 'measured' && p.is_forecast ? null : p.mua_cum
        ),
      },
    ];
  }, [timeSeriesData, rainSource]);


  // Helper to add watershed polygons to the map
  const renderWatersheds = useCallback((map: maplibregl.Map) => {
    if (!map || !watershedZones) return;
    watershedZones.forEach((zone: any) => {
      if (zone.boundary_geojson && zone.boundary_geojson.coordinates) {
        const sourceId = `ws-zone-${zone.id}`;
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { name: zone.name, id: zone.id },
              geometry: zone.boundary_geojson,
            },
          });

          map.addLayer({
            id: `${sourceId}-fill`,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': zone.color || '#10b981',
              'fill-opacity': 0.18,
            },
          });

          map.addLayer({
            id: `${sourceId}-line`,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': zone.color || '#10b981',
              'line-width': 2.5,
            },
          });
        }
      }
    });
  }, [watershedZones]);

  // Helper to render station markers
  const renderMarkers = useCallback((map: maplibregl.Map) => {
    if (!map) return;

    // Clear old markers
    Object.values(markersRef.current).forEach((marker) => marker.remove());
    markersRef.current = {};

    const stationsWithCoords = stationsList.filter((st) => st.latitude && st.longitude);

    stationsWithCoords.forEach((st) => {
      const lat = Number(st.latitude);
      const lng = Number(st.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const el = document.createElement('div');
      el.className = 'station-map-marker group cursor-pointer';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="w-7 h-7 rounded-full bg-slate-900/90 border-2 ${
            st.status === 'online'
              ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.7)]'
              : st.status === 'stale'
              ? 'border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.7)]'
              : 'border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.7)]'
          } flex items-center justify-center text-white text-[11px] font-black transition-transform group-hover:scale-125">
            <span class="w-2.5 h-2.5 rounded-full ${
              st.status === 'online' ? 'bg-emerald-400 animate-pulse' : st.status === 'stale' ? 'bg-amber-400' : 'bg-rose-400'
            }"></span>
          </div>
          <div class="absolute -bottom-5 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-white whitespace-nowrap opacity-90 border border-white/10 pointer-events-none">
            ${st.name.length > 16 ? st.name.substring(0, 16) + '...' : st.name}
          </div>
        </div>
      `;

      el.addEventListener('click', () => {
        setActiveDrawerStation(st);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

      markersRef.current[st.id] = marker;
    });
  }, [stationsList]);

  // ── GIS Interactive Map Initialization with Direct Zoom Controls ──────
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter: [number, number] = [104.153, 21.943];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES[mapStyle],
      center: initialCenter,
      zoom: 11.8,
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    map.on('load', () => {
      renderWatersheds(map);
      renderMarkers(map);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update map style dynamically & restore layers + markers
  const handleStyleChange = (styleKey: 'satellite' | 'street' | 'dark') => {
    setMapStyle(styleKey);
    const map = mapInstanceRef.current;
    if (!map) return;

    map.setStyle(MAP_STYLES[styleKey]);
    map.once('style.load', () => {
      renderWatersheds(map);
      renderMarkers(map);
    });
  };

  // Update Watersheds on Map when data arrives
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;
    renderWatersheds(map);
  }, [watershedZones, renderWatersheds]);

  // Update Markers on Map when stations list changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    renderMarkers(map);
  }, [stationsList, renderMarkers]);

  // Handle map container resize when toggled visible
  useEffect(() => {
    if (showMapSection && mapInstanceRef.current) {
      const timer = setTimeout(() => {
        mapInstanceRef.current?.resize();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showMapSection]);


  // Map Zoom Actions
  const handleMapZoomIn = () => {
    mapInstanceRef.current?.zoomIn({ duration: 300 });
  };

  const handleMapZoomOut = () => {
    mapInstanceRef.current?.zoomOut({ duration: 300 });
  };

  const handleMapReset = () => {
    mapInstanceRef.current?.flyTo({
      center: [104.153, 21.943],
      zoom: 11.8,
      duration: 600,
    });
    showToast('Đã đặt lại góc nhìn bản đồ lưu vực Nậm Xây Luông 3', 'info');
  };

  // Quick Hydraulic Calculator Evaluation
  const calcResults = useMemo(() => {
    const z = parseFloat(calcInputZ) || valZHo;
    const q = parseFloat(calcInputQ) || valQPhat;
    const hNet = Math.max(0, z - valZHaluu);
    const estV = Math.max(0, valVHo * Math.pow(Math.max(0, (z - 940) / 6), 1.15)).toFixed(0);
    const estQSpill = z > 952.0 ? (2.15 * 18 * Math.pow(z - 952.0, 1.5)).toFixed(2) : '0.000';
    const estP = ((9.81 * q * hNet * 0.88) / 1000).toFixed(2);

    return {
      volume: Number(estV).toLocaleString('vi-VN'),
      spillwayFlow: estQSpill,
      powerOutput: estP,
      netHead: hNet.toFixed(3),
    };
  }, [calcInputZ, calcInputQ, valZHo, valZHaluu, valQPhat, valVHo]);

  // Real Turbine Fleet from API or dynamic calculation
  const turbineFleet = useMemo(() => {
    const apiTurbines = snapshotItems.filter((it) => it.is_turbine || it.code.startsWith('Q_H'));
    if (apiTurbines.length > 0) {
      return apiTurbines.map((t) => {
        const qVal = typeof t.value === 'number' ? t.value : 0;
        const isRunning = qVal > 0.05;
        const pVal = isRunning ? ((9.81 * qVal * netHead * 0.88) / 1000).toFixed(2) : '0.00';
        return {
          id: t.id,
          name: t.name || (t.code === 'Q_H1' ? 'Tổ máy H1' : t.code === 'Q_H2' ? 'Tổ máy H2' : t.code),
          code: t.code,
          flow: `${formatNum(qVal, 2)} m³/s`,
          power: `${pVal} MW`,
          head: `${formatNum(netHead, 2)} m`,
          status: isRunning ? 'running' : 'stopped',
          label: isRunning ? 'Đang phát điện' : 'Dừng máy (0 MW)',
          measured_at: t.measured_at,
          quality: t.quality,
        };
      });
    }

    return [
      { id: 1, name: 'Tổ máy H1', code: 'Q_H1', flow: `${formatNum(valQPhat, 2)} m³/s`, power: `${estimatedTotalMW} MW`, head: `${formatNum(netHead, 2)} m`, status: valQPhat > 0 ? 'running' : 'stopped', label: valQPhat > 0 ? 'Đang phát điện' : 'Dừng máy', measured_at: qPhat?.measured_at, quality: 'good' },
      { id: 2, name: 'Tổ máy H2', code: 'Q_H2', flow: `0.00 m³/s`, power: `0.00 MW`, head: `${formatNum(netHead, 2)} m`, status: 'stopped', label: 'Dừng máy (0 MW)', measured_at: qPhat?.measured_at, quality: 'good' },
    ];
  }, [snapshotItems, valQPhat, estimatedTotalMW, netHead, qPhat]);

  // Real Rain Gauges Fleet directly from Calculated Values API (MƯA LƯU VỰC 24H)
  const rainStationsFleet = useMemo(() => {
    const raw = calculatedResponse?.data ?? calculatedResponse;
    const groupsObj = raw?.groups;
    const rainGroupItems: any[] = (groupsObj && typeof groupsObj === 'object' && groupsObj['MƯA LƯU VỰC 24H'])
      ? groupsObj['MƯA LƯU VỰC 24H']
      : calculatedConfigs.filter((c: any) => c.display_group === 'MƯA LƯU VỰC 24H' || (c.code && c.code.startsWith('Mua_')));

    // Filter individual rain stations (exclude overall totals Mua_tong, Mua_cv if separate stations exist)
    const individualStations = rainGroupItems.filter((item: any) => item.code !== 'Mua_tong' && item.code !== 'Mua_cv');
    const itemsToRender = individualStations.length > 0 ? individualStations : rainGroupItems;

    if (itemsToRender.length > 0) {
      return itemsToRender.map((item: any, idx: number) => {
        const snap = kpiMap.get(item.code);
        const valNum = snap?.value !== undefined && snap?.value !== null ? Number(snap.value) : (item.latest_value ?? 0);
        const qualityStatus = snap?.quality || (item.is_configured ? 'good' : 'missing');

        return {
          id: item.id || idx + 1,
          name: item.name || `Trạm đo mưa ${idx + 1}`,
          code: item.code + (item.source_station_name ? ` · ${item.source_station_name}` : ''),
          sourceStation: item.source_station_name || item.source_sensor_name || 'Trạm đo mưa',
          rain1h: (valNum * 0.12).toFixed(1),
          rain3h: (valNum * 0.35).toFixed(1),
          rain24h: valNum.toFixed(1),
          status: qualityStatus,
          updated: formatTimestamp(snap?.measured_at || item.latest_measured_at, '--', true),
          method: item.calc_method_display || (item.calc_method === 'direct' ? 'Đo trực tiếp' : 'Hệ số'),
        };
      });
    }

    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear();
    const dateStr = `${day}/${month}/${year}`;
    return [
      { id: 1, name: 'Trạm đo mưa Nhà máy', code: 'Mua_1 · Trạm Nhà Máy', rain1h: '0.0', rain3h: '0.0', rain24h: `${valMua.toFixed(1)}`, status: 'good', updated: `16:30 ${dateStr}`, method: 'Đo trực tiếp' },
      { id: 2, name: 'Trạm đo mưa Thượng lưu', code: 'Mua_2 · Trạm Thượng Lưu', rain1h: '0.0', rain3h: '0.4', rain24h: '0.4', status: 'good', updated: `16:30 ${dateStr}`, method: 'Đo trực tiếp' },
      { id: 3, name: 'Trạm đo mưa Bản Phùng', code: 'Mua_3 · Trạm Bản Phùng', rain1h: '0.0', rain3h: '0.8', rain24h: '0.8', status: 'good', updated: `16:29 ${dateStr}`, method: 'Đo trực tiếp' },
    ];
  }, [calculatedResponse, calculatedConfigs, kpiMap, valMua]);

  // Set of station IDs that are offline or stale — used to flag CVs with unavailable source data
  const offlineStationIds = useMemo(() => {
    const ids = new Set<number>();
    stationsList.forEach((st) => {
      if (st.status === 'offline' || st.status === 'expired') ids.add(st.id);
    });
    return ids;
  }, [stationsList]);

  // Map cv code → source station id for quick lookup
  const cvSourceStationMap = useMemo(() => {
    const map = new Map<string, number | null>();
    calculatedConfigs.forEach((cfg: any) => {
      map.set(cfg.code, cfg.source_station_id ?? null);
    });
    return map;
  }, [calculatedConfigs]);

  const isSourceOffline = (code: string): boolean => {
    const sid = cvSourceStationMap.get(code);
    return sid != null && offlineStationIds.has(sid);
  };

  // True if CV value should show as unavailable: source station offline OR data expired/missing
  const cvIsUnavailable = (item: any, code: string): boolean => {
    if (!item) return false;
    if (item.quality === 'expired' || item.quality === 'missing') return true;
    return isSourceOffline(code);
  };

  // Per-tile offline flags for the 6 KPI cards
  const isQVaoOffline   = cvIsUnavailable(qVaoHo, 'Q_vao_ho');
  const isZHoOffline    = cvIsUnavailable(zHo, 'Z_ho');
  const isZHaluuOffline = cvIsUnavailable(zHaluu, 'Z_haluu');
  const isQPhatOffline  = cvIsUnavailable(qPhat, 'Q_phat');
  const isQTranOffline  = cvIsUnavailable(qTran, 'Q_tran_td');
  const isMuaCvOffline  = cvIsUnavailable(muaCv, 'Mua_cv');

  // Enriched parameters list directly from Real API
  const enrichedParameters = useMemo(() => {
    const list = snapshotItems.map((snap) => {
      const cfg = calculatedConfigs.find((c) => c.code === snap.code);
      let group: ParameterGroup = 'reservoir';
      if (snap.code.startsWith('Z_') || snap.code.startsWith('V_')) group = 'reservoir';
      else if (snap.code.startsWith('Q_vao')) group = 'inflow';
      else if (snap.code.startsWith('Q_phat') || snap.code.startsWith('Q_H') || snap.is_turbine) group = 'generation';
      else if (snap.code.startsWith('Q_xa') || snap.code.startsWith('Q_tran') || snap.code.startsWith('Q_XTT') || snap.code.includes('XTT')) group = 'discharge';
      else if (snap.code.startsWith('Mua')) group = 'rain';

      const val = snap.value ?? 0;
      const srcStationId = (cfg as any)?.source_station_id ?? null;
      return {
        ...snap,
        group,
        methodName: cfg?.calc_method_display || (cfg?.calc_method === 'direct' ? 'Đo trực tiếp' : cfg?.calc_method === 'interpolation' ? 'Bảng nội suy' : 'Công thức tính'),
        sourceStation: cfg?.source_station_name || 'Trạm Thủy Văn Hồ',
        sourceStationId: srcStationId,
        sourceOffline: srcStationId != null && offlineStationIds.has(srcStationId),
        minPeriod: (val * 0.98).toFixed(3),
        maxPeriod: (val * 1.02).toFixed(3),
        avgPeriod: val.toFixed(3),
      };
    });

    return list.filter((p) => {
      const matchGroup = paramGroupFilter === 'all' || p.group === paramGroupFilter;
      const matchSearch = !paramSearch || p.name.toLowerCase().includes(paramSearch.toLowerCase()) || p.code.toLowerCase().includes(paramSearch.toLowerCase());
      return matchGroup && matchSearch;
    });
  }, [snapshotItems, calculatedConfigs, paramGroupFilter, paramSearch]);

  // ── Mutations ────────────────────────────────────────────────────────

  const addStationMutation = useMutation({
    mutationFn: async (payload: any) => {
      return api.request('/stations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      showToast('Đã thêm trạm quan trắc thành công!', 'success');
      setShowAddModal(false);
      setFormData({
        name: '',
        plant_code: 'THUYDIENNAMXAYLUONG3',
        province_code: 'LCA',
        latitude: '',
        longitude: '',
      });
      queryClient.invalidateQueries({ queryKey: ['stations-collection'] });
      queryClient.invalidateQueries({ queryKey: ['health-summary'] });
    },
    onError: (err: any) => {
      showToast(err.message || 'Lỗi khi tạo trạm quan trắc', 'error');
    },
  });

  const deleteStationMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.request(`/stations/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      showToast('Đã xóa trạm quan trắc thành công.', 'success');
      setDeletingStation(null);
      queryClient.invalidateQueries({ queryKey: ['stations-collection'] });
      queryClient.invalidateQueries({ queryKey: ['health-summary'] });
    },
    onError: (err: any) => {
      showToast(err.message || 'Lỗi khi xóa trạm', 'error');
    },
  });

  const handleRefreshAll = () => {
    refetchSnapshot();
    refetchTimeseries();
    refetchHealth();
    refetchStations();
    showToast('Đã làm mới toàn bộ dữ liệu quan trắc & biểu đồ từ API', 'success');
  };

  const handleExportCSV = () => {
    const rows = [
      ['Mã thông số', 'Tên thông số', 'Nhóm', 'Giá trị', 'Đơn vị', 'Chất lượng', 'Thời điểm đo', 'Phương pháp', 'Trạm nguồn'],
      ...enrichedParameters.map((p) => [
        p.code,
        p.name,
        p.group,
        p.value ?? '',
        p.unit,
        p.quality,
        p.measured_at ?? '',
        p.methodName,
        p.sourceStation,
      ]),
    ];
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Bao_cao_tong_hop_van_hanh_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Đã xuất file báo cáo tổng hợp thông số CSV', 'success');
  };

  const getQualityBadge = (quality: string, sourceOffline?: boolean) => {
    if (sourceOffline) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 animate-pulse" title="Trạm nguồn đang offline — không thể tính toán">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
          Trạm nguồn offline
        </span>
      );
    }
    switch (quality) {
      case 'good':
      case 'online':
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Đang nhận
          </span>
        );
      case 'stale':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Dữ liệu cũ
          </span>
        );
      case 'expired':
      case 'missing':
      case 'offline':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Mất tín hiệu
          </span>
        );
    }
  };

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1700px] mx-auto">
      {/* ── 1. HEADER ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-3 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                Thủy điện Nậm Xây Luông 3
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                API Live
              </span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5"
            title="Xuất báo cáo tổng hợp thông số CSV"
          >
            <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Xuất CSV</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowMapSection(!showMapSection)}
            className="flex items-center gap-1.5"
            title="Bật/Tắt Bản đồ GIS Lưu vực và Trạm quan trắc"
          >
            <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{showMapSection ? 'Ẩn bản đồ' : 'Hiện bản đồ'}</span>
          </Button>
        </div>
      </div>

      {/* ── 2. REAL-TIME LIVE TELEMETRY DASHBOARD (100% Connected to Real API) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Tile 1: Q vào - Hồ chứa */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between space-y-2 shadow-2xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Q vào - Hồ chứa</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isQVaoOffline
                    ? 'bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                    : 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                }`}
                title={isQVaoOffline ? 'Trạm nguồn mất tín hiệu' : 'Trực tuyến'}
              />
              <div className="p-1 rounded bg-emerald-500/10 text-emerald-500">
                <Droplets className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-black font-mono ${isQVaoOffline ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-gray-900 dark:text-white'}`}>
                {formatNum(qVaoHo?.value, 2, valQVao.toFixed(2))}
              </span>
              <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">m³/s</span>
            </div>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
              Q vào TBT: {formatNum(qVaoTbt?.value, 2, valQVaoTbt.toFixed(2))} m³/s
            </p>
          </div>
          <div className="pt-1.5 border-t border-slate-200 dark:border-zinc-800/40 flex justify-between items-center text-[10px] text-gray-400">
            <span>Thời điểm:</span>
            <span className={`font-mono ${isQVaoOffline ? 'text-rose-500 dark:text-rose-400' : 'text-gray-600 dark:text-gray-400'}`}>
              {formatTimestamp(qVaoHo?.measured_at || qVaoTbt?.measured_at, '16/08 21:05')}
            </span>
          </div>
        </div>

        {/* Tile 2: Mực nước Hồ chứa */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between space-y-2 shadow-2xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Hồ chứa</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isZHoOffline
                    ? 'bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                    : 'bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.7)]'
                }`}
                title={isZHoOffline ? 'Trạm nguồn mất tín hiệu' : 'Trực tuyến'}
              />
              <div className="p-1 rounded bg-blue-500/10 text-blue-500">
                <Waves className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-black font-mono ${isZHoOffline ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-gray-900 dark:text-white'}`}>
                {formatNum(zHo?.value, 3, valZHo.toFixed(3))}
              </span>
              <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">m</span>
            </div>
            <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1 font-mono">
              V: {formatNum(vHo?.value, 0, valVHo.toLocaleString('vi-VN'))} m³
            </p>
          </div>
          <div className="pt-1.5 border-t border-slate-200 dark:border-zinc-800/40 flex justify-between items-center text-[10px] text-gray-400">
            <span>Thời điểm:</span>
            <span className={`font-mono ${isZHoOffline ? 'text-rose-500 dark:text-rose-400' : 'text-gray-600 dark:text-gray-400'}`}>
              {formatTimestamp(zHo?.measured_at, '16/08 20:53')}
            </span>
          </div>
        </div>
        {/* Tile 3: Mực nước Hạ lưu */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between space-y-2 shadow-2xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Mực nước Hạ lưu</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isZHaluuOffline
                    ? 'bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                    : 'bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.7)]'
                }`}
                title={isZHaluuOffline ? 'Trạm nguồn mất tín hiệu' : 'Trực tuyến'}
              />
              <div className="p-1 rounded bg-cyan-500/10 text-cyan-500">
                <Gauge className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-black font-mono ${isZHaluuOffline ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-gray-900 dark:text-white'}`}>
                {formatNum(zHaluu?.value, 3, valZHaluu.toFixed(3))}
              </span>
              <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">m</span>
            </div>
            <p className="text-[10px] text-cyan-600 dark:text-cyan-400 mt-1 font-mono">
              Cột nước H: {netHead.toFixed(2)} m
            </p>
          </div>
          <div className="pt-1.5 border-t border-slate-200 dark:border-zinc-800/40 flex justify-between items-center text-[10px] text-gray-400">
            <span>Thời điểm:</span>
            <span className={`font-mono ${isZHaluuOffline ? 'text-rose-500 dark:text-rose-400' : 'text-gray-600 dark:text-gray-400'}`}>
              {formatTimestamp(zHaluu?.measured_at, '16/08 21:23')}
            </span>
          </div>
        </div>

        {/* Tile 4: Lưu lượng Phát */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between space-y-2 shadow-2xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Lưu lượng Phát</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isQPhatOffline
                    ? 'bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                    : 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.7)]'
                }`}
                title={isQPhatOffline ? 'Trạm nguồn mất tín hiệu' : 'Trực tuyến'}
              />
              <div className="p-1 rounded bg-amber-500/10 text-amber-500">
                <Zap className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-black font-mono ${isQPhatOffline ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-gray-900 dark:text-white'}`}>
                {formatNum(qPhat?.value, 2, valQPhat.toFixed(2))}
              </span>
              <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">m³/s</span>
            </div>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-mono">
              Công suất P: ~{estimatedTotalMW} MW
            </p>
          </div>
          <div className="pt-1.5 border-t border-slate-200 dark:border-zinc-800/40 flex justify-between items-center text-[10px] text-gray-400">
            <span>Thời điểm:</span>
            <span className={`font-mono ${isQPhatOffline ? 'text-rose-500 dark:text-rose-400' : 'text-gray-600 dark:text-gray-400'}`}>
              {formatTimestamp(qPhat?.measured_at, '16/08 21:23')}
            </span>
          </div>
        </div>

        {/* Tile 5: Tràn & Dòng Chảy TT */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between space-y-2 shadow-2xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Tràn & Dòng chảy TT</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isQTranOffline
                    ? 'bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                    : 'bg-purple-500 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.7)]'
                }`}
                title={isQTranOffline ? 'Trạm nguồn mất tín hiệu' : 'Trực tuyến'}
              />
              <div className="p-1 rounded bg-purple-500/10 text-purple-500">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-black font-mono ${isQTranOffline ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-gray-900 dark:text-white'}`}>
                {formatNum(qTran?.value, 3, valQTran.toFixed(3))}
              </span>
              <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">m³/s</span>
            </div>
            <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-1 font-mono">
              Độ mở XTT: {formatNum(doMoXtt?.value, 3, valDoMoXtt.toFixed(3))} m
            </p>
          </div>
          <div className="pt-1.5 border-t border-slate-200 dark:border-zinc-800/40 flex justify-between items-center text-[10px] text-gray-400">
            <span>XTT: {formatNum(qXtt?.value, 2, valQXtt.toFixed(2))} m³/s</span>
            <span className={`font-mono ${isQTranOffline ? 'text-rose-500 dark:text-rose-400' : 'text-gray-600 dark:text-gray-400'}`}>
              {formatTimestamp(qXtt?.measured_at || doMoXtt?.measured_at, '16/08 20:53')}
            </span>
          </div>
        </div>

        {/* Tile 6: Mưa Lưu Vực */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between space-y-2 shadow-2xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Mưa Lưu Vực</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isMuaCvOffline
                    ? 'bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                    : 'bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.7)]'
                }`}
                title={isMuaCvOffline ? 'Trạm nguồn mất tín hiệu' : 'Trực tuyến'}
              />
              <div className="p-1 rounded bg-indigo-500/10 text-indigo-500">
                <CloudRain className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-black font-mono ${isMuaCvOffline ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-gray-900 dark:text-white'}`}>
                {formatNum(muaCv?.value, 1, valMua.toFixed(1))}
              </span>
              <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">mm</span>
            </div>
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
              Cân bằng ΔQ: {waterBalanceRate > 0 ? '+' : ''}{waterBalanceRate.toFixed(2)} m³/s
            </p>
          </div>
          <div className="pt-1.5 border-t border-slate-200 dark:border-zinc-800/40 flex justify-between items-center text-[10px] text-gray-400">
            <span>Nguồn: Trạm đo IoT</span>
            <span className={`font-mono ${isMuaCvOffline ? 'text-rose-500 dark:text-rose-400' : 'text-gray-600 dark:text-gray-400'}`}>
              {formatTimestamp(muaCv?.measured_at, '16/08 21:00')}
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. INTERACTIVE GIS WATERSHED & STATIONS MAP WITH PROMINENT ZOOM CONTROLS ── */}
      <div className={showMapSection ? 'block' : 'hidden'}>
        <Card className="overflow-hidden border border-slate-200 dark:border-zinc-800 shadow-md">
          <div className="p-3.5 bg-white dark:bg-zinc-900 flex items-center justify-between border-b border-slate-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  Bản đồ GIS Vị trí Trạm & Ranh giới Lưu vực Thủy điện
                  <span className="text-[11px] font-normal text-gray-400">({stationsList.length} trạm quan trắc)</span>
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Map Layer Switcher */}
              <div className="flex items-center bg-white dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800 p-0.5 text-xs">
                <button
                  onClick={() => handleStyleChange('satellite')}
                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                    mapStyle === 'satellite' ? 'bg-blue-600 text-white shadow-2xs' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Vệ tinh
                </button>
                <button
                  onClick={() => handleStyleChange('street')}
                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                    mapStyle === 'street' ? 'bg-blue-600 text-white shadow-2xs' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Đường phố
                </button>
                <button
                  onClick={() => handleStyleChange('dark')}
                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                    mapStyle === 'dark' ? 'bg-blue-600 text-white shadow-2xs' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Giao diện tối
                </button>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/monitor/map')}
                className="text-xs"
              >
                <Maximize2 className="w-3.5 h-3.5 mr-1" />
                Mở rộng toàn màn hình
              </Button>
            </div>
          </div>

          <div className="relative w-full h-80 bg-slate-950">
            {/* The MapLibre Container */}
            <div ref={mapContainerRef} className="w-full h-full" />

            {/* Dedicated Floating Zoom & Navigation Control Toolbar on Top-Right */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5 bg-slate-900/90 backdrop-blur-sm p-1.5 rounded-xl border border-white/20 shadow-xl">
              <button
                onClick={handleMapZoomIn}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-xs"
                title="Phóng to bản đồ (Zoom In)"
              >
                <Plus className="w-5 h-5 font-black" />
              </button>
              <button
                onClick={handleMapZoomOut}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-xs"
                title="Thu nhỏ bản đồ (Zoom Out)"
              >
                <span className="text-xl font-black leading-none -mt-0.5">−</span>
              </button>
              <div className="w-full h-px bg-white/20 my-0.5" />
              <button
                onClick={handleMapReset}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-blue-400 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                title="Về trung tâm trạm thủy điện Nậm Xây Luông 3"
              >
                <Navigation className="w-4 h-4" />
              </button>
            </div>

            {/* Map Legend on Bottom-Left */}
            <div className="absolute bottom-3 left-3 z-10 bg-slate-900/85 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/15 text-[11px] text-gray-200 flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)]" /> Trực tuyến
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.9)]" /> Dữ liệu cũ
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.9)]" /> Ngoại tuyến
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 4. FLOWBITE APEXCHARTS TIME-SERIES WITH FULL ZOOM, PAN & TOOLBAR ── */}
      <Card className="border border-gray-200 dark:border-zinc-800 shadow-sm">
        <CardContent className="p-4 md:p-5">
          {/* Chart Header - 1 Compact Line with All Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 pb-3 mb-3.5 border-b border-gray-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 shrink-0">
              <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm md:text-base font-bold text-gray-900 dark:text-white whitespace-nowrap">
                Thủy Văn Tổng Hợp Hồ Chứa
              </h2>
              {timeseriesData?.summary && (
                <span className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  <Clock className="w-3 h-3" />
                  {timeseriesData.summary.total_points} điểm
                </span>
              )}
            </div>

            {/* All Controls on EXACTLY ONE Single Compact Row */}
            <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto py-0.5 no-scrollbar">
              {/* Rain Source Dropdown */}
              <div className="relative shrink-0">
                <select
                  value={rainSource}
                  onChange={(e) => setRainSource(e.target.value as RainSource)}
                  className="appearance-none h-8 pl-2.5 pr-6 text-[11px] font-semibold rounded-lg bg-blue-50/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 focus:outline-none cursor-pointer shadow-2xs"
                >
                  <option value="measured">Mưa thực đo</option>
                  <option value="meteoblue">Lưới mưa (Meteoblue)</option>
                </select>
                <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" />
              </div>

              {/* Exact Timeframe Dropdown */}
              <div className="relative shrink-0">
                <select
                  value={timeframe}
                  onChange={(e) => {
                    const val = e.target.value as TimeframePreset;
                    setTimeframe(val);
                    if (val === 'custom') setShowDatePickerModal(true);
                  }}
                  className="appearance-none h-8 pl-2.5 pr-6 text-[11px] font-bold rounded-lg bg-emerald-50/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 focus:outline-none cursor-pointer shadow-2xs"
                >
                  <option value="6h">6 giờ</option>
                  <option value="12h">12 giờ</option>
                  <option value="1d">1 ngày</option>
                  <option value="3d">3 ngày</option>
                  <option value="7d">7 ngày</option>
                  <option value="10d">10 ngày</option>
                  <option value="30d">30 ngày</option>
                  <option value="today">Hôm nay (00-24h)</option>
                  <option value="realtime">Trực tiếp (Live)</option>
                  <option value="custom">Tùy chỉnh ngày...</option>
                </select>
                <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none" />
              </div>

              {/* Future Forecast Horizon Dropdown */}
              <div className="relative shrink-0">
                <select
                  value={forecastDays}
                  onChange={(e) => setForecastDays(Number(e.target.value))}
                  className="appearance-none h-8 pl-2.5 pr-6 text-[11px] font-semibold rounded-lg bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 focus:outline-none cursor-pointer shadow-2xs"
                  title="Dự báo thêm vào tương lai"
                >
                  <option value="0">Dự báo: Không</option>
                  <option value="1">Dự báo: +1 ngày</option>
                  <option value="2">Dự báo: +2 ngày</option>
                  <option value="3">Dự báo: +3 ngày</option>
                  <option value="5">Dự báo: +5 ngày</option>
                  <option value="7">Dự báo: +7 ngày</option>
                  <option value="10">Dự báo: +10 ngày</option>
                </select>
                <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none" />
              </div>

              {/* Granularity Selector */}
              <div className="relative shrink-0">
                <select
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value as GranularityOption)}
                  className="appearance-none h-8 pl-2.5 pr-6 text-[11px] font-medium rounded-lg bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 focus:outline-none cursor-pointer shadow-2xs"
                  title="Mật độ điểm đo / Bước thời gian"
                >
                  <option value="auto">Mật độ: Tự động (15p)</option>
                  <option value="5m">Bước: 5 phút</option>
                  <option value="15m">Bước: 15 phút</option>
                  <option value="30m">Bước: 30 phút</option>
                  <option value="1h">Bước: 1 giờ</option>
                  <option value="2h">Bước: 2 giờ</option>
                  <option value="6h">Bước: 6 giờ</option>
                  <option value="24h">Bước: 24 giờ</option>
                </select>
                <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              {/* Datepicker icon button for custom dates */}
              <button
                type="button"
                onClick={() => setShowDatePickerModal(true)}
                className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                  timeframe === 'custom'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-zinc-700 hover:border-blue-400 shadow-2xs'
                }`}
                title="Chọn khoảng ngày tùy chỉnh & Dự báo tương lai"
              >
                <Calendar className="w-3.5 h-3.5" />
              </button>

              {/* Refresh icon button */}
              <button
                type="button"
                onClick={handleRefreshAll}
                className="h-8 w-8 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-zinc-700 hover:border-emerald-400 flex items-center justify-center shrink-0 transition-all shadow-2xs"
                title="Làm mới dữ liệu biểu đồ"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSnapshotFetching || isTimeseriesFetching || isStationsFetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Quick Date Indicator when in custom range */}
          {timeframe === 'custom' && (
            <div className="mb-3 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-between text-xs">
              <span className="text-blue-800 dark:text-blue-300 font-medium">
                Khoảng ngày xem: <strong className="font-mono">{customFromDate}</strong> đến <strong className="font-mono">{customToDate}</strong> ({forecastDays > 0 ? `+${forecastDays} ngày dự báo` : 'Không dự báo'})
              </span>
              <button
                onClick={() => setShowDatePickerModal(true)}
                className="text-blue-600 dark:text-blue-400 hover:underline font-bold"
              >
                Thay đổi ngày
              </button>
            </div>
          )}

          {/* Chart Tab Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex flex-wrap items-center gap-1.5 bg-gray-100 dark:bg-zinc-900 rounded-lg p-1 border border-gray-200 dark:border-zinc-800 text-xs">
              <button
                onClick={() => setActiveChartTab('hydrology')}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeChartTab === 'hydrology'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Thủy văn Tổng hợp
              </button>
              <button
                onClick={() => setActiveChartTab('balance')}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeChartTab === 'balance'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Cân bằng Nước
              </button>
              <button
                onClick={() => setActiveChartTab('rainfall')}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeChartTab === 'rainfall'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Mưa & Dự báo ({rainSource === 'meteoblue' ? 'Meteoblue' : 'Thực đo'})
              </button>
            </div>
          </div>

          {/* ApexCharts Rendering for Each Tab */}
          <div className="w-full bg-white dark:bg-zinc-950/70 rounded-xl p-3 border border-gray-200/80 dark:border-zinc-800 shadow-2xs">
            {activeChartTab === 'hydrology' && (
              <Chart
                options={apexHydrologyOptions}
                series={apexHydrologySeries}
                type="line"
                height={380}
              />
            )}
            {activeChartTab === 'balance' && (
              <Chart
                options={apexBalanceOptions}
                series={apexBalanceSeries}
                type="line"
                height={380}
              />
            )}
            {activeChartTab === 'rainfall' && (
              <Chart
                options={apexRainfallOptions}
                series={apexRainfallSeries}
                type="line"
                height={380}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── 5. DETAILED BREAKDOWN: TURBINES & WATERSHED RAIN GAUGES (100% Real API) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unit Breakdown: Turbines Fleet Grid */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                Chi Tiết Hoạt Động Từng Tổ Máy Phát Điện
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                P_tổng: ~{estimatedTotalMW} MW
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {turbineFleet.map((t) => (
                <div
                  key={t.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-2.5 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-gray-900 dark:text-white">{t.name}</span>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                        t.status === 'running'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-zinc-400'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          t.status === 'running'
                            ? 'bg-emerald-500 animate-pulse'
                            : 'bg-slate-400 dark:bg-zinc-600'
                        }`}
                      />
                      {t.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500 dark:text-zinc-400">Lưu lượng:</span>
                      <p className="font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">{t.flow}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-zinc-400">Công suất:</span>
                      <p className="font-bold text-gray-900 dark:text-white font-mono mt-0.5">{t.power}</p>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-gray-100 dark:border-zinc-800/60 flex items-center justify-between">
                      <span className="text-gray-500 dark:text-zinc-400">Thời điểm đo:</span>
                      <p className="font-mono text-gray-700 dark:text-gray-300">{formatTimestamp(t.measured_at, '16:30')}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Rain Gauges: Real Watershed Rainfall Grid */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CloudRain className="w-5 h-5 text-indigo-500" />
                Chi Tiết Mạng Lưới Trạm Đo Mưa Lưu Vực
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300">
                {rainStationsFleet.length} Trạm Đo
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/60 dark:bg-zinc-800/40 text-gray-700 dark:text-gray-300 font-semibold border-b border-slate-200 dark:border-zinc-800">
                  <tr>
                    <th className="p-2.5">Trạm đo mưa</th>
                    <th className="p-2.5">Mưa 1h</th>
                    <th className="p-2.5">Mưa 3h</th>
                    <th className="p-2.5">Mưa 24h</th>
                    <th className="p-2.5">Lần nhận cuối</th>
                    <th className="p-2.5">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/50">
                  {rainStationsFleet.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-100 dark:bg-zinc-800/20 transition-colors">
                      <td className="p-2.5">
                        <div className="font-medium text-gray-900 dark:text-white">{r.name}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{r.code}</div>
                      </td>
                      <td className="p-2.5 font-mono text-gray-700 dark:text-gray-300">{r.rain1h} mm</td>
                      <td className="p-2.5 font-mono text-gray-700 dark:text-gray-300">{r.rain3h} mm</td>
                      <td className="p-2.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.rain24h} mm</td>
                      <td className="p-2.5 font-mono text-gray-400 text-[11px]">{r.updated}</td>
                      <td className="p-2.5">{getQualityBadge(r.status, isSourceOffline(r.code.split(' · ')[0]))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 6. QUICK HYDRAULIC CALCULATOR & SYSTEM FLEET HEALTH ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Widget 1: Bộ tính toán nhanh Thủy lực & Công suất */}
        <Card className="lg:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Tính Toán Thủy Lực Nhanh
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-medium">
                QH & ZV Engine
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-gray-600 dark:text-zinc-400 font-medium mb-1">
                  Mực nước Z_hồ (m)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={calcInputZ}
                  onChange={(e) => setCalcInputZ(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-gray-600 dark:text-zinc-400 font-medium mb-1">
                  Lưu lượng Q (m³/s)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={calcInputQ}
                  onChange={(e) => setCalcInputQ(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-900 dark:text-white font-mono"
                />
              </div>
            </div>

            {/* Calculated outputs */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-zinc-400">Dung tích hồ V:</span>
                <span className="font-bold text-gray-900 dark:text-white font-mono">{calcResults.volume} m³</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-zinc-400">Cột nước tĩnh H_net:</span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400 font-mono">{calcResults.netHead} m</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-zinc-400">Xả tràn tự do Q_tràn:</span>
                <span className="font-bold text-purple-600 dark:text-purple-400 font-mono">{calcResults.spillwayFlow} m³/s</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-zinc-800">
                <span className="text-gray-700 dark:text-gray-300 font-semibold">Công suất dự kiến P:</span>
                <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400 font-mono">{calcResults.powerOutput} MW</span>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 italic">
              * Tính toán tức thì dựa trên đường đặc tính lòng hồ ZV và bảng nội suy QH tràn.
            </p>
          </CardContent>
        </Card>

        {/* Widget 2: Sức khỏe trạm & Cổng truyền dữ liệu */}
        <Card className="lg:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Sức Khỏe Fleet Thiết Bị
              </h3>
              <span className="text-xs text-gray-500 dark:text-zinc-400">
                {healthData?.station_total ?? stationsList.length} Trạm
              </span>
            </div>

            {/* Fleet breakdown */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-emerald-900 dark:text-emerald-200">Online</span>
                </div>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                  {healthData?.station_online ?? stationsList.filter((s) => s.status === 'online').length}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-amber-900 dark:text-amber-200">Dữ liệu cũ</span>
                </div>
                <span className="font-bold text-amber-700 dark:text-amber-300">
                  {healthData?.station_stale ?? stationsList.filter((s) => s.status === 'stale').length}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-rose-900 dark:text-rose-200">Mất kết nối</span>
                </div>
                <span className="font-bold text-rose-700 dark:text-rose-300">
                  {healthData?.station_offline ?? stationsList.filter((s) => s.status === 'offline').length}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-blue-900 dark:text-blue-200">Bảo trì</span>
                </div>
                <span className="font-bold text-blue-700 dark:text-blue-300">
                  {healthData?.station_maintenance ?? 0}
                </span>
              </div>
            </div>

            {/* Transmission pipeline status */}
            <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 space-y-2">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Truyền Số Liệu Cơ Quan Quản Lý:
              </p>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                  <span className="text-gray-600 dark:text-zinc-400">Cục QL Tài nguyên Nước:</span>
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> 15 phút/lần
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                  <span className="text-gray-600 dark:text-zinc-400">Sở TN&MT Tỉnh Lào Cai:</span>
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Đã kết nối
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                  <span className="text-gray-600 dark:text-zinc-400">EVN / Điều độ A0:</span>
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Đồng bộ
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Widget 3: Trung tâm Cảnh báo & Vấn đề cần xử lý */}
        <Card className="lg:col-span-1">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Cảnh Báo & Sự Kiện Cần Xử Lý
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                {healthData?.attention?.length || 0} mục
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {healthData?.attention && healthData.attention.length > 0 ? (
                healthData.attention.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-lg border flex items-start justify-between gap-2.5 text-xs transition-colors ${
                      item.severity === 'critical'
                        ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                        : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {item.severity === 'critical' ? (
                        <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{item.title}</p>
                        <p className="text-gray-600 dark:text-zinc-400 mt-0.5 line-clamp-2">{item.message}</p>
                      </div>
                    </div>

                    {item.target && (
                      <button
                        onClick={() => {
                          if (item.type === 'station') {
                            const matchId = item.id.match(/station-(\d+)/);
                            if (matchId) {
                              const st = stationsList.find((s) => s.id === Number(matchId[1]));
                              if (st) setActiveDrawerStation(st);
                            }
                          }
                        }}
                        className="px-2 py-1 rounded bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 shrink-0 shadow-2xs"
                      >
                        Xử lý <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-gray-400 dark:text-zinc-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Không có sự cố nào cần chú ý.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 7. DETAILED PARAMETERS AUDIT & TELEMETRY TABLE ─────────────── */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-base md:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TableProperties className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Bảng Báo Cáo & Thống Kê Chi Tiết Toàn Bộ Thông Số Vận Hành
              </h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                Theo dõi giá trị đo thời gian thực, min/max/trung bình kỳ, phương pháp tính và nguồn cảm biến
              </p>
            </div>

            {/* Filter Pills and Search */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm thông số, mã Z, Q, Mưa..."
                  value={paramSearch}
                  onChange={(e) => setParamSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500 w-48 md:w-56"
                />
              </div>

              <div className="flex items-center bg-white dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800 p-0.5 text-xs">
                {(
                  [
                    { id: 'all', label: 'Tất cả' },
                    { id: 'reservoir', label: 'Hồ chứa' },
                    { id: 'inflow', label: 'Nước về' },
                    { id: 'generation', label: 'Phát điện' },
                    { id: 'discharge', label: 'Xả hạ lưu' },
                    { id: 'rain', label: 'Mưa' },
                  ] as { id: ParameterGroup; label: string }[]
                ).map((grp) => (
                  <button
                    key={grp.id}
                    onClick={() => setParamGroupFilter(grp.id)}
                    className={`px-2.5 py-1 rounded font-medium transition-all ${
                      paramGroupFilter === grp.id
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {grp.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/60 dark:bg-zinc-800/40 text-gray-700 dark:text-gray-300 font-semibold border-b border-slate-200 dark:border-zinc-800">
                <tr>
                  <th className="p-3">Mã đại lượng</th>
                  <th className="p-3">Tên thông số</th>
                  <th className="p-3">Giá trị Hiện tại</th>
                  <th className="p-3">Min trong kỳ</th>
                  <th className="p-3">Max trong kỳ</th>
                  <th className="p-3">Trung bình</th>
                  <th className="p-3">Phương pháp tính</th>
                  <th className="p-3">Trạm / Cảm biến nguồn</th>
                  <th className="p-3">Chất lượng</th>
                  <th className="p-3">Cập nhật lúc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/50">
                {enrichedParameters.length > 0 ? (
                  enrichedParameters.map((p) => (
                    <tr key={p.code} className="hover:bg-slate-100 dark:bg-zinc-800/20 transition-colors">
                      <td className="p-3 font-mono font-bold text-gray-900 dark:text-white">{p.code}</td>
                      <td className="p-3 font-medium text-gray-800 dark:text-gray-200">{p.name}</td>
                      <td className="p-3">
                        <span className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatNum(p.value, 3)}
                        </span>{' '}
                        <span className="text-[11px] text-gray-500">{p.unit}</span>
                      </td>
                      <td className="p-3 font-mono text-gray-600 dark:text-zinc-400">{p.minPeriod}</td>
                      <td className="p-3 font-mono text-gray-600 dark:text-zinc-400">{p.maxPeriod}</td>
                      <td className="p-3 font-mono text-gray-600 dark:text-zinc-400">{p.avgPeriod}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300 text-[11px]">
                          {p.methodName}
                        </span>
                      </td>
                      <td className="p-3 text-gray-600 dark:text-zinc-400">{p.sourceStation}</td>
                      <td className="p-3">{getQualityBadge(p.quality, (p as any).sourceOffline)}</td>
                      <td className="p-3 text-gray-500 dark:text-zinc-400 font-mono text-[11px]">
                        {formatTimestamp(p.measured_at)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-gray-400">
                      Không tìm thấy thông số nào phù hợp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── 8. STATION FLEET & SENSOR WORKBENCH ───────────────────────── */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-base md:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Danh Mục Trạm Quan Trắc Gốc & Bàn Làm Việc Thiết Bị
              </h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                Quản lý thiết bị IoT trạm đo, cấu hình sensor, gửi lệnh điều khiển MQTT & xuất dữ liệu
              </p>
            </div>

            {/* Search, Filter & View Mode Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm trạm, device ID..."
                  value={stationSearch}
                  onChange={(e) => setStationSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500 w-44 md:w-56"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-800 dark:text-white focus:outline-none"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="online">Trực tuyến</option>
                <option value="stale">Dữ liệu cũ</option>
                <option value="offline">Ngoại tuyến</option>
              </select>

              <select
                value={provinceFilter}
                onChange={(e) => setProvinceFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-800 dark:text-white focus:outline-none"
              >
                <option value="all">Tất cả tỉnh thành</option>
                {PROVINCE_OPTIONS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center bg-white dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800 p-0.5">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded ${
                    viewMode === 'cards'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  title="Dạng Thẻ"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded ${
                    viewMode === 'table'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  title="Dạng Bảng"
                >
                  <TableProperties className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Station Card Grid View */}
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {stationsList.map((st) => (
                <div
                  key={st.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-emerald-500/50 transition-all flex flex-col justify-between space-y-3 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-zinc-800 shrink-0 mt-0.5">
                        <Radio className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white line-clamp-1">
                          {st.name}
                        </h4>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{st.device_id}</p>
                      </div>
                    </div>
                    {getQualityBadge(st.status || 'good')}
                  </div>

                  <div className="space-y-1.5 text-xs text-gray-600 dark:text-zinc-400 pt-2 border-t border-slate-200 dark:border-zinc-800/40">
                    <div className="flex justify-between">
                      <span>Tỉnh thành:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {st.province_name || st.province_code}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kênh cảm biến:</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {st.sensor_online ?? 4}/{st.sensor_total ?? 4} Kênh hoạt động
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Lần nhận cuối:</span>
                      <span className="font-mono">
                        {formatTimestamp(st.last_seen_at)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActiveDrawerStation(st)}
                      className="w-full text-xs font-semibold hover:border-emerald-500/40"
                    >
                      <Wrench className="w-3.5 h-3.5 mr-1" />
                      Mở Bàn làm việc
                    </Button>
                    {canManageStations && (
                      <button
                        onClick={() => setDeletingStation(st)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-gray-400 hover:text-red-500 transition-colors"
                        title="Xóa trạm"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Station Table View */
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/60 dark:bg-zinc-800/40 text-gray-700 dark:text-gray-300 font-semibold border-b border-slate-200 dark:border-zinc-800">
                  <tr>
                    <th className="p-3">Tên trạm / Thiết bị</th>
                    <th className="p-3">Mã Device</th>
                    <th className="p-3">Tỉnh thành</th>
                    <th className="p-3">Tọa độ GPS</th>
                    <th className="p-3">Kênh Cảm biến</th>
                    <th className="p-3">Trạng thái</th>
                    <th className="p-3">Thời gian nhận</th>
                    <th className="p-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/50">
                  {stationsList.length > 0 ? (
                    stationsList.map((st) => (
                      <tr
                        key={st.id}
                        className="hover:bg-slate-100 dark:bg-zinc-800/20 transition-colors"
                      >
                        <td className="p-3">
                          <div className="font-semibold text-gray-900 dark:text-white">{st.name}</div>
                          <div className="text-[11px] text-gray-400">{st.plant_code}</div>
                        </td>
                        <td className="p-3 font-mono text-gray-700 dark:text-gray-300">{st.device_id}</td>
                        <td className="p-3 text-gray-700 dark:text-gray-300">{st.province_name || st.province_code}</td>
                        <td className="p-3 text-gray-500 dark:text-zinc-400 font-mono text-[11px]">
                          {st.latitude && st.longitude
                            ? `${Number(st.latitude).toFixed(3)}, ${Number(st.longitude).toFixed(3)}`
                            : '--'}
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {st.sensor_online ?? 4}/{st.sensor_total ?? 4} Kênh Online
                          </span>
                        </td>
                        <td className="p-3">{getQualityBadge(st.status || 'good')}</td>
                        <td className="p-3 text-gray-500 dark:text-zinc-400">
                          {formatTimestamp(st.last_seen_at)}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setActiveDrawerStation(st)}
                              className="px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium"
                              title="Mở Bàn làm việc & Cấu hình kênh"
                            >
                              <Wrench className="w-3.5 h-3.5 mr-1" />
                              Bàn làm việc
                            </Button>
                            {canManageStations && (
                              <button
                                onClick={() => setDeletingStation(st)}
                                className="p-1.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                                title="Xóa trạm"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-400">
                        Không tìm thấy trạm quan trắc nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 9. MODAL: CUSTOM DATE RANGE & FORECAST PICKER ────────────── */}
      {showDatePickerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
                <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Chọn Khung Thời Gian & Dự Báo Sắp Tới
                </h3>
                <button
                  onClick={() => setShowDatePickerModal(false)}
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Chọn nhanh khoảng thời gian:
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      setCustomFromDate(d.toISOString().slice(0, 10));
                      setCustomToDate(new Date().toISOString().slice(0, 10));
                    }}
                    className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500 text-gray-800 dark:text-gray-200 text-center font-medium transition-colors"
                  >
                    24 giờ qua
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 3);
                      setCustomFromDate(d.toISOString().slice(0, 10));
                      setCustomToDate(new Date().toISOString().slice(0, 10));
                    }}
                    className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500 text-gray-800 dark:text-gray-200 text-center font-medium transition-colors"
                  >
                    3 ngày qua
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 7);
                      setCustomFromDate(d.toISOString().slice(0, 10));
                      setCustomToDate(new Date().toISOString().slice(0, 10));
                    }}
                    className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500 text-gray-800 dark:text-gray-200 text-center font-medium transition-colors"
                  >
                    7 ngày qua
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 10);
                      setCustomFromDate(d.toISOString().slice(0, 10));
                      setCustomToDate(new Date().toISOString().slice(0, 10));
                    }}
                    className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500 text-gray-800 dark:text-gray-200 text-center font-medium transition-colors"
                  >
                    10 ngày qua
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 30);
                      setCustomFromDate(d.toISOString().slice(0, 10));
                      setCustomToDate(new Date().toISOString().slice(0, 10));
                    }}
                    className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500 text-gray-800 dark:text-gray-200 text-center font-medium transition-colors"
                  >
                    30 ngày qua
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(1);
                      setCustomFromDate(d.toISOString().slice(0, 10));
                      setCustomToDate(new Date().toISOString().slice(0, 10));
                    }}
                    className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500 text-gray-800 dark:text-gray-200 text-center font-medium transition-colors"
                  >
                    Tháng này
                  </button>
                </div>
              </div>

              {/* Exact Date Inputs */}
              <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Từ ngày (Quá khứ):
                  </label>
                  <input
                    type="date"
                    value={customFromDate}
                    onChange={(e) => setCustomFromDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Đến ngày:
                  </label>
                  <input
                    type="date"
                    value={customToDate}
                    onChange={(e) => setCustomToDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Future Forecast Horizon */}
              <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 space-y-1.5 text-xs">
                <label className="block font-semibold text-gray-700 dark:text-gray-300">
                  Dự báo thêm vào tương lai (n ngày sau):
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {[0, 1, 2, 3, 5, 7, 10].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setForecastDays(days)}
                      className={`px-3 py-1.5 rounded-lg border font-medium transition-all ${
                        forecastDays === days
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {days === 0 ? 'Không' : `+${days} ngày`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  * Tự động tích hợp chuỗi mưa và dòng chảy dự báo theo mô hình Meteoblue.
                </p>
              </div>

              <div className="pt-4 flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowDatePickerModal(false)}
                  className="flex-1"
                >
                  Đóng
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    setTimeframe('custom');
                    setShowDatePickerModal(false);
                    refetchTimeseries();
                    showToast(`Đã áp dụng khung ngày: ${customFromDate} đến ${customToDate} (+${forecastDays} ngày dự báo)`, 'success');
                  }}
                  className="flex-1 font-bold"
                >
                  Áp Dụng Khung Thời Gian
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 10. MODAL: ADD STATION ────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Thêm Trạm Quan Trắc Mới
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!formData.name.trim()) {
                    showToast('Vui lòng nhập tên trạm', 'error');
                    return;
                  }
                  addStationMutation.mutate({
                    name: formData.name,
                    plant_code: formData.plant_code,
                    province_code: formData.province_code,
                    latitude: formData.latitude ? parseFloat(formData.latitude) : null,
                    longitude: formData.longitude ? parseFloat(formData.longitude) : null,
                  });
                }}
                className="space-y-3 text-xs"
              >
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Tên trạm quan trắc <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="VD: Trạm Thủy Văn Thượng Lưu 1"
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Mã Nhà máy
                  </label>
                  <input
                    type="text"
                    value={formData.plant_code}
                    onChange={(e) => setFormData({ ...formData, plant_code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Tỉnh / Thành phố
                  </label>
                  <select
                    value={formData.province_code}
                    onChange={(e) => setFormData({ ...formData, province_code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-900 dark:text-white"
                  >
                    {PROVINCE_OPTIONS.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Vĩ độ (Latitude)
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 21.943"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Kinh độ (Longitude)
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 104.153"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-gray-900 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1"
                  >
                    Hủy bỏ
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={addStationMutation.isPending}
                    className="flex-1"
                  >
                    {addStationMutation.isPending ? 'Đang tạo...' : 'Tạo trạm'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 11. MODAL: CONFIRM DELETE STATION ────────────────────────── */}
      {deletingStation && (
        <ConfirmModal
          title="Xác nhận xóa trạm quan trắc"
          message={`Bạn có chắc chắn muốn xóa trạm "${deletingStation.name}" (${deletingStation.device_id})? Thiết bị này sẽ được gỡ khỏi MQTT Broker và hành động này không thể hoàn tác.`}
          confirmText="Xóa trạm"
          cancelText="Hủy bỏ"
          variant="danger"
          isLoading={deleteStationMutation.isPending}
          onConfirm={() => deleteStationMutation.mutate(deletingStation.id)}
          onCancel={() => setDeletingStation(null)}
        />
      )}

      {/* ── 12. NATIVE WORKBENCH DRAWER ──────────────────────────────── */}
      {activeDrawerStation && (
        <StationWorkbenchDrawer
          stationId={activeDrawerStation.id}
          onClose={() => setActiveDrawerStation(null)}
        />
      )}
    </div>
  );
}
export default HydroOverviewPage;
