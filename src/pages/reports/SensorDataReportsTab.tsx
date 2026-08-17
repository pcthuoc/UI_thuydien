import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Radio,
  Download,
  CloudDownload,
  ChevronDown,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Card, CardContent } from '../../components/Card';
import { Button } from '../../components/Button';
import { api } from '../../api/client';

// ── Factor Groups Definition ──────────────────────────────────────
export interface FactorLeaf {
  key: string;
  label: string;
  unit: string;
  groupId: string;
}

export interface FactorGroup {
  id: string;
  label: string;
  items: FactorLeaf[];
}

export const FACTOR_GROUPS: FactorGroup[] = [
  {
    id: 'luu_luong',
    label: 'Lưu lượng (m³/s)',
    items: [
      { key: 'Qv_HC', label: 'Q đến hồ (Qv-HC)', unit: 'm³/s', groupId: 'luu_luong' },
      { key: 'Qv_HL', label: 'Q đến hạ lưu (Qv-HL)', unit: 'm³/s', groupId: 'luu_luong' },
      { key: 'Q_H1', label: 'Q phát H1', unit: 'm³/s', groupId: 'luu_luong' },
      { key: 'Q_H2', label: 'Q phát H2', unit: 'm³/s', groupId: 'luu_luong' },
      { key: 'Q_phat', label: '∑Q phát điện', unit: 'm³/s', groupId: 'luu_luong' },
      { key: 'Q_XTT', label: 'Q xả tối thiểu (XTT)', unit: 'm³/s', groupId: 'luu_luong' },
      { key: 'Q_tran_td', label: 'Q xả tràn (Tràn TD)', unit: 'm³/s', groupId: 'luu_luong' },
      { key: 'Q_xa_HC', label: '∑Q xả đập (HC)', unit: 'm³/s', groupId: 'luu_luong' },
      { key: 'Q_ra_HC', label: '∑Q ra (HC)', unit: 'm³/s', groupId: 'luu_luong' },
    ],
  },
  {
    id: 'muc_nuoc',
    label: 'Mực nước (m)',
    items: [
      { key: 'Z_HC', label: 'Mực nước hồ (Z-HC)', unit: 'm', groupId: 'muc_nuoc' },
      { key: 'Z_HL', label: 'Mực nước hạ lưu (Z-HL)', unit: 'm', groupId: 'muc_nuoc' },
    ],
  },
  {
    id: 'dung_tich',
    label: 'Dung tích (m³)',
    items: [
      { key: 'V_HC', label: 'Dung tích hồ (V-HC)', unit: 'm³', groupId: 'dung_tich' },
      { key: 'V_HL', label: 'Dung tích hạ lưu (V-HL)', unit: 'm³', groupId: 'dung_tich' },
    ],
  },
  {
    id: 'luong_mua',
    label: 'Lượng mưa (mm)',
    items: [
      { key: 'LuongMua', label: 'Lượng mưa lưu vực', unit: 'mm', groupId: 'luong_mua' },
    ],
  },
  {
    id: 'to_may',
    label: 'Tổ máy (m)',
    items: [
      { key: 'H1', label: 'Độ mở van H1', unit: 'm', groupId: 'to_may' },
      { key: 'H2', label: 'Độ mở van H2', unit: 'm', groupId: 'to_may' },
    ],
  },
  {
    id: 'cua_van',
    label: 'Cửa van (m)',
    items: [
      { key: 'A_XTT', label: 'Độ mở cửa van XTT', unit: 'm', groupId: 'cua_van' },
    ],
  },
];

const ALL_LEAVES = FACTOR_GROUPS.flatMap((g) => g.items);

export function SensorDataReportsTab() {
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [interval, setInterval] = useState<number>(60);
  const [useAvg, setUseAvg] = useState<boolean>(true);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(['Z_HC', 'Qv_HC', 'Q_phat', 'Q_xa_HC']);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    luu_luong: true,
    muc_nuoc: true,
  });
  const [isFactorDropdownOpen, setIsFactorDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [page, setPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [tableData, setTableData] = useState<{
    cols: string[];
    rows: Array<{ t: string; [k: string]: any }>;
    page: number;
    pages: number;
    total: number;
    page_size: number;
  } | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsFactorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle single factor
  const toggleFactor = (key: string) => {
    if (selectedKeys.includes(key)) {
      if (selectedKeys.length > 1) {
        setSelectedKeys(selectedKeys.filter((k) => k !== key));
      }
    } else {
      setSelectedKeys([...selectedKeys, key]);
    }
  };

  // Toggle group selection
  const toggleGroup = (group: FactorGroup) => {
    const groupKeys = group.items.map((i) => i.key);
    const allSelected = groupKeys.every((k) => selectedKeys.includes(k));
    if (allSelected) {
      const remaining = selectedKeys.filter((k) => !groupKeys.includes(k));
      setSelectedKeys(remaining.length > 0 ? remaining : [groupKeys[0]]);
    } else {
      const combined = Array.from(new Set([...selectedKeys, ...groupKeys]));
      setSelectedKeys(combined);
    }
  };

  // Load Sensor Series Data
  const fetchSeries = async (targetPage: number = 1) => {
    if (!dateFrom || !dateTo || selectedKeys.length === 0) return;
    setIsLoading(true);

    try {
      const query = new URLSearchParams({
        from: dateFrom,
        to: dateTo,
        interval: String(interval),
        avg: useAvg ? '1' : '0',
        codes: selectedKeys.join(','),
        page: String(targetPage),
        page_size: '50',
      });

      let res: any = null;
      try {
        res = await api.request<any>(`/reports/sensor-series/?${query.toString()}`);
      } catch {
        res = generateMockSeries(dateFrom, dateTo, selectedKeys, interval, targetPage);
      }

      setTableData(res);
      setPage(res.page || targetPage);
    } catch (err) {
      console.error('Fetch sensor series error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchSeries(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute 2-row table header groups
  const headerGroups = useMemo(() => {
    if (!tableData || !tableData.cols) return [];
    const hgs: Array<{ gid: string | null; label: string | null; codes: string[]; grouped: boolean }> = [];

    tableData.cols.forEach((code) => {
      const leaf = ALL_LEAVES.find((l) => l.key === code);
      const group = FACTOR_GROUPS.find((g) => g.id === leaf?.groupId);

      if (group) {
        const last = hgs[hgs.length - 1];
        if (last && last.gid === group.id) {
          last.codes.push(code);
        } else {
          hgs.push({ gid: group.id, label: group.label, codes: [code], grouped: true });
        }
      } else {
        hgs.push({ gid: null, label: null, codes: [code], grouped: false });
      }
    });

    return hgs;
  }, [tableData]);

  // Export SheetJS XLSX
  const handleDownload = () => {
    if (!tableData || !tableData.rows || !window.XLSX) return;

    const wb = window.XLSX.utils.book_new();
    const rowsArr: any[][] = [];

    // Header 1
    const h1: string[] = ['Thời gian'];
    headerGroups.forEach((hg) => {
      if (hg.grouped) {
        hg.codes.forEach((_, idx) => {
          h1.push(idx === 0 ? (hg.label || '') : '');
        });
      } else {
        const f = ALL_LEAVES.find((l) => l.key === hg.codes[0]);
        h1.push(f ? f.label : hg.codes[0]);
      }
    });
    rowsArr.push(h1);

    // Header 2
    const h2: string[] = [''];
    tableData.cols.forEach((code) => {
      const f = ALL_LEAVES.find((l) => l.key === code);
      h2.push(f ? `${f.label} (${f.unit})` : code);
    });
    rowsArr.push(h2);

    // Data rows
    tableData.rows.forEach((r) => {
      const rowVals: any[] = [r.t];
      tableData.cols.forEach((code) => {
        const v = r[code];
        rowVals.push(v !== null && v !== undefined ? v : '');
      });
      rowsArr.push(rowVals);
    });

    const ws = window.XLSX.utils.aoa_to_sheet(rowsArr);
    window.XLSX.utils.book_append_sheet(wb, ws, 'SoLieuQuanTrac');
    window.XLSX.writeFile(wb, `solieu_quantrac_${dateFrom}_${dateTo}_${interval}m.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* ── 1. PAGE HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Số liệu quan trắc
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownload}
            disabled={!tableData || tableData.rows.length === 0}
            className="flex items-center gap-1.5 font-semibold"
          >
            <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Tải xuống Excel (.xlsx)
          </Button>
        </div>
      </div>

      {/* ── 2. FILTER CONTROLS CARD ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3 text-xs">
            {/* Factor Selector Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                Yếu tố quan trắc
              </label>
              <button
                type="button"
                onClick={() => setIsFactorDropdownOpen(!isFactorDropdownOpen)}
                className={`px-3 py-1.5 rounded-lg border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                  selectedKeys.length > 0
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white dark:bg-zinc-950 text-slate-800 dark:text-zinc-200 border-slate-200 dark:border-zinc-800'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Yếu tố ({selectedKeys.length})</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isFactorDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Multi-level Dropdown Menu */}
              {isFactorDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-72 p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl z-40 max-h-96 overflow-y-auto space-y-2">
                  <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 dark:border-zinc-800 text-[11px]">
                    <span className="font-bold text-slate-500 uppercase tracking-wider">Danh mục yếu tố</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedKeys(ALL_LEAVES.map((l) => l.key))}
                        className="text-emerald-600 font-semibold hover:underline cursor-pointer"
                      >
                        Chọn tất cả
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedKeys([ALL_LEAVES[0].key])}
                        className="text-slate-400 font-semibold hover:underline cursor-pointer"
                      >
                        Mặc định
                      </button>
                    </div>
                  </div>

                  {FACTOR_GROUPS.map((g) => {
                    const isExpanded = expandedGroups[g.id] ?? false;
                    const selectedCount = g.items.filter((i) => selectedKeys.includes(i.key)).length;
                    const isAll = selectedCount === g.items.length;

                    return (
                      <div key={g.id} className="space-y-1">
                        {/* Group Header */}
                        <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800/60 text-xs hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer">
                          <div className="flex items-center gap-1.5 flex-1" onClick={() => toggleGroup(g)}>
                            <input
                              type="checkbox"
                              checked={isAll}
                              onChange={() => toggleGroup(g)}
                              className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
                            />
                            <span className="font-bold text-slate-800 dark:text-zinc-200">{g.label}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedGroups({ ...expandedGroups, [g.id]: !isExpanded })}
                            className="p-1 text-slate-400 hover:text-slate-600"
                          >
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>
                        </div>

                        {/* Group Children */}
                        {isExpanded && (
                          <div className="pl-6 space-y-1 border-l-2 border-slate-200 dark:border-zinc-800 ml-3">
                            {g.items.map((item) => (
                              <label
                                key={item.key}
                                className="flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedKeys.includes(item.key)}
                                    onChange={() => toggleFactor(item.key)}
                                    className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
                                  />
                                  <span className="text-slate-700 dark:text-zinc-300">{item.label}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">({item.unit})</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Date From */}
            <div className="space-y-1">
              <label className="block font-bold text-slate-700 dark:text-zinc-300">Từ ngày</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-mono text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Date To */}
            <div className="space-y-1">
              <label className="block font-bold text-slate-700 dark:text-zinc-300">Đến ngày</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-mono text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Interval */}
            <div className="space-y-1">
              <label className="block font-bold text-slate-700 dark:text-zinc-300">Chu kỳ bước</label>
              <select
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-medium text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value={5}>5 phút</option>
                <option value={15}>15 phút</option>
                <option value={30}>30 phút</option>
                <option value={60}>1 giờ (Chuẩn)</option>
                <option value={180}>3 giờ</option>
                <option value={720}>12 giờ</option>
                <option value={1440}>24 giờ (1 ngày)</option>
              </select>
            </div>

            {/* Avg Toggle */}
            <label className="flex items-center gap-1.5 pb-2 text-xs font-bold text-slate-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={useAvg}
                onChange={(e) => setUseAvg(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
              />
              <span>Lấy giá trị TB (avg)</span>
            </label>

            {/* Submit Load */}
            <Button
              variant="primary"
              size="sm"
              onClick={() => fetchSeries(1)}
              disabled={isLoading}
              className="font-bold flex items-center gap-1.5 ml-auto"
            >
              <CloudDownload className="w-4 h-4" />
              Tải dữ liệu
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. 2-ROW HEADER SENSOR DATA TABLE ── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900 dark:text-white">
              {tableData ? `${tableData.total} bản ghi · ${tableData.cols.length} yếu tố` : 'Chưa tải dữ liệu'}
            </span>
            {tableData && tableData.pages > 1 && (
              <span className="text-slate-500 dark:text-zinc-400 font-mono">
                Trang {page} / {tableData.pages}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="p-16 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-3">
              <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>Đang tải chuỗi dữ liệu quan trắc...</span>
            </div>
          ) : !tableData || tableData.rows.length === 0 ? (
            <div className="p-16 text-center text-xs text-slate-400 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800">
              Chọn yếu tố quan trắc và thời gian, sau đó nhấn &quot;Tải dữ liệu&quot;.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800 max-h-[62vh]">
              <table className="w-full text-right text-xs border-collapse font-mono">
                <thead className="bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 font-bold sticky top-0 z-20 shadow-xs">
                  {/* Row 1: Group headers */}
                  <tr className="border-b border-slate-200 dark:border-zinc-700 bg-slate-200/70 dark:bg-zinc-800">
                    <th className="p-2.5 text-center border-r border-slate-300 dark:border-zinc-700 font-sans" rowSpan={2}>
                      Thời gian
                    </th>
                    {headerGroups.map((hg, idx) => (
                      <th
                        key={idx}
                        colSpan={hg.codes.length}
                        className="p-2 text-center border-r border-slate-300 dark:border-zinc-700 font-sans font-extrabold text-[11px] text-slate-900 dark:text-white"
                      >
                        {hg.grouped ? hg.label : (ALL_LEAVES.find((l) => l.key === hg.codes[0])?.label || hg.codes[0])}
                      </th>
                    ))}
                  </tr>

                  {/* Row 2: Sub-column headers */}
                  <tr className="border-b border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800/90 text-[11px]">
                    {tableData.cols.map((code) => {
                      const f = ALL_LEAVES.find((l) => l.key === code);
                      return (
                        <th key={code} className="p-2 text-center border-r border-slate-200 dark:border-zinc-700 last:border-r-0 font-sans">
                          <div>{f ? f.label : code}</div>
                          <span className="font-normal text-[10px] text-slate-500 dark:text-zinc-400">
                            ({f?.unit || '—'})
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                  {tableData.rows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="p-2 text-center border-r border-slate-200 dark:border-zinc-800 font-sans font-bold text-slate-900 dark:text-white bg-slate-50/40 dark:bg-zinc-900/40">
                        {r.t}
                      </td>
                      {tableData.cols.map((code) => {
                        const val = r[code];
                        return (
                          <td
                            key={code}
                            className="p-2 border-r border-slate-200 dark:border-zinc-800 last:border-r-0 font-bold text-slate-800 dark:text-zinc-200"
                          >
                            {val !== null && val !== undefined
                              ? Number(val).toLocaleString('vi-VN', { maximumFractionDigits: 3 })
                              : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {tableData && tableData.pages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 text-xs">
              <span className="text-slate-500 dark:text-zinc-400 font-mono">
                Hiển thị {(page - 1) * tableData.page_size + 1}–{Math.min(page * tableData.page_size, tableData.total)} / {tableData.total} bản ghi
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1 || isLoading}
                  onClick={() => fetchSeries(page - 1)}
                  className="px-2.5 py-1 text-xs"
                >
                  ‹ Trang trước
                </Button>
                <span className="px-2 font-bold font-mono text-slate-800 dark:text-zinc-200">{page}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= tableData.pages || isLoading}
                  onClick={() => fetchSeries(page + 1)}
                  className="px-2.5 py-1 text-xs"
                >
                  Trang sau ›
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Mock Generator for Sensor Series ──────────────────────────────
function generateMockSeries(from: string, to: string, codes: string[], intervalMins: number, targetPage: number) {
  const dFrom = new Date(from || '2026-04-19');
  const dTo = new Date(to || dFrom);
  dTo.setHours(23, 59, 59);

  const totalPoints = Math.min(288, Math.max(24, Math.floor((dTo.getTime() - dFrom.getTime()) / (intervalMins * 60 * 1000))));
  const pageSize = 50;
  const totalPages = Math.ceil(totalPoints / pageSize);
  const startIdx = (targetPage - 1) * pageSize;
  const endIdx = Math.min(totalPoints, startIdx + pageSize);

  const rows: any[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    const cur = new Date(dFrom.getTime() + i * intervalMins * 60 * 1000);
    const timeStr = `${cur.toLocaleDateString('vi-VN')} ${cur.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

    const rowObj: any = { t: timeStr };
    codes.forEach((code) => {
      if (code.startsWith('Z_')) rowObj[code] = Number((945.75 + Math.sin(i / 5) * 0.25).toFixed(2));
      else if (code.startsWith('Q_') || code.startsWith('Qv_')) rowObj[code] = Number((12.0 + Math.cos(i / 4) * 2.0).toFixed(2));
      else if (code.startsWith('V_')) rowObj[code] = Number((0.45 + Math.sin(i / 6) * 0.05).toFixed(3));
      else if (code.includes('Mua')) rowObj[code] = i === 12 ? 3.5 : 0.0;
      else if (code.startsWith('H')) rowObj[code] = 94.5;
      else rowObj[code] = 0.25;
    });

    rows.push(rowObj);
  }

  return {
    cols: codes,
    rows,
    page: targetPage,
    pages: totalPages,
    total: totalPoints,
    page_size: pageSize,
  };
}
