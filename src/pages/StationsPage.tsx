import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  RefreshCw,
  LayoutGrid,
  TableProperties,
  Cpu,
  Edit2,
  Trash2,
  MapPin,
  Radio,
  X,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from '../components/ConfirmModal';
import { StationWorkbenchDrawer } from '../components/StationWorkbenchDrawer';

interface StationData {
  id: number;
  device_id: string;
  name: string;
  plant_code: string;
  province_code: string;
  province_name?: string;
  latitude?: number | null;
  longitude?: number | null;
  is_online?: boolean;
  status?: 'online' | 'stale' | 'offline';
  sensor_online?: number;
  sensor_total?: number;
  sensors_healthy?: number;
  sensors_total?: number;
  last_seen_at?: string | null;
  firmware_version?: string;
}

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

export function StationsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Permissions
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

  // View & Filter states
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [provinceFilter, setProvinceFilter] = useState<string>('all');

  // Modals & Drawer states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStation, setEditingStation] = useState<StationData | null>(null);
  const [deletingStation, setDeletingStation] = useState<StationData | null>(null);

  // Workbench Drawer state
  const [activeDrawerStation, setActiveDrawerStation] = useState<StationData | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    plant_code: 'THUYDIENNAMXAYLUONG3',
    province_code: 'LCA',
    latitude: '',
    longitude: '',
  });

  // Query station list
  const {
    data: stationsResponse,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['stations-list'],
    queryFn: async () => {
      const res = await api.request<any>('/stations');
      if (Array.isArray(res)) return res as StationData[];
      if (res && Array.isArray(res.items)) return res.items as StationData[];
      if (res && Array.isArray(res.data)) return res.data as StationData[];
      return [] as StationData[];
    },
  });

  const stations: StationData[] = useMemo(() => {
    return Array.isArray(stationsResponse) ? stationsResponse : [];
  }, [stationsResponse]);

  // Filtered stations
  const filteredStations = useMemo(() => {
    return stations.filter((st) => {
      const matchesSearch =
        !searchQuery ||
        st.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.device_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.plant_code?.toLowerCase().includes(searchQuery.toLowerCase());

      const isOnline = st.is_online || st.status === 'online';
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'online' && isOnline) ||
        (statusFilter === 'offline' && !isOnline);

      const matchesProvince =
        provinceFilter === 'all' || st.province_code === provinceFilter;

      return matchesSearch && matchesStatus && matchesProvince;
    });
  }, [stations, searchQuery, statusFilter, provinceFilter]);

  // Metrics
  const onlineCount = useMemo(
    () => stations.filter((s) => s.is_online || s.status === 'online').length,
    [stations]
  );
  const offlineCount = stations.length - onlineCount;

  // Add / Edit Station Mutation
  const saveStationMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: formData.name.trim(),
        plant_code: formData.plant_code.trim(),
        province_code: formData.province_code,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      };

      if (editingStation) {
        return api.request(`/stations/${editingStation.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        return api.request('/stations', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      showToast(
        editingStation
          ? 'Đã cập nhật thông tin trạm thành công!'
          : 'Đã thêm trạm quan trắc mới thành công!',
        'success'
      );
      setShowAddModal(false);
      setEditingStation(null);
      queryClient.invalidateQueries({ queryKey: ['stations-list'] });
    },
    onError: (error: any) => {
      showToast(error.message || 'Lỗi khi lưu thông tin trạm.', 'error');
    },
  });

  // Delete Station Mutation
  const deleteStationMutation = useMutation({
    mutationFn: async (stationId: number) => {
      return api.request(`/stations/${stationId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      showToast('Đã xóa trạm quan trắc thành công.', 'success');
      setDeletingStation(null);
      queryClient.invalidateQueries({ queryKey: ['stations-list'] });
    },
    onError: (error: any) => {
      showToast(error.message || 'Không thể xóa trạm.', 'error');
    },
  });

  const handleOpenAdd = () => {
    setEditingStation(null);
    setFormData({
      name: '',
      plant_code: 'THUYDIENNAMXAYLUONG3',
      province_code: 'LCA',
      latitude: '',
      longitude: '',
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (station: StationData) => {
    setEditingStation(station);
    setFormData({
      name: station.name || '',
      plant_code: station.plant_code || '',
      province_code: station.province_code || 'LCA',
      latitude: station.latitude ? String(station.latitude) : '',
      longitude: station.longitude ? String(station.longitude) : '',
    });
    setShowAddModal(true);
  };

  const handleOpenWorkbench = (station: StationData) => {
    setActiveDrawerStation(station);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Danh sách trạm quan trắc
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-zinc-800 bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-700 dark:text-white transition shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Làm mới
          </button>

          {canManageStations && (
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4 text-white" /> Thêm trạm mới
            </button>
          )}
        </div>
      </div>

      {/* Metric Quick Stats Chips (Bambuddy Inventory Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Tổng số trạm cấu hình</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white font-mono mt-0.5">
              {stations.length} <span className="text-xs font-normal text-slate-400 dark:text-zinc-400">trạm</span>
            </h3>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-950-tertiary text-slate-600 dark:text-zinc-400">
            <Cpu className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Trạm đang truyền tin (Online)</p>
            <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              {onlineCount} <span className="text-xs font-normal text-slate-400 dark:text-zinc-400">kết nối</span>
            </h3>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Mất tín hiệu quan trắc (Offline)</p>
            <h3 className="text-2xl font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
              {offlineCount} <span className="text-xs font-normal text-slate-400 dark:text-zinc-400">trạm</span>
            </h3>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar (Bambuddy Inventory Toolbar) */}
      <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo tên, mã trạm hoặc ký hiệu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-64"
            />
          </div>

          {/* Status Pills */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-950 p-1 rounded-lg border border-slate-200 dark:border-zinc-800">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'online', label: 'Online' },
                { id: 'offline', label: 'Offline' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-emerald-600 !text-white [&_*]:!text-white shadow-sm'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Province Filter */}
          <select
            value={provinceFilter}
            onChange={(e) => setProvinceFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">Tất cả Tỉnh/Thành</option>
            {PROVINCE_OPTIONS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-950 p-1 rounded-lg border border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              viewMode === 'table'
                ? 'bg-emerald-600 !text-white [&_*]:!text-white shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Xem dạng Bảng"
          >
            <TableProperties className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-emerald-600 !text-white [&_*]:!text-white shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Xem dạng Lưới Thẻ"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content View */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 dark:text-zinc-400">Đang tải danh sách trạm quan trắc...</div>
      ) : filteredStations.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
          <Cpu className="w-8 h-8 text-slate-400 dark:text-zinc-400 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Không tìm thấy trạm quan trắc phù hợp</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt bộ lọc
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* Table View */
        <div className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950-tertiary/40 text-slate-600 dark:text-zinc-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Mã trạm (Device ID)</th>
                  <th className="py-3 px-4">Tên trạm quan trắc</th>
                  <th className="py-3 px-4">Ký hiệu CT</th>
                  <th className="py-3 px-4">Tỉnh / Tọa độ</th>
                  <th className="py-3 px-4 text-center">Cảm biến</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Lần đo gần nhất</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                {filteredStations.map((st, index) => {
                  const isOnline = st.is_online || st.status === 'online';
                  const activeSensors = st.sensor_online ?? st.sensors_healthy ?? 0;
                  const totalSensors = st.sensor_total ?? st.sensors_total ?? 0;
                  const provinceLabel =
                    PROVINCE_OPTIONS.find((p) => p.code === st.province_code)?.name ||
                    st.province_name ||
                    st.province_code;

                  return (
                    <tr
                      key={st.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/30 transition text-slate-700 dark:text-zinc-400"
                    >
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-900 dark:text-white">
                        {index + 1}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-slate-100 dark:bg-zinc-950 text-slate-800 dark:text-white border border-slate-200 dark:border-zinc-800">
                          {st.device_id}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{st.name}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-zinc-400">
                        {st.plant_code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 text-slate-900 dark:text-white font-medium">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {provinceLabel}
                        </div>
                        {st.latitude && st.longitude && (
                          <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-400">
                            ({st.latitude.toFixed(3)}, {st.longitude.toFixed(3)})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {activeSensors}/{totalSensors}
                        </span>
                        <div className="w-16 bg-slate-200 dark:bg-zinc-950-tertiary h-1.5 rounded-full mx-auto mt-1 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{
                              width: `${
                                totalSensors > 0 ? (activeSensors / totalSensors) * 100 : 0
                              }%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isOnline
                              ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                              : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isOnline ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'
                            }`}
                          />
                          {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        {st.last_seen_at ? (
                          new Date(st.last_seen_at).toLocaleString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        ) : (
                          <span className="text-slate-400 dark:text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Workbench Drawer Trigger */}
                          <button
                            onClick={() => handleOpenWorkbench(st)}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 dark:bg-emerald-500/15 dark:hover:bg-emerald-600 text-emerald-700 hover:text-white dark:text-emerald-400 dark:hover:text-white border border-emerald-200 dark:border-emerald-500/30 transition-all shadow-xs cursor-pointer flex items-center justify-center"
                            title="Mở Workbench Drawer"
                          >
                            <Wrench className="w-3.5 h-3.5 text-current" />
                          </button>

                          {/* Edit Button */}
                          {canManageStations && (
                            <button
                              onClick={() => handleOpenEdit(st)}
                              className="p-1.5 rounded-lg bg-sky-50 hover:bg-sky-600 dark:bg-sky-500/15 dark:hover:bg-sky-600 text-sky-700 hover:text-white dark:text-sky-400 dark:hover:text-white border border-sky-200 dark:border-sky-500/30 transition-all shadow-xs cursor-pointer flex items-center justify-center"
                              title="Chỉnh sửa trạm"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-current" />
                            </button>
                          )}

                          {/* Delete Button */}
                          {canManageStations && (
                            <button
                              onClick={() => setDeletingStation(st)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 dark:bg-rose-500/15 dark:hover:bg-rose-600 text-rose-700 hover:text-white dark:text-rose-400 dark:hover:text-white border border-rose-200 dark:border-rose-500/30 transition-all shadow-xs cursor-pointer flex items-center justify-center"
                              title="Xóa trạm"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-current" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Cards View (Bambuddy Fleet Grid) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStations.map((st) => {
            const isOnline = st.is_online || st.status === 'online';
            const activeSensors = st.sensor_online ?? st.sensors_healthy ?? 0;
            const totalSensors = st.sensor_total ?? st.sensors_total ?? 0;
            const provinceLabel =
              PROVINCE_OPTIONS.find((p) => p.code === st.province_code)?.name ||
              st.province_name ||
              st.province_code;

            return (
              <div
                key={st.id}
                className="p-5 rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-emerald-500/50 transition-all flex flex-col justify-between shadow-xs hover:shadow-md group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-xs font-bold text-slate-700 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-950 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-800">
                      {st.device_id}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        isOnline
                          ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                          : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                      }`}
                    >
                      {isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition">
                    {st.name}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {provinceLabel}
                    {st.latitude && st.longitude && (
                      <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-400 ml-1">
                        ({st.latitude.toFixed(2)}, {st.longitude.toFixed(2)})
                      </span>
                    )}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Kênh cảm biến</span>
                      <p className="font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                        {activeSensors}/{totalSensors} Hoạt động
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Lần đo cuối</span>
                      <p className="font-mono text-slate-500 dark:text-zinc-400 text-[11px] mt-0.5">
                        {st.last_seen_at ? (
                          new Date(st.last_seen_at).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenWorkbench(st)}
                    className="flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-emerald-600 !text-white [&_*]:!text-white hover:bg-emerald-500 transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5 text-white" /> Mở Workbench
                  </button>

                  {canManageStations && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(st)}
                        className="p-2 rounded-xl bg-sky-50 hover:bg-sky-600 dark:bg-sky-500/15 dark:hover:bg-sky-600 text-sky-700 hover:!text-white dark:text-sky-400 border border-sky-200 dark:border-sky-500/30 hover:[&_*]:!text-white transition-all shadow-xs cursor-pointer"
                        title="Chỉnh sửa"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingStation(st)}
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-600 dark:bg-rose-500/15 dark:hover:bg-rose-600 text-rose-700 hover:!text-white dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 hover:[&_*]:!text-white transition-all shadow-xs cursor-pointer"
                        title="Xóa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Station Modal */}
      {/* Add / Edit Station Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                {editingStation ? `Chỉnh sửa trạm: ${editingStation.name}` : 'Thêm trạm quan trắc mới'}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveStationMutation.mutate();
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block text-slate-700 dark:text-zinc-400 font-semibold mb-1">
                  Tên trạm quan trắc <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Trạm đo mực nước hồ thượng lưu"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-zinc-400 font-semibold mb-1">
                  Ký hiệu công trình / Nhà máy <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.plant_code}
                  onChange={(e) => setFormData({ ...formData, plant_code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-zinc-400 font-semibold mb-1">
                  Tỉnh / Thành phố <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.province_code}
                  onChange={(e) => setFormData({ ...formData, province_code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                >
                  {PROVINCE_OPTIONS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-zinc-400 font-semibold mb-1">Vĩ độ (Latitude)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="22.1234"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-zinc-400 font-semibold mb-1">Kinh độ (Longitude)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="103.5678"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-slate-700 dark:text-white transition font-bold cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={saveStationMutation.isPending}
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white [&_*]:!text-white transition font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {saveStationMutation.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Station Confirm Modal */}
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

      {/* 100% Native React Workbench Drawer */}
      {activeDrawerStation && (
        <StationWorkbenchDrawer
          stationId={activeDrawerStation.id}
          onClose={() => setActiveDrawerStation(null)}
        />
      )}
    </div>
  );
}

