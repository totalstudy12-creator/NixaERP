import { useEffect, useMemo, useState } from 'react';
import { FiSave, FiRefreshCw, FiSettings as FiGear } from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

interface SettingItem {
  id: number;
  key: string;
  value: string;
  group: string | null;
  description: string | null;
  is_public: boolean;
}

const fallbackSettings: SettingItem[] = [
  { id: 1, key: 'app_name', value: 'Raptor ERP', group: 'general', description: 'Business name shown across the app.', is_public: true },
  { id: 2, key: 'currency', value: 'USD', group: 'finance', description: 'Default currency used for reports.', is_public: true },
  { id: 3, key: 'timezone', value: 'UTC', group: 'system', description: 'Default timezone for scheduling and logs.', is_public: false },
  { id: 4, key: 'maintenance_mode', value: 'false', group: 'system', description: 'Enable maintenance mode for guests.', is_public: false },
  { id: 5, key: 'email_notifications', value: 'true', group: 'notifications', description: 'Send app notifications by email.', is_public: true },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>(fallbackSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showSuccess, showError } = useNotification();

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.request('GET', '/settings');
      const data = Array.isArray(response) ? response : response?.data || fallbackSettings;
      setSettings(data.length ? data : fallbackSettings);
    } catch (err: any) {
      const msg = err?.backendMessage || err?.message || 'Unable to load settings.';
      setError(msg);
      setSettings(fallbackSettings);
      showError('Using fallback settings', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const groupedSettings = useMemo(() => {
    return settings.reduce<Record<string, SettingItem[]>>((acc, item) => {
      const group = item.group || 'general';
      acc[group] = acc[group] || [];
      acc[group].push(item);
      return acc;
    }, {});
  }, [settings]);

  const handleSave = async (setting: SettingItem, value: string) => {
    setSaving(true);
    try {
      await apiClient.request('PUT', `/settings/${setting.key}`, {
        value,
        group: setting.group,
        description: setting.description,
        is_public: setting.is_public,
      });
      showSuccess('Setting updated', `${setting.key} saved.`);
      await loadSettings();
    } catch (err: any) {
      const msg = err?.backendMessage || err?.message || 'Unable to save setting.';
      showError('Save failed', msg);
      setError(msg);
      setSettings((current) =>
        current.map((item) => (item.id === setting.id ? { ...item, value } : item))
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
            <FiGear /> Settings
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Application settings</h1>
          <p className="text-slate-600">Manage app configuration and default business preferences.</p>
        </div>
        <button onClick={() => void loadSettings()} disabled={loading} className="btn btn-secondary gap-2">
          <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">{error}</div>}

      <div className="grid gap-6">
        {Object.entries(groupedSettings).map(([group, items]) => (
          <div key={group} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold capitalize text-slate-800">{group}</h2>
            <div className="space-y-4">
              {items.map((setting) => (
                <div key={setting.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-800">{setting.key}</p>
                      <p className="text-sm text-slate-500">{setting.description || 'No description available.'}</p>
                    </div>
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                      {setting.is_public ? 'Public' : 'Internal'}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <input
                      className="input-field flex-1"
                      value={setting.value || ''}
                      onChange={(e) => {
                        setSettings((current) =>
                          current.map((item) => (item.id === setting.id ? { ...item, value: e.target.value } : item))
                        );
                      }}
                    />
                    <button onClick={() => void handleSave(setting, setting.value || '')} disabled={saving} className="btn btn-primary gap-2">
                      <FiSave /> Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
