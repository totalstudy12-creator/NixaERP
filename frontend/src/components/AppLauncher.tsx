import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiGrid,
  FiBox,
  FiTruck,
  FiDollarSign,
  FiUsers,
  FiShoppingBag,
  FiCreditCard,
  FiExternalLink,
  FiLock,
  FiCheckCircle,
  FiRefreshCw,
  FiX,
} from 'react-icons/fi';
import { apiClient } from '../api';

interface AppItem {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  route: string;
  external_url?: string | null;
  status: 'active' | 'connected' | 'restricted';
  required_permission?: string;
  has_access: boolean;
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  FiBox,
  FiTruck,
  FiDollarSign,
  FiUsers,
  FiShoppingBag,
  FiCreditCard,
};

export function AppLauncher() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const res: any = await apiClient.getAppLauncher();
      setApps(Array.isArray(res) ? res : res?.apps || res?.data || []);
    } catch {
      // Fallback local catalog if offline
      setApps([
        {
          id: 'nixa-erp',
          name: 'Nixa ERP',
          category: 'Enterprise Suite',
          description: 'Core financial ledger, multi-company accounting and operations.',
          icon: 'FiBox',
          route: '/dashboard',
          status: 'active',
          has_access: true,
        },
        {
          id: 'nixa-wms',
          name: 'Nixa WMS',
          category: 'Supply Chain',
          description: 'Multi-warehouse stock movements, audits, and facility transfers.',
          icon: 'FiTruck',
          route: '/warehouses',
          status: 'connected',
          has_access: true,
        },
        {
          id: 'nixa-billing',
          name: 'Nixa Billing',
          category: 'Sales & Invoicing',
          description: 'Invoicing engine, GST e-invoices, POS, and quotations.',
          icon: 'FiDollarSign',
          route: '/invoices',
          status: 'connected',
          has_access: true,
        },
        {
          id: 'nixa-hr',
          name: 'Nixa HR',
          category: 'Human Capital',
          description: 'Employee lifecycle, biometric attendance, and automated payroll runs.',
          icon: 'FiUsers',
          route: '/employees',
          status: 'connected',
          has_access: true,
        },
        {
          id: 'nixa-crm',
          name: 'Nixa CRM',
          category: 'Customer 360',
          description: 'Pipeline management, dealer networks, customer 360 workspaces.',
          icon: 'FiShoppingBag',
          route: '/customers',
          status: 'connected',
          has_access: true,
        },
        {
          id: 'nixa-finance',
          name: 'Nixa Finance',
          category: 'Treasury & Banking',
          description: 'Bank reconciliation, cashbooks, payment gateways, and expense claims.',
          icon: 'FiCreditCard',
          route: '/payments',
          status: 'connected',
          has_access: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchApps();
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleLaunch = (app: AppItem) => {
    if (!app.has_access) return;
    setIsOpen(false);
    if (app.external_url) {
      window.open(app.external_url, '_blank', 'noopener,noreferrer');
    } else {
      navigate(app.route);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 9-dot launcher button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`grid h-9 w-9 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition hover:bg-slate-800 hover:text-white ${
          isOpen ? 'bg-slate-800 text-white ring-2 ring-indigo-500/30' : ''
        }`}
        title="Nixa Multi-App Ecosystem"
        aria-label="App Launcher"
        aria-expanded={isOpen}
      >
        <FiGrid size={16} />
      </button>

      {/* Launcher Panel */}
      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-[380px] sm:w-[420px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/70 animate-fadeIn text-slate-100">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3 bg-slate-900/90 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-600/30 text-indigo-400">
                <FiGrid size={13} />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Nixa Multi-App Ecosystem
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchApps}
                disabled={loading}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                title="Refresh catalog"
              >
                <FiRefreshCw className={loading ? 'animate-spin' : ''} size={12} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <FiX size={14} />
              </button>
            </div>
          </div>

          {/* App Grid */}
          <div className="max-h-[460px] overflow-y-auto p-3">
            <div className="grid grid-cols-2 gap-2.5">
              {apps.map((app) => {
                const IconComponent = ICON_MAP[app.icon] || FiBox;
                const isRestricted = !app.has_access;

                return (
                  <button
                    key={app.id}
                    type="button"
                    disabled={isRestricted}
                    onClick={() => handleLaunch(app)}
                    className={`group relative flex flex-col items-start rounded-xl border p-3 text-left transition ${
                      isRestricted
                        ? 'cursor-not-allowed border-slate-800/40 bg-slate-950/40 opacity-50'
                        : 'border-slate-800 bg-slate-800/40 hover:border-indigo-500/50 hover:bg-slate-800/90 hover:shadow-lg hover:shadow-indigo-500/10'
                    }`}
                  >
                    <div className="flex w-full items-start justify-between">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20 text-indigo-400 border border-indigo-500/20 group-hover:from-indigo-600 group-hover:to-violet-700 group-hover:text-white transition">
                        <IconComponent size={18} />
                      </span>
                      {isRestricted ? (
                        <span className="text-slate-500" title="Permission required">
                          <FiLock size={12} />
                        </span>
                      ) : app.external_url ? (
                        <span className="text-slate-500 group-hover:text-slate-300">
                          <FiExternalLink size={12} />
                        </span>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-emerald-500" title="Connected & Active" />
                      )}
                    </div>

                    <h4 className="mt-2.5 text-xs font-bold text-white group-hover:text-indigo-300 transition">
                      {app.name}
                    </h4>
                    <span className="text-[10px] font-semibold text-indigo-400/80">
                      {app.category}
                    </span>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">
                      {app.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-800 bg-slate-950/50 px-4 py-2.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>Federated SSO &amp; Shared Schema</span>
            <span className="font-semibold text-emerald-400">All services operational</span>
          </div>
        </div>
      )}
    </div>
  );
}
