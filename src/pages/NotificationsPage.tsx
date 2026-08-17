import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Bell, CheckCircle2, Loader2, Mail, Save, Info, AlertTriangle,
  AlertOctagon, CheckCheck, RefreshCw, ChevronLeft, ChevronRight,
  Filter,
} from 'lucide-react';
import { api, type SystemNotification } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/Button';
import { Card, CardContent, CardHeader } from '../components/Card';

// ─── Level display helpers ──────────────────────────────────────────────────

const LEVEL_META: Record<
  SystemNotification['level'],
  {
    icon: React.ElementType;
    colorBg: string;
    colorIcon: string;
    colorBadge: string;
    label: string;
  }
> = {
  info: {
    icon: Info,
    colorBg: 'bg-blue-50 dark:bg-blue-500/15',
    colorIcon: 'text-blue-600 dark:text-blue-400',
    colorBadge: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
    label: 'Thông tin',
  },
  success: {
    icon: CheckCircle2,
    colorBg: 'bg-emerald-50 dark:bg-emerald-500/15',
    colorIcon: 'text-emerald-600 dark:text-emerald-400',
    colorBadge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
    label: 'Thành công',
  },
  warning: {
    icon: AlertTriangle,
    colorBg: 'bg-amber-50 dark:bg-amber-500/15',
    colorIcon: 'text-amber-600 dark:text-amber-400',
    colorBadge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
    label: 'Cảnh báo',
  },
  danger: {
    icon: AlertOctagon,
    colorBg: 'bg-rose-50 dark:bg-red-500/15',
    colorIcon: 'text-rose-600 dark:text-red-400',
    colorBadge: 'bg-rose-100 text-rose-800 dark:bg-red-500/20 dark:text-red-300',
    label: 'Nghiêm trọng',
  },
};

// ─── NotificationsPage ───────────────────────────────────────────────────────

export function NotificationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<'system' | 'email'>('system');

  // ── System notifications filter/pagination ──
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const PAGE_SIZE = 15;

  // ── Email prefs state ──
  const [notifyPrintStart, setNotifyPrintStart] = useState(true);
  const [notifyPrintComplete, setNotifyPrintComplete] = useState(true);
  const [notifyPrintFailed, setNotifyPrintFailed] = useState(true);
  const [notifyPrintStopped, setNotifyPrintStopped] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  // ── Queries: feature gate checks ──
  const { data: advancedAuthStatus, isLoading: isAdvancedAuthLoading } = useQuery({
    queryKey: ['advancedAuthStatus'],
    queryFn: api.getAdvancedAuthStatus,
    staleTime: 5 * 60 * 1000,
  });

  const { data: settings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
    staleTime: 5 * 60 * 1000,
  });

  // ── Query: System notifications ──
  const {
    data: notifData,
    isLoading: isNotifLoading,
    isFetching: isNotifFetching,
    refetch: refetchNotifs,
  } = useQuery({
    queryKey: ['system-notifications', page, unreadOnly],
    queryFn: () => api.getSystemNotifications({ page, page_size: PAGE_SIZE, unread_only: unreadOnly }),
    staleTime: 30_000,
  });

  // ── Query: Email preferences ──
  const { data: preferences, isLoading: isPrefsLoading } = useQuery({
    queryKey: ['user-email-preferences'],
    queryFn: () => api.getUserEmailPreferences(),
  });

  // Populate email form
  useEffect(() => {
    if (preferences) {
      setNotifyPrintStart(preferences.notify_print_start);
      setNotifyPrintComplete(preferences.notify_print_complete);
      setNotifyPrintFailed(preferences.notify_print_failed);
      setNotifyPrintStopped(preferences.notify_print_stopped);
      setIsDirty(false);
    }
  }, [preferences]);

  // ── Mutations ──
  const markOneMutation = useMutation({
    mutationFn: (id: number) => api.markSystemNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['system-notifications-unread'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.markAllSystemNotificationsRead(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['system-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['system-notifications-unread'] });
      showToast(`Đã đánh dấu ${res.marked_count} thông báo đã đọc`, 'success');
    },
    onError: () => showToast('Không thể đánh dấu tất cả đã đọc', 'error'),
  });

  const saveEmailMutation = useMutation({
    mutationFn: () =>
      api.updateUserEmailPreferences({
        notify_print_start: notifyPrintStart,
        notify_print_complete: notifyPrintComplete,
        notify_print_failed: notifyPrintFailed,
        notify_print_stopped: notifyPrintStopped,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-email-preferences'] });
      setIsDirty(false);
      showToast(t('notifications.userEmail.saveSuccess'), 'success');
    },
    onError: (err: Error) => {
      showToast(err.message || t('notifications.userEmail.saveError'), 'error');
    },
  });

  const handleEmailToggle = (
    setter: React.Dispatch<React.SetStateAction<boolean>>,
    value: boolean,
  ) => {
    setter(!value);
    setIsDirty(true);
  };

  // Reset to page 1 when filter changes
  useEffect(() => { setPage(1); }, [unreadOnly]);

  const notifications = notifData?.notifications ?? [];
  const totalPages = notifData?.total_pages ?? 1;
  const unreadCount = notifData?.unread_count ?? 0;
  const total = notifData?.total ?? 0;

  const isLoading = isAdvancedAuthLoading || isSettingsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-bambu-green" />
      </div>
    );
  }

  // ─── TAB: System Notifications ──────────────────────────────────────────

  function SystemNotificationsTab() {
    return (
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Unread filter toggle */}
            <button
              onClick={() => setUnreadOnly((v) => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                unreadOnly
                  ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-500/15 dark:border-blue-500/40 dark:text-blue-400 font-semibold'
                  : 'bg-white dark:bg-zinc-800/60 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:border-bambu-green hover:text-slate-900 dark:hover:text-white shadow-2xs'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Chưa đọc
              {unreadOnly && unreadCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Refresh */}
            <button
              onClick={() => refetchNotifs()}
              disabled={isNotifFetching}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/60 text-slate-600 dark:text-zinc-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-zinc-700 transition shadow-2xs"
              title="Làm mới"
            >
              <RefreshCw className={`w-4 h-4 ${isNotifFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Mark all read */}
          {unreadCount > 0 && (
            <button
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition shadow-2xs"
            >
              {markAllMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCheck className="w-3.5 h-3.5" />
              )}
              Đánh dấu tất cả đã đọc
            </button>
          )}
        </div>

        {/* List */}
        {isNotifLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-bambu-green" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 dark:text-zinc-500 bg-white dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800 p-8 shadow-2xs">
            <Bell className="w-12 h-12 opacity-30" />
            <p className="font-medium text-slate-600 dark:text-zinc-400">
              {unreadOnly ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
            </p>
            {unreadOnly && (
              <button
                onClick={() => setUnreadOnly(false)}
                className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Xem tất cả thông báo
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {notifications.map((n: SystemNotification) => {
              const meta = LEVEL_META[n.level] ?? LEVEL_META.info;
              const LevelIcon = meta.icon;
              return (
                <div
                  key={n.id}
                  className={`relative flex items-start gap-4 p-4 rounded-xl border transition-all shadow-2xs ${
                    !n.is_read
                      ? 'border-blue-300 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/10 hover:bg-blue-50 dark:hover:bg-blue-500/15'
                      : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  {/* Unread dot */}
                  {!n.is_read && (
                    <span className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 ring-4 ring-blue-100 dark:ring-blue-500/20" />
                  )}

                  {/* Level icon */}
                  <div className={`w-10 h-10 rounded-full ${meta.colorBg} flex items-center justify-center flex-shrink-0 mt-0.5 border border-black/5 dark:border-white/5`}>
                    <LevelIcon className={`w-5 h-5 ${meta.colorIcon}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={`text-sm ${!n.is_read ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-700 dark:text-zinc-300 font-medium'}`}>
                          {n.title}
                        </h4>
                        <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${meta.colorBadge}`}>
                          {meta.label}
                        </span>
                        {n.station_name && (
                          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 font-medium">
                            {n.station_name}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap">{n.time_ago}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1.5 leading-relaxed">{n.message}</p>
                  </div>

                  {/* Mark read button */}
                  {!n.is_read && (
                    <button
                      onClick={() => markOneMutation.mutate(n.id)}
                      disabled={markOneMutation.isPending}
                      title="Đánh dấu đã đọc"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition flex-shrink-0 mt-0.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 px-1">
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
              Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total} thông báo
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-700 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 px-2">
                Trang {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-700 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── TAB: Email Preferences ──────────────────────────────────────────────

  const showEmailTab =
    advancedAuthStatus?.advanced_auth_enabled && settings?.user_notifications_enabled;

  function EmailPreferencesTab() {
    if (!showEmailTab) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 dark:text-zinc-400 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-8">
          <Mail className="w-12 h-12 opacity-30 text-slate-400" />
          <p className="font-semibold text-slate-800 dark:text-zinc-200">Thông báo email không được bật</p>
          <p className="text-sm text-slate-500 dark:text-zinc-400 max-w-md">
            Quản trị viên cần bật xác thực nâng cao và tính năng thông báo người dùng trong cài đặt hệ thống.
          </p>
        </div>
      );
    }

    if (isPrefsLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-bambu-green" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Info card */}
        <Card className="border-blue-200 bg-blue-50/70 dark:border-blue-500/30 dark:bg-blue-500/5 shadow-2xs">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-500/20 flex-shrink-0">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold">{t('notifications.userEmail.emailNotifications')}</h3>
                <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
                  {t('notifications.userEmail.emailNotificationsDesc')}
                </p>
                {user?.email ? (
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-2 font-medium">
                    {t('notifications.userEmail.sendingTo')}: <strong>{user.email}</strong>
                  </p>
                ) : (
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-2 font-medium">
                    {t('notifications.userEmail.noEmailWarning')}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preferences card */}
        <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
          <CardHeader>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('notifications.userEmail.printJobNotifications')}</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{t('notifications.userEmail.printJobNotificationsDesc')}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: t('notifications.userEmail.printJobStarts'), desc: t('notifications.userEmail.printJobStartsDesc'), value: notifyPrintStart, setter: setNotifyPrintStart },
              { label: t('notifications.userEmail.printJobFinishes'), desc: t('notifications.userEmail.printJobFinishesDesc'), value: notifyPrintComplete, setter: setNotifyPrintComplete },
              { label: t('notifications.userEmail.printErrors'), desc: t('notifications.userEmail.printErrorsDesc'), value: notifyPrintFailed, setter: setNotifyPrintFailed },
              { label: t('notifications.userEmail.printJobStops'), desc: t('notifications.userEmail.printJobStopsDesc'), value: notifyPrintStopped, setter: setNotifyPrintStopped },
            ].map(({ label, desc, value, setter }) => (
              <div key={label} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-100 dark:border-zinc-700/50">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${value ? 'bg-emerald-100 text-emerald-600 dark:bg-bambu-green/20 dark:text-bambu-green' : 'bg-slate-200 text-slate-400 dark:bg-zinc-700 dark:text-zinc-400'}`}>
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-slate-900 dark:text-white font-semibold">{label}</p>
                    <p className="text-sm text-slate-500 dark:text-zinc-400">{desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleEmailToggle(setter, value)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-bambu-green focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
                    value ? 'bg-bambu-green' : 'bg-slate-300 dark:bg-zinc-700'
                  }`}
                  role="switch"
                  aria-checked={value}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-xs ${
                      value ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button
            onClick={() => saveEmailMutation.mutate()}
            disabled={!isDirty || saveEmailMutation.isPending || !user?.email}
          >
            {saveEmailMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t('common.save')}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-500/20 shadow-2xs">
          <Bell className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Thông báo</h1>
          {unreadCount > 0 ? (
            <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold">{unreadCount} thông báo chưa đọc</p>
          ) : (
            <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">Hệ thống thông báo và cảnh báo</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-xl mb-6 w-fit border border-slate-200/80 dark:border-zinc-700/60 shadow-2xs">
        <button
          onClick={() => setActiveTab('system')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'system'
              ? 'bg-white text-slate-900 dark:bg-zinc-900 dark:text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-950 dark:text-zinc-400 dark:hover:text-white'
          }`}
        >
          <Bell className="w-4 h-4" />
          Hệ thống
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-extrabold shadow-2xs">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        {showEmailTab && (
          <button
            onClick={() => setActiveTab('email')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'email'
                ? 'bg-white text-slate-900 dark:bg-zinc-900 dark:text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-950 dark:text-zinc-400 dark:hover:text-white'
            }`}
          >
            <Mail className="w-4 h-4" />
            Cài đặt Email
          </button>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'system' ? <SystemNotificationsTab /> : <EmailPreferencesTab />}
    </div>
  );
}
