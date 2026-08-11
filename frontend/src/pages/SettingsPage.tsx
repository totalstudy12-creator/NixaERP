import { useEffect, useMemo, useState } from 'react';
import { FiSave, FiRefreshCw } from 'react-icons/fi';
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

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showSuccess, showError } = useNotification();

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.request('GET', '/settings');
      const data = Array.isArray(response) ? response : response.data || [];
      setSettings(data);
    } catch (err: any) {
      const msg = err.message || 'Unable to load settings.';
      setError(msg);
      showError('Load failed', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
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
      await apiClient.request('PUT', `/settings/${setting.key}`, { value });
      showSuccess('Setting updated', `${setting.key} saved.`);
      await loadSettings();
    } catch (err: any) {
      const msg = err.message || 'Unable to save setting.';
      showError('Save failed', msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600">Manage application configuration and demo defaults.</p>
        </div>
        <button onClick={() => loadSettings()} disabled={loading} className="btn btn-secondary gap-2">
          <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-yellow-400 bg-yellow-50 p-3 text-yellow-800">{error}</div>}

      <div className="grid gap-6">
        {Object.entries(groupedSettings).map(([group, items]) => (
          <div key={group} className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold capitalize text-gray-800">{group}</h2>
            <div className="space-y-4">
              {items.map((setting) => (
                <div key={setting.key} className="rounded-lg border border-gray-200 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">{setting.key}</p>
                      <p className="text-sm text-gray-500">{setting.description || 'No description'}</p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                      {setting.is_public ? 'Public' : 'Internal'}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <input
                      className="input-field flex-1"
                      value={setting.value || ''}
                      onChange={(e) => {
                        const next = settings.map((item) => item.id === setting.id ? { ...item, value: e.target.value } : item);
                        setSettings(next);
                      }}
                    />
                    <button onClick={() => handleSave(setting, setting.value || '')} disabled={saving} className="btn btn-primary gap-2">
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
