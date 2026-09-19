import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  FiAlertCircle,
  FiCheck,
  FiCopy,
  FiEye,
  FiEyeOff,
  FiLoader,
  FiRefreshCw,
  FiShield,
  FiTrash2,
} from 'react-icons/fi';
import { apiClient } from '../../api';
import { useNotification } from '../../components/NotificationContext';

type Stage = 'loading' | 'disabled' | 'setup' | 'enabled';

interface StatusResponse {
  enabled?: boolean;
  pending?: boolean;
  recovery_codes_remaining?: number;
}

interface EnableResponse {
  secret?: string;
  otpauth_url?: string;
}

interface RecoveryCodesResponse {
  recovery_codes?: string[];
}

function readError(err: unknown, fallback: string): string {
  const e = err as { backendMessage?: string; message?: string };
  return e?.backendMessage || e?.message || fallback;
}

export function TwoFactorSettings() {
  const { showSuccess, showError } = useNotification();

  const [stage, setStage] = useState<Stage>('loading');
  const [remaining, setRemaining] = useState(0);
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(
    async (value: string, key: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(key);
        window.setTimeout(() => setCopied(null), 2000);
      } catch {
        showError('Copy failed', 'Clipboard access is unavailable in this browser.');
      }
    },
    [showError],
  );

  const loadStatus = useCallback(async () => {
    setError('');
    try {
      const res = await apiClient.request('GET', '/auth/2fa/status');
      const data = ((res?.data ?? res) ?? {}) as StatusResponse;
      setRemaining(Number(data.recovery_codes_remaining ?? 0));
      setStage(data.enabled ? 'enabled' : data.pending ? 'setup' : 'disabled');
    } catch (err) {
      setError(readError(err, 'Unable to load two-factor status.'));
      setStage('disabled');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleEnable = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError('');
      try {
        const res = await apiClient.request('POST', '/auth/2fa/enable', { password });
        const data = ((res?.data ?? res) ?? {}) as EnableResponse;
        if (!data.secret || !data.otpauth_url) {
          throw new Error('Server returned a malformed setup response.');
        }
        setSecret(data.secret);
        setOtpauthUrl(data.otpauth_url);
        setPassword('');
        setStage('setup');
      } catch (err: any) {
        setError(
          err?.status === 422
            ? 'Password is incorrect.'
            : readError(err, 'Unable to start two-factor setup.'),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, password],
  );

  const handleConfirm = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy) return;
      const normalized = code.replace(/\s+/g, '');
      if (!/^\d{6}$/.test(normalized)) {
        setError('Enter the 6-digit code from your authenticator app.');
        return;
      }
      setBusy(true);
      setError('');
      try {
        const res = await apiClient.request('POST', '/auth/2fa/confirm', { code: normalized });
        const data = ((res?.data ?? res) ?? {}) as RecoveryCodesResponse;
        const codes = Array.isArray(data.recovery_codes) ? data.recovery_codes : [];
        setRecoveryCodes(codes);
        setShowRecovery(codes.length > 0);
        setCode('');
        showSuccess('Two-factor enabled', 'Save your recovery codes now — they will not be shown again.');
        await loadStatus();
      } catch (err: any) {
        setError(
          err?.status === 422
            ? 'Invalid code. Check your device clock and try again.'
            : readError(err, 'Confirmation failed.'),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, code, loadStatus, showSuccess],
  );

  const handleDisable = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy) return;
      if (!password || !code) {
        setError('Password and verification code are required.');
        return;
      }
      setBusy(true);
      setError('');
      try {
        await apiClient.request('POST', '/auth/2fa/disable', {
          password,
          code: code.replace(/\s+/g, '').toUpperCase(),
        });
        setPassword('');
        setCode('');
        setRecoveryCodes([]);
        setShowRecovery(false);
        showSuccess('Two-factor disabled', 'You can re-enable it at any time.');
        await loadStatus();
      } catch (err: any) {
        setError(
          err?.status === 422
            ? 'Password or verification code is incorrect.'
            : readError(err, 'Unable to disable two-factor.'),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, password, code, loadStatus, showSuccess],
  );

  const handleRegenerate = useCallback(async () => {
    if (busy) return;
    if (!password) {
      setError('Enter your current password to regenerate recovery codes.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await apiClient.request('POST', '/auth/2fa/recovery-codes', { password });
      const data = ((res?.data ?? res) ?? {}) as RecoveryCodesResponse;
      const codes = Array.isArray(data.recovery_codes) ? data.recovery_codes : [];
      setRecoveryCodes(codes);
      setShowRecovery(codes.length > 0);
      setPassword('');
      showSuccess('Recovery codes regenerated', 'Store them somewhere safe — old codes are now invalid.');
      await loadStatus();
    } catch (err: any) {
      setError(
        err?.status === 422
          ? 'Password is incorrect.'
          : readError(err, 'Unable to regenerate recovery codes.'),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, password, loadStatus, showSuccess]);

  const inputClasses =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-60';

  const meta = useMemo(() => {
    if (stage === 'enabled') {
      return {
        label: 'Enabled',
        badge: 'bg-emerald-100 text-emerald-700',
      };
    }
    if (stage === 'setup') {
      return {
        label: 'Setup in progress',
        badge: 'bg-amber-100 text-amber-700',
      };
    }
    return {
      label: 'Disabled',
      badge: 'bg-slate-200 text-slate-700',
    };
  }, [stage]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-gradient-to-r from-blue-50 via-white to-indigo-50 px-6 py-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <FiShield size={22} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                Account Security
              </p>
              <h2 className="text-xl font-bold text-slate-800">Two-Factor Authentication</h2>
              <p className="mt-1 text-sm text-slate-600">
                Protect your account with a TOTP authenticator app (Google Authenticator, 1Password, Authy).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${meta.badge}`}>
              {meta.label}
            </span>
            <button
              type="button"
              onClick={() => void loadStatus()}
              disabled={stage === 'loading' || busy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <FiRefreshCw size={13} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-5 p-6">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          >
            <FiAlertCircle className="mt-0.5 shrink-0" size={16} />
            <span>{error}</span>
          </div>
        )}

        {stage === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <FiLoader className="animate-spin" size={16} />
            Loading two-factor status…
          </div>
        )}

        {stage === 'disabled' && (
          <form onSubmit={handleEnable} className="space-y-4">
            <p className="text-sm text-slate-600">
              Confirm your current password to generate a new secret and QR code.
            </p>
            <PasswordField
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggle={() => setShowPassword((p) => !p)}
              disabled={busy}
              className={inputClasses}
            />
            <button
              type="submit"
              disabled={busy || password.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? <FiLoader className="animate-spin" size={15} /> : <FiShield size={15} />}
              {busy ? 'Starting…' : 'Enable two-factor'}
            </button>
          </form>
        )}

        {stage === 'setup' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Scan the QR code, then enter the 6-digit code from your app to confirm. The
              secret is only valid until you confirm.
            </div>

            <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <QRCodeSVG value={otpauthUrl} size={192} level="M" />
              </div>

              <div className="w-full min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-slate-500">
                  Can&apos;t scan? Enter this key manually:
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                    {secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copy(secret, 'secret')}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    aria-label="Copy secret"
                  >
                    {copied === 'secret' ? (
                      <FiCheck className="text-emerald-600" size={16} />
                    ) : (
                      <FiCopy size={16} />
                    )}
                  </button>
                </div>

                <form onSubmit={handleConfirm} className="mt-4 space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    maxLength={6}
                    disabled={busy}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={busy || code.replace(/\s+/g, '').length !== 6}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {busy ? 'Confirming…' : 'Confirm and enable'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {stage === 'enabled' && (
          <div className="space-y-5">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Two-factor authentication is active. Recovery codes remaining:{' '}
              <strong>{remaining}</strong>
            </div>

            {showRecovery && recoveryCodes.length > 0 && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Save these recovery codes now
                    </p>
                    <p className="text-xs text-amber-700">
                      Each code can be used once. They will not be shown again.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copy(recoveryCodes.join('\n'), 'codes')}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  >
                    {copied === 'codes' ? <FiCheck size={12} /> : <FiCopy size={12} />}
                    Copy all
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {recoveryCodes.map((c) => (
                    <code
                      key={c}
                      className="rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-center font-mono text-xs text-slate-700"
                    >
                      {c}
                    </code>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowRecovery(false)}
                  className="text-xs text-amber-800 underline-offset-2 hover:underline"
                >
                  I have saved them — hide
                </button>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">Regenerate recovery codes</p>
              <p className="mt-1 text-xs text-slate-500">
                Generating new codes invalidates all existing ones. Use this if you suspect
                your codes have been compromised.
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((p) => !p)}
                  disabled={busy}
                  className={inputClasses}
                  placeholder="Current password"
                />
                <button
                  type="button"
                  onClick={() => void handleRegenerate()}
                  disabled={busy || password.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
                >
                  {busy ? <FiLoader className="animate-spin" size={14} /> : <FiRefreshCw size={14} />}
                  Regenerate
                </button>
              </div>
            </div>

            <form
              onSubmit={handleDisable}
              className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4"
            >
              <div>
                <p className="text-sm font-semibold text-rose-900">Disable two-factor</p>
                <p className="mt-1 text-xs text-rose-700">
                  You will be signed out of all devices when two-factor is disabled.
                </p>
              </div>

              <PasswordField
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggle={() => setShowPassword((p) => !p)}
                disabled={busy}
                className={inputClasses}
                placeholder="Current password"
              />

              <input
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code or recovery code"
                disabled={busy}
                className={inputClasses}
              />

              <button
                type="submit"
                disabled={busy || !password || !code}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {busy ? <FiLoader className="animate-spin" size={14} /> : <FiTrash2 size={14} />}
                {busy ? 'Disabling…' : 'Disable two-factor'}
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className: string;
  placeholder?: string;
}

function PasswordField({
  value,
  onChange,
  show,
  onToggle,
  disabled,
  className,
  placeholder = 'Current password',
}: PasswordFieldProps) {
  return (
    <div className="relative w-full">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="current-password"
        disabled={disabled}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        {show ? <FiEyeOff size={14} /> : <FiEye size={14} />}
      </button>
    </div>
  );
}