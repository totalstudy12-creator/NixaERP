import { useEffect, useRef, useState } from 'react';
import { FiAlertCircle, FiArrowLeft, FiShield } from 'react-icons/fi';
import { apiClient } from '../../api';
import { useAuthStore } from '../../store/auth';

interface Props {
  challengeToken: string;
  expiresIn: number;
  onCancel: () => void;
  onSuccess: () => void;
}

export function TwoFactorChallengeForm({ challengeToken, expiresIn, onCancel, onSuccess }: Props) {
  const { setToken, setUser } = useAuthStore();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(expiresIn);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [secondsLeft]);

  const expired = secondsLeft <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || expired) return;

    const normalized = code.replace(/\s+/g, '').toUpperCase();

    if (!normalized) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    if (!/^(\d{6}|[A-Z0-9-]{8,32})$/.test(normalized)) {
      setError('Enter a 6-digit code or one of your recovery codes.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await apiClient.verifyTwoFactor(challengeToken, normalized);
      setToken(res.access_token);

      const me = await apiClient.getMe();
      setUser(me.data);

      onSuccess();
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;

      if (status === 429) {
        setError('Too many attempts. Please wait and sign in again.');
      } else if (status === 401) {
        setError('Invalid or expired code. Please try again.');
      } else {
        setError('Verification failed. Please try again.');
      }

      setCode('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8">
      <button
        type="button"
        onClick={onCancel}
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <FiArrowLeft size={16} />
        Back
      </button>

      <div className="flex items-center gap-3 mb-2">
        <div className="bg-blue-50 text-blue-600 rounded-xl p-2">
          <FiShield size={22} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Two-Factor Verification</h2>
      </div>

      <p className="text-sm text-slate-500 mb-6">
        Enter the 6-digit code from your authenticator app, or use a recovery code.
      </p>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm"
        >
          <FiAlertCircle className="flex-shrink-0 mt-0.5" size={18} />
          <span>{error}</span>
        </div>
      )}

      {expired && (
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          This session expired. Please sign in again.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="two_factor_code" className="block text-sm font-medium text-slate-700 mb-2">
            Verification code
          </label>
          <input
            id="two_factor_code"
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={32}
            disabled={loading || expired}
            placeholder="123456"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-lg tracking-[0.3em] font-mono shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={loading || expired}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? 'Verifying…' : 'Verify'}
        </button>
      </form>

      {!expired && (
        <p className="text-center text-xs text-slate-400 mt-4">
          Expires in {minutes}:{seconds}
        </p>
      )}
    </div>
  );
}