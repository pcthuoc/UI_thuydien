import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';

interface LuckysheetGridProps {
  id?: string;
  sheets: any[];
  title?: string;
  isLoading?: boolean;
  emptyText?: string;
  height?: string | number;
}

export function LuckysheetGrid({
  id = 'luckysheet-container',
  sheets,
  title = 'Báo cáo',
  isLoading = false,
  emptyText = 'Chưa có dữ liệu bảng tính',
  height = '620px',
}: LuckysheetGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    // Check if Luckysheet is loaded globally
    if (!window.luckysheet) {
      console.warn('Luckysheet script not loaded yet.');
      return;
    }

    if (!sheets || sheets.length === 0) {
      if (window.luckysheet && isRendered) {
        try {
          window.luckysheet.destroy();
        } catch {
          // ignore
        }
        setIsRendered(false);
      }
      return;
    }

    // Delay 1 animation frame for container DOM measurement
    const rafId = requestAnimationFrame(() => {
      if (window.luckysheet) {
        try {
          window.luckysheet.destroy();
        } catch {
          // ignore
        }
        try {
          window.luckysheet.create({
            container: id,
            title,
            lang: 'en',
            showinfobar: false,
            showtoolbar: true,
            showsheetbar: true,
            showstatisticBar: false,
            sheetFormulaBar: true,
            enableAddRow: false,
            enableAddBackTop: false,
            allowCopy: true,
            allowEdit: true,
            zoomRatio: 1,
            data: sheets,
          });
          setIsRendered(true);
        } catch (err) {
          console.error('Luckysheet init error:', err);
        }
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (window.luckysheet) {
        try {
          window.luckysheet.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [sheets, id, title]);

  const hasData = Boolean(sheets && sheets.length > 0);

  return (
    <div
      className="relative w-full rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950"
      style={{ height: typeof height === 'number' ? `${height}px` : height, minHeight: '480px' }}
    >
      {/* Loading state overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-30 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 text-xs text-slate-600 dark:text-zinc-300">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <span className="font-semibold">Đang nạp dữ liệu bảng tính Excel...</span>
        </div>
      )}

      {/* Empty placeholder */}
      {!isLoading && !hasData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-zinc-500 p-8 text-center bg-slate-50/50 dark:bg-zinc-950/50">
          <FileSpreadsheet className="w-12 h-12 stroke-[1.2] text-slate-300 dark:text-zinc-700" />
          <span className="font-bold text-sm text-slate-600 dark:text-zinc-400">{emptyText}</span>
          <span className="text-xs text-slate-400 dark:text-zinc-500">
            Vui lòng chọn dải thời gian và nhấn &quot;Tải dữ liệu&quot; để kết xuất biểu mẫu.
          </span>
        </div>
      )}

      {/* Luckysheet Container */}
      <div
        id={id}
        ref={containerRef}
        className="w-full h-full"
        style={{ display: hasData && !isLoading ? 'block' : 'none' }}
      />
    </div>
  );
}
