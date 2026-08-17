import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, Archive, ListOrdered, BarChart3, Cloud, Settings, Sun, Moon, ChevronLeft, ChevronRight, ArrowUpCircle, Wrench, FolderKanban, FolderOpen, X, Menu, Bug, LogOut, Key, Loader2, Disc3, ShieldAlert, Globe, Bell, Cpu, Map as MapIcon, TableProperties, Calculator, SlidersHorizontal, Radio, FileText, Scale, Zap, LayoutGrid, CalendarClock, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { useQuery, useQueries } from '@tanstack/react-query';
import { api, supportApi, pendingUploadsApi, type Permission } from '../api/client';
import { alertsApi } from '../api/alerts';
import { getIconByName } from './IconPicker';
import { useIsSidebarCompact } from '../hooks/useIsSidebarCompact';
import { useColorCatalogVersion } from '../hooks/useColorCatalogVersion';
import { useSponsorPrompt } from '../hooks/useSponsorPrompt';
import { useUnknownTagPrompt } from '../hooks/useUnknownTagPrompt';
import { UnknownSpoolModal } from './UnknownSpoolModal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, CardHeader, CardContent } from './Card';
import { parseUTCDate } from '../utils/date';
import { Button } from './Button';
import { BugReportBubble } from './BugReportBubble';
import { NotificationBell } from './NotificationBell';
import { PotecoLogo } from './PotecoLogo';
import {
  getHiddenSidebarSystemItemIds,
  getSidebarOrder,
  isExternalSidebarItemId,
  saveHiddenSidebarSystemItemIds,
  saveSidebarOrder,
  SIDEBAR_LAYOUT_CHANGED_EVENT,
} from '../utils/sidebarLayout';

export interface NavChildItem {
  id: string;
  to: string;
  icon: LucideIcon;
  labelKey: string;
}

export interface NavItem {
  id: string;
  to?: string;
  icon: LucideIcon;
  labelKey: string; // Translation key
  children?: NavChildItem[];
}

export const defaultNavItems: NavItem[] = [
  { id: 'printers', to: '/', icon: Home, labelKey: 'nav.printers' },
  { id: 'operation-plan', to: '/operation-plan', icon: CalendarClock, labelKey: 'nav.operationPlan' },
  { id: 'stations', to: '/stations', icon: Cpu, labelKey: 'nav.stations' },
  { id: 'map', to: '/monitor/map', icon: MapIcon, labelKey: 'nav.map' },
  { id: 'alerts', to: '/alerts', icon: ShieldAlert, labelKey: 'nav.alerts' },
  { id: 'data-transmission', to: '/data-transmission', icon: Radio, labelKey: 'nav.dataTransmission' },
  {
    id: 'reports',
    icon: FileText,
    labelKey: 'nav.reports',
    children: [
      { id: 'reports-legal', to: '/reports/legal', icon: Scale, labelKey: 'nav.reportsLegal' },
      { id: 'reports-data-table', to: '/reports/data-table', icon: Zap, labelKey: 'nav.reportsDataTable' },
      { id: 'reports-sensor-data', to: '/reports/sensor-data', icon: LayoutGrid, labelKey: 'nav.reportsSensorData' },
    ],
  },
  {
    id: 'configurations',
    icon: SlidersHorizontal,
    labelKey: 'nav.configurations',
    children: [
      { id: 'interpolation-tables', to: '/interpolation-tables', icon: TableProperties, labelKey: 'nav.interpolationTables' },
      { id: 'calculated-values', to: '/calculated-values', icon: Calculator, labelKey: 'nav.calculatedValues' },
      { id: 'project-settings', to: '/project-settings', icon: SlidersHorizontal, labelKey: 'nav.projectSettings' },
    ],
  },
  { id: 'inventory', to: '/inventory', icon: Disc3, labelKey: 'nav.inventory' },
  { id: 'archives', to: '/archives', icon: Archive, labelKey: 'nav.archives' },
  { id: 'queue', to: '/queue', icon: ListOrdered, labelKey: 'nav.queue' },
  { id: 'projects', to: '/projects', icon: FolderKanban, labelKey: 'nav.projects' },
  { id: 'files', to: '/files', icon: FolderOpen, labelKey: 'nav.files' },
  { id: 'makerworld', to: '/makerworld', icon: Globe, labelKey: 'nav.makerworld' },
  { id: 'profiles', to: '/profiles', icon: Cloud, labelKey: 'nav.profiles' },
  { id: 'maintenance', to: '/maintenance', icon: Wrench, labelKey: 'nav.maintenance' },
  { id: 'stats', to: '/stats', icon: BarChart3, labelKey: 'nav.stats' },
  // User-account feature: gated in isHidden() on advanced auth + user_notifications
  // + the notifications:user_email permission. Kept adjacent to Settings
  // intentionally. Do not drop this entry — without it the /notifications page
  // is orphaned (route + page still exist but no nav link) (#1901).
  { id: 'notifications', to: '/notifications', icon: Bell, labelKey: 'nav.notifications' },
  { id: 'settings', to: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

// Get default view from localStorage
export function getDefaultView(): string {
  return localStorage.getItem('defaultView') || '/';
}

// Save default view to localStorage
export function setDefaultView(path: string) {
  localStorage.setItem('defaultView', path);
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, toggleMode } = useTheme();
  const { t } = useTranslation();
  const isSidebarCompact = useIsSidebarCompact();

  // Re-render Layout (and the page rendered inside <Outlet />) whenever the
  // backend color catalog is (re)populated, so pages that mounted before the
  // catalog fetched — and cached HSL-fallback color names during their first
  // render — refresh with the real catalog names. See #857.
  useColorCatalogVersion();
  const { user, authEnabled, logout, hasPermission } = useAuth();
  const { showToast } = useToast();
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordData, setChangePasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    const stored = localStorage.getItem('sidebarExpanded');
    return stored !== 'false';
  });
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const defaultSidebarOrder = useMemo(() => defaultNavItems.map(i => i.id), []);
  const [sidebarOrder, setSidebarOrder] = useState<string[]>(() => getSidebarOrder(defaultNavItems.map(i => i.id)));
  const [hiddenSystemItemIds, setHiddenSystemItemIds] = useState<string[]>(getHiddenSidebarSystemItemIds);
  const hasRedirected = useRef(false);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(() =>
    sessionStorage.getItem('dismissedUpdateVersion')
  );
  const [plateDetectionAlert, setPlateDetectionAlert] = useState<{
    printer_id: number;
    printer_name: string;
    message: string;
  } | null>(null);

  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>(() => ({
    reports: true,
    configurations: true,
  }));

  useEffect(() => {
    if (location.pathname.startsWith('/reports')) {
      setOpenSubMenus((prev) => ({ ...prev, reports: true }));
    }
    if (
      location.pathname.startsWith('/interpolation-tables') ||
      location.pathname.startsWith('/calculated-values') ||
      location.pathname.startsWith('/project-settings')
    ) {
      setOpenSubMenus((prev) => ({ ...prev, configurations: true }));
    }
  }, [location.pathname]);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Sponsor-prompt toast — fires once per session post-auth if a milestone is eligible.
  useSponsorPrompt(settings?.currency ?? 'EUR');

  // Unknown-spool prompt — surfaces a confirmation modal when the AMS reports a
  // tag with no inventory match (only when `auto_add_unknown_rfid` is off).
  const unknownSpool = useUnknownTagPrompt();

  // Fetch default sidebar order via a public endpoint (no settings:read needed)
  const { data: defaultSidebarData } = useQuery({
    queryKey: ['default-sidebar-order'],
    queryFn: api.getDefaultSidebarOrder,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Apply admin default sidebar order once per user (skipped if already applied).
  // Uses a per-user localStorage flag to prevent re-application.
  useEffect(() => {
    const defaultOrder = defaultSidebarData?.default_sidebar_order;
    if (!defaultOrder) return;
    // Wait for auth state to settle before applying to avoid double-execution
    if (authEnabled && !user) return;
    const appliedKey = user ? `sidebarDefaultApplied_${user.id}` : 'sidebarDefaultApplied';
    if (localStorage.getItem(appliedKey)) return;
    try {
      const parsed = JSON.parse(defaultOrder);
      const orderArr = Array.isArray(parsed) ? parsed : parsed.order;
      if (!Array.isArray(orderArr) || orderArr.length === 0) return;
      // Filter to valid sidebar item IDs only
      const validIds = new Set(defaultNavItems.map(i => i.id));
      const filtered = orderArr.filter((id: string) => typeof id === 'string' && (validIds.has(id) || isExternalSidebarItemId(id)));
      if (filtered.length > 0) {
        setSidebarOrder(filtered);
        saveSidebarOrder(filtered);
        const hiddenIds = Array.isArray(parsed) ? [] : parsed.hiddenSystemItemIds;
        if (Array.isArray(hiddenIds)) {
          const filteredHiddenIds = hiddenIds.filter((id: string) => typeof id === 'string' && validIds.has(id) && id !== 'settings');
          setHiddenSystemItemIds(filteredHiddenIds);
          saveHiddenSidebarSystemItemIds(filteredHiddenIds);
        }
        localStorage.setItem(appliedKey, '1');
      }
    } catch (e) {
      console.error('Failed to apply default sidebar order:', e);
    }
  }, [defaultSidebarData?.default_sidebar_order, setSidebarOrder, user, authEnabled]);

  // Check advanced auth status — the notifications nav item is gated on it
  // (rendered only when authEnabled && advanced_auth_enabled && user_notifications_enabled).
  const { data: advancedAuthStatus } = useQuery({
    queryKey: ['advancedAuthStatus'],
    queryFn: api.getAdvancedAuthStatus,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: authEnabled,
  });

  const { data: updateCheck } = useQuery({
    queryKey: ['updateCheck'],
    queryFn: api.checkForUpdates,
    enabled: settings?.check_updates !== false,
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: 60 * 60 * 1000, // Check every hour
  });

  // Fetch external links for sidebar
  const { data: externalLinks } = useQuery({
    queryKey: ['external-links'],
    queryFn: api.getExternalLinks,
  });

  // Fetch smart plugs to check for switchbar items

  // Check debug logging state
  const { data: debugLoggingState } = useQuery({
    queryKey: ['debugLogging'],
    queryFn: supportApi.getDebugLoggingState,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  // Check developer LAN mode warnings
  const { data: devModeWarnings } = useQuery({
    queryKey: ['developer-mode-warnings'],
    queryFn: api.getDeveloperModeWarnings,
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  // Fetch pending queue items count for badge
  const { data: queueItems } = useQuery({
    queryKey: ['queue', 'pending'],
    queryFn: () => api.getQueue(undefined, 'pending'),
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: 5 * 1000, // Refresh every 5 seconds
    refetchOnWindowFocus: true,
  });
  const pendingQueueCount = queueItems?.length ?? 0;

  // Fetch pending uploads count for archive badge (virtual printer review items)
  const { data: pendingUploadsData } = useQuery({
    queryKey: ['pending-uploads', 'count'],
    queryFn: pendingUploadsApi.getCount,
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: 5 * 1000, // Refresh every 5 seconds
    refetchOnWindowFocus: true,
  });
  const pendingUploadsCount = pendingUploadsData?.count ?? 0;

  // Fetch unacknowledged alerts count for sidebar badge
  const { data: alertsData } = useQuery({
    queryKey: ['alert-events-unack-badge'],
    queryFn: () => alertsApi.getAlertEvents({ acknowledged: false, limit: 1 }),
    staleTime: 10 * 1000,
    refetchInterval: 10 * 1000,
    refetchOnWindowFocus: true,
  });
  const unacknowledgedAlertsCount = alertsData?.unacknowledged ?? 0;

  // Check if any printer with pending queue items needs plate clearing
  const queuePrinterIds = useMemo(() => {
    const ids = new Set<number>();
    queueItems?.forEach(item => {
      if (item.printer_id) ids.add(item.printer_id);
    });
    return Array.from(ids);
  }, [queueItems]);

  const printerStatusQueries = useQueries({
    queries: queuePrinterIds.map(id => ({
      queryKey: ['printerStatus', id],
      queryFn: () => api.getPrinterStatus(id),
      staleTime: 30 * 1000, // WebSocket keeps this warm
    })),
  });

  const needsClearPlate = printerStatusQueries.some(result => {
    const status = result.data;
    if (!status) return false;
    return !!status.awaiting_plate_clear;
  });

  // Calculate debug duration client-side for real-time updates
  const [debugDuration, setDebugDuration] = useState<number | null>(null);
  useEffect(() => {
    if (!debugLoggingState?.enabled || !debugLoggingState.enabled_at) {
      setDebugDuration(null);
      return;
    }
    const enabledAt = parseUTCDate(debugLoggingState.enabled_at)?.getTime() ?? Date.now();
    const updateDuration = () => {
      setDebugDuration(Math.floor((Date.now() - enabledAt) / 1000));
    };
    updateDuration();
    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [debugLoggingState?.enabled, debugLoggingState?.enabled_at]);

  // Build the unified sidebar items list - memoized to prevent re-renders
  const navItemsMap = useMemo(() => new Map(defaultNavItems.map(item => [item.id, item])), []);
  const extLinksMap = useMemo(() => new Map((externalLinks || []).map(link => [`ext-${link.id}`, link])), [externalLinks]);

  // Compute the ordered sidebar: include stored order + any new items
  // Hide nav items the user doesn't have read permission for
  const orderedSidebarIds = (() => {
    const result: string[] = [];
    const seen = new Set<string>();

    // Map nav item IDs to the permission(s) required to see them. Resources
    // that ship in three tiers (legacy `*:read` + granular `*:read_own` /
    // `*:read_all`) list all three: the default Operators group is seeded
    // with `_own` only, so gating on the legacy alone hides the entry from
    // every non-admin user even though the underlying API accepts their
    // request (#1755).
    const navPermissions: Record<string, Permission | Permission[]> = {
      archives: ['archives:read', 'archives:read_own', 'archives:read_all'],
      queue: ['queue:read', 'queue:read_own', 'queue:read_all'],
      stats: 'stats:read',
      profiles: 'kprofiles:read',
      maintenance: 'maintenance:read',
      projects: 'projects:read',
      inventory: 'inventory:read',
      files: ['library:read', 'library:read_own', 'library:read_all'],
      makerworld: 'makerworld:view',
      settings: 'settings:read',
      // The user-email-preferences API requires notifications:user_email, so
      // gate the nav item on the same permission (both default groups —
      // Administrators and Operators — hold it). The advanced-auth /
      // user_notifications enablement gate is applied separately below.
      notifications: 'notifications:user_email',
    };

    const isHidden = (id: string) => {
      // User-toggled hide (#1673) wins first — cheapest check, explicit intent.
      if (hiddenSystemItemIds.includes(id)) return true;
      // Permission gate accepts Permission | Permission[] so resources with
      // granular `*:read_own` / `*:read_all` tiers (default Operators group)
      // don't get hidden from users who only hold the granular variant (#1755).
      if (authEnabled && id in navPermissions) {
        const required = navPermissions[id];
        const granted = Array.isArray(required)
          ? required.some((p) => hasPermission(p))
          : hasPermission(required);
        if (!granted) return true;
      }
      // notifications nav item also requires advanced auth to be enabled and user_notifications_enabled setting
      if (id === 'notifications' && (!authEnabled || !advancedAuthStatus?.advanced_auth_enabled || (settings?.user_notifications_enabled === false))) return true;
      return false;
    };

    // Add items in stored order
    for (const id of sidebarOrder) {
      if (isHidden(id)) continue;
      if (navItemsMap.has(id) || extLinksMap.has(id)) {
        result.push(id);
        seen.add(id);
      }
    }

    // Add any new internal nav items not in stored order
    for (const item of defaultNavItems) {
      if (isHidden(item.id)) continue;
      if (!seen.has(item.id)) {
        result.push(item.id);
        seen.add(item.id);
      }
    }

    // Add any new external links not in stored order
    for (const link of externalLinks || []) {
      const extId = `ext-${link.id}`;
      if (!seen.has(extId)) {
        result.push(extId);
        seen.add(extId);
      }
    }

    return result;
  })();

  // Show update banner if update available and not dismissed for this version.
  // Suppressed when running as a Home Assistant addon — HA Supervisor surfaces
  // its own update notification in the HA UI, so the in-app banner is duplicate
  // noise that links to a page that just says "update via HA."
  const showUpdateBanner = updateCheck?.update_available &&
    updateCheck.latest_version &&
    updateCheck.latest_version !== dismissedUpdateVersion &&
    !updateCheck.is_ha_addon;

  const dismissUpdateBanner = () => {
    if (updateCheck?.latest_version) {
      sessionStorage.setItem('dismissedUpdateVersion', updateCheck.latest_version);
      setDismissedUpdateVersion(updateCheck.latest_version);
    }
  };

  // Redirect to default view on initial load
  useEffect(() => {
    if (!hasRedirected.current && location.pathname === '/') {
      const defaultView = getDefaultView();
      if (defaultView !== '/') {
        hasRedirected.current = true;
        navigate(defaultView, { replace: true });
      }
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    localStorage.setItem('sidebarExpanded', String(sidebarExpanded));
  }, [sidebarExpanded]);

  useEffect(() => {
    const refreshSidebarLayout = () => {
      setSidebarOrder(getSidebarOrder(defaultSidebarOrder));
      setHiddenSystemItemIds(getHiddenSidebarSystemItemIds());
    };
    window.addEventListener(SIDEBAR_LAYOUT_CHANGED_EVENT, refreshSidebarLayout);
    window.addEventListener('storage', refreshSidebarLayout);
    return () => {
      window.removeEventListener(SIDEBAR_LAYOUT_CHANGED_EVENT, refreshSidebarLayout);
      window.removeEventListener('storage', refreshSidebarLayout);
    };
  }, [defaultSidebarOrder]);

  // Close compact drawer on navigation
  useEffect(() => {
    if (isSidebarCompact) {
      setMobileDrawerOpen(false);
    }
  }, [location.pathname, isSidebarCompact]);

  // Listen for plate detection warnings (objects on plate, print paused)
  // Only show to users with printers:control permission
  useEffect(() => {
    const handlePlateNotEmpty = (event: Event) => {
      // Only show alert to users who can control printers
      if (!hasPermission('printers:control')) {
        return;
      }
      const detail = (event as CustomEvent).detail;
      setPlateDetectionAlert({
        printer_id: detail.printer_id,
        printer_name: detail.printer_name,
        message: detail.message,
      });
    };
    window.addEventListener('plate-not-empty', handlePlateNotEmpty);
    return () => window.removeEventListener('plate-not-empty', handlePlateNotEmpty);
  }, [hasPermission]);

  // Global keyboard shortcuts for navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    // Ignore if typing in an input/textarea
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Number keys for navigation (1-9) - follows sidebar order including external links
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      const keyNum = parseInt(e.key);
      if (keyNum >= 1 && keyNum <= orderedSidebarIds.length && keyNum <= 9) {
        const id = orderedSidebarIds[keyNum - 1];
        e.preventDefault();

        if (isExternalSidebarItemId(id)) {
          // External link
          const extLink = extLinksMap.get(id);
          if (extLink?.open_in_new_tab) {
            window.open(extLink.url, '_blank', 'noopener,noreferrer');
          } else {
            const linkId = id.replace('ext-', '');
            navigate(`/external/${linkId}`);
          }
        } else {
          // Internal nav item
          const navItem = navItemsMap.get(id);
          if (navItem) {
            if (navItem.to) {
              navigate(navItem.to);
            } else if (navItem.children && navItem.children.length > 0) {
              navigate(navItem.children[0].to);
            }
          }
        }
        return;
      }

      switch (e.key) {
        case '?':
          e.preventDefault();
          setShowShortcuts(true);
          break;
        case 'Escape':
          setShowShortcuts(false);
          break;
      }
    }
  }, [navigate, orderedSidebarIds, navItemsMap, extLinksMap]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex min-h-screen">
      {/* Compact Header */}
      {isSidebarCompact && (
        <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center px-4">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6 text-slate-800 dark:text-white" />
          </button>
          <Link to="/" className="ml-3 flex items-center hover:opacity-85 transition-opacity" title="Trang chủ">
            <PotecoLogo variant="full" className="h-8 w-auto" />
          </Link>
        </header>
      )}

      {/* Compact Drawer Backdrop */}
      {isSidebarCompact && mobileDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 transition-opacity"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}

      {/* Sidebar / Mobile Drawer */}
      <aside
        className={`bg-bambu-dark-secondary border-r border-bambu-dark-tertiary flex flex-col transition-all duration-300 ${
          isSidebarCompact
            ? `fixed inset-y-0 left-0 z-50 w-72 transform ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'}`
            : `fixed inset-y-0 left-0 z-30 ${sidebarExpanded ? 'w-72' : 'w-16'}`
        }`}
      >
        {/* Logo */}
        <div className={`border-b border-bambu-dark-tertiary flex items-center justify-center ${isSidebarCompact || sidebarExpanded ? 'p-4' : 'py-3.5 px-2'}`}>
          <Link
            to="/"
            className="flex items-center justify-center hover:opacity-85 transition-opacity cursor-pointer"
            title="Trang chủ"
          >
            {isSidebarCompact || sidebarExpanded ? (
              <PotecoLogo variant="full" className="h-10 w-auto" />
            ) : (
              <PotecoLogo variant="icon" className="h-8 w-8" />
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2.5 overflow-y-auto pb-6">
          <ul className="space-y-1.5">
            {orderedSidebarIds.map((id) => {
              const isExternal = isExternalSidebarItemId(id);

              if (isExternal) {
                // Render external link
                const link = extLinksMap.get(id);
                if (!link) return null;

                const LinkIcon = link.custom_icon ? null : getIconByName(link.icon);
                return (
                  <li key={id}>
                    {link.open_in_new_tab ? (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center ${isSidebarCompact || sidebarExpanded ? 'gap-3 px-3.5' : 'justify-center px-2'} py-2.5 rounded-xl transition-colors group text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-950 dark:hover:text-white font-semibold`}
                        title={!isSidebarCompact && !sidebarExpanded ? link.name : undefined}
                      >
                        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                          {link.custom_icon ? (
                            <img
                              src={api.getExternalLinkIconUrl(link.id)}
                              alt=""
                              className="w-5 h-5"
                            />
                          ) : (
                            LinkIcon && <LinkIcon className="w-5 h-5" />
                          )}
                        </div>
                        {(isSidebarCompact || sidebarExpanded) && <span className="text-sm truncate">{link.name}</span>}
                      </a>
                    ) : (
                      <NavLink
                        to={`/external/${link.id}`}
                        className={({ isActive }) =>
                          `flex items-center ${isSidebarCompact || sidebarExpanded ? 'gap-3 px-3.5' : 'justify-center px-2'} py-2.5 rounded-xl transition-colors group font-semibold ${
                            isActive
                              ? 'bg-bambu-green !text-white [&_*]:!text-white shadow-xs'
                              : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-950 dark:hover:text-white'
                          }`
                        }
                        title={!isSidebarCompact && !sidebarExpanded ? link.name : undefined}
                      >
                        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                          {link.custom_icon ? (
                            <img
                              src={api.getExternalLinkIconUrl(link.id)}
                              alt=""
                              className="w-5 h-5"
                            />
                          ) : (
                            LinkIcon && <LinkIcon className="w-5 h-5" />
                          )}
                        </div>
                        {(isSidebarCompact || sidebarExpanded) && <span className="text-sm truncate">{link.name}</span>}
                      </NavLink>
                    )}
                  </li>
                );
              } else {
                // Render internal nav item
                const navItem = navItemsMap.get(id);
                if (!navItem) return null;

                const { to, icon: Icon, labelKey, children } = navItem;

                // ── Nested Sub-Menu Accordion (Báo cáo -> Báo cáo pháp lý / Báo cáo phát điện / Số liệu quan trắc) ──
                if (children && children.length > 0) {
                  const isChildActive = children.some(
                    (c) => location.pathname === c.to || location.pathname.startsWith(c.to + '/')
                  );
                  const isMenuOpen = openSubMenus[id] ?? isChildActive;

                  return (
                    <li key={id} className="space-y-1">
                      {/* Parent Accordion Row */}
                      <button
                        type="button"
                        onClick={() => {
                          if (!isSidebarCompact && !sidebarExpanded) {
                            setSidebarExpanded(true);
                            setOpenSubMenus((prev) => ({ ...prev, [id]: true }));
                          } else {
                            setOpenSubMenus((prev) => ({ ...prev, [id]: !isMenuOpen }));
                          }
                        }}
                        className={`w-full flex items-center ${
                          isSidebarCompact || sidebarExpanded ? 'justify-between px-3.5' : 'justify-center px-2'
                        } py-2.5 rounded-xl transition-colors group cursor-pointer ${
                          isChildActive
                            ? isSidebarCompact || sidebarExpanded
                              ? 'text-slate-900 dark:text-white font-bold bg-slate-100/90 dark:bg-zinc-800/90 shadow-2xs'
                              : 'bg-bambu-green !text-white [&_*]:!text-white shadow-xs font-bold'
                            : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-950 dark:hover:text-white font-semibold'
                        }`}
                        title={!isSidebarCompact && !sidebarExpanded ? t(labelKey) : undefined}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-5 h-5" />
                          </div>
                          {(isSidebarCompact || sidebarExpanded) && (
                            <span className="text-sm truncate">{t(labelKey)}</span>
                          )}
                        </div>
                        {(isSidebarCompact || sidebarExpanded) && (
                          <ChevronRight
                            className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 text-slate-400 dark:text-zinc-500 ${
                              isMenuOpen ? 'rotate-90' : ''
                            }`}
                          />
                        )}
                      </button>

                      {/* Nested Sub-items */}
                      {(isSidebarCompact || sidebarExpanded) && isMenuOpen && (
                        <ul className="pl-4 pr-1 py-1 space-y-1 mt-1 border-l-2 border-slate-200 dark:border-zinc-800 ml-4.5">
                          {children.map((child) => {
                            const ChildIcon = child.icon;
                            return (
                              <li key={child.id}>
                                <NavLink
                                  to={child.to}
                                  className={({ isActive }) =>
                                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all group ${
                                      isActive
                                        ? 'bg-bambu-green !text-white [&_*]:!text-white shadow-xs font-bold'
                                        : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'
                                    }`
                                  }
                                >
                                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                    <ChildIcon className="w-4 h-4" />
                                  </div>
                                  <span className="truncate">{t(child.labelKey)}</span>
                                </NavLink>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                }

                // ── Standard Single Nav Item ──
                if (!to) return null;
                const showAlertsBadge = id === 'alerts' && unacknowledgedAlertsCount > 0;
                const showQueueBadge = id === 'queue' && pendingQueueCount > 0;
                const showArchiveBadge = id === 'archives' && pendingUploadsCount > 0;
                const badgeCount = showAlertsBadge
                  ? unacknowledgedAlertsCount
                  : showQueueBadge
                  ? pendingQueueCount
                  : showArchiveBadge
                  ? pendingUploadsCount
                  : 0;
                const showBadge = showAlertsBadge || showQueueBadge || showArchiveBadge;
                const showClearPlateDot = id === 'printers' && needsClearPlate;

                return (
                  <li key={id}>
                    <NavLink
                      to={to}
                      className={({ isActive }) =>
                        `flex items-center ${isSidebarCompact || sidebarExpanded ? 'gap-3 px-3.5' : 'justify-center px-2'} py-2.5 rounded-xl transition-colors group font-semibold ${
                          isActive
                            ? 'bg-bambu-green !text-white [&_*]:!text-white shadow-xs font-bold'
                            : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-950 dark:hover:text-white'
                        }`
                      }
                      title={!isSidebarCompact && !sidebarExpanded ? t(labelKey) : undefined}
                    >
                      <div className="relative w-5 h-5 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5" />
                        {showClearPlateDot && (
                          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-yellow-500 rounded-full border-2 border-bambu-dark-secondary" />
                        )}
                        {showBadge && (
                          <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold rounded-full ${
                            showAlertsBadge
                              ? 'bg-rose-500 !text-white animate-pulse shadow-sm'
                              : showArchiveBadge
                              ? 'bg-blue-500 !text-white'
                              : 'bg-yellow-500 text-black'
                          }`}>
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}
                      </div>
                      {(isSidebarCompact || sidebarExpanded) && <span className="text-sm truncate">{t(labelKey)}</span>}
                    </NavLink>
                  </li>
                );
              }
            })}
          </ul>
        </nav>

        {/* Collapse toggle - hide on compact sidebar */}
        {!isSidebarCompact && (
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="p-2 mx-2 mb-2 rounded-lg hover:bg-bambu-dark-tertiary transition-colors text-bambu-gray-light hover:text-white flex items-center justify-center"
            title={sidebarExpanded ? t('nav.collapseSidebar') : t('nav.expandSidebar')}
          >
            {sidebarExpanded ? (
              <ChevronLeft className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </button>
        )}

        {/* Footer */}
        <div className="flex-shrink-0 p-3 border-t border-bambu-dark-tertiary bg-bambu-dark-secondary">
          {isSidebarCompact || sidebarExpanded ? (
            <div className="flex flex-col gap-3">
              {/* User info row with logout */}
              <div className="flex items-center justify-between gap-2">
                <Link
                  to="/accounts/profile"
                  className="flex items-center gap-2.5 overflow-hidden group hover:opacity-90 transition flex-1 min-w-0"
                >
                  {/* Avatar initial circle */}
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {user?.username ? user.username.slice(0, 2).toUpperCase() : 'PC'}
                  </div>
                  <div className="truncate flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition truncate">
                      {user?.display_name || user?.username || 'pcthuoch'}
                    </h4>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                      {user?.role_name || (user?.is_superuser ? 'Quản trị hệ thống' : 'Kỹ sư vận hành')}
                    </p>
                  </div>
                </Link>

                {/* Notification Bell + Logout */}
                <div className="flex items-center gap-1">
                  <div className="flex-shrink-0">
                    <NotificationBell mode="icon-only" />
                  </div>
                  {/* Logout button */}
                  <button
                    onClick={logout}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition flex-shrink-0"
                    title="Đăng xuất"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Full width Theme Toggle Button */}
              <button
                onClick={toggleMode}
                className="w-full py-2.5 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition flex items-center justify-center gap-2 text-sm font-medium shadow-2xs"
              >
                {mode === 'dark' ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
                <span>{mode === 'dark' ? 'Giao diện Tối' : 'Giao diện Sáng'}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Link
                to="/accounts/profile"
                className="w-9 h-9 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xs hover:ring-2 hover:ring-emerald-500/50 transition"
                title="Hồ sơ tài khoản"
              >
                {user?.username ? user.username.slice(0, 2).toUpperCase() : 'PC'}
              </Link>
              <button
                onClick={toggleMode}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                title={mode === 'dark' ? 'Giao diện Tối' : 'Giao diện Sáng'}
              >
                {mode === 'dark' ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
              </button>
              <NotificationBell mode="icon-only" />
              <button
                onClick={logout}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                title="Đăng xuất"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 bg-bambu-dark overflow-auto transition-all duration-300 ${
        isSidebarCompact ? 'mt-14' : sidebarExpanded ? 'ml-72' : 'ml-16'
      }`}>
        {/* Debug logging indicator */}
        {debugLoggingState?.enabled && (
          <div className="bg-amber-100 dark:bg-amber-500/20 border-b border-amber-300 dark:border-amber-500/30 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Bug className="w-4 h-4 text-amber-500 animate-pulse" />
              <span className="text-amber-800 dark:text-amber-200">
                {t('support.debugLoggingActive', { defaultValue: 'Debug logging is active' })}
                {debugDuration !== null && (
                  <span className="text-amber-700/80 dark:text-amber-300/70 ml-2">
                    ({Math.floor(debugDuration / 60)}m {debugDuration % 60}s)
                  </span>
                )}
              </span>
              <button
                onClick={() => navigate('/system')}
                className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 font-medium underline ml-2"
              >
                {t('support.manageLogs', { defaultValue: 'Manage' })}
              </button>
            </div>
          </div>
        )}
        {devModeWarnings && devModeWarnings.length > 0 && (
          <div className="bg-orange-100 dark:bg-orange-500/20 border-b border-orange-300 dark:border-orange-500/30 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <ShieldAlert className="w-4 h-4 text-orange-500" />
              <span className="text-orange-800 dark:text-orange-200">
                {t('printers.developerModeWarning', {
                  names: devModeWarnings.map(w => w.name).join(', '),
                  defaultValue: `Developer LAN mode is not enabled on: ${devModeWarnings.map(w => w.name).join(', ')}. Some features may not work.`
                })}
              </span>
              <a href="https://wiki.bambulab.com/en/knowledge-sharing/enable-developer-mode"
                 target="_blank" rel="noopener noreferrer"
                 className="text-orange-700 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-300 font-medium underline ml-2">
                {t('printers.howToEnable', { defaultValue: 'How to enable' })}
              </a>
            </div>
          </div>
        )}
        {/* Persistent update banner */}
        {showUpdateBanner && (
          <div className="bg-bambu-green/20 border-b border-bambu-green/30 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <ArrowUpCircle className="w-4 h-4 text-bambu-green" />
              <span>
                {t('nav.updateAvailableBanner', {
                  version: updateCheck?.latest_version,
                  defaultValue: `Version ${updateCheck?.latest_version} is available!`
                })}
              </span>
              <button
                onClick={() => navigate('/settings')}
                className="text-bambu-green hover:text-bambu-green/80 font-medium underline"
              >
                {t('nav.viewUpdate', { defaultValue: 'View update' })}
              </button>
            </div>
            <button
              onClick={dismissUpdateBanner}
              className="p-1 hover:bg-bambu-dark-tertiary rounded transition-colors"
              title={t('common.dismiss', { defaultValue: 'Dismiss' })}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-6 md:p-8 max-w-[1600px] mx-auto w-full">
          <Outlet />
        </div>
      </main>

      <UnknownSpoolModal
        prompt={unknownSpool.prompt}
        isPending={unknownSpool.isPending}
        onConfirm={unknownSpool.confirm}
        onCancel={unknownSpool.cancel}
      />

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <KeyboardShortcutsModal
          onClose={() => setShowShortcuts(false)}
          sidebarItems={orderedSidebarIds.map(id => {
            if (isExternalSidebarItemId(id)) {
              const extLink = extLinksMap.get(id);
              return extLink ? { type: 'external' as const, label: extLink.name } : null;
            } else {
              const navItem = navItemsMap.get(id);
              return navItem ? { type: 'nav' as const, label: navItem.labelKey, labelKey: navItem.labelKey } : null;
            }
          }).filter(Boolean) as { type: 'nav' | 'external'; label: string; labelKey?: string }[]}
        />
      )}

      {/* Plate Detection Alert Modal */}
      {plateDetectionAlert && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-bambu-dark-secondary border-2 border-yellow-500 rounded-xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-yellow-700 dark:text-yellow-400 mb-2">
                {t('plateAlert.title')}
              </h2>
              <p className="text-lg text-white mb-2">
                {plateDetectionAlert.printer_name}
              </p>
              <p className="text-bambu-gray mb-6">
                {t('plateAlert.message')}
              </p>
              <button
                onClick={() => setPlateDetectionAlert(null)}
                className="w-full py-3 px-6 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-lg transition-colors"
              >
                {t('plateAlert.understand')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowChangePasswordModal(false);
            setChangePasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
          }}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-bambu-green" />
                  <h2 className="text-lg font-semibold text-white">{t('changePassword.title')}</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowChangePasswordModal(false);
                    setChangePasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={user?.username ?? ''}
                  readOnly
                  hidden
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    {t('changePassword.currentPassword')}
                  </label>
                  <input
                    type="password"
                    value={changePasswordData.currentPassword}
                    onChange={(e) => setChangePasswordData({ ...changePasswordData, currentPassword: e.target.value })}
                    className="w-full px-4 py-3 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors"
                    placeholder={t('changePassword.currentPasswordPlaceholder')}
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    {t('changePassword.newPassword')}
                  </label>
                  <input
                    type="password"
                    value={changePasswordData.newPassword}
                    onChange={(e) => setChangePasswordData({ ...changePasswordData, newPassword: e.target.value })}
                    className="w-full px-4 py-3 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors"
                    placeholder={t('changePassword.newPasswordPlaceholder')}
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    {t('changePassword.confirmPassword')}
                  </label>
                  <input
                    type="password"
                    value={changePasswordData.confirmPassword}
                    onChange={(e) => setChangePasswordData({ ...changePasswordData, confirmPassword: e.target.value })}
                    className={`w-full px-4 py-3 bg-bambu-dark-secondary border rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors ${
                      changePasswordData.confirmPassword && changePasswordData.newPassword !== changePasswordData.confirmPassword
                        ? 'border-red-500'
                        : 'border-bambu-dark-tertiary'
                    }`}
                    placeholder={t('changePassword.confirmPasswordPlaceholder')}
                    autoComplete="new-password"
                    minLength={6}
                  />
                  {changePasswordData.confirmPassword && changePasswordData.newPassword !== changePasswordData.confirmPassword && (
                    <p className="text-red-700 dark:text-red-400 text-xs mt-1">{t('changePassword.passwordsDoNotMatch')}</p>
                  )}
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowChangePasswordModal(false);
                    setChangePasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  }}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={async () => {
                    if (changePasswordData.newPassword !== changePasswordData.confirmPassword) {
                      showToast(t('changePassword.passwordsDoNotMatch'), 'error');
                      return;
                    }
                    if (changePasswordData.newPassword.length < 6) {
                      showToast(t('changePassword.passwordTooShort'), 'error');
                      return;
                    }
                    setChangePasswordLoading(true);
                    try {
                      await api.changePassword(changePasswordData.currentPassword, changePasswordData.newPassword);
                      showToast(t('changePassword.success'), 'success');
                      setShowChangePasswordModal(false);
                      setChangePasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    } catch (error: unknown) {
                      const message = error instanceof Error ? error.message : t('changePassword.failed');
                      showToast(message, 'error');
                    } finally {
                      setChangePasswordLoading(false);
                    }
                  }}
                  disabled={changePasswordLoading || !changePasswordData.currentPassword || !changePasswordData.newPassword || changePasswordData.newPassword !== changePasswordData.confirmPassword || changePasswordData.newPassword.length < 6}
                >
                  {changePasswordLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('changePassword.changing')}
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4" />
                      {t('changePassword.title')}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <BugReportBubble />
    </div>
  );
}
