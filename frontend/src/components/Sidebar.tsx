 import { Link, useLocation } from 'react-router-dom';
import {
  FiHome, FiBox, FiShoppingCart, FiDollarSign,
  FiUsers, FiMapPin, FiPackage, FiFileText,
  FiTrendingUp, FiClipboard, FiFolder,
  FiShoppingBag, FiBriefcase, FiUserPlus, FiCalendar, FiCreditCard,
  FiBookOpen, FiZap, FiShield, FiCpu, FiActivity, FiCreditCard as FiBank, FiBarChart2, FiDatabase,
} from 'react-icons/fi';
import { useCallback, useEffect } from 'react';
import clsx from 'clsx';

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: 'Main',
    items: [{ icon: FiHome, label: 'Dashboard', path: '/dashboard' }],
  },
  {
    title: 'Sales & CRM',
    items: [
      { icon: FiBox, label: 'Companies', path: '/companies' },
      { icon: FiMapPin, label: 'Branches', path: '/branches' },
      { icon: FiPackage, label: 'Warehouses', path: '/warehouses' },
      { icon: FiUsers, label: 'Customers', path: '/customers' },
      { icon: FiUsers, label: 'Dealers', path: '/dealers' },
      { icon: FiPackage, label: 'Suppliers', path: '/suppliers' },
    ],
  },
  {
    title: 'Sales & operations',
    items: [
      { icon: FiShoppingCart, label: 'Orders', path: '/orders' },
      { icon: FiFileText, label: 'Sales', path: '/invoices' },
      { icon: FiBriefcase, label: 'Purchase', path: '/purchases' },
      { icon: FiDollarSign, label: 'Payments', path: '/payments' },
      { icon: FiBank, label: 'Bank & Cash', path: '/bank-cash' },
      { icon: FiTrendingUp, label: 'Inventory', path: '/inventory' },
      { icon: FiBarChart2, label: 'Reports', path: '/reports' },
    ],
  },
  
  {
    title: 'People & Finance',
    items: [
      { icon: FiUsers, label: 'Employees', path: '/employees' },
      { icon: FiCalendar, label: 'Attendance', path: '/attendance' },
      { icon: FiCreditCard, label: 'Payroll', path: '/payroll' },
      { icon: FiUsers, label: 'HR Payroll', path: '/hr-payroll' },
      { icon: FiFolder, label: 'Media Library', path: '/media-library' },
      { icon: FiUserPlus, label: 'User Roles', path: '/user-roles' },
      { icon: FiClipboard, label: 'Audit Logs', path: '/audit-logs' },
    ],
  },
  {
    title: 'Extensions',
    items: [
      { icon: FiBookOpen, label: 'Marketing', path: '/marketing' },
      { icon: FiCpu, label: 'Automation', path: '/automation' },
      { icon: FiShield, label: 'Security', path: '/security' },
      { icon: FiZap, label: 'AI Assistant', path: '/ai-assistant' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: FiActivity, label: 'Health Monitoring', path: '/health-monitoring' },
      { icon: FiDatabase, label: 'Backup / Restore', path: '/backup-restore' },
    ],
  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const location = useLocation();

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleOverlayClick = useCallback(() => {
    if (onClose) onClose();
  }, [onClose]);

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={clsx(
          'fixed inset-0 z-40 bg-slate-950/40 transition-opacity duration-300 md:hidden',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed top-20 bottom-0 left-0 z-50 w-72 transform bg-slate-950 text-slate-200',
          'overflow-y-auto border-r border-slate-800 shadow-xl scrollbar-hide',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Mobile header */}
        <div className="px-6 py-6 border-b border-slate-800 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-lg">
                OS
              </div>
              <span className="text-xl font-bold text-white">Business OS</span>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              aria-label="Close sidebar"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-slate-400 mt-4">Fast access to your modules and workflows.</p>
        </div>

        {/* Navigation links */}
        <div className="space-y-6 px-3 py-5">
          {menuSections.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="px-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                {section.title}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={clsx(
                        'group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-all',
                        isActive
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full bg-gradient-to-b from-blue-500 to-cyan-400" />
                      )}
                      <Icon size={18} className="flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-auto px-5 py-6 border-t border-slate-800">
          <div className="rounded-3xl bg-slate-900 p-4 text-sm text-slate-300 shadow-inner">
            <p className="font-semibold text-white">Need a hand?</p>
            <p className="mt-2 leading-6">Use the built-in docs and API guides to connect mobile apps and workflows quickly.</p>
            <div className="mt-4 text-xs text-slate-500 flex items-center justify-between">
              <span>v1.0.9</span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-green-400"></span>
                System Online
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
} 