/**
 * luckysheetBuilder.ts — Bộ công cụ khởi tạo dữ liệu bảng tính Luckysheet & SheetJS
 * Chuẩn hóa theo biểu mẫu thủy điện và API Backend (/api/reports/data/)
 */

// Global window typing for Luckysheet & SheetJS
declare global {
  interface Window {
    luckysheet?: any;
    XLSX?: any;
  }
}

// ── Định dạng Cell của Luckysheet ─────────────────────────────────
export function hdrCell(v: any) {
  return {
    v: v ?? '',
    m: String(v ?? ''),
    ct: { fa: '@', t: 's' },
    bl: 1,
    bg: '#ffffff',
    fc: '#000000',
    ht: 0,
    vt: 0,
    ff: 1, // Arial
  };
}

export function numCell(v: any, extraProps?: Record<string, any>) {
  if (v === null || v === undefined || v === '') {
    return { v: '', m: '', ht: 0, vt: 0, ff: 1, ...(extraProps || {}) };
  }
  const num = typeof v === 'number' ? v : parseFloat(v);
  if (isNaN(num)) {
    return { v: String(v), m: String(v), ct: { fa: '@', t: 's' }, ht: 0, vt: 0, ff: 1, ...(extraProps || {}) };
  }
  return {
    v: num,
    m: num.toFixed(2),
    ct: { fa: '0.00', t: 'n' },
    ht: 0,
    vt: 0,
    ff: 1,
    ...(extraProps || {}),
  };
}

export function strCell(v: any, extraProps?: Record<string, any>) {
  return {
    v: v ?? '',
    m: String(v ?? ''),
    ct: { fa: '@', t: 's' },
    ht: 0,
    vt: 0,
    ff: 1,
    ...(extraProps || {}),
  };
}

export function autoColWidth(title: string) {
  return Math.max(100, (title || '').length * 10 + 20);
}

// ── 27 Cột Operation Data (NSMO Phát điện & Bảng dữ liệu) ───────────
export const OP_COLS = [
  { key: 'ThoiGian', title: 'Thời gian', width: 85 },
  { key: 'LuongMua', title: 'Lượng mưa', width: 80 },
  { key: 'Qv_HC', title: 'Qv-HC (m³/s)', width: 95 },
  { key: 'Qv_tbt_HC', title: 'Qv tbt-HC', width: 85 },
  { key: 'Qv_DB_HC', title: 'Qv DB-HC', width: 85 },
  { key: 'Qv_HL', title: 'Qv-HL (m³/s)', width: 95 },
  { key: 'Qv_tbt_HL', title: 'Qv tbt-HL', width: 85 },
  { key: 'Qv_DB_HL', title: 'Qv DB-HL', width: 85 },
  { key: 'Z_HC', title: 'Z-HC (m)', width: 85 },
  { key: 'Z_DB_HC', title: 'Z DB-HC', width: 85 },
  { key: 'V_HC', title: 'V-HC (m³)', width: 90 },
  { key: 'Z_HL', title: 'Z-HL (m)', width: 85 },
  { key: 'Z_DB_HL', title: 'Z DB-HL', width: 85 },
  { key: 'V_HL', title: 'V-HL (m³)', width: 90 },
  { key: 'H1', title: 'H1 (m)', width: 75 },
  { key: 'Q_H1', title: 'Q-H1 (m³/s)', width: 95 },
  { key: 'H2', title: 'H2 (m)', width: 75 },
  { key: 'Q_H2', title: 'Q-H2 (m³/s)', width: 95 },
  { key: 'A_XTT', title: 'XTT (m)', width: 75 },
  { key: 'Q_XTT', title: 'Q-XTT', width: 80 },
  { key: 'Q_tran_td', title: 'Tràn TD', width: 80 },
  { key: 'QTT', title: 'QTT (m³/s)', width: 90 },
  { key: 'Q_phat', title: '∑Q phát', width: 85 },
  { key: 'Q_xa_HC', title: 'HC (m³/s)', width: 85 },
  { key: 'Q_xa_HL', title: 'HL (m³/s)', width: 85 },
  { key: 'Q_ra_HC', title: 'HC (m³/s)', width: 85 },
  { key: 'Q_ra_HL', title: 'HL (m³/s)', width: 85 },
];

export const OP_ROW0_GROUPS = [
  { c: 2, cs: 6, label: 'Lưu lượng vào và dự báo 1h' },
  { c: 8, cs: 6, label: 'Mực nước - Dung tích' },
  { c: 14, cs: 4, label: 'Tổ máy' },
  { c: 18, cs: 2, label: 'Cửa van' },
  { c: 23, cs: 2, label: '∑Q xả đập' },
  { c: 25, cs: 2, label: '∑Q ra' },
];

export const OP_SINGLE_SPAN = new Set([0, 1, 20, 21, 22]);

// ── 10 Cột Tổ máy H1 / H2 ──────────────────────────────────────────
export const H_COLS = [
  { key: 'BatDau', title: 'Bắt đầu', width: 80 },
  { key: 'KetThuc', title: 'Kết thúc', width: 80 },
  { key: 'ChuKy', title: 'Chu kỳ', width: 75 },
  { key: 'TThai_xa', title: 'T.Thái Xả', width: 85 },
  { key: 'Qxa', title: 'Qxả (m³/s)', width: 95 },
  { key: 'Qve', title: 'Qvề (m³/s)', width: 95 },
  { key: 'Qmay', title: 'Qmáy (m³/s)', width: 95 },
  { key: 'CS_thuc', title: 'CS Thực phát (MW)', width: 130 },
  { key: 'CS_kha', title: 'CS Khả phát (MW)', width: 130 },
  { key: 'MN_cuoi', title: 'MN cuối (m)', width: 95 },
];

// ── Cấu hình các mẫu báo cáo chuẩn ────────────────────────────────
export const REPORT_CONFIGS: Record<string, { title: string; columns: Array<{ key: string; title: string; width?: number }> }> = {
  nsmo_vanhanh: {
    title: 'Báo cáo Vận hành Thủy điện (NSMO / A0)',
    columns: [
      { key: 'Ngay', title: 'Ngày', width: 110 },
      { key: 'Gio', title: 'Giờ', width: 60 },
      { key: 'MucNuocHo', title: 'Mực nước hồ (m)', width: 130 },
      { key: 'LuuLuongDenHo', title: 'Lưu lượng đến hồ (m³/s)', width: 160 },
      { key: 'TongLuuLuongXa', title: 'Tổng lưu lượng xả (m³/s)', width: 165 },
      { key: 'LuuLuongQuaNhaMay', title: 'LL qua nhà máy (m³/s)', width: 160 },
      { key: 'LuuLuongQuaCuaTran', title: 'LL qua cửa tràn (m³/s)', width: 160 },
      { key: 'SoGioPhatDien', title: 'Số giờ phát điện (h)', width: 140 },
      { key: 'GhiChu', title: 'Ghi chú', width: 180 },
    ],
  },
  khai_thac_nuoc_mat: {
    title: 'Báo cáo Tình hình Khai thác Nước mặt (TT17)',
    columns: [
      { key: 'Ngay', title: 'Ngày', width: 110 },
      { key: 'Gio', title: 'Giờ', width: 60 },
      { key: 'MucNuocHo', title: 'Mực nước hồ (m)', width: 140 },
      { key: 'LuuLuongXa', title: 'Lưu lượng xả (m³/s)', width: 155 },
      { key: 'TheTichHo', title: 'Thể tích hồ (10⁶m³)', width: 155 },
      { key: 'LuongMua', title: 'Lượng mưa (mm)', width: 125 },
      { key: 'GhiChu', title: 'Ghi chú', width: 210 },
    ],
  },
  tt47_mua: {
    title: 'Báo cáo Lượng mưa Lưu vực (TT47)',
    columns: [
      { key: 'Ngay', title: 'Ngày', width: 110 },
      { key: 'Gio', title: 'Giờ', width: 60 },
      { key: 'Tram1_Mua', title: 'Trạm Đập Dâng (mm)', width: 150 },
      { key: 'Tram2_Mua', title: 'Trạm Nhà Máy (mm)', width: 150 },
      { key: 'Tram3_Mua', title: 'Trạm Thượng Nguồn (mm)', width: 160 },
      { key: 'Mua_LuyKe', title: 'Mưa lũy kế ngày (mm)', width: 160 },
      { key: 'GhiChu', title: 'Ghi chú', width: 180 },
    ],
  },
};

// ── Builder: Operation Sheet (27 Cột có Merged Headers) ────────────
export function buildOperationSheet(sheetTitle: string, opRows: any[], idx: number = 0) {
  const NCOLS = 27;
  const cd: any[] = [];

  // Row 0: Group labels + single-span labels
  OP_ROW0_GROUPS.forEach(({ c, label }) => cd.push({ r: 0, c, v: hdrCell(label) }));
  OP_SINGLE_SPAN.forEach((c) => cd.push({ r: 0, c, v: hdrCell(OP_COLS[c].title) }));

  // Row 1: Sub-column headers
  OP_COLS.forEach((col, c) => {
    if (!OP_SINGLE_SPAN.has(c)) cd.push({ r: 1, c, v: hdrCell(col.title) });
  });

  // Data rows start at row 2
  opRows.forEach((row, ri) => {
    const r = ri + 2;
    OP_COLS.forEach((col, c) => {
      const val = row[col.key];
      cd.push({ r, c, v: c === 0 ? strCell(val) : numCell(val) });
    });
  });

  const lastDataRow = Math.max(2, opRows.length + 1);

  // Merge config
  const merge: Record<string, any> = {};
  OP_SINGLE_SPAN.forEach((c) => {
    merge[`0_${c}`] = { r: 0, c, rs: 2, cs: 1 };
  });
  OP_ROW0_GROUPS.forEach(({ c, cs }) => {
    merge[`0_${c}`] = { r: 0, c, rs: 1, cs };
  });

  const columnlen: Record<number, number> = {};
  OP_COLS.forEach((col, c) => {
    columnlen[c] = col.width;
  });

  const borderInfo = [
    {
      rangeType: 'range',
      borderType: 'border-all',
      style: '1',
      color: '#000000',
      range: [{ row: [0, lastDataRow], column: [0, NCOLS - 1] }],
    },
  ];

  return {
    name: sheetTitle || 'Operation data',
    color: '',
    status: idx === 0 ? 1 : 0,
    order: String(idx),
    hide: 0,
    row: lastDataRow + 5,
    column: NCOLS,
    defaultRowHeight: 24,
    defaultColWidth: 85,
    celldata: cd,
    config: { columnlen, borderInfo, merge },
    scrollLeft: 0,
    scrollTop: 0,
    luckysheet_select_save: [{ row: [2, 2], column: [0, 0] }],
  };
}

// ── Builder: Tổ Máy Sheet (H1 / H2) ───────────────────────────────
export function buildHSheet(sheetName: string, hRows: any[], idx: number = 1) {
  const cd: any[] = [];
  H_COLS.forEach((col, c) => cd.push({ r: 0, c, v: hdrCell(col.title) }));

  hRows.forEach((row, ri) => {
    const r = ri + 1;
    H_COLS.forEach((col, c) => {
      const val = row[col.key];
      const isStr = col.key === 'BatDau' || col.key === 'KetThuc' || col.key === 'TThai_xa';
      const isInt = col.key === 'ChuKy';
      if (isStr) {
        cd.push({ r, c, v: strCell(val) });
      } else if (isInt) {
        cd.push({ r, c, v: { v: val ?? '', m: val != null ? String(val) : '', ct: { fa: '0', t: 'n' }, ht: 0, vt: 0, ff: 1 } });
      } else {
        cd.push({ r, c, v: numCell(val) });
      }
    });
  });

  const lastRow = Math.max(1, hRows.length);
  const columnlen: Record<number, number> = {};
  H_COLS.forEach((col, c) => {
    columnlen[c] = col.width;
  });

  const borderInfo = [
    {
      rangeType: 'range',
      borderType: 'border-all',
      style: '1',
      color: '#000000',
      range: [{ row: [0, lastRow], column: [0, H_COLS.length - 1] }],
    },
  ];

  return {
    name: sheetName,
    color: '',
    status: 0,
    order: String(idx),
    hide: 0,
    row: lastRow + 5,
    column: H_COLS.length,
    defaultRowHeight: 24,
    defaultColWidth: 85,
    celldata: cd,
    config: { columnlen, borderInfo },
    scrollLeft: 0,
    scrollTop: 0,
    luckysheet_select_save: [{ row: [1, 1], column: [0, 0] }],
  };
}

// ── Builder: Báo Cáo Theo Ngày (Legal Daily Sheet) ────────────────
export function buildLegalDailySheet(
  name: string,
  cols: Array<{ key: string; title: string; width?: number }>,
  rows: any[],
  avgRow: Record<string, any> | undefined,
  idx: number = 0
) {
  const cd: any[] = [];
  cols.forEach((col, c) => cd.push({ r: 0, c, v: hdrCell(col.title) }));

  rows.forEach((row, ri) => {
    const r = ri + 1;
    cols.forEach((col, c) => {
      const val = row[col.key];
      if (col.key === 'Ngay' || col.key === 'GhiChu') {
        cd.push({ r, c, v: strCell(val) });
      } else if (col.key === 'Gio') {
        cd.push({ r, c, v: { v: val ?? '', m: String(val ?? ''), ct: { fa: '0', t: 'n' }, ht: 0, vt: 0, ff: 1 } });
      } else {
        cd.push({ r, c, v: numCell(val) });
      }
    });
  });

  const tbR = rows.length + 1;
  cols.forEach((col, c) => {
    if (c === 0) {
      cd.push({ r: tbR, c: 0, v: { v: 'TB', m: 'TB', ct: { fa: '@', t: 's' }, bl: 1, ht: 0, vt: 0, ff: 1 } });
    } else if (col.key === 'Gio' || col.key === 'GhiChu') {
      cd.push({ r: tbR, c, v: strCell('', { bl: 1 }) });
    } else {
      cd.push({ r: tbR, c, v: numCell(avgRow ? avgRow[col.key] : null, { bl: 1 }) });
    }
  });

  const columnlen: Record<number, number> = {};
  cols.forEach((col, c) => {
    columnlen[c] = col.width || autoColWidth(col.title);
  });

  const borderInfo = [
    {
      rangeType: 'range',
      borderType: 'border-all',
      style: '1',
      color: '#000000',
      range: [{ row: [0, tbR], column: [0, cols.length - 1] }],
    },
  ];

  return {
    name,
    color: '',
    status: idx === 0 ? 1 : 0,
    order: String(idx),
    hide: 0,
    row: tbR + 3,
    column: cols.length,
    defaultRowHeight: 24,
    defaultColWidth: 90,
    celldata: cd,
    config: { columnlen, borderInfo },
    scrollLeft: 0,
    scrollTop: 0,
    luckysheet_select_save: [{ row: [1, 1], column: [0, 0] }],
  };
}

// ── SheetJS Excel Workbook Exporter ───────────────────────────────
export function exportLuckysheetToXlsx(filename: string) {
  if (!window.luckysheet || !window.XLSX) {
    console.error('Luckysheet or SheetJS not loaded');
    return;
  }

  const sheets = window.luckysheet.getAllSheets();
  const wb = window.XLSX.utils.book_new();

  sheets.forEach((sheet: any) => {
    const celldata = sheet.celldata || [];
    let maxR = 0,
      maxC = 0;
    celldata.forEach(({ r, c }: any) => {
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    });

    const aoa = Array.from({ length: maxR + 1 }, () => Array(maxC + 1).fill(''));
    celldata.forEach(({ r, c, v }: any) => {
      if (v && v.v !== undefined && v.v !== null) aoa[r][c] = v.v;
    });

    const ws = window.XLSX.utils.aoa_to_sheet(aoa);

    if (sheet.config && sheet.config.columnlen) {
      const colWidths: any[] = [];
      Object.entries(sheet.config.columnlen).forEach(([ci, w]: [string, any]) => {
        colWidths[Number(ci)] = { wch: Math.round(Number(w) / 7) };
      });
      if (colWidths.length) ws['!cols'] = colWidths;
    }

    window.XLSX.utils.book_append_sheet(wb, ws, sheet.name || 'Sheet');
  });

  window.XLSX.writeFile(wb, `${filename}.xlsx`);
}
