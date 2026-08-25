import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMail, FiLock, FiAlertCircle, FiEye, FiEyeOff } from 'react-icons/fi';
import { apiClient } from '../api';
import { useAuthStore } from '../store/auth';
import { useNotification } from '../components/NotificationContext';

function getLoginErrorMessage(error: any): string {
  const status = error?.status ?? error?.response?.status;

  if (status === 429) return 'Too many login attempts. Please wait and try again.';
  if (status === 401) return 'Invalid email or password.';
  if (status >= 500) return 'The service is temporarily unavailable. Please try again later.';
  return 'Unable to sign in. Please check your credentials and try again.';
}

export function LoginPage() {
  const navigate = useNavigate();
  const { setToken, setUser, token } = useAuthStore();
  const { showSuccess, showError } = useNotification();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimer = useRef<number | null>(null);

  useEffect(() => {
    // Prefill only from current tab session, never persistent localStorage.
    const savedEmail = sessionStorage.getItem('login_email');
    if (savedEmail) {
      setEmail(savedEmail);
    }

    if (token) {
      navigate('/dashboard', { replace: true });
    }

    return () => {
      if (cooldownTimer.current) window.clearTimeout(cooldownTimer.current);
    };
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();

    // Frontend validation — UX only, real validation must happen on backend.
    if (!trimmedEmail) {
      setError('Email is required.');
      return;
    }

    if (!password) {
      setError('Password is required.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (trimmedEmail.length > 254) {
      setError('Email is too long.');
      return;
    }

    if (password.length > 128) {
      setError('Password is too long.');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.login(trimmedEmail, password);
      setToken(response.access_token);

      // Only store email for current session, not persistent storage.
      if (rememberMe) {
        sessionStorage.setItem('login_email', trimmedEmail);
      } else {
        sessionStorage.removeItem('login_email');
      }

      // Fetch user profile. If this fails, the login must not continue.
      try {
        const userData = await apiClient.getMe();
        setUser(userData.data);
      } catch (userErr) {
        // Revoke token and abort login.
        setToken(null);
        setUser(null);

        // Optional: call logout endpoint if available.
        try {
          await apiClient.logout?.();
        } catch (_) {
          // Ignore cleanup failure.
        }

        setError('Login failed. Please try again.');
        showError('Login failed', 'Unable to load your profile. Please try again.');
        return;
      }

      showSuccess('Welcome back!', 'You have been successfully logged in.');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const friendly = getLoginErrorMessage(err);
      setError(friendly);
      showError('Login failed', friendly);

      const status = err?.status ?? err?.response?.status;

      if (status === 429) {
        setCooldown(true);

        const retryAfter = Number(
          err?.headers?.get?.('retry-after') ?? err?.retryAfterSeconds ?? 15,
        );

        cooldownTimer.current = window.setTimeout(
          () => setCooldown(false),
          retryAfter * 1000,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {typeof window !== 'undefined' && window.location.protocol !== 'https:' && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-amber-100 text-amber-800 px-4 py-2 rounded-xl text-sm shadow-lg flex items-center gap-2 z-10">
          <FiAlertCircle size={16} />
          You are not using a secure connection. Please switch to HTTPS.
        </div>
      )}

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-4 shadow-2xl border border-white/10">
            <span className="text-4xl">⚙️</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Business OS</h1>
          <p className="text-slate-300 text-sm">Secure Enterprise ERP System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 backdrop-blur-sm">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Sign In</h2>

          {error && (
            <div
              className="alert alert-error mb-6 flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm animate-shake"
              role="alert"
            >
              <FiAlertCircle className="flex-shrink-0 mt-0.5" size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <FiMail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                  disabled={loading}
                  maxLength={254}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-12 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  disabled={loading}
                />
                Remember me
              </label>

              <button
                type="button"
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                onClick={() => {
                  showSuccess(
                    'Coming soon',
                    'Password reset will be available in the next update.',
                  );
                }}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || cooldown}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in...
                </>
              ) : cooldown ? (
                'Too many attempts. Wait...'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Use HTTPS and a trusted device
          </div>
        </div>

        <p className="text-center text-slate-400 mt-8 text-sm">
          © {new Date().getFullYear()} Business OS. All rights reserved.
        </p>
      </div>

      <style>{`
        .animate-shake { animation: shake 0.4s ease-in-out; }
        @keyframes shake { 0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)} }
      `}</style>
    </div>
  );
}