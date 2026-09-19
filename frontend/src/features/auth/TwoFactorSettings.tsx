import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FiCheck, FiCopy, FiShield, FiAlertCircle } from 'react-icons/fi';
import { apiClient } from '../../api';

type Stage = 'loading' | 'disabled' | 'setup' | 'enabled';

export function TwoFactorSettings() {
  const [stage, setStage] = useState<Stage>('loading');
  const [remaining, setRemaining] = useState(0);
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await apiClient.getTwoFactorStatus();
      setRemaining(status.recovery_codes_remaining);
      setStage(status.enabled ? 'enabled' : status.pending ? 'setup' : 'disabled');
    } catch {
      setError('Unable to load two-factor status.');
      setStage('disabled');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Clipboard access is unavailable.');
    }
  };

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const res = await apiClient.enableTwoFactor(password);
      setSecret(res.secret);
      setOtpauthUrl(res.otpauth_url);
      setPassword('');
      setStage('setup');
    } catch (err: any) {
      setError(err?.status === 422 ? 'Password is incorrect.' : 'Unable to start setup.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const res = await apiClient.confirmTwoFactor(code.replace(/\s+/g, ''));
      setRecoveryCodes(res.recovery_codes);
      setCode('');
      await refresh();
    } catch (err: any) {
      setError(err?.status === 422 ? 'Invalid code. Check your device clock and try again.' : 'Confirmation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      await apiClient.disableTwoFactor(password, code.replace(/\s+/g, '').toUpperCase());
      setPassword('');
      setCode('');
      setRecoveryCodes([]);
      await refresh();
    } catch (err: any) {
      setError(err?.status === 422 ? 'Password or code is incorrect.' : 'Unable to disable two-factor.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setBusy(true);
    setError('');

    try {
      const res = await apiClient.regenerateRecoveryCodes(password);
      setRecoveryCodes(res.recovery_codes);
      setPassword('');
      await refresh();
    } catch (err: any) {
      setError(err?.status === 422 ? 'Password is incorrect.' : 'Unable to regenerate codes.');
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'loading') {
    return <div className="text-sm text-slate-500">Loading security settings…</div>;
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="bg-blue-50 text-blue-600 rounded-xl p-2">
          <FiShield size={20} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Two-Factor Authentication</h3>
          <p className="text-sm text-slate-500">Protect your account with a TOTP authenticator app.</p>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
          <FiAlertCircle className="flex-shrink-0 mt-0.5" size={18} />
          <span>{error}</span>
        </div>
      )}

      {stage === 'disabled' && (
        <form onSubmit={handleEnable} className="space-y-4">
          <p className="text-sm text-slate-600">
            Confirm your password to generate a secret and QR code.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            required
            disabled={busy}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? 'Starting…' : 'Enable two-factor'}
          </button>
        </form>
      )}

      {stage === 'setup' && (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            Scan this QR code with Google Authenticator, 1Password, Authy, or any TOTP app. Then enter the 6-digit code to confirm.
          </p>

          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-xl">
              <QRCodeSVG value={otpauthUrl} size={192} level="M" />
            </div>

            <div className="w-full">
              <p className="text-xs text-slate-500 mb-1">Or enter this key manually:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700">
                  {secret}
                </code>
                <button
                  type="button"
                  onClick={() => copy(secret, 'secret')}
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700"
                  aria-label="Copy secret"
                >
                  {copied === 'secret' ? <FiCheck size={16} /> : <FiCopy size={16} />}
                </button>
              </div>
            </div>
          </div>

          <form onSubmit={handleConfirm} className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              maxLength={6}
              required
              disabled={busy}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg font-mono tracking-[0.3em] focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? 'Confirming…' : 'Confirm and enable'}
            </button>
          </form>
        </div>
      )}

      {stage === 'enabled' && (
        <div className="space-y-5">
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Two-factor authentication is active. Recovery codes remaining: <strong>{remaining}</strong>
          </p>

          {recoveryCodes.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">
                Save these recovery codes now — they will not be shown again.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {recoveryCodes.map((c) => (
                  <code key={c} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700">
                    {c}
                  </code>
                ))}
              </div>
              <button
                type="button"
                onClick={() => copy(recoveryCodes.join('\n'), 'codes')}
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
              >
                {copied === 'codes' ? <FiCheck size={14} /> : <FiCopy size={14} />}
                Copy all
              </button>
            </div>
          )}

          <div className="border-t border-slate-200 pt-5 space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">Regenerate recovery codes</p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                disabled={busy}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none"
              />
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={busy || password.length === 0}
                className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-900 disabled:opacity-60"
              >
                Regenerate
              </button>
            </div>

            <form onSubmit={handleDisable} className="space-y-3 border-t border-slate-200 pt-5">
              <p className="text-sm font-medium text-slate-700">Disable two-factor</p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                required
                disabled={busy}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none"
              />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code or recovery code"
                required
                disabled={busy}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 disabled:opacity-60"
              >
                {busy ? 'Disabling…' : 'Disable two-factor'}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}