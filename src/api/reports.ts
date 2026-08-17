import { api } from './client';

// ── Types for Legal Reports ──────────────────────────────────────
export type LegalReportType =
  | 'nsmo_vanhanh'
  | 'nsmo_phatdien'
  | 'khai_thac_nuoc_mat'
  | 'tt47_hochua'
  | 'tt47_mua'
  | 'tt17_tnmt'
  | 'bct_phatdien';

export interface LegalReportOption {
  code: LegalReportType;
  title: string;
  agency: string;
  lawBasis: string;
  description: string;
  intervalSupport: string[];
  defaultInterval: string;
}

export const LEGAL_REPORT_CATALOG: LegalReportOption[] = [
  {
    code: 'nsmo_vanhanh',
    title: 'Báo cáo Vận hành Thủy điện (NSMO / A0)',
    agency: 'Trung tâm Điều độ Hệ thống điện Quốc gia (NSMO)',
    lawBasis: 'Quy trình vận hành liên hồ chứa & Điều độ HTĐ',
    description: 'Báo cáo tổng hợp số liệu vận hành hồ chứa theo từng giờ: Mực nước hồ, Lưu lượng đến, Q phát điện, Q xả tràn, Tổng Q xả và số giờ phát điện.',
    intervalSupport: ['1h'],
    defaultInterval: '1h',
  },
  {
    code: 'nsmo_phatdien',
    title: 'Báo cáo Số liệu Phát điện Chi tiết (NSMO)',
    agency: 'Trung tâm Điều độ HTĐ Quốc gia',
    lawBasis: 'Quy định đo đếm & điều độ điện năng',
    description: 'Báo cáo công suất P (MW), sản lượng A (MWh) và lưu lượng qua từng tổ máy H1, H2 theo chu kỳ chi tiết.',
    intervalSupport: ['5m', '15m', '30m', '1h'],
    defaultInterval: '1h',
  },
  {
    code: 'khai_thac_nuoc_mat',
    title: 'Báo cáo Khai thác Nước mặt (TNN)',
    agency: 'Cục Quản lý Tài nguyên nước',
    lawBasis: 'Luật Tài nguyên nước & TT 47/2017/TT-BTNMT',
    description: 'Báo cáo giám sát khai thác, sử dụng tài nguyên nước mặt: Mực nước hồ, Lưu lượng xả, Thể tích hồ, Lượng mưa.',
    intervalSupport: ['1h', '1d'],
    defaultInterval: '1h',
  },
  {
    code: 'tt47_hochua',
    title: 'Báo cáo Vận hành Hồ chứa (Thông tư 47/BTNMT)',
    agency: 'Cục Quản lý Tài nguyên nước & Sở TN&MT',
    lawBasis: 'Thông tư 47/2017/TT-BTNMT & TT 17/2021/TT-BTNMT',
    description: 'Báo cáo giám sát khai thác, sử dụng tài nguyên nước đối với công trình hồ chứa thủy điện.',
    intervalSupport: ['15m', '1h', '1d'],
    defaultInterval: '1h',
  },
  {
    code: 'tt47_mua',
    title: 'Báo cáo Lượng mưa Lưu vực (Thông tư 47/BTNMT)',
    agency: 'Cục Quản lý Tài nguyên nước & Tổng cục KTTV',
    lawBasis: 'Thông tư 47/2017/TT-BTNMT',
    description: 'Báo cáo tổng hợp lượng mưa ngày, lượng mưa tích lũy và cường độ mưa từ mạng lưới các trạm đo mưa lưu vực.',
    intervalSupport: ['1h', '1d'],
    defaultInterval: '1d',
  },
  {
    code: 'tt17_tnmt',
    title: 'Báo cáo Giám sát Khai thác TNN (Thông tư 17/2021)',
    agency: 'Sở Tài nguyên và Môi trường',
    lawBasis: 'Thông tư 17/2021/TT-BTNMT',
    description: 'Báo cáo định kỳ giám sát dòng chảy tối thiểu, mực nước hồ và lưu lượng xả về hạ du.',
    intervalSupport: ['15m', '1h'],
    defaultInterval: '1h',
  },
  {
    code: 'bct_phatdien',
    title: 'Báo cáo Vận hành & Sản lượng (Bộ Công Thương)',
    agency: 'Bộ Công Thương / Cục Điện lực & Năng lượng tái tạo',
    lawBasis: 'Quy định báo cáo định kỳ ngành điện',
    description: 'Báo cáo tổng hợp công suất khả dụng, sản lượng phát lũy kế, lượng nước sử dụng cho phát điện.',
    intervalSupport: ['1h', '1d'],
    defaultInterval: '1d',
  },
];

export interface LegalReportRow {
  Ngay: string;
  Gio: number;
  MucNuocHo?: number | null;
  LuuLuongDenHo?: number | null;
  TongLuuLuongXa?: number | null;
  LuuLuongQuaNhaMay?: number | null;
  LuuLuongQuaCuaTran?: number | null;
  SoGioPhatDien?: number | null;
  CongSuatP?: number | null;
  SanLuongA?: number | null;
  LuongMua?: number | null;
  GhiChu?: string;
  [key: string]: any;
}

export interface LegalReportSheet {
  name: string;
  rows: LegalReportRow[];
  avg_row?: Record<string, number | string>;
  sum_row?: Record<string, number | string>;
}

export interface LegalReportResponse {
  sheets?: LegalReportSheet[];
  operation?: Record<string, any>;
  h1?: Record<string, any>;
  h2?: Record<string, any>;
  error?: string;
}

// ── Types for Operational Data Table ─────────────────────────────
export interface DataTableRecord {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  z_ho: number | null;
  v_ho: number | null;
  z_hl: number | null;
  q_den: number | null;
  q_h1: number | null;
  q_h2: number | null;
  q_phat_tong: number | null;
  q_tran: number | null;
  q_xtt: number | null;
  q_xa_tong: number | null;
  p_mw: number | null;
  a_mwh: number | null;
  rain_24h: number | null;
}

export interface DataTableSummary {
  recordCount: number;
  z_ho_max: number;
  z_ho_min: number;
  z_ho_avg: number;
  q_den_avg: number;
  q_den_max: number;
  q_phat_avg: number;
  q_xa_avg: number;
  total_water_inflow_m3: number;
  total_water_outflow_m3: number;
  total_generation_mwh: number;
}

// ── Types for Sensor Time-Series Data ─────────────────────────────
export interface SensorOption {
  code: string;
  name: string;
  unit: string;
  group: string;
  type: 'calculated' | 'sensor';
  color: string;
}

export interface SensorSeriesResponse {
  cols: string[];
  rows: Array<{
    t: string;
    [code: string]: number | string | null;
  }>;
  page: number;
  page_size: number;
  total: number;
  pages: number;
}

// ── Reports API Methods ──────────────────────────────────────────
export const reportsApi = {
  // 1. Legal Report Fetcher
  async getLegalReport(params: {
    type: LegalReportType;
    date?: string;
    from?: string;
    to?: string;
    interval?: string;
  }): Promise<LegalReportResponse> {
    const query = new URLSearchParams();
    query.set('type', params.type);
    if (params.date) query.set('date', params.date);
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.interval) query.set('interval', params.interval);

    try {
      const resp = await api.request<LegalReportResponse>(`/reports/data/?${query.toString()}`);
      return resp;
    } catch {
      // Fallback mock builder so the user can test/preview FE instantly
      return generateMockLegalReport(params);
    }
  },

  // 2. Data Table Report Fetcher
  async getDataTable(params: {
    from: string;
    to: string;
    interval?: string;
  }): Promise<{ rows: DataTableRecord[]; summary: DataTableSummary }> {
    const query = new URLSearchParams();
    query.set('type', 'data_table');
    query.set('from', params.from);
    query.set('to', params.to);
    if (params.interval) query.set('interval', params.interval);

    try {
      const resp = await api.request<any>(`/reports/data/?${query.toString()}`);
      if (resp && resp.rows) return resp;
      return generateMockDataTable(params.from, params.to, params.interval || '1h');
    } catch {
      return generateMockDataTable(params.from, params.to, params.interval || '1h');
    }
  },

  // 3. Sensor Time Series Fetcher
  async getSensorSeries(params: {
    from: string;
    to: string;
    codes: string[];
    interval?: number;
    avg?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<SensorSeriesResponse> {
    const query = new URLSearchParams();
    query.set('from', params.from);
    query.set('to', params.to);
    query.set('codes', params.codes.join(','));
    query.set('interval', String(params.interval || 60));
    query.set('avg', params.avg ? '1' : '0');
    query.set('page', String(params.page || 1));
    query.set('page_size', String(params.page_size || 50));

    try {
      const resp = await api.request<SensorSeriesResponse>(
        `/reports/sensor-series/?${query.toString()}`
      );
      return resp;
    } catch {
      return generateMockSensorSeries(params);
    }
  },

  // Export to CSV helper
  exportToCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const escapeCell = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent =
      '\uFEFF' + // UTF-8 BOM for Excel support
      headers.map(escapeCell).join(',') +
      '\n' +
      rows.map((row) => row.map(escapeCell).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};

// ── Fallback Mock Generators (Seamless preview even if BE is not running) ──
function generateMockLegalReport(params: {
  type: LegalReportType;
  date?: string;
  from?: string;
  to?: string;
}): LegalReportResponse {
  const targetDate = params.date || params.from || new Date().toISOString().slice(0, 10);
  const rows: LegalReportRow[] = [];

  let sumQDen = 0;
  let sumQXa = 0;
  let sumP = 0;
  let sumA = 0;
  let sumZ = 0;
  let runningHours = 0;

  for (let h = 0; h < 24; h++) {
    const z = 945.75 + Math.sin(h / 3) * 0.15 + (Math.random() * 0.04 - 0.02);
    const qDen = 12.5 + Math.cos(h / 4) * 2.2 + (Math.random() * 0.5 - 0.25);
    const qH1 = h >= 6 && h <= 21 ? 5.2 + Math.random() * 0.3 : 0;
    const qH2 = h >= 7 && h <= 20 ? 5.0 + Math.random() * 0.3 : 0;
    const qPhat = qH1 + qH2;
    const qTran = 0;
    const qXa = qPhat + qTran + 0.307; // + XTT
    const pMw = qPhat > 0 ? (qPhat * 0.85).toFixed(2) : 0;
    const aMwh = Number(pMw);
    const rain = h === 14 ? 2.5 : 0;
    const isRunning = qPhat > 0 ? 1 : 0;

    sumZ += z;
    sumQDen += qDen;
    sumQXa += qXa;
    sumP += Number(pMw);
    sumA += aMwh;
    runningHours += isRunning;

    rows.push({
      Ngay: targetDate,
      Gio: h,
      MucNuocHo: Number(z.toFixed(2)),
      LuuLuongDenHo: Number(qDen.toFixed(2)),
      LuuLuongQuaNhaMay: Number(qPhat.toFixed(2)),
      LuuLuongQuaCuaTran: qTran,
      TongLuuLuongXa: Number(qXa.toFixed(2)),
      SoGioPhatDien: isRunning,
      CongSuatP: Number(pMw),
      SanLuongA: aMwh,
      LuongMua: rain,
      GhiChu: h === 12 ? 'Vận hành giờ cao điểm' : '',
    });
  }

  const avgRow = {
    Ngay: 'Trung bình',
    Gio: '—' as any,
    MucNuocHo: Number((sumZ / 24).toFixed(2)),
    LuuLuongDenHo: Number((sumQDen / 24).toFixed(2)),
    LuuLuongQuaNhaMay: Number(((sumQXa - 0.307 * 24) / 24).toFixed(2)),
    LuuLuongQuaCuaTran: 0,
    TongLuuLuongXa: Number((sumQXa / 24).toFixed(2)),
    SoGioPhatDien: runningHours,
    CongSuatP: Number((sumP / 24).toFixed(2)),
    SanLuongA: Number(sumA.toFixed(2)),
    LuongMua: 2.5,
    GhiChu: `Tổng sản lượng: ${sumA.toFixed(1)} MWh`,
  };

  return {
    sheets: [
      {
        name: targetDate,
        rows,
        avg_row: avgRow,
      },
    ],
  };
}

function generateMockDataTable(
  from: string,
  to: string,
  interval: string
): { rows: DataTableRecord[]; summary: DataTableSummary } {
  const rows: DataTableRecord[] = [];
  const start = new Date(from || new Date().toISOString().slice(0, 10));
  const end = new Date(to || start);
  end.setHours(23, 59, 59);

  let stepMinutes = 60;
  if (interval === '5m') stepMinutes = 5;
  if (interval === '15m') stepMinutes = 15;
  if (interval === '30m') stepMinutes = 30;
  if (interval === '1d') stepMinutes = 1440;

  const totalPoints = Math.min(288, Math.floor((end.getTime() - start.getTime()) / (stepMinutes * 60 * 1000)));

  let zMax = -Infinity;
  let zMin = Infinity;
  let zSum = 0;
  let qDenSum = 0;
  let qPhatSum = 0;
  let qXaSum = 0;
  let totalGeneration = 0;

  for (let i = 0; i <= totalPoints; i++) {
    const cur = new Date(start.getTime() + i * stepMinutes * 60 * 1000);
    const z = 945.8 + Math.sin(i / 12) * 0.2 + (Math.random() * 0.02 - 0.01);
    const v = 0.45 + (z - 945) * 0.08;
    const zHl = 852.1 + (Math.random() * 0.05 - 0.025);
    const qDen = 11.8 + Math.cos(i / 10) * 1.8 + (Math.random() * 0.4 - 0.2);
    const qH1 = 5.2 + (Math.random() * 0.2 - 0.1);
    const qH2 = 5.1 + (Math.random() * 0.2 - 0.1);
    const qPhat = qH1 + qH2;
    const qTran = 0;
    const qXtt = 0.307;
    const qXa = qPhat + qTran + qXtt;
    const pMw = qPhat * 0.88;
    const aMwh = pMw * (stepMinutes / 60);
    const rain = i === 10 ? 1.2 : 0;

    zMax = Math.max(zMax, z);
    zMin = Math.min(zMin, z);
    zSum += z;
    qDenSum += qDen;
    qPhatSum += qPhat;
    qXaSum += qXa;
    totalGeneration += aMwh;

    rows.push({
      id: `row_${i}`,
      timestamp: cur.toISOString(),
      date: cur.toLocaleDateString('vi-VN'),
      time: cur.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      z_ho: Number(z.toFixed(2)),
      v_ho: Number(v.toFixed(3)),
      z_hl: Number(zHl.toFixed(2)),
      q_den: Number(qDen.toFixed(2)),
      q_h1: Number(qH1.toFixed(2)),
      q_h2: Number(qH2.toFixed(2)),
      q_phat_tong: Number(qPhat.toFixed(2)),
      q_tran: qTran,
      q_xtt: qXtt,
      q_xa_tong: Number(qXa.toFixed(2)),
      p_mw: Number(pMw.toFixed(2)),
      a_mwh: Number(aMwh.toFixed(2)),
      rain_24h: rain,
    });
  }

  const count = rows.length || 1;
  const summary: DataTableSummary = {
    recordCount: rows.length,
    z_ho_max: Number(zMax.toFixed(2)),
    z_ho_min: Number(zMin.toFixed(2)),
    z_ho_avg: Number((zSum / count).toFixed(2)),
    q_den_avg: Number((qDenSum / count).toFixed(2)),
    q_den_max: 14.5,
    q_phat_avg: Number((qPhatSum / count).toFixed(2)),
    q_xa_avg: Number((qXaSum / count).toFixed(2)),
    total_water_inflow_m3: Number(((qDenSum / count) * 86400).toFixed(0)),
    total_water_outflow_m3: Number(((qXaSum / count) * 86400).toFixed(0)),
    total_generation_mwh: Number(totalGeneration.toFixed(1)),
  };

  return { rows, summary };
}

function generateMockSensorSeries(params: {
  from: string;
  to: string;
  codes: string[];
  interval?: number;
}): SensorSeriesResponse {
  const rows: Array<{ t: string; [k: string]: any }> = [];
  const start = new Date(params.from || new Date().toISOString().slice(0, 10));
  const stepMinutes = params.interval || 60;
  const points = 24;

  for (let i = 0; i < points; i++) {
    const cur = new Date(start.getTime() + i * stepMinutes * 60 * 1000);
    const timeStr = `${cur.toLocaleDateString('vi-VN')} ${cur.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;

    const rowObj: any = { t: timeStr };
    for (const code of params.codes) {
      if (code.includes('Z_') || code.includes('MucNuoc')) {
        rowObj[code] = Number((945.8 + Math.sin(i / 4) * 0.25).toFixed(2));
      } else if (code.includes('Q_') || code.includes('LuuLuong')) {
        rowObj[code] = Number((12.0 + Math.cos(i / 3) * 2.0).toFixed(2));
      } else if (code.includes('Mua') || code.includes('RAIN')) {
        rowObj[code] = i === 12 ? 4.5 : i === 13 ? 2.0 : 0.0;
      } else if (code.includes('P_') || code.includes('CongSuat')) {
        rowObj[code] = Number((9.2 + Math.sin(i / 5) * 1.5).toFixed(2));
      } else {
        rowObj[code] = Number((10 + Math.sin(i) * 3).toFixed(2));
      }
    }
    rows.push(rowObj);
  }

  return {
    cols: params.codes,
    rows,
    page: 1,
    page_size: 50,
    total: rows.length,
    pages: 1,
  };
}
