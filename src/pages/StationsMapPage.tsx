import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  CloudRain,
  Crosshair,
  X,
  Plus,
  Trash2,
  Info,
  Maximize2,
  Cpu,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  PanelRight,
  Layers,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { StationWorkbenchDrawer } from '../components/StationWorkbenchDrawer';

// ── Models & Constants ────────────────────────────────────────────────────────

const MODEL_NAMES: { [key: string]: string } = {
  NEMSGLOBAL: 'NEMS Global',
  NEMSGLOBAL_E: 'NEMS-E',
  AS01: 'AS01 (1km)',
  IFS025: 'ECMWF IFS',
  ICON: 'ICON',
  GFS05: 'GFS',
  MFGLOBAL: 'ARPEGE',
  UMGLOBAL10: 'UM Global',
  GEM15: 'GEM',
  AIFS025: 'AIFS (AI)',
  IFSHRES: 'IFS HRES',
};

const WS_COLOR_OPTIONS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

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

function precipColor(mm: number): string {
  if (mm <= 0) return 'transparent';
  if (mm < 0.1) return '#e0f2fe';
  if (mm < 0.5) return '#bae6fd';
  if (mm < 1) return '#7dd3fc';
  if (mm < 2) return '#38bdf8';
  if (mm < 5) return '#10b981';
  if (mm < 10) return '#a3e635';
  if (mm < 20) return '#facc15';
  if (mm < 50) return '#fb923c';
  if (mm < 100) return '#f87171';
  return '#dc2626';
}

function precipTextColor(mm: number): string {
  if (mm <= 0) return '#71717a';
  if (mm < 1) return '#0f172a';
  if (mm < 10) return '#022c22';
  return '#ffffff';
}

function isPointInPolygon(point: [number, number], vs: [number, number][]): boolean {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function StationsMapPage() {
  const { showToast } = useToast();

  // Container refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const hasAutoFittedRef = useRef(false);
  const lastMarkerClickTimeRef = useRef(0);

  // States
  const [mapStyle, setMapStyle] = useState<'satellite' | 'street' | 'dark'>('satellite');
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [selectedStationIdForWorkbench, setSelectedStationIdForWorkbench] = useState<number | null>(null);
  const [activeStationId, setActiveStationId] = useState<number | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'all' | 'watersheds' | 'stations'>('all');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [showStationsLayer, setShowStationsLayer] = useState(true);
  const [showWatershedsLayer, setShowWatershedsLayer] = useState(true);

  // Watershed Drawing State
  const [isDrawingWs, setIsDrawingWs] = useState(false);
  const [wsDrawColor, setWsDrawColor] = useState('#ef4444');
  const [wsDrawPoints, setWsDrawPoints] = useState<[number, number][]>([]);
  const [showNameModal, setShowNameModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [deleteModalZone, setDeleteModalZone] = useState<any | null>(null);

  // Weather Forecast Panel (Bottom Sheet)
  const [selectedZone, setSelectedZone] = useState<any | null>(null);
  const [isForecastSheetMinimized, setIsForecastSheetMinimized] = useState(false);
  const [isForecastPointMode, setIsForecastPointMode] = useState(false);
  const forecastMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Query Stations Data - bóc tách linh hoạt mọi dạng response
  const { data: rawStationsData } = useQuery({
    queryKey: ['stations-list'],
    queryFn: async () => {
      try {
        const res = await api.request<any>('/stations');
        return res;
      } catch (err) {
        console.error('Fetch stations error:', err);
        return [];
      }
    },
    refetchInterval: 30000,
  });

  const stationsData = useMemo<any[]>(() => {
    if (!rawStationsData) return [];
    if (Array.isArray(rawStationsData)) return rawStationsData;
    if (Array.isArray(rawStationsData?.data?.stations)) return rawStationsData.data.stations;
    if (Array.isArray(rawStationsData?.stations)) return rawStationsData.stations;
    if (Array.isArray(rawStationsData?.data)) return rawStationsData.data;
    return [];
  }, [rawStationsData]);

  // Query Watersheds Data - luôn trả về mảng an toàn
  const { data: rawWatershedsData, refetch: refetchWatersheds } = useQuery({
    queryKey: ['watersheds-list'],
    queryFn: async () => {
      try {
        const res = await api.request<any>('/watersheds');
        return res;
      } catch (err) {
        console.error('Fetch watersheds error:', err);
        return [];
      }
    },
  });

  const watershedsData = useMemo<any[]>(() => {
    if (!rawWatershedsData) return [];
    if (Array.isArray(rawWatershedsData)) return rawWatershedsData;
    if (Array.isArray(rawWatershedsData?.data?.zones)) return rawWatershedsData.data.zones;
    if (Array.isArray(rawWatershedsData?.zones)) return rawWatershedsData.zones;
    if (Array.isArray(rawWatershedsData?.data)) return rawWatershedsData.data;
    return [];
  }, [rawWatershedsData]);

  // Query Weather Forecast for selected zone
  const {
    data: weatherData,
    isLoading: isWeatherLoading,
    error: weatherError,
    refetch: refetchWeather,
  } = useQuery({
    queryKey: ['watershed-weather', selectedZone?.id],
    queryFn: async () => {
      if (!selectedZone?.id) return null;
      const res = await api.request<any>(`/watersheds/${selectedZone.id}/forecast`);
      return res?.data || res;
    },
    enabled: !!selectedZone?.id,
  });

  // ── Stable State Refs for Map Event Callbacks ──────────────────────────────
  const watershedsDataRef = useRef(watershedsData);
  watershedsDataRef.current = watershedsData;
  const isDrawingWsRef = useRef(isDrawingWs);
  isDrawingWsRef.current = isDrawingWs;
  const isForecastPointModeRef = useRef(isForecastPointMode);
  isForecastPointModeRef.current = isForecastPointMode;
  const wsDrawColorRef = useRef(wsDrawColor);
  wsDrawColorRef.current = wsDrawColor;

  // ── Smooth glide to specific station (Immediate 1-Click Open) ────────────────
  const handleFlyToStation = useCallback((st: any) => {
    setActiveStationId(st.id);
    // Explicitly close watershed forecast sheet when clicking a station
    setSelectedZone(null);

    // Close all other open popups immediately
    Object.entries(markersMapRef.current).forEach(([idStr, item]) => {
      if (Number(idStr) !== st.id && item.popup.isOpen()) {
        item.popup.remove();
      }
    });

    const map = mapInstanceRef.current;
    if (!map || st.latitude == null || st.longitude == null) return;
    const lat = parseFloat(st.latitude);
    const lng = parseFloat(st.longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    // Smooth glide without aggressive zoom jump
    const currentZoom = map.getZoom();
    const targetZoom = currentZoom < 10 ? 11.5 : Math.min(Math.max(currentZoom, 11), 13);

    map.easeTo({
      center: [lng, lat],
      zoom: targetZoom,
      duration: 500,
      padding: { top: 80, bottom: 80, left: 80, right: 340 },
    });

    const item = markersMapRef.current[st.id];
    if (item) {
      if (!item.popup.isOpen()) {
        item.popup.setLngLat([lng, lat]).addTo(map);
      }
    }
  }, []);

  // ── Select Zone & View Forecast (Immediate 1-Click Open) ─────────────────────
  const handleSelectZone = useCallback((zone: any) => {
    if (!zone) return;

    // Close any open station popups and reset active station
    Object.values(markersMapRef.current).forEach((item) => {
      if (item.popup.isOpen()) item.popup.remove();
    });
    setActiveStationId(null);

    setSelectedZone({ ...zone });
    setIsForecastSheetMinimized(false);

    const map = mapInstanceRef.current;
    if (!map || !zone.coordinates || zone.coordinates.length === 0) return;

    // Fit bounds to zone với padding hợp lý để không bị bottom sheet che
    const bounds = new maplibregl.LngLatBounds();
    zone.coordinates.forEach((pt: [number, number]) => bounds.extend(pt));
    map.fitBounds(bounds, {
      padding: { top: 80, bottom: 280, left: 80, right: 340 },
      maxZoom: 12.5,
      duration: 700,
    });

    // Show Forecast Point Marker
    if (forecastMarkerRef.current) {
      forecastMarkerRef.current.remove();
      forecastMarkerRef.current = null;
    }

    const lat = zone.forecast_lat;
    const lon = zone.forecast_lon;
    if (lat != null && lon != null) {
      const el = document.createElement('div');
      el.className = 'w-6 h-6 rounded-full bg-cyan-400 border-2 border-white shadow-lg animate-bounce flex items-center justify-center';
      el.innerHTML = '<span class="w-2 h-2 rounded-full bg-blue-900"></span>';
      forecastMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map);
    }
  }, []);

  // ── Helper: Init Watershed Layers (Drawing + Main Polygons) ─────────────────
  const initWatershedLayers = useCallback((map: maplibregl.Map) => {
    // 1. Temporary drawing layers
    if (!map.getSource('ws-tmp')) {
      map.addSource('ws-tmp', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getLayer('ws-tmp-fill')) {
      map.addLayer({
        id: 'ws-tmp-fill',
        type: 'fill',
        source: 'ws-tmp',
        paint: {
          'fill-color': wsDrawColorRef.current || '#10b981',
          'fill-opacity': 0.35,
        },
      });
    }
    if (!map.getLayer('ws-tmp-line')) {
      map.addLayer({
        id: 'ws-tmp-line',
        type: 'line',
        source: 'ws-tmp',
        paint: {
          'line-color': wsDrawColorRef.current || '#10b981',
          'line-width': 2.5,
          'line-dasharray': [4, 2],
        },
      });
    }

    // 2. Main Watershed Polygons Layer
    if (!map.getSource('ws-main-src')) {
      map.addSource('ws-main-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getLayer('ws-main-fill')) {
      map.addLayer({
        id: 'ws-main-fill',
        type: 'fill',
        source: 'ws-main-src',
        paint: {
          'fill-color': ['coalesce', ['get', 'color'], '#ef4444'],
          'fill-opacity': 0.35,
        },
      });

      // Attach click and hover listeners to main fill layer
      map.on('click', 'ws-main-fill', (e: any) => {
        if (isDrawingWsRef.current || isForecastPointModeRef.current) return;
        if (Date.now() - lastMarkerClickTimeRef.current < 400) return;
        if (e.features && e.features.length > 0) {
          const targetId = e.features[0].properties?.id;
          const matched = watershedsDataRef.current?.find((w: any) => w.id === targetId);
          if (matched) {
            handleSelectZone(matched);
          }
        }
      });

      map.on('mouseenter', 'ws-main-fill', () => {
        if (!isDrawingWsRef.current && !isForecastPointModeRef.current) map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'ws-main-fill', () => {
        if (!isDrawingWsRef.current && !isForecastPointModeRef.current) map.getCanvas().style.cursor = '';
      });
    }
    if (!map.getLayer('ws-main-line')) {
      map.addLayer({
        id: 'ws-main-line',
        type: 'line',
        source: 'ws-main-src',
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#ef4444'],
          'line-width': 2.5,
          'line-dasharray': [4, 2],
        },
      });
    }
  }, [handleSelectZone]);

  // ── Auto-Zoom Fit Bounds (Gom tất cả Trạm + Lưu vực) ───────────────────────────
  const autoFitAll = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const bounds = new maplibregl.LngLatBounds();
    let pointCount = 0;

    // Gom tọa độ trạm
    if (stationsData && Array.isArray(stationsData)) {
      stationsData.forEach((st: any) => {
        if (st.latitude != null && st.longitude != null) {
          const lat = parseFloat(st.latitude);
          const lng = parseFloat(st.longitude);
          if (!isNaN(lat) && !isNaN(lng)) {
            bounds.extend([lng, lat]);
            pointCount++;
          }
        }
      });
    }

    // Gom tọa độ lưu vực
    if (watershedsData && Array.isArray(watershedsData)) {
      watershedsData.forEach((z: any) => {
        if (z.coordinates && Array.isArray(z.coordinates)) {
          z.coordinates.forEach((pt: any) => {
            if (Array.isArray(pt) && pt.length >= 2) {
              bounds.extend([pt[0], pt[1]]);
              pointCount++;
            }
          });
        }
      });
    }

    if (pointCount > 0) {
      map.fitBounds(bounds, { padding: 90, maxZoom: 13, duration: 1000 });
    }
  }, [stationsData, watershedsData]);

  // ── Render Watershed Polygons ────────────────────────────────────────────────
  const renderAllWatershedPolygons = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) {
      map.once('styledata', () => {
        renderAllWatershedPolygons();
      });
      return;
    }

    initWatershedLayers(map);

    const source = map.getSource('ws-main-src') as maplibregl.GeoJSONSource;
    if (!source) return;

    const data = watershedsDataRef.current;
    if (!showWatershedsLayer || !data || data.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const features = data
      .filter((z: any) => z.coordinates && Array.isArray(z.coordinates) && z.coordinates.length >= 3)
      .map((z: any) => ({
        type: 'Feature',
        id: z.id,
        properties: {
          id: z.id,
          name: z.name,
          color: z.color || '#ef4444',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [z.coordinates],
        },
      }));

    source.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [showWatershedsLayer, initWatershedLayers]);

  // ── Initialize MapLibre GL Single Instance cleanly ──────────────────────────
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    let isSubscribed = true;

    // Clear old instances or residual DOM elements from React double-mount
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (e) {
        // ignore
      }
      mapInstanceRef.current = null;
    }
    container.innerHTML = '';

    let map: maplibregl.Map | null = null;
    try {
      map = new maplibregl.Map({
        container,
        style: MAP_STYLES[mapStyle],
        center: [105.8, 21.0], // Việt Nam
        zoom: 7,
      });

      mapInstanceRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), 'top-left');

      map.on('load', () => {
        if (!isSubscribed || !map) return;
        setIsMapLoaded(true);
        setTimeout(() => {
          if (map) map.resize();
        }, 100);
        initWatershedLayers(map);
        renderAllWatershedPolygons();
      });

      map.on('styledata', () => {
        if (map && typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
          initWatershedLayers(map);
          renderAllWatershedPolygons();
        }
      });
    } catch (err) {
      console.error('Lỗi khi khởi tạo bản đồ MapLibre:', err);
      showToast('Lỗi khởi tạo bản đồ.', 'error');
    }

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.resize();
      }
    });
    resizeObserver.observe(container);

    return () => {
      isSubscribed = false;
      resizeObserver.disconnect();
      if (map) {
        try {
          map.remove();
        } catch (e) {
          // ignore
        }
      }
      if (mapInstanceRef.current === map) {
        mapInstanceRef.current = null;
      }
      setIsMapLoaded(false);
    };
  }, []);

  // ── Auto fit bounds on initial data load ──────────────────────────────────────
  useEffect(() => {
    if (isMapLoaded && !hasAutoFittedRef.current && (stationsData?.length > 0 || watershedsData?.length > 0)) {
      hasAutoFittedRef.current = true;
      autoFitAll();
    }
  }, [isMapLoaded, stationsData, watershedsData, autoFitAll]);

  // ── Switch Map Style ─────────────────────────────────────────────────────────
  const handleStyleChange = (styleKey: 'satellite' | 'street' | 'dark') => {
    setMapStyle(styleKey);
    const map = mapInstanceRef.current;
    if (!map) return;

    map.setStyle(MAP_STYLES[styleKey]);
    map.once('style.load', () => {
      initWatershedLayers(map);
      renderAllWatershedPolygons();
    });
  };

  // ── Station Markers Management ──────────────────────────────────────────────
  const markersMapRef = useRef<{ [id: number]: { marker: maplibregl.Marker; popup: maplibregl.Popup; lng: number; lat: number } }>({});

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isMapLoaded || !stationsData) return;

    // Clear old markers
    Object.values(markersMapRef.current).forEach((item) => item.marker.remove());
    markersMapRef.current = {};

    if (!showStationsLayer) return;

    stationsData.forEach((st: any) => {
      if (st.latitude == null || st.longitude == null) return;
      const lat = parseFloat(st.latitude);
      const lng = parseFloat(st.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      // Find enclosing Watershed Zone for this station
      const enclosingZone = watershedsData?.find(
        (z: any) => z.coordinates && z.coordinates.length >= 3 && isPointInPolygon([lng, lat], z.coordinates)
      );

      // Create Custom Marker DOM Element
      const el = document.createElement('div');
      el.className = 'station-marker group cursor-pointer flex flex-col items-center select-none';
      el.style.zIndex = '30';

      const label = document.createElement('div');
      label.className =
        'px-2.5 py-0.5 rounded-full text-[10px] font-bold text-text-primary bg-white dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-800 shadow-xl whitespace-nowrap mb-1 group-hover:scale-110 group-hover:border-emerald-500 group-hover:text-emerald-500 transition-all backdrop-blur-sm pointer-events-auto cursor-pointer';
      label.textContent = st.name || `Trạm ${st.id}`;

      const dot = document.createElement('div');
      const isOnline = st.is_online || st.status === 'online';
      const isWarning = st.status === 'warning' || st.station_status === 'maintenance';

      dot.className = `w-3.5 h-3.5 rounded-full border-2 border-white shadow-md relative transition-transform group-hover:scale-125 pointer-events-auto cursor-pointer ${
        isOnline
          ? 'bg-emerald-500 animate-pulse'
          : isWarning
          ? 'bg-amber-400'
          : 'bg-zinc-500'
      }`;

      el.appendChild(label);
      el.appendChild(dot);

      // Create Theme-Adaptive Popup HTML
      const popupHtml = document.createElement('div');
      popupHtml.className = 'p-4 bg-white dark:bg-zinc-900 text-text-primary text-xs w-[310px] space-y-3';
      popupHtml.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2.5 pr-8">
          <div class="flex items-center gap-2 min-w-0 pr-2">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-500' : isWarning ? 'bg-amber-400' : 'bg-zinc-500'}"></span>
            <span class="font-extrabold text-sm text-text-primary tracking-wide truncate">${st.name}</span>
          </div>
          <span class="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
            isOnline
              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40'
              : isWarning
              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40'
              : 'bg-white dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800'
          }">
            ${isOnline ? 'Online' : isWarning ? 'Bảo trì' : 'Offline'}
          </span>
        </div>
        <div class="space-y-2 text-slate-500 dark:text-zinc-400 text-xs">
          <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-zinc-400 font-medium">Ký hiệu:</span> <span class="font-mono font-semibold text-text-primary">${st.plant_code || '—'}</span></div>
          <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-zinc-400 font-medium">Lưu vực:</span> ${
            enclosingZone
              ? `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/40 shadow-sm">${enclosingZone.name}</span>`
              : '<span class="text-slate-500 dark:text-zinc-400 italic text-[11px]">Ngoài lưu vực</span>'
          }</div>
          <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-zinc-400 font-medium">Tỉnh thành:</span> <span class="font-medium text-text-primary">${st.province_code || '—'}</span></div>
          <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-zinc-400 font-medium">Tọa độ:</span> <span class="font-mono text-text-primary">${lat.toFixed(4)}, ${lng.toFixed(4)}</span></div>
          <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-zinc-400 font-medium">Lần cuối:</span> <span class="font-mono text-slate-500 dark:text-zinc-400">${st.last_seen_at ? new Date(st.last_seen_at).toLocaleTimeString() : '—'}</span></div>
        </div>
        <div class="pt-2 border-t border-slate-200 dark:border-zinc-800">
          <button id="btn-open-wb-${st.id}" class="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer">
            🛠️ Mở Workbench
          </button>
        </div>
      `;

      const popup = new maplibregl.Popup({
        offset: [0, -20],
        closeButton: true,
        className: 'bambu-map-popup',
      }).setDOMContent(popupHtml);

      popup.on('open', () => {
        // Automatically close all other open station popups
        Object.entries(markersMapRef.current).forEach(([idStr, item]) => {
          if (Number(idStr) !== st.id && item.popup.isOpen()) {
            item.popup.remove();
          }
        });
        setActiveStationId(st.id);
        setSelectedZone(null);

        const btnWb = document.getElementById(`btn-open-wb-${st.id}`);
        if (btnWb) {
          btnWb.onclick = (e) => {
            e.stopPropagation();
            setSelectedStationIdForWorkbench(st.id);
            popup.remove();
          };
        }
      });

      popup.on('close', () => {
        setActiveStationId((cur) => (cur === st.id ? null : cur));
      });

      // 100% direct 1-click handler (no conflicting setPopup toggle)
      const onMarkerClick = (e: Event) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        lastMarkerClickTimeRef.current = Date.now();
        handleFlyToStation(st);
      };

      el.addEventListener('click', onMarkerClick);
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        lastMarkerClickTimeRef.current = Date.now();
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);

      markersMapRef.current[st.id] = { marker, popup, lng, lat };
    });
  }, [stationsData, watershedsData, isMapLoaded, showStationsLayer, handleFlyToStation]);

  useEffect(() => {
    if (watershedsData) {
      renderAllWatershedPolygons();
      const t1 = setTimeout(renderAllWatershedPolygons, 100);
      const t2 = setTimeout(renderAllWatershedPolygons, 400);
      const t3 = setTimeout(renderAllWatershedPolygons, 1000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [watershedsData, isMapLoaded, showWatershedsLayer, renderAllWatershedPolygons]);

  // ── Sync Active Drawing Color with Map Preview in Real-Time ────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isMapLoaded) return;
    try {
      if (map.getLayer('ws-tmp-fill')) {
        map.setPaintProperty('ws-tmp-fill', 'fill-color', wsDrawColor);
      }
      if (map.getLayer('ws-tmp-line')) {
        map.setPaintProperty('ws-tmp-line', 'line-color', wsDrawColor);
      }
    } catch (e) {
      // ignore
    }
  }, [wsDrawColor, isMapLoaded]);

  // ── Watershed Drawing Interactions ──────────────────────────────────────────
  const startDrawWs = () => {
    setIsDrawingWs(true);
    setWsDrawPoints([]);
    setSelectedZone(null);
    showToast('Bắt đầu vẽ: Click trên bản đồ để thêm điểm, Double click để kết thúc.', 'info');
  };

  const cancelDrawWs = () => {
    setIsDrawingWs(false);
    setWsDrawPoints([]);
    const map = mapInstanceRef.current;
    if (map && map.getSource('ws-tmp')) {
      (map.getSource('ws-tmp') as any).setData({ type: 'FeatureCollection', features: [] });
    }
  };

  const finishDrawWs = () => {
    if (wsDrawPoints.length < 3) {
      showToast('Vùng lưu vực cần ít nhất 3 điểm.', 'warning');
      return;
    }
    setShowNameModal(true);
  };

  // Map Click Listener for Drawing and Forecast Point Picking
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isMapLoaded) return;

    const handleClick = (e: any) => {
      const { lng, lat } = e.lngLat;

      // Mode: Picking Forecast Point
      if (isForecastPointMode && selectedZone) {
        updateForecastPointMutation.mutate({
          zoneId: selectedZone.id,
          forecast_lat: lat,
          forecast_lon: lng,
        });
        setIsForecastPointMode(false);
        return;
      }

      // Mode: Drawing Watershed
      if (isDrawingWs) {
        setWsDrawPoints((prev) => {
          const next = [...prev, [lng, lat] as [number, number]];
          // Update temp GeoJSON
          if (map.getSource('ws-tmp')) {
            const feats: any[] = [];
            next.forEach((pt) => feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: pt } }));
            if (next.length >= 2) {
              feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: next } });
            }
            if (next.length >= 3) {
              feats.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...next, next[0]]] } });
            }
            (map.getSource('ws-tmp') as any).setData({ type: 'FeatureCollection', features: feats });
          }
          return next;
        });
      }
    };

    const handleDblClick = (e: any) => {
      if (isDrawingWs) {
        e.preventDefault();
        finishDrawWs();
      }
    };

    map.on('click', handleClick);
    map.on('dblclick', handleDblClick);

    return () => {
      map.off('click', handleClick);
      map.off('dblclick', handleDblClick);
    };
  }, [isDrawingWs, isForecastPointMode, selectedZone, wsDrawPoints]);

  // Mutation: Create Watershed
  const createWatershedMutation = useMutation({
    mutationFn: async (payload: { name: string; color: string; coordinates: [number, number][] }) => {
      return api.request('/watersheds', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (res: any) => {
      showToast('Đã tạo vùng lưu vực mới thành công!', 'success');
      setShowNameModal(false);
      setNewWsName('');
      cancelDrawWs();
      refetchWatersheds();
      const newZone = res?.data || res;
      if (newZone?.id) {
        handleSelectZone(newZone);
      }
    },
    onError: (err: any) => {
      showToast(err.message || 'Lỗi khi tạo lưu vực.', 'error');
    },
  });

  // Mutation: Delete Watershed
  const deleteWatershedMutation = useMutation({
    mutationFn: async (zoneId: number) => {
      return api.request(`/watersheds/${zoneId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      showToast('Đã xóa vùng lưu vực.', 'success');
      setDeleteModalZone(null);
      if (selectedZone?.id === deleteModalZone?.id) {
        setSelectedZone(null);
        if (forecastMarkerRef.current) {
          forecastMarkerRef.current.remove();
          forecastMarkerRef.current = null;
        }
      }
      refetchWatersheds();
    },
    onError: (err: any) => {
      showToast(err.message || 'Lỗi khi xóa vùng lưu vực.', 'error');
    },
  });

  // Mutation: Update Forecast Point
  const updateForecastPointMutation = useMutation({
    mutationFn: async (payload: { zoneId: number; forecast_lat: number; forecast_lon: number }) => {
      return api.request(`/watersheds/${payload.zoneId}/forecast-point`, {
        method: 'PATCH',
        body: JSON.stringify({ forecast_lat: payload.forecast_lat, forecast_lon: payload.forecast_lon }),
      });
    },
    onSuccess: (res: any) => {
      showToast('Đã cập nhật vị trí điểm dự báo thời tiết!', 'success');
      if (selectedZone) {
        setSelectedZone({
          ...selectedZone,
          forecast_lat: res?.data?.forecast_lat || res?.forecast_lat,
          forecast_lon: res?.data?.forecast_lon || res?.forecast_lon,
        });
      }
      refetchWatersheds();
      refetchWeather();
    },
    onError: (err: any) => {
      showToast(err.message || 'Lỗi khi cập nhật điểm dự báo.', 'error');
    },
  });

  // ── Prepare Weather Heatmap Continuous Table ─────────────────────────────────
  const weatherMatrix = useMemo(() => {
    if (!weatherData || !weatherData.time || !weatherData.precipitation) return null;

    const allTimes: string[] = weatherData.time || [];
    const models: string[] = weatherData.models || [];
    const precipPerModel: number[][] = weatherData.precipitation || [];

    // Filter hours starting from current hour
    const now = new Date();
    const curHourStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}`;

    let startIdx = 0;
    for (let i = 0; i < allTimes.length; i++) {
      if (allTimes[i] >= curHourStr) {
        startIdx = i;
        break;
      }
    }

    const filteredIndexes: number[] = [];
    for (let i = startIdx; i < allTimes.length; i++) filteredIndexes.push(i);

    if (filteredIndexes.length === 0) return null;

    // Group into day spans
    const dayGroups: { date: string; label: string; count: number; hours: { timeStr: string; hourNum: string; idx: number }[] }[] = [];
    filteredIndexes.forEach((idx) => {
      const fullStr = allTimes[idx];
      const [dStr, hStr] = fullStr.split(' ');
      const hourNum = hStr ? hStr.split(':')[0] : '00';

      let lastGroup = dayGroups[dayGroups.length - 1];
      if (!lastGroup || lastGroup.date !== dStr) {
        const dObj = new Date(`${dStr}T00:00:00`);
        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        const dayLabel = `${dayNames[dObj.getDay()]} ${dObj.getDate()}/${dObj.getMonth() + 1}`;
        lastGroup = { date: dStr, label: dayLabel, count: 0, hours: [] };
        dayGroups.push(lastGroup);
      }
      lastGroup.count++;
      lastGroup.hours.push({ timeStr: fullStr, hourNum, idx });
    });

    return {
      dayGroups,
      models,
      precipPerModel,
    };
  }, [weatherData]);

  return (
    <div className="relative w-full h-[calc(100vh-64px)] overflow-hidden bg-white dark:bg-zinc-950 flex flex-col">
      {/* ── MAP CONTAINER ── */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* ── TOP RIGHT CONTROLS ── */}
      {/* ── TOP RIGHT CONTROLS & FLOATING SIDEBAR ── */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-3 pointer-events-none">
        {/* Top Control Bar (Theme Glassmorphism) */}
        <div className="bg-white/95 dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-800 rounded-2xl p-1.5 shadow-xl backdrop-blur-md pointer-events-auto flex items-center gap-1.5 flex-wrap">
          {/* Base Map Switchers */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs">
            <button
              onClick={() => handleStyleChange('satellite')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                mapStyle === 'satellite'
                  ? 'bg-emerald-600 !text-white [&_*]:!text-white shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-zinc-800/60'
              }`}
            >
              🛰️ Vệ tinh
            </button>
            <button
              onClick={() => handleStyleChange('street')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                mapStyle === 'street'
                  ? 'bg-emerald-600 !text-white [&_*]:!text-white shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-zinc-800/60'
              }`}
            >
              🗺️ Bản đồ
            </button>
            <button
              onClick={() => handleStyleChange('dark')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                mapStyle === 'dark'
                  ? 'bg-emerald-600 !text-white [&_*]:!text-white shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-zinc-800/60'
              }`}
            >
              📍 Tối giản
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-zinc-950-tertiary mx-0.5" />

          {/* Unified Layer Visibility Toggles (Switch Pill Style) */}
          <button
            onClick={() => setShowStationsLayer(!showStationsLayer)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              showStationsLayer
                ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 shadow-xs'
                : 'bg-slate-100 dark:bg-zinc-950/80 text-slate-400 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 line-through opacity-70'
            }`}
            title="Bật/Tắt hiển thị Trạm đo trên bản đồ"
          >
            {showStationsLayer ? <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5" />}
            Trạm ({stationsData?.length || 0})
          </button>

          <button
            onClick={() => setShowWatershedsLayer(!showWatershedsLayer)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              showWatershedsLayer
                ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 shadow-xs'
                : 'bg-slate-100 dark:bg-zinc-950/80 text-slate-400 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 line-through opacity-70'
            }`}
            title="Bật/Tắt hiển thị Lưu vực trên bản đồ"
          >
            {showWatershedsLayer ? <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5" />}
            Lưu vực ({watershedsData?.length || 0})
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-zinc-950-tertiary mx-0.5" />

          {/* Nút Auto-Zoom Toàn cảnh */}
          <button
            onClick={autoFitAll}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-800 dark:text-white border border-slate-200 dark:border-zinc-800 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="Tự động zoom bao trọn toàn bộ trạm và vùng lưu vực"
          >
            <Maximize2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Toàn cảnh
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-zinc-950-tertiary mx-0.5" />

          {/* Nút Ẩn/Hiện Bảng danh sách */}
          <button
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ${
              isRightPanelOpen
                ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                : 'bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-800 dark:text-white border-slate-200 dark:border-zinc-800'
            }`}
            title={isRightPanelOpen ? 'Thu gọn bảng danh sách' : 'Mở rộng bảng danh sách'}
          >
            <PanelRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            {isRightPanelOpen ? 'Thu gọn' : 'Hiện bảng'}
          </button>
        </div>

        {/* Watershed Zones & Stations Floating Panel */}
        {isRightPanelOpen ? (
          <div className="bg-white/95 dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md pointer-events-auto w-84 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-200 text-slate-900 dark:text-white">
            {/* Header: Tabs + Close Button */}
            <div className="flex items-center gap-1.5">
              <div className="grid grid-cols-3 p-0.5 bg-slate-100 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 text-[11px] flex-1">
                <button
                  onClick={() => setRightPanelTab('all')}
                  className={`py-1.5 font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    rightPanelTab === 'all'
                      ? 'bg-emerald-600 !text-white [&_*]:!text-white shadow-sm'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Layers className="w-3 h-3 text-current" />
                  Tất cả
                </button>
                <button
                  onClick={() => setRightPanelTab('watersheds')}
                  className={`py-1.5 font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    rightPanelTab === 'watersheds'
                      ? 'bg-emerald-600 !text-white [&_*]:!text-white shadow-sm'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <CloudRain className="w-3 h-3 text-current" />
                  Lưu vực ({watershedsData?.length || 0})
                </button>
                <button
                  onClick={() => setRightPanelTab('stations')}
                  className={`py-1.5 font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    rightPanelTab === 'stations'
                      ? 'bg-emerald-600 !text-white [&_*]:!text-white shadow-sm'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Cpu className="w-3 h-3 text-current" />
                  Trạm ({stationsData?.length || 0})
                </button>
              </div>

              {/* Nút Đóng / Thu gọn Panel */}
              <button
                onClick={() => setIsRightPanelOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-all flex-shrink-0 cursor-pointer"
                title="Đóng bảng danh sách"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          {/* TAB: ALL (Hiển thị đồng thời cả Lưu vực & Trạm) */}
          {rightPanelTab === 'all' && (
            <div className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
              {/* Section 1: Watersheds */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-slate-700 dark:text-white font-bold text-[11px] uppercase tracking-wider px-1">
                  <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
                    <CloudRain className="w-3.5 h-3.5" /> Vùng Lưu Vực ({watershedsData?.length || 0})
                  </span>
                  {!isDrawingWs && (
                    <button
                      onClick={startDrawWs}
                      className="px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-600 dark:bg-emerald-500/20 dark:hover:bg-emerald-600 text-emerald-700 hover:text-white dark:text-emerald-400 dark:hover:text-white border border-emerald-200 dark:border-emerald-500/40 text-[11px] font-bold flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Vẽ mới
                    </button>
                  )}
                </div>

                {!Array.isArray(watershedsData) || watershedsData.length === 0 ? (
                  <p className="text-slate-400 dark:text-zinc-400 text-[11px] text-center py-1">Chưa có lưu vực nào.</p>
                ) : (
                  watershedsData.map((z: any) => (
                    <div
                      key={`all-ws-${z.id}`}
                      onClick={() => handleSelectZone(z)}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                        selectedZone?.id === z.id
                          ? 'bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-500/50 text-emerald-700 dark:text-white font-bold ring-1 ring-emerald-500'
                          : 'hover:bg-slate-100/70 dark:hover:bg-zinc-800/60 text-slate-900 dark:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: z.color || '#ef4444' }} />
                        <span className="truncate text-xs">{z.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteModalZone(z);
                        }}
                        className="p-1 rounded-lg bg-rose-50 hover:bg-rose-600 dark:bg-rose-500/10 dark:hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 dark:border-rose-500/30 transition-all cursor-pointer flex items-center justify-center shadow-xs"
                        title="Xóa vùng"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-current" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Draw Watershed Controls if drawing */}
              {isDrawingWs && (
                <div className="space-y-2 bg-slate-50 dark:bg-zinc-950/80 p-2.5 rounded-xl border border-emerald-500/40">
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold text-center">
                    Click thêm điểm • Double-click kết thúc
                  </p>
                  <div className="flex items-center justify-center gap-2 py-1">
                    {WS_COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setWsDrawColor(c)}
                        className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                          wsDrawColor === c ? 'scale-125 ring-2 ring-emerald-500 shadow-md' : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={finishDrawWs}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      Hoàn thành
                    </button>
                    <button
                      onClick={cancelDrawWs}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-zinc-950-tertiary text-slate-700 dark:text-white font-bold rounded-lg transition-colors text-xs cursor-pointer"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              <div className="h-px bg-slate-200 dark:bg-zinc-950-tertiary my-2" />

              {/* Section 2: Stations in All Tab */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-slate-700 dark:text-white font-bold text-[11px] uppercase tracking-wider px-1">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Cpu className="w-3.5 h-3.5" /> Trạm Quan Trắc ({stationsData?.length || 0})
                  </span>
                </div>

                {!Array.isArray(stationsData) || stationsData.length === 0 ? (
                  <p className="text-slate-400 dark:text-zinc-400 text-[11px] text-center py-1">Chưa có trạm đo nào.</p>
                ) : (
                  stationsData.map((st: any) => {
                    const isOnline = st.is_online || st.status === 'online';
                    return (
                      <div
                        key={`all-st-${st.id}`}
                        onClick={() => handleFlyToStation(st)}
                        className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                          activeStationId === st.id
                            ? 'bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-500/50 text-emerald-700 dark:text-white font-bold ring-1 ring-emerald-500'
                            : 'hover:bg-slate-100/70 dark:hover:bg-zinc-800/60 text-slate-900 dark:text-white border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              isOnline ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <div className="truncate">
                            <span className="truncate text-xs block font-bold text-slate-900 dark:text-white">{st.name}</span>
                            <span className="text-[10px] text-slate-400 dark:text-zinc-400 font-mono">
                              {st.plant_code || `ST-${st.id}`} • {st.province_code || 'N/A'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStationIdForWorkbench(st.id);
                          }}
                          className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-emerald-600 dark:bg-zinc-950 dark:hover:bg-emerald-600 text-slate-700 hover:text-white dark:text-zinc-400 dark:hover:text-white border border-slate-200 dark:border-zinc-800 text-[11px] font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          Chi tiết
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: WATERSHEDS ONLY */}
          {rightPanelTab === 'watersheds' && (
            <div className="space-y-3">
              {/* Zones List */}
              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                {!Array.isArray(watershedsData) || watershedsData.length === 0 ? (
                  <p className="text-slate-400 dark:text-zinc-400 text-[11px] text-center py-2">Chưa có vùng lưu vực nào.</p>
                ) : (
                  watershedsData.map((z: any) => (
                    <div
                      key={`ws-tab-${z.id}`}
                      onClick={() => handleSelectZone(z)}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                        selectedZone?.id === z.id
                          ? 'bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-500/50 text-emerald-700 dark:text-white font-bold ring-1 ring-emerald-500'
                          : 'hover:bg-slate-100/70 dark:hover:bg-zinc-800/60 text-slate-900 dark:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: z.color || '#ef4444' }} />
                        <span className="truncate text-xs">{z.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteModalZone(z);
                        }}
                        className="p-1 rounded-lg bg-rose-50 hover:bg-rose-600 dark:bg-rose-500/10 dark:hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 dark:border-rose-500/30 transition-all cursor-pointer flex items-center justify-center shadow-xs"
                        title="Xóa vùng"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-current" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: STATIONS ONLY */}
          {rightPanelTab === 'stations' && (
            <div className="space-y-3">
              <div className="max-h-[calc(100vh-250px)] overflow-y-auto space-y-1.5 pr-1">
                {!stationsData || stationsData.length === 0 ? (
                  <p className="text-slate-400 dark:text-zinc-400 text-[11px] text-center py-4">Không tìm thấy trạm đo nào.</p>
                ) : (
                  stationsData.map((st: any) => {
                    const isOnline = st.is_online || st.status === 'online';
                    return (
                      <div
                        key={`st-tab-${st.id}`}
                        onClick={() => handleFlyToStation(st)}
                        className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                          activeStationId === st.id
                            ? 'bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-500/50 text-emerald-700 dark:text-white font-bold ring-1 ring-emerald-500'
                            : 'hover:bg-slate-100/70 dark:hover:bg-zinc-800/60 text-slate-900 dark:text-white border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              isOnline ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <div className="truncate">
                            <p className="font-bold text-slate-900 dark:text-white text-xs truncate">{st.name}</p>
                            <p className="text-[10px] text-slate-400 dark:text-zinc-400 truncate">{st.plant_code || st.province_code || '—'}</p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStationIdForWorkbench(st.id);
                          }}
                          className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-emerald-600 dark:bg-zinc-950 dark:hover:bg-emerald-600 text-slate-700 hover:text-white dark:text-zinc-400 dark:hover:text-white border border-slate-200 dark:border-zinc-800 text-[11px] font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          Chi tiết
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Sleek Mini-Button when collapsed */
        <button
          onClick={() => setIsRightPanelOpen(true)}
          className="bg-white/95 dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-800 rounded-2xl px-3.5 py-2.5 shadow-xl backdrop-blur-md pointer-events-auto text-xs font-bold text-slate-800 dark:text-white hover:text-emerald-600 hover:border-emerald-500/50 flex items-center gap-2 transition-all group animate-in fade-in duration-200 self-end cursor-pointer"
          title="Mở bảng danh sách trạm & lưu vực"
        >
          <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
          <span>Danh sách ({stationsData?.length || 0} trạm, {watershedsData?.length || 0} lưu vực)</span>
          <ChevronLeft className="w-4 h-4 text-slate-400 dark:text-zinc-400 group-hover:text-emerald-500 transition-colors" />
        </button>
      )}
      </div>

      {/* ── BOTTOM LEFT LEGEND ── */}
      <div className="absolute bottom-6 left-6 z-10 bg-white dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs space-y-1.5">
        <div className="flex items-center gap-2 text-text-primary">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <span>Trạm Online</span>
        </div>
        <div className="flex items-center gap-2 text-text-primary">
          <span className="w-3 h-3 rounded-full bg-amber-400" />
          <span>Cảnh báo / Bảo trì</span>
        </div>
        <div className="flex items-center gap-2 text-text-primary">
          <span className="w-3 h-3 rounded-full bg-zinc-500" />
          <span>Trạm Offline</span>
        </div>
      </div>

      {/* ── WEATHER FORECAST MINI-BAR OR BOTTOM SHEET ── */}
      {selectedZone && isForecastSheetMinimized && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-white dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl backdrop-blur-md px-4 py-2 flex items-center gap-4 animate-in slide-in-from-bottom duration-200 pointer-events-auto">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedZone.color || '#ef4444' }} />
            <span className="font-bold text-text-primary tracking-wide">Lưu vực: {selectedZone.name}</span>
            <span className="hidden sm:inline text-slate-500 dark:text-zinc-400 text-[11px]">| Dự báo thời tiết Meteoblue</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsForecastSheetMinimized(false)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow transition-all cursor-pointer"
            >
              <ChevronUp className="w-4 h-4" /> Mở chi tiết
            </button>
            <button
              onClick={() => {
                setSelectedZone(null);
                if (forecastMarkerRef.current) {
                  forecastMarkerRef.current.remove();
                  forecastMarkerRef.current = null;
                }
              }}
              className="p-1.5 text-slate-500 dark:text-zinc-400 hover:text-text-primary rounded-lg hover:bg-slate-100 dark:bg-zinc-800 transition-colors"
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {selectedZone && !isForecastSheetMinimized && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-white dark:bg-zinc-900/98 border-t border-slate-200 dark:border-zinc-800 shadow-2xl backdrop-blur-lg flex flex-col max-h-[55%] animate-in slide-in-from-bottom duration-300 pointer-events-auto">
          {/* Header */}
          <div className="p-3 px-6 border-b border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: selectedZone.color || '#ef4444' }} />
              <div>
                <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-2">
                  Dự báo Mưa: {selectedZone.name}
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                  {selectedZone.forecast_lat != null && selectedZone.forecast_lon != null
                    ? `${Number(selectedZone.forecast_lat).toFixed(4)}°N, ${Number(selectedZone.forecast_lon).toFixed(4)}°E (Điểm dự báo)`
                    : 'Tọa độ: Centroid lưu vực'}
                </span>
              </div>
            </div>

            {/* Actions & Rainfall Legend */}
            <div className="flex items-center flex-wrap gap-3 ml-auto">
              {/* Rain Scale Legend */}
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-text-primary bg-white dark:bg-zinc-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800">
                <span className="font-bold mr-1 text-slate-500 dark:text-zinc-400">Mưa (mm):</span>
                <span className="px-1.5 py-0.5 rounded text-black font-bold" style={{ backgroundColor: '#bae6fd' }}>&lt;0.5</span>
                <span className="px-1.5 py-0.5 rounded text-black font-bold" style={{ backgroundColor: '#7dd3fc' }}>1</span>
                <span className="px-1.5 py-0.5 rounded text-black font-bold" style={{ backgroundColor: '#38bdf8' }}>2</span>
                <span className="px-1.5 py-0.5 rounded text-white font-bold" style={{ backgroundColor: '#10b981' }}>5</span>
                <span className="px-1.5 py-0.5 rounded text-black font-bold" style={{ backgroundColor: '#facc15' }}>20</span>
                <span className="px-1.5 py-0.5 rounded text-white font-bold" style={{ backgroundColor: '#fb923c' }}>50</span>
                <span className="px-1.5 py-0.5 rounded text-white font-bold" style={{ backgroundColor: '#dc2626' }}>100+</span>
              </div>

              {/* Pin Forecast Point Button */}
              <button
                onClick={() => {
                  setIsForecastPointMode(!isForecastPointMode);
                  if (!isForecastPointMode) {
                    showToast('Click 1 điểm trên bản đồ để đặt lại tọa độ dự báo.', 'info');
                  }
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 ${
                  isForecastPointMode
                    ? 'bg-cyan-500 text-white border-cyan-400 shadow-lg'
                    : 'bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:bg-zinc-800 text-text-primary'
                }`}
              >
                <Crosshair className={`w-3.5 h-3.5 ${isForecastPointMode ? 'animate-spin' : 'text-cyan-500'}`} />
                {isForecastPointMode ? 'Đang chọn điểm...' : 'Chấm điểm dự báo'}
              </button>

              {/* Toggle Minimize/Maximize (Large 36px hitbox) */}
              <button
                onClick={() => setIsForecastSheetMinimized(true)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 dark:text-zinc-400 hover:text-text-primary hover:bg-slate-100 dark:bg-zinc-800 transition-colors"
                title="Thu nhỏ bảng xuống Mini-Bar"
              >
                <ChevronDown className="w-5 h-5" />
              </button>

              {/* Close Button (Large 36px hitbox) */}
              <button
                onClick={() => {
                  setSelectedZone(null);
                  if (forecastMarkerRef.current) {
                    forecastMarkerRef.current.remove();
                    forecastMarkerRef.current = null;
                  }
                }}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 dark:text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                title="Đóng bảng dự báo"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Matrix Content Body */}
          {!isForecastSheetMinimized && (
            <div className="p-4 overflow-auto flex-1 min-h-0">
              {isWeatherLoading ? (
                <div className="py-16 text-center text-slate-500 dark:text-zinc-400 space-y-2">
                  <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs">Đang tải dữ liệu dự báo khí tượng 11 mô hình từ Meteoblue...</p>
                </div>
              ) : weatherError || !weatherMatrix ? (
                <div className="py-12 text-center text-slate-500 dark:text-zinc-400 space-y-2">
                  <Info className="w-8 h-8 mx-auto text-amber-400 opacity-60" />
                  <p className="text-xs text-text-primary font-semibold">Chưa có dữ liệu dự báo cho vùng này</p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Kiểm tra API Key Meteoblue hoặc bấm nút "Chấm điểm dự báo" để nạp lại tọa độ.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="border-collapse text-[11px] whitespace-nowrap min-w-max mx-auto">
                    <thead>
                      {/* Row 1: Day Spans */}
                      <tr className="bg-white dark:bg-zinc-950 text-text-primary border-b border-slate-200 dark:border-zinc-800 font-bold">
                        <th className="sticky left-0 z-20 bg-white dark:bg-zinc-950 p-2 text-left border-r border-slate-200 dark:border-zinc-800 min-w-[110px]">
                          Mô hình
                        </th>
                        {weatherMatrix.dayGroups.map((dg, gIdx) => (
                          <th
                            key={gIdx}
                            colSpan={dg.count}
                            className="p-2 text-center border-r border-slate-200 dark:border-zinc-800 bg-slate-100/60 dark:bg-zinc-800/40"
                          >
                            {dg.label}
                          </th>
                        ))}
                      </tr>
                      {/* Row 2: Hours */}
                      <tr className="bg-white dark:bg-zinc-950/90 text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 text-[10px]">
                        <th className="sticky left-0 z-20 bg-white dark:bg-zinc-950/95 p-1.5 text-left border-r border-slate-200 dark:border-zinc-800">
                          Múi giờ UTC+7
                        </th>
                        {weatherMatrix.dayGroups.flatMap((dg) =>
                          dg.hours.map((h, hIdx) => (
                            <th
                              key={`${dg.date}-${hIdx}`}
                              className="w-7 p-1 text-center font-mono border-r border-slate-200 dark:border-zinc-800/40"
                            >
                              {h.hourNum}h
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {weatherMatrix.models.map((mKey, mIdx) => {
                        const mName = MODEL_NAMES[mKey] || mKey;
                        const modelPrecip = weatherMatrix.precipPerModel[mIdx] || [];
                        return (
                          <tr key={mKey} className="hover:bg-slate-100 dark:bg-zinc-800/20 transition-colors border-b border-slate-200 dark:border-zinc-800/30">
                            <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 p-2 font-semibold text-text-primary border-r border-slate-200 dark:border-zinc-800 text-xs">
                              {mName}
                            </td>
                            {weatherMatrix.dayGroups.flatMap((dg) =>
                              dg.hours.map((h) => {
                                const val = modelPrecip[h.idx] ?? 0;
                                const bg = precipColor(val);
                                const txt = precipTextColor(val);
                                return (
                                  <td
                                    key={h.idx}
                                    className="w-7 h-6 p-0 text-center font-mono text-[10px] border-r border-slate-200 dark:border-zinc-800/30"
                                    title={`${mName} lúc ${h.timeStr}: ${val} mm`}
                                  >
                                    <div
                                      className="w-full h-full flex items-center justify-center font-bold"
                                      style={{ backgroundColor: bg, color: txt }}
                                    >
                                      {val > 0 ? (val >= 10 ? Math.round(val) : val.toFixed(1)) : ''}
                                    </div>
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: SAVE WATERSHED NAME ── */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <CloudRain className="w-4 h-4 text-emerald-500" /> Đặt tên vùng lưu vực
            </h3>
            <div>
              <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Tên lưu vực</label>
              <input
                type="text"
                autoFocus
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="VD: Lưu vực Nậm Mu"
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-text-primary focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNameModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-zinc-800 text-text-primary hover:bg-white dark:bg-zinc-950 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (!newWsName.trim()) {
                    showToast('Vui lòng nhập tên lưu vực.', 'warning');
                    return;
                  }
                  createWatershedMutation.mutate({
                    name: newWsName.trim(),
                    color: wsDrawColor,
                    coordinates: [...wsDrawPoints, wsDrawPoints[0]],
                  });
                }}
                disabled={createWatershedMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
              >
                {createWatershedMutation.isPending ? 'Đang lưu...' : 'Lưu lưu vực'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRM DELETE WATERSHED ── */}
      {deleteModalZone && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              ⚠️ Xác nhận xóa lưu vực
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Bạn có chắc chắn muốn xóa vùng lưu vực <strong className="text-text-primary">"{deleteModalZone.name}"</strong> không? Dữ liệu dự báo liên quan sẽ bị xóa bỏ.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteModalZone(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-zinc-800 text-text-primary hover:bg-white dark:bg-zinc-950 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => deleteWatershedMutation.mutate(deleteModalZone.id)}
                disabled={deleteWatershedMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors"
              >
                {deleteWatershedMutation.isPending ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DRAWER: STATION WORKBENCH ── */}
      {selectedStationIdForWorkbench && (
        <StationWorkbenchDrawer
          stationId={selectedStationIdForWorkbench}
          onClose={() => setSelectedStationIdForWorkbench(null)}
        />
      )}
    </div>
  );
}
