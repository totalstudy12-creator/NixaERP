import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  FiSave, FiRefreshCw, FiSettings, FiSearch, FiCopy, FiCheck,
  FiChevronDown, FiChevronUp, FiAlertCircle, FiPlus, FiTrash2,
  FiKey, FiX, FiCode, FiEye, FiEyeOff, FiLink, FiServer,
  FiGlobe, FiExternalLink, FiInfo, FiShield, FiDatabase,
} from 'react-icons/fi';
import { apiClient, API_BASE } from '../api';
import { useAuthStore } from '../store/auth';
import { useNotification } from '../components/NotificationContext';

interface SettingItem {
  id: number;
  key: string;
  value: string;
  group: string | null;
  description: string | null;
  is_public: boolean;
  type?: 'string' | 'boolean' | 'number' | 'json' | 'color' | 'select';
  options?: string[];
  defaultValue?: string;
}

function inferType(key: string): SettingItem['type'] {
  const lower = key.toLowerCase();
  if (lower.includes('color') || lower.includes('colour')) return 'color';
  if (lower.includes('maintenance') || lower.includes('enable') || lower.includes('notifications') || lower.includes('auto') || lower.includes('debug') || lower.includes('allow')) return 'boolean';
  if (lower.includes('currency') || lower.includes('timezone') || lower.includes('language') || lower.includes('theme') || lower.includes('mode')) return 'select';
  if (lower.includes('port') || lower.includes('limit') || lower.includes('timeout') || lower.includes('retry') || lower.includes('max') || lower.includes('min')) return 'number';
  if (lower.includes('json') || lower.includes('config') || lower.includes('payload') || lower.includes('mapping')) return 'json';
  return 'string';
}

const DEFAULT_OPTIONS: Record<string, string[]> = {
  currency: ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AED', 'AUD'],
  timezone: ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London', 'Asia/Dubai'],
  language: ['en', 'hi', 'es', 'fr', 'de', 'zh'],
  theme: ['light', 'dark', 'system'],
  date_format: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
  time_format: ['12h', '24h'],
};

const GROUP_META: Record<string, { icon: string; color: string }> = {
  general: { icon: '⚙️', color: 'bg-blue-100 text-blue-700' },
  finance: { icon: '💰', color: 'bg-emerald-100 text-emerald-700' },
  system: { icon: '🖥️', color: 'bg-purple-100 text-purple-700' },
  notifications: { icon: '🔔', color: 'bg-amber-100 text-amber-700' },
  security: { icon: '🔒', color: 'bg-rose-100 text-rose-700' },
  appearance: { icon: '🎨', color: 'bg-pink-100 text-pink-700' },
};

// Skeleton components
const SkeletonCard = () => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 animate-pulse">
    <div className="h-10 w-10 rounded-xl bg-slate-200" />
    <div className="space-y-2 flex-1">
      <div className="h-3 w-16 bg-slate-200 rounded" />
      <div className="h-6 w-8 bg-slate-200 rounded" />
    </div>
  </div>
);

const SkeletonTable = () => (
  <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4 animate-pulse">
    <div className="h-6 w-48 bg-slate-200 rounded" />
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex gap-4">
        <div className="h-4 w-1/3 bg-slate-200 rounded" />
        <div className="h-4 w-1/5 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
      </div>
    ))}
  </div>
);

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'api'>('settings');
  const [newSetting, setNewSetting] = useState({
    key: '',
    value: '',
    group: 'general',
    description: '',
    is_public: false,
  });
  const { showSuccess, showError } = useNotification();
  const authToken = useAuthStore((state) => state.token);

  // Build full API URL
  const fullApiUrl = useMemo(() => {
    if (API_BASE.startsWith('http')) {
      return API_BASE;
    }
    const baseUrl = window.location.origin;
    return `${baseUrl}${API_BASE}`;
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.request('GET', '/settings');
      const rawData = Array.isArray(response) ? response : response?.data;
      if (!rawData || !Array.isArray(rawData)) {
        throw new Error('Invalid settings response');
      }

      const enriched = rawData.map((item: SettingItem) => ({
        ...item,
        type: inferType(item.key),
        options: DEFAULT_OPTIONS[item.key.toLowerCase()] || [],
        defaultValue: item.value,
      }));
      setSettings(enriched);
      setExpandedGroups(prev => {
        const firstGroup = enriched[0]?.group || 'general';
        return { ...prev, [firstGroup]: true };
      });
    } catch (err: any) {
      const msg = err?.backendMessage || err?.message || 'Unable to load settings.';
      setError(msg);
      showError('Failed to load settings', msg);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const groupedSettings = useMemo(() => {
    const filtered = settings.filter(s =>
      s.key.toLowerCase().includes(search.toLowerCase()) ||
      (s.description || '').toLowerCase().includes(search.toLowerCase())
    );
    return filtered.reduce<Record<string, SettingItem[]>>((acc, item) => {
      const group = item.group || 'general';
      acc[group] = acc[group] || [];
      acc[group].push(item);
      return acc;
    }, {});
  }, [settings, search]);

  const totalSettings = settings.length;
  const visibleSettings = Object.values(groupedSettings).reduce((sum, arr) => sum + arr.length, 0);

  const handleValueChange = useCallback((id: number, value: string) => {
    setSettings(current =>
      current.map(item => (item.id === id ? { ...item, value } : item))
    );
  }, []);

  const saveSetting = useCallback(async (setting: SettingItem) => {
    setSaving(prev => ({ ...prev, [setting.key]: true }));
    try {
      if (setting.type === 'number' && isNaN(Number(setting.value))) {
        throw new Error('Invalid number');
      }
      if (setting.type === 'boolean') {
        setting.value = setting.value === 'true' ? 'true' : 'false';
      }
      if (setting.type === 'json') {
        JSON.parse(setting.value);
      }

      await apiClient.request('PUT', `/settings/${setting.key}`, {
        value: setting.value,
        group: setting.group,
        description: setting.description,
        is_public: setting.is_public,
      });
      showSuccess('Saved', `${setting.key} updated.`);
    } catch (err: any) {
      const msg = err?.backendMessage || err?.message || 'Save failed';
      showError('Save failed', msg);
      setSettings(current =>
        current.map(item =>
          item.id === setting.id ? { ...item, value: setting.defaultValue || '' } : item
        )
      );
    } finally {
      setSaving(prev => ({ ...prev, [setting.key]: false }));
    }
  }, [showSuccess, showError]);

  const saveAll = useCallback(async () => {
    const changed = settings.filter(s => s.value !== s.defaultValue);
    if (changed.length === 0) {
      showSuccess('No changes', 'All settings are up to date.');
      return;
    }
    let successCount = 0;
    for (const setting of changed) {
      setSaving(prev => ({ ...prev, [setting.key]: true }));
      try {
        await apiClient.request('PUT', `/settings/${setting.key}`, {
          value: setting.value,
          group: setting.group,
          description: setting.description,
          is_public: setting.is_public,
        });
        successCount++;
      } catch (err: any) {
        showError(`Failed to save ${setting.key}`, err?.message || 'Error');
      } finally {
        setSaving(prev => ({ ...prev, [setting.key]: false }));
      }
    }
    if (successCount > 0) {
      showSuccess('Saved', `${successCount} setting(s) updated.`);
      await loadSettings();
    }
  }, [settings, showSuccess, showError, loadSettings]);

  const createSetting = useCallback(async () => {
    if (!newSetting.key.trim()) {
      showError('Missing key', 'Setting key is required.');
      return;
    }
    setSaving(prev => ({ ...prev, new: true }));
    try {
      await apiClient.request('POST', '/settings', newSetting);
      showSuccess('Created', `Setting ${newSetting.key} added.`);
      setShowAddModal(false);
      setNewSetting({ key: '', value: '', group: 'general', description: '', is_public: false });
      await loadSettings();
    } catch (err: any) {
      const msg = err?.backendMessage || err?.message || 'Failed to create setting';
      showError('Create failed', msg);
    } finally {
      setSaving(prev => ({ ...prev, new: false }));
    }
  }, [newSetting, showSuccess, showError, loadSettings]);

  const deleteSetting = useCallback(async (key: string) => {
    if (!confirm(`Delete setting "${key}"?`)) return;
    try {
      await apiClient.request('DELETE', `/settings/${key}`);
      showSuccess('Deleted', `${key} removed.`);
      await loadSettings();
    } catch (err: any) {
      showError('Delete failed', err?.backendMessage || err?.message || 'Error');
    }
  }, [showSuccess, showError, loadSettings]);

  const copyToClipboard = useCallback((key: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }).catch(() => showError('Copy failed', 'Unable to copy to clipboard'));
  }, [showError]);

  const copyAuthToken = useCallback(() => {
    if (authToken) {
      copyToClipboard('auth-token', authToken);
    }
  }, [authToken, copyToClipboard]);

  const resetSetting = useCallback((setting: SettingItem) => {
    if (setting.defaultValue === undefined) return;
    handleValueChange(setting.id, setting.defaultValue);
    showSuccess('Reset', `${setting.key} reverted to default.`);
  }, [handleValueChange, showSuccess]);

  const toggleGroup = useCallback((group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  }, []);

  const renderInput = (setting: SettingItem) => {
    const commonClasses = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none transition";

    switch (setting.type) {
      case 'boolean':
        return (
          <button
            onClick={() => handleValueChange(setting.id, setting.value === 'true' ? 'false' : 'true')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${setting.value === 'true' ? 'bg-blue-600' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${setting.value === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        );
      case 'color':
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={setting.value.startsWith('#') ? setting.value : '#000000'}
              onChange={e => handleValueChange(setting.id, e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-slate-300"
            />
            <input
              type="text"
              value={setting.value}
              onChange={e => handleValueChange(setting.id, e.target.value)}
              className={commonClasses}
            />
          </div>
        );
      case 'number':
        return (
          <input
            type="number"
            value={setting.value}
            onChange={e => handleValueChange(setting.id, e.target.value)}
            className={commonClasses}
          />
        );
      case 'json':
        return (
          <textarea
            rows={3}
            value={setting.value}
            onChange={e => handleValueChange(setting.id, e.target.value)}
            className={`${commonClasses} font-mono text-xs`}
          />
        );
      case 'select':
        return (
          <select
            value={setting.value}
            onChange={e => handleValueChange(setting.id, e.target.value)}
            className={commonClasses}
          >
            {setting.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      default:
        return (
          <input
            type="text"
            value={setting.value}
            onChange={e => handleValueChange(setting.id, e.target.value)}
            className={commonClasses}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> System Configuration
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiSettings className="text-emerald-300" /> Settings
            <span className="text-sm font-normal text-emerald-100/70 ml-2">Control Center</span>
          </h1>
          <p className="text-sm text-slate-300">Manage application settings and API access</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void loadSettings()} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={loading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={() => void saveAll()} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20">
            <FiSave className="inline mr-1" size={14} /> Save All
          </button>
          <button onClick={() => setShowAddModal(true)} className="rounded-xl bg-emerald-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-emerald-300 shadow-md shadow-emerald-500/20">
            <FiPlus className="inline mr-1" size={14} /> Add Setting
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'settings' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          <FiSettings className="inline mr-1" size={14} /> Settings
        </button>
        <button
          onClick={() => setActiveTab('api')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'api' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          <FiCode className="inline mr-1" size={14} /> API Access
        </button>
      </div>

      {/* Search - Only show for settings tab */}
      {activeTab === 'settings' && (
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search settings..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 transition"
            />
          </div>
          <div className="text-sm text-slate-500 flex items-center">
            {visibleSettings} of {totalSettings} settings
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
          <FiAlertCircle size={20} /> {error}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="space-y-6">
            {settings.length === 0 ? (
              <div className="rounded-xl bg-white p-12 text-center shadow-sm">
                <FiSettings className="mx-auto mb-4 text-slate-300" size={48} />
                <h3 className="text-lg font-semibold text-slate-700">No settings found</h3>
                <p className="mt-2 text-slate-500">Get started by adding your first setting.</p>
              </div>
            ) : Object.keys(groupedSettings).length === 0 ? (
              <div className="rounded-xl bg-white p-12 text-center shadow-sm">
                <FiSearch className="mx-auto mb-3 text-slate-300" size={40} />
                <p className="text-slate-500">No settings match your search.</p>
              </div>
            ) : (
              Object.entries(groupedSettings).map(([group, items]) => {
                const meta = GROUP_META[group] || { icon: '📁', color: 'bg-slate-100 text-slate-700' };
                const isExpanded = expandedGroups[group] ?? false;
                return (
                  <div key={group} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <button
                      onClick={() => toggleGroup(group)}
                      className="flex w-full items-center justify-between px-6 py-4 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`rounded-lg px-2 py-1 text-lg ${meta.color}`}>{meta.icon}</span>
                        <div>
                          <h2 className="font-semibold capitalize text-slate-800">{group}</h2>
                          <p className="text-xs text-slate-500">{items.length} setting(s)</p>
                        </div>
                      </div>
                      {isExpanded ? <FiChevronUp size={20} /> : <FiChevronDown size={20} />}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-200 px-6 py-5">
                        <div className="space-y-4">
                          {items.map(setting => (
                            <div key={setting.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <div className="mb-3 flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-slate-800">{setting.key}</p>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${setting.is_public ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                                      {setting.is_public ? 'Public' : 'Internal'}
                                    </span>
                                  </div>
                                  <p className="text-sm text-slate-500">{setting.description || 'No description available.'}</p>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => copyToClipboard(setting.key, setting.value)}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                                  >
                                    {copiedKey === setting.key ? <FiCheck size={14} className="text-emerald-500" /> : <FiCopy size={14} />}
                                  </button>
                                  <button
                                    onClick={() => deleteSetting(setting.key)}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                                  >
                                    <FiTrash2 size={14} className="text-rose-500" />
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="flex-1">{renderInput(setting)}</div>
                                <button
                                  onClick={() => saveSetting(setting)}
                                  disabled={saving[setting.key]}
                                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                                >
                                  {saving[setting.key] ? <FiRefreshCw className="animate-spin" size={14} /> : <FiSave size={14} />}
                                  Save
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )
      )}

      {/* API Access Tab */}
      {activeTab === 'api' && (
        <div className="space-y-6">
          {/* API URL Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <FiServer className="text-blue-600" size={18} /> API Base URL
              </h2>
            </div>
            <div className="px-6 py-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-slate-100 px-3 py-3 text-sm font-mono break-all">
                  {fullApiUrl}
                </code>
                <button
                  onClick={() => copyToClipboard('api-url', fullApiUrl)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition"
                  title="Copy API URL"
                >
                  {copiedKey === 'api-url' ? <FiCheck size={16} className="text-emerald-500" /> : <FiCopy size={16} />}
                </button>
                <a
                  href={fullApiUrl + '/status'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition"
                  title="Open API Status"
                >
                  <FiExternalLink size={16} />
                </a>
              </div>
            </div>
          </div>

          {/* Authentication Token Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <FiShield className="text-purple-600" size={18} /> Authentication Token (Bearer)
              </h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-slate-100 px-3 py-3 text-sm font-mono break-all">
                  {showAuthToken ? (authToken || 'No token available') : '••••••••••••••••••••••••••••••••••••••••••••••••'}
                </code>
                <button
                  onClick={() => setShowAuthToken(!showAuthToken)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition"
                  title={showAuthToken ? 'Hide token' : 'Show token'}
                >
                  {showAuthToken ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
                <button
                  onClick={copyAuthToken}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition"
                  title="Copy auth token"
                >
                  {copiedKey === 'auth-token' ? <FiCheck size={16} className="text-emerald-500" /> : <FiCopy size={16} />}
                </button>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-700 flex items-center gap-1">
                  <FiInfo size={14} /> Use this token in the Authorization header:
                </p>
                <code className="block mt-1 text-xs bg-white rounded px-2 py-1">
                  Authorization: Bearer YOUR_TOKEN
                </code>
              </div>
            </div>
          </div>

          {/* Example Requests */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-teal-50">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <FiCode className="text-emerald-600" size={18} /> Example API Requests
              </h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">GET Request (cURL)</p>
                <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs overflow-x-auto">
{`curl -X GET "${fullApiUrl}/settings" \\
  -H "Authorization: Bearer ${authToken || 'YOUR_TOKEN'}" \\
  -H "Accept: application/json"`}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">POST Request (cURL)</p>
                <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs overflow-x-auto">
{`curl -X POST "${fullApiUrl}/settings" \\
  -H "Authorization: Bearer ${authToken || 'YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "key": "example_setting",
    "value": "example_value",
    "group": "general",
    "description": "Example setting",
    "is_public": false
  }'`}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">JavaScript (Fetch API)</p>
                <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs overflow-x-auto">
{`fetch("${fullApiUrl}/settings", {
  method: "GET",
  headers: {
    "Authorization": "Bearer ${authToken || 'YOUR_TOKEN'}",
    "Accept": "application/json"
  }
})
.then(response => response.json())
.then(data => console.log(data));`}
                </pre>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <FiGlobe className="text-amber-600" size={18} /> Quick Links
              </h2>
            </div>
            <div className="px-6 py-4 grid grid-cols-2 gap-3">
              <a
                href={fullApiUrl + '/status'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50 transition"
              >
                <FiDatabase className="text-blue-500" size={16} />
                API Status
              </a>
              <a
                href={fullApiUrl + '/settings/quickstart'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50 transition"
              >
                <FiCode className="text-emerald-500" size={16} />
                Quickstart Guide
              </a>
              <a
                href={fullApiUrl + '/settings/export'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50 transition"
              >
                <FiLink className="text-purple-500" size={16} />
                Export Settings
              </a>
              <a
                href={fullApiUrl + '/dashboard/analytics'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50 transition"
              >
                <FiGlobe className="text-rose-500" size={16} />
                Dashboard API
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Add Setting Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-4">Add Setting</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Key *</label>
                <input
                  type="text"
                  value={newSetting.key}
                  onChange={e => setNewSetting(prev => ({ ...prev, key: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="e.g., maintenance_mode"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Value</label>
                <input
                  type="text"
                  value={newSetting.value}
                  onChange={e => setNewSetting(prev => ({ ...prev, value: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Group</label>
                <select
                  value={newSetting.group}
                  onChange={e => setNewSetting(prev => ({ ...prev, group: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {Object.keys(GROUP_META).map(g => <option key={g} value={g}>{g}</option>)}
                  <option value="other">other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={newSetting.description}
                  onChange={e => setNewSetting(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newSetting.is_public}
                  onChange={e => setNewSetting(prev => ({ ...prev, is_public: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm">Public setting</span>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void createSetting()}
                disabled={saving['new']}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
              >
                {saving['new'] && <FiRefreshCw className="animate-spin" size={14} />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}