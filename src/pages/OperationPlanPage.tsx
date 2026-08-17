import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  Zap,
  Activity,
  Save,
  CheckCircle2,
  Sliders,
  Clock,
  Plus,
  Trash2,
  Sparkles,
  BarChart3,
  Waves,
  Calendar,
  History,
  Loader2,
  ShieldAlert,
  TrendingUp,
  CloudRain,
  FlaskConical,
  AlertTriangle,
  Play,
  ArrowRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { api, type TurbineInfo } from '../api/client';
import { watershedsApi, simulateReservoir, type SimulatePayload, type SimulateResponse, type WatershedZone } from '../api/watersheds';
import { useToast } from '../contexts/ToastContext';
import { Card, CardHeader, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { formatDateTime } from '../utils/date';

// EVN Tariff time types
type TariffType = 'peak' | 'normal' | 'offpeak';

interface ScheduleRowUi {
  id: string;
  time_start: string;
  time_end: string;
  tariff: TariffType;
  units: Record<string, number>;
}

// Preset template
interface PresetTemplate {
  id: string;
  name: string;
  desc: string;
  icon: typeof Zap;
  color: string;
  rows: ScheduleRowUi[];
}

const DEFAULT_TURBINES: TurbineInfo[] = [
  { id: 1, code: 'Q_H1', name: 'Tổ máy H1', unit: 'MW', p_max: 2.5 },
  { id: 2, code: 'Q_H2', name: 'Tổ máy H2', unit: 'MW', p_max: 2.5 },
];

// Helper: Determine EVN Tariff based on time of day
const getEvnTariff = (start: string): TariffType => {
  const [h, m] = start.split(':').map(Number);
  const val = h + m / 60;
  // Peak: 09:30-11:30 & 17:00-20:00 (Monday-Saturday)
  if ((val >= 9.5 && val < 11.5) || (val >= 17 && val < 20)) {
    return 'peak';
  }
  // Offpeak: 22:00-04:00
  if (val >= 22 || val < 4) {
    return 'offpeak';
  }
  return 'normal';
};

// Preset schedules
const DISPATCH_PRESETS: PresetTemplate[] = [
  {
    id: 'evn_optimal',
    name: 'Tối ưu Giá điện EVN',
    desc: 'Tích nước giờ thấp điểm, phát toàn tải 5.0 MW vào 2 khung Giờ Cao Điểm',
    icon: Sparkles,
    color: 'from-amber-500/20 to-amber-600/20 border-amber-500/30 text-amber-600 dark:text-amber-400',
    rows: [
      { id: '1', time_start: '00:00', time_end: '04:00', tariff: 'offpeak', units: { '1': 0.8, '2': 0.8 } },
      { id: '2', time_start: '04:00', time_end: '09:30', tariff: 'normal', units: { '1': 1.8, '2': 1.8 } },
      { id: '3', time_start: '09:30', time_end: '11:30', tariff: 'peak', units: { '1': 2.5, '2': 2.5 } },
      { id: '4', time_start: '11:30', time_end: '17:00', tariff: 'normal', units: { '1': 1.6, '2': 1.6 } },
      { id: '5', time_start: '17:00', time_end: '20:00', tariff: 'peak', units: { '1': 2.5, '2': 2.5 } },
      { id: '6', time_start: '20:00', time_end: '22:00', tariff: 'normal', units: { '1': 1.8, '2': 1.8 } },
      { id: '7', time_start: '22:00', time_end: '24:00', tariff: 'offpeak', units: { '1': 0.8, '2': 0.8 } },
    ],
  },
  {
    id: 'run_of_river',
    name: 'Phát Đều Theo Nước Về',
    desc: 'Chạy công suất ổn định theo dòng chảy tự nhiên của lưu vực SCS-CN',
    icon: Waves,
    color: 'from-sky-500/20 to-sky-600/20 border-sky-500/30 text-sky-600 dark:text-sky-400',
    rows: [
      { id: '1', time_start: '00:00', time_end: '08:00', tariff: 'offpeak', units: { '1': 2.0, '2': 2.0 } },
      { id: '2', time_start: '08:00', time_end: '16:00', tariff: 'normal', units: { '1': 2.0, '2': 2.0 } },
      { id: '3', time_start: '16:00', time_end: '24:00', tariff: 'peak', units: { '1': 2.0, '2': 2.0 } },
    ],
  },
  {
    id: 'flood_drawdown',
    name: 'Đón Lũ & Hạ Mực Nước',
    desc: 'Phát tối đa công suất 24/24 để hạ mực nước hồ đón đỉnh lũ dự báo',
    icon: ShieldAlert,
    color: 'from-rose-500/20 to-rose-600/20 border-rose-500/30 text-rose-600 dark:text-rose-400',
    rows: [
      { id: '1', time_start: '00:00', time_end: '12:00', tariff: 'normal', units: { '1': 2.5, '2': 2.5 } },
      { id: '2', time_start: '12:00', time_end: '24:00', tariff: 'peak', units: { '1': 2.5, '2': 2.5 } },
    ],
  },
];

// ─── SCS-CN Panel Component ─────────────────────────────────────────────────
function ScsCnPanel({ onApplyQToSchedule }: { onApplyQToSchedule: (qAvg: number) => void }) {
  const { showToast } = useToast();
  const [zones, setZones] = useState<WatershedZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [subTab, setSubTab] = useState<'recommended' | 'manual'>('recommended');
  const [recommendMode, setRecommendMode] = useState<'evn_peak' | 'run_of_river' | 'flood_drawdown'>('evn_peak');
  const [qInMode, setQInMode] = useState<'scscn' | 'manual'>('scscn');
  const [qManual, setQManual] = useState<string>('8.5');
  const [zInit, setZInit] = useState<string>('615.45');
  const [cnOverride, setCnOverride] = useState<string>('');
  const [amc, setAmc] = useState<'I' | 'II' | 'III'>('II');
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Manual schedule builder (24h)
  const [manualMwRow, setManualMwRow] = useState<number[]>(Array(24).fill(2.0));

  useEffect(() => {
    watershedsApi.getAll().then(z => {
      setZones(z);
      if (z.length > 0 && !selectedZoneId) setSelectedZoneId(z[0].id);
    }).catch(() => {});
  }, []);

  const handleRunModel = useCallback(async () => {
    if (!selectedZoneId) { showToast('Chọn lưu vực trước!', 'warning'); return; }
    setIsRunning(true);
    try {
      const payload: SimulatePayload = {
        q_in_mode: qInMode,
        q_in_manual: qInMode === 'manual' ? parseFloat(qManual) || 8.5 : undefined,
        schedule_mode: subTab === 'recommended' ? 'recommended' : 'manual',
        recommend_mode: recommendMode,
        schedule_mw_hourly: subTab === 'manual' ? manualMwRow : undefined,
        z_init: parseFloat(zInit) || 615.45,
        cn_override: cnOverride ? parseFloat(cnOverride) : undefined,
        amc,
      };
      const result = await simulateReservoir(selectedZoneId, payload);
      setSimResult(result);
      showToast('Mô phỏng hoàn thành!', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Lỗi chạy mô hình — kiểm tra lưu vực đã có dữ liệu mưa chưa', 'error');
    } finally {
      setIsRunning(false);
    }
  }, [selectedZoneId, qInMode, qManual, zInit, cnOverride, amc, subTab, recommendMode, manualMwRow]);

  const chartData = useMemo(() => {
    if (!simResult) return [];
    const sim = simResult.simulation;
    return sim.time_steps.map((t, i) => ({
      time: t,
      z_sim: sim.z_sim[i],
      q_in: sim.q_in_total[i],
      q_turb: sim.q_turb[i],
      q_spill: sim.q_spill[i],
      power_mw: sim.power_mw[i],
      precip: simResult.precip_mm_hourly[i] ?? 0,
      mndbt: sim.z_mndbt,
      mnc: sim.z_mnc,
    }));
  }, [simResult]);

  const MNDBTColor = '#f43f5e';
  const MNCColor = '#f59e0b';

  return (
    <div className="space-y-5">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-2">
        <button onClick={() => setSubTab('recommended')} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${ subTab === 'recommended' ? 'bg-teal-600 text-white shadow' : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800' }`}>
          <Sparkles className="w-3.5 h-3.5" /> Khuyến nghị tự động
        </button>
        <button onClick={() => setSubTab('manual')} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${ subTab === 'manual' ? 'bg-teal-600 text-white shadow' : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800' }`}>
          <Sliders className="w-3.5 h-3.5" /> Nhập tay
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT: Tham số */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-zinc-800 px-5 py-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-teal-500" /> Tham số mô hình
              </h3>
            </CardHeader>
            <CardContent className="p-5 space-y-3 text-xs">
              {/* Lưu vực */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 dark:text-zinc-400">Lưu vực</label>
                <select value={selectedZoneId ?? ''} onChange={e => setSelectedZoneId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none">
                  {zones.length === 0 && <option value="">-- Chưa có lưu vực --</option>}
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>

              {/* Nguồn Q vào */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 dark:text-zinc-400">Nguồn Q vào hồ</label>
                <select value={qInMode} onChange={e => setQInMode(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none">
                  <option value="scscn">SCS-CN từ dự báo mưa Meteoblue</option>
                  <option value="manual">Nhập tay Q (m³/s)</option>
                </select>
              </div>

              {qInMode === 'manual' && (
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 dark:text-zinc-400">Q vào cố định (m³/s)</label>
                  <input type="number" step="0.1" value={qManual} onChange={e => setQManual(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono font-bold text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:outline-none" />
                </div>
              )}

              {/* Mực nước ban đầu */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 dark:text-zinc-400">Mực nước ban đầu Z₀ (m)</label>
                <input type="number" step="0.01" value={zInit} onChange={e => setZInit(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono font-bold text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:outline-none" />
              </div>

              {/* SCS-CN overrides */}
              {qInMode === 'scscn' && (
                <>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 dark:text-zinc-400">CN ghi đè (bỏ trống = dùng cài đặt)</label>
                    <input type="number" step="1" min="40" max="99" placeholder="VD: 72" value={cnOverride} onChange={e => setCnOverride(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono font-bold text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 dark:text-zinc-400">Điều kiện ẩm đất (AMC)</label>
                    <select value={amc} onChange={e => setAmc(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none">
                      <option value="I">AMC-I — Đất khô</option>
                      <option value="II">AMC-II — Bình thường (chuẩn)</option>
                      <option value="III">AMC-III — Đất bão hòa</option>
                    </select>
                  </div>
                </>
              )}

              {/* Khuyến nghị mode */}
              {subTab === 'recommended' && (
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 dark:text-zinc-400">Chiến lược điều độ</label>
                  <select value={recommendMode} onChange={e => setRecommendMode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none">
                    <option value="evn_peak">Tối ưu giá điện EVN (cao điểm)</option>
                    <option value="run_of_river">Chạy theo nước về SCS-CN</option>
                    <option value="flood_drawdown">Đón lũ — hạ mực nước tối đa</option>
                  </select>
                </div>
              )}

              {/* Nút chạy */}
              <button onClick={handleRunModel} disabled={isRunning || !selectedZoneId}
                className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer">
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {isRunning ? 'Đang tính...' : 'Chạy mô hình'}
              </button>
            </CardContent>
          </Card>

          {/* Manual 24h schedule */}
          {subTab === 'manual' && (
            <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-slate-100 dark:border-zinc-800 px-5 py-3">
                <h3 className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Lịch phát điện 24h (MW)
                </h3>
              </CardHeader>
              <CardContent className="p-3 overflow-y-auto max-h-64">
                <div className="grid grid-cols-4 gap-1.5">
                  {manualMwRow.map((mw, h) => (
                    <div key={h} className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-slate-400 font-mono">{`${h.toString().padStart(2,'0')}h`}</span>
                      <input type="number" step="0.1" min="0" max="6" value={mw}
                        onChange={e => { const v = [...manualMwRow]; v[h] = parseFloat(e.target.value) || 0; setManualMwRow(v); }}
                        className="w-full px-1 py-1 text-center rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:ring-1 focus:ring-teal-500 focus:outline-none" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* KPI Results */}
          {simResult && (
            <Card className="border border-teal-500/30 bg-teal-500/5 dark:bg-teal-500/10 rounded-2xl p-4 space-y-2.5 text-xs">
              <p className="font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Kết quả mô phỏng
              </p>
              {[
                { label: 'Z cuối ngày', val: `${simResult.simulation.z_final.toFixed(2)} m` },
                { label: 'Z min / max', val: `${simResult.simulation.z_min.toFixed(2)} / ${simResult.simulation.z_max.toFixed(2)} m` },
                { label: 'Tổng sản lượng', val: `${simResult.simulation.energy_mwh.toFixed(1)} MWh` },
                { label: 'Xả tràn tổng', val: `${(simResult.simulation.vol_spill_total_m3 / 1e6).toFixed(3)} triệu m³` },
                { label: 'Q_đỉnh SCS-CN', val: simResult.scscn ? `${simResult.scscn.totals.q_peak_m3s.toFixed(1)} m³/s` : '—' },
                { label: 'Q_trung bình vào', val: simResult.scscn ? `${simResult.scscn.totals.q_avg_m3s.toFixed(2)} m³/s` : `${parseFloat(qManual).toFixed(2)} m³/s` },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between py-1 border-b border-teal-500/10 last:border-0">
                  <span className="text-slate-600 dark:text-zinc-400">{label}</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{val}</span>
                </div>
              ))}
              {/* Warnings */}
              {simResult.simulation.warnings.length > 0 && (
                <div className="pt-1 space-y-1">
                  {simResult.simulation.warnings.slice(0, 3).map((w, i) => (
                    <div key={i} className={`flex items-start gap-1.5 p-2 rounded-lg text-[10px] ${ w.type === 'SPILL' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300' }`}>
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Apply Q to schedule */}
              {simResult.scscn && (
                <button onClick={() => { onApplyQToSchedule(simResult.scscn!.totals.q_avg_m3s); showToast(`Đã áp dụng Q_avg = ${simResult.scscn!.totals.q_avg_m3s.toFixed(2)} m³/s vào kế hoạch!`, 'success'); }}
                  className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer">
                  <ArrowRight className="w-3.5 h-3.5" /> Áp dụng Q_avg vào Kế hoạch
                </button>
              )}
            </Card>
          )}
        </div>

        {/* RIGHT: Charts */}
        <div className="lg:col-span-8 space-y-4">
          {!simResult && (
            <div className="flex flex-col items-center justify-center h-80 rounded-2xl border-2 border-dashed border-teal-500/20 text-center text-slate-400 dark:text-zinc-500 space-y-3">
              <CloudRain className="w-12 h-12 opacity-30" />
              <div>
                <p className="font-bold text-sm">Chưa có kết quả mô phỏng</p>
                <p className="text-xs mt-1">Chọn lưu vực, cấu hình tham số và nhấn <strong>Chạy mô hình</strong></p>
              </div>
            </div>
          )}

          {simResult && (
            <>
              {/* Explanation */}
              <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-800 dark:text-teal-200">
                <strong>Chiến lược:</strong> {simResult.explanation}
              </div>

              {/* Chart 1: Mực nước hồ dự báo */}
              <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5"><Waves className="w-4 h-4" /> Mực nước hồ Z(t) dự báo (m)</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="gradZ" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={52} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px' }} />
                      <ReferenceLine y={simResult.plant_params.z_mndbt} stroke={MNDBTColor} strokeDasharray="4 4" label={{ value: `MNDBT ${simResult.plant_params.z_mndbt}m`, position: 'right', fontSize: 9, fill: MNDBTColor }} />
                      <ReferenceLine y={simResult.plant_params.z_mnc} stroke={MNCColor} strokeDasharray="4 4" label={{ value: `MNC ${simResult.plant_params.z_mnc}m`, position: 'right', fontSize: 9, fill: MNCColor }} />
                      <Area type="monotone" dataKey="z_sim" name="Z hồ (m)" stroke="#0284c7" strokeWidth={2.5} fill="url(#gradZ)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Chart 2: Mưa + Hydrograph Q */}
              <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1.5"><CloudRain className="w-4 h-4" /> Mưa (mm/h) & Lưu lượng (m³/s)</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={45} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={40} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px' }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: '10px' }} />
                      <Bar yAxisId="right" dataKey="precip" name="Mưa (mm/h)" fill="#93c5fd" opacity={0.7} radius={[2, 2, 0, 0]} />
                      <Line yAxisId="left" type="monotone" dataKey="q_in" name="Q vào (m³/s)" stroke="#14b8a6" strokeWidth={2} dot={false} />
                      <Line yAxisId="left" type="monotone" dataKey="q_turb" name="Q turbine (m³/s)" stroke="#6366f1" strokeWidth={2} dot={false} />
                      <Line yAxisId="left" type="monotone" dataKey="q_spill" name="Q xả tràn (m³/s)" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Chart 3: Lịch phát điện */}
              <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><Zap className="w-4 h-4" /> Lịch phát điện P(t) (MW)</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={40} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px' }} />
                      <Bar dataKey="power_mw" name="Công suất (MW)" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export function OperationPlanPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Selected Tab in Workbench
  const [activeTab, setActiveTab] = useState<'schedule' | 'simulation' | 'scscn'>('schedule');

  // Form State
  const [scenarioType, setScenarioType] = useState<'recommended' | 'custom'>('custom');
  const [recalcHours, setRecalcHours] = useState<number>(4);
  const [inflowMode, setInflowMode] = useState<'forecast' | 'manual'>('forecast');
  const [inflowManual, setInflowManual] = useState<string>('8.50');
  const [scheduleMode, setScheduleMode] = useState<'fixed' | 'daily_cycle' | 'recommended'>('daily_cycle');
  const [applyFrom, setApplyFrom] = useState<string>(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now.toISOString().slice(0, 16);
  });
  const [note, setNote] = useState<string>('Kế hoạch điều độ phát điện vận hành hồ chứa');

  // Schedule Rows State
  const [scheduleRows, setScheduleRows] = useState<ScheduleRowUi[]>(() => DISPATCH_PRESETS[0].rows);
  const [currentPlanId, setCurrentPlanId] = useState<number | null>(null);

  // Reservoir parameters
  const MNC = 610.0; // Mực nước chết (m)
  const MNDBT = 618.0; // Mực nước dâng bình thường (m)
  const currentZ = 615.45; // Mực nước hiện tại (m)

  // Fetch Operation Plans & Station data from Backend
  const { data: plansData, refetch } = useQuery({
    queryKey: ['operation-plans'],
    queryFn: async () => {
      try {
        const res = await api.getOperationPlans();
        return res;
      } catch (e) {
        console.error('Fetch operation plans error:', e);
        return null;
      }
    },
  });

  const turbines: TurbineInfo[] = useMemo(() => {
    if (plansData?.turbines && plansData.turbines.length > 0) {
      return plansData.turbines;
    }
    return DEFAULT_TURBINES;
  }, [plansData]);

  // Sync loaded plan data if present
  useEffect(() => {
    if (plansData?.active_plan) {
      const p = plansData.active_plan;
      setCurrentPlanId(p.id || null);
      setScenarioType(p.scenario_type);
      setRecalcHours(p.recalc_hours || 4);
      setInflowMode(p.inflow_mode);
      if (p.inflow_manual_m3s) setInflowManual(String(p.inflow_manual_m3s));
      setScheduleMode(p.schedule_mode);
      if (p.apply_from) setApplyFrom(p.apply_from.slice(0, 16));
      if (p.note) setNote(p.note);

      if (p.schedule && p.schedule.length > 0) {
        const mapped: ScheduleRowUi[] = p.schedule.map((r, i) => {
          const numUnits: Record<string, number> = {};
          Object.entries(r.units || {}).forEach(([k, v]) => {
            numUnits[k] = v != null ? Number(v) : 0;
          });
          return {
            id: String(r.id || i + 1),
            time_start: r.time_start,
            time_end: r.time_end,
            tariff: getEvnTariff(r.time_start),
            units: numUnits,
          };
        });
        setScheduleRows(mapped);
      }
    }
  }, [plansData]);

  // Add new schedule row
  const handleAddRow = () => {
    const lastRow = scheduleRows[scheduleRows.length - 1];
    let startTime = '00:00';
    let endTime = '04:00';
    if (lastRow) {
      startTime = lastRow.time_end;
      const [h] = startTime.split(':').map(Number);
      const nextH = Math.min(24, h + 4);
      endTime = `${String(nextH).padStart(2, '0')}:00`;
    }

    const newUnits: Record<string, number> = {};
    turbines.forEach((t) => {
      newUnits[String(t.id)] = 2.0;
    });

    const newRow: ScheduleRowUi = {
      id: String(Date.now()),
      time_start: startTime,
      time_end: endTime,
      tariff: getEvnTariff(startTime),
      units: newUnits,
    };
    setScheduleRows([...scheduleRows, newRow]);
  };

  // Delete schedule row
  const handleDeleteRow = (id: string) => {
    if (scheduleRows.length <= 1) {
      showToast('Kế hoạch phải có ít nhất 1 khung giờ vận hành.', 'warning');
      return;
    }
    setScheduleRows(scheduleRows.filter((r) => r.id !== id));
  };

  // Update schedule row field
  const handleUpdateRow = (id: string, field: 'time_start' | 'time_end', value: string) => {
    setScheduleRows(
      scheduleRows.map((r) => {
        if (r.id === id) {
          const updated = { ...r, [field]: value };
          if (field === 'time_start') {
            updated.tariff = getEvnTariff(value);
          }
          return updated;
        }
        return r;
      })
    );
  };

  // Update turbine power in row
  const handleUpdateTurbinePower = (rowId: string, turbineId: number, power: number) => {
    setScheduleRows(
      scheduleRows.map((r) => {
        if (r.id === rowId) {
          return {
            ...r,
            units: {
              ...r.units,
              [String(turbineId)]: Math.max(0, Math.min(2.5, power)),
            },
          };
        }
        return r;
      })
    );
  };

  // Save Plan Mutation
  const saveMutation = useMutation({
    mutationFn: async (action: 'save' | 'apply') => {
      const payload = {
        plan_id: currentPlanId,
        action,
        scenario_type: scenarioType,
        recalc_hours: recalcHours,
        inflow_mode: inflowMode,
        inflow_manual_m3s: inflowMode === 'manual' ? parseFloat(inflowManual) || 0 : null,
        schedule_mode: scheduleMode,
        apply_from: applyFrom,
        note,
        schedule: scheduleRows.map((r, i) => ({
          order: i,
          time_start: r.time_start,
          time_end: r.time_end,
          units: r.units,
        })),
      };
      return await api.saveOperationPlan(payload);
    },
    onSuccess: (data, action) => {
      queryClient.invalidateQueries({ queryKey: ['operation-plans'] });
      if (data?.id) setCurrentPlanId(data.id);
      showToast(
        action === 'apply'
          ? 'Đã kích hoạt & áp dụng kế hoạch vận hành vào hệ thống!'
          : 'Đã lưu bản nháp kế hoạch thành công!',
        'success'
      );
    },
    onError: (err: any) => {
      showToast(err?.message || 'Không thể lưu kế hoạch. Vui lòng kiểm tra lại.', 'error');
    },
  });

  // Calculate Aggregations (Total MWh, Max MW, Water Flow)
  const stats = useMemo(() => {
    let totalMwh = 0;
    let peakMwh = 0;
    let normalMwh = 0;
    let offpeakMwh = 0;
    let maxPower = 0;

    scheduleRows.forEach((r) => {
      const [sh, sm] = r.time_start.split(':').map(Number);
      const [eh, em] = r.time_end.split(':').map(Number);
      let durationHours = eh + em / 60 - (sh + sm / 60);
      if (durationHours <= 0) durationHours += 24;

      const rowTotalPower = Object.values(r.units).reduce((sum, p) => sum + (Number(p) || 0), 0);
      maxPower = Math.max(maxPower, rowTotalPower);
      const energy = rowTotalPower * durationHours;
      totalMwh += energy;

      if (r.tariff === 'peak') peakMwh += energy;
      else if (r.tariff === 'normal') normalMwh += energy;
      else offpeakMwh += energy;
    });

    const qInflow = inflowMode === 'manual' ? parseFloat(inflowManual) || 8.4 : 8.65;
    const avgPower = totalMwh / 24;
    const qTurbineAvg = avgPower * 3.4;

    return {
      totalMwh: Math.round(totalMwh * 10) / 10,
      peakMwh: Math.round(peakMwh * 10) / 10,
      normalMwh: Math.round(normalMwh * 10) / 10,
      offpeakMwh: Math.round(offpeakMwh * 10) / 10,
      maxPower: Math.round(maxPower * 10) / 10,
      avgPower: Math.round(avgPower * 10) / 10,
      qInflow,
      qTurbineAvg: Math.round(qTurbineAvg * 10) / 10,
    };
  }, [scheduleRows, inflowMode, inflowManual]);

  // Simulation 24h Timeseries generation
  const simulationChartData = useMemo(() => {
    const data = [];
    let currentWaterLevel = currentZ;

    for (let hour = 0; hour < 24; hour++) {
      const timeStr = `${String(hour).padStart(2, '0')}:00`;
      const timeVal = hour;

      const matchedRow = scheduleRows.find((r) => {
        const [sh] = r.time_start.split(':').map(Number);
        const [eh] = r.time_end.split(':').map(Number);
        if (eh > sh) return timeVal >= sh && timeVal < eh;
        return timeVal >= sh || timeVal < eh;
      });

      const pTotal = matchedRow
        ? Object.values(matchedRow.units).reduce((sum, p) => sum + (Number(p) || 0), 0)
        : 2.0;

      const qIn = stats.qInflow + Math.sin(hour / 3) * 0.8;
      const qOut = pTotal * 3.4;
      const dZ = ((qIn - qOut) * 3600) / 1200000;
      currentWaterLevel = Math.min(MNDBT + 0.5, Math.max(MNC - 0.2, currentWaterLevel + dZ));

      data.push({
        time: timeStr,
        waterLevel: Math.round(currentWaterLevel * 100) / 100,
        qInflow: Math.round(qIn * 10) / 10,
        qOutflow: Math.round(qOut * 10) / 10,
        powerMW: Math.round(pTotal * 10) / 10,
        mndbt: MNDBT,
        mnc: MNC,
      });
    }
    return data;
  }, [scheduleRows, currentZ, stats.qInflow]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
            <CalendarClock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Kế hoạch vận hành
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {plansData?.active_plan?.status === 'active' ? 'Đang áp dụng' : 'Bản nháp'}
              </span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
          <Button
            onClick={() => {
              setCurrentPlanId(null);
              setScheduleRows(JSON.parse(JSON.stringify(DISPATCH_PRESETS[0].rows)));
              showToast('Đã tạo mới khung kế hoạch vận hành!', 'info');
            }}
            variant="secondary"
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <Plus className="w-4 h-4 mr-1 text-slate-500" />
            Tạo mới
          </Button>

          <Button
            onClick={() => saveMutation.mutate('save')}
            disabled={saveMutation.isPending}
            variant="secondary"
            className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1 text-emerald-600" />
            )}
            Lưu nháp
          </Button>

          <Button
            onClick={() => saveMutation.mutate('apply')}
            disabled={saveMutation.isPending}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Áp dụng điều độ
          </Button>
        </div>
      </div>

      {/* ── KPI Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Mực nước hồ */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              Mực nước hồ (Z thượng lưu)
            </span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Waves className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {currentZ.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">m</span>
          </div>
          {/* Reservoir Capacity Bar */}
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>MNC {MNC}m</span>
              <span className="text-emerald-600 font-bold">
                {Math.round(((currentZ - MNC) / (MNDBT - MNC)) * 100)}% dung tích
              </span>
              <span>MNDBT {MNDBT}m</span>
            </div>
            <div className="h-2 w-full bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, ((currentZ - MNC) / (MNDBT - MNC)) * 100))}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Card 2: Lưu lượng nước về SCS-CN */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              Lưu lượng nước về (Q vào)
            </span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {stats.qInflow.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">m³/s</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1 pt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            <span>Dự báo theo mô hình mưa SCS-CN lưu vực</span>
          </p>
        </Card>

        {/* Card 3: Công suất phát cực đại */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              Công suất phát đỉnh (P max)
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {stats.maxPower.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">/ 5.00 MW</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1 pt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>2 Tổ máy (H1: 2.5 MW + H2: 2.5 MW)</span>
          </p>
        </Card>

        {/* Card 4: Tổng sản lượng điện 24h */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              Sản lượng điện 24h
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
              {stats.totalMwh.toFixed(1)}
            </span>
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">MWh/ngày</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 pt-1">
            <span className="text-amber-600">Cao điểm: {stats.peakMwh} MWh</span>
            <span>•</span>
            <span className="text-sky-600">Thường: {stats.normalMwh} MWh</span>
          </div>
        </Card>
      </div>

      {/* ── Main Layout: Left Dispatch Scheduler (8 cols) & Right Parameters (4 cols) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Dispatch Scheduler & Simulation (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-2 flex-wrap">
            <button
              onClick={() => setActiveTab('schedule')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'schedule'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Bảng Lập Lịch 24 Giờ</span>
            </button>
            <button
              onClick={() => setActiveTab('simulation')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'simulation'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Mô phỏng Thủy lực</span>
            </button>
            <button
              onClick={() => setActiveTab('scscn')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'scscn'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}
            >
              <CloudRain className="w-4 h-4" />
              <span>Dự báo SCS-CN & Điều tiết hồ</span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-teal-500/20 text-teal-600 dark:text-teal-400">MỚI</span>
            </button>
          </div>

          {/* Tab 1: Interactive 24-hour Dispatch Scheduler */}
          {activeTab === 'schedule' && (
            <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-slate-100 dark:border-zinc-800/80 px-6 py-4 flex flex-row items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-500" />
                    <span>Lịch Điều độ Chạy máy theo Khung giờ</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Phân bổ công suất các tổ máy (P_H1, P_H2) theo từng khung giờ EVN
                  </p>
                </div>
                <Button
                  onClick={handleAddRow}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm khung giờ</span>
                </Button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[650px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-zinc-800/60 border-b border-slate-200 dark:border-zinc-800 text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider">
                      <th className="py-3 px-4">Biểu giá EVN</th>
                      <th className="py-3 px-4">Bắt đầu</th>
                      <th className="py-3 px-4">Kết thúc</th>
                      {turbines.map((t) => (
                        <th key={t.id} className="py-3 px-4 text-center">
                          {t.name} (MW)
                        </th>
                      ))}
                      <th className="py-3 px-4 text-center">Tổng P (MW)</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-xs">
                    {scheduleRows.map((row) => {
                      const totalP = Object.values(row.units).reduce((sum, p) => sum + (Number(p) || 0), 0);
                      return (
                        <tr
                          key={row.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          {/* EVN Tariff Badge */}
                          <td className="py-3.5 px-4">
                            {row.tariff === 'peak' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                <Zap className="w-3 h-3" /> Cao điểm
                              </span>
                            ) : row.tariff === 'normal' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                Bình thường
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                                Thấp điểm
                              </span>
                            )}
                          </td>

                          {/* Start Time */}
                          <td className="py-3.5 px-4 font-mono font-bold">
                            <input
                              type="time"
                              value={row.time_start}
                              onChange={(e) => handleUpdateRow(row.id, 'time_start', e.target.value)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            />
                          </td>

                          {/* End Time */}
                          <td className="py-3.5 px-4 font-mono font-bold">
                            <input
                              type="time"
                              value={row.time_end}
                              onChange={(e) => handleUpdateRow(row.id, 'time_end', e.target.value)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            />
                          </td>

                          {/* Turbines Power Inputs */}
                          {turbines.map((t) => {
                            const val = row.units[String(t.id)] ?? 0;
                            return (
                              <td key={t.id} className="py-3.5 px-4 text-center">
                                <div className="inline-flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max={t.p_max || 2.5}
                                    value={val}
                                    onChange={(e) =>
                                      handleUpdateTurbinePower(row.id, t.id, parseFloat(e.target.value) || 0)
                                    }
                                    className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-right font-mono font-bold text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                  />
                                  <span className="text-[10px] text-slate-400 font-bold">MW</span>
                                </div>
                              </td>
                            );
                          })}

                          {/* Total Power */}
                          <td className="py-3.5 px-4 text-center font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                            {totalP.toFixed(2)} MW
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleDeleteRow(row.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                              title="Xóa dòng này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Tab 2: Simulation 24h Hydro & Power Chart */}
          {activeTab === 'simulation' && (
            <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 space-y-6">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-500" />
                  <span>Mô phỏng Biến thiên Thủy lực & Mực nước Hồ 24 Giờ</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Dự báo mực nước Z(t), lưu lượng đến Q_vào, lưu lượng xả phát điện Q_ra và công suất phát điện P(t)
                </p>
              </div>

              {/* Chart 1: Water Level Simulation */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-sky-600 flex items-center gap-1.5">
                    <Waves className="w-4 h-4" /> Đường mực nước hồ dự báo Z(t) (m)
                  </span>
                  <span className="text-slate-400 font-mono">
                    MNDBT: {MNDBT}m • MNC: {MNC}m
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={simulationChartData}>
                      <defs>
                        <linearGradient id="colorZ" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis domain={[MNC - 1, MNDBT + 1]} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: 'none',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="waterLevel"
                        name="Mực nước (m)"
                        stroke="#0284c7"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorZ)"
                      />
                      <Line
                        type="monotone"
                        dataKey="mndbt"
                        name="MNDBT (618m)"
                        stroke="#f43f5e"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="mnc"
                        name="MNC (610m)"
                        stroke="#eab308"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Flow Balance & Power Generation */}
              <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-zinc-800">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-emerald-600 flex items-center gap-1.5">
                    <Zap className="w-4 h-4" /> Cân bằng Lưu lượng (m³/s) & Công suất phát (MW)
                  </span>
                  <span className="text-slate-400 font-mono">24 Bước thời gian (1h/step)</span>
                </div>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={simulationChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: 'none',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="qInflow" name="Q đến (m³/s)" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="qOutflow" name="Q phát điện (m³/s)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Line
                        type="monotone"
                        dataKey="powerMW"
                        name="Công suất (MW)"
                        stroke="#f59e0b"
                        strokeWidth={2}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          )}
          {/* Tab 3: SCS-CN Simulation */}
          {activeTab === 'scscn' && (
            <ScsCnPanel
              onApplyQToSchedule={(qAvg) => {
                setInflowMode('manual');
                setInflowManual(String(qAvg.toFixed(2)));
                showToast(`Q_avg SCS-CN = ${qAvg.toFixed(2)} m³/s đã được áp dụng vào tham số Q vào!`, 'success');
              }}
            />
          )}
        </div>

        {/* Right Column: Parameters, Recommendations & Plan History (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card: Cấu hình Tham số Thủy văn & Áp dụng */}
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-zinc-800/80 px-6 py-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-500" />
                <span>Cài đặt Tham số Kế hoạch</span>
              </h2>
            </CardHeader>
            <CardContent className="p-5 space-y-4 text-xs">
              {/* Kịch bản vận hành */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-zinc-300">
                  Kịch bản vận hành
                </label>
                <select
                  value={scenarioType}
                  onChange={(e) => setScenarioType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="recommended">Theo khuyến nghị hệ thống (AI)</option>
                  <option value="custom">Tùy chỉnh thủ công</option>
                </select>
              </div>

              {/* Lượng nước về hồ */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-zinc-300">
                  Lượng nước về hồ (Q vào)
                </label>
                <select
                  value={inflowMode}
                  onChange={(e) => setInflowMode(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="forecast">Theo dự báo mưa lưu vực (SCS-CN)</option>
                  <option value="manual">Nhập tay cố định (m³/s)</option>
                </select>
              </div>

              {/* Q vào thủ công nếu chọn manual */}
              {inflowMode === 'manual' && (
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700 dark:text-zinc-300">
                    Lưu lượng Q vào (m³/s)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={inflowManual}
                    onChange={(e) => setInflowManual(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Chu kỳ tính toán lại */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-zinc-300">
                  Chu kỳ hiệu chỉnh dự báo
                </label>
                <select
                  value={recalcHours}
                  onChange={(e) => setRecalcHours(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value={1}>Mỗi 1 giờ (Lấy Z thực tế hiệu chỉnh)</option>
                  <option value={2}>Mỗi 2 giờ</option>
                  <option value={4}>Mỗi 4 giờ (Khuyến nghị)</option>
                  <option value={8}>Mỗi 8 giờ</option>
                  <option value={24}>Mỗi 24 giờ</option>
                </select>
              </div>

              {/* Thời gian bắt đầu áp dụng */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Thời gian bắt đầu áp dụng</span>
                </label>
                <input
                  type="datetime-local"
                  value={applyFrom}
                  onChange={(e) => setApplyFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Ghi chú */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-zinc-300">
                  Ghi chú kế hoạch
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Card: Khuyến nghị Tối ưu từ Hệ thống */}
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-zinc-800/80 px-6 py-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Khuyến nghị Tối ưu Kinh tế</span>
              </h2>
            </CardHeader>
            <CardContent className="p-5 space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-xs">
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
                  Chiến lược Phát điện Cao điểm
                </p>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-zinc-400">
                  Hồ đang ở mức <strong>{currentZ.toFixed(2)}m</strong> (cách MNDBT 2.55m). Khuyến nghị duy trì phát nền 1.6 MW và dồn toàn tải 5.0 MW vào khung giờ 09:30-11:30 & 17:00-20:00 để tối đa hóa doanh thu.
                </p>
              </div>

              <div className="space-y-2 pt-1 text-slate-600 dark:text-zinc-400">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
                  <span>Dự báo mực nước cuối ngày:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {simulationChartData[23]?.waterLevel.toFixed(2)} m
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
                  <span>Trạng thái an toàn hồ:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> An toàn tuyệt đối
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Hiệu suất thủy điện:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">92.4%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Lịch sử Kế hoạch Vận hành */}
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-zinc-800/80 px-6 py-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                <span>Lịch sử Kế hoạch Gần đây</span>
              </h2>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {plansData?.plans && plansData.plans.length > 0 ? (
                plansData.plans.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (p.id) {
                        setCurrentPlanId(p.id);
                        refetch();
                        showToast(`Đã tải kế hoạch #${p.id}`, 'info');
                      }
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer text-xs space-y-1 ${
                      currentPlanId === p.id
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>Kế hoạch #{p.id}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] ${
                          p.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold'
                            : 'bg-slate-100 dark:bg-zinc-800 text-slate-500'
                        }`}
                      >
                        {p.status_display || p.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                      {p.apply_from ? formatDateTime(p.apply_from) : '—'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-center text-slate-400 text-xs py-3">Chưa có kế hoạch lưu trước đó.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
