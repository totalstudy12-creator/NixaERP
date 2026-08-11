import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMail, FiLock, FiAlertCircle, FiEye, FiEyeOff } from 'react-icons/fi';
import { apiClient } from '../api';
import { useAuthStore } from '../store/auth';
import { useNotification } from '../components/NotificationContext';

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
  // Rate limit cooldown (client‑side hint)
  const [cooldown, setCooldown] = useState(false);

  // Load saved email from localStorage (encrypted or just plain)
  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
    // If already logged in, redirect to dashboard
    if (token) {
      navigate('/dashboard', { replace: true });
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.login(email, password);
      setToken(response.access_token);

      // Remember me functionality
      if (rememberMe) {
        localStorage.setItem('remembered_email', email);
      } else {
        localStorage.removeItem('remembered_email');
      }

      // Fetch user details (with error handling)
      try {
        const userData = await apiClient.getMe();
        setUser(userData.data);
      } catch (userErr: any) {
        // Token might be valid but user fetch failed – still logged in, but notify
        console.error('Failed to load user profile', userErr);
        showError('Profile load failed', 'Logged in with limited access.');
      }

      showSuccess('Welcome back!', 'You have been successfully logged in.');
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err.message || 'Login failed. Please check your credentials.';
      setError(msg);
      showError('Login failed', msg);
      // If rate limit hint from API, enable cooldown
      if (err.status === 429) {
        setCooldown(true);
        setTimeout(() => setCooldown(false), 15_000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {/* Optionally show HTTPS warning if not secure */}
      {window.location.protocol !== 'https:' && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-amber-100 text-amber-800 px-4 py-2 rounded-xl text-sm shadow-lg flex items-center gap-2">
          <FiAlertCircle size={16} />
          You are not using a secure connection. Please switch to HTTPS.
        </div>
      )}

      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-block bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-4 shadow-2xl border border-white/10">
            <span className="text-4xl">⚙️</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Business OS</h1>
          <p className="text-slate-300 text-sm">Secure Enterprise ERP System</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 backdrop-blur-sm">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Sign In</h2>

          {error && (
            <div className="alert alert-error mb-6 flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm animate-shake">
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
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
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
                  showSuccess('Coming soon', 'Password reset will be available in the next update.');
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
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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

          {/* Security notice */}
          <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Encrypted & secure connection
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 mt-8 text-sm">
          © {new Date().getFullYear()} Business OS. All rights reserved.
        </p>
      </div>

      {/* Animation styles */}
      <style>{`
        .animate-shake { animation: shake 0.4s ease-in-out; }
        @keyframes shake { 0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)} }
      `}</style>
    </div>
  );
}