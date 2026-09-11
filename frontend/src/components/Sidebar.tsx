// src/components/Sidebar.tsx
import { Link, useLocation } from 'react-router-dom';
import {
  FiHome,
  FiBox,
  FiShoppingCart,
  FiDollarSign,
  FiUsers,
  FiMapPin,
  FiPackage,
  FiFileText,
  FiTrendingUp,
  FiClipboard,
  FiFolder,
  FiBriefcase,
  FiUserPlus,
  FiCalendar,
  FiCreditCard,
  FiBookOpen,
  FiZap,
  FiShield,
  FiCpu,
  FiActivity,
  FiBarChart2,
  FiDatabase,
  FiCornerUpLeft,
  FiSearch,
  FiChevronDown,
  FiX,
  FiStar,
  FiCommand,
  FiTarget,
  FiMail,
  FiFilePlus,
  FiAward,
  FiRotateCcw,
  FiRepeat,
  FiPieChart,
  FiUserCheck,
  FiUserMinus,
  FiCheckSquare,
  FiMessageCircle,
  FiHelpCircle,
  FiSettings,
  FiGrid,
  FiPlusCircle,
  FiTrendingDown,
} from 'react-icons/fi';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const SECTIONS_STORAGE_KEY = 'sidebar-sections-v3';
const FAVORITES_STORAGE_KEY = 'sidebar-favorites-v3';

const menuSections: MenuSection[] = [
  {
    title: 'Main',
    items: [
      { icon: FiHome, label: 'Dashboard', path: '/dashboard' },
      { icon: FiGrid, label: 'Point of Sale', path: '/pos' },
      { icon: FiCalendar, label: 'Calendar', path: '/calendar' },
    ],
  },
  {
    title: 'CRM',
    items: [
      { icon: FiTarget, label: 'Leads', path: '/leads' },
      { icon: FiUsers, label: 'Contacts', path: '/contacts' },
      { icon: FiTrendingUp, label: 'Opportunities', path: '/opportunities' },
      { icon: FiMail, label: 'Campaigns', path: '/campaigns' },
      { icon: FiFilePlus, label: 'Quotations', path: '/quotations' },
    ],
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
    title: 'Sales & Operations',
    items: [
      { icon: FiShoppingCart, label: 'Orders', path: '/orders' },
      { icon: FiFileText, label: 'Sales', path: '/invoices' },
      { icon: FiCornerUpLeft, label: 'Sales Invoice Return', path: '/sales-invoice-returns' },
      { icon: FiRotateCcw, label: 'Credit Notes', path: '/credit-notes' },
      { icon: FiBriefcase, label: 'Purchase', path: '/purchases' },
      { icon: FiRotateCcw, label: 'Purchase Returns', path: '/purchase-returns' },
      { icon: FiDollarSign, label: 'Payments', path: '/payments' },
      { icon: FiCreditCard, label: 'Bank & Cash', path: '/bank-cash' },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { icon: FiTrendingUp, label: 'Inventory', path: '/inventory' },
      { icon: FiRepeat, label: 'Stock Transfers', path: '/stock-transfers' },
      { icon: FiAward, label: 'Brands', path: '/brands' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { icon: FiTrendingDown, label: 'Expenses', path: '/expenses' },
      { icon: FiPlusCircle, label: 'Income', path: '/income' },
      { icon: FiPieChart, label: 'Budgets', path: '/budgets' },
      { icon: FiBarChart2, label: 'Reports', path: '/reports' },
    ],
  },
  {
    title: 'People & HR',
    items: [
      { icon: FiUsers, label: 'Employees', path: '/employees' },
      { icon: FiCalendar, label: 'Attendance', path: '/attendance' },
      { icon: FiCreditCard, label: 'Payroll', path: '/payroll' },
      { icon: FiUsers, label: 'HR Payroll', path: '/hr-payroll' },
      { icon: FiUserCheck, label: 'Recruitment', path: '/recruitment' },
    ],
  },
  {
    title: 'Projects & Support',
    items: [
      { icon: FiCheckSquare, label: 'Project Boards', path: '/project-boards' },
      { icon: FiMessageCircle, label: 'Support Tickets', path: '/tickets' },
      { icon: FiHelpCircle, label: 'Knowledge Base', path: '/knowledge-base' },
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
      { icon: FiFolder, label: 'Media Library', path: '/media-library' },
      { icon: FiUserPlus, label: 'User Roles', path: '/user-roles' },
      { icon: FiClipboard, label: 'Audit Logs', path: '/audit-logs' },
      { icon: FiActivity, label: 'Health Monitoring', path: '/health-monitoring' },
      { icon: FiDatabase, label: 'Backup / Restore', path: '/backup-restore' },
      { icon: FiSettings, label: 'Settings', path: '/settings' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* LocalStorage helpers                                                */
/* ------------------------------------------------------------------ */

function readStoredSectionState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SECTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function readStoredFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Sidebar component                                                   */
/* ------------------------------------------------------------------ */

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const location = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    readStoredSectionState(),
  );
  const [favorites, setFavorites] = useState<string[]>(() => readStoredFavorites());

  /* -------------------- Effects -------------------- */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      /* ignore */
    }
  }, [favorites]);

  useEffect(() => {
    const sectionWithActive = menuSections.find((s) =>
      s.items.some((i) => i.path === location.pathname),
    );
    if (!sectionWithActive) return;
    setCollapsed((prev) =>
      prev[sectionWithActive.title] ? { ...prev, [sectionWithActive.title]: false } : prev,
    );
  }, [location.pathname]);

  /* -------------------- Derived -------------------- */

  const filteredSections = useMemo<MenuSection[]>(() => {
    const term = search.trim().toLowerCase();
    if (!term) return menuSections;
    return menuSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.label.toLowerCase().includes(term)),
      }))
      .filter((section) => section.items.length > 0);
  }, [search]);

  const favoriteItems = useMemo<MenuItem[]>(() => {
    const all = menuSections.flatMap((s) => s.items);
    return favorites
      .map((path) => all.find((i) => i.path === path))
      .filter((i): i is MenuItem => Boolean(i));
  }, [favorites]);

  const activePath = location.pathname;
  const isSearching = search.trim().length > 0;

  /* -------------------- Handlers -------------------- */

  const handleOverlayClick = useCallback(() => {
    if (onClose) onClose();
  }, [onClose]);

  const toggleSection = useCallback((title: string) => {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  }, []);

  const toggleFavorite = useCallback((path: string) => {
    setFavorites((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  }, []);

  /* -------------------- Render -------------------- */

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-20 z-50 flex w-72 transform flex-col bg-slate-950 text-slate-200 shadow-[4px_0_24px_-8px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* ─────────── Header ─────────── */}
        <div className="border-b border-slate-800 px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-600 text-sm font-black text-white">
                OS
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">Business OS</p>
                <p className="truncate text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  Admin workspace
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-800 hover:text-white"
              aria-label="Close sidebar"
            >
              <FiX size={18} />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <FiSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              size={14}
            />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu…"
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-full rounded-xl border border-slate-800 bg-slate-900 pl-9 pr-12 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-500 focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20"
            />
            {isSearching ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-800 hover:text-white"
                aria-label="Clear search"
              >
                <FiX size={12} />
              </button>
            ) : (
              <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-400 md:flex">
                <FiCommand size={9} /> K
              </span>
            )}
          </div>
        </div>

        {/* ─────────── Scrollable nav ─────────── */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-width:thin] [scrollbar-color:#334155_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb:hover]:bg-slate-600">
          {/* Favorites */}
          {!isSearching && favoriteItems.length > 0 && (
            <div className="mb-3 space-y-0.5">
              <div className="flex items-center gap-1.5 px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400">
                <FiStar size={10} fill="currentColor" />
                Favorites
              </div>
              {favoriteItems.map((item) => (
                <NavLinkRow
                  key={`fav-${item.path}`}
                  item={item}
                  isActive={activePath === item.path}
                  isFavorite={true}
                  onToggleFavorite={toggleFavorite}
                  accent="amber"
                />
              ))}
            </div>
          )}

          {/* Empty search state */}
          {filteredSections.length === 0 && (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900">
                <FiSearch className="h-5 w-5 text-slate-500" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-200">No matches</p>
              <p className="mt-1 text-xs text-slate-500">Try a different search term.</p>
            </div>
          )}

          {/* Sections */}
          {filteredSections.map((section) => {
            const isCollapsed = collapsed[section.title] && !isSearching;
            const sectionActive = section.items.some((i) => i.path === activePath);

            return (
              <div key={section.title} className="mb-1.5">
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  disabled={isSearching}
                  className={`group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition ${
                    isSearching ? 'cursor-default' : 'hover:bg-slate-900'
                  }`}
                >
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
                      sectionActive
                        ? 'text-indigo-400'
                        : 'text-slate-500 group-hover:text-slate-400'
                    }`}
                  >
                    {section.title}
                  </span>
                  {!isSearching && (
                    <FiChevronDown
                      size={12}
                      className={`text-slate-500 transition-transform duration-200 ${
                        isCollapsed ? '-rotate-90' : ''
                      }`}
                    />
                  )}
                </button>

                {!isCollapsed && (
                  <div className="mt-0.5 space-y-0.5">
                    {section.items.map((item) => (
                      <NavLinkRow
                        key={item.path}
                        item={item}
                        isActive={activePath === item.path}
                        isFavorite={favorites.includes(item.path)}
                        onToggleFavorite={toggleFavorite}
                        accent="indigo"
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ─────────── Footer ─────────── */}
        <div className="border-t border-slate-800 px-3 py-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  System online
                </p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">v1.1.1 · Business OS</p>
              </div>
              <Link
                to="/ai-assistant"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500"
                title="Ask AI Assistant"
              >
                <FiZap size={14} />
              </Link>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Nav link row (with favorite toggle)                                 */
/* ------------------------------------------------------------------ */

interface NavLinkRowProps {
  item: MenuItem;
  isActive: boolean;
  isFavorite: boolean;
  onToggleFavorite: (path: string) => void;
  accent?: 'indigo' | 'amber';
}

function NavLinkRow({
  item,
  isActive,
  isFavorite,
  onToggleFavorite,
  accent = 'indigo',
}: NavLinkRowProps) {
  const Icon = item.icon;
  const styles =
    accent === 'amber'
      ? {
          indicator: 'bg-amber-400',
          activeBg: 'bg-amber-500/10',
          activeIcon: 'text-amber-400',
          activeText: 'text-white',
        }
      : {
          indicator: 'bg-indigo-500',
          activeBg: 'bg-slate-800',
          activeIcon: 'text-indigo-400',
          activeText: 'text-white',
        };

  return (
    <Link
      to={item.path}
      className={`group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150 ${
        isActive
          ? `${styles.activeBg} ${styles.activeText} font-semibold`
          : 'text-slate-400 hover:bg-slate-900 hover:text-white'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      {isActive && (
        <span
          className={`absolute -left-2.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full ${styles.indicator}`}
        />
      )}

      <Icon
        size={16}
        className={`shrink-0 transition ${
          isActive ? styles.activeIcon : 'text-slate-500 group-hover:text-slate-300'
        }`}
      />

      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(item.path);
        }}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md transition ${
          isFavorite
            ? 'text-amber-400 opacity-100'
            : 'text-slate-500 opacity-0 hover:bg-slate-800 hover:text-amber-300 group-hover:opacity-100'
        }`}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <FiStar size={11} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
    </Link>
  );
}

export default Sidebar;