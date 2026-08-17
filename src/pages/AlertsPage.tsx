import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ShieldAlert,
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle2,
  CheckCheck,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Clock,
  Zap,
  Layers,
  Eye,
  X,
  SlidersHorizontal,
  Timer,
  Check,
  Radio,
} from 'lucide-react';
import {
  alertsApi,
  type AlertRule,
  type AlertEvent,
  type AlertSeverity,
  type AlertSourceType,
  type AlertCondition,
  type CreateAlertRulePayload,
} from '../api/alerts';
import { api } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/Button';
import { ConfirmModal } from '../components/ConfirmModal';

// ── Severity Configuration ──────────────────────────────────────────────────
const SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    label: string;
    icon: typeof Info;
    badgeBg: string;
    badgeText: string;
    borderColor: string;
    bgLight: string;
    accentColor: string;
    glow: string;
  }
> = {
  critical: {
    label: 'Nguy hiểm',
    icon: AlertOctagon,
    badgeBg: 'bg-rose-500/10 dark:bg-rose-500/20',
    badgeText: 'text-rose-600 dark:text-rose-400',
    borderColor: 'border-rose-300 dark:border-rose-800/60',
    bgLight: 'bg-rose-50/50 dark:bg-rose-950/20',
    accentColor: 'rose',
    glow: 'shadow-[0_0_12px_rgba(244,63,94,0.35)]',
  },
  warning: {
    label: 'Cảnh báo',
    icon: AlertTriangle,
    badgeBg: 'bg-amber-500/10 dark:bg-amber-500/20',
    badgeText: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-300 dark:border-amber-800/60',
    bgLight: 'bg-amber-50/50 dark:bg-amber-950/20',
    accentColor: 'amber',
    glow: 'shadow-[0_0_12px_rgba(245,158,11,0.25)]',
  },
  info: {
    label: 'Thông tin',
    icon: Info,
    badgeBg: 'bg-blue-500/10 dark:bg-blue-500/20',
    badgeText: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-300 dark:border-blue-800/60',
    bgLight: 'bg-blue-50/50 dark:bg-blue-950/20',
    accentColor: 'blue',
    glow: 'shadow-[0_0_12px_rgba(59,130,246,0.25)]',
  },
};

const CONDITION_SYMBOLS: Record<AlertCondition, string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  eq: '=',
};

export function AlertsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab: 'events' | 'rules'
  const activeTab = searchParams.get('tab') === 'rules' ? 'rules' : 'events';
  const setActiveTab = (tab: 'events' | 'rules') => {
    setSearchParams({ tab });
  };

  // ── Events Filter State ──
  const [eventSearch, setEventSearch] = useState('');
  const [eventSeverityFilter, setEventSeverityFilter] = useState<string>('all');
  const [eventAckFilter, setEventAckFilter] = useState<'all' | 'unack' | 'ack'>('all');
  const [eventRuleFilter, setEventRuleFilter] = useState<string>('all');

  // ── Rules Filter State ──
  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleSeverityFilter, setRuleSeverityFilter] = useState<string>('all');
  const [ruleSourceFilter, setRuleSourceFilter] = useState<string>('all');
  const [ruleStatusFilter, setRuleStatusFilter] = useState<string>('all');

  // ── Modal & Drawer States ──
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<AlertRule | null>(null);
  const [selectedEventDetail, setSelectedEventDetail] = useState<AlertEvent | null>(null);
  const [isAckAllConfirmOpen, setIsAckAllConfirmOpen] = useState(false);

  // ── Queries: Alert Rules & Alert Events ──
  const {
    data: rules = [],
    isLoading: isRulesLoading,
    refetch: refetchRules,
  } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: alertsApi.getAlertRules,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const {
    data: eventsResponse,
    isLoading: isEventsLoading,
    isFetching: isEventsFetching,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: ['alert-events', eventAckFilter, eventSeverityFilter, eventRuleFilter],
    queryFn: () => {
      const ackParam =
        eventAckFilter === 'unack' ? false : eventAckFilter === 'ack' ? true : undefined;
      const sevParam =
        eventSeverityFilter !== 'all' ? (eventSeverityFilter as AlertSeverity) : undefined;
      const ruleParam = eventRuleFilter !== 'all' ? Number(eventRuleFilter) : undefined;

      return alertsApi.getAlertEvents({
        acknowledged: ackParam,
        severity: sevParam,
        rule_id: ruleParam,
        limit: 100,
      });
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const events = useMemo(() => eventsResponse?.items || [], [eventsResponse]);
  const unacknowledgedCount = eventsResponse?.unacknowledged ?? 0;

  // ── Auxiliary Queries for Form Selectors (Calculated Values & Stations) ──
  const { data: cvData } = useQuery({
    queryKey: ['calculated-values-options'],
    queryFn: async () => {
      const res = await api.request<any>('/calculated-values');
      return res?.data ?? res;
    },
    staleTime: 60_000,
  });

  const calculatedValuesList = useMemo(() => {
    if (!cvData?.groups) return [];
    const allItems: any[] = [];
    Object.values(cvData.groups).forEach((groupItems: any) => {
      if (Array.isArray(groupItems)) {
        allItems.push(...groupItems);
      }
    });
    return allItems;
  }, [cvData]);

  const stationsList = useMemo(() => {
    return cvData?.stations || [];
  }, [cvData]);

  // ── Stats Calculations ──
  const stats = useMemo(() => {
    const totalRules = rules.length;
    const activeRules = rules.filter((r) => r.is_active).length;
    const cooldownRules = rules.filter((r) => r.is_in_cooldown).length;
    const criticalEvents = events.filter((e) => e.severity === 'critical' && !e.is_acknowledged).length;

    return {
      totalRules,
      activeRules,
      cooldownRules,
      unacknowledgedCount,
      criticalEvents,
    };
  }, [rules, events, unacknowledgedCount]);

  // ── Filtered Events List ──
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (eventSearch) {
        const query = eventSearch.toLowerCase();
        const matchName = e.rule_name?.toLowerCase().includes(query);
        const matchMsg = e.message?.toLowerCase().includes(query);
        if (!matchName && !matchMsg) return false;
      }
      return true;
    });
  }, [events, eventSearch]);

  // ── Filtered Rules List ──
  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (ruleSearch) {
        const query = ruleSearch.toLowerCase();
        const matchName = r.name.toLowerCase().includes(query);
        const matchDesc = r.description?.toLowerCase().includes(query);
        const matchCode = r.calculated_value_code?.toLowerCase().includes(query) || r.channel_code?.toLowerCase().includes(query);
        if (!matchName && !matchDesc && !matchCode) return false;
      }
      if (ruleSeverityFilter !== 'all' && r.severity !== ruleSeverityFilter) return false;
      if (ruleSourceFilter !== 'all' && r.source_type !== ruleSourceFilter) return false;
      if (ruleStatusFilter === 'active' && !r.is_active) return false;
      if (ruleStatusFilter === 'inactive' && r.is_active) return false;
      if (ruleStatusFilter === 'cooldown' && !r.is_in_cooldown) return false;
      return true;
    });
  }, [rules, ruleSearch, ruleSeverityFilter, ruleSourceFilter, ruleStatusFilter]);

  // ── Mutations ──
  const toggleRuleMutation = useMutation({
    mutationFn: (id: number) => alertsApi.toggleAlertRule(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      showToast(res.message || 'Cập nhật trạng thái quy tắc thành công', 'success');
    },
    onError: (err: any) => {
      showToast(err.message || 'Không thể thay đổi trạng thái quy tắc', 'error');
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: number) => alertsApi.deleteAlertRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      showToast('Đã xóa quy tắc cảnh báo thành công', 'success');
      setDeletingRule(null);
    },
    onError: (err: any) => {
      showToast(err.message || 'Không thể xóa quy tắc cảnh báo', 'error');
    },
  });

  const ackEventMutation = useMutation({
    mutationFn: (id: number) => alertsApi.acknowledgeEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-events'] });
      showToast('Đã xác nhận sự kiện cảnh báo', 'success');
      if (selectedEventDetail) {
        setSelectedEventDetail((prev) =>
          prev ? { ...prev, is_acknowledged: true, acknowledged_at: new Date().toISOString() } : null
        );
      }
    },
    onError: (err: any) => {
      showToast(err.message || 'Không thể xác nhận sự kiện', 'error');
    },
  });

  const ackAllMutation = useMutation({
    mutationFn: () => alertsApi.acknowledgeAllEvents(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['alert-events'] });
      showToast(`Đã xác nhận toàn bộ ${res.acknowledged_count} sự kiện cảnh báo`, 'success');
      setIsAckAllConfirmOpen(false);
    },
    onError: (err: any) => {
      showToast(err.message || 'Không thể xác nhận tất cả sự kiện', 'error');
    },
  });

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* ── 1. HEADER & ACTIONS ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              Thiết lập cảnh báo
            </h1>
            {unacknowledgedCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white animate-pulse shadow-sm">
                {unacknowledgedCount} mới
              </span>
            )}
          </div>
        </div>

        {/* Tab Selector & Main Button */}
        <div className="flex items-center gap-2.5 self-stretch md:self-auto">
          <div className="p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-xl flex items-center gap-1 border border-slate-200/60 dark:border-zinc-700/50 flex-1 md:flex-initial">
            <button
              onClick={() => setActiveTab('events')}
              className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'events'
                  ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Sự Kiện Cảnh Báo</span>
              {unacknowledgedCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                  {unacknowledgedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'rules'
                  ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
              <span>Cấu Hình Quy Tắc ({rules.length})</span>
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditingRule(null);
              setIsRuleModalOpen(true);
            }}
            className="flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Quy Tắc</span>
          </Button>
        </div>
      </div>

      {/* ── 2. KPI STATS TILES (Industrial Nexus Style) ─────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Stat 1: Unacknowledged */}
        <div
          onClick={() => {
            setActiveTab('events');
            setEventAckFilter('unack');
          }}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            stats.unacknowledgedCount > 0
              ? 'bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-950/20 dark:to-rose-900/10 border-rose-300 dark:border-rose-800/80 shadow-xs'
              : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600 dark:text-zinc-400">Chưa Xác Nhận</span>
            <div
              className={`p-2 rounded-xl ${
                stats.unacknowledgedCount > 0
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-slate-100 dark:bg-zinc-800 text-gray-400'
              }`}
            >
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-2xl sm:text-3xl font-black font-mono ${
                stats.unacknowledgedCount > 0
                  ? 'text-rose-600 dark:text-rose-400 animate-pulse'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              {stats.unacknowledgedCount}
            </span>
            <span className="text-xs text-gray-500 dark:text-zinc-400">sự kiện chờ xử lý</span>
          </div>
        </div>

        {/* Stat 2: Critical Alarms */}
        <div
          onClick={() => {
            setActiveTab('events');
            setEventSeverityFilter('critical');
            setEventAckFilter('unack');
          }}
          className="cursor-pointer p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-rose-400 transition-all shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600 dark:text-zinc-400">Nguy Hiểm (Critical)</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black font-mono text-rose-600 dark:text-rose-400">
              {stats.criticalEvents}
            </span>
            <span className="text-xs text-gray-500 dark:text-zinc-400">báo động khẩn</span>
          </div>
        </div>

        {/* Stat 3: Active Rules */}
        <div
          onClick={() => {
            setActiveTab('rules');
            setRuleStatusFilter('active');
          }}
          className="cursor-pointer p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-emerald-400 transition-all shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600 dark:text-zinc-400">Quy Tắc Giám Sát</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
              {stats.activeRules}
            </span>
            <span className="text-xs text-gray-500 dark:text-zinc-400">/ {stats.totalRules} đang bật</span>
          </div>
        </div>

        {/* Stat 4: Cooldown Rules */}
        <div
          onClick={() => {
            setActiveTab('rules');
            setRuleStatusFilter('cooldown');
          }}
          className="cursor-pointer p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-amber-400 transition-all shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600 dark:text-zinc-400">Đang Cooldown</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Timer className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-400">
              {stats.cooldownRules}
            </span>
            <span className="text-xs text-gray-500 dark:text-zinc-400">chống spam</span>
          </div>
        </div>
      </div>

      {/* ── 3. MAIN CONTENT: TAB 1 (EVENTS) OR TAB 2 (RULES) ────────────────── */}
      {activeTab === 'events' ? (
        /* ── TAB 1: ALERT EVENTS LOG ── */
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              {/* Search */}
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm theo tên rule, nội dung..."
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                />
                {eventSearch && (
                  <button
                    onClick={() => setEventSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <select
                value={eventAckFilter}
                onChange={(e) => setEventAckFilter(e.target.value as any)}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:outline-none"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="unack">🔴 Chưa xác nhận ({stats.unacknowledgedCount})</option>
                <option value="ack">🟢 Đã xác nhận</option>
              </select>

              {/* Severity Filter */}
              <select
                value={eventSeverityFilter}
                onChange={(e) => setEventSeverityFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:outline-none"
              >
                <option value="all">Mọi mức độ</option>
                <option value="critical">🔴 Nguy hiểm</option>
                <option value="warning">🟡 Cảnh báo</option>
                <option value="info">🔵 Thông tin</option>
              </select>

              {/* Rule Filter */}
              <select
                value={eventRuleFilter}
                onChange={(e) => setEventRuleFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:outline-none max-w-[180px] truncate"
              >
                <option value="all">Tất cả quy tắc ({rules.length})</option>
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Actions: Refresh & Acknowledge All */}
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refetchEvents()}
                disabled={isEventsFetching}
                className="flex items-center gap-1.5"
                title="Làm mới danh sách"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isEventsFetching ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Làm mới</span>
              </Button>

              {stats.unacknowledgedCount > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsAckAllConfirmOpen(true)}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>Xác nhận tất cả ({stats.unacknowledgedCount})</span>
                </Button>
              )}
            </div>
          </div>

          {/* Events List */}
          {isEventsLoading ? (
            <div className="p-12 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800">
              <RefreshCw className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">Đang tải nhật ký cảnh báo...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="p-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Không có sự kiện cảnh báo nào</h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
                Hệ thống thủy điện đang vận hành ổn định trong giới hạn an toàn quy định.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredEvents.map((event) => {
                const sevCfg = SEVERITY_CONFIG[event.severity] || SEVERITY_CONFIG.warning;
                const SevIcon = sevCfg.icon;
                const isUnack = !event.is_acknowledged;

                return (
                  <div
                    key={event.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isUnack
                        ? `bg-white dark:bg-zinc-900 ${sevCfg.borderColor} ${sevCfg.glow} shadow-xs`
                        : 'bg-white/80 dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                    }`}
                  >
                    {/* Left: Icon & Content */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <div
                        className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${sevCfg.badgeBg} ${sevCfg.badgeText} ${
                          isUnack && event.severity === 'critical' ? 'animate-pulse' : ''
                        }`}
                      >
                        <SevIcon className="w-5 h-5" />
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${sevCfg.badgeBg} ${sevCfg.badgeText}`}>
                            {sevCfg.label}
                          </span>

                          <span className="font-bold text-sm text-gray-900 dark:text-white truncate">
                            {event.rule_name}
                          </span>

                          {isUnack ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                              Chưa xác nhận
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 flex items-center gap-1">
                              <Check className="w-3 h-3 text-emerald-500" />
                              Đã xác nhận
                            </span>
                          )}
                        </div>

                        {/* Message content */}
                        <p className="text-xs sm:text-sm font-medium text-gray-800 dark:text-zinc-200 break-words">
                          {event.message}
                        </p>

                        {/* Metadata Footer */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400 dark:text-zinc-500 pt-0.5">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(event.triggered_at).toLocaleString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </span>

                          <span className="font-mono">
                            Giá trị vi phạm: <strong className="text-gray-700 dark:text-zinc-300 font-black">{event.value_at_trigger}</strong>
                          </span>

                          {event.acknowledged_by && (
                            <span>
                              Xác nhận bởi: <strong className="text-gray-600 dark:text-zinc-400">{event.acknowledged_by}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                      {isUnack && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => ackEventMutation.mutate(event.id)}
                          disabled={ackEventMutation.isPending}
                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Xác nhận</span>
                        </Button>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedEventDetail(event)}
                        className="flex items-center gap-1 text-xs"
                        title="Xem chi tiết sự kiện"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Chi tiết</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── TAB 2: ALERT RULES MANAGEMENT ── */
        <div className="space-y-4">
          {/* Rules Filter Bar */}
          <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative min-w-[220px] flex-1 sm:flex-initial">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm quy tắc theo tên, mã nguồn..."
                  value={ruleSearch}
                  onChange={(e) => setRuleSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                />
                {ruleSearch && (
                  <button
                    onClick={() => setRuleSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status */}
              <select
                value={ruleStatusFilter}
                onChange={(e) => setRuleStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:outline-none"
              >
                <option value="all">Mọi trạng thái</option>
                <option value="active">🟢 Đang kích hoạt</option>
                <option value="inactive">⚪ Đang tạm dừng</option>
                <option value="cooldown">⏳ Đang Cooldown</option>
              </select>

              {/* Source Type */}
              <select
                value={ruleSourceFilter}
                onChange={(e) => setRuleSourceFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:outline-none"
              >
                <option value="all">Mọi loại nguồn</option>
                <option value="calculated">📊 Giá trị tính toán (Calculated)</option>
                <option value="sensor">📡 Cảm biến trạm (Sensor)</option>
              </select>

              {/* Severity */}
              <select
                value={ruleSeverityFilter}
                onChange={(e) => setRuleSeverityFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:outline-none"
              >
                <option value="all">Mọi mức độ</option>
                <option value="critical">🔴 Nguy hiểm</option>
                <option value="warning">🟡 Cảnh báo</option>
                <option value="info">🔵 Thông tin</option>
              </select>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetchRules()}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Làm mới</span>
            </Button>
          </div>

          {/* Rules Grid */}
          {isRulesLoading ? (
            <div className="p-12 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800">
              <RefreshCw className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">Đang tải danh sách quy tắc...</p>
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="p-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800">
              <ShieldAlert className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-60" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Chưa có quy tắc cảnh báo nào</h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto mb-4">
                Tạo quy tắc mới để hệ thống tự động theo dõi mực nước, xả tràn, lưu lượng phát và cảm biến IoT.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingRule(null);
                  setIsRuleModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo quy tắc đầu tiên</span>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRules.map((rule) => {
                const sevCfg = SEVERITY_CONFIG[rule.severity] || SEVERITY_CONFIG.warning;
                const SevIcon = sevCfg.icon;

                return (
                  <div
                    key={rule.id}
                    className={`p-5 rounded-2xl border bg-white dark:bg-zinc-900 flex flex-col justify-between space-y-4 transition-all shadow-xs ${
                      rule.is_active
                        ? 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                        : 'border-slate-200/60 dark:border-zinc-800/40 opacity-70 bg-slate-50/50 dark:bg-zinc-900/50'
                    }`}
                  >
                    {/* Header */}
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-xl ${sevCfg.badgeBg} ${sevCfg.badgeText}`}>
                            <SevIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-gray-900 dark:text-white leading-tight">
                              {rule.name}
                            </h3>
                            <span className={`inline-block text-[10px] font-bold mt-0.5 ${sevCfg.badgeText}`}>
                              {sevCfg.label}
                            </span>
                          </div>
                        </div>

                        {/* Active Toggle */}
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.is_active}
                            onChange={() => toggleRuleMutation.mutate(rule.id)}
                            className="sr-only peer"
                            disabled={toggleRuleMutation.isPending}
                          />
                          <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>

                      {rule.description && (
                        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-2 line-clamp-2">
                          {rule.description}
                        </p>
                      )}
                    </div>

                    {/* Condition Box */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-zinc-400 font-medium">Nguồn giám sát:</span>
                        <span className="font-bold text-gray-800 dark:text-zinc-200 flex items-center gap-1 font-mono">
                          {rule.source_type === 'calculated' ? (
                            <>
                              <Layers className="w-3 h-3 text-blue-500" />
                              <span>{rule.calculated_value_code || rule.calculated_value_name || 'Giá trị tính'}</span>
                            </>
                          ) : (
                            <>
                              <Radio className="w-3 h-3 text-emerald-500" />
                              <span>{rule.station_name || 'Trạm'} · {rule.channel_code || 'Sensor'}</span>
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-zinc-400 font-medium">Điều kiện ngưỡng:</span>
                        <span className="font-mono font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-200/60 dark:border-rose-800/40">
                          {CONDITION_SYMBOLS[rule.condition]} {rule.threshold} {rule.calculated_value_unit || ''}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-zinc-400 font-medium">Cooldown chống spam:</span>
                        <span className="font-mono text-gray-700 dark:text-zinc-300">
                          {rule.cooldown_minutes} phút
                        </span>
                      </div>
                    </div>

                    {/* Footer: Cooldown status & Action Buttons */}
                    <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                      <div>
                        {rule.is_in_cooldown ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/40 animate-pulse">
                            <Timer className="w-3 h-3" />
                            Đang Cooldown
                          </span>
                        ) : rule.last_triggered_at ? (
                          <span className="text-[11px] text-gray-400 font-mono">
                            Kích hoạt: {new Date(rule.last_triggered_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400">Chưa kích hoạt</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingRule(rule);
                            setIsRuleModalOpen(true);
                          }}
                          className="p-1.5 text-gray-500 hover:text-blue-600"
                          title="Chỉnh sửa quy tắc"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingRule(rule)}
                          className="p-1.5 text-gray-500 hover:text-rose-600"
                          title="Xóa quy tắc"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: CREATE / EDIT ALERT RULE ───────────────────────────────── */}
      {isRuleModalOpen && (
        <AlertRuleFormModal
          isOpen={isRuleModalOpen}
          initialRule={editingRule}
          calculatedValues={calculatedValuesList}
          stations={stationsList}
          onClose={() => {
            setIsRuleModalOpen(false);
            setEditingRule(null);
          }}
          onSuccess={() => {
            setIsRuleModalOpen(false);
            setEditingRule(null);
            queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
          }}
        />
      )}

      {/* ── MODAL: CONFIRM DELETE RULE ────────────────────────────────────── */}
      {deletingRule && (
        <ConfirmModal
          title="Xác nhận xóa quy tắc cảnh báo"
          message={`Bạn có chắc chắn muốn xóa quy tắc cảnh báo "${deletingRule.name}"? Các sự kiện cảnh báo lịch sử liên quan cũng sẽ bị ảnh hưởng.`}
          confirmText="Xóa quy tắc"
          cancelText="Hủy"
          variant="danger"
          isLoading={deleteRuleMutation.isPending}
          onConfirm={() => {
            deleteRuleMutation.mutate(deletingRule.id);
          }}
          onCancel={() => setDeletingRule(null)}
        />
      )}

      {/* ── MODAL: CONFIRM ACKNOWLEDGE ALL EVENTS ─────────────────────────── */}
      {isAckAllConfirmOpen && (
        <ConfirmModal
          title="Xác nhận xử lý tất cả cảnh báo"
          message={`Bạn có muốn đánh dấu xác nhận toàn bộ ${stats.unacknowledgedCount} sự kiện cảnh báo đang mở?`}
          confirmText="Xác nhận tất cả"
          cancelText="Đóng"
          variant="default"
          isLoading={ackAllMutation.isPending}
          onConfirm={() => ackAllMutation.mutate()}
          onCancel={() => setIsAckAllConfirmOpen(false)}
        />
      )}

      {/* ── DRAWER: EVENT DETAILS ─────────────────────────────────────────── */}
      {selectedEventDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md h-full bg-white dark:bg-zinc-900 border-l border-slate-200 dark:border-zinc-800 p-6 flex flex-col justify-between shadow-2xl overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-500" />
                  <h3 className="font-bold text-base text-gray-900 dark:text-white">
                    Chi Tiết Sự Kiện Cảnh Báo
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEventDetail(null)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Event Badge */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">Mức độ</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      SEVERITY_CONFIG[selectedEventDetail.severity]?.badgeBg
                    } ${SEVERITY_CONFIG[selectedEventDetail.severity]?.badgeText}`}
                  >
                    {SEVERITY_CONFIG[selectedEventDetail.severity]?.label}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">Tên quy tắc</span>
                  <span className="text-xs font-bold text-gray-900 dark:text-white font-mono">
                    {selectedEventDetail.rule_name}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">Thời điểm kích hoạt</span>
                  <span className="text-xs font-mono text-gray-700 dark:text-zinc-300">
                    {new Date(selectedEventDetail.triggered_at).toLocaleString('vi-VN')}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">Giá trị lúc kích hoạt</span>
                  <span className="text-sm font-mono font-black text-rose-600 dark:text-rose-400">
                    {selectedEventDetail.value_at_trigger}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium">Trạng thái</span>
                  <span
                    className={`text-xs font-bold ${
                      selectedEventDetail.is_acknowledged ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {selectedEventDetail.is_acknowledged ? 'Đã xác nhận' : 'Chưa xác nhận'}
                  </span>
                </div>
              </div>

              {/* Message Box */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5">
                  Nội dung thông báo
                </label>
                <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-xs sm:text-sm font-medium text-rose-900 dark:text-rose-200">
                  {selectedEventDetail.message}
                </div>
              </div>

              {/* Acknowledgment metadata if any */}
              {selectedEventDetail.is_acknowledged && (
                <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Đã xác nhận xử lý
                  </p>
                  {selectedEventDetail.acknowledged_by && (
                    <p>Người xác nhận: <strong>{selectedEventDetail.acknowledged_by}</strong></p>
                  )}
                  {selectedEventDetail.acknowledged_at && (
                    <p>Thời gian: {new Date(selectedEventDetail.acknowledged_at).toLocaleString('vi-VN')}</p>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 flex items-center gap-2">
              {!selectedEventDetail.is_acknowledged && (
                <Button
                  variant="primary"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => ackEventMutation.mutate(selectedEventDetail.id)}
                  disabled={ackEventMutation.isPending}
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  Xác nhận sự kiện này
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => setSelectedEventDetail(null)}
                className={selectedEventDetail.is_acknowledged ? 'w-full' : ''}
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MODAL: CREATE / EDIT ALERT RULE FORM ─────────────────────────────────────
interface AlertRuleFormModalProps {
  isOpen: boolean;
  initialRule: AlertRule | null;
  calculatedValues: any[];
  stations: any[];
  onClose: () => void;
  onSuccess: () => void;
}

function normalizeSensorType(type?: string): string {
  if (!type) return 'modbus_tcp';
  if (type === 'tcp') return 'modbus_tcp';
  if (type === 'rs485_1') return 'rs485_bus1';
  if (type === 'rs485_2') return 'rs485_bus2';
  return type;
}

function AlertRuleFormModal({
  isOpen,
  initialRule,
  calculatedValues,
  stations,
  onClose,
  onSuccess,
}: AlertRuleFormModalProps) {
  const { showToast } = useToast();

  const isEditing = Boolean(initialRule);

  // Form State
  const [name, setName] = useState(initialRule?.name || '');
  const [description, setDescription] = useState(initialRule?.description || '');

  if (!isOpen) return null;
  const [severity, setSeverity] = useState<AlertSeverity>(initialRule?.severity || 'warning');
  const [sourceType, setSourceType] = useState<AlertSourceType>(initialRule?.source_type || 'calculated');

  // Calculated source
  const [calculatedValueId, setCalculatedValueId] = useState<number | null>(
    initialRule?.calculated_value_id || (calculatedValues[0]?.id ?? null)
  );

  // Sensor source
  const [stationId, setStationId] = useState<number | null>(
    initialRule?.station_id || (stations[0]?.id ?? null)
  );

  const selectedStation = useMemo(() => {
    return stations.find((st) => st.id === stationId) || stations[0] || null;
  }, [stations, stationId]);

  const stationSensors = useMemo(() => {
    return selectedStation?.sensors || [];
  }, [selectedStation]);

  const [channelType, setChannelType] = useState(
    initialRule?.channel_type || normalizeSensorType(stationSensors[0]?.sensor_type)
  );
  const [channelCode, setChannelCode] = useState(
    initialRule?.channel_code || stationSensors[0]?.sensor_code || ''
  );

  // Synchronize sensor when station or list changes
  useEffect(() => {
    if (sourceType === 'sensor' && stationSensors.length > 0) {
      const exists = stationSensors.some((s: any) => s.sensor_code === channelCode);
      if (!exists) {
        const first = stationSensors[0];
        setChannelCode(first.sensor_code);
        setChannelType(normalizeSensorType(first.sensor_type));
      }
    }
  }, [stationId, stationSensors, sourceType, channelCode]);

  // Condition & Threshold
  const [condition, setCondition] = useState<AlertCondition>(initialRule?.condition || 'gt');
  const [threshold, setThreshold] = useState<string>(
    initialRule?.threshold != null ? String(initialRule.threshold) : ''
  );

  // Message & Cooldown
  const [message, setMessage] = useState(
    initialRule?.message || 'Cảnh báo: {value} đã vượt ngưỡng {threshold}!'
  );
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(
    initialRule?.cooldown_minutes || 15
  );
  const [isActive, setIsActive] = useState(initialRule?.is_active ?? true);

  // Selected CV & Sensor unit helper
  const selectedCv = useMemo(() => {
    return calculatedValues.find((cv) => cv.id === calculatedValueId);
  }, [calculatedValues, calculatedValueId]);

  const selectedSensor = useMemo(() => {
    return stationSensors.find((s: any) => s.sensor_code === channelCode);
  }, [stationSensors, channelCode]);

  const activeUnit = sourceType === 'calculated' ? selectedCv?.unit : selectedSensor?.unit;

  // Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Vui lòng nhập tên quy tắc cảnh báo.');
      if (threshold === '' || isNaN(Number(threshold)))
        throw new Error('Vui lòng nhập giá trị ngưỡng hợp lệ.');
      if (!message.trim()) throw new Error('Vui lòng nhập nội dung cảnh báo.');

      const payload: CreateAlertRulePayload = {
        name: name.trim(),
        description: description.trim(),
        severity,
        source_type: sourceType,
        condition,
        threshold: Number(threshold),
        message: message.trim(),
        cooldown_minutes: Number(cooldownMinutes) || 15,
        is_active: isActive,
      };

      if (sourceType === 'calculated') {
        if (!calculatedValueId) throw new Error('Vui lòng chọn giá trị tính toán.');
        payload.calculated_value_id = calculatedValueId;
      } else {
        if (!stationId) throw new Error('Vui lòng chọn trạm quan trắc.');
        if (!channelCode) throw new Error('Vui lòng chọn cảm biến quan trắc.');
        payload.station_id = stationId;
        payload.channel_type = channelType;
        payload.channel_code = channelCode.trim();
      }

      if (isEditing && initialRule) {
        return alertsApi.updateAlertRule(initialRule.id, payload);
      } else {
        return alertsApi.createAlertRule(payload);
      }
    },
    onSuccess: () => {
      showToast(
        isEditing ? 'Cập nhật quy tắc thành công' : 'Đã tạo quy tắc cảnh báo mới thành công',
        'success'
      );
      onSuccess();
    },
    onError: (err: any) => {
      showToast(err.message || 'Lỗi khi lưu quy tắc', 'error');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="p-5 bg-slate-50 dark:bg-zinc-800/60 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-600 text-white shadow-md">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                {isEditing ? 'Chỉnh Sửa Quy Tắc Cảnh Báo' : 'Thêm Quy Tắc Cảnh Báo Mới'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-zinc-700/50 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="p-6 space-y-5 max-h-[75vh] overflow-y-auto"
        >
          {/* 1. Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5">
                Tên quy tắc cảnh báo <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Cảnh báo mực nước hồ vượt ngưỡng an toàn"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-rose-500/30 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5">
                Mô tả chi tiết
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="VD: Theo dõi mực nước dâng cao trong mùa mưa bão"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-rose-500/30 focus:outline-none"
              />
            </div>
          </div>

          {/* 2. Severity Selection */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-2">
              Mức độ nghiêm trọng
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {(['info', 'warning', 'critical'] as AlertSeverity[]).map((sev) => {
                const cfg = SEVERITY_CONFIG[sev];
                const Icon = cfg.icon;
                const isSelected = severity === sev;

                return (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverity(sev)}
                    className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                      isSelected
                        ? `${cfg.badgeBg} ${cfg.borderColor} ring-2 ring-offset-1 ring-${cfg.accentColor}-500/50`
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 hover:border-slate-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${cfg.badgeText}`} />
                    <span className={`text-xs font-bold ${cfg.badgeText}`}>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Source Selection */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700/60 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-2">
                Loại nguồn dữ liệu giám sát
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSourceType('calculated')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    sourceType === 'calculated'
                      ? 'bg-blue-500 text-white border-blue-600 shadow-sm'
                      : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Giá trị tính toán (Calculated)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType('sensor')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    sourceType === 'sensor'
                      ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                      : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700'
                  }`}
                >
                  <Radio className="w-4 h-4" />
                  <span>Cảm biến trạm (Sensor)</span>
                </button>
              </div>
            </div>

            {sourceType === 'calculated' ? (
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5">
                  Chọn thông số tính toán
                </label>
                <select
                  value={calculatedValueId ?? ''}
                  onChange={(e) => setCalculatedValueId(Number(e.target.value) || null)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white font-mono"
                >
                  {calculatedValues.map((cv) => (
                    <option key={cv.id} value={cv.id}>
                      {cv.code} — {cv.name} ({cv.unit || 'không đơn vị'})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5">
                    Trạm quan trắc
                  </label>
                  <select
                    value={stationId ?? ''}
                    onChange={(e) => {
                      const newId = Number(e.target.value) || null;
                      setStationId(newId);
                      const st = stations.find((s) => s.id === newId);
                      if (st?.sensors?.length) {
                        setChannelCode(st.sensors[0].sensor_code);
                        setChannelType(normalizeSensorType(st.sensors[0].sensor_type));
                      }
                    }}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white"
                  >
                    {stations.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.device_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5">
                    Tên Cảm biến giám sát (Sensor)
                  </label>
                  {stationSensors.length === 0 ? (
                    <div className="px-3.5 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl">
                      Trạm này chưa có cảm biến nào
                    </div>
                  ) : (
                    <select
                      value={channelCode}
                      onChange={(e) => {
                        const s = stationSensors.find((item: any) => item.sensor_code === e.target.value);
                        if (s) {
                          setChannelCode(s.sensor_code);
                          setChannelType(normalizeSensorType(s.sensor_type));
                        }
                      }}
                      className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white font-mono"
                    >
                      {stationSensors.map((sen: any) => {
                        const typeLabel =
                          sen.sensor_type === 'tcp' || sen.sensor_type === 'modbus_tcp'
                            ? 'Modbus TCP'
                            : sen.sensor_type === 'rs485_1' || sen.sensor_type === 'rs485_bus1'
                            ? 'RS485-1'
                            : sen.sensor_type === 'rs485_2' || sen.sensor_type === 'rs485_bus2'
                            ? 'RS485-2'
                            : sen.sensor_type === 'analog'
                            ? 'Analog'
                            : sen.sensor_type === 'di'
                            ? 'DI (Đo mưa)'
                            : sen.sensor_type === 'encoder'
                            ? 'Encoder'
                            : sen.sensor_type;

                        const displayName =
                          sen.name && sen.name !== sen.sensor_code
                            ? `${sen.name} (${sen.sensor_code})`
                            : sen.sensor_code;

                        return (
                          <option key={`${sen.sensor_type}_${sen.sensor_code}`} value={sen.sensor_code}>
                            {displayName} · {typeLabel} {sen.unit ? `[${sen.unit}]` : ''}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 4. Condition & Threshold */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5">
                Điều kiện so sánh <span className="text-rose-500">*</span>
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as AlertCondition)}
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white font-semibold"
              >
                <option value="gt">&gt; Lớn hơn</option>
                <option value="gte">&ge; Lớn hơn hoặc bằng</option>
                <option value="lt">&lt; Nhỏ hơn</option>
                <option value="lte">&le; Nhỏ hơn hoặc bằng</option>
                <option value="eq">= Bằng</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5">
                Giá trị ngưỡng (Threshold) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  required
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="VD: 950.5"
                  className="w-full px-3.5 py-2 pr-14 text-xs font-mono font-bold rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-rose-500/30 focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-mono">
                  {activeUnit || ''}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Message Template & Cooldown */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5">
                Nội dung cảnh báo <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Dùng {value} để chèn số liệu thực tế và {threshold} để chèn ngưỡng"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-rose-500/30 focus:outline-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Gợi ý biến: <code className="text-rose-500 font-mono">{'{value}'}</code>: giá trị đo,{' '}
                <code className="text-rose-500 font-mono">{'{threshold}'}</code>: ngưỡng đã đặt.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5">
                  Thời gian Cooldown (phút)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={cooldownMinutes}
                    onChange={(e) => setCooldownMinutes(Number(e.target.value) || 15)}
                    className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-gray-900 dark:text-white"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    phút
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5.5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
                </label>
                <span className="text-xs font-bold text-gray-800 dark:text-zinc-200">
                  {isActive ? 'Kích hoạt ngay khi lưu' : 'Tạm dừng quy tắc này'}
                </span>
              </div>
            </div>
          </div>

          {/* Modal Buttons */}
          <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saveMutation.isPending}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Đang lưu...' : isEditing ? 'Cập nhật quy tắc' : 'Tạo quy tắc mới'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
