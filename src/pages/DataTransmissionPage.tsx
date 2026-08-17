import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Radio,
  Send,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  RotateCcw,
  History,
  TableProperties,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Landmark,
  Zap,
  Globe,
  Sliders,
  Database,
  Copy,
  Check,
  Layers,
  Eye,
} from 'lucide-react';
import {
  transmissionsApi,
  type DataTransmissionItem,
  type TransmissionFactor,
  type TransmissionSession,
  type TransmissionMetadata,
} from '../api/transmissions';
import { useToast } from '../contexts/ToastContext';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { ConfirmModal } from '../components/ConfirmModal';

// ── Icons helper for receivers ───────────────────────────────────────
function getReceiverIcon(type: string) {
  switch (type) {
    case 'CUC_TNN':
    case 'TONG_CUC_KTTV':
    case 'CUC_KTTV':
      return Building2;
    case 'SO_TNMT':
    case 'SO_NNMT_QNAM':
    case 'SO_NNMT_LD':
    case 'SO_NNMT_YB':
    case 'SO_NNMT_HG':
    case 'SO_NNMT_SL':
    case 'SO_NNMT_NA':
      return Landmark;
    case 'BO_CONG_THUONG':
      return Zap;
    case 'VRAIN':
      return Radio;
    default:
      return Globe;
  }
}

export function DataTransmissionPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'factors' | 'sessions'>('factors');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'error'>('all');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Modals
  const [showAddTransmissionModal, setShowAddTransmissionModal] = useState(false);
  const [showEditTransmissionModal, setShowEditTransmissionModal] = useState(false);
  const [showAddFactorModal, setShowAddFactorModal] = useState(false);
  const [editingFactor, setEditingFactor] = useState<TransmissionFactor | null>(null);
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const [viewingSession, setViewingSession] = useState<TransmissionSession | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: number; type: 'transmission' | 'factor'; name: string; factorId?: number } | null>(null);

  // Form states
  const [transForm, setTransForm] = useState({
    name: '',
    receiver_type: 'CUC_TNN',
    province_code: 'LCa',
    plant_symbol: '',
    endpoint_url: '',
    username: '',
    password: '',
    interval_minutes: 15,
    delay_minutes: 0,
    is_active: true,
  });

  const [factorForm, setFactorForm] = useState({
    symbol: '',
    symbol_type: 'MUCNUOC',
    sub_symbol: '',
    factor_type: 'Z_TL',
    unit: 'm',
    data_format: 'calculation',
    transmission_objects: ['HO_CHUA'],
    data_type: 'instant',
    status: 'live',
    calculated_value_id: null as number | null,
    station_sensor_id: null as number | null,
    latitude: null as number | null,
    longitude: null as number | null,
  });

  const [backfillFrom, setBackfillFrom] = useState('');
  const [backfillTo, setBackfillTo] = useState('');

  // ── 1. Queries ───────────────────────────────────────────────────────
  const { data: transmissionResponse, isLoading, refetch } = useQuery({
    queryKey: ['transmissions-collection'],
    queryFn: transmissionsApi.fetchTransmissions,
    refetchInterval: 20000,
  });

  const items: DataTransmissionItem[] = useMemo(() => {
    return transmissionResponse?.items || [];
  }, [transmissionResponse]);

  const metadata: TransmissionMetadata | null = useMemo(() => {
    return transmissionResponse?.metadata || null;
  }, [transmissionResponse]);

  // Auto-select first item if none selected
  const selectedItem: DataTransmissionItem | null = useMemo(() => {
    if (items.length === 0) return null;
    if (selectedId) {
      const found = items.find((i) => i.id === selectedId);
      if (found) return found;
    }
    return items[0];
  }, [items, selectedId]);

  // Filtered master list
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.endpoint_url.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.receiver_type_display.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === 'active') matchesStatus = item.is_active;
      else if (statusFilter === 'inactive') matchesStatus = !item.is_active;
      else if (statusFilter === 'error') matchesStatus = item.last_transmission_status === false;

      return matchesSearch && matchesStatus;
    });
  }, [items, searchQuery, statusFilter]);

  // ── 2. Mutations ─────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: transmissionsApi.toggleTransmission,
    onSuccess: (data) => {
      showToast(data.message, 'success');
      queryClient.invalidateQueries({ queryKey: ['transmissions-collection'] });
    },
    onError: (err: any) => showToast(err.message || 'Lỗi khi chuyển trạng thái', 'error'),
  });

  const testMutation = useMutation({
    mutationFn: transmissionsApi.testTransmission,
    onSuccess: (data) => {
      showToast(data.message || 'Đã gửi bản tin truyền thử thành công!', 'success');
      queryClient.invalidateQueries({ queryKey: ['transmissions-collection'] });
    },
    onError: (err: any) => showToast(err.message || 'Lỗi khi truyền tin thử', 'error'),
  });

  const backfillMutation = useMutation({
    mutationFn: ({ id, fromTime, toTime }: { id: number; fromTime: string; toTime: string }) =>
      transmissionsApi.backfillTransmission(id, fromTime, toTime),
    onSuccess: (data) => {
      showToast(data.message || 'Đã hoàn thành truyền bù dữ liệu!', 'success');
      setShowBackfillModal(false);
      queryClient.invalidateQueries({ queryKey: ['transmissions-collection'] });
    },
    onError: (err: any) => showToast(err.message || 'Lỗi khi truyền bù', 'error'),
  });

  const createTransMutation = useMutation({
    mutationFn: transmissionsApi.createTransmission,
    onSuccess: (newItem) => {
      showToast('Đã tạo cấu hình truyền tin thành công!', 'success');
      setShowAddTransmissionModal(false);
      setSelectedId(newItem.id);
      queryClient.invalidateQueries({ queryKey: ['transmissions-collection'] });
    },
    onError: (err: any) => showToast(err.message || 'Lỗi khi tạo cấu hình', 'error'),
  });

  const updateTransMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      transmissionsApi.updateTransmission(id, payload),
    onSuccess: () => {
      showToast('Đã cập nhật cấu hình truyền tin!', 'success');
      setShowEditTransmissionModal(false);
      queryClient.invalidateQueries({ queryKey: ['transmissions-collection'] });
    },
    onError: (err: any) => showToast(err.message || 'Lỗi khi cập nhật', 'error'),
  });

  const deleteTransMutation = useMutation({
    mutationFn: transmissionsApi.deleteTransmission,
    onSuccess: () => {
      showToast('Đã xóa cấu hình truyền tin thành công.', 'success');
      setItemToDelete(null);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['transmissions-collection'] });
    },
    onError: (err: any) => showToast(err.message || 'Lỗi khi xóa', 'error'),
  });

  const createFactorMutation = useMutation({
    mutationFn: ({ transId, payload }: { transId: number; payload: any }) =>
      transmissionsApi.createFactor(transId, payload),
    onSuccess: () => {
      showToast('Đã thêm yếu tố truyền tin thành công!', 'success');
      setShowAddFactorModal(false);
      queryClient.invalidateQueries({ queryKey: ['transmissions-collection'] });
    },
    onError: (err: any) => showToast(err.message || 'Lỗi khi thêm yếu tố', 'error'),
  });

  const updateFactorMutation = useMutation({
    mutationFn: ({ transId, factorId, payload }: { transId: number; factorId: number; payload: any }) =>
      transmissionsApi.updateFactor(transId, factorId, payload),
    onSuccess: () => {
      showToast('Đã cập nhật yếu tố truyền tin!', 'success');
      setEditingFactor(null);
      queryClient.invalidateQueries({ queryKey: ['transmissions-collection'] });
    },
    onError: (err: any) => showToast(err.message || 'Lỗi khi cập nhật yếu tố', 'error'),
  });

  const deleteFactorMutation = useMutation({
    mutationFn: ({ transId, factorId }: { transId: number; factorId: number }) =>
      transmissionsApi.deleteFactor(transId, factorId),
    onSuccess: () => {
      showToast('Đã xóa yếu tố truyền tin.', 'success');
      setItemToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['transmissions-collection'] });
    },
    onError: (err: any) => showToast(err.message || 'Lỗi khi xóa yếu tố', 'error'),
  });

  const retrySessionMutation = useMutation({
    mutationFn: transmissionsApi.retrySession,
    onSuccess: (data) => {
      showToast(data.message || 'Đã gửi lại phiên truyền tin!', 'success');
      queryClient.invalidateQueries({ queryKey: ['transmissions-collection'] });
    },
    onError: (err: any) => showToast(err.message || 'Lỗi khi thử lại', 'error'),
  });

  // Handlers
  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
    showToast('Đã sao chép đường dẫn API vào bộ nhớ đệm', 'info');
  };

  const handleOpenEdit = (item: DataTransmissionItem) => {
    setTransForm({
      name: item.name,
      receiver_type: item.receiver_type,
      province_code: item.province_code,
      plant_symbol: item.plant_symbol,
      endpoint_url: item.endpoint_url,
      username: item.username,
      password: '',
      interval_minutes: item.interval_minutes,
      delay_minutes: item.delay_minutes,
      is_active: item.is_active,
    });
    setShowEditTransmissionModal(true);
  };

  const handleOpenAddFactor = () => {
    setFactorForm({
      symbol: '',
      symbol_type: 'MUCNUOC',
      sub_symbol: '',
      factor_type: 'Z_TL',
      unit: 'm',
      data_format: 'calculation',
      transmission_objects: ['HO_CHUA'],
      data_type: 'instant',
      status: 'live',
      calculated_value_id: null,
      station_sensor_id: null,
      latitude: 21.943,
      longitude: 104.153,
    });
    setShowAddFactorModal(true);
  };

  return (
    <div className="space-y-6">
      {/* ── 1. PAGE HEADER ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                Truyền Dữ Liệu Tự Động (Data Transmission)
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setTransForm({
                name: '',
                receiver_type: 'CUC_TNN',
                province_code: 'LCa',
                plant_symbol: 'NXL3',
                endpoint_url: 'http://tnn.monre.gov.vn/api/v1/data',
                username: '',
                password: '',
                interval_minutes: 15,
                delay_minutes: 0,
                is_active: true,
              });
              setShowAddTransmissionModal(true);
            }}
            className="flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Thêm cơ quan nhận
          </Button>
        </div>
      </div>

      {/* ── 2. TWO-COLUMN MASTER-DETAIL LAYOUT ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── LEFT PANEL: MASTER LIST OF TRANSMISSION RECEIVERS (4 cols) ─ */}
        <div className="lg:col-span-4 space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-2xs space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm cơ quan, đường dẫn API..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto text-[11px] font-medium pb-0.5">
              {[
                { id: 'all', label: `Tất cả (${items.length})` },
                { id: 'active', label: 'Đang chạy' },
                { id: 'inactive', label: 'Tạm dừng' },
                { id: 'error', label: 'Lỗi' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id as any)}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === f.id
                      ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                      : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cards List */}
          <div className="space-y-2.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Đang tải danh sách cơ quan truyền dữ liệu...</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs text-slate-400">
                Không tìm thấy cấu hình truyền tin nào.
              </div>
            ) : (
              filteredItems.map((item) => {
                const Icon = getReceiverIcon(item.receiver_type);
                const isSelected = selectedItem?.id === item.id;
                const isSuccess = item.last_transmission_status !== false;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer relative space-y-2.5 ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500 shadow-xs ring-1 ring-emerald-500/50'
                        : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 shadow-2xs'
                    }`}
                  >
                    {/* Hàng 1: Icon + Tên cơ quan + Công tắc bật/tắt */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`p-2 rounded-lg shrink-0 ${
                            item.is_active
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate">
                            {item.receiver_type_display || item.name}
                          </h3>
                          <span className="text-[11px] text-slate-600 dark:text-zinc-400 font-medium truncate block mt-0.5">
                            {item.name !== item.receiver_type_display
                              ? item.name
                              : item.plant_symbol
                              ? `Mã: ${item.plant_symbol}`
                              : 'Cổng truyền tin'}
                          </span>
                        </div>
                      </div>

                      {/* Active Switch Toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMutation.mutate(item.id);
                        }}
                        disabled={toggleMutation.isPending}
                        className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          item.is_active ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-zinc-700'
                        }`}
                        title={item.is_active ? 'Bấm để tạm dừng truyền' : 'Bấm để kích hoạt truyền'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            item.is_active ? 'translate-x-3.5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Hàng 2: Thông số gọn gàng (Chu kỳ, Số yếu tố, Lần cuối, Trạng thái) - 1 dòng duy nhất */}
                    <div className="flex items-center justify-between text-[11px] font-mono pt-2 border-t border-slate-100 dark:border-zinc-800/80 text-slate-700 dark:text-zinc-300">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-zinc-200">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {item.interval_minutes}p
                        </span>
                        <span className="text-slate-300 dark:text-zinc-700">•</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-zinc-200">
                          <Layers className="w-3 h-3 text-slate-500" />
                          {item.factors_count} yếu tố
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 font-sans">
                        <span className="text-[10px] text-slate-600 dark:text-zinc-400 font-medium">Lần cuối:</span>
                        <span className="font-bold font-mono text-slate-900 dark:text-white">
                          {item.last_transmission_at
                            ? new Date(item.last_transmission_at).toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })
                            : '—'}
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            item.is_active
                              ? isSuccess
                                ? 'bg-emerald-500'
                                : 'bg-rose-500'
                              : 'bg-slate-400'
                          }`}
                          title={
                            item.is_active
                              ? isSuccess
                                ? 'Truyền thành công'
                                : 'Lỗi truyền tin'
                              : 'Đang tắt'
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: SELECTED TRANSMISSION DETAIL & TABS (8 cols) ── */}
        <div className="lg:col-span-8 space-y-4">
          {selectedItem ? (
            <Card>
              <CardContent className="p-4 space-y-4">
                {/* ── COMPACT COLORFUL DETAIL HEADER (2 ROWS ONLY) ── */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-50 via-indigo-50/30 to-emerald-50/30 dark:from-zinc-900 dark:via-indigo-950/20 dark:to-emerald-950/20 border border-slate-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
                  {/* Hàng 1: Tiêu đề Cơ quan chính, Trạng thái & Toàn bộ nút Thao tác */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
                        <Radio className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                            {selectedItem.receiver_type_display || selectedItem.name}
                          </h2>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                              selectedItem.is_active
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                            }`}
                          >
                            {selectedItem.is_active ? '● Đang kích hoạt' : '○ Tạm dừng'}
                          </span>
                        </div>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                          {selectedItem.name !== selectedItem.receiver_type_display ? selectedItem.name : (selectedItem.plant_symbol ? `Mã trạm gửi: ${selectedItem.plant_symbol}` : 'Cổng truyền tin số liệu')}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons (Cùng hàng với tiêu đề) */}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => testMutation.mutate(selectedItem.id)}
                        disabled={testMutation.isPending}
                        className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 shadow-xs"
                      >
                        <Send className={`w-3.5 h-3.5 ${testMutation.isPending ? 'animate-spin' : ''}`} />
                        Truyền thử ngay
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const now = new Date();
                          const past = new Date(now.getTime() - 24 * 3600 * 1000);
                          setBackfillFrom(past.toISOString().slice(0, 16));
                          setBackfillTo(now.toISOString().slice(0, 16));
                          setShowBackfillModal(true);
                        }}
                        className="flex items-center gap-1.5 text-xs border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 bg-white/80 dark:bg-zinc-900/80 hover:bg-indigo-50"
                      >
                        <History className="w-3.5 h-3.5 text-indigo-500" />
                        Truyền bù
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenEdit(selectedItem)}
                        className="flex items-center gap-1.5 text-xs bg-white/80 dark:bg-zinc-900/80"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Sửa
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() =>
                          setItemToDelete({
                            id: selectedItem.id,
                            type: 'transmission',
                            name: selectedItem.name,
                          })
                        }
                        className="flex items-center gap-1 text-xs"
                        title="Xóa cấu hình"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Hàng 2: Thanh Thông Số Gọn Gàng (URL bên trái, Lần cuối & Chu kỳ bên phải) */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 rounded-xl bg-white/90 dark:bg-zinc-950/80 border border-slate-200/80 dark:border-zinc-800/80 text-xs">
                    {/* Endpoint URL */}
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600 dark:text-zinc-300 truncate max-w-md">
                      <span className="text-slate-400">URL:</span>
                      <span className="truncate text-slate-800 dark:text-zinc-200 font-semibold">
                        {selectedItem.endpoint_url || 'Chưa cấu hình Endpoint'}
                      </span>
                      {selectedItem.endpoint_url && (
                        <button
                          onClick={() => handleCopyUrl(selectedItem.endpoint_url)}
                          className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer ml-1"
                          title="Sao chép URL"
                        >
                          {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>

                    {/* Lần truyền cuối & Chu kỳ */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono ml-auto">
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-400">Lần cuối:</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {selectedItem.last_transmission_at
                            ? new Date(selectedItem.last_transmission_at).toLocaleString('vi-VN')
                            : 'Chưa truyền'}
                        </span>
                        {selectedItem.last_transmission_at && (
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              selectedItem.last_transmission_status !== false
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                selectedItem.last_transmission_status !== false ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                            />
                            {selectedItem.last_transmission_status !== false ? 'Thành công' : 'Lỗi'}
                          </span>
                        )}
                      </div>

                      <span className="text-slate-300 dark:text-zinc-700">•</span>

                      <div className="flex items-center gap-1 text-slate-600 dark:text-zinc-400">
                        <span className="text-slate-400">Chu kỳ:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {selectedItem.interval_minutes}p/lần
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Navigation Tabs (2 Tabs Only) */}
                <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-zinc-800 pb-2">
                  <button
                    onClick={() => setActiveDetailTab('factors')}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
                      activeDetailTab === 'factors'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <TableProperties className="w-3.5 h-3.5" />
                    Yếu tố truyền tin ({selectedItem.factors.length})
                  </button>
                  <button
                    onClick={() => setActiveDetailTab('sessions')}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
                      activeDetailTab === 'sessions'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    Lịch sử & Logs ({selectedItem.recent_sessions.length})
                  </button>
                </div>

                {/* ── TAB 1: FACTORS LIST & MAPPING ───────────────────────── */}
                {activeDetailTab === 'factors' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Danh Sách Ký Hiệu Yếu Tố Truyền (Factor Mappings)
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          Ánh xạ các thông số quan trắc sang mã chuẩn theo quy định của cơ quan tiếp nhận.
                        </p>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleOpenAddFactor}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Thêm yếu tố
                      </Button>
                    </div>

                    {selectedItem.factors.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 dark:bg-zinc-950 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 space-y-2">
                        <Sliders className="w-8 h-8 text-slate-400 mx-auto" />
                        <p className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
                          Chưa có yếu tố truyền nào được gán cho cơ quan này.
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Bấm "Thêm yếu tố" để cấu hình truyền Mực nước, Lưu lượng, Mưa lưu vực, Độ mở cửa van...
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100/70 dark:bg-zinc-800/50 text-slate-700 dark:text-zinc-300 font-semibold border-b border-slate-200 dark:border-zinc-800">
                            <tr>
                              <th className="p-3">Ký hiệu chuẩn</th>
                              <th className="p-3">Loại yếu tố</th>
                              <th className="p-3">Đối tượng</th>
                              <th className="p-3">Nguồn dữ liệu</th>
                              <th className="p-3">Giá trị tức thời</th>
                              <th className="p-3">Trạng thái</th>
                              <th className="p-3 text-right">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60 bg-white dark:bg-zinc-900">
                            {selectedItem.factors.map((f) => (
                              <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors">
                                <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                                  <div>{f.symbol || '—'}</div>
                                  {f.sub_symbol && (
                                    <span className="text-[10px] font-normal text-slate-400">
                                      Phụ: {f.sub_symbol}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3">
                                  <div className="font-semibold text-slate-800 dark:text-zinc-200">
                                    {f.symbol_type_display || f.symbol_type}
                                  </div>
                                </td>
                                <td className="p-3">
                                  <div className="flex flex-wrap gap-1">
                                    {f.transmission_objects && f.transmission_objects.length > 0 ? (
                                      f.transmission_objects.map((obj) => (
                                        <span
                                          key={obj}
                                          className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                                        >
                                          {obj}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3">
                                  {f.calculated_value_name ? (
                                    <div className="flex items-center gap-1.5">
                                      <Database className="w-3.5 h-3.5 text-emerald-500" />
                                      <div>
                                        <div className="font-medium text-slate-800 dark:text-zinc-200">
                                          {f.calculated_value_name}
                                        </div>
                                        <div className="text-[10px] font-mono text-slate-400">
                                          {f.calculated_value_code}
                                        </div>
                                      </div>
                                    </div>
                                  ) : f.station_sensor_name ? (
                                    <div className="flex items-center gap-1.5">
                                      <Radio className="w-3.5 h-3.5 text-indigo-500" />
                                      <div>
                                        <div className="font-medium text-slate-800 dark:text-zinc-200">
                                          {f.station_sensor_name}
                                        </div>
                                        <div className="text-[10px] font-mono text-slate-400">
                                          {f.station_sensor_code}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-rose-500 text-[11px] font-medium">Chưa gán nguồn</span>
                                  )}
                                </td>
                                <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {f.current_value !== null ? `${f.current_value} ${f.unit}` : '—'}
                                </td>
                                <td className="p-3">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                      f.status === 'live'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                        : f.status === 'test'
                                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        f.status === 'live' ? 'bg-emerald-500' : f.status === 'test' ? 'bg-blue-500' : 'bg-rose-500'
                                      }`}
                                    />
                                    {f.status_display}
                                  </span>
                                  {f.last_connected_at && (
                                    <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5 text-slate-400" />
                                      {new Date(f.last_connected_at).toLocaleString('vi-VN')}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => {
                                        setEditingFactor(f);
                                        setFactorForm({
                                          symbol: f.symbol,
                                          symbol_type: f.symbol_type,
                                          sub_symbol: f.sub_symbol,
                                          factor_type: f.factor_type,
                                          unit: f.unit,
                                          data_format: f.data_format,
                                          transmission_objects: f.transmission_objects || [],
                                          data_type: f.data_type,
                                          status: f.status,
                                          calculated_value_id: f.calculated_value_id,
                                          station_sensor_id: f.station_sensor_id,
                                          latitude: f.latitude,
                                          longitude: f.longitude,
                                        });
                                      }}
                                      className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                                      title="Sửa yếu tố"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        setItemToDelete({
                                          id: selectedItem.id,
                                          factorId: f.id,
                                          type: 'factor',
                                          name: f.symbol || f.factor_type_display,
                                        })
                                      }
                                      className="p-1 rounded text-rose-500 hover:text-rose-600 transition-colors"
                                      title="Xóa yếu tố"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB 2: SESSIONS & LOGS ─────────────────────────────── */}
                {activeDetailTab === 'sessions' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Nhật Ký Các Phiên Truyền Tin Gần Nhất
                      </h3>
                      <span className="text-[11px] text-slate-400">Tự động cập nhật mỗi 20 giây</span>
                    </div>

                    {selectedItem.recent_sessions.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs text-slate-400">
                        Chưa có lịch sử phiên truyền tin nào được ghi nhận.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100/70 dark:bg-zinc-800/50 text-slate-700 dark:text-zinc-300 font-semibold border-b border-slate-200 dark:border-zinc-800">
                            <tr>
                              <th className="p-3">Thời gian</th>
                              <th className="p-3">Loại kích hoạt</th>
                              <th className="p-3">Kết quả</th>
                              <th className="p-3">Số lượng yếu tố</th>
                              <th className="p-3">HTTP Code</th>
                              <th className="p-3 text-right">Chi tiết / Thử lại</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60 bg-white dark:bg-zinc-900">
                            {selectedItem.recent_sessions.map((s) => (
                              <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors">
                                <td className="p-3 font-mono text-slate-800 dark:text-zinc-200">
                                  {new Date(s.scheduled_at).toLocaleString('vi-VN')}
                                </td>
                                <td className="p-3">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                                    {s.triggered_by === 'auto'
                                      ? 'Tự động'
                                      : s.triggered_by === 'manual'
                                      ? 'Thủ công'
                                      : s.triggered_by === 'backfill'
                                      ? 'Truyền bù'
                                      : 'Thử lại'}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                      s.status === 'success'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                        : s.status === 'partial'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    }`}
                                  >
                                    {s.status === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                    {s.status_display}
                                  </span>
                                </td>
                                <td className="p-3 font-mono text-xs">
                                  <span className="text-emerald-600 font-bold">{s.success_count}</span>
                                  <span className="text-slate-400">/{s.total_factors}</span>
                                </td>
                                <td className="p-3 font-mono">
                                  <span
                                    className={`font-bold ${
                                      s.http_status_code === 200 ? 'text-emerald-600' : 'text-rose-500'
                                    }`}
                                  >
                                    {s.http_status_code || '—'}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => setViewingSession(s)}
                                      className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                                      title="Xem nội dung bản tin"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    {s.status !== 'success' && (
                                      <button
                                        onClick={() => retrySessionMutation.mutate(s.id)}
                                        disabled={retrySessionMutation.isPending}
                                        className="p-1 rounded text-emerald-600 hover:text-emerald-700 transition-colors"
                                        title="Thử lại bản tin này"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-slate-400 space-y-3">
                <Radio className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
                  Chưa chọn cơ quan nhận dữ liệu
                </p>
                <p className="text-xs text-slate-400">
                  Hãy chọn một cơ quan từ danh sách bên trái hoặc bấm "Thêm cơ quan nhận" để bắt đầu cấu hình.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── MODALS ────────────────────────────────────────────────────── */}

      {/* 1. ADD / EDIT TRANSMISSION MODAL */}
      {(showAddTransmissionModal || showEditTransmissionModal) && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-500" />
              {showAddTransmissionModal ? 'Thêm Đơn Vị Tiếp Nhận Dữ Liệu' : 'Sửa Cấu Hình Truyền Tin'}
            </h3>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (showAddTransmissionModal) {
                  createTransMutation.mutate(transForm);
                } else if (selectedItem) {
                  updateTransMutation.mutate({ id: selectedItem.id, payload: transForm });
                }
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Tên đơn vị</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Cục Quản lý Tài nguyên Nước"
                  value={transForm.name}
                  onChange={(e) => setTransForm({ ...transForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Loại cơ quan</label>
                  <select
                    value={transForm.receiver_type}
                    onChange={(e) => setTransForm({ ...transForm, receiver_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
                  >
                    {metadata?.receiver_choices.map((rc) => (
                      <option key={rc.code} value={rc.code}>
                        {rc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Ký hiệu nhà máy</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: NXL3"
                    value={transForm.plant_symbol}
                    onChange={(e) => setTransForm({ ...transForm, plant_symbol: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Đường dẫn Endpoint API / FTP</label>
                <input
                  type="text"
                  required
                  placeholder="http://cucqlttn.gov.vn/api/push-data"
                  value={transForm.endpoint_url}
                  onChange={(e) => setTransForm({ ...transForm, endpoint_url: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Tài khoản (Username)</label>
                  <input
                    type="text"
                    placeholder="Để trống nếu không cần"
                    value={transForm.username}
                    onChange={(e) => setTransForm({ ...transForm, username: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Mật khẩu (Password)</label>
                  <input
                    type="password"
                    placeholder="Mật khẩu API"
                    value={transForm.password}
                    onChange={(e) => setTransForm({ ...transForm, password: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Chu kỳ truyền (phút)</label>
                  <input
                    type="number"
                    min="1"
                    value={transForm.interval_minutes}
                    onChange={(e) => setTransForm({ ...transForm, interval_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Độ trễ (Delay phút)</label>
                  <input
                    type="number"
                    min="0"
                    value={transForm.delay_minutes}
                    onChange={(e) => setTransForm({ ...transForm, delay_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddTransmissionModal(false);
                    setShowEditTransmissionModal(false);
                  }}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={createTransMutation.isPending || updateTransMutation.isPending}
                >
                  {showAddTransmissionModal ? 'Tạo cấu hình' : 'Lưu thay đổi'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. ADD / EDIT FACTOR MODAL */}
      {(showAddFactorModal || editingFactor) && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TableProperties className="w-4 h-4 text-emerald-500" />
              {showAddFactorModal ? 'Thêm Yếu Tố Truyền Dữ Liệu' : 'Sửa Yếu Tố Truyền Dữ Liệu'}
            </h3>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!selectedItem) return;
                if (showAddFactorModal) {
                  createFactorMutation.mutate({ transId: selectedItem.id, payload: factorForm });
                } else if (editingFactor) {
                  updateFactorMutation.mutate({
                    transId: selectedItem.id,
                    factorId: editingFactor.id,
                    payload: factorForm,
                  });
                }
              }}
              className="space-y-3.5 text-xs"
            >
              {/* Hàng 1: Ký hiệu & Loại yếu tố */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">
                    Yếu tố truyền (Ký hiệu mã gửi) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: QDEN, HTL, MucNuocHo, Tramdomua1..."
                    value={factorForm.symbol}
                    onChange={(e) => setFactorForm({ ...factorForm, symbol: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">
                    Loại yếu tố chuẩn <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={factorForm.symbol_type}
                    onChange={(e) => {
                      const st = e.target.value;
                      let defaultUnit = factorForm.unit;
                      let defaultFormat = factorForm.data_format;
                      let defaultType = factorForm.factor_type;

                      if (st === 'LUONGMUA') {
                        defaultUnit = 'mm';
                        defaultFormat = 'observation';
                        defaultType = 'RAIN';
                      } else if (st === 'MUCNUOC' || st === 'MUCNUOCDUBAO') {
                        defaultUnit = 'm';
                        defaultType = 'Z_TL';
                      } else if (st.startsWith('LUULUONG')) {
                        defaultUnit = 'm³/s';
                        defaultType = 'Q_DEN';
                      } else if (st === 'DUNGTICH') {
                        defaultUnit = '10^6 m³';
                        defaultType = 'V';
                      } else if (st === 'CONGSUAT') {
                        defaultUnit = 'MW';
                        defaultType = 'P';
                      }

                      setFactorForm({
                        ...factorForm,
                        symbol_type: st,
                        unit: defaultUnit,
                        data_format: defaultFormat,
                        factor_type: defaultType,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-emerald-500"
                  >
                    {metadata?.symbol_type_choices.map((sc) => (
                      <option key={sc.code} value={sc.code}>
                        {sc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Hàng Đối tượng truyền (Multi-select Tag Chips) - Chỉ hiện khi Tính toán hoặc khác Lượng mưa */}
              {factorForm.symbol_type !== 'LUONGMUA' && (
                <div className="space-y-1.5">
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold">
                    Đối tượng truyền
                  </label>
                  <div className="p-2 min-h-[42px] rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50 flex flex-wrap items-center gap-1.5">
                    {factorForm.transmission_objects.map((obj) => {
                      const matchObj = metadata?.trans_obj_choices.find((o) => o.code === obj);
                      return (
                        <span
                          key={obj}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 shadow-2xs"
                        >
                          {matchObj?.name || obj}
                          <button
                            type="button"
                            onClick={() =>
                              setFactorForm({
                                ...factorForm,
                                transmission_objects: factorForm.transmission_objects.filter((o) => o !== obj),
                              })
                            }
                            className="text-slate-400 hover:text-rose-500 cursor-pointer ml-0.5"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}

                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value && !factorForm.transmission_objects.includes(e.target.value)) {
                          setFactorForm({
                            ...factorForm,
                            transmission_objects: [...factorForm.transmission_objects, e.target.value],
                          });
                        }
                      }}
                      className="text-xs bg-transparent border-0 text-slate-600 dark:text-zinc-400 focus:ring-0 cursor-pointer py-1"
                    >
                      <option value="">+ Chọn thêm đối tượng (Hồ chứa, Hạ lưu, H1, H2, Tràn, XTT...)</option>
                      {metadata?.trans_obj_choices
                        .filter((o) => !factorForm.transmission_objects.includes(o.code))
                        .map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.name} ({o.code})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Hàng 2: Trạng thái, Đơn vị, Kiểu dữ liệu */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Trạng thái</label>
                  <select
                    value={factorForm.status}
                    onChange={(e) => setFactorForm({ ...factorForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="live">Truyền thực</option>
                    <option value="test">Truyền thử</option>
                    <option value="error">Lỗi thiết bị</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Đơn vị</label>
                  <input
                    type="text"
                    placeholder="m³/s, m, mm..."
                    value={factorForm.unit}
                    onChange={(e) => setFactorForm({ ...factorForm, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">
                    Kiểu dữ liệu <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={factorForm.data_format}
                    onChange={(e) => setFactorForm({ ...factorForm, data_format: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border-2 border-indigo-400 dark:border-indigo-500 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-bold focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="calculation">Dữ liệu tính toán</option>
                    <option value="observation">Quan trắc</option>
                  </select>
                </div>
              </div>

              {/* ── NẾU CHỌN "QUAN TRẮC": HIỂN THỊ CÁC HÀNG KÝ HIỆU PHỤ, KINH ĐỘ, VĨ ĐỘ & SENSOR ── */}
              {factorForm.data_format === 'observation' && (
                <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                    <Radio className="w-3.5 h-3.5" />
                    Thông số trạm quan trắc trực tiếp
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Ký hiệu phụ</label>
                      <input
                        type="text"
                        placeholder="R, HTL, HHL..."
                        value={factorForm.sub_symbol}
                        onChange={(e) => setFactorForm({ ...factorForm, sub_symbol: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Kinh độ</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="1041813 hoặc 104.1813"
                        value={factorForm.longitude ?? ''}
                        onChange={(e) =>
                          setFactorForm({
                            ...factorForm,
                            longitude: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Vĩ độ</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="219347 hoặc 21.9347"
                        value={factorForm.latitude ?? ''}
                        onChange={(e) =>
                          setFactorForm({
                            ...factorForm,
                            latitude: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">
                      Cảm biến trạm đo trực tiếp (Station Sensor)
                    </label>
                    <select
                      value={factorForm.station_sensor_id ?? ''}
                      onChange={(e) =>
                        setFactorForm({
                          ...factorForm,
                          station_sensor_id: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">-- Chọn cảm biến trạm đo --</option>
                      {metadata?.station_sensors.map((ss) => (
                        <option key={ss.id} value={ss.id}>
                          [{ss.sensor_code}] {ss.name} ({ss.unit || '—'}) · Trạm: {ss.station_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddFactorModal(false);
                    setEditingFactor(null);
                  }}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={createFactorMutation.isPending || updateFactorMutation.isPending}
                >
                  {showAddFactorModal ? 'Thêm yếu tố' : 'Lưu thay đổi'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. BACKFILL MODAL */}
      {showBackfillModal && selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-500" />
              Truyền Bù Dữ Liệu Lịch Sử: {selectedItem.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Hệ thống sẽ tái tạo bản tin và gửi lần lượt theo từng bước {selectedItem.interval_minutes} phút trong khoảng thời gian đã chọn.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                backfillMutation.mutate({
                  id: selectedItem.id,
                  fromTime: backfillFrom,
                  toTime: backfillTo,
                });
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Từ thời điểm</label>
                <input
                  type="datetime-local"
                  required
                  value={backfillFrom}
                  onChange={(e) => setBackfillFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-zinc-300 font-semibold mb-1">Đến thời điểm</label>
                <input
                  type="datetime-local"
                  required
                  value={backfillTo}
                  onChange={(e) => setBackfillTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
                <Button type="button" variant="secondary" onClick={() => setShowBackfillModal(false)}>
                  Hủy
                </Button>
                <Button type="submit" variant="primary" disabled={backfillMutation.isPending}>
                  {backfillMutation.isPending ? 'Đang truyền bù...' : 'Bắt đầu truyền bù'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. VIEW SESSION DETAIL MODAL: TRANSMITTED VARIABLES & VALUES */}
      {viewingSession && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-500" />
                  Chi Tiết Biến Truyền & Giá Trị Phiên: {new Date(viewingSession.scheduled_at).toLocaleString('vi-VN')}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  Danh sách cụ thể các biến dữ liệu, thông số và giá trị thực tế đã gửi đi trong phiên này.
                </p>
              </div>
              <button
                onClick={() => setViewingSession(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick Session Summary Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950">
                <span className="text-[10px] text-slate-400">Kết quả phiên</span>
                <div className="font-bold flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      viewingSession.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  <span
                    className={
                      viewingSession.status === 'success'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }
                  >
                    {viewingSession.status_display}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950">
                <span className="text-[10px] text-slate-400">Thành công / Tổng</span>
                <div className="font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                  <span className="text-emerald-600">{viewingSession.success_count}</span>
                  <span className="text-slate-400">/{viewingSession.total_factors}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950">
                <span className="text-[10px] text-slate-400">HTTP Status Code</span>
                <div className="font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                  {viewingSession.http_status_code || '—'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950">
                <span className="text-[10px] text-slate-400">Loại kích hoạt</span>
                <div className="font-bold text-slate-800 dark:text-zinc-200 mt-0.5">
                  {viewingSession.triggered_by === 'auto'
                    ? 'Tự động'
                    : viewingSession.triggered_by === 'manual'
                    ? 'Thủ công'
                    : 'Truyền bù'}
                </div>
              </div>
            </div>

            {/* Sub-tabs: Transmitted Variables Table vs Raw Payload */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                  Bảng Chi Tiết Giá Trị Các Biến Đã Gửi
                </h4>
              </div>

              {/* 1. TABLE OF VARIABLES & TRANSMITTED VALUES */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/70 dark:bg-zinc-800/50 text-slate-700 dark:text-zinc-300 font-semibold border-b border-slate-200 dark:border-zinc-800">
                    <tr>
                      <th className="p-2.5">Ký hiệu biến</th>
                      <th className="p-2.5">Yếu tố đo</th>
                      <th className="p-2.5">Giá trị gửi đi</th>
                      <th className="p-2.5">Trạng thái gửi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60 bg-white dark:bg-zinc-900 font-mono">
                    {viewingSession.factor_logs && viewingSession.factor_logs.length > 0 ? (
                      viewingSession.factor_logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/30">
                          <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                            {log.symbol}
                            {log.sub_symbol && (
                              <span className="text-[10px] font-normal text-slate-400 ml-1">
                                ({log.sub_symbol})
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 font-sans text-slate-700 dark:text-zinc-300">
                            {log.factor_type_display}
                          </td>
                          <td className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400">
                            {log.value !== null ? `${log.value} ${log.unit}` : '—'}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.status === 'success'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  log.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                              />
                              {log.status_display || (log.status === 'success' ? 'Thành công' : 'Lỗi')}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : selectedItem && selectedItem.factors.length > 0 ? (
                      selectedItem.factors.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/30">
                          <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                            {f.symbol}
                            {f.sub_symbol && (
                              <span className="text-[10px] font-normal text-slate-400 ml-1">
                                ({f.sub_symbol})
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 font-sans text-slate-700 dark:text-zinc-300">
                            {f.factor_type_display}
                          </td>
                          <td className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400">
                            {f.current_value !== null ? `${f.current_value} ${f.unit}` : '0.0 ' + f.unit}
                          </td>
                          <td className="p-2.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {viewingSession.status === 'success' ? 'Đã gửi thành công' : 'Đã xử lý'}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-400 font-sans">
                          Không có biến nào được ghi nhận cho phiên này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Collapsible / Accordion for raw payload and response if needed */}
              <details className="text-xs bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 p-3">
                <summary className="font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer select-none">
                  ▶ Xem bản tin thô (Raw Payload & Server Response)
                </summary>
                <div className="space-y-3 pt-3">
                  <div>
                    <label className="block text-slate-500 dark:text-zinc-400 font-semibold mb-1">
                      Nội dung gửi đi (Payload)
                    </label>
                    <pre className="p-3 rounded-lg bg-slate-900 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-40 whitespace-pre-wrap">
                      {viewingSession.noi_dung || '// Không có payload được lưu'}
                    </pre>
                  </div>

                  <div>
                    <label className="block text-slate-500 dark:text-zinc-400 font-semibold mb-1">
                      Phản hồi từ Server (Response)
                    </label>
                    <pre className="p-3 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-36 whitespace-pre-wrap">
                      {viewingSession.response_body || '// Không có phản hồi'}
                    </pre>
                  </div>
                </div>
              </details>

              {viewingSession.error_message && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 text-xs">
                  <span className="font-bold">Lỗi phiên truyền: </span>
                  {viewingSession.error_message}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
              <Button variant="secondary" size="sm" onClick={() => setViewingSession(null)}>
                Đóng
              </Button>
              {viewingSession.status !== 'success' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    retrySessionMutation.mutate(viewingSession.id);
                    setViewingSession(null);
                  }}
                  disabled={retrySessionMutation.isPending}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Thử lại phiên này
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. CONFIRM DELETE MODAL */}
      {itemToDelete && (
        <ConfirmModal
          title={itemToDelete.type === 'transmission' ? 'Xóa Cấu Hình Truyền Tin' : 'Xóa Yếu Tố Truyền Tin'}
          message={`Bạn có chắc chắn muốn xóa "${itemToDelete.name}" không? Hành động này không thể hoàn tác.`}
          confirmText="Xác nhận xóa"
          cancelText="Hủy"
          variant="danger"
          onConfirm={() => {
            if (itemToDelete.type === 'transmission') {
              deleteTransMutation.mutate(itemToDelete.id);
            } else if (itemToDelete.factorId) {
              deleteFactorMutation.mutate({
                transId: itemToDelete.id,
                factorId: itemToDelete.factorId,
              });
            }
          }}
          onCancel={() => setItemToDelete(null)}
        />
      )}
    </div>
  );
}
export default DataTransmissionPage;
