import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Calculator,
  TableProperties,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Settings,
  CloudRain,
  Waves,
  Zap,
  ChevronDown,
  ChevronUp,
  X,
  Info,
} from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from '../components/ConfirmModal';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface CalculatedValueItem {
  id: number;
  code: string;
  name: string;
  unit: string;
  color: string;
  calc_method: string;
  calc_method_display: string;
  display_group: string;
  display_order: number;
  is_active: boolean;
  is_turbine: boolean;
  is_configured: boolean;
  formula: string;
  source_station_id: number | null;
  source_station_name: string | null;
  source_sensor_id: number | null;
  source_sensor_code: string | null;
  source_sensor_name: string | null;
  secondary_station_id: number | null;
  secondary_station_name: string | null;
  secondary_sensor_id: number | null;
  secondary_sensor_code: string | null;
  secondary_sensor_name: string | null;
  interpolation_table_id: number | null;
  interpolation_table_type: string | null;
  interpolation_table_version: string | null;
  interpolation_table_name: string | null;
  source_calculated_id: number | null;
  source_calculated_code: string | null;
  source_calculated_name: string | null;
  secondary_calculated_id: number | null;
  secondary_calculated_code: string | null;
  secondary_calculated_name: string | null;
}

export interface StationOption {
  id: number;
  name: string;
  device_id: string;
  sensors: { id: number; sensor_code: string; name: string; sensor_type: string; unit: string }[];
}

export interface TableOption {
  id: number;
  table_type: string;
  version: string;
  name: string;
}

export interface CalculatedOption {
  id: number;
  code: string;
  name: string;
  unit: string;
}

const METHOD_BADGES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  interpolation: {
    bg: 'bg-blue-50 dark:bg-blue-500/15',
    text: 'text-blue-700 dark:text-blue-300 font-bold',
    border: 'border-blue-200 dark:border-blue-500/30',
    label: 'Nội suy',
  },
  formula: {
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300 font-bold',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    label: 'Công thức',
  },
  balance: {
    bg: 'bg-amber-50 dark:bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300 font-bold',
    border: 'border-amber-200 dark:border-amber-500/30',
    label: 'Cân bằng nước',
  },
  moving_avg: {
    bg: 'bg-indigo-50 dark:bg-indigo-500/15',
    text: 'text-indigo-700 dark:text-indigo-300 font-bold',
    border: 'border-indigo-200 dark:border-indigo-500/30',
    label: 'Trung bình trượt',
  },
  sum: {
    bg: 'bg-purple-50 dark:bg-purple-500/15',
    text: 'text-purple-700 dark:text-purple-300 font-bold',
    border: 'border-purple-200 dark:border-purple-500/30',
    label: 'Tổng hợp',
  },
  rainfall_avg: {
    bg: 'bg-cyan-50 dark:bg-cyan-500/15',
    text: 'text-cyan-700 dark:text-cyan-300 font-bold',
    border: 'border-cyan-200 dark:border-cyan-500/30',
    label: 'Mưa lưu vực',
  },
  direct: {
    bg: 'bg-violet-50 dark:bg-violet-500/15',
    text: 'text-violet-700 dark:text-violet-300 font-bold',
    border: 'border-violet-200 dark:border-violet-500/30',
    label: 'Trực tiếp',
  },
};

export function CalculatedValuesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMethodFilter, setSelectedMethodFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Modals state
  const [editingCv, setEditingCv] = useState<CalculatedValueItem | null>(null);
  const [showAddTurbineModal, setShowAddTurbineModal] = useState(false);
  const [showAddRainModal, setShowAddRainModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number; name: string; type: 'turbine' | 'rain' } | null>(
    null
  );

  // ── Query: Calculated Values Collection ────────────────────────────────────
  const { data: responseData, isLoading } = useQuery({
    queryKey: ['calculated-values-list'],
    queryFn: async () => {
      const res = await api.request<any>('/calculated-values');
      return res?.data ?? res;
    },
  });

  const groups: Record<string, CalculatedValueItem[]> = useMemo(() => {
    return responseData?.groups || {};
  }, [responseData]);

  const stations: StationOption[] = useMemo(() => {
    return responseData?.stations || [];
  }, [responseData]);

  const tables: TableOption[] = useMemo(() => {
    return responseData?.tables || [];
  }, [responseData]);

  const calculatedOptions: CalculatedOption[] = useMemo(() => {
    return responseData?.calculated_options || [];
  }, [responseData]);

  // Sorting comparator helper for group items
  const sortGroupItems = (groupName: string, items: CalculatedValueItem[]): CalculatedValueItem[] => {
    const isTurbineGroup = groupName === 'LƯU LƯỢNG QUA NHÀ MÁY';
    const isRainGroup = groupName === 'MƯA LƯU VỰC 24H';

    return [...items].sort((a, b) => {
      if (isTurbineGroup) {
        if (a.code === 'Q_phat') return -1;
        if (b.code === 'Q_phat') return 1;
        const numA = parseInt(a.code.replace('Q_H', '')) || 999;
        const numB = parseInt(b.code.replace('Q_H', '')) || 999;
        return numA - numB;
      }

      if (isRainGroup) {
        if (a.code === 'Mua_tong') return -2;
        if (b.code === 'Mua_tong') return 2;
        if (a.code === 'Mua_cv') return -1;
        if (b.code === 'Mua_cv') return 1;
        const numA = parseInt(a.code.replace('Mua_', '')) || 999;
        const numB = parseInt(b.code.replace('Mua_', '')) || 999;
        return numA - numB;
      }

      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });
  };

  // Filtered Groups
  const filteredGroups = useMemo(() => {
    const res: Record<string, CalculatedValueItem[]> = {};
    const q = searchQuery.toLowerCase().trim();

    Object.entries(groups).forEach(([groupName, items]) => {
      const sorted = sortGroupItems(groupName, items);
      const filteredItems = sorted.filter((item) => {
        const matchMethod =
          selectedMethodFilter === 'all' || item.calc_method === selectedMethodFilter;
        const matchStatus =
          selectedStatusFilter === 'all' ||
          (selectedStatusFilter === 'configured' && item.is_configured) ||
          (selectedStatusFilter === 'pending' && !item.is_configured);

        const matchQuery =
          !q ||
          item.name.toLowerCase().includes(q) ||
          item.code.toLowerCase().includes(q) ||
          item.source_station_name?.toLowerCase().includes(q) ||
          item.source_sensor_name?.toLowerCase().includes(q) ||
          item.formula?.toLowerCase().includes(q);

        return matchMethod && matchStatus && matchQuery;
      });

      if (filteredItems.length > 0) {
        res[groupName] = filteredItems;
      }
    });

    return res;
  }, [groups, searchQuery, selectedMethodFilter, selectedStatusFilter]);

  // Overall Stats
  const totalCount = useMemo(() => {
    return Object.values(groups).reduce((acc, list) => acc + list.length, 0);
  }, [groups]);

  const configuredCount = useMemo(() => {
    return Object.values(groups).reduce(
      (acc, list) => acc + list.filter((item) => item.is_configured).length,
      0
    );
  }, [groups]);

  // ── Delete Mutation ────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (item: { id: number; type: 'turbine' | 'rain' }) => {
      if (item.type === 'turbine') {
        return api.request(`/calculated-values/turbines/${item.id}`, { method: 'DELETE' });
      } else {
        return api.request(`/calculated-values/rain/${item.id}`, { method: 'DELETE' });
      }
    },
    onSuccess: (_, variables) => {
      showToast(
        variables.type === 'turbine'
          ? 'Đã xóa tổ máy và cập nhật công thức Q phát!'
          : 'Đã xóa trạm đo mưa và cập nhật công thức mưa tổng!',
        'success'
      );
      queryClient.invalidateQueries({ queryKey: ['calculated-values-list'] });
      setItemToDelete(null);
    },
    onError: (err: any) => {
      showToast(err.message || 'Lỗi khi xóa mục.', 'error');
    },
  });

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  return (
    <div className="flex-1 p-3 sm:p-5 flex flex-col min-h-0 h-full overflow-y-auto bg-white dark:bg-zinc-950 text-text-primary">
      {/* ── TOP HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 sm:mb-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-500 shadow-sm">
            <Calculator className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold text-text-primary">
              Cấu Hình Giá Trị Tính Toán Thủy Văn
            </h1>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 font-mono font-medium">
              {configuredCount}/{totalCount} đã cấu hình
            </span>
          </div>
        </div>

        <Link
          to="/interpolation-tables"
          className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:bg-zinc-800 text-text-primary border border-slate-200 dark:border-zinc-800 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all self-start sm:self-auto"
        >
          <TableProperties className="w-3.5 h-3.5 text-emerald-500" />
          Quản lý Bảng Nội Suy
        </Link>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4 p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm flex-shrink-0">
        {/* Search Box */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-zinc-400" />
          <input
            type="text"
            placeholder="Tìm tên, mã, trạm, sensor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary placeholder:text-slate-500 dark:text-zinc-400 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 dark:text-zinc-400 hover:text-text-primary"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Method Filter */}
          <select
            value={selectedMethodFilter}
            onChange={(e) => setSelectedMethodFilter(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tất cả phương pháp</option>
            <option value="interpolation">Nội suy</option>
            <option value="formula">Công thức</option>
            <option value="balance">Cân bằng nước</option>
            <option value="moving_avg">Trung bình trượt</option>
            <option value="sum">Tổng</option>
            <option value="direct">Trực tiếp</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="configured">Đã cấu hình</option>
            <option value="pending">Chưa cấu hình</option>
          </select>
        </div>
      </div>

      {/* ── MAIN CONTENT AREA: 5 GROUPED SECTIONS ── */}
      <div className="space-y-4 w-full">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-zinc-400">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold">Đang tải cấu hình các giá trị tính toán...</span>
          </div>
        ) : Object.keys(filteredGroups).length === 0 ? (
          <div className="py-16 text-center text-slate-500 dark:text-zinc-400 space-y-3">
            <Calculator className="w-12 h-12 mx-auto opacity-30" />
            <h3 className="text-sm font-bold text-text-primary">Không tìm thấy đại lượng nào phù hợp</h3>
            <p className="text-xs">Thử thay đổi từ khóa tìm kiếm hoặc bỏ chọn các bộ lọc phía trên.</p>
          </div>
        ) : (
          Object.entries(filteredGroups).map(([groupName, items]) => {
            const isCollapsed = collapsedGroups[groupName] || false;
            const isTurbineGroup = groupName === 'LƯU LƯỢNG QUA NHÀ MÁY';
            const isRainGroup = groupName === 'MƯA LƯU VỰC 24H';

            return (
              <div
                key={groupName}
                className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm transition-all"
              >
                {/* Group Header */}
                <div className="p-3.5 sm:p-4 bg-white dark:bg-zinc-900/90 border-b border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                  <div
                    onClick={() => toggleGroupCollapse(groupName)}
                    className="flex items-center gap-2.5 cursor-pointer select-none group"
                  >
                    {isTurbineGroup ? (
                      <Zap className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
                    ) : isRainGroup ? (
                      <CloudRain className="w-4 h-4 text-cyan-500 group-hover:scale-110 transition-transform" />
                    ) : (
                      <Waves className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
                    )}
                    <h2 className="text-xs sm:text-sm font-extrabold text-text-primary tracking-wide uppercase">
                      {groupName}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      {items.length}
                    </span>
                    {isCollapsed ? (
                      <ChevronDown className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                    )}
                  </div>

                  {/* Group Specific Actions */}
                  <div className="flex items-center gap-2">
                    {isTurbineGroup && (
                      <button
                        onClick={() => setShowAddTurbineModal(true)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white [&_*]:!text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-white" />
                        Thêm tổ phát
                      </button>
                    )}
                    {isRainGroup && (
                      <button
                        onClick={() => setShowAddRainModal(true)}
                        className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 !text-white [&_*]:!text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-white" />
                        Thêm trạm mưa
                      </button>
                    )}
                  </div>
                </div>

                {/* Group Cards Horizontal Scroll Row */}
                {!isCollapsed && (
                  <div className="p-3 sm:p-4 flex items-stretch gap-3 sm:gap-4 overflow-x-auto pb-3.5 scrollbar-thin animate-in fade-in duration-200">
                    {items.map((cv) => {
                      const methodBadge = METHOD_BADGES[cv.calc_method] || METHOD_BADGES.direct;
                      const isTurbineUnit = cv.code.startsWith('Q_H') && cv.code !== 'Q_phat';
                      const isRainStation = cv.code.startsWith('Mua_') && cv.code !== 'Mua_tong' && cv.code !== 'Mua_cv';

                      return (
                        <div
                          key={cv.id}
                          className="w-72 sm:w-80 flex-shrink-0 bg-white dark:bg-zinc-950 border border-slate-200/90 dark:border-zinc-800 hover:border-emerald-500/50 rounded-2xl p-3.5 flex flex-col justify-between space-y-3 transition-all shadow-xs hover:shadow-md group"
                        >
                          {/* Card Header: Title & Badges */}
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="font-extrabold text-sm text-slate-900 dark:text-text-primary truncate">
                                  {cv.name}
                                </h3>
                                <code className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-200/60 dark:border-emerald-500/20 inline-block mt-0.5">
                                  {cv.code}
                                </code>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold border uppercase tracking-wider flex-shrink-0 ${methodBadge.bg} ${methodBadge.text} ${methodBadge.border}`}
                              >
                                {methodBadge.label}
                              </span>
                            </div>

                            {/* Status Indicator */}
                            <div className="flex items-center gap-1.5 text-[11px]">
                              {cv.is_configured ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Đã cấu hình
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Chưa cấu hình
                                </span>
                              )}
                              <span className="text-slate-500 dark:text-zinc-400">• Đơn vị: {cv.unit || '—'}</span>
                            </div>
                          </div>

                          {/* Source Details Overview */}
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/70 dark:border-zinc-800/70 text-xs space-y-1.5 text-slate-700 dark:text-text-primary">
                            {cv.calc_method === 'interpolation' ? (
                              <>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Trạm nguồn:</span>
                                  <span className="font-semibold truncate">
                                    {cv.source_station_name || <span className="text-rose-500 italic">Chưa chọn</span>}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Sensor:</span>
                                  <span className="font-mono text-cyan-600 dark:text-cyan-400 truncate">
                                    {cv.source_sensor_name
                                      ? `${cv.source_sensor_code} - ${cv.source_sensor_name}`
                                      : <span className="text-rose-500 italic">Chưa chọn</span>}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Bảng nội suy:</span>
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400 truncate">
                                    {cv.interpolation_table_type
                                      ? `${cv.interpolation_table_type} (${cv.interpolation_table_version})`
                                      : <span className="text-rose-500 italic">Chưa chọn</span>}
                                  </span>
                                </div>
                              </>
                            ) : cv.calc_method === 'formula' ? (
                              <>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Đại lượng V1:</span>
                                  <span className="font-mono text-cyan-600 dark:text-cyan-400">
                                    {cv.source_calculated_code || '—'}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Đại lượng V2:</span>
                                  <span className="font-mono text-cyan-600 dark:text-cyan-400">
                                    {cv.secondary_calculated_code || '—'}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Công thức:</span>
                                  <code className="font-mono font-bold">
                                    {cv.formula || 'v1 + v2'}
                                  </code>
                                </div>
                              </>
                            ) : cv.calc_method === 'sum' || cv.calc_method === 'rainfall_avg' ? (
                              <div className="space-y-1">
                                <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Tổng các đại lượng:</span>
                                <p className="font-mono font-bold break-all bg-white dark:bg-zinc-950 p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800/50">
                                  {cv.formula || <span className="text-rose-500 italic">Chưa có công thức</span>}
                                </p>
                              </div>
                            ) : cv.calc_method === 'balance' ? (
                              <div className="text-slate-500 dark:text-zinc-400 text-[11px]">
                                Cân bằng nước theo biến thiên dung tích:
                                <code className="block mt-0.5 text-slate-800 dark:text-text-primary font-mono font-bold">
                                  (V(t) - V(t-1))/Δt + Q_phat + Q_xa
                                </code>
                              </div>
                            ) : (
                              <>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Trạm:</span>
                                  <span className="font-semibold">
                                    {cv.source_station_name || <span className="text-rose-500 italic">Chưa chọn</span>}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Sensor:</span>
                                  <span className="font-mono text-cyan-600 dark:text-cyan-400 truncate">
                                    {cv.source_sensor_name
                                      ? `${cv.source_sensor_code} - ${cv.source_sensor_name}`
                                      : <span className="text-rose-500 italic">Chưa chọn</span>}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Card Footer Actions */}
                          <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                            <button
                              onClick={() => setEditingCv(cv)}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                            >
                              <Settings className="w-3.5 h-3.5 text-white" />
                              Cấu hình
                            </button>

                            {(isTurbineUnit || isRainStation) && (
                              <button
                                onClick={() =>
                                  setItemToDelete({
                                    id: cv.id,
                                    name: cv.name,
                                    type: isTurbineUnit ? 'turbine' : 'rain',
                                  })
                                }
                                className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 transition-all cursor-pointer flex items-center justify-center shadow-xs"
                                title="Xóa đại lượng động này"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-current" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── MODAL: EDIT CONFIGURATION ── */}
      {editingCv && (
        <ConfigCalculatedValueModal
          cv={editingCv}
          stations={stations}
          tables={tables}
          calculatedOptions={calculatedOptions}
          onClose={() => setEditingCv(null)}
          onSuccess={() => {
            setEditingCv(null);
            queryClient.invalidateQueries({ queryKey: ['calculated-values-list'] });
          }}
        />
      )}

      {/* ── MODAL: ADD TURBINE UNIT ── */}
      {showAddTurbineModal && (
        <AddTurbineModal
          stations={stations}
          tables={tables}
          onClose={() => setShowAddTurbineModal(false)}
          onSuccess={() => {
            setShowAddTurbineModal(false);
            queryClient.invalidateQueries({ queryKey: ['calculated-values-list'] });
          }}
        />
      )}

      {/* ── MODAL: ADD RAIN STATION ── */}
      {showAddRainModal && (
        <AddRainStationModal
          stations={stations}
          onClose={() => setShowAddRainModal(false)}
          onSuccess={() => {
            setShowAddRainModal(false);
            queryClient.invalidateQueries({ queryKey: ['calculated-values-list'] });
          }}
        />
      )}

      {/* ── MODAL: CONFIRM DELETE ── */}
      {itemToDelete && (
        <ConfirmModal
          title={itemToDelete.type === 'turbine' ? 'Xóa tổ máy phát điện' : 'Xóa trạm đo mưa'}
          message={`Xác nhận xóa "${itemToDelete.name}"? Công thức tổng hợp (${
            itemToDelete.type === 'turbine' ? 'Q_phat' : 'Mua_tong'
          }) sẽ được cập nhật tự động.`}
          confirmText="Xác nhận xóa"
          cancelText="Hủy"
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(itemToDelete)}
          onCancel={() => setItemToDelete(null)}
        />
      )}
    </div>
  );
}

// ── SUB-COMPONENT: CONFIG CALCULATED VALUE MODAL ──────────────────────────────
interface ConfigModalProps {
  cv: CalculatedValueItem;
  stations: StationOption[];
  tables: TableOption[];
  calculatedOptions: CalculatedOption[];
  onClose: () => void;
  onSuccess: () => void;
}

function ConfigCalculatedValueModal({
  cv,
  stations,
  tables,
  calculatedOptions,
  onClose,
  onSuccess,
}: ConfigModalProps) {
  const { showToast } = useToast();

  const [name, setName] = useState(cv.name);
  const [calcMethod, setCalcMethod] = useState(cv.calc_method);
  const [sourceStationId, setSourceStationId] = useState<number | null>(cv.source_station_id);
  const [sourceSensorId, setSourceSensorId] = useState<number | null>(cv.source_sensor_id);
  const [secondaryStationId, setSecondaryStationId] = useState<number | null>(cv.secondary_station_id);
  const [secondarySensorId, setSecondarySensorId] = useState<number | null>(cv.secondary_sensor_id);
  const [tableId, setTableId] = useState<number | null>(cv.interpolation_table_id);
  const [sourceCalculatedId, setSourceCalculatedId] = useState<number | null>(cv.source_calculated_id);
  const [secondaryCalculatedId, setSecondaryCalculatedId] = useState<number | null>(
    cv.secondary_calculated_id
  );
  const [formula, setFormula] = useState(cv.formula);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available sensors based on selected stations
  const sourceStationSensors = useMemo(() => {
    return stations.find((s) => s.id === sourceStationId)?.sensors || [];
  }, [stations, sourceStationId]);

  const secondaryStationSensors = useMemo(() => {
    return stations.find((s) => s.id === secondaryStationId)?.sensors || [];
  }, [stations, secondaryStationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.request(`/calculated-values/${cv.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          calc_method: calcMethod,
          source_sensor_id: sourceSensorId,
          secondary_sensor_id: secondarySensorId,
          interpolation_table_id: tableId,
          source_calculated_id: sourceCalculatedId,
          secondary_calculated_id: secondaryCalculatedId,
          formula: formula.trim(),
        }),
      });

      showToast(`Đã cập nhật cấu hình cho ${name}!`, 'success');
      onSuccess();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi lưu cấu hình.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-text-primary">
                Cấu hình: {cv.name} ({cv.code})
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Nhóm: {cv.display_group}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 dark:text-zinc-400 hover:text-text-primary rounded-lg hover:bg-slate-100 dark:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Tên hiển thị */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-primary">Tên hiển thị đại lượng</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          {/* Phương pháp tính toán */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-primary">Phương pháp tính toán</label>
            <select
              value={calcMethod}
              onChange={(e) => setCalcMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
            >
              <option value="interpolation">Nội suy (từ Bảng nội suy + Sensor)</option>
              <option value="formula">Công thức (tổng hợp V1 + V2)</option>
              <option value="balance">Cân bằng nước hồ</option>
              <option value="moving_avg">Trung bình trượt</option>
              <option value="sum">Tổng các đại lượng</option>
              <option value="direct">Trực tiếp từ Sensor</option>
            </select>
          </div>

          {/* DYNAMIC FORM SECTION BASED ON METHOD */}
          {calcMethod === 'interpolation' && (
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-1.5 text-xs text-blue-400 font-bold">
                <Info className="w-4 h-4" /> Chọn Trạm, Sensor đầu vào và Bảng nội suy tương ứng
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Station 1 */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Trạm nguồn 1 *</label>
                  <select
                    value={sourceStationId || ''}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      setSourceStationId(val);
                      setSourceSensorId(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Chọn trạm --</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.device_id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sensor 1 */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Sensor đầu vào 1 *</label>
                  <select
                    value={sourceSensorId || ''}
                    onChange={(e) => setSourceSensorId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Chọn sensor --</option>
                    {sourceStationSensors.map((sensor) => (
                      <option key={sensor.id} value={sensor.id}>
                        {sensor.sensor_code} - {sensor.name} ({sensor.unit || '—'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional Secondary Sensor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-zinc-800/50">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Trạm sensor thứ 2 (bảng 3 cột)</label>
                  <select
                    value={secondaryStationId || ''}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      setSecondaryStationId(val);
                      setSecondarySensorId(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Không cần --</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.device_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Sensor thứ 2</label>
                  <select
                    value={secondarySensorId || ''}
                    onChange={(e) =>
                      setSecondarySensorId(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Không cần --</option>
                    {secondaryStationSensors.map((sensor) => (
                      <option key={sensor.id} value={sensor.id}>
                        {sensor.sensor_code} - {sensor.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Interpolation Table */}
              <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-zinc-800/50">
                <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Bảng nội suy liên kết *</label>
                <select
                  value={tableId || ''}
                  onChange={(e) => setTableId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500 font-mono"
                >
                  <option value="">-- Chọn bảng nội suy --</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.table_type} - {t.version} {t.name ? `(${t.name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {calcMethod === 'formula' && (
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                <Info className="w-4 h-4" /> Tổng hợp từ các giá trị tính toán khác: v1 + v2
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Đại lượng V1 *</label>
                  <select
                    value={sourceCalculatedId || ''}
                    onChange={(e) =>
                      setSourceCalculatedId(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Chọn đại lượng V1 --</option>
                    {calculatedOptions
                      .filter((o) => o.id !== cv.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.code})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Đại lượng V2</label>
                  <select
                    value={secondaryCalculatedId || ''}
                    onChange={(e) =>
                      setSecondaryCalculatedId(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Không cần --</option>
                    {calculatedOptions
                      .filter((o) => o.id !== cv.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.code})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Công thức tính</label>
                <input
                  type="text"
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  placeholder="VD: v1 + v2"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {calcMethod === 'sum' && (
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 space-y-2">
              <label className="text-xs font-bold text-text-primary">
                Danh sách các mã đại lượng cần cộng tổng (cách nhau bởi dấu phẩy)
              </label>
              <input
                type="text"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="VD: Q_H1,Q_H2,Q_H3 hoặc Mua_1,Mua_2"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {calcMethod === 'direct' && (
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Trạm *</label>
                  <select
                    value={sourceStationId || ''}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      setSourceStationId(val);
                      setSourceSensorId(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Chọn trạm --</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.device_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Sensor *</label>
                  <select
                    value={sourceSensorId || ''}
                    onChange={(e) => setSourceSensorId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Chọn sensor --</option>
                    {sourceStationSensors.map((sensor) => (
                      <option key={sensor.id} value={sensor.id}>
                        {sensor.sensor_code} - {sensor.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-slate-700 dark:text-white border border-slate-200 dark:border-zinc-800 text-xs font-bold transition-all cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white [&_*]:!text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang lưu...
                </>
              ) : (
                'Lưu cấu hình'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── SUB-COMPONENT: ADD TURBINE MODAL ──────────────────────────────────────────
interface AddTurbineModalProps {
  stations: StationOption[];
  tables: TableOption[];
  onClose: () => void;
  onSuccess: () => void;
}

function AddTurbineModal({ stations, tables, onClose, onSuccess }: AddTurbineModalProps) {
  const { showToast } = useToast();
  const [turbineName, setTurbineName] = useState('');
  const [sourceStationId, setSourceStationId] = useState<number | null>(null);
  const [sourceSensorId, setSourceSensorId] = useState<number | null>(null);
  const [tableId, setTableId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sourceStationSensors = useMemo(() => {
    return stations.find((s) => s.id === sourceStationId)?.sensors || [];
  }, [stations, sourceStationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turbineName.trim()) {
      showToast('Vui lòng nhập tên tổ máy phát điện.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.request('/calculated-values/add-turbine', {
        method: 'POST',
        body: JSON.stringify({
          turbine_name: turbineName.trim(),
          source_sensor_id: sourceSensorId,
          interpolation_table_id: tableId,
        }),
      });

      showToast(`Đã thêm tổ máy ${turbineName} và cập nhật Q phát!`, 'success');
      onSuccess();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi thêm tổ máy.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-500">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
              Thêm Tổ Máy Phát Điện Mới
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-white flex items-center gap-1">
              Tên tổ máy <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={turbineName}
              onChange={(e) => setTurbineName(e.target.value)}
              placeholder="VD: Tổ máy H3, Tổ máy số 3..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Trạm đo</label>
              <select
                value={sourceStationId || ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  setSourceStationId(val);
                  setSourceSensorId(null);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- Chọn trạm --</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Sensor công suất P</label>
              <select
                value={sourceSensorId || ''}
                onChange={(e) => setSourceSensorId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- Chọn sensor --</option>
                {sourceStationSensors.map((sensor) => (
                  <option key={sensor.id} value={sensor.id}>
                    {sensor.sensor_code} - {sensor.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Bảng nội suy HPQ</label>
            <select
              value={tableId || ''}
              onChange={(e) => setTableId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="">-- Chọn bảng nội suy --</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.table_type} - {t.version} {t.name ? `(${t.name})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-slate-700 dark:text-white border border-slate-200 dark:border-zinc-800 text-xs font-bold transition-all cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white [&_*]:!text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang thêm...
                </>
              ) : (
                'Thêm tổ máy'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── SUB-COMPONENT: ADD RAIN STATION MODAL ──────────────────────────────────────
interface AddRainStationModalProps {
  stations: StationOption[];
  onClose: () => void;
  onSuccess: () => void;
}

function AddRainStationModal({ stations, onClose, onSuccess }: AddRainStationModalProps) {
  const { showToast } = useToast();
  const [rainName, setRainName] = useState('');
  const [sourceStationId, setSourceStationId] = useState<number | null>(null);
  const [sourceSensorId, setSourceSensorId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sourceStationSensors = useMemo(() => {
    return stations.find((s) => s.id === sourceStationId)?.sensors || [];
  }, [stations, sourceStationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rainName.trim()) {
      showToast('Vui lòng nhập tên trạm đo mưa.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.request('/calculated-values/add-rain', {
        method: 'POST',
        body: JSON.stringify({
          rain_name: rainName.trim(),
          source_sensor_id: sourceSensorId,
        }),
      });

      showToast(`Đã thêm trạm đo mưa ${rainName} và cập nhật Mưa tổng!`, 'success');
      onSuccess();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi thêm trạm đo mưa.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
              <CloudRain className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
              Thêm Trạm Đo Mưa Mới
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-white flex items-center gap-1">
              Tên trạm đo mưa <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={rainName}
              onChange={(e) => setRainName(e.target.value)}
              placeholder="VD: Trạm đo mưa Thượng Lưu, Trạm mưa Bản Hon..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Trạm nguồn</label>
              <select
                value={sourceStationId || ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  setSourceStationId(val);
                  setSourceSensorId(null);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- Chọn trạm --</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Sensor đo lượng mưa</label>
              <select
                value={sourceSensorId || ''}
                onChange={(e) => setSourceSensorId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- Chọn sensor --</option>
                {sourceStationSensors.map((sensor) => (
                  <option key={sensor.id} value={sensor.id}>
                    {sensor.sensor_code} - {sensor.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-slate-700 dark:text-white border border-slate-200 dark:border-zinc-800 text-xs font-bold transition-all cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white [&_*]:!text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang thêm...
                </>
              ) : (
                'Thêm trạm mưa'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
