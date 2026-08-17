import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wrench,
  X,
  Maximize2,
  Minimize2,
  RefreshCw,
  Power,
  Bug,
  ShieldCheck,
  Wifi,
  Sliders,
  Database,
  FileEdit,
  Radio,
  Plus,
  Trash2,
  Save,
  Layers,
  Cpu,
  Eye,
  Download,
  CheckCircle2,
  Calendar,
  Table as TableIcon,
  Activity,
  Zap,
  Copy,
  Check,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface StationWorkbenchDrawerProps {
  stationId: number;
  onClose: () => void;
}

const PROVINCES = [
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

export function StationWorkbenchDrawer({ stationId, onClose }: StationWorkbenchDrawerProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const canManage = user?.is_superuser || user?.role === 'engineer' || user?.role === 'admin';

  // Layout & Navigation states
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<'sensors' | 'readings' | 'station' | 'mqtt'>('sensors');

  // Add Sensor Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [selectedSensorType, setSelectedSensorType] = useState<
    'analog' | 'encoder' | 'di' | 'rs485_1' | 'rs485_2' | 'tcp' | 'iec'
  >('analog');
  const [newSensorForm, setNewSensorForm] = useState({
    channel_code: '',
    name: '',
    unit: '',
    calc_mode: 'weight',
    weight: '1',
    slave_id: '1',
    register_address: '0',
    function_code: '03',
    data_type: 'float32',
    register_order: 'BE',
    poll_interval_sec: '5',
    host: '',
    port: '502',
    obis_code: '1-0:1.8.0',
    baudrate: '9600',
  });

  // Tab 4 (MQTT & Connectivity) form states
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [copiedPass, setCopiedPass] = useState(false);
  const [firmwareFile, setFirmwareFile] = useState<File | null>(null);
  const [isUploadingFw, setIsUploadingFw] = useState(false);
  const [isOtaLoading, setIsOtaLoading] = useState(false);
  const debugModeRef = useRef(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    '[Hệ thống] Kết nối bảng điều khiển trạm thành công.',
    '[MQTT] Sẵn sàng nhận dữ liệu thời gian thực.',
  ]);

  // Tab 3 (Station Edit) form states
  const [stationForm, setStationForm] = useState({
    name: '',
    plant_code: '',
    province_code: 'LCA',
    latitude: '',
    longitude: '',
  });

  // Channel states for Tab 1 (Sensors)
  const [channelsState, setChannelsState] = useState<{
    analog: any[];
    encoder: any[];
    di: any[];
    rs485_1: any[];
    rs485_2: any[];
    tcp: any[];
    iec: any[];
    deleted: Array<{ id: number; type: string }>;
  }>({
    analog: [],
    encoder: [],
    di: [],
    rs485_1: [],
    rs485_2: [],
    tcp: [],
    iec: [],
    deleted: [],
  });

  // Query Workbench Data
  const { data: wbData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['station-workbench', stationId],
    queryFn: async () => {
      const res = await api.request<any>(`/stations/${stationId}/workbench`);
      return res?.data || res;
    },
  });

  // Synchronize state when data loads
  useEffect(() => {
    if (wbData?.station) {
      setStationForm({
        name: wbData.station.name || '',
        plant_code: wbData.station.plant_code || '',
        province_code: wbData.station.province_code || 'LCA',
        latitude: wbData.station.latitude ? String(wbData.station.latitude) : '',
        longitude: wbData.station.longitude ? String(wbData.station.longitude) : '',
      });
      // Pre-fill WiFi SSID from device info
      if (wbData.station.device?.wifi_ssid) setWifiSsid(wbData.station.device.wifi_ssid);
    }
    if (wbData) {
      setChannelsState({
        analog: (wbData.analog_channels || []).filter((c: any) => c.is_active),
        encoder: (wbData.encoder_channels || []).filter((c: any) => c.is_active),
        di: (wbData.digital_inputs || []).filter((c: any) => c.is_active),
        rs485_1: wbData.rs485_bus1_sensors || [],
        rs485_2: wbData.rs485_bus2_sensors || [],
        tcp: wbData.modbus_tcp_sensors || [],
        iec: wbData.iec62056_sensors || [],
        deleted: [],
      });
    }
  }, [wbData]);

  // Real-time WebSocket Event Listener for Terminal Logs
  useEffect(() => {
    const handleWsMsg = (e: CustomEvent<any>) => {
      const msg = e.detail;
      if (!msg) return;

      const now = new Date().toLocaleTimeString();
      if (msg.station_id === stationId || Number(msg.station_id) === Number(stationId)) {
        if (msg.type === 'sensor_data') {
          const groupCount = Object.keys(msg.data || {}).length;
          setTerminalLogs((prev) => [
            ...prev.slice(-49),
            `[${now}] [MQTT] Nhận bản tin cảm biến realtime (${groupCount} nhóm kênh).`,
          ]);
        } else if (msg.type === 'ota_log') {
          setTerminalLogs((prev) => [
            ...prev.slice(-49),
            `[${now}] [OTA] ${msg.message || 'Tiến trình OTA cập nhật'}`,
          ]);
        } else if (msg.type === 'station_status') {
          setTerminalLogs((prev) => [
            ...prev.slice(-49),
            `[${now}] [Trạng thái] Trạm chuyển sang: ${msg.status?.toUpperCase() || msg.status}`,
          ]);
        } else if (msg.type === 'station_alert') {
          setTerminalLogs((prev) => [
            ...prev.slice(-49),
            `[${now}] [CẢNH BÁO] ${msg.message}`,
          ]);
        }
      }
    };

    window.addEventListener('station-ws-message', handleWsMsg as EventListener);
    return () => {
      window.removeEventListener('station-ws-message', handleWsMsg as EventListener);
    };
  }, [stationId]);

  // Keep ref in sync with latest debug_mode so cleanup can read it without stale closure
  useEffect(() => {
    debugModeRef.current = wbData?.station?.debug_mode ?? false;
  }, [wbData?.station?.debug_mode]);

  // Auto-disable debug when drawer unmounts (mirrors Django beforeunload sendBeacon)
  useEffect(() => {
    return () => {
      if (debugModeRef.current) {
        api.request(`/stations/${stationId}/cmd`, {
          method: 'POST',
          body: JSON.stringify({ action: 'toggle_debug', enabled: false }),
        }).catch(() => {});
      }
    };
  }, [stationId]);

  const station = wbData?.station;
  const lastReadings = wbData?.last_readings || {};

  // Tab 2: Readings Preview & Chart states
  const getTodayStr = () => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  };
  const [exportDateFrom, setExportDateFrom] = useState(getTodayStr());
  const [exportDateTo, setExportDateTo] = useState(getTodayStr());
  const [exportFreq, setExportFreq] = useState('1m');
  const [exportIngest, setExportIngest] = useState('all');
  const [exportPayload, setExportPayload] = useState<any | null>(null);
  const [isExportLoading, setIsExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Load preview data from export-api endpoint
  const handleLoadPreviewData = async () => {
    setIsExportLoading(true);
    setExportError(null);
    try {
      const params = new URLSearchParams({
        from: exportDateFrom,
        to: exportDateTo,
        frequency: exportFreq,
        ingest: exportIngest,
      });
      const res = await api.request<any>(`/stations/${stationId}/readings/export-api?${params.toString()}`);
      const payload = res?.data || res;
      setExportPayload(payload);
      if (payload.row_count === 0) {
        showToast('Không có dữ liệu đo trong khoảng thời gian đã chọn.', 'info');
      }
    } catch (err: any) {
      setExportError(err.message || 'Lỗi khi tải dữ liệu đo.');
      showToast(err.message || 'Lỗi khi tải dữ liệu đo.', 'error');
    } finally {
      setIsExportLoading(false);
    }
  };

  // Auto fetch preview once tab readings is opened
  useEffect(() => {
    if (activeTab === 'readings' && !exportPayload && !isExportLoading) {
      handleLoadPreviewData();
    }
  }, [activeTab]);

  // Export CSV/XLSX
  const handleDownloadExcel = () => {
    if (!exportPayload || !exportPayload.rows || exportPayload.rows.length === 0) {
      showToast('Không có dữ liệu để xuất file.', 'warning');
      return;
    }
    const cols = exportPayload.columns || [];
    const rows = exportPayload.rows || [];

    // Header 1: Sensor group / Title
    const head1 = cols.map((c: any) => `"${(c.group || c.title || '').replace(/"/g, '""')}"`).join(',');
    // Header 2: Sub-column (raw/real)
    const head2 = cols.map((c: any) => `"${(c.group ? (c.sub || '') : '').replace(/"/g, '""')}"`).join(',');

    const csvRows = [head1, head2];
    rows.forEach((r: any) => {
      const rowVals = cols.map((c: any) => {
        const v = r[c.key];
        if (v === undefined || v === null) return '""';
        return `"${String(v).replace(/"/g, '""')}"`;
      });
      csvRows.push(rowVals.join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${station?.name || 'station'}_readings_${exportDateFrom}_${exportDateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Đã tải xuống tệp dữ liệu đo thành công.', 'success');
  };

  // Mutation: Send Command (sync_config, restart, toggle_debug, reregister_mqtt, update_wifi)
  const sendCmdMutation = useMutation({
    mutationFn: async (payload: { action: string; [key: string]: any }) => {
      return api.request(`/stations/${stationId}/cmd`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (res: any, variables) => {
      const msg = res?.data?.message || res?.message || 'Đã thực hiện lệnh thành công.';
      showToast(msg, 'success');
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Lệnh "${variables.action}" đã hoàn tất: ${msg}`,
      ]);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['stations-list'] });
    },
    onError: (err: any) => {
      showToast(err.message || 'Lỗi khi gửi lệnh xuống trạm.', 'error');
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] LỖI: ${err.message || 'Thất bại.'}`,
      ]);
    },
  });

  // Mutation: Save All Channels
  const saveChannelsMutation = useMutation({
    mutationFn: async () => {
      return api.request(`/stations/${stationId}/channels`, {
        method: 'POST',
        body: JSON.stringify(channelsState),
      });
    },
    onSuccess: () => {
      showToast('Đã lưu và đồng bộ toàn bộ cấu hình cảm biến thành công!', 'success');
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Đã lưu & đẩy cấu hình cảm biến xuống MQTT.`,
      ]);
      refetch();
    },
    onError: (err: any) => {
      showToast(err.message || 'Không thể lưu cấu hình cảm biến.', 'error');
    },
  });

  // Mutation: Update Station Metadata
  const updateStationMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: stationForm.name.trim(),
        plant_code: stationForm.plant_code.trim(),
        province_code: stationForm.province_code,
        latitude: stationForm.latitude ? parseFloat(stationForm.latitude) : null,
        longitude: stationForm.longitude ? parseFloat(stationForm.longitude) : null,
      };
      return api.request(`/stations/${stationId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      showToast('Đã cập nhật thông tin trạm thành công!', 'success');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['stations-list'] });
    },
    onError: (err: any) => {
      showToast(err.message || 'Lỗi khi cập nhật thông tin trạm.', 'error');
    },
  });

  // Helper to handle deleting/deactivating a sensor row
  const handleDeleteSensor = (type: string, id: number, channelCode: string) => {
    if (type === 'analog' || type === 'encoder' || type === 'di') {
      const list = (channelsState as any)[type] as any[];
      const updated = list.map((c) => (c.channel_code === channelCode ? { ...c, is_active: false } : c));
      setChannelsState({
        ...channelsState,
        [type]: updated.filter((c) => c.is_active),
      });
      showToast(`Đã hủy kích hoạt kênh ${channelCode}. Bấm "Lưu cấu hình" để cập nhật.`, 'info');
    } else {
      const list = (channelsState as any)[type] as any[];
      setChannelsState({
        ...channelsState,
        [type]: list.filter((c) => c.id !== id),
        deleted: [...channelsState.deleted, { id, type }],
      });
      showToast(`Đã xóa sensor. Bấm "Lưu cấu hình" để cập nhật.`, 'info');
    }
  };

  // Helper to add new sensor from modal
  const handleConfirmAddSensor = () => {
    if (selectedSensorType === 'analog' || selectedSensorType === 'encoder' || selectedSensorType === 'di') {
      const allFixed =
        selectedSensorType === 'analog'
          ? wbData?.analog_channels || []
          : selectedSensorType === 'encoder'
          ? wbData?.encoder_channels || []
          : wbData?.digital_inputs || [];

      const target = allFixed.find((c: any) => c.channel_code === newSensorForm.channel_code);
      if (target) {
        const activated = {
          ...target,
          display_name: newSensorForm.name,
          unit: newSensorForm.unit,
          calc_mode: newSensorForm.calc_mode,
          weight: newSensorForm.weight,
          is_active: true,
        };
        const currentList = (channelsState as any)[selectedSensorType] as any[];
        const filtered = currentList.filter((c) => c.channel_code !== newSensorForm.channel_code);
        setChannelsState({
          ...channelsState,
          [selectedSensorType]: [...filtered, activated],
        });
      }
    } else {
      const newDynamic = {
        id: -Date.now(),
        channel_code: newSensorForm.channel_code || `D${Date.now() % 100}`,
        display_name: newSensorForm.name,
        unit: newSensorForm.unit,
        calc_mode: newSensorForm.calc_mode,
        weight: newSensorForm.weight,
        slave_id: newSensorForm.slave_id,
        register_address: newSensorForm.register_address,
        function_code: newSensorForm.function_code,
        data_type: newSensorForm.data_type,
        register_order: newSensorForm.register_order,
        poll_interval_sec: newSensorForm.poll_interval_sec,
        host: newSensorForm.host,
        port: newSensorForm.port,
        obis_code: newSensorForm.obis_code,
        baudrate: newSensorForm.baudrate,
      };
      const currentList = (channelsState as any)[selectedSensorType] as any[];
      setChannelsState({
        ...channelsState,
        [selectedSensorType]: [...currentList, newDynamic],
      });
    }

    setShowAddModal(false);
    setAddStep(1);
    showToast(`Đã thêm sensor "${newSensorForm.name}". Vui lòng bấm "Lưu cấu hình" để lưu lại!`, 'success');
  };

  const isOnline = station?.is_online || station?.status === 'online';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Drawer Panel */}
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div
          className={`w-screen transition-all duration-300 ${
            isMaximized ? 'max-w-full' : 'max-w-5xl lg:max-w-6xl'
          } bg-white dark:bg-zinc-950 border-l border-slate-200 dark:border-zinc-800 shadow-2xl flex flex-col text-slate-900 dark:text-white`}
        >
          {/* Header */}
          <div className="px-6 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50 dark:bg-zinc-900 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                    Workbench: {station?.name || 'Đang tải...'}
                  </h2>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      isOnline
                        ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                        : 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                    }`}
                  >
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-zinc-400 font-mono">
                    {station?.last_seen_at ? new Date(station.last_seen_at).toLocaleTimeString('vi-VN') : '—'}
                  </span>
                </div>
                <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 mt-0.5">
                  Mã trạm: <strong className="text-slate-800 dark:text-white">{station?.device_id}</strong> · Ký hiệu: {station?.plant_code}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="p-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                title="Làm mới dữ liệu"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="p-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                title={isMaximized ? 'Thu nhỏ Drawer' : 'Mở rộng toàn màn hình'}
              >
                {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                title="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Tabs (Bambu Dark styled) */}
          <div className="px-6 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 flex items-center gap-1 overflow-x-auto flex-shrink-0">
            {[
              { id: 'sensors', label: 'Cài đặt cảm biến', icon: Sliders },
              { id: 'readings', label: 'Dữ liệu đo', icon: Database },
              { id: 'station', label: 'Chỉnh sửa trạm', icon: FileEdit },
              { id: 'mqtt', label: 'MQTT & Kết nối', icon: Radio },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                    isActive
                      ? 'border-emerald-600 text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10'
                      : 'border-transparent text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Drawer Body Content */}
          <div className="flex-1 p-6 overflow-y-auto bg-slate-100/80 dark:bg-zinc-950 space-y-6">
            {isLoading ? (
              <div className="p-12 text-center text-slate-500 dark:text-zinc-400">Đang nạp dữ liệu cấu hình trạm...</div>
            ) : activeTab === 'sensors' ? (
              /* TAB 1: SENSORS */
              <div className="space-y-4">
                {/* Header Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm text-slate-900 dark:text-white">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-bold text-slate-900 dark:text-white">Danh sách cảm biến</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setActiveTab('readings')}
                      className="px-3.5 py-1.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-zinc-800 bg-white hover:bg-slate-50 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-slate-800 dark:text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Dữ liệu đo
                    </button>

                    <button
                      onClick={() =>
                        sendCmdMutation.mutate({
                          action: 'toggle_debug',
                          enabled: !station?.debug_mode,
                        })
                      }
                      disabled={sendCmdMutation.isPending || !canManage}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                        station?.debug_mode
                          ? 'bg-rose-600 hover:bg-rose-500 !text-white [&_*]:!text-white border-rose-600'
                          : 'bg-white hover:bg-slate-50 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-slate-800 dark:text-white border-slate-300 dark:border-zinc-800'
                      }`}
                    >
                      <Bug className="w-3.5 h-3.5" /> Debug: {station?.debug_mode ? 'ON' : 'OFF'}
                    </button>

                    <button
                      onClick={() => sendCmdMutation.mutate({ action: 'sync_config' })}
                      disabled={sendCmdMutation.isPending || !canManage}
                      className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-white hover:bg-slate-50 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-slate-800 dark:text-white border border-slate-300 dark:border-zinc-800 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Đồng bộ cấu hình
                    </button>

                    {canManage && (
                      <button
                        onClick={() => {
                          setSelectedSensorType('analog');
                          setAddStep(1);
                          setShowAddModal(true);
                        }}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white [&_*]:!text-white transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-white" /> Thêm sensor
                      </button>
                    )}
                  </div>
                </div>

                {/* Unified Sensor Rows */}
                <div className="space-y-3">
                  {/* ANALOG CHANNELS */}
                  {channelsState.analog.map((sensor, idx) => {
                    const reading = lastReadings.analog?.[sensor.channel_code];
                    return (
                      <div
                        key={`analog-${sensor.id || idx}`}
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-300/80 dark:border-zinc-800 overflow-hidden shadow-xs hover:border-slate-400/80 dark:hover:border-zinc-700 transition-all"
                      >
                        <div className="p-3.5 flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900">
                          <span className="font-mono text-xs font-extrabold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-zinc-700">
                            {sensor.channel_code}
                          </span>

                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">Tên</label>
                            <input
                              type="text"
                              value={sensor.display_name}
                              onChange={(e) => {
                                const updated = [...channelsState.analog];
                                updated[idx].display_name = e.target.value;
                                setChannelsState({ ...channelsState, analog: updated });
                              }}
                              placeholder="Tên cảm biến"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>

                          <div className="w-20">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Đơn vị
                            </label>
                            <input
                              type="text"
                              value={sensor.unit}
                              onChange={(e) => {
                                const updated = [...channelsState.analog];
                                updated[idx].unit = e.target.value;
                                setChannelsState({ ...channelsState, analog: updated });
                              }}
                              placeholder="m, bar"
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>

                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Raw
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={reading?.raw !== undefined && reading?.raw !== null ? reading.raw : '—'}
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-100/90 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-center font-mono font-semibold"
                            />
                          </div>

                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Real
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={reading?.real !== undefined && reading?.real !== null ? reading.real : '—'}
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold text-center font-mono"
                            />
                          </div>

                          <div className="min-w-[90px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Thời gian
                            </label>
                            <span className="block px-2 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-zinc-950 text-slate-700 dark:text-emerald-400 border border-slate-200 dark:border-zinc-800 text-center font-mono">
                              {reading?.ts || '—'}
                            </span>
                          </div>

                          {canManage && (
                            <button
                              onClick={() => handleDeleteSensor('analog', sensor.id, sensor.channel_code)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors mb-0.5"
                              title="Hủy kích hoạt kênh"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Calc row */}
                        <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/90 dark:bg-zinc-950/40 flex flex-wrap items-end gap-3">
                          <div className="w-32">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                              Công thức
                            </label>
                            <select
                              value={sensor.calc_mode || 'weight'}
                              onChange={(e) => {
                                const updated = [...channelsState.analog];
                                updated[idx].calc_mode = e.target.value;
                                setChannelsState({ ...channelsState, analog: updated });
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                            >
                              <option value="weight">Hệ số</option>
                              <option value="interpolation_2point">Nội suy</option>
                            </select>
                          </div>

                          {sensor.calc_mode === 'interpolation_2point' ? (
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">x1 (raw)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.x1 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.analog];
                                    updated[idx].x1 = e.target.value;
                                    setChannelsState({ ...channelsState, analog: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-500 dark:text-zinc-400 pt-3">→</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">y1 (thực)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.y1 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.analog];
                                    updated[idx].y1 = e.target.value;
                                    setChannelsState({ ...channelsState, analog: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-400 dark:text-zinc-500 pt-3 px-1">|</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">x2 (raw)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.x2 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.analog];
                                    updated[idx].x2 = e.target.value;
                                    setChannelsState({ ...channelsState, analog: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-500 dark:text-zinc-400 pt-3">→</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">y2 (thực)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.y2 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.analog];
                                    updated[idx].y2 = e.target.value;
                                    setChannelsState({ ...channelsState, analog: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 dark:text-zinc-400 font-bold">×</span>
                              <div className="w-28">
                                <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                                  Giá trị
                                </label>
                                <input
                                  type="text"
                                  placeholder="nhập hệ số"
                                  value={sensor.weight ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.analog];
                                    updated[idx].weight = e.target.value;
                                    setChannelsState({ ...channelsState, analog: updated });
                                  }}
                                  className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* ENCODER CHANNELS */}
                  {channelsState.encoder.map((sensor, idx) => {
                    const reading = lastReadings.encoder?.[sensor.channel_code];
                    return (
                      <div
                        key={`encoder-${sensor.id || idx}`}
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-300/80 dark:border-zinc-800 overflow-hidden shadow-xs hover:border-slate-400/80 dark:hover:border-zinc-700 transition-all"
                      >
                        <div className="p-3.5 flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900">
                          <span className="font-mono text-xs font-extrabold px-3 py-1.5 rounded-lg bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-700/50">
                            {sensor.channel_code}
                          </span>

                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">Tên</label>
                            <input
                              type="text"
                              value={sensor.display_name}
                              onChange={(e) => {
                                const updated = [...channelsState.encoder];
                                updated[idx].display_name = e.target.value;
                                setChannelsState({ ...channelsState, encoder: updated });
                              }}
                              placeholder="Tên cảm biến"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>

                          <div className="w-20">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Đơn vị
                            </label>
                            <input
                              type="text"
                              value={sensor.unit}
                              onChange={(e) => {
                                const updated = [...channelsState.encoder];
                                updated[idx].unit = e.target.value;
                                setChannelsState({ ...channelsState, encoder: updated });
                              }}
                              placeholder="đv"
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>

                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Raw
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={reading?.raw !== undefined && reading?.raw !== null ? reading.raw : '—'}
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-100/90 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-center font-mono font-semibold"
                            />
                          </div>

                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Real
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={reading?.real !== undefined && reading?.real !== null ? reading.real : '—'}
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold text-center font-mono"
                            />
                          </div>

                          <div className="min-w-[90px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Thời gian
                            </label>
                            <span className="block px-2 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-zinc-950 text-slate-700 dark:text-emerald-400 border border-slate-200 dark:border-zinc-800 text-center font-mono">
                              {reading?.ts || '—'}
                            </span>
                          </div>

                          {canManage && (
                            <button
                              onClick={() => handleDeleteSensor('encoder', sensor.id, sensor.channel_code)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors mb-0.5"
                              title="Hủy kích hoạt kênh"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/90 dark:bg-zinc-950/40 flex flex-wrap items-end gap-3">
                          <div className="w-32">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                              Công thức
                            </label>
                            <select
                              value={sensor.calc_mode || 'weight'}
                              onChange={(e) => {
                                const updated = [...channelsState.encoder];
                                updated[idx].calc_mode = e.target.value;
                                setChannelsState({ ...channelsState, encoder: updated });
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                            >
                              <option value="weight">Hệ số</option>
                              <option value="interpolation_2point">Nội suy</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 dark:text-zinc-400 font-bold">×</span>
                            <div className="w-28">
                              <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                                Giá trị
                              </label>
                              <input
                                type="text"
                                placeholder="nhập hệ số"
                                value={sensor.weight ?? ''}
                                onChange={(e) => {
                                  const updated = [...channelsState.encoder];
                                  updated[idx].weight = e.target.value;
                                  setChannelsState({ ...channelsState, encoder: updated });
                                }}
                                className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* DIGITAL INPUTS (DI / RAIN) */}
                  {channelsState.di.map((sensor, idx) => {
                    const reading = lastReadings.di?.[sensor.channel_code];
                    return (
                      <div
                        key={`di-${sensor.id || idx}`}
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-300/80 dark:border-zinc-800 overflow-hidden shadow-xs hover:border-slate-400/80 dark:hover:border-zinc-700 transition-all"
                      >
                        <div className="p-3.5 flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900">
                          <span className="font-mono text-xs font-extrabold px-3 py-1.5 rounded-lg bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-700/50">
                            {sensor.channel_code}
                          </span>

                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">Tên</label>
                            <input
                              type="text"
                              value={sensor.display_name}
                              onChange={(e) => {
                                const updated = [...channelsState.di];
                                updated[idx].display_name = e.target.value;
                                setChannelsState({ ...channelsState, di: updated });
                              }}
                              placeholder="Tên cảm biến"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>

                          <div className="w-20">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Đơn vị
                            </label>
                            <input
                              type="text"
                              value={sensor.unit}
                              onChange={(e) => {
                                const updated = [...channelsState.di];
                                updated[idx].unit = e.target.value;
                                setChannelsState({ ...channelsState, di: updated });
                              }}
                              placeholder="mm"
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>

                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Raw
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={reading?.raw !== undefined && reading?.raw !== null ? reading.raw : '—'}
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-100/90 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-center font-mono font-semibold"
                            />
                          </div>

                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Real
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={reading?.real !== undefined && reading?.real !== null ? reading.real : '—'}
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold text-center font-mono"
                            />
                          </div>

                          <div className="min-w-[90px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Thời gian
                            </label>
                            <span className="block px-2 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-zinc-950 text-slate-700 dark:text-emerald-400 border border-slate-200 dark:border-zinc-800 text-center font-mono">
                              {reading?.ts || '—'}
                            </span>
                          </div>

                          {canManage && (
                            <button
                              onClick={() => handleDeleteSensor('di', sensor.id, sensor.channel_code)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors mb-0.5"
                              title="Hủy kích hoạt kênh"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/90 dark:bg-zinc-950/40 flex flex-wrap items-end gap-3">
                          <div className="w-32">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                              Công thức
                            </label>
                            <select
                              value={sensor.calc_mode || 'weight'}
                              onChange={(e) => {
                                const updated = [...channelsState.di];
                                updated[idx].calc_mode = e.target.value;
                                setChannelsState({ ...channelsState, di: updated });
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                            >
                              <option value="weight">Hệ số</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 dark:text-zinc-400 font-bold">×</span>
                            <div className="w-28">
                              <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                                Giá trị
                              </label>
                              <input
                                type="text"
                                placeholder="0.1, 0.2, 0.5"
                                value={sensor.weight ?? ''}
                                onChange={(e) => {
                                  const updated = [...channelsState.di];
                                  updated[idx].weight = e.target.value;
                                  setChannelsState({ ...channelsState, di: updated });
                                }}
                                className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* DYNAMIC RS485 BUS 1 */}
                  {channelsState.rs485_1.map((sensor, idx) => {
                    const reading = lastReadings.rs485_1?.[sensor.channel_code];
                    return (
                      <div
                        key={`rs485_1-${sensor.id || idx}`}
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-300/80 dark:border-zinc-800 overflow-hidden shadow-xs hover:border-slate-400/80 dark:hover:border-zinc-700 transition-all"
                      >
                        <div className="p-3.5 flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900">
                          <span className="font-mono text-xs font-extrabold px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50">
                            RS485-{sensor.channel_code}
                          </span>

                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">Tên</label>
                            <input
                              type="text"
                              value={sensor.display_name}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_1];
                                updated[idx].display_name = e.target.value;
                                setChannelsState({ ...channelsState, rs485_1: updated });
                              }}
                              placeholder="Tên cảm biến"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>

                          <div className="w-20">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Đơn vị
                            </label>
                            <input
                              type="text"
                              value={sensor.unit}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_1];
                                updated[idx].unit = e.target.value;
                                setChannelsState({ ...channelsState, rs485_1: updated });
                              }}
                              placeholder="đv"
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>

                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Raw
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={reading?.raw !== undefined && reading?.raw !== null ? reading.raw : '—'}
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-100/90 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-center font-mono font-semibold"
                            />
                          </div>

                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Real
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={reading?.real !== undefined && reading?.real !== null ? reading.real : '—'}
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold text-center font-mono"
                            />
                          </div>

                          <div className="min-w-[90px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">
                              Thời gian
                            </label>
                            <span className="block px-2 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-zinc-950 text-slate-700 dark:text-emerald-400 border border-slate-200 dark:border-zinc-800 text-center font-mono">
                              {reading?.ts || '—'}
                            </span>
                          </div>

                          {canManage && (
                            <button
                              onClick={() => handleDeleteSensor('rs485_1', sensor.id, sensor.channel_code)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors mb-0.5"
                              title="Xóa sensor"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Connection row */}
                        <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/90 dark:bg-zinc-950/40 grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Slave ID</label>
                            <input
                              type="number"
                              value={sensor.slave_id ?? 1}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_1];
                                updated[idx].slave_id = e.target.value;
                                setChannelsState({ ...channelsState, rs485_1: updated });
                              }}
                              className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Địa chỉ (Addr)</label>
                            <input
                              type="number"
                              value={sensor.register_address ?? 0}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_1];
                                updated[idx].register_address = e.target.value;
                                setChannelsState({ ...channelsState, rs485_1: updated });
                              }}
                              className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Mã hàm</label>
                            <select
                              value={sensor.function_code || '03'}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_1];
                                updated[idx].function_code = e.target.value;
                                setChannelsState({ ...channelsState, rs485_1: updated });
                              }}
                              className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium shadow-2xs"
                            >
                              <option value="03">03 (Holding)</option>
                              <option value="04">04 (Input)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Kiểu DL</label>
                            <select
                              value={sensor.data_type || 'float32'}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_1];
                                updated[idx].data_type = e.target.value;
                                setChannelsState({ ...channelsState, rs485_1: updated });
                              }}
                              className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium shadow-2xs"
                            >
                              <option value="float32">Float32</option>
                              <option value="int16">Int16</option>
                              <option value="uint16">UInt16</option>
                              <option value="int32">Int32</option>
                              <option value="uint32">UInt32</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Thứ tự byte</label>
                            <select
                              value={sensor.register_order || 'BE'}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_1];
                                updated[idx].register_order = e.target.value;
                                setChannelsState({ ...channelsState, rs485_1: updated });
                              }}
                              className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium shadow-2xs"
                            >
                              <option value="BE">BE</option>
                              <option value="LE">LE</option>
                              <option value="MBE">MBE</option>
                              <option value="MLE">MLE</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Chu kỳ (s)</label>
                            <input
                              type="number"
                              value={sensor.poll_interval_sec ?? 5}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_1];
                                updated[idx].poll_interval_sec = e.target.value;
                                setChannelsState({ ...channelsState, rs485_1: updated });
                              }}
                              className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                            />
                          </div>
                        </div>

                        {/* Calc row */}
                        <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/20 flex flex-wrap items-end gap-3">
                          <div className="w-32">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                              Công thức
                            </label>
                            <select
                              value={sensor.calc_mode || 'weight'}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_1];
                                updated[idx].calc_mode = e.target.value;
                                setChannelsState({ ...channelsState, rs485_1: updated });
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                            >
                              <option value="weight">Hệ số</option>
                              <option value="interpolation_2point">Nội suy</option>
                            </select>
                          </div>

                          {sensor.calc_mode === 'interpolation_2point' ? (
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">x1 (raw)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.x1 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.rs485_1];
                                    updated[idx].x1 = e.target.value;
                                    setChannelsState({ ...channelsState, rs485_1: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-500 dark:text-zinc-400 pt-3">→</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">y1 (thực)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.y1 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.rs485_1];
                                    updated[idx].y1 = e.target.value;
                                    setChannelsState({ ...channelsState, rs485_1: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-400 dark:text-zinc-500 pt-3 px-1">|</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">x2 (raw)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.x2 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.rs485_1];
                                    updated[idx].x2 = e.target.value;
                                    setChannelsState({ ...channelsState, rs485_1: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-500 dark:text-zinc-400 pt-3">→</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">y2 (thực)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.y2 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.rs485_1];
                                    updated[idx].y2 = e.target.value;
                                    setChannelsState({ ...channelsState, rs485_1: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 dark:text-zinc-400 font-bold">×</span>
                              <div className="w-28">
                                <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                                  Giá trị
                                </label>
                                <input
                                  type="text"
                                  placeholder="nhập hệ số"
                                  value={sensor.weight ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.rs485_1];
                                    updated[idx].weight = e.target.value;
                                    setChannelsState({ ...channelsState, rs485_1: updated });
                                  }}
                                  className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* DYNAMIC RS485 BUS 2 */}
                  {channelsState.rs485_2.map((sensor, idx) => {
                    const reading = (lastReadings as any).rs485_2?.[sensor.channel_code];
                    return (
                      <div
                        key={`rs485_2-${sensor.id || idx}`}
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-300/80 dark:border-zinc-800 overflow-hidden shadow-xs hover:border-slate-400/80 dark:hover:border-zinc-700 transition-all"
                      >
                        <div className="p-3.5 flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900">
                          <span className="font-mono text-xs font-extrabold px-3 py-1.5 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border border-orange-300 dark:border-orange-700/50">
                            RS485B2-{sensor.channel_code}
                          </span>
                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">Tên</label>
                            <input
                              type="text"
                              value={sensor.display_name}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_2];
                                updated[idx].display_name = e.target.value;
                                setChannelsState({ ...channelsState, rs485_2: updated });
                              }}
                              placeholder="Tên cảm biến"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>
                          <div className="w-20">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Đơn vị</label>
                            <input
                              type="text"
                              value={sensor.unit}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_2];
                                updated[idx].unit = e.target.value;
                                setChannelsState({ ...channelsState, rs485_2: updated });
                              }}
                              placeholder="đv"
                              className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>
                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Raw</label>
                            <input type="text" readOnly value={reading?.raw ?? '—'} className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-100/90 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-center font-mono font-semibold" />
                          </div>
                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Real</label>
                            <input type="text" readOnly value={reading?.real ?? '—'} className="w-full px-2 py-1.5 text-xs rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold text-center font-mono" />
                          </div>
                          <div className="min-w-[90px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Thời gian</label>
                            <span className="block px-2 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-zinc-950 text-slate-700 dark:text-emerald-400 border border-slate-200 dark:border-zinc-800 text-center font-mono">{reading?.ts || '—'}</span>
                          </div>
                          {canManage && (
                            <button onClick={() => handleDeleteSensor('rs485_2', sensor.id, sensor.channel_code)} className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors mb-0.5" title="Xóa sensor">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/90 dark:bg-zinc-950/40 grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Slave ID</label>
                            <input type="number" value={sensor.slave_id ?? 1} onChange={(e) => { const u = [...channelsState.rs485_2]; u[idx].slave_id = e.target.value; setChannelsState({ ...channelsState, rs485_2: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Địa chỉ (Addr)</label>
                            <input type="number" value={sensor.register_address ?? 0} onChange={(e) => { const u = [...channelsState.rs485_2]; u[idx].register_address = e.target.value; setChannelsState({ ...channelsState, rs485_2: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Mã hàm</label>
                            <select value={sensor.function_code || '03'} onChange={(e) => { const u = [...channelsState.rs485_2]; u[idx].function_code = e.target.value; setChannelsState({ ...channelsState, rs485_2: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium shadow-2xs">
                              <option value="03">03 (Holding)</option>
                              <option value="04">04 (Input)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Kiểu DL</label>
                            <select value={sensor.data_type || 'float32'} onChange={(e) => { const u = [...channelsState.rs485_2]; u[idx].data_type = e.target.value; setChannelsState({ ...channelsState, rs485_2: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium shadow-2xs">
                              <option value="float32">Float32</option>
                              <option value="int16">Int16</option>
                              <option value="uint16">UInt16</option>
                              <option value="int32">Int32</option>
                              <option value="uint32">UInt32</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Thứ tự byte</label>
                            <select value={sensor.register_order || 'BE'} onChange={(e) => { const u = [...channelsState.rs485_2]; u[idx].register_order = e.target.value; setChannelsState({ ...channelsState, rs485_2: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium shadow-2xs">
                              <option value="BE">BE</option><option value="LE">LE</option><option value="MBE">MBE</option><option value="MLE">MLE</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Chu kỳ (s)</label>
                            <input type="number" value={sensor.poll_interval_sec ?? 5} onChange={(e) => { const u = [...channelsState.rs485_2]; u[idx].poll_interval_sec = e.target.value; setChannelsState({ ...channelsState, rs485_2: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs" />
                          </div>
                        </div>

                        {/* Calc row */}
                        <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/20 flex flex-wrap items-end gap-3">
                          <div className="w-32">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                              Công thức
                            </label>
                            <select
                              value={sensor.calc_mode || 'weight'}
                              onChange={(e) => {
                                const updated = [...channelsState.rs485_2];
                                updated[idx].calc_mode = e.target.value;
                                setChannelsState({ ...channelsState, rs485_2: updated });
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                            >
                              <option value="weight">Hệ số</option>
                              <option value="interpolation_2point">Nội suy</option>
                            </select>
                          </div>

                          {sensor.calc_mode === 'interpolation_2point' ? (
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">x1 (raw)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.x1 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.rs485_2];
                                    updated[idx].x1 = e.target.value;
                                    setChannelsState({ ...channelsState, rs485_2: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-500 dark:text-zinc-400 pt-3">→</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">y1 (thực)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.y1 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.rs485_2];
                                    updated[idx].y1 = e.target.value;
                                    setChannelsState({ ...channelsState, rs485_2: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-400 dark:text-zinc-500 pt-3 px-1">|</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">x2 (raw)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.x2 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.rs485_2];
                                    updated[idx].x2 = e.target.value;
                                    setChannelsState({ ...channelsState, rs485_2: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-500 dark:text-zinc-400 pt-3">→</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">y2 (thực)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.y2 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.rs485_2];
                                    updated[idx].y2 = e.target.value;
                                    setChannelsState({ ...channelsState, rs485_2: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 dark:text-zinc-400 font-bold">×</span>
                              <div className="w-28">
                                <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                                  Giá trị
                                </label>
                                <input
                                  type="text"
                                  placeholder="nhập hệ số"
                                  value={sensor.weight ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.rs485_2];
                                    updated[idx].weight = e.target.value;
                                    setChannelsState({ ...channelsState, rs485_2: updated });
                                  }}
                                  className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* DYNAMIC MODBUS TCP */}
                  {channelsState.tcp.map((sensor, idx) => {
                    const reading = (lastReadings as any).tcp?.[sensor.channel_code];
                    return (
                      <div
                        key={`tcp-${sensor.id || idx}`}
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-300/80 dark:border-zinc-800 overflow-hidden shadow-xs hover:border-slate-400/80 dark:hover:border-zinc-700 transition-all"
                      >
                        <div className="p-3.5 flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900">
                          <span className="font-mono text-xs font-extrabold px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700/50">
                            TCP-{sensor.channel_code}
                          </span>
                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">Tên</label>
                            <input
                              type="text"
                              value={sensor.display_name}
                              onChange={(e) => {
                                const updated = [...channelsState.tcp];
                                updated[idx].display_name = e.target.value;
                                setChannelsState({ ...channelsState, tcp: updated });
                              }}
                              placeholder="Tên cảm biến"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>
                          <div className="w-20">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Đơn vị</label>
                            <input type="text" value={sensor.unit} onChange={(e) => { const u = [...channelsState.tcp]; u[idx].unit = e.target.value; setChannelsState({ ...channelsState, tcp: u }); }} placeholder="đv" className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs" />
                          </div>
                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Raw</label>
                            <input type="text" readOnly value={reading?.raw ?? '—'} className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-100/90 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-center font-mono font-semibold" />
                          </div>
                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Real</label>
                            <input type="text" readOnly value={reading?.real ?? '—'} className="w-full px-2 py-1.5 text-xs rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold text-center font-mono" />
                          </div>
                          <div className="min-w-[90px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Thời gian</label>
                            <span className="block px-2 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-zinc-950 text-slate-700 dark:text-emerald-400 border border-slate-200 dark:border-zinc-800 text-center font-mono">{reading?.ts || '—'}</span>
                          </div>
                          {canManage && (
                            <button onClick={() => handleDeleteSensor('tcp', sensor.id, sensor.channel_code)} className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors mb-0.5" title="Xóa sensor">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {/* TCP Host/Port/Register config */}
                        <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/90 dark:bg-zinc-950/40 grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Host IP</label>
                            <input type="text" value={sensor.host ?? ''} onChange={(e) => { const u = [...channelsState.tcp]; u[idx].host = e.target.value; setChannelsState({ ...channelsState, tcp: u }); }} placeholder="192.168.1.100" className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-mono font-medium shadow-2xs" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Port</label>
                            <input type="number" value={sensor.port ?? 502} onChange={(e) => { const u = [...channelsState.tcp]; u[idx].port = e.target.value; setChannelsState({ ...channelsState, tcp: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Slave ID</label>
                            <input type="number" value={sensor.slave_id ?? 1} onChange={(e) => { const u = [...channelsState.tcp]; u[idx].slave_id = e.target.value; setChannelsState({ ...channelsState, tcp: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Địa chỉ</label>
                            <input type="number" value={sensor.register_address ?? 0} onChange={(e) => { const u = [...channelsState.tcp]; u[idx].register_address = e.target.value; setChannelsState({ ...channelsState, tcp: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Kiểu DL</label>
                            <select value={sensor.data_type || 'float32'} onChange={(e) => { const u = [...channelsState.tcp]; u[idx].data_type = e.target.value; setChannelsState({ ...channelsState, tcp: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium shadow-2xs">
                              <option value="float32">Float32</option>
                              <option value="int16">Int16</option>
                              <option value="uint16">UInt16</option>
                              <option value="int32">Int32</option>
                              <option value="uint32">UInt32</option>
                            </select>
                          </div>
                        </div>

                        {/* Calc row */}
                        <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/20 flex flex-wrap items-end gap-3">
                          <div className="w-32">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                              Công thức
                            </label>
                            <select
                              value={sensor.calc_mode || 'weight'}
                              onChange={(e) => {
                                const updated = [...channelsState.tcp];
                                updated[idx].calc_mode = e.target.value;
                                setChannelsState({ ...channelsState, tcp: updated });
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                            >
                              <option value="weight">Hệ số</option>
                              <option value="interpolation_2point">Nội suy</option>
                            </select>
                          </div>

                          {sensor.calc_mode === 'interpolation_2point' ? (
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">x1 (raw)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.x1 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.tcp];
                                    updated[idx].x1 = e.target.value;
                                    setChannelsState({ ...channelsState, tcp: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-500 dark:text-zinc-400 pt-3">→</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">y1 (thực)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.y1 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.tcp];
                                    updated[idx].y1 = e.target.value;
                                    setChannelsState({ ...channelsState, tcp: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-400 dark:text-zinc-500 pt-3 px-1">|</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">x2 (raw)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.x2 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.tcp];
                                    updated[idx].x2 = e.target.value;
                                    setChannelsState({ ...channelsState, tcp: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                              <span className="text-slate-500 dark:text-zinc-400 pt-3">→</span>
                              <div className="w-20">
                                <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-0.5">y2 (thực)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.y2 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.tcp];
                                    updated[idx].y2 = e.target.value;
                                    setChannelsState({ ...channelsState, tcp: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 dark:text-zinc-400 font-bold">×</span>
                              <div className="w-28">
                                <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                                  Giá trị
                                </label>
                                <input
                                  type="text"
                                  placeholder="nhập hệ số"
                                  value={sensor.weight ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.tcp];
                                    updated[idx].weight = e.target.value;
                                    setChannelsState({ ...channelsState, tcp: updated });
                                  }}
                                  className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* DYNAMIC IEC 62056 */}
                  {channelsState.iec.map((sensor, idx) => {
                    const reading = (lastReadings as any).iec62056?.[sensor.channel_code];
                    return (
                      <div
                        key={`iec-${sensor.id || idx}`}
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-300/80 dark:border-zinc-800 overflow-hidden shadow-xs hover:border-slate-400/80 dark:hover:border-zinc-700 transition-all"
                      >
                        <div className="p-3.5 flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900">
                          <span className="font-mono text-xs font-extrabold px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700/50">
                            IEC-{sensor.channel_code}
                          </span>
                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">Tên</label>
                            <input
                              type="text"
                              value={sensor.display_name}
                              onChange={(e) => {
                                const updated = [...channelsState.iec];
                                updated[idx].display_name = e.target.value;
                                setChannelsState({ ...channelsState, iec: updated });
                              }}
                              placeholder="Tên cảm biến"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs"
                            />
                          </div>
                          <div className="w-20">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Đơn vị</label>
                            <input type="text" value={sensor.unit} onChange={(e) => { const u = [...channelsState.iec]; u[idx].unit = e.target.value; setChannelsState({ ...channelsState, iec: u }); }} placeholder="kWh" className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors shadow-2xs" />
                          </div>
                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Raw</label>
                            <input type="text" readOnly value={reading?.raw ?? '—'} className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-100/90 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-center font-mono font-semibold" />
                          </div>
                          <div className="w-24">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Real</label>
                            <input type="text" readOnly value={reading?.real ?? '—'} className="w-full px-2 py-1.5 text-xs rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold text-center font-mono" />
                          </div>
                          <div className="min-w-[90px]">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1 text-center">Thời gian</label>
                            <span className="block px-2 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-zinc-950 text-slate-700 dark:text-emerald-400 border border-slate-200 dark:border-zinc-800 text-center font-mono">{reading?.ts || '—'}</span>
                          </div>
                          {canManage && (
                            <button onClick={() => handleDeleteSensor('iec', sensor.id, sensor.channel_code)} className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors mb-0.5" title="Xóa sensor">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {/* IEC 62056 OBIS code + baudrate */}
                        <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/90 dark:bg-zinc-950/40 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Mã OBIS</label>
                            <input type="text" value={sensor.obis_code ?? ''} onChange={(e) => { const u = [...channelsState.iec]; u[idx].obis_code = e.target.value; setChannelsState({ ...channelsState, iec: u }); }} placeholder="1-0:1.8.0" className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-mono font-medium shadow-2xs" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Baudrate</label>
                            <select value={sensor.baudrate ?? 9600} onChange={(e) => { const u = [...channelsState.iec]; u[idx].baudrate = e.target.value; setChannelsState({ ...channelsState, iec: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium shadow-2xs">
                              <option value="2400">2400</option>
                              <option value="4800">4800</option>
                              <option value="9600">9600</option>
                              <option value="19200">19200</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Chu kỳ (s)</label>
                            <input type="number" value={sensor.poll_interval_sec ?? 60} onChange={(e) => { const u = [...channelsState.iec]; u[idx].poll_interval_sec = e.target.value; setChannelsState({ ...channelsState, iec: u }); }} className="w-full px-2 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white text-center font-mono font-medium shadow-2xs" />
                          </div>
                        </div>

                        {/* Calc row */}
                        <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/20 flex flex-wrap items-end gap-3">
                          <div className="w-32">
                            <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                              Công thức
                            </label>
                            <select
                              value={sensor.calc_mode || 'weight'}
                              onChange={(e) => {
                                const updated = [...channelsState.iec];
                                updated[idx].calc_mode = e.target.value;
                                setChannelsState({ ...channelsState, iec: updated });
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                            >
                              <option value="weight">Hệ số</option>
                              <option value="interpolation_2point">Nội suy</option>
                            </select>
                          </div>

                          {sensor.calc_mode === 'interpolation_2point' ? (
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <div className="w-20">
                                <label className="block text-[10px] text-slate-500 dark:text-zinc-400 mb-0.5">x1 (raw)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.x1 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.iec];
                                    updated[idx].x1 = e.target.value;
                                    setChannelsState({ ...channelsState, iec: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-center font-mono"
                                />
                              </div>
                              <span className="text-slate-500 dark:text-zinc-400 pt-3">→</span>
                              <div className="w-20">
                                <label className="block text-[10px] text-slate-500 dark:text-zinc-400 mb-0.5">y1 (thực)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.y1 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.iec];
                                    updated[idx].y1 = e.target.value;
                                    setChannelsState({ ...channelsState, iec: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-center font-mono"
                                />
                              </div>
                              <span className="text-slate-500 dark:text-zinc-400 pt-3 px-1">|</span>
                              <div className="w-20">
                                <label className="block text-[10px] text-slate-500 dark:text-zinc-400 mb-0.5">x2 (raw)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.x2 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.iec];
                                    updated[idx].x2 = e.target.value;
                                    setChannelsState({ ...channelsState, iec: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-center font-mono"
                                />
                              </div>
                              <span className="text-slate-500 dark:text-zinc-400 pt-3">→</span>
                              <div className="w-20">
                                <label className="block text-[10px] text-slate-500 dark:text-zinc-400 mb-0.5">y2 (thực)</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={sensor.y2 ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.iec];
                                    updated[idx].y2 = e.target.value;
                                    setChannelsState({ ...channelsState, iec: updated });
                                  }}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-center font-mono"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 dark:text-zinc-400 font-bold">×</span>
                              <div className="w-28">
                                <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400 mb-1">
                                  Giá trị
                                </label>
                                <input
                                  type="text"
                                  placeholder="nhập hệ số"
                                  value={sensor.weight ?? ''}
                                  onChange={(e) => {
                                    const updated = [...channelsState.iec];
                                    updated[idx].weight = e.target.value;
                                    setChannelsState({ ...channelsState, iec: updated });
                                  }}
                                  className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-center font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Save Button */}
                {canManage && (
                  <div className="flex justify-end pt-4">
                    <button
                      onClick={() => saveChannelsMutation.mutate()}
                      disabled={saveChannelsMutation.isPending}
                      className="px-6 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white [&_*]:!text-white transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="w-4 h-4 text-white" />
                      {saveChannelsMutation.isPending ? 'Đang lưu cấu hình...' : 'Lưu cấu hình'}
                    </button>
                  </div>
                )}
              </div>
            ) : activeTab === 'readings' ? (
              /* TAB 2: READINGS TIME-SERIES PREVIEW & CHART (100% EXACT PARITY WITH ORIGINAL DJANGO WORKBENCH) */
              <div className="space-y-5">
                {/* 1. FILTER & CONTROLS TOOLBAR */}
                <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-300/80 dark:border-zinc-800 shadow-sm">
                  <div className="flex flex-wrap items-end gap-3">
                    {/* Date Range */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        Khoảng ngày
                      </label>
                      <div className="flex items-center gap-1.5 bg-slate-50 hover:bg-white focus-within:bg-white dark:bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 shadow-2xs">
                        <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                        <input
                          type="date"
                          value={exportDateFrom}
                          onChange={(e) => setExportDateFrom(e.target.value)}
                          className="bg-transparent text-xs text-slate-900 dark:text-white font-medium focus:outline-none font-mono"
                        />
                        <span className="text-slate-500 dark:text-zinc-400 text-xs">→</span>
                        <input
                          type="date"
                          value={exportDateTo}
                          onChange={(e) => setExportDateTo(e.target.value)}
                          className="bg-transparent text-xs text-slate-900 dark:text-white font-medium focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    {/* Frequency */}
                    <div className="w-36">
                      <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        Tần suất
                      </label>
                      <select
                        value={exportFreq}
                        onChange={(e) => setExportFreq(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                      >
                        <option value="raw">Mỗi bản tin</option>
                        <option value="1m">Mỗi 1 phút</option>
                        <option value="5m">Mỗi 5 phút</option>
                        <option value="15m">Mỗi 15 phút</option>
                        <option value="30m">Mỗi 30 phút</option>
                        <option value="1h">Mỗi 1 giờ</option>
                        <option value="3h">Mỗi 3 giờ</option>
                        <option value="1d">Mỗi 1 ngày</option>
                      </select>
                    </div>

                    {/* Ingest Source */}
                    <div className="w-32">
                      <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        Nguồn
                      </label>
                      <select
                        value={exportIngest}
                        onChange={(e) => setExportIngest(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                      >
                        <option value="all">Tất cả</option>
                        <option value="realtime">Live</option>
                        <option value="backfill">Backfill</option>
                      </select>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleLoadPreviewData}
                        disabled={isExportLoading}
                        className="px-3.5 py-2 text-xs font-bold rounded-lg bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-white transition-colors shadow-2xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <Eye className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${isExportLoading ? 'animate-spin' : ''}`} />
                        {isExportLoading ? 'Đang tải...' : 'Xem trước'}
                      </button>

                      <button
                        onClick={handleDownloadExcel}
                        disabled={!exportPayload || !exportPayload.rows || exportPayload.rows.length === 0}
                        className="px-3.5 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-white" />
                        Tải .xlsx
                      </button>
                    </div>

                    {/* Stats badge on the right */}
                    <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-400 self-center">
                      {exportError ? (
                        <span className="text-rose-500 font-semibold text-[11px]">
                          ⚠️ {exportError}
                        </span>
                      ) : exportPayload ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="font-semibold text-slate-900 dark:text-white font-mono">
                            {exportPayload.row_count || 0} dòng · {Math.max(0, (exportPayload.columns?.length || 2) - 2)} cột sensor
                          </span>
                          {exportPayload.truncated && (
                            <span className="text-amber-600 dark:text-amber-400 text-[11px] font-medium ml-1">
                              (giới hạn 5000 dòng)
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-500 dark:text-zinc-400 text-[11px]">
                          Chọn khoảng ngày + tần suất rồi nhấn "Xem trước"
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. PREVIEW TABLE CARD */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-300/80 dark:border-zinc-800 overflow-hidden shadow-sm">
                  <div className="py-2.5 px-4 bg-slate-50 dark:bg-zinc-950/60 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <TableIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Bảng xem trước
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
                      1 dòng = 1 batch · mỗi sensor gồm 2 cột RAW &amp; REAL
                    </span>
                  </div>

                  {isExportLoading ? (
                    <div className="p-12 text-center text-slate-500 dark:text-zinc-400 space-y-2">
                      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-xs">Đang tải dữ liệu đo từ trạm...</p>
                    </div>
                  ) : !exportPayload || !exportPayload.rows || exportPayload.rows.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 dark:text-zinc-400">
                      <TableIcon className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400 dark:text-zinc-400" />
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">Chưa có dữ liệu xem trước</p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                        Chọn khoảng ngày và bấm nút <strong>"Xem trước"</strong> để nạp bảng dữ liệu.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                      <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
                        <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 border-b border-slate-200 dark:border-zinc-800">
                          {/* Row 1: Sensor Groups */}
                          <tr className="border-b border-slate-200 dark:border-zinc-800/70 bg-slate-100 dark:bg-zinc-950">
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 dark:border-zinc-800 font-bold text-slate-900 dark:text-white text-center">
                              Thời gian
                            </th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 dark:border-zinc-800 font-bold text-slate-900 dark:text-white text-center">
                              Nguồn
                            </th>
                            {(() => {
                              const cols = exportPayload.columns || [];
                              const groupHeaders: any[] = [];
                              let i = 0;
                              while (i < cols.length) {
                                const c = cols[i];
                                if (c.key === 'ts' || c.key === 'ingest') {
                                  i++;
                                  continue;
                                }
                                if (c.group) {
                                  let span = 1;
                                  while (i + span < cols.length && cols[i + span].group === c.group) {
                                    span++;
                                  }
                                  groupHeaders.push({ title: c.group, span });
                                  i += span;
                                } else {
                                  groupHeaders.push({ title: c.title || c.key, span: 1 });
                                  i++;
                                }
                              }
                              return groupHeaders.map((g, idx) => (
                                <th
                                  key={idx}
                                  colSpan={g.span}
                                  className="py-2 px-3 border-r border-slate-200 dark:border-zinc-800 text-center font-bold text-slate-900 dark:text-white bg-slate-200/70 dark:bg-zinc-800/30"
                                >
                                  {g.title}
                                </th>
                              ));
                            })()}
                          </tr>
                          {/* Row 2: Sub-columns (RAW / REAL) */}
                          <tr className="bg-slate-50 dark:bg-zinc-950/90 text-[11px]">
                            {(exportPayload.columns || [])
                              .filter((c: any) => c.key !== 'ts' && c.key !== 'ingest')
                              .map((c: any, idx: number) => {
                                const isRaw = c.sub === 'raw' || c.key.endsWith('__raw');
                                return (
                                  <th
                                    key={idx}
                                    className={`py-1.5 px-2.5 text-center font-semibold border-r border-slate-200 dark:border-zinc-800 ${
                                      isRaw ? 'text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/20' : 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'
                                    }`}
                                  >
                                    {c.sub ? c.sub.toUpperCase() : isRaw ? 'RAW' : 'REAL'}
                                  </th>
                                );
                              })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/50 bg-white dark:bg-zinc-900">
                          {exportPayload.rows.map((row: any, rIdx: number) => {
                            const isLive = row.ingest === 'Live';
                            return (
                              <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
                                <td className="py-2 px-3 font-mono text-[11px] text-slate-700 dark:text-zinc-300 border-r border-slate-200 dark:border-zinc-800/40">
                                  {row.ts}
                                </td>
                                <td className="py-2 px-3 border-r border-slate-200 dark:border-zinc-800/40 text-center">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      isLive
                                        ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30'
                                        : 'bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-400 border border-purple-300 dark:border-purple-500/30'
                                    }`}
                                  >
                                    <Zap className="w-2.5 h-2.5" />
                                    {row.ingest || 'Live'}
                                  </span>
                                </td>
                                {(exportPayload.columns || [])
                                  .filter((c: any) => c.key !== 'ts' && c.key !== 'ingest')
                                  .map((c: any, cIdx: number) => {
                                    const val = row[c.key];
                                    const isRaw = c.sub === 'raw' || c.key.endsWith('__raw');
                                    return (
                                      <td
                                        key={cIdx}
                                        className={`py-2 px-2.5 text-right font-mono text-[11px] border-r border-slate-200 dark:border-zinc-800/40 ${
                                          isRaw
                                            ? 'text-sky-700 dark:text-sky-400'
                                            : 'text-emerald-700 dark:text-emerald-400 font-bold'
                                        }`}
                                      >
                                        {val !== undefined && val !== null && val !== '' ? val : '—'}
                                      </td>
                                    );
                                  })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 3. REAL VALUES TIME-SERIES CHART */}
                {exportPayload && exportPayload.rows && exportPayload.rows.length > 0 && (
                  <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-slate-300/80 dark:border-zinc-800 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Biểu đồ trực quan giá trị thực (REAL)
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-600 dark:text-zinc-400">
                        {exportFreq === 'raw' ? 'Bản tin live' : `Chu kỳ: ${exportFreq}`}
                      </span>
                    </div>

                    <div className="pt-2">
                      {(() => {
                        // Extract real-value sensor series
                        const cols = exportPayload.columns || [];
                        const rows = exportPayload.rows || [];
                        const realSeriesMap: { [group: string]: string } = {};
                        cols.forEach((c: any) => {
                          if (c.group && (c.sub === 'real' || c.key.endsWith('__real'))) {
                            realSeriesMap[c.group] = c.key;
                          }
                        });
                        const groupNames = Object.keys(realSeriesMap);

                        if (groupNames.length === 0) {
                          return (
                            <div className="p-6 text-center text-slate-500 dark:text-zinc-400 text-xs">
                              Không có dữ liệu REAL để vẽ đồ thị.
                            </div>
                          );
                        }

                        // Helper to distinguish Water Level (Z) vs Flow/Power (Q, P, others)
                        const isWaterLevelSensor = (name: string) => {
                          const lower = name.toLowerCase();
                          return (
                            lower.includes('z_') ||
                            lower.startsWith('z') ||
                            lower.includes('mực nước') ||
                            lower.includes('muc nuoc') ||
                            lower.includes('haluu') ||
                            lower.includes('thuongluu') ||
                            lower.includes('ha_luu') ||
                            lower.includes('thuong_luu')
                          );
                        };

                        const hasLeftAxis = groupNames.some((g) => isWaterLevelSensor(g));
                        const hasRightAxis = groupNames.some((g) => !isWaterLevelSensor(g));

                        // Build chart data
                        const chartData = rows.map((r: any) => {
                          const item: any = { ts: r.ts };
                          groupNames.forEach((g) => {
                            const rawV = r[realSeriesMap[g]];
                            item[g] = rawV !== '' && rawV !== null && rawV !== undefined ? Number(rawV) : null;
                          });
                          return item;
                        });

                        const palette = [
                          '#10b981', // emerald
                          '#0ea5e9', // sky
                          '#f59e0b', // amber
                          '#ef4444', // rose
                          '#8b5cf6', // purple
                          '#06b6d4', // cyan
                          '#84cc16', // lime
                          '#f97316', // orange
                          '#ec4899', // pink
                        ];

                        return (
                          <div className="h-[340px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-zinc-800" />
                                <XAxis
                                  dataKey="ts"
                                  stroke="#64748b"
                                  fontSize={10}
                                  tickLine={false}
                                  interval="preserveStartEnd"
                                />

                                {/* Left Y-Axis: Mực nước (Z) */}
                                {hasLeftAxis && (
                                  <YAxis
                                    yAxisId="left"
                                    orientation="left"
                                    stroke="#10b981"
                                    fontSize={10}
                                    tickLine={false}
                                    domain={['auto', 'auto']}
                                    label={{
                                      value: 'Mực nước Z (m)',
                                      angle: -90,
                                      position: 'insideLeft',
                                      fill: '#10b981',
                                      fontSize: 10,
                                      style: { textAnchor: 'middle' },
                                    }}
                                  />
                                )}

                                {/* Right Y-Axis: Lưu lượng (Q), Công suất (P), khác */}
                                {hasRightAxis && (
                                  <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    stroke="#0ea5e9"
                                    fontSize={10}
                                    tickLine={false}
                                    domain={['auto', 'auto']}
                                    label={{
                                      value: 'Lưu lượng Q / P / Khác',
                                      angle: 90,
                                      position: 'insideRight',
                                      fill: '#0ea5e9',
                                      fontSize: 10,
                                      style: { textAnchor: 'middle' },
                                    }}
                                  />
                                )}

                                <RechartsTooltip
                                  contentStyle={{
                                    backgroundColor: '#ffffff',
                                    borderColor: '#cbd5e1',
                                    borderRadius: '0.75rem',
                                    fontSize: '11px',
                                    color: '#0f172a',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                  }}
                                  itemStyle={{ padding: '1px 0' }}
                                />
                                <Legend
                                  verticalAlign="bottom"
                                  height={36}
                                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                                />
                                {groupNames.map((g, idx) => {
                                  const targetAxis = isWaterLevelSensor(g) ? 'left' : 'right';
                                  return (
                                    <Line
                                      key={g}
                                      yAxisId={hasLeftAxis && hasRightAxis ? targetAxis : (hasLeftAxis ? 'left' : 'right')}
                                      type="monotone"
                                      dataKey={g}
                                      stroke={palette[idx % palette.length]}
                                      strokeWidth={1.8}
                                      dot={false}
                                      activeDot={{ r: 4 }}
                                      connectNulls
                                    />
                                  );
                                })}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === 'station' ? (
              /* TAB 3: STATION EDIT */
              <div className="max-w-2xl bg-white dark:bg-zinc-900 p-6 rounded-xl border border-slate-300/80 dark:border-zinc-800 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-3">
                  <FileEdit className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Chỉnh sửa Thông tin Trạm
                </h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateStationMutation.mutate();
                  }}
                  className="space-y-4 text-xs"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-300 font-bold mb-1">Tên trạm quan trắc</label>
                      <input
                        type="text"
                        required
                        value={stationForm.name}
                        onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-300 font-bold mb-1">Ký hiệu công trình</label>
                      <input
                        type="text"
                        required
                        value={stationForm.plant_code}
                        onChange={(e) => setStationForm({ ...stationForm, plant_code: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-zinc-300 font-bold mb-1">Tỉnh / Thành phố</label>
                    <select
                      value={stationForm.province_code}
                      onChange={(e) => setStationForm({ ...stationForm, province_code: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                    >
                      {PROVINCES.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-300 font-bold mb-1">Vĩ độ (Latitude)</label>
                      <input
                        type="number"
                        step="any"
                        value={stationForm.latitude}
                        onChange={(e) => setStationForm({ ...stationForm, latitude: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-300 font-bold mb-1">Kinh độ (Longitude)</label>
                      <input
                        type="number"
                        step="any"
                        value={stationForm.longitude}
                        onChange={(e) => setStationForm({ ...stationForm, longitude: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                      />
                    </div>
                  </div>

                  {canManage && (
                    <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex justify-end">
                      <button
                        type="submit"
                        disabled={updateStationMutation.isPending}
                        className="px-5 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white [&_*]:!text-white transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-4 h-4 text-white" />
                        {updateStationMutation.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            ) : (
              /* TAB 4: MQTT & CONNECTION */
              <div className="space-y-6">
                <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-300/80 dark:border-zinc-800 shadow-xs space-y-4 text-slate-900 dark:text-white">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <Radio className="w-4 h-4" /> Thông tin MQTT & Thiết bị
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                        <tr>
                          <td className="py-2.5 text-slate-600 dark:text-zinc-400 font-medium w-1/3">MQTT User</td>
                          <td className="py-2.5 font-mono font-bold text-slate-900 dark:text-white">{station?.device_id}</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 text-slate-600 dark:text-zinc-400 font-medium">MQTT Password</td>
                          <td className="py-2.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {station?.mqtt_password ? (
                              <div className="flex items-center gap-2">
                                <span className="select-all bg-slate-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded border border-slate-300 dark:border-zinc-700 tracking-wider">
                                  {station.mqtt_password}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(station.mqtt_password || '');
                                    setCopiedPass(true);
                                    setTimeout(() => setCopiedPass(false), 2000);
                                  }}
                                  className="p-1 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 rounded transition-colors cursor-pointer"
                                  title="Sao chép mật khẩu"
                                >
                                  {copiedPass ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            ) : station?.mqtt_password_set ? (
                              '••••••••••••'
                            ) : (
                              'chưa đăng ký'
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2.5 text-slate-600 dark:text-zinc-400 font-medium">Lần kết nối cuối</td>
                          <td className="py-2.5 text-slate-900 dark:text-white font-medium">
                            {station?.last_seen_at
                              ? new Date(station.last_seen_at).toLocaleString('vi-VN')
                              : 'Chưa có'}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2.5 text-slate-600 dark:text-zinc-400 font-medium">Firmware</td>
                          <td className="py-2.5 font-mono text-slate-900 dark:text-white font-medium">{station?.device?.firmware_version || station?.firmware_version || '—'}</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 text-slate-600 dark:text-zinc-400 font-medium">MQTT Broker</td>
                          <td className="py-2.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">mqtt.potecovietnam.com:1883</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={() => {
                      if (window.confirm('Đăng ký lại MQTT? Mật khẩu thiết bị sẽ được làm mới.')) {
                        sendCmdMutation.mutate({ action: 'reregister_mqtt' });
                      }
                    }}
                    disabled={sendCmdMutation.isPending || !canManage}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 !text-white [&_*]:!text-white transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-white" /> Re-register MQTT
                  </button>
                </div>

                <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-300/80 dark:border-zinc-800 shadow-xs space-y-4 text-slate-900 dark:text-white">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <Wifi className="w-4 h-4" /> Cập nhật WiFi
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                    <div>
                      <label className="block text-[11px] text-slate-700 dark:text-zinc-300 font-bold mb-1">SSID</label>
                      <input
                        type="text"
                        placeholder="pcthuoc"
                        value={wifiSsid}
                        onChange={(e) => setWifiSsid(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 font-mono shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-700 dark:text-zinc-300 font-bold mb-1">Password</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={wifiPassword}
                        onChange={(e) => setWifiPassword(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      sendCmdMutation.mutate({
                        action: 'update_wifi',
                        ssid: wifiSsid,
                        password: wifiPassword,
                      })
                    }
                    disabled={!wifiSsid || sendCmdMutation.isPending || !canManage}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white [&_*]:!text-white transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    Cập nhật WiFi
                  </button>
                </div>

                <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-300/80 dark:border-zinc-800 shadow-xs space-y-4 text-slate-900 dark:text-white">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <Power className="w-4 h-4" /> Điều khiển thiết bị
                  </h4>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => sendCmdMutation.mutate({ action: 'sync_config' })}
                      disabled={sendCmdMutation.isPending || !canManage}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-white hover:bg-slate-50 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-800 dark:text-white transition-colors shadow-2xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Đồng bộ cấu hình
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Khởi động lại trạm "${station?.name}"?`)) {
                          sendCmdMutation.mutate({ action: 'restart' });
                        }
                      }}
                      disabled={sendCmdMutation.isPending || !canManage}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 !text-white [&_*]:!text-white transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <Power className="w-4 h-4 text-white" /> Khởi động lại
                    </button>
                  </div>
                </div>

                {/* OTA Firmware Section */}
                <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-300/80 dark:border-zinc-800 shadow-xs space-y-4 text-slate-900 dark:text-white">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <Download className="w-4 h-4" /> Cập nhật Firmware (OTA)
                    <span className="ml-auto text-[11px] font-normal text-slate-500 dark:text-zinc-400 normal-case tracking-normal">
                      FW hiện tại: <code className="font-mono">{station?.device?.firmware_version || '—'}</code>
                    </span>
                  </h4>

                  {/* Firmware info row */}
                  {station?.ota?.firmware_uploaded_at && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span>
                        Upload lúc {new Date(station.ota.firmware_uploaded_at).toLocaleString('vi-VN')}
                        {station.ota.firmware_checksum && (
                          <> — SHA256: <code className="font-mono">{station.ota.firmware_checksum.slice(0, 16)}…</code></>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Upload form */}
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept=".bin"
                      onChange={(e) => setFirmwareFile(e.target.files?.[0] ?? null)}
                      className="text-xs text-slate-700 dark:text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-100 dark:file:bg-zinc-800 file:text-slate-700 dark:file:text-zinc-300 hover:file:bg-slate-200 dark:hover:file:bg-zinc-700 cursor-pointer"
                    />
                    <button
                      disabled={!firmwareFile || isUploadingFw || !canManage}
                      onClick={async () => {
                        if (!firmwareFile) return;
                        setIsUploadingFw(true);
                        const fd = new FormData();
                        fd.append('firmware_file', firmwareFile);
                        try {
                          const res: any = await fetch(`/api/v1/stations/${stationId}/firmware-upload`, {
                            method: 'POST',
                            credentials: 'include',
                            body: fd,
                          }).then(r => r.json());
                          if (res?.ok || res?.data?.ok) {
                            showToast(res?.data?.message || res?.message || 'Đã upload firmware.', 'success');
                            setFirmwareFile(null);
                            refetch();
                          } else {
                            showToast(res?.error || 'Lỗi upload firmware.', 'error');
                          }
                        } catch {
                          showToast('Lỗi kết nối khi upload.', 'error');
                        } finally {
                          setIsUploadingFw(false);
                        }
                      }}
                      className="px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 !text-white [&_*]:!text-white transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer flex-shrink-0"
                    >
                      {isUploadingFw ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      {isUploadingFw ? 'Đang upload...' : 'Upload .bin'}
                    </button>
                  </div>

                  {/* OTA trigger */}
                  <div className="flex items-center gap-3 pt-1 border-t border-slate-200 dark:border-zinc-800">
                    <button
                      disabled={!station?.ota?.firmware_uploaded_at || isOtaLoading || !canManage}
                      onClick={async () => {
                        if (!window.confirm('Gửi lệnh OTA update xuống thiết bị?')) return;
                        setIsOtaLoading(true);
                        setTerminalLogs(prev => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] [OTA] Đang gửi lệnh cập nhật firmware...`]);
                        try {
                          await sendCmdMutation.mutateAsync({ action: 'ota_update' });
                        } finally {
                          setIsOtaLoading(false);
                        }
                      }}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 !text-white [&_*]:!text-white transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {isOtaLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      {isOtaLoading ? 'Đang gửi...' : 'Cập nhật OTA'}
                    </button>
                    {station?.ota?.status && (
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Trạng thái: <span className="font-mono font-bold">{station.ota.status}</span>
                        {station.ota.message && <> — {station.ota.message}</>}
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 font-mono text-xs text-emerald-400 h-40 overflow-y-auto space-y-1">
                  {terminalLogs.map((log, idx) => (
                    <div key={idx}>{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* UNIFIED ADD SENSOR MODAL */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {addStep === 1 ? 'Chọn loại cảm biến' : `Cấu hình cảm biến mới`}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addStep === 1 ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { type: 'analog', label: 'Analog (A1 - A8)', icon: Layers, desc: '4-20mA, 0-10V' },
                  { type: 'encoder', label: 'Encoder (E1 - E2)', icon: Cpu, desc: 'Xung độ mở cửa van' },
                  { type: 'di', label: 'Digital Input (DI)', icon: Sliders, desc: 'Vũ lượng kế đo mưa' },
                  { type: 'rs485_1', label: 'RS485 Bus 1', icon: Radio, desc: 'Modbus RTU Bus 1' },
                  { type: 'rs485_2', label: 'RS485 Bus 2', icon: Radio, desc: 'Modbus RTU Bus 2' },
                  { type: 'tcp', label: 'Modbus TCP', icon: Wifi, desc: 'TCP/IP Sensor' },
                  { type: 'iec', label: 'IEC 62056', icon: Radio, desc: 'Công tơ điện tử' },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.type}
                      onClick={() => {
                        setSelectedSensorType(item.type as any);
                        setNewSensorForm({
                          ...newSensorForm,
                          channel_code: item.type === 'analog' ? 'AI1' : item.type === 'encoder' ? 'ED1' : 'DI1',
                          name: '',
                          unit: item.type === 'di' ? 'mm' : 'm',
                        });
                        setAddStep(2);
                      }}
                      className="p-4 rounded-xl border border-slate-300 dark:border-zinc-800 bg-slate-50 hover:bg-emerald-50 dark:bg-zinc-950 hover:border-emerald-500 dark:hover:bg-emerald-500/10 cursor-pointer transition-colors flex flex-col items-center text-center group shadow-2xs"
                    >
                      <Icon className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{item.label}</span>
                      <span className="text-[10px] text-slate-600 dark:text-zinc-400 mt-0.5">{item.desc}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-bold mb-1">Mã kênh / Cổng kết nối</label>
                  {selectedSensorType === 'analog' ? (
                    <select
                      value={newSensorForm.channel_code}
                      onChange={(e) => setNewSensorForm({ ...newSensorForm, channel_code: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                    >
                      {['AI1', 'AI2', 'AI3', 'AI4', 'AI5', 'AI6', 'AI7', 'AI8'].map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  ) : selectedSensorType === 'encoder' ? (
                    <select
                      value={newSensorForm.channel_code}
                      onChange={(e) => setNewSensorForm({ ...newSensorForm, channel_code: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                    >
                      {['ED1', 'ED2', 'ED3', 'ED4'].map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  ) : selectedSensorType === 'di' ? (
                    <select
                      value={newSensorForm.channel_code}
                      onChange={(e) => setNewSensorForm({ ...newSensorForm, channel_code: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                    >
                      {['DI1', 'DI2', 'DI3', 'DI4'].map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Mã kênh (ví dụ: S1, M1)"
                      value={newSensorForm.channel_code}
                      onChange={(e) => setNewSensorForm({ ...newSensorForm, channel_code: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-bold mb-1">Tên cảm biến</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Mực nước thượng lưu"
                    value={newSensorForm.name}
                    onChange={(e) => setNewSensorForm({ ...newSensorForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 dark:text-zinc-300 font-bold mb-1">Đơn vị</label>
                    <input
                      type="text"
                      placeholder="m, m3/s, mm"
                      value={newSensorForm.unit}
                      onChange={(e) => setNewSensorForm({ ...newSensorForm, unit: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-zinc-300 font-bold mb-1">Hệ số (Weight)</label>
                    <input
                      type="text"
                      placeholder="1"
                      value={newSensorForm.weight}
                      onChange={(e) => setNewSensorForm({ ...newSensorForm, weight: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                    />
                  </div>
                </div>

                {selectedSensorType.startsWith('rs485') && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-zinc-800">
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-300 font-bold mb-1">Slave ID</label>
                      <input
                        type="number"
                        value={newSensorForm.slave_id}
                        onChange={(e) => setNewSensorForm({ ...newSensorForm, slave_id: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-300 font-bold mb-1">Địa chỉ thanh ghi</label>
                      <input
                        type="number"
                        value={newSensorForm.register_address}
                        onChange={(e) => setNewSensorForm({ ...newSensorForm, register_address: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-white focus:bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setAddStep(1)}
                    className="px-4 py-2 text-xs font-bold rounded-lg text-slate-500 dark:text-zinc-400 hover:text-white"
                  >
                    ← Quay lại
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAddSensor}
                    disabled={!newSensorForm.name}
                    className="px-5 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    Xác nhận thêm
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
