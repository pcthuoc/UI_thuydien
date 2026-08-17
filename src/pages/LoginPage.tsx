import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import { X, Mail, Shield, Smartphone, Key, Sun, Moon } from 'lucide-react';
import { api, type LoginResponse, type OIDCProvider, type TokenPersistence } from '../api/client';
import { Button } from '../components/Button';
import { PotecoLogo } from '../components/PotecoLogo';

type LoginStep = 'credentials' | '2fa' | 'reset-password';

// sessionStorage survives the OIDC provider round-trip; React state does not.
// Read + remove in one try so all branches in the OIDC useEffect see the same
// value and a subsequent page load does not replay the flag.
const REMEMBER_ME_KEY = 'auth_remember_me';
const POST_LOGIN_REDIRECT_KEY = 'auth_post_login_redirect';

function toPersistence(remember: boolean): TokenPersistence {
  return remember ? 'persistent' : 'session';
}

function consumeSavedRememberMe(): boolean {
  try {
    const saved = sessionStorage.getItem(REMEMBER_ME_KEY) === '1';
    sessionStorage.removeItem(REMEMBER_ME_KEY);
    return saved;
  } catch (err) {
    console.warn('consumeSavedRememberMe: sessionStorage unavailable, Remember Me preference lost across OIDC redirect', err);
    return false;
  }
}

// Only accept same-origin internal paths. Rejects protocol-relative (`//evil.com`),
// absolute URLs, and the login page itself (would loop). Anything else falls
// back to `/` so a tampered sessionStorage entry can't open-redirect.
function sanitizeRedirectTarget(target: string | null | undefined): string | null {
  if (!target) return null;
  if (!target.startsWith('/')) return null;
  if (target.startsWith('//')) return null;
  if (target.startsWith('/login')) return null;
  return target;
}

function stashPostLoginRedirect(target: string): void {
  const safe = sanitizeRedirectTarget(target);
  if (!safe) return;
  try {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, safe);
  } catch (err) {
    console.warn('stashPostLoginRedirect: sessionStorage unavailable, post-login target will be lost across OIDC redirect', err);
  }
}

function consumePostLoginRedirect(): string | null {
  try {
    const saved = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    return sanitizeRedirectTarget(saved);
  } catch (err) {
    console.warn('consumePostLoginRedirect: sessionStorage unavailable', err);
    return null;
  }
}

/**
 * Single OIDC-provider login button. Extracted from the `.map()` body
 * because hooks can't be used inside a loop callback — the `iconFailed`
 * state is per-provider and must live in its own component instance.
 *
 * On `<img>` load failure (provider deleted between page load and image
 * fetch, network blip, etc.) we flip to the Shield fallback rather than
 * showing the browser's broken-image glyph to anonymous users (#1333 review).
 */
function OIDCProviderButton({
  provider,
  onClick,
  disabled,
}: {
  provider: OIDCProvider;
  onClick: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [iconFailed, setIconFailed] = useState(false);
  const showIcon = provider.has_icon && !iconFailed;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-bambu-dark-secondary border border-bambu-dark-tertiary hover:border-bambu-green/50 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
    >
      {showIcon ? (
        <img
          src={api.oidcProviderIconUrl(provider.id)}
          alt=""
          className="w-5 h-5 object-contain"
          onError={() => setIconFailed(true)}
        />
      ) : (
        <Shield className="w-5 h-5 text-bambu-green" />
      )}
      {t('login.twoFA.signInWith', { provider: provider.name })}
    </button>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { login, loginWithToken, user, loading } = useAuth();
  const { showToast } = useToast();
  const { mode, toggleMode } = useTheme();

  // Resolve the post-login destination, preferring router state (set by
  // ProtectedRoute when it redirects an unauthed visit) over the sessionStorage
  // stash (used to survive the OIDC provider round-trip, which kills React
  // state). Falls back to `/` and rejects unsafe targets via sanitize.
  function resolvePostLoginRedirect(): string {
    const fromState = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
    if (fromState?.pathname) {
      const target = `${fromState.pathname}${fromState.search ?? ''}`;
      const safe = sanitizeRedirectTarget(target);
      if (safe) return safe;
    }
    return consumePostLoginRedirect() ?? '/';
  }

  // Credentials step state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  // 2FA step state
  const [step, setStep] = useState<LoginStep>('credentials');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [twoFAMethods, setTwoFAMethods] = useState<string[]>([]);
  const [twoFAMethod, setTwoFAMethod] = useState<'totp' | 'email' | 'backup'>('totp');
  const [twoFACode, setTwoFACode] = useState('');
  const [emailOTPSent, setEmailOTPSent] = useState(false);
  const twoFAInputRef = useRef<HTMLInputElement>(null);

  const [rememberMe, setRememberMe] = useState(false);

  // H-6: Password reset step state
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Check if advanced auth is enabled
  const { data: advancedAuthStatus } = useQuery({
    queryKey: ['advancedAuthStatus'],
    queryFn: () => api.getAdvancedAuthStatus(),
  });

  // Fetch enabled OIDC providers for login buttons
  const { data: oidcProviders } = useQuery({
    queryKey: ['oidcProviders'],
    queryFn: () => api.getOIDCProviders(),
  });

  // #1589: autologin redirect with fallback. When the backend reports an
  // `autologin_provider_id`, redirect unauthenticated visitors directly to
  // that provider's authorize URL on mount — unless the URL carries
  // `?fallback=local` (the documented recovery path that pairs with the
  // server-side BAMBUDDY_LOCAL_LOGIN env-var bypass). The authorize-URL
  // fetch is raced against a 5-second timeout; on timeout or fetch error
  // we skip the redirect and render the normal page, surfacing a banner
  // so the user understands why autologin didn't kick in.
  const [autologinFailed, setAutologinFailed] = useState(false);

  // #1889: redirect already-authenticated visitors away from /login. Without
  // this, a valid session that lands directly on /login (e.g. the browser
  // address bar autocompletes the origin to its most-visited path) renders the
  // credentials form even though the token is live and every request succeeds —
  // making Bambuddy look like it "never stays logged in". Gate on the
  // credentials step so we don't interrupt the 2FA / OIDC-callback branches,
  // which navigate themselves after loginWithToken. Send to '/' rather than
  // resolvePostLoginRedirect() to avoid consuming the OIDC redirect stash: an
  // already-authed direct visit has no pending redirect to honour.
  useEffect(() => {
    if (!loading && user && step === 'credentials') {
      navigate('/', { replace: true });
    }
  }, [loading, user, step, navigate]);

  const autologinAttemptedRef = useRef(false);
  useEffect(() => {
    if (autologinAttemptedRef.current) return;
    const fallbackQuery = searchParams.get('fallback');
    if (fallbackQuery === 'local') return;
    if (!advancedAuthStatus || !advancedAuthStatus.autologin_provider_id) return;
    // Don't redirect mid-OIDC-exchange (we're already coming back from the IdP).
    const hash = window.location.hash;
    if (hash.startsWith('#oidc_token=') || searchParams.get('oidc_error')) return;
    autologinAttemptedRef.current = true;

    const providerId = advancedAuthStatus.autologin_provider_id;
    const timeoutPromise = new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error('autologin timeout')), 5000),
    );
    Promise.race([api.getOIDCAuthorizeUrl(providerId), timeoutPromise])
      .then((result) => {
        window.location.href = (result as { auth_url: string }).auth_url;
      })
      .catch(() => {
        setAutologinFailed(true);
      });
  }, [advancedAuthStatus, searchParams]);

  const localLoginEnabled = advancedAuthStatus?.local_login_enabled !== false;
  const showAutologinBanner = autologinFailed && advancedAuthStatus?.autologin_provider_id != null;

  // M-B: Detect #reset_token=... in the URL fragment and switch to the reset step.
  // Fragments are never sent to the server so the token never appears in access-logs
  // or Referer headers — mirrors the H-4 treatment of the OIDC token.
  useEffect(() => {
    const hash = window.location.hash;
    const token = hash.startsWith('#reset_token=') ? hash.slice('#reset_token='.length) : null;
    if (token) {
      setResetToken(token);
      setStep('reset-password');
      // Clear the fragment from the URL so it can't be bookmarked or re-triggered.
      navigate('/login', { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle OIDC callback: if #oidc_token=... is present in the fragment, exchange it.
  // H-4: Read from the URL fragment (#) — fragments are never sent to the server
  // so the exchange token stays out of access logs and Referer headers.
  useEffect(() => {
    const hash = window.location.hash;
    const oidcToken = hash.startsWith('#oidc_token=') ? hash.slice('#oidc_token='.length) : null;
    const oidcError = searchParams.get('oidc_error');

    if (!oidcToken && !oidcError) return;

    const savedRememberMe = consumeSavedRememberMe();

    if (oidcError) {
      // L-3: Whitelist known OIDC error codes so provider-controlled text is never
      // shown verbatim. Any unknown code falls back to a generic message.
      const KNOWN_OIDC_ERRORS: Record<string, string> = {
        oidc_provider_error: t('login.oidcErrors.providerError'),
        missing_parameters: t('login.oidcErrors.missingParameters'),
        invalid_state: t('login.oidcErrors.invalidState'),
        state_expired: t('login.oidcErrors.stateExpired'),
        provider_not_found: t('login.oidcErrors.providerNotFound'),
        discovery_failed: t('login.oidcErrors.discoveryFailed'),
        invalid_discovery_document: t('login.oidcErrors.invalidDiscovery'),
        token_exchange_network_error: t('login.oidcErrors.networkError'),
        token_exchange_bad_response: t('login.oidcErrors.badResponse'),
        no_id_token: t('login.oidcErrors.noIdToken'),
        token_validation_failed: t('login.oidcErrors.validationFailed'),
        nonce_mismatch: t('login.oidcErrors.nonceMismatch'),
        missing_sub_claim: t('login.oidcErrors.missingSubClaim'),
        no_linked_account: t('login.oidcErrors.noLinkedAccount'),
        account_inactive: t('login.oidcErrors.accountInactive'),
        user_resolution_failed: t('login.oidcErrors.userResolutionFailed'),
        internal_error: t('login.oidcErrors.internalError'),
      };
      // Dynamic codes like "token_exchange_<provider_code>" → generic message
      const errorMsg = KNOWN_OIDC_ERRORS[oidcError]
        ?? (oidcError.startsWith('token_exchange_') ? t('login.oidcErrors.tokenExchangeFailed') : t('login.oidcLoginFailed'));
      showToast(errorMsg, 'error');
      navigate('/login', { replace: true });
      return;
    }

    if (oidcToken) {
      api.exchangeOIDCToken(oidcToken).then((resp: LoginResponse) => {
        if (resp.requires_2fa && resp.pre_auth_token) {
          // OIDC user has 2FA enabled — redirect to 2FA step
          setRememberMe(savedRememberMe);
          setPreAuthToken(resp.pre_auth_token);
          const methods = resp.two_fa_methods ?? [];
          setTwoFAMethods(methods);
          if (methods.includes('totp')) setTwoFAMethod('totp');
          else if (methods.includes('email')) setTwoFAMethod('email');
          else setTwoFAMethod('backup');
          setStep('2fa');
          // Remove oidc_token from URL so page refresh doesn't re-trigger exchange
          navigate('/login', { replace: true });
        } else if (resp.access_token && resp.user) {
          loginWithToken(resp.access_token, resp.user, toPersistence(savedRememberMe));
          showToast(t('login.loginSuccess'));
          navigate(resolvePostLoginRedirect(), { replace: true });
        } else {
          showToast(t('login.oidcLoginFailed'), 'error');
          navigate('/login', { replace: true });
        }
      }).catch((err: unknown) => {
        console.error('OIDC token exchange failed', err);
        showToast(t('login.oidcLoginFailed'), 'error');
        navigate('/login', { replace: true });
      });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Step 1: Credentials login ---
  const loginMutation = useMutation({
    mutationFn: () => login(username, password, toPersistence(rememberMe)),
    onSuccess: (resp: LoginResponse) => {
      if (resp.requires_2fa && resp.pre_auth_token) {
        // 2FA required — switch to verification step
        setPreAuthToken(resp.pre_auth_token);
        const methods = resp.two_fa_methods ?? [];
        setTwoFAMethods(methods);
        if (methods.includes('totp')) setTwoFAMethod('totp');
        else if (methods.includes('email')) setTwoFAMethod('email');
        else setTwoFAMethod('backup');
        setStep('2fa');
      } else if (resp.access_token || resp.user) {
        showToast('Đăng nhập thành công!', 'success');
        navigate(resolvePostLoginRedirect(), { replace: true });
      }
    },
    onError: (error: Error) => {
      showToast(error.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản.', 'error');
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: (email: string) => api.forgotPassword({ email }),
    onSuccess: (data) => {
      showToast(data.message || 'Đã gửi liên kết khôi phục tới email của bạn.', 'success');
      setShowForgotPassword(false);
      setForgotEmail('');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Không thể gửi email khôi phục.', 'error');
    },
  });

  // H-6: Mutation to set a new password using the reset token from the email link
  const resetPasswordMutation = useMutation({
    mutationFn: () => api.forgotPasswordConfirm(resetToken, newPassword),
    onSuccess: (data) => {
      showToast(data.message || 'Đặt lại mật khẩu thành công.', 'success');
      setStep('credentials');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Đặt lại mật khẩu thất bại.', 'error');
    },
  });

  // --- Step 2: 2FA verification ---
  const sendEmailOTPMutation = useMutation({
    mutationFn: () => api.sendEmailOTP(preAuthToken),
    onSuccess: (data: { message: string; pre_auth_token?: string }) => {
      setEmailOTPSent(true);
      if (data.pre_auth_token) setPreAuthToken(data.pre_auth_token);
      showToast(data.message || 'Đã gửi mã xác thực tới email.', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Gửi mã xác thực thất bại.', 'error');
    },
  });

  const verify2FAMutation = useMutation({
    mutationFn: () =>
      api.verify2FA({ pre_auth_token: preAuthToken, code: twoFACode, method: twoFAMethod }),
    onSuccess: (resp: LoginResponse) => {
      if (resp.access_token && resp.user) {
        loginWithToken(resp.access_token, resp.user, toPersistence(rememberMe));
        showToast('Đăng nhập thành công!', 'success');
        navigate(resolvePostLoginRedirect(), { replace: true });
      } else {
        showToast('Xác thực thất bại.', 'error');
      }
    },
    onError: (error: Error) => {
      showToast(error.message || 'Mã xác thực không hợp lệ.', 'error');
      setTwoFACode('');
    },
  });

  // OIDC login
  const oidcLoginMutation = useMutation({
    mutationFn: (providerId: number) => api.getOIDCAuthorizeUrl(providerId),
    onSuccess: (data) => {
      if (rememberMe) {
        try {
          sessionStorage.setItem(REMEMBER_ME_KEY, '1');
        } catch (err) {
          console.warn('setItem auth_remember_me failed', err);
        }
      }
      const fromState = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
      if (fromState?.pathname) {
        stashPostLoginRedirect(`${fromState.pathname}${fromState.search ?? ''}`);
      }
      window.location.href = data.auth_url;
    },
    onError: (error: Error) => {
      showToast(error.message || 'Đăng nhập SSO thất bại.', 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      showToast('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.', 'error');
      return;
    }
    loginMutation.mutate();
  };

  const handle2FASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFACode.trim()) {
      showToast(t('login.twoFA.enterCode'), 'error');
      return;
    }
    verify2FAMutation.mutate();
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      showToast(t('login.enterEmail'), 'error');
      return;
    }
    forgotPasswordMutation.mutate(forgotEmail);
  };

  const handleMethodChange = (method: 'totp' | 'email' | 'backup') => {
    setTwoFAMethod(method);
    setTwoFACode('');
    setEmailOTPSent(false);
    // Re-focus the code input after method switch (autoFocus only fires on mount)
    setTimeout(() => twoFAInputRef.current?.focus(), 0);
  };

  // ---- Render: password-reset step (H-6) ----
  if (step === 'reset-password') {
    const handleResetSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmPassword) {
        showToast(t('login.resetPassword.passwordsDoNotMatch'), 'error');
        return;
      }
      if (newPassword.length < 8) {
        showToast(t('login.resetPassword.passwordTooShort'), 'error');
        return;
      }
      resetPasswordMutation.mutate();
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-zinc-950 p-4 transition-colors">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xl">
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20">
                <Key className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">{t('login.resetPassword.title')}</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">{t('login.resetPassword.subtitle')}</p>
          </div>

          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                {t('login.resetPassword.newPassword')}
              </label>
              <input
                id="new-password"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="block w-full px-4 py-3 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm"
                placeholder={t('login.resetPassword.newPasswordPlaceholder')}
                autoFocus
                autoComplete="new-password"
                minLength={8}
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                {t('login.resetPassword.confirmPassword')}
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full px-4 py-3 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm"
                placeholder={t('login.resetPassword.confirmPasswordPlaceholder')}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={resetPasswordMutation.isPending || !newPassword || !confirmPassword}
              className="w-full flex justify-center py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {resetPasswordMutation.isPending ? t('login.resetPassword.saving') : t('login.resetPassword.submit')}
            </button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setResetToken('');
                setNewPassword('');
                setConfirmPassword('');
              }}
              className="text-sm font-semibold text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {t('login.resetPassword.backToLogin')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Render: 2FA step ----
  if (step === '2fa') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-zinc-950 p-4 transition-colors">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xl">
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20">
                <Shield className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">{t('login.twoFA.title')}</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">{t('login.twoFA.subtitle')}</p>
          </div>

          {/* Method selector — only show if multiple methods available */}
          {twoFAMethods.length > 1 && (
            <div className="flex gap-2">
              {twoFAMethods.includes('totp') && (
                <button
                  type="button"
                  onClick={() => handleMethodChange('totp')}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                    twoFAMethod === 'totp'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-emerald-500/50'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  {t('login.twoFA.methodAuthenticator')}
                </button>
              )}
              {twoFAMethods.includes('email') && (
                <button
                  type="button"
                  onClick={() => handleMethodChange('email')}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                    twoFAMethod === 'email'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-emerald-500/50'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  {t('login.twoFA.methodEmail')}
                </button>
              )}
              {twoFAMethods.includes('backup') && (
                <button
                  type="button"
                  onClick={() => handleMethodChange('backup')}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                    twoFAMethod === 'backup'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-emerald-500/50'
                  }`}
                >
                  <Key className="w-4 h-4" />
                  {t('login.twoFA.methodBackup')}
                </button>
              )}
            </div>
          )}

          <form onSubmit={handle2FASubmit} className="space-y-4">
            {/* Method-specific instructions */}
            {twoFAMethod === 'totp' && (
              <p className="text-sm text-slate-500 dark:text-zinc-400">{t('login.twoFA.instructionsTotp')}</p>
            )}
            {twoFAMethod === 'email' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  {emailOTPSent
                    ? t('login.twoFA.instructionsEmail')
                    : t('login.twoFA.instructionsEmailNotSent')}
                </p>
                {!emailOTPSent && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => sendEmailOTPMutation.mutate()}
                    disabled={sendEmailOTPMutation.isPending}
                  >
                    {sendEmailOTPMutation.isPending
                      ? t('login.twoFA.sendingCode')
                      : t('login.twoFA.sendCodeButton')}
                  </Button>
                )}
                {emailOTPSent && (
                  <button
                    type="button"
                    onClick={() => { setEmailOTPSent(false); sendEmailOTPMutation.mutate(); }}
                    className="text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    {t('login.twoFA.resendCode')}
                  </button>
                )}
              </div>
            )}
            {twoFAMethod === 'backup' && (
              <p className="text-sm text-slate-500 dark:text-zinc-400">{t('login.twoFA.instructionsBackup')}</p>
            )}

            <div>
              <label htmlFor="twofa-code" className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                {twoFAMethod === 'backup'
                  ? t('login.twoFA.backupCodeLabel')
                  : t('login.twoFA.codeLabel')}
              </label>
              <input
                ref={twoFAInputRef}
                id="twofa-code"
                type="text"
                inputMode={twoFAMethod === 'backup' ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value.trim())}
                disabled={twoFAMethod === 'email' && !emailOTPSent}
                className="block w-full px-4 py-3 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 text-center tracking-widest text-xl font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors disabled:opacity-40"
                placeholder={twoFAMethod === 'backup'
                  ? t('login.twoFA.backupCodePlaceholder')
                  : t('login.twoFA.codePlaceholder')}
                maxLength={twoFAMethod === 'backup' ? 8 : 6}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={
                verify2FAMutation.isPending ||
                !twoFACode.trim() ||
                (twoFAMethod === 'email' && !emailOTPSent)
              }
              className="w-full flex justify-center py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {verify2FAMutation.isPending
                ? t('login.twoFA.verifyingButton')
                : t('login.twoFA.verifyButton')}
            </button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setPreAuthToken('');
                setTwoFACode('');
                setEmailOTPSent(false);
              }}
              className="text-sm font-semibold text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {t('login.twoFA.backToLogin')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Render: credentials step ----
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-100 dark:bg-zinc-950 p-4 transition-colors">
      {/* Dark / Light Mode Toggle Button */}
      <div className="absolute top-5 right-5 z-20">
        <button
          type="button"
          onClick={toggleMode}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition shadow-sm flex items-center gap-2 text-xs font-semibold"
          title={mode === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
        >
          {mode === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
          <span>{mode === 'dark' ? 'Giao diện Sáng' : 'Giao diện Tối'}</span>
        </button>
      </div>

      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xl">
        <div className="text-center">
          <div className="flex items-center justify-center mb-5">
            <PotecoLogo variant="full" className="h-14 w-auto drop-shadow-sm" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Hệ Thống Quan Trắc Thủy Điện
          </h2>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-zinc-400 font-medium">
            Nền tảng Giám sát & Điều hành Thủy văn
          </p>
        </div>

        {showAutologinBanner && (
          <div className="mt-6 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 font-medium">
            {t('login.autologinFailed')}
          </div>
        )}

        {!localLoginEnabled && (
          <div className="mt-6 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50 px-4 py-3 text-sm text-slate-500 dark:text-zinc-400">
            {t('login.localDisabledNotice')}
          </div>
        )}

        {localLoginEnabled && (
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-bold text-slate-700 dark:text-zinc-300 mb-2">
                Tên đăng nhập hoặc Email
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full px-4 py-3 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm"
                placeholder="Nhập tên đăng nhập hoặc email..."
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-bold text-slate-700 dark:text-zinc-300 mb-2">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-4 py-3 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm"
                placeholder="Nhập mật khẩu truy cập..."
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-zinc-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="remember-me" className="text-sm font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white cursor-pointer select-none">
              Ghi nhớ đăng nhập
            </label>
          </div>

          <div>
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full flex justify-center py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/25 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {loginMutation.isPending ? 'Đang xác thực tài khoản...' : 'Đăng nhập hệ thống'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              Quên mật khẩu?
            </button>
          </div>
        </form>
        )}

        {/* OIDC provider buttons */}
        {oidcProviders && oidcProviders.length > 0 && (
          <div className="space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-zinc-900 text-slate-500 dark:text-zinc-400 font-medium">{t('login.twoFA.orContinueWith')}</span>
              </div>
            </div>

            <div className="space-y-2">
              {oidcProviders.map((provider) => (
                <OIDCProviderButton
                  key={provider.id}
                  provider={provider}
                  onClick={() => oidcLoginMutation.mutate(provider.id)}
                  disabled={oidcLoginMutation.isPending}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setShowForgotPassword(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-5"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Mail className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Khôi phục mật khẩu</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotEmail('');
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {advancedAuthStatus?.advanced_auth_enabled ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-slate-500 dark:text-zinc-400 text-xs leading-relaxed">
                  Nhập địa chỉ email của bạn để nhận liên kết khôi phục mật khẩu truy cập hệ thống.
                </p>

                <div>
                  <label htmlFor="forgot-email" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Địa chỉ Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="block w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-xs"
                    placeholder="name@vietsun.vn"
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1 rounded-xl text-xs font-semibold"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotEmail('');
                    }}
                  >
                    Hủy bỏ
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                    disabled={forgotPasswordMutation.isPending}
                  >
                    {forgotPasswordMutation.isPending ? 'Đang gửi...' : 'Gửi liên kết'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-slate-500 dark:text-zinc-400 text-xs leading-relaxed">
                  {t('login.forgotPasswordMessage')}
                </p>

                <div className="bg-slate-50 dark:bg-zinc-800/60 rounded-xl p-4 space-y-2 border border-slate-100 dark:border-zinc-800">
                  <p className="text-xs text-slate-900 dark:text-white font-bold">{t('login.howToReset')}</p>
                  <ol className="text-xs text-slate-600 dark:text-zinc-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>{t('login.resetStep1')}</li>
                    <li>{t('login.resetStep2')}</li>
                    <li>{t('login.resetStep3')}</li>
                    <li>{t('login.resetStep4')}</li>
                  </ol>
                </div>

                <Button
                  variant="secondary"
                  className="w-full rounded-xl text-xs font-bold"
                  onClick={() => setShowForgotPassword(false)}
                >
                  {t('login.gotIt')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
