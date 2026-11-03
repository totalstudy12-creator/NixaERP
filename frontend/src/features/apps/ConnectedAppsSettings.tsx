// src/features/apps/ConnectedAppsSettings.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiSmartphone,
  FiPlus,
  FiRefreshCw,
  FiCheck,
  FiCopy,
  FiEdit,
  FiTrash2,
  FiKey,
  FiActivity,
  FiAlertTriangle,
  FiExternalLink,
  FiCpu,
  FiBox,
  FiCreditCard,
  FiLayers,
  FiEye,
  FiEyeOff,
  FiX,
  FiClock,
  FiCheckCircle,
  FiUploadCloud,
  FiCode,
  FiPlay,
  FiShield,
  FiDownload,
} from 'react-icons/fi';

import { apiClient } from '../../api';
import { useNotification } from '../../components/NotificationContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface ConnectedAppItem {
  id: number;
  name: string;
  app_identifier: string;
  description: string | null;
  category: 'wms' | 'ai_agent' | 'billing' | 'custom';
  platform: string;
  current_version: string;
  min_supported_version: string;
  force_update: boolean;
  apk_download_url: string | null;
  release_notes: string | null;
  is_active: boolean;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  api_key: string;
  allowed_roles: string[] | null;
  settings: Record<string, unknown> | null;
  last_sync_at: string | null;
  created_at?: string;
  updated_at?: string;
}

const AVAILABLE_ROLES = [
  'Super Admin',
  'Admin',
  'Warehouse Manager',
  'Warehouse Staff',
  'Sales Manager',
  'Sales Representative',
  'Cashier',
  'Accountant',
  'Director',
];

export function ConnectedAppsSettings() {
  const { showSuccess, showError } = useNotification();

  const [apps, setApps] = useState<ConnectedAppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [revealedKeys, setRevealedKeys] = useState<Record<number, boolean>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null);

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<ConnectedAppItem | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // OTA Quick Deployment Modal State
  const [otaModalApp, setOtaModalApp] = useState<ConnectedAppItem | null>(null);
  const [otaForm, setOtaForm] = useState({
    current_version: '',
    min_supported_version: '',
    force_update: false,
    apk_download_url: '',
    release_notes: '',
  });
  const [otaSubmitting, setOtaSubmitting] = useState(false);

  // Interactive OTA Simulator State
  const [simulatorApp, setSimulatorApp] = useState<ConnectedAppItem | null>(null);
  const [simulatingVersion, setSimulatingVersion] = useState('1.0.0');
  const [simulatorLoading, setSimulatorLoading] = useState(false);
  const [simulatorResult, setSimulatorResult] = useState<any>(null);

  // Flutter Code Integration Modal State
  const [codeGuideApp, setCodeGuideApp] = useState<ConnectedAppItem | null>(null);

  // Test Handshake State
  const [testingHandshakeId, setTestingHandshakeId] = useState<string | null>(null);
  const [handshakeResult, setHandshakeResult] = useState<{ identifier: string; data: unknown } | null>(null);

  // Create / Edit Form State
  const [formData, setFormData] = useState({
    name: '',
    app_identifier: '',
    description: '',
    category: 'custom' as 'wms' | 'ai_agent' | 'billing' | 'custom',
    platform: 'flutter',
    current_version: '1.2.3',
    min_supported_version: '1.0.0',
    force_update: false,
    apk_download_url: '',
    release_notes: '',
    is_active: true,
    maintenance_mode: false,
    maintenance_message: '',
    allowed_roles: [] as string[],
  });

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getConnectedApps();
      const list = (res as { data?: ConnectedAppItem[] })?.data || res;
      if (Array.isArray(list)) {
        setApps(list);
      }
    } catch {
      showError('Failed to load apps', 'Could not retrieve connected application registry.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  const openCreateModal = () => {
    setEditingApp(null);
    setFormData({
      name: '',
      app_identifier: '',
      description: '',
      category: 'custom',
      platform: 'flutter',
      current_version: '1.2.3',
      min_supported_version: '1.0.0',
      force_update: false,
      apk_download_url: '',
      release_notes: '',
      is_active: true,
      maintenance_mode: false,
      maintenance_message: '',
      allowed_roles: ['Admin'],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (app: ConnectedAppItem) => {
    setEditingApp(app);
    setFormData({
      name: app.name,
      app_identifier: app.app_identifier,
      description: app.description || '',
      category: app.category,
      platform: app.platform || 'flutter',
      current_version: app.current_version,
      min_supported_version: app.min_supported_version,
      force_update: Boolean(app.force_update),
      apk_download_url: app.apk_download_url || '',
      release_notes: app.release_notes || '',
      is_active: Boolean(app.is_active),
      maintenance_mode: Boolean(app.maintenance_mode),
      maintenance_message: app.maintenance_message || '',
      allowed_roles: Array.isArray(app.allowed_roles) ? app.allowed_roles : [],
    });
    setIsModalOpen(true);
  };

  const handleSaveApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.app_identifier.trim()) {
      showError('Validation Error', 'Application name and identifier are required.');
      return;
    }

    setFormSubmitting(true);
    try {
      if (editingApp) {
        await apiClient.updateConnectedApp(editingApp.id, formData);
        showSuccess('Updated', `Application '${formData.name}' updated.`);
      } else {
        await apiClient.createConnectedApp(formData);
        showSuccess('Created', `Application '${formData.name}' registered with secure API token.`);
      }
      setIsModalOpen(false);
      void loadApps();
    } catch (err: unknown) {
      const errorObj = err as { backendMessage?: string; message?: string };
      showError('Save failed', errorObj.backendMessage || errorObj.message || 'Could not save application.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteApp = async (app: ConnectedAppItem) => {
    if (!window.confirm(`Delete application '${app.name}'? All client sync will be revoked.`)) return;
    try {
      await apiClient.deleteConnectedApp(app.id);
      showSuccess('Deleted', `Application '${app.name}' removed.`);
      void loadApps();
    } catch {
      showError('Delete failed', 'Could not remove application.');
    }
  };

  const handleRegenerateToken = async (app: ConnectedAppItem) => {
    if (!window.confirm(`Regenerate API token for '${app.name}'? Connected Flutter devices must update their token.`)) return;
    try {
      await apiClient.regenerateAppToken(app.id);
      showSuccess('Token Regenerated', `New API key generated for ${app.name}.`);
      void loadApps();
    } catch {
      showError('Token error', 'Could not regenerate token.');
    }
  };

  // Quick Toggles
  const handleToggleMaintenance = async (app: ConnectedAppItem) => {
    const nextMode = !app.maintenance_mode;
    try {
      await apiClient.updateConnectedApp(app.id, {
        maintenance_mode: nextMode,
        maintenance_message: nextMode
          ? `${app.name} is currently undergoing scheduled maintenance. Please retry shortly.`
          : '',
      });
      showSuccess('Status Updated', `${app.name} maintenance mode ${nextMode ? 'ENABLED' : 'DISABLED'}.`);
      void loadApps();
    } catch {
      showError('Update failed', 'Could not change maintenance mode.');
    }
  };

  const handleToggleForceUpdate = async (app: ConnectedAppItem) => {
    const nextForce = !app.force_update;
    try {
      await apiClient.updateConnectedApp(app.id, { force_update: nextForce });
      showSuccess('OTA Policy Updated', `Mandatory update ${nextForce ? 'ENFORCED' : 'OPTIONAL'} for ${app.name}.`);
      void loadApps();
    } catch {
      showError('Update failed', 'Could not toggle force update policy.');
    }
  };

  const handleToggleActive = async (app: ConnectedAppItem) => {
    const nextActive = !app.is_active;
    try {
      await apiClient.updateConnectedApp(app.id, { is_active: nextActive });
      showSuccess('Status Updated', `${app.name} is now ${nextActive ? 'ACTIVE' : 'DISABLED'}.`);
      void loadApps();
    } catch {
      showError('Update failed', 'Could not change app status.');
    }
  };

  // OTA Quick Deploy Modal
  const openOtaDeployModal = (app: ConnectedAppItem) => {
    setOtaModalApp(app);
    setOtaForm({
      current_version: app.current_version,
      min_supported_version: app.min_supported_version,
      force_update: Boolean(app.force_update),
      apk_download_url: app.apk_download_url || '',
      release_notes: app.release_notes || '',
    });
  };

  const handleSaveOtaDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otaModalApp) return;

    setOtaSubmitting(true);
    try {
      await apiClient.updateConnectedApp(otaModalApp.id, otaForm);
      showSuccess('OTA Deployed', `Version ${otaForm.current_version} published for ${otaModalApp.name}!`);
      setOtaModalApp(null);
      void loadApps();
    } catch (err: any) {
      showError('Deployment failed', err?.backendMessage || err?.message || 'Could not deploy OTA update.');
    } finally {
      setOtaSubmitting(false);
    }
  };

  // OTA Simulator
  const openSimulator = (app: ConnectedAppItem) => {
    setSimulatorApp(app);
    setSimulatingVersion('1.0.0');
    setSimulatorResult(null);
    void runSimulation(app.app_identifier, '1.0.0');
  };

  const runSimulation = async (identifier: string, version: string) => {
    setSimulatorLoading(true);
    try {
      const res = await apiClient.checkAppOta(identifier, version);
      setSimulatorResult(res);
    } catch (err: any) {
      setSimulatorResult(err?.response?.data || { error: 'Connection failed' });
    } finally {
      setSimulatorLoading(false);
    }
  };

  const handleTestHandshake = async (app: ConnectedAppItem) => {
    setTestingHandshakeId(app.app_identifier);
    try {
      const res = await apiClient.getAppHandshake(app.app_identifier, '1.2.3');
      setHandshakeResult({ identifier: app.app_identifier, data: res });
      showSuccess('Handshake Verified', `Successfully synced with ${app.name} API endpoint.`);
    } catch (err: unknown) {
      const errorObj = err as { backendMessage?: string; message?: string };
      showError('Handshake Failed', errorObj.backendMessage || errorObj.message || 'Handshake rejected.');
    } finally {
      setTestingHandshakeId(null);
    }
  };

  const handleCopyKey = async (id: number, key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKeyId(id);
      window.setTimeout(() => setCopiedKeyId(null), 1500);
      showSuccess('Copied', 'API key copied to clipboard.');
    } catch {
      showError('Copy failed', 'Could not copy to clipboard.');
    }
  };

  const toggleRoleSelection = (role: string) => {
    setFormData((prev) => {
      const exists = prev.allowed_roles.includes(role);
      return {
        ...prev,
        allowed_roles: exists ? prev.allowed_roles.filter((r) => r !== role) : [...prev.allowed_roles, role],
      };
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'wms':
        return <FiBox className="text-cyan-500" size={20} />;
      case 'ai_agent':
        return <FiCpu className="text-emerald-500" size={20} />;
      case 'billing':
        return <FiCreditCard className="text-violet-500" size={20} />;
      default:
        return <FiLayers className="text-blue-500" size={20} />;
    }
  };

  const filteredApps = apps.filter((app) => {
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    const matchesSearch =
      !search ||
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.app_identifier.toLowerCase().includes(search.toLowerCase()) ||
      (app.description || '').toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-purple-50 p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                Flutter Mobile Ecosystem · RaptorERP v1.2.3
              </p>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Flutter Mobile Apps &amp; OTA Update Manager
            </h2>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              Live control hub for <strong>Nixa WMS</strong>, <strong>Nixa AI Agent</strong>, and <strong>Nixa Billing POS</strong>. Push Over-The-Air (OTA) updates, toggle maintenance mode, enforce version upgrades, and test mobile client handshakes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadApps}
              disabled={loading}
              className="h-9 rounded-xl border-slate-300 text-xs text-slate-700"
            >
              <FiRefreshCw className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} size={13} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={openCreateModal}
              className="h-9 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              <FiPlus className="mr-1.5" size={14} /> Add Application
            </Button>
          </div>
        </div>

        {/* Quick Stats Pill */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-indigo-100 bg-white/90 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Total Registered Apps</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">{apps.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-white/90 p-3">
            <p className="text-[10px] font-bold uppercase text-emerald-600">Active Flutter Apps</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-700">{apps.filter((a) => a.is_active).length}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white/90 p-3">
            <p className="text-[10px] font-bold uppercase text-amber-600">Under Maintenance</p>
            <p className="mt-0.5 text-lg font-bold text-amber-700">{apps.filter((a) => a.maintenance_mode).length}</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-white/90 p-3">
            <p className="text-[10px] font-bold uppercase text-rose-600">Force OTA Enforced</p>
            <p className="mt-0.5 text-lg font-bold text-rose-700">{apps.filter((a) => a.force_update).length}</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'All Applications' },
            { id: 'wms', label: 'Warehouse (WMS)' },
            { id: 'ai_agent', label: 'AI Voice Agent' },
            { id: 'billing', label: 'Billing & POS' },
            { id: 'custom', label: 'Custom Apps' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                selectedCategory === cat.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative w-full max-w-xs">
          <input
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      {/* Apps Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white p-5" />
          ))}
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FiSmartphone className="mx-auto text-slate-400" size={32} />
          <h3 className="mt-3 text-sm font-bold text-slate-800">No applications found</h3>
          <p className="mt-1 text-xs text-slate-500">
            {search ? 'No apps match your search filter.' : 'Register your first Flutter mobile application above.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredApps.map((app) => {
            const isRevealed = Boolean(revealedKeys[app.id]);
            const isCopied = copiedKeyId === app.id;

            return (
              <div
                key={app.id}
                className={`flex flex-col justify-between overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                  !app.is_active
                    ? 'border-slate-200 opacity-60 bg-slate-50/50'
                    : app.maintenance_mode
                    ? 'border-amber-300 bg-amber-50/20'
                    : 'border-slate-200'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 ring-1 ring-slate-200/60">
                        {getCategoryIcon(app.category)}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{app.name}</h3>
                        <p className="font-mono text-[11px] text-slate-500">{app.app_identifier}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(app)}
                        className="cursor-pointer"
                        title="Click to toggle active state"
                      >
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold transition ${
                            app.is_active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {app.is_active ? 'Active' : 'Disabled'}
                        </Badge>
                      </button>
                      {app.maintenance_mode && (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-800">
                          Maintenance
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="mt-3 text-xs leading-relaxed text-slate-600">
                    {app.description || 'No description provided.'}
                  </p>

                  {/* Version Control & OTA Box */}
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        OTA Version Status
                      </span>
                      <Button
                        size="sm"
                        onClick={() => openOtaDeployModal(app)}
                        className="h-6 rounded-md bg-indigo-600 px-2 text-[10px] font-semibold text-white hover:bg-indigo-700 shadow-sm"
                      >
                        <FiUploadCloud className="mr-1" size={11} /> Deploy OTA
                      </Button>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-600">Latest Release:</span>
                      <span className="font-mono font-bold text-indigo-700">v{app.current_version}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Min Supported:</span>
                      <span className="font-mono text-slate-700">v{app.min_supported_version}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Force Upgrade:</span>
                      <button
                        type="button"
                        onClick={() => void handleToggleForceUpdate(app)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                          app.force_update
                            ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                        title="Click to toggle force update"
                      >
                        {app.force_update ? 'ENFORCED' : 'OPTIONAL'}
                      </button>
                    </div>

                    {app.apk_download_url && (
                      <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">APK Package:</span>
                        <a
                          href={app.apk_download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
                        >
                          <FiDownload size={11} /> Download Link
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Security / API Key Box */}
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-400">
                      <span>Device API Key</span>
                      <button
                        type="button"
                        onClick={() => setRevealedKeys((r) => ({ ...r, [app.id]: !r[app.id] }))}
                        className="text-slate-500 hover:text-slate-700"
                      >
                        {isRevealed ? <FiEyeOff size={12} /> : <FiEye size={12} />}
                      </button>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-2">
                      <code className="truncate font-mono text-xs text-slate-800">
                        {isRevealed ? app.api_key : `${app.api_key.slice(0, 10)}••••••••••••••••`}
                      </code>
                      <button
                        type="button"
                        onClick={() => void handleCopyKey(app.id, app.api_key)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        title="Copy API Key"
                      >
                        {isCopied ? <FiCheck size={13} className="text-emerald-600" /> : <FiCopy size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Allowed Roles */}
                  {Array.isArray(app.allowed_roles) && app.allowed_roles.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-bold uppercase text-slate-400">Allowed User Roles</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {app.allowed_roles.map((role) => (
                          <span
                            key={role}
                            className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Last Heartbeat */}
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
                    <FiClock size={11} />
                    <span>
                      Last Client Sync:{' '}
                      {app.last_sync_at ? new Date(app.last_sync_at).toLocaleString() : 'Never connected'}
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openSimulator(app)}
                      className="h-8 rounded-lg text-xs font-semibold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                      title="Simulate OTA update check for this app"
                    >
                      <FiPlay className="mr-1 text-emerald-600" size={11} />
                      Simulate OTA
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCodeGuideApp(app)}
                      className="h-8 rounded-lg text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-100"
                      title="View Flutter/Dart Integration Code"
                    >
                      <FiCode className="mr-1 text-indigo-600" size={12} />
                      Code Guide
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleToggleMaintenance(app)}
                      className={`h-8 rounded-lg text-xs font-medium ${
                        app.maintenance_mode
                          ? 'border-amber-300 text-amber-800 bg-amber-50'
                          : 'border-slate-200 text-slate-600'
                      }`}
                      title="Toggle maintenance mode"
                    >
                      <FiAlertTriangle className="mr-1" size={11} />
                      {app.maintenance_mode ? 'End Maint' : 'Maintenance'}
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleTestHandshake(app)}
                      disabled={testingHandshakeId === app.app_identifier}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                      title="Test client sync with this app"
                    >
                      <FiActivity className={testingHandshakeId === app.app_identifier ? 'animate-spin' : ''} size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRegenerateToken(app)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Regenerate API Token"
                    >
                      <FiKey size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(app)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                      title="Edit Application Settings"
                    >
                      <FiEdit size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteApp(app)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Delete Application"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* OTA Quick Deploy Modal */}
      {otaModalApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <FiUploadCloud size={18} />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900">Deploy OTA Update — {otaModalApp.name}</h3>
                  <p className="text-xs text-slate-500">Push version upgrade to all active mobile devices</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOtaModalApp(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <FiX size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveOtaDeploy} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Latest Release Version *</label>
                  <input
                    type="text"
                    required
                    value={otaForm.current_version}
                    onChange={(e) => setOtaForm({ ...otaForm, current_version: e.target.value })}
                    placeholder="e.g. 1.2.4"
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 font-mono text-xs text-slate-800 outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Minimum Supported Version *</label>
                  <input
                    type="text"
                    required
                    value={otaForm.min_supported_version}
                    onChange={(e) => setOtaForm({ ...otaForm, min_supported_version: e.target.value })}
                    placeholder="e.g. 1.1.0"
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 font-mono text-xs text-slate-800 outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">APK Package Download URL</label>
                <input
                  type="url"
                  value={otaForm.apk_download_url}
                  onChange={(e) => setOtaForm({ ...otaForm, apk_download_url: e.target.value })}
                  placeholder="https://downloads.nixaerp.com/apps/nixa-v1.2.4.apk"
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs text-slate-800 outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Release Notes / Changelog</label>
                <textarea
                  rows={3}
                  value={otaForm.release_notes}
                  onChange={(e) => setOtaForm({ ...otaForm, release_notes: e.target.value })}
                  placeholder="What's new in this build..."
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 outline-none focus:border-indigo-400"
                />
              </div>

              <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={otaForm.force_update}
                    onChange={(e) => setOtaForm({ ...otaForm, force_update: e.target.checked })}
                    className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-rose-900">Enforce Mandatory Upgrade (Kill-Switch)</span>
                    <p className="text-[11px] text-rose-700">
                      Devices running older versions will be blocked with a modal until they download the new APK.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOtaModalApp(null)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={otaSubmitting}
                  className="rounded-xl bg-indigo-600 px-5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  {otaSubmitting ? 'Publishing...' : 'Deploy OTA Upgrade'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive OTA Simulator Modal */}
      {simulatorApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <FiPlay size={16} />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900">OTA Simulator — {simulatorApp.name}</h3>
                  <p className="text-xs text-slate-500">Test how Flutter devices experience update policies</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSimulatorApp(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <FiX size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">Simulate Client App Version:</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={simulatingVersion}
                    onChange={(e) => setSimulatingVersion(e.target.value)}
                    placeholder="e.g. 1.0.0"
                    className="h-9 w-40 rounded-xl border border-slate-200 px-3 font-mono text-xs text-slate-800 outline-none focus:border-indigo-400"
                  />
                  <Button
                    size="sm"
                    onClick={() => void runSimulation(simulatorApp.app_identifier, simulatingVersion)}
                    disabled={simulatorLoading}
                    className="h-9 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <FiRefreshCw className={`mr-1.5 ${simulatorLoading ? 'animate-spin' : ''}`} size={12} />
                    Run Simulation
                  </Button>
                </div>
              </div>

              {/* Simulation Result Preview */}
              {simulatorResult && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-2">Simulated Flutter Device UI Experience</p>

                  {simulatorResult?.ota?.is_force_update ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
                      <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
                        <FiAlertTriangle /> BLOCKING MODAL: Mandatory Update Required
                      </div>
                      <p className="mt-1 text-xs">
                        The app prevents all operations until user updates from <strong>v{simulatingVersion}</strong> to <strong>v{simulatorResult.ota.current_version}</strong>.
                      </p>
                      {simulatorResult.ota.apk_download_url && (
                        <a
                          href={simulatorResult.ota.apk_download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                        >
                          <FiDownload size={13} /> Download Update APK
                        </a>
                      )}
                    </div>
                  ) : simulatorResult?.ota?.is_update_available ? (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-900">
                      <div className="flex items-center gap-2 font-bold text-sm text-indigo-800">
                        <FiCheckCircle /> OPTIONAL BANNER: Update Available
                      </div>
                      <p className="mt-1 text-xs">
                        User can continue using the app normally, but an update banner notifies them that <strong>v{simulatorResult.ota.current_version}</strong> is ready.
                      </p>
                      {simulatorResult.ota.release_notes && (
                        <p className="mt-2 text-[11px] italic text-indigo-700">
                          Changelog: {simulatorResult.ota.release_notes}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                      <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                        <FiCheckCircle /> UP TO DATE: Normal Seamless Sync
                      </div>
                      <p className="mt-1 text-xs">
                        Client is on the latest build (v{simulatingVersion}). No update prompts are triggered.
                      </p>
                    </div>
                  )}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-slate-800">
                      View Raw JSON Payload
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-emerald-400">
                      {JSON.stringify(simulatorResult, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => setSimulatorApp(null)} className="rounded-xl bg-slate-900 text-white">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Flutter Integration Code Guide Modal */}
      {codeGuideApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <FiCode size={18} />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900">Flutter Client Integration — {codeGuideApp.name}</h3>
                  <p className="text-xs text-slate-500">API connection endpoints and Dart client snippet</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCodeGuideApp(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <FiX size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Endpoint Table */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Handshake:</span>
                  <span className="text-indigo-700 font-bold">GET /api/v1/apps/{codeGuideApp.app_identifier}/handshake</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">OTA Check:</span>
                  <span className="text-indigo-700 font-bold">GET /api/v1/apps/{codeGuideApp.app_identifier}/check-update</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Login:</span>
                  <span className="text-emerald-700 font-bold">POST /api/v1/apps/{codeGuideApp.app_identifier}/login</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Profile:</span>
                  <span className="text-blue-700 font-bold">GET /api/v1/apps/{codeGuideApp.app_identifier}/profile</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Heartbeat:</span>
                  <span className="text-slate-700 font-bold">POST /api/v1/apps/{codeGuideApp.app_identifier}/ping</span>
                </div>
              </div>

              {/* Dart Snippet */}
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1.5">Dart / Flutter HTTP Client Example:</p>
                <pre className="rounded-xl bg-slate-900 p-4 font-mono text-xs text-emerald-400 overflow-x-auto">
{`import 'dart:convert';
import 'package:http/http.dart' as http;

class RaptorApiClient {
  static const String baseUrl = '${window.location.origin}/api';
  static const String appSlug = '${codeGuideApp.app_identifier}';

  // 1. Handshake & OTA Check
  static Future<Map<String, dynamic>> checkOta(String version) async {
    final res = await http.get(
      Uri.parse('\$baseUrl/v1/apps/\$appSlug/check-update?version=\$version'),
      headers: {'X-App-Version': version},
    );
    return jsonDecode(res.body);
  }

  // 2. Mobile Login (rejects banned users & unauthorized roles)
  static Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await http.post(
      Uri.parse('\$baseUrl/v1/apps/\$appSlug/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
        'device_name': 'Flutter Mobile',
        'app_version': '${codeGuideApp.current_version}',
      }),
    );
    return jsonDecode(res.body);
  }
}`}
                </pre>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => setCodeGuideApp(null)} className="rounded-xl bg-slate-900 text-white">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Handshake Result Modal */}
      {handshakeResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FiCheckCircle className="text-emerald-500" size={18} />
                <h3 className="font-bold text-slate-900">Flutter API Handshake Verified</h3>
              </div>
              <button
                type="button"
                onClick={() => setHandshakeResult(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <FiX size={16} />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Response returned by <code className="font-mono text-indigo-600">/api/v1/apps/{handshakeResult.identifier}/handshake</code>:
            </p>
            <pre className="mt-3 max-h-72 overflow-y-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-emerald-400">
              {JSON.stringify(handshakeResult.data, null, 2)}
            </pre>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => setHandshakeResult(null)} className="rounded-xl bg-slate-900 text-white">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Application Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FiSmartphone className="text-indigo-600" size={18} />
                <h3 className="font-bold text-slate-900">
                  {editingApp ? `Edit ${editingApp.name}` : 'Register New Flutter Application'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <FiX size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveApp} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">App Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Nixa Logistics"
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs text-slate-800 outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">App Identifier (Slug) *</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingApp)}
                    value={formData.app_identifier}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        app_identifier: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                      })
                    }
                    placeholder="e.g. nixa_logistics"
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 font-mono text-xs text-slate-800 outline-none focus:border-indigo-400 disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        category: e.target.value as 'wms' | 'ai_agent' | 'billing' | 'custom',
                      })
                    }
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none"
                  >
                    <option value="wms">Warehouse (WMS)</option>
                    <option value="ai_agent">AI Agent / Voice</option>
                    <option value="billing">Billing &amp; POS</option>
                    <option value="custom">Custom Application</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Platform</label>
                  <input
                    type="text"
                    value={formData.platform}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                    placeholder="flutter"
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs text-slate-800 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Application purpose, hardware requirements, or store summary..."
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 outline-none focus:border-indigo-400"
                />
              </div>

              {/* Version Controls */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
                <p className="text-xs font-bold text-slate-800">Version Management &amp; OTA Updates</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">Current Latest Version *</label>
                    <input
                      type="text"
                      required
                      value={formData.current_version}
                      onChange={(e) => setFormData({ ...formData, current_version: e.target.value })}
                      placeholder="1.2.3"
                      className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-800 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">Minimum Supported Version *</label>
                    <input
                      type="text"
                      required
                      value={formData.min_supported_version}
                      onChange={(e) => setFormData({ ...formData, min_supported_version: e.target.value })}
                      placeholder="1.0.0"
                      className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-800 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600">APK Package Download URL</label>
                  <input
                    type="url"
                    value={formData.apk_download_url}
                    onChange={(e) => setFormData({ ...formData, apk_download_url: e.target.value })}
                    placeholder="https://downloads.nixaerp.com/apps/app-v1.2.3.apk"
                    className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none"
                  />
                </div>

                <label className="flex items-center gap-2 pt-1 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.force_update}
                    onChange={(e) => setFormData({ ...formData, force_update: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  <span>Enforce mandatory update (blocks app usage until updated)</span>
                </label>
              </div>

              {/* Maintenance & Allowed Roles */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
                <p className="text-xs font-bold text-slate-800">Access Control &amp; Maintenance</p>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <span>Active &amp; Accepting API Connections</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.maintenance_mode}
                      onChange={(e) => setFormData({ ...formData, maintenance_mode: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-amber-600"
                    />
                    <span>Maintenance Mode (Suspends sync)</span>
                  </label>
                </div>

                {formData.maintenance_mode && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">Maintenance Message</label>
                    <input
                      type="text"
                      value={formData.maintenance_message}
                      onChange={(e) => setFormData({ ...formData, maintenance_message: e.target.value })}
                      placeholder="e.g. Server sync paused for database maintenance."
                      className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none"
                    />
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-semibold text-slate-600">Allowed User Roles</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {AVAILABLE_ROLES.map((role) => {
                      const selected = formData.allowed_roles.includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => toggleRoleSelection(role)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                            selected
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {role}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border-slate-200 text-xs text-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={formSubmitting}
                  className="rounded-xl bg-indigo-600 px-5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  {formSubmitting ? 'Saving...' : editingApp ? 'Update Application' : 'Register Application'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConnectedAppsSettings;
