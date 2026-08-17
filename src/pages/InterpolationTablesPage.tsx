import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TableProperties,
  Upload,
  Download,
  RotateCcw,
  Trash2,
  Search,
  Plus,
  FileSpreadsheet,
  Layers,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from '../components/ConfirmModal';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface InterpolationTableSummary {
  id: number;
  table_type: string;
  version: string;
  name: string;
  source_file: string;
  valid_from: string | null;
  valid_to: string | null;
  uploaded_at: string | null;
  is_active: boolean;
  rows_count: number;
}

export interface InterpolationRowItem {
  id: number;
  x: number;
  y: number | null;
  z: number;
}

export interface InterpolationTableDetail extends InterpolationTableSummary {
  rows?: InterpolationRowItem[];
  rows_total?: number;
}

// Badge styling per table type
export const TABLE_TYPE_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  ZV: {
    bg: 'bg-blue-500/15 dark:bg-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/40',
    label: 'Z ~ V (Mực nước - Dung tích)',
  },
  HPQ: {
    bg: 'bg-emerald-500/15 dark:bg-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/40',
    label: 'H ~ P ~ Q (Cột nước - Công suất - Lưu lượng)',
  },
  ZPQ: {
    bg: 'bg-amber-500/15 dark:bg-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/40',
    label: 'Z ~ P ~ Q (Mực nước - Công suất - Q xả)',
  },
  ZAQ: {
    bg: 'bg-rose-500/15 dark:bg-rose-500/20',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-500/40',
    label: 'Z ~ F (Mực nước - Diện tích mặt hồ)',
  },
  FFZQ: {
    bg: 'bg-indigo-500/15 dark:bg-indigo-500/20',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-500/40',
    label: 'FFZQ (Độ mở van - Mực nước - Q tràn)',
  },
  QZ: {
    bg: 'bg-purple-500/15 dark:bg-purple-500/20',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/40',
    label: 'Q ~ Z (Lưu lượng - Mực nước hạ lưu)',
  },
  default: {
    bg: 'bg-zinc-500/15 dark:bg-zinc-500/20',
    text: 'text-zinc-600 dark:text-zinc-400',
    border: 'border-zinc-500/40',
    label: 'Bảng nội suy chung',
  },
};

export function InterpolationTablesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [rowsSearchQuery, setRowsSearchQuery] = useState('');
  const [rowsPage, setRowsPage] = useState(1);
  const rowsPerPage = 50;

  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<InterpolationTableSummary | null>(null);
  const [tableToReimport, setTableToReimport] = useState<InterpolationTableSummary | null>(null);

  // ── 1. Query: List Tables ──────────────────────────────────────────────────
  const { data: tablesResponse, isLoading: isLoadingTables } = useQuery({
    queryKey: ['interpolation-tables-list'],
    queryFn: async () => {
      const res = await api.request<any>('/interpolation-tables');
      return res;
    },
  });

  const tables: InterpolationTableSummary[] = useMemo(() => {
    if (Array.isArray(tablesResponse)) return tablesResponse;
    if (Array.isArray(tablesResponse?.data)) return tablesResponse.data;
    return [];
  }, [tablesResponse]);

  const tableTypeChoices = useMemo(() => {
    return (
      tablesResponse?.meta?.table_type_choices ||
      tablesResponse?.table_type_choices || [
        { code: 'ZV', name: 'Z ~ V (Mực nước - Dung tích hồ)' },
        { code: 'HPQ', name: 'H ~ P ~ Q (Cột nước - Công suất - Q phát)' },
        { code: 'ZPQ', name: 'Z ~ P ~ Q (Mực nước - Công suất - Q phát)' },
        { code: 'ZAQ', name: 'Z ~ F (Mực nước - Diện tích hồ)' },
        { code: 'FFZQ', name: 'Độ mở van ~ Z ~ Q xả tràn' },
        { code: 'QZ', name: 'Q ~ Z (Lưu lượng - Mực nước hạ lưu)' },
        { code: 'default', name: 'Bảng nội suy khác' },
      ]
    );
  }, [tablesResponse]);

  // Auto-select first table if none selected
  const activeTableId = selectedTableId ?? (tables.length > 0 ? tables[0].id : null);

  // Filtered tables list
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchType = selectedTypeFilter === 'all' || t.table_type === selectedTypeFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        t.name?.toLowerCase().includes(q) ||
        t.version?.toLowerCase().includes(q) ||
        t.table_type?.toLowerCase().includes(q) ||
        t.source_file?.toLowerCase().includes(q);
      return matchType && matchQuery;
    });
  }, [tables, selectedTypeFilter, searchQuery]);

  // ── 2. Query: Selected Table Detail (Rows) ─────────────────────────────────
  const { data: tableDetailResponse, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['interpolation-table-detail', activeTableId, rowsPage, rowsSearchQuery],
    queryFn: async () => {
      if (!activeTableId) return null;
      const offset = (rowsPage - 1) * rowsPerPage;
      const res = await api.request<any>(
        `/interpolation-tables/${activeTableId}?limit=${rowsPerPage}&offset=${offset}&q=${encodeURIComponent(
          rowsSearchQuery
        )}`
      );
      return (res?.data ?? res) as InterpolationTableDetail;
    },
    enabled: !!activeTableId,
  });

  const selectedTable = useMemo(() => {
    return tables.find((t) => t.id === activeTableId) || tableDetailResponse || null;
  }, [tables, activeTableId, tableDetailResponse]);

  const rows = tableDetailResponse?.rows || [];
  const rowsTotal = tableDetailResponse?.rows_total ?? selectedTable?.rows_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(rowsTotal / rowsPerPage));
  const hasYColumn = rows.some((r) => r.y !== null && r.y !== undefined);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.request(`/interpolation-tables/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      showToast('Đã xóa bảng nội suy thành công!', 'success');
      queryClient.invalidateQueries({ queryKey: ['interpolation-tables-list'] });
      setTableToDelete(null);
      if (selectedTableId === tableToDelete?.id) {
        setSelectedTableId(null);
      }
    },
    onError: (err: any) => {
      showToast(err.message || 'Lỗi khi xóa bảng nội suy.', 'error');
    },
  });

  const reimportMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.request(`/interpolation-tables/${id}/reimport`, { method: 'POST' });
    },
    onSuccess: () => {
      showToast('Đã nạp lại dữ liệu từ file CSV thành công!', 'success');
      queryClient.invalidateQueries({ queryKey: ['interpolation-tables-list'] });
      queryClient.invalidateQueries({ queryKey: ['interpolation-table-detail', activeTableId] });
      setTableToReimport(null);
    },
    onError: (err: any) => {
      showToast(err.message || 'Lỗi khi nạp lại dữ liệu.', 'error');
    },
  });

  const handleDownloadCsv = (tableId: number) => {
    window.open(`/api/v1/interpolation-tables/${tableId}/download`, '_blank');
  };

  // ── Simple SVG Curve Chart Renderer ────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) => a.x - b.x);
    const minX = sorted[0].x;
    const maxX = sorted[sorted.length - 1].x;
    const zVals = sorted.map((r) => r.z);
    const minZ = Math.min(...zVals);
    const maxZ = Math.max(...zVals);
    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;

    const width = 600;
    const height = 180;
    const padding = 30;

    const points = sorted.map((r) => {
      const px = padding + ((r.x - minX) / rangeX) * (width - padding * 2);
      const py = height - padding - ((r.z - minZ) / rangeZ) * (height - padding * 2);
      return `${px},${py}`;
    });

    return {
      polyline: points.join(' '),
      minX,
      maxX,
      minZ,
      maxZ,
      width,
      height,
      pointsCount: sorted.length,
    };
  }, [rows]);

  return (
    <div className="flex-1 p-3 sm:p-5 flex flex-col min-h-0 h-full overflow-hidden bg-white dark:bg-zinc-950 text-text-primary">
      {/* ── TOP COMPACT HEADER ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 sm:mb-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-sm">
            <TableProperties className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold text-text-primary">
              Bảng Nội Suy Thủy Văn
            </h1>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 font-mono font-medium">
              {tables.length} bảng
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] !text-white [&_*]:!text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-900/20 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-white" />
          Tải lên bảng mới
        </button>
      </div>

      {/* ── MAIN 2-COLUMN SPLIT VIEW ── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 sm:gap-4 min-h-0 overflow-hidden">
        {/* ── LEFT COLUMN: TABLE CATALOG (280px - 320px) ── */}
        <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col shadow-sm min-h-0 h-full">
          {/* Filter & Search Bar */}
          <div className="p-2.5 border-b border-slate-200 dark:border-zinc-800 space-y-2 bg-white dark:bg-zinc-900/80 flex-shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-zinc-400" />
              <input
                type="text"
                placeholder="Tìm bảng, version, file..."
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

            {/* Type Pill Filter */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
              <button
                onClick={() => setSelectedTypeFilter('all')}
                className={`px-2 py-0.5 rounded font-bold whitespace-nowrap transition-all ${
                  selectedTypeFilter === 'all'
                    ? 'bg-emerald-600 !text-white [&_*]:!text-white shadow-sm'
                    : 'bg-white dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 hover:text-text-primary border border-slate-200 dark:border-zinc-800'
                }`}
              >
                Tất cả ({tables.length})
              </button>
              {['ZV', 'HPQ', 'ZPQ', 'ZAQ', 'FFZQ', 'QZ'].map((typeKey) => {
                const count = tables.filter((t) => t.table_type === typeKey).length;
                if (count === 0 && selectedTypeFilter !== typeKey) return null;
                return (
                  <button
                    key={typeKey}
                    onClick={() => setSelectedTypeFilter(typeKey)}
                    className={`px-1.5 py-0.5 rounded font-bold whitespace-nowrap transition-all ${
                      selectedTypeFilter === typeKey
                        ? 'bg-emerald-600 !text-white [&_*]:!text-white shadow-sm'
                        : 'bg-white dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 hover:text-text-primary border border-slate-200 dark:border-zinc-800'
                    }`}
                  >
                    {typeKey} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table List Scrollable */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
            {isLoadingTables ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-zinc-400">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Đang tải bảng...</span>
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="py-8 text-center text-slate-500 dark:text-zinc-400 space-y-1">
                <TableProperties className="w-6 h-6 mx-auto opacity-40" />
                <p className="text-xs">Không tìm thấy bảng nào.</p>
              </div>
            ) : (
              filteredTables.map((t) => {
                const isSelected = t.id === activeTableId;
                const style = TABLE_TYPE_COLORS[t.table_type] || TABLE_TYPE_COLORS.default;
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTableId(t.id);
                      setRowsPage(1);
                      setRowsSearchQuery('');
                    }}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer space-y-1 ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500 shadow-sm'
                        : 'bg-white dark:bg-zinc-950/50 hover:bg-slate-50 dark:hover:bg-white dark:bg-zinc-950 border-slate-200/90 dark:border-zinc-800 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold border ${style.bg} ${style.text} ${style.border}`}
                        >
                          {t.table_type}
                        </span>
                        <span className="font-bold text-xs text-slate-900 dark:text-text-primary truncate">
                          {t.version}
                        </span>
                      </div>
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 text-[10px] font-mono border border-slate-200 dark:border-zinc-800 flex-shrink-0">
                        {t.rows_count} dòng
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                      <span className="truncate max-w-[140px]">
                        {t.name || t.source_file || '—'}
                      </span>
                      <span className="font-mono flex-shrink-0">
                        {t.valid_from ? new Date(t.valid_from).toLocaleDateString('vi-VN') : ''}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: DETAIL, VISUAL CURVE & DATA GRID ── */}
        <div className="flex-1 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-3 sm:p-5 overflow-y-auto flex flex-col space-y-4 shadow-sm min-h-0 h-full">
          {!selectedTable ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500 dark:text-zinc-400 space-y-3 min-h-[300px]">
              <TableProperties className="w-12 h-12 opacity-30" />
              <h3 className="text-sm font-bold text-text-primary">Chưa chọn bảng nội suy</h3>
              <p className="text-xs max-w-sm">
                Vui lòng chọn một bảng từ danh sách bên trái hoặc nhấn nút "Tải lên bảng mới" để xem dữ liệu.
              </p>
            </div>
          ) : (
            <>
              {/* Table Info Header & Action Toolbar */}
              <div className="bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg font-mono font-extrabold text-xs border ${
                          (TABLE_TYPE_COLORS[selectedTable.table_type] || TABLE_TYPE_COLORS.default).bg
                        } ${(TABLE_TYPE_COLORS[selectedTable.table_type] || TABLE_TYPE_COLORS.default).text} ${
                          (TABLE_TYPE_COLORS[selectedTable.table_type] || TABLE_TYPE_COLORS.default).border
                        }`}
                      >
                        {selectedTable.table_type}
                      </span>
                      <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-text-primary">
                        {selectedTable.version} {selectedTable.name ? `— ${selectedTable.name}` : ''}
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      {(TABLE_TYPE_COLORS[selectedTable.table_type] || TABLE_TYPE_COLORS.default).label}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center flex-wrap gap-2">
                    <button
                      onClick={() => handleDownloadCsv(selectedTable.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white [&_*]:!text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                      title="Tải xuống file CSV gốc"
                    >
                      <Download className="w-3.5 h-3.5 text-white" />
                      Tải CSV
                    </button>

                    <button
                      onClick={() => setTableToReimport(selectedTable)}
                      disabled={reimportMutation.isPending}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 !text-white [&_*]:!text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                      title="Đọc lại dữ liệu từ file CSV"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 text-white ${reimportMutation.isPending ? 'animate-spin' : ''}`} />
                      Nạp lại
                    </button>

                    <button
                      onClick={() => setTableToDelete(selectedTable)}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 !text-white [&_*]:!text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                      title="Xóa bảng nội suy này"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                      Xóa bảng
                    </button>
                  </div>
                </div>

                {/* Metadata Pills */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">Số dòng dữ liệu:</span>
                    <p className="font-mono font-bold text-slate-900 dark:text-text-primary">{selectedTable.rows_count} dòng</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">Hiệu lực từ:</span>
                    <p className="font-mono font-bold text-slate-900 dark:text-text-primary">
                      {selectedTable.valid_from ? new Date(selectedTable.valid_from).toLocaleDateString('vi-VN') : '—'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">Hiệu lực đến:</span>
                    <p className="font-mono font-bold text-slate-900 dark:text-text-primary">
                      {selectedTable.valid_to ? new Date(selectedTable.valid_to).toLocaleDateString('vi-VN') : '—'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">File gốc:</span>
                    <p className="font-mono text-slate-900 dark:text-text-primary truncate" title={selectedTable.source_file}>
                      {selectedTable.source_file || '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Visual Interpolation Curve (SVG Chart) */}
              {chartData && (
                <div className="bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-5 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-text-primary flex items-center gap-2 uppercase tracking-wider">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      Đường đặc tính nội suy ({selectedTable.table_type})
                    </h3>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                      X: [{chartData.minX} → {chartData.maxX}] | Z: [{chartData.minZ} → {chartData.maxZ}]
                    </span>
                  </div>

                  <div className="w-full bg-white dark:bg-zinc-900 rounded-xl p-3 border border-slate-200 dark:border-zinc-800 overflow-hidden">
                    <svg
                      viewBox={`0 0 ${chartData.width} ${chartData.height}`}
                      className="w-full h-36 overflow-visible"
                    >
                      {/* Grid Lines */}
                      <line x1="30" y1="30" x2="570" y2="30" stroke="currentColor" className="text-zinc-800" strokeDasharray="3 3" />
                      <line x1="30" y1="90" x2="570" y2="90" stroke="currentColor" className="text-zinc-800" strokeDasharray="3 3" />
                      <line x1="30" y1="150" x2="570" y2="150" stroke="currentColor" className="text-zinc-800" strokeDasharray="3 3" />

                      {/* Polyline Curve */}
                      <polyline
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={chartData.polyline}
                      />
                    </svg>
                  </div>
                </div>
              )}

              {/* Data Grid Table */}
              <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col space-y-0 shadow-sm">
                {/* Search Bar for Rows */}
                <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-emerald-500" />
                      Chi tiết dữ liệu ({rowsTotal} dòng)
                    </h3>
                  </div>

                  <div className="relative w-48 sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Tìm giá trị X..."
                      value={rowsSearchQuery}
                      onChange={(e) => {
                        setRowsSearchQuery(e.target.value);
                        setRowsPage(1);
                      }}
                      className="w-full pl-8 pr-3 py-1 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary placeholder:text-slate-500 dark:text-zinc-400 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Table Rows */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-white dark:bg-zinc-950/80 text-slate-500 dark:text-zinc-400 font-bold border-b border-slate-200 dark:border-zinc-800">
                        <th className="py-2.5 px-4 w-16 text-center">#</th>
                        <th className="py-2.5 px-4">X (Cột đầu vào 1)</th>
                        {hasYColumn && <th className="py-2.5 px-4">Y (Cột đầu vào 2)</th>}
                        <th className="py-2.5 px-4">Z (Giá trị đầu ra)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                      {isLoadingDetail ? (
                        <tr>
                          <td colSpan={hasYColumn ? 4 : 3} className="py-8 text-center text-slate-500 dark:text-zinc-400">
                            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                            Đang nạp dữ liệu bảng...
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={hasYColumn ? 4 : 3} className="py-8 text-center text-slate-500 dark:text-zinc-400 italic">
                            Không có dữ liệu phù hợp.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, idx) => (
                          <tr
                            key={r.id || idx}
                            className="hover:bg-slate-100/60 dark:bg-zinc-800/40 font-mono transition-colors"
                          >
                            <td className="py-2 px-4 text-center text-slate-500 dark:text-zinc-400 text-[11px]">
                              {(rowsPage - 1) * rowsPerPage + idx + 1}
                            </td>
                            <td className="py-2 px-4 font-semibold text-emerald-600 dark:text-emerald-400">
                              {r.x}
                            </td>
                            {hasYColumn && (
                              <td className="py-2 px-4 text-cyan-600 dark:text-cyan-400">
                                {r.y ?? '—'}
                              </td>
                            )}
                            <td className="py-2 px-4 font-bold text-text-primary">
                              {r.z}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="p-3 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/50 flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                    <span>
                      Trang <strong className="text-text-primary">{rowsPage}</strong> / {totalPages} (
                      {rowsTotal} dòng)
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setRowsPage((p) => Math.max(1, p - 1))}
                        disabled={rowsPage <= 1}
                        className="p-1.5 rounded-lg bg-white dark:bg-zinc-950 hover:bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setRowsPage((p) => Math.min(totalPages, p + 1))}
                        disabled={rowsPage >= totalPages}
                        className="p-1.5 rounded-lg bg-white dark:bg-zinc-950 hover:bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── MODAL: UPLOAD INTERPOLATION TABLE ── */}
      {showUploadModal && (
        <UploadTableModal
          tableTypeChoices={tableTypeChoices}
          onClose={() => setShowUploadModal(false)}
          onSuccess={(created) => {
            setShowUploadModal(false);
            queryClient.invalidateQueries({ queryKey: ['interpolation-tables-list'] });
            if (created?.id) setSelectedTableId(created.id);
          }}
        />
      )}

      {/* ── MODAL: CONFIRM DELETE ── */}
      {tableToDelete && (
        <ConfirmModal
          title="Xác nhận xóa bảng nội suy"
          message={`Bạn có chắc chắn muốn xóa bảng ${tableToDelete.table_type} - ${tableToDelete.version} (${tableToDelete.rows_count} dòng)? Hành động này sẽ xóa toàn bộ dữ liệu dòng và làm gián đoạn các công thức đang liên kết tới bảng này.`}
          confirmText="Xác nhận xóa"
          cancelText="Hủy"
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(tableToDelete.id)}
          onCancel={() => setTableToDelete(null)}
        />
      )}

      {/* ── MODAL: CONFIRM REIMPORT ── */}
      {tableToReimport && (
        <ConfirmModal
          title="Nạp lại dữ liệu từ file gốc"
          message={`Nạp lại toàn bộ dữ liệu từ file CSV "${tableToReimport.source_file}" cho bảng ${tableToReimport.table_type} - ${tableToReimport.version}? Dữ liệu dòng hiện tại sẽ được thay thế hoàn toàn.`}
          confirmText="Nạp lại ngay"
          cancelText="Hủy"
          variant="default"
          isLoading={reimportMutation.isPending}
          onConfirm={() => reimportMutation.mutate(tableToReimport.id)}
          onCancel={() => setTableToReimport(null)}
        />
      )}
    </div>
  );
}

// ── SUB-COMPONENT: UPLOAD TABLE MODAL ───────────────────────────────────────────
interface UploadModalProps {
  tableTypeChoices: { code: string; name: string }[];
  onClose: () => void;
  onSuccess: (createdTable: any) => void;
}

function UploadTableModal({ tableTypeChoices, onClose, onSuccess }: UploadModalProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tableType, setTableType] = useState('ZV');
  const [version, setVersion] = useState('');
  const [name, setName] = useState('');
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().split('T')[0]);
  const [validTo, setValidTo] = useState('2030-12-31');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableType || !version.trim() || !validFrom || !validTo) {
      showToast('Vui lòng điền đầy đủ các thông tin bắt buộc.', 'warning');
      return;
    }
    if (!selectedFile) {
      showToast('Vui lòng đính kèm file CSV bảng nội suy.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('table_type', tableType);
      formData.append('version', version.trim());
      formData.append('name', name.trim());
      formData.append('valid_from', validFrom);
      formData.append('valid_to', validTo);
      formData.append('file', selectedFile);

      const res = await fetch('/api/v1/interpolation-tables', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Lỗi khi tải lên bảng nội suy.');
      }

      showToast(`Đã thêm thành công bảng ${tableType} - ${version}!`, 'success');
      onSuccess(data?.data);
    } catch (err: any) {
      showToast(err.message || 'Lỗi không xác định khi tải lên file.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
              <Upload className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm sm:text-base text-text-primary">
              Tải lên Bảng Nội Suy mới
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 dark:text-zinc-400 hover:text-text-primary rounded-lg hover:bg-slate-100 dark:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Loại bảng */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-primary flex items-center gap-1">
                Loại bảng <span className="text-rose-500">*</span>
              </label>
              <select
                value={tableType}
                onChange={(e) => setTableType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                required
              >
                {tableTypeChoices.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Phiên bản / Nhóm mã */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-primary flex items-center gap-1">
                Nhóm mã / Phiên bản <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="VD: ver1, 2026_v1..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500 font-mono"
                required
              />
            </div>
          </div>

          {/* Tên bảng */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-primary">
              Tên mô tả bảng
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Bảng ZV Hồ chính theo quy trình vận hành 2026..."
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Ngày hiệu lực */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-primary flex items-center gap-1">
                Bắt đầu hiệu lực <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500 font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-primary flex items-center gap-1">
                Kết thúc hiệu lực <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-text-primary focus:outline-none focus:border-emerald-500 font-mono"
                required
              />
            </div>
          </div>

          {/* File Upload Drag & Drop Area */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-primary flex items-center gap-1">
              File CSV dữ liệu <span className="text-rose-500">*</span>
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setSelectedFile(e.target.files[0]);
                }
              }}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`p-5 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2 ${
                selectedFile
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-500'
                  : 'border-slate-200 dark:border-zinc-800 hover:border-emerald-500/50 bg-white dark:bg-zinc-950/50 text-slate-500 dark:text-zinc-400'
              }`}
            >
              <FileSpreadsheet className="w-8 h-8 opacity-80" />
              {selectedFile ? (
                <div>
                  <p className="text-xs font-bold text-text-primary">{selectedFile.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-bold text-text-primary">
                    Kéo thả file CSV vào đây hoặc click để chọn
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Hỗ trợ định dạng 2 cột (X, Z) hoặc 3 cột (X, Y, Z)
                  </p>
                </div>
              )}
            </div>
          </div>

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
                  Đang nạp dữ liệu...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-white" />
                  Tải lên & Lưu
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
