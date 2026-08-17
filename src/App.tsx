import { Component, type ReactNode, type ErrorInfo, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { useWebSocket } from './hooks/useWebSocket';
import { usePrintProgressTitle } from './hooks/usePrintProgressTitle';
import { useStreamTokenSync } from './hooks/useCameraStreamToken';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { SliceJobTrackerProvider } from './contexts/SliceJobTrackerContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ColorCatalogProvider } from './contexts/ColorCatalogContext';
import { SpoolBuddyLayout } from './components/spoolbuddy/SpoolBuddyLayout';

// Lazy Loaded Pages (Code Splitting)
const HydroOverviewPage = lazy(() => import('./pages/HydroOverviewPage').then(m => ({ default: m.HydroOverviewPage })));
const ArchivesPage = lazy(() => import('./pages/ArchivesPage').then(m => ({ default: m.ArchivesPage })));
const QueuePage = lazy(() => import('./pages/QueuePage').then(m => ({ default: m.QueuePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const OperationPlanPage = lazy(() => import('./pages/OperationPlanPage').then(m => ({ default: m.OperationPlanPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const ProfilesPage = lazy(() => import('./pages/ProfilesPage').then(m => ({ default: m.ProfilesPage })));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage').then(m => ({ default: m.MaintenancePage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
const FileManagerPage = lazy(() => import('./pages/FileManagerPage').then(m => ({ default: m.FileManagerPage })));
const LibraryTrashPage = lazy(() => import('./pages/LibraryTrashPage').then(m => ({ default: m.LibraryTrashPage })));
const CameraPage = lazy(() => import('./pages/CameraPage').then(m => ({ default: m.CameraPage })));
const CamWallPage = lazy(() => import('./pages/CamWallPage').then(m => ({ default: m.CamWallPage })));
const StreamOverlayPage = lazy(() => import('./pages/StreamOverlayPage').then(m => ({ default: m.StreamOverlayPage })));
const ExternalLinkPage = lazy(() => import('./pages/ExternalLinkPage').then(m => ({ default: m.ExternalLinkPage })));
const GroupEditPage = lazy(() => import('./pages/GroupEditPage').then(m => ({ default: m.GroupEditPage })));
const StationsPage = lazy(() => import('./pages/StationsPage').then(m => ({ default: m.StationsPage })));
const StationsMapPage = lazy(() => import('./pages/StationsMapPage').then(m => ({ default: m.StationsMapPage })));
const InterpolationTablesPage = lazy(() => import('./pages/InterpolationTablesPage').then(m => ({ default: m.InterpolationTablesPage })));
const CalculatedValuesPage = lazy(() => import('./pages/CalculatedValuesPage').then(m => ({ default: m.CalculatedValuesPage })));
const DataTransmissionPage = lazy(() => import('./pages/DataTransmissionPage').then(m => ({ default: m.DataTransmissionPage })));
const LegalReportsPage = lazy(() => import('./pages/reports/LegalReportsPage').then(m => ({ default: m.LegalReportsPage })));
const DataTableReportsPage = lazy(() => import('./pages/reports/DataTableReportsPage').then(m => ({ default: m.DataTableReportsPage })));
const SensorDataReportsPage = lazy(() => import('./pages/reports/SensorDataReportsPage').then(m => ({ default: m.SensorDataReportsPage })));
const ProjectSettingsPage = lazy(() => import('./pages/ProjectSettingsPage').then(m => ({ default: m.ProjectSettingsPage })));
const MakerworldPage = lazy(() => import('./pages/MakerworldPage').then(m => ({ default: m.MakerworldPage })));
const SystemInfoPage = lazy(() => import('./pages/SystemInfoPage').then(m => ({ default: m.SystemInfoPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const SetupPage = lazy(() => import('./pages/SetupPage').then(m => ({ default: m.SetupPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const AlertsPage = lazy(() => import('./pages/AlertsPage').then(m => ({ default: m.AlertsPage })));
const GCodeViewerPage = lazy(() => import('./pages/GCodeViewerPage').then(m => ({ default: m.GCodeViewerPage })));

// SpoolBuddy Lazy Pages
const SpoolBuddyDashboard = lazy(() => import('./pages/spoolbuddy/SpoolBuddyDashboard').then(m => ({ default: m.SpoolBuddyDashboard })));
const SpoolBuddyAmsPage = lazy(() => import('./pages/spoolbuddy/SpoolBuddyAmsPage').then(m => ({ default: m.SpoolBuddyAmsPage })));
const SpoolBuddySettingsPage = lazy(() => import('./pages/spoolbuddy/SpoolBuddySettingsPage').then(m => ({ default: m.SpoolBuddySettingsPage })));
const SpoolBuddyCalibrationPage = lazy(() => import('./pages/spoolbuddy/SpoolBuddyCalibrationPage').then(m => ({ default: m.SpoolBuddyCalibrationPage })));
const SpoolBuddyWriteTagPage = lazy(() => import('./pages/spoolbuddy/SpoolBuddyWriteTagPage').then(m => ({ default: m.SpoolBuddyWriteTagPage })));
const SpoolBuddyInventoryPage = lazy(() => import('./pages/spoolbuddy/SpoolBuddyInventoryPage').then(m => ({ default: m.SpoolBuddyInventoryPage })));

function PageLoadingFallback() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-zinc-400">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-semibold text-zinc-500 tracking-wide">Đang tải trang...</span>
    </div>
  );
}
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; errorInfo: ErrorInfo | null }> {
  state = { error: null as Error | null, errorInfo: null as ErrorInfo | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('React crash:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#ef4444', backgroundColor: '#18181b', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>UI Crash</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#a1a1aa', marginTop: 12 }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null, errorInfo: null }); }}
            style={{ marginTop: 16, padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

function StreamTokenSync() {
  useStreamTokenSync();
  return null;
}

function WebSocketProvider({ children }: { children: React.ReactNode }) {
  useWebSocket();
  usePrintProgressTitle();
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authEnabled, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (authEnabled && !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

function PermissionRoute({ permission, children }: { permission: string; children: React.ReactNode }) {
  // Permission-gated route: any user with the given permission can enter, not
  // just admins. Individual components below this guard apply their own
  // per-action permission checks. Used for pages where delegation is supported
  // (e.g. settings:read grants read-only access to Settings; specific tabs
  // require their own permissions like users:read, groups:update, etc.).
  const { authEnabled, loading, user, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // Auth disabled → open access (backward compatibility)
  if (!authEnabled) {
    return <>{children}</>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!hasPermission(permission as Parameters<typeof hasPermission>[0])) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function SetupRoute({ children }: { children: React.ReactNode }) {
  const { authEnabled, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // If auth is already enabled, redirect to login
  // Otherwise, allow access to setup page (even if setup was completed before)
  // This allows users to enable auth later if they skipped it during initial setup
  if (authEnabled) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {/* ThemeProvider sits inside AuthProvider so its initial
                ``api.getSettings()`` fetch can wait for AuthContext to
                resolve — otherwise it fires unconditionally on every
                login page load and returns 401. ErrorBoundary uses
                inline styles, so a missing theme on a crash screen is
                not a regression. */}
            <ThemeProvider>
            <ColorCatalogProvider>
            <SliceJobTrackerProvider>
            <StreamTokenSync />
            <BrowserRouter>
              <Suspense fallback={<PageLoadingFallback />}>
                <Routes>
                  {/* Setup page - only accessible if auth not enabled */}
                  <Route path="/setup" element={<SetupRoute><SetupPage /></SetupRoute>} />

                  {/* Login page */}
                  <Route path="/login" element={<LoginPage />} />

                  {/* Camera page - standalone, no layout, no WebSocket (doesn't need real-time updates) */}
                  <Route path="/camera/:printerId" element={<CameraPage />} />

                  {/* Stream overlay page - standalone for OBS/streaming embeds, no auth required */}
                  <Route path="/overlay/:printerId" element={<StreamOverlayPage />} />

                  {/* Cam Wall on its own URL (#2531). Outside ProtectedRoute because a
                      ?token= kiosk has no session to protect; the page itself sends a
                      tokenless visitor to /login, and the backend gates the feed. */}
                  <Route path="/camwall" element={<CamWallPage />} />

                  {/* SpoolBuddy kiosk UI */}
                  <Route element={<ProtectedRoute><WebSocketProvider><SpoolBuddyLayout /></WebSocketProvider></ProtectedRoute>}>
                    <Route path="spoolbuddy" element={<SpoolBuddyDashboard />} />
                    <Route path="spoolbuddy/ams" element={<SpoolBuddyAmsPage />} />
                    <Route path="spoolbuddy/write-tag" element={<SpoolBuddyWriteTagPage />} />
                    <Route path="spoolbuddy/inventory" element={<SpoolBuddyInventoryPage />} />
                    <Route path="spoolbuddy/settings" element={<SpoolBuddySettingsPage />} />
                    <Route path="spoolbuddy/calibration" element={<SpoolBuddyCalibrationPage />} />
                  </Route>

                  {/* Main app with WebSocket for real-time updates */}
                  <Route element={<ProtectedRoute><WebSocketProvider><Layout /></WebSocketProvider></ProtectedRoute>}>
                    <Route index element={<HydroOverviewPage />} />
                    <Route path="archives" element={<ArchivesPage />} />
                    <Route path="queue" element={<QueuePage />} />
                    {/* Slicer Pipelines (#1425) — Pipelines tab lives on the
                        Print Queue page (Queue + History + Timeline +
                        Pipelines). Old standalone URL redirects. */}
                    <Route path="pipelines/runs" element={<Navigate to="/queue?tab=pipelines" replace />} />
                    <Route path="stats" element={<HydroOverviewPage />} />
                    <Route path="profiles" element={<ProfilesPage />} />
                    <Route path="maintenance" element={<MaintenancePage />} />
                    <Route path="projects" element={<ProjectsPage />} />
                    <Route path="projects/:id" element={<ProjectDetailPage />} />
                    <Route path="operation-plan" element={<OperationPlanPage />} />
                    <Route path="operation-plan/*" element={<OperationPlanPage />} />
                    <Route path="operations/plan" element={<Navigate to="/operation-plan" replace />} />
                    <Route path="stations" element={<StationsPage />} />
                    <Route path="stations/map" element={<StationsMapPage />} />
                    <Route path="monitor/map" element={<StationsMapPage />} />
                    <Route path="map" element={<StationsMapPage />} />
                    <Route path="interpolation-tables" element={<InterpolationTablesPage />} />
                    <Route path="interpolation" element={<Navigate to="/interpolation-tables" replace />} />
                    <Route path="calculated-values" element={<CalculatedValuesPage />} />
                    <Route path="calculated" element={<Navigate to="/calculated-values" replace />} />
                    <Route path="data-transmission" element={<DataTransmissionPage />} />
                    <Route path="data-transmission/*" element={<DataTransmissionPage />} />
                    <Route path="transmission" element={<Navigate to="/data-transmission" replace />} />
                    <Route path="transmissions" element={<Navigate to="/data-transmission" replace />} />
                    <Route path="reports" element={<Navigate to="/reports/legal" replace />} />
                    <Route path="reports/legal" element={<LegalReportsPage />} />
                    <Route path="reports/data-table" element={<DataTableReportsPage />} />
                    <Route path="reports/sensor-data" element={<SensorDataReportsPage />} />
                    <Route path="reports-legal" element={<Navigate to="/reports/legal" replace />} />
                    <Route path="reports-data-table" element={<Navigate to="/reports/data-table" replace />} />
                    <Route path="reports-sensor-data" element={<Navigate to="/reports/sensor-data" replace />} />
                    <Route path="project-settings" element={<ProjectSettingsPage />} />
                    <Route path="project-settings/*" element={<ProjectSettingsPage />} />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="accounts/profile" element={<ProfilePage />} />
                    <Route path="accounts/profile/*" element={<ProfilePage />} />
                    <Route path="files" element={<FileManagerPage />} />
                    <Route path="files/trash" element={<LibraryTrashPage />} />
                    <Route path="makerworld" element={<PermissionRoute permission="makerworld:view"><MakerworldPage /></PermissionRoute>} />
                    <Route path="settings" element={<PermissionRoute permission="settings:read"><SettingsPage /></PermissionRoute>} />
                    <Route path="groups/new" element={<PermissionRoute permission="groups:create"><GroupEditPage /></PermissionRoute>} />
                    <Route path="groups/:id/edit" element={<PermissionRoute permission="groups:update"><GroupEditPage /></PermissionRoute>} />
                    <Route path="users" element={<Navigate to="/settings?tab=users" replace />} />
                    <Route path="groups" element={<Navigate to="/settings?tab=users" replace />} />
                    <Route path="system" element={<SystemInfoPage />} />
                    <Route path="alerts" element={<AlertsPage />} />
                    <Route path="alerts/*" element={<AlertsPage />} />
                    <Route path="alert-rules" element={<Navigate to="/alerts?tab=rules" replace />} />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="gcode-viewer" element={<GCodeViewerPage />} />
                    <Route path="external/:id" element={<ExternalLinkPage />} />
                    <Route path="camera-tokens" element={<Navigate to="/settings?tab=apikeys#card-camera-tokens" replace />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
            </SliceJobTrackerProvider>
            </ColorCatalogProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
