import { useState, useEffect } from 'react';
import {
  User,
  Shield,
  Building2,
  Phone,
  Clock,
  Mail,
  LogOut,
  Save,
  Loader2,
  Lock,
  Radio,
  FileSpreadsheet,
  SlidersHorizontal,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, CardHeader, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { formatDateTime } from '../utils/date';

export function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const { showToast } = useToast();

  // Profile Form State
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Sync state when user profile is loaded
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || user.username || '');
      setPhone(user.phone || '');
      setOrganization(user.organization || 'Thủy điện Nậm Xây Luông 3');
      setTimezone(user.timezone || 'Asia/Ho_Chi_Minh');
    }
  }, [user]);

  // Handle Profile Update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      await api.updateProfile({
        display_name: displayName.trim(),
        phone: phone.trim(),
        organization: organization.trim(),
        timezone: timezone.trim(),
      });
      await refreshUser();
      showToast('Đã cập nhật hồ sơ thành công!', 'success');
    } catch (err: any) {
      console.error('Update profile error:', err);
      const msg = err?.message || 'Không thể cập nhật hồ sơ. Vui lòng kiểm tra lại.';
      showToast(msg, 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : 'ND';
  const roleName = user?.role_name || (user?.is_superuser ? 'Quản trị viên' : 'Kỹ sư vận hành');

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Hồ sơ người dùng
            </h1>
          </div>
        </div>

        <button
          onClick={logout}
          className="self-start sm:self-auto px-4 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-semibold transition flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Đăng xuất</span>
        </button>
      </div>

      {/* ── Main Content Grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Profile Edit Form */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-zinc-800/80 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Thông tin chi tiết & Cập nhật
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Chỉnh sửa các trường thông tin phục vụ liên lạc và múi giờ hệ thống
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" />
                  {roleName}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Tên đăng nhập (Readonly) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Tên đăng nhập
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={user?.username || ''}
                        disabled
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50 text-slate-500 dark:text-zinc-400 text-sm cursor-not-allowed font-mono font-medium"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>Email</span>
                    </label>
                    <input
                      type="email"
                      value={user?.email || 'Chưa cập nhật'}
                      disabled
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50 text-slate-500 dark:text-zinc-400 text-sm cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Tên hiển thị */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Tên hiển thị <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Văn A"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition font-medium"
                    />
                  </div>

                  {/* Số điện thoại */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Số điện thoại</span>
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ví dụ: 0987654321"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Đơn vị vận hành */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Đơn vị</span>
                    </label>
                    <input
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="Thủy điện Nậm Xây Luông 3"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                    />
                  </div>

                  {/* Múi giờ */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Múi giờ</span>
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                    >
                      <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (UTC+07:00 - Việt Nam)</option>
                      <option value="UTC">UTC (UTC+00:00)</option>
                      <option value="Asia/Bangkok">Asia/Bangkok (UTC+07:00)</option>
                    </select>
                  </div>
                </div>

                {/* Submit button */}
                <div className="pt-3 flex justify-end">
                  <Button
                    type="submit"
                    disabled={isSavingProfile}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-sm"
                  >
                    {isSavingProfile ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Lưu thay đổi hồ sơ</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (4 cols): Meta Cards */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card: Trạng thái tài khoản */}
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-zinc-800/80 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-base flex-shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {user?.display_name || user?.username}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                    @{user?.username}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-3.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-zinc-800/60">
                <span className="text-slate-500 dark:text-zinc-400">Trạng thái</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Đang hoạt động
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-zinc-800/60">
                <span className="text-slate-500 dark:text-zinc-400">Vai trò</span>
                <span className="font-bold text-slate-800 dark:text-zinc-200">{roleName}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-zinc-800/60">
                <span className="text-slate-500 dark:text-zinc-400">Quyền quản trị Django</span>
                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                  {user?.is_superuser ? 'Superuser' : user?.is_staff ? 'Staff' : 'User'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-zinc-800/60">
                <span className="text-slate-500 dark:text-zinc-400">Đăng nhập gần nhất</span>
                <span className="font-medium text-slate-700 dark:text-zinc-300">
                  {user?.last_login ? formatDateTime(user.last_login) : 'Chưa có'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500 dark:text-zinc-400">Ngày tham gia</span>
                <span className="font-medium text-slate-700 dark:text-zinc-300">
                  {user?.date_joined ? formatDateTime(user.date_joined) : user?.created_at ? formatDateTime(user.created_at) : '14/08/2026'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card: Lối tắt nghiệp vụ */}
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-zinc-800/80 px-6 py-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Lối tắt nghiệp vụ
              </h2>
            </CardHeader>
            <CardContent className="p-4 space-y-1.5">
              <Link
                to="/reports/legal"
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition"
              >
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                  <span>Báo cáo pháp lý</span>
                </div>
                <span className="text-slate-400">→</span>
              </Link>
              <Link
                to="/data-transmission"
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition"
              >
                <div className="flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-sky-500" />
                  <span>Truyền dữ liệu BCT</span>
                </div>
                <span className="text-slate-400">→</span>
              </Link>
              <Link
                to="/project-settings"
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition"
              >
                <div className="flex items-center gap-2.5">
                  <SlidersHorizontal className="w-4 h-4 text-amber-500" />
                  <span>Cài đặt dự án</span>
                </div>
                <span className="text-slate-400">→</span>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
