import { useState } from 'react';
import {
  Download,
  CloudDownload,
  Scale,
} from 'lucide-react';
import { Card, CardContent } from '../../components/Card';
import { Button } from '../../components/Button';
import { LuckysheetGrid } from '../../components/LuckysheetGrid';
import {
  REPORT_CONFIGS,
  buildOperationSheet,
  buildHSheet,
  buildLegalDailySheet,
  exportLuckysheetToXlsx,
} from '../../utils/luckysheetBuilder';
import { api } from '../../api/client';

export function LegalReportsTab() {
  const [reportType, setReportType] = useState<'nsmo_vanhanh' | 'nsmo_phatdien' | 'khai_thac_nuoc_mat' | 'tt47_mua'>('nsmo_vanhanh');
  const [dateSingle, setDateSingle] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [interval, setInterval] = useState<string>('1h');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [sheets, setSheets] = useState<any[]>([]);

  const isPhatDien = reportType === 'nsmo_phatdien';

  // Load Report Data and build Luckysheet sheets
  const handleLoadData = async () => {
    setIsLoading(true);

    try {
      let url = '';
      if (isPhatDien) {
        url = `/reports/data/?type=nsmo_phatdien&date=${dateSingle}&interval=${interval}`;
      } else {
        url = `/reports/data/?type=${reportType}&from=${dateFrom}&to=${dateTo}`;
      }

      let payload: any = null;
      try {
        payload = await api.request<any>(url);
      } catch {
        // Fallback demo mock if backend endpoint is not ready
        payload = isPhatDien
          ? generateMockPhatDien(dateSingle)
          : generateMockLegalSheets(dateFrom, dateTo, reportType);
      }

      if (isPhatDien) {
        const opRows = payload.operation || [];
        const h1Rows = payload.h1 || [];
        const h2Rows = payload.h2 || [];
        const generatedSheets = [
          buildOperationSheet('Operation data', opRows, 0),
          buildHSheet('H1', h1Rows, 1),
          buildHSheet('H2', h2Rows, 2),
        ];
        setSheets(generatedSheets);
      } else {
        const config = REPORT_CONFIGS[reportType] || REPORT_CONFIGS.nsmo_vanhanh;
        const rawSheets = payload.sheets || [];
        const generatedSheets = rawSheets.map((s: any, idx: number) =>
          buildLegalDailySheet(s.name || `Ngày ${idx + 1}`, config.columns, s.rows || [], s.avg_row, idx)
        );
        setSheets(generatedSheets);
      }
    } catch (err) {
      console.error('Error loading report data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Download Excel workbook
  const handleDownload = () => {
    const fromStr = isPhatDien ? dateSingle : dateFrom;
    const toStr = isPhatDien ? dateSingle : dateTo;
    exportLuckysheetToXlsx(`BaoCao_${reportType}_${fromStr}_${toStr}`);
  };

  return (
    <div className="space-y-4">
      {/* ── 1. PAGE HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Báo cáo pháp lý
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
            {/* 1. Loại báo cáo */}
            <div className="space-y-1 min-w-[240px]">
              <label className="block font-bold text-slate-700 dark:text-zinc-300">
                Loại báo cáo
              </label>
              <select
                value={reportType}
                onChange={(e) => {
                  setReportType(e.target.value as any);
                  setSheets([]);
                }}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-semibold text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-2xs"
              >
                <option value="nsmo_vanhanh">(NSMO) - Báo cáo vận hành</option>
                <option value="nsmo_phatdien">(NSMO) - Báo cáo phát điện</option>
                <option value="khai_thac_nuoc_mat">Báo cáo tình hình khai thác nước mặt (TT17)</option>
                <option value="tt47_mua">Báo cáo lượng mưa lưu vực (TT47)</option>
              </select>
            </div>

            {/* 2. Chu kỳ (chỉ hiển thị khi chọn nsmo_phatdien) */}
            {isPhatDien && (
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 dark:text-zinc-300">Chu kỳ</label>
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-medium text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="5m">5 phút</option>
                  <option value="15m">15 phút</option>
                  <option value="30m">30 phút</option>
                  <option value="1h">1 giờ</option>
                  <option value="3h">3 giờ</option>
                  <option value="1d">1 ngày</option>
                </select>
              </div>
            )}

            {/* 3. Date Selection */}
            {isPhatDien ? (
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 dark:text-zinc-300">Ngày báo cáo</label>
                <input
                  type="date"
                  value={dateSingle}
                  onChange={(e) => setDateSingle(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 font-mono text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            ) : (
              <>
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
              </>
            )}

            {/* 4. Nút Tải Dữ Liệu */}
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

      {/* ── 3. LUCKYSHEET SPREADSHEET CONTAINER ── */}
      <LuckysheetGrid
        id="luckysheet-legal-container"
        sheets={sheets}
        title="Báo cáo pháp lý"
        isLoading={isLoading}
        emptyText="Chưa có dữ liệu bảng tính"
        height="640px"
      />
    </div>
  );
}

// ── Mock Generator Helpers ─────────────────────────────────────────
function generateMockPhatDien(_targetDate: string) {
  const operation: any[] = [];
  const h1: any[] = [];
  const h2: any[] = [];

  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, '0');
    const qv = Number((12.5 + Math.sin(h / 3) * 2.2).toFixed(2));
    const z = Number((945.75 + Math.cos(h / 4) * 0.2).toFixed(2));
    const v = Number((0.45 + (z - 945) * 0.08).toFixed(3));
    const qH1 = h >= 6 && h <= 22 ? 5.2 : 0.0;
    const qH2 = h >= 7 && h <= 21 ? 5.0 : 0.0;
    const qXtt = 0.307;
    const qPhat = qH1 + qH2;
    const qXa = qPhat + qXtt;

    operation.push({
      ThoiGian: `${hh}:00`,
      LuongMua: h === 14 ? 3.5 : 0.0,
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

    h1.push({
      BatDau: `${hh}:00`,
      KetThuc: `${String((h + 1) % 24).padStart(2, '0')}:00`,
      ChuKy: h + 1,
      TThai_xa: qH1 > 0 ? 'Phát điện' : 'Dừng',
      Qxa: qH1,
      Qve: qv,
      Qmay: qH1,
      CS_thuc: qH1 > 0 ? 4.5 : 0,
      CS_kha: 4.8,
      MN_cuoi: z,
    });

    h2.push({
      BatDau: `${hh}:00`,
      KetThuc: `${String((h + 1) % 24).padStart(2, '0')}:00`,
      ChuKy: h + 1,
      TThai_xa: qH2 > 0 ? 'Phát điện' : 'Dừng',
      Qxa: qH2,
      Qve: qv,
      Qmay: qH2,
      CS_thuc: qH2 > 0 ? 4.4 : 0,
      CS_kha: 4.8,
      MN_cuoi: z,
    });
  }

  return { operation, h1, h2 };
}

function generateMockLegalSheets(from: string, to: string, _reportType: string) {
  const dFrom = new Date(from || '2026-04-19');
  const dTo = new Date(to || dFrom);
  const sheets: any[] = [];

  let cur = new Date(dFrom);
  while (cur <= dTo && sheets.length < 31) {
    const dayStr = cur.toISOString().slice(0, 10);
    const rows: any[] = [];
    let sumZ = 0, sumQ = 0, sumXa = 0, sumH1 = 0, sumH2 = 0, runH = 0;

    for (let h = 0; h < 24; h++) {
      const z = 945.8 + Math.sin(h / 3) * 0.15;
      const q = 12.0 + Math.cos(h / 4) * 2.0;
      const qH = h >= 6 && h <= 21 ? 10.2 : 0;
      const qXa = qH + 0.307;
      const isRun = qH > 0 ? 1 : 0;

      sumZ += z;
      sumQ += q;
      sumXa += qXa;
      sumH1 += qH > 0 ? 5.2 : 0;
      sumH2 += qH > 0 ? 5.0 : 0;
      runH += isRun;

      rows.push({
        Ngay: dayStr,
        Gio: h,
        MucNuocHo: Number(z.toFixed(2)),
        LuuLuongDenHo: Number(q.toFixed(2)),
        TongLuuLuongXa: Number(qXa.toFixed(2)),
        LuuLuongQuaNhaMay: Number(qH.toFixed(2)),
        LuuLuongQuaCuaTran: 0.0,
        SoGioPhatDien: isRun,
        LuuLuongXa: Number(qXa.toFixed(2)),
        TheTichHo: Number((0.45 + (z - 945) * 0.08).toFixed(3)),
        LuongMua: h === 13 ? 2.0 : 0.0,
        Tram1_Mua: h === 13 ? 2.5 : 0.0,
        Tram2_Mua: h === 13 ? 1.8 : 0.0,
        Tram3_Mua: h === 13 ? 3.0 : 0.0,
        Mua_LuyKe: h >= 13 ? 7.3 : 0.0,
        GhiChu: h === 12 ? 'Giờ cao điểm' : '',
      });
    }

    const avgRow = {
      MucNuocHo: Number((sumZ / 24).toFixed(2)),
      LuuLuongDenHo: Number((sumQ / 24).toFixed(2)),
      TongLuuLuongXa: Number((sumXa / 24).toFixed(2)),
      LuuLuongQuaNhaMay: Number(((sumH1 + sumH2) / 24).toFixed(2)),
      LuuLuongQuaCuaTran: 0.0,
      SoGioPhatDien: runH,
      LuuLuongXa: Number((sumXa / 24).toFixed(2)),
      TheTichHo: 0.514,
      LuongMua: 2.0,
      Tram1_Mua: 2.5,
      Tram2_Mua: 1.8,
      Tram3_Mua: 3.0,
      Mua_LuyKe: 7.3,
    };

    sheets.push({ name: dayStr, rows, avg_row: avgRow });
    cur.setDate(cur.getDate() + 1);
  }

  return { sheets };
}
