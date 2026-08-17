import { useState } from 'react';
import {
  Download,
  CloudDownload,
  FileSpreadsheet,
} from 'lucide-react';
import { Card, CardContent } from '../../components/Card';
import { Button } from '../../components/Button';
import { LuckysheetGrid } from '../../components/LuckysheetGrid';
import {
  buildOperationSheet,
  exportLuckysheetToXlsx,
} from '../../utils/luckysheetBuilder';
import { api } from '../../api/client';

export function DataTableReportsTab() {
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [interval, setInterval] = useState<string>('1h');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [sheets, setSheets] = useState<any[]>([]);

  // Load Data and build Luckysheet sheets
  const handleLoadData = async () => {
    if (!dateFrom || !dateTo) return;
    setIsLoading(true);

    try {
      const url = `/reports/data/?type=nsmo_phatdien&from=${dateFrom}&to=${dateTo}&interval=${interval}`;
      let payload: any = null;

      try {
        payload = await api.request<any>(url);
      } catch {
        // Fallback demo mock if backend endpoint is in progress
        payload = generateMockDataTablePayload(dateFrom, dateTo, interval);
      }

      // Gộp tất cả ngày thành 1 mảng theo đúng logic của data_table.html
      const mergedRows: any[] = [];
      for (const s of (payload.sheets || [])) {
        for (const row of (s.operation || [])) {
          mergedRows.push({ ...row, ThoiGian: `${s.name} ${row.ThoiGian}` });
        }
      }

      const sheetTitle = mergedRows.length > 0 ? `${dateFrom} → ${dateTo}` : 'Không có dữ liệu';
      const luckySheet = buildOperationSheet(sheetTitle, mergedRows, 0);
      setSheets([luckySheet]);
    } catch (err) {
      console.error('Error loading data table report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Download Excel
  const handleDownload = () => {
    exportLuckysheetToXlsx(`nsmo_phatdien_${dateFrom}_${dateTo}_${interval}`);
  };

  return (
    <div className="space-y-4">
      {/* ── 1. PAGE HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Báo cáo phát điện
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownload}
            disabled={sheets.length === 0}
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
            <div className="space-y-1">
              <label className="block font-bold text-slate-700 dark:text-zinc-300">Từ ngày</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-mono text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700 dark:text-zinc-300">Đến ngày</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-mono text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700 dark:text-zinc-300">Chu kỳ bước thời gian</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-medium text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="5m">5 phút</option>
                <option value="15m">15 phút</option>
                <option value="30m">30 phút</option>
                <option value="1h">1 giờ (Chuẩn)</option>
                <option value="3h">3 giờ</option>
                <option value="1d">1 ngày</option>
              </select>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  setDateFrom(today);
                  setDateTo(today);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 font-semibold cursor-pointer"
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => {
                  const past = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
                  const today = new Date().toISOString().slice(0, 10);
                  setDateFrom(past);
                  setDateTo(today);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 font-semibold cursor-pointer"
              >
                7 ngày
              </button>
            </div>

            {/* Submit Load Button */}
            <Button
              variant="primary"
              size="sm"
              onClick={handleLoadData}
              disabled={isLoading}
              className="font-bold flex items-center gap-1.5 ml-auto"
            >
              <CloudDownload className="w-4 h-4" />
              Tải dữ liệu
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. LUCKYSHEET SPREADSHEET ── */}
      <LuckysheetGrid
        id="luckysheet-datatable-container"
        sheets={sheets}
        title="Báo cáo phát điện"
        isLoading={isLoading}
        emptyText="Chưa có dữ liệu bảng tính ma trận vận hành"
        height="640px"
      />
    </div>
  );
}

// ── Mock Generator for Data Table ──────────────────────────────────
function generateMockDataTablePayload(from: string, to: string, interval: string) {
  const dFrom = new Date(from || '2026-04-19');
  const dTo = new Date(to || dFrom);
  const sheets: any[] = [];

  let cur = new Date(dFrom);
  while (cur <= dTo && sheets.length < 31) {
    const dayStr = cur.toISOString().slice(0, 10);
    const operation: any[] = [];

    const count = interval === '5m' ? 288 : interval === '15m' ? 96 : interval === '30m' ? 48 : 24;
    const stepMins = 1440 / count;

    for (let i = 0; i < count; i++) {
      const startMin = i * stepMins;
      const hh = String(Math.floor(startMin / 60)).padStart(2, '0');
      const mm = String(startMin % 60).padStart(2, '0');
      const timeStr = `${hh}:${mm}`;

      const qv = Number((12.5 + Math.sin(i / 4) * 2.2).toFixed(2));
      const z = Number((945.75 + Math.cos(i / 5) * 0.2).toFixed(2));
      const v = Number((0.45 + (z - 945) * 0.08).toFixed(3));
      const qH1 = i >= Math.floor(count * 0.25) && i <= Math.floor(count * 0.85) ? 5.2 : 0.0;
      const qH2 = i >= Math.floor(count * 0.3) && i <= Math.floor(count * 0.8) ? 5.0 : 0.0;
      const qXtt = 0.307;
      const qPhat = qH1 + qH2;
      const qXa = qPhat + qXtt;

      operation.push({
        ThoiGian: timeStr,
        LuongMua: i === 12 ? 3.5 : 0.0,
        Qv_HC: qv,
        Qv_tbt_HC: qv,
        Qv_DB_HC: qv,
        Qv_HL: qv,
        Qv_tbt_HL: null,
        Qv_DB_HL: qv,
        Z_HC: z,
        Z_DB_HC: z,
        V_HC: v,
        Z_HL: 852.1,
        Z_DB_HL: 852.1,
        V_HL: 0.12,
        H1: qH1 > 0 ? 94.5 : 0,
        Q_H1: qH1,
        H2: qH2 > 0 ? 94.2 : 0,
        Q_H2: qH2,
        A_XTT: 0.25,
        Q_XTT: qXtt,
        Q_tran_td: 0.0,
        QTT: qXtt,
        Q_phat: qPhat,
        Q_xa_HC: qXa,
        Q_xa_HL: null,
        Q_ra_HC: qXa,
        Q_ra_HL: null,
      });
    }

    sheets.push({ name: dayStr, operation });
    cur.setDate(cur.getDate() + 1);
  }

  return { sheets };
}
