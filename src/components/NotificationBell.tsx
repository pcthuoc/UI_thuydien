import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell, BellRing, CheckCheck, Info, CheckCircle2, AlertTriangle,
  AlertOctagon, X, ChevronRight, Loader2,
} from 'lucide-react';
import { api, type SystemNotification } from '../api/client';

// ─── Helpers ────────────────────────────────────────────────────────────────

const LEVEL_META: Record<
  SystemNotification['level'],
  { icon: React.ElementType; colorBg: string; colorIcon: string; colorText: string }
> = {
  info:    { icon: Info,          colorBg: 'bg-blue-100 dark:bg-blue-500/15',   colorIcon: 'text-blue-600 dark:text-blue-400',   colorText: 'text-blue-700 dark:text-blue-300' },
  success: { icon: CheckCircle2,  colorBg: 'bg-emerald-100 dark:bg-emerald-500/15', colorIcon: 'text-emerald-600 dark:text-emerald-400', colorText: 'text-emerald-700 dark:text-emerald-300' },
  warning: { icon: AlertTriangle, colorBg: 'bg-amber-100 dark:bg-amber-500/15',  colorIcon: 'text-amber-600 dark:text-amber-400',  colorText: 'text-amber-700 dark:text-amber-300' },
  danger:  { icon: AlertOctagon,  colorBg: 'bg-rose-100 dark:bg-red-500/15',    colorIcon: 'text-rose-600 dark:text-red-400',    colorText: 'text-rose-700 dark:text-red-300' },
};

// ─── NotificationBell ────────────────────────────────────────────────────────

interface NotificationBellProps {
  /** compact: icon chỉ, expanded: có text label */
  mode?: 'icon-only' | 'expanded';
}

export function NotificationBell({ mode = 'icon-only' }: NotificationBellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // ── Polling unread count mỗi 60s ──
  const { data } = useQuery({
    queryKey: ['system-notifications-unread'],
    queryFn: () => api.getSystemNotificationUnreadCount(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const unreadCount = data?.unread_count ?? 0;
  const latest = data?.latest ?? [];

  // ── Mutation: mark all read ──
  const markAllMutation = useMutation({
    mutationFn: () => api.markAllSystemNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-notifications-unread'] });
      queryClient.invalidateQueries({ queryKey: ['system-notifications'] });
    },
  });

  // ── Mutation: mark 1 read ──
  const markOneMutation = useMutation({
    mutationFn: (id: number) => api.markSystemNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-notifications-unread'] });
      queryClient.invalidateQueries({ queryKey: ['system-notifications'] });
    },
  });

  // ── Close on outside click ──
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
      buttonRef.current && !buttonRef.current.contains(e.target as Node)
    ) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, handleClickOutside]);

  const handleBellClick = () => setOpen((v) => !v);

  const handleNotifClick = (n: SystemNotification) => {
    if (!n.is_read) markOneMutation.mutate(n.id);
    setOpen(false);
    navigate('/notifications');
  };

  const handleMarkAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllMutation.mutate();
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate('/notifications');
  };

  const hasUnread = unreadCount > 0;

  return (
    <div className="relative">
      {/* ── Bell Button ── */}
      <button
        ref={buttonRef}
        id="notification-bell-btn"
        onClick={handleBellClick}
        aria-label={`Thông báo${hasUnread ? ` (${unreadCount} chưa đọc)` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        className={`relative flex items-center gap-2 rounded-xl transition-all duration-200 ${
          mode === 'expanded'
            ? 'w-full px-3.5 py-2.5 font-semibold text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-950 dark:hover:text-white'
            : 'p-2 text-slate-400 hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition'
        } ${open ? 'bg-slate-100 dark:bg-zinc-800 text-white' : ''}`}
      >
        {/* Icon */}
        <div className="relative w-5 h-5 flex items-center justify-center flex-shrink-0">
          {hasUnread ? (
            <BellRing className="w-5 h-5 animate-[wiggle_1s_ease-in-out_1]" />
          ) : (
            <Bell className="w-5 h-5" />
          )}
          {/* Badge */}
          {hasUnread && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold rounded-full bg-red-500 text-white animate-[pop-in_0.2s_ease-out]"
              aria-hidden="true"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        {mode === 'expanded' && <span>Thông báo</span>}
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div
          ref={dropdownRef}
          role="dialog"
          aria-label="Thông báo"
          className="absolute z-[100] bottom-full left-0 mb-2 w-80 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden"
          style={{ minWidth: '20rem' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Thông báo hệ thống</h3>
              {hasUnread && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400">
                  {unreadCount} mới
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {hasUnread && (
                <button
                  onClick={handleMarkAll}
                  disabled={markAllMutation.isPending}
                  title="Đánh dấu tất cả đã đọc"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
                >
                  {markAllMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-72 overflow-y-auto">
            {latest.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400 dark:text-zinc-500">
                <Bell className="w-8 h-8 opacity-40" />
                <p className="text-xs font-medium">Không có thông báo mới</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                {latest.map((n: SystemNotification) => {
                  const meta = LEVEL_META[n.level as SystemNotification['level']] ?? LEVEL_META.info;
                  const LevelIcon = meta.icon;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => handleNotifClick(n)}
                        className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/60 ${
                          !n.is_read ? 'bg-blue-50/40 dark:bg-blue-500/5' : ''
                        }`}
                      >
                        {/* Level icon */}
                        <div className={`w-8 h-8 rounded-full ${meta.colorBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <LevelIcon className={`w-4 h-4 ${meta.colorIcon}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs font-semibold truncate ${!n.is_read ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-zinc-400'}`}>
                              {n.title}
                            </p>
                            {!n.is_read && (
                              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                          <p className={`text-[10px] mt-1 ${meta.colorText}`}>
                            {n.station_name ? `${n.station_name} · ` : ''}{n.time_ago}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 dark:border-zinc-800">
            <button
              onClick={handleViewAll}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
            >
              Xem tất cả thông báo
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
