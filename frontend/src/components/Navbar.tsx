// src/components/Navbar.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../store/auth';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

/* ------------------------------------------------------------------ */
/* Inline SVG Icons                                                    */
/* ------------------------------------------------------------------ */

const IconBase = ({ children, size = 18 }: { children: React.ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const MenuIcon = () => (
  <IconBase>
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </IconBase>
);

const BellIcon = ({ size = 16 }: { size?: number }) => (
  <IconBase size={size}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </IconBase>
);

const SearchIcon = ({ size = 15 }: { size?: number }) => (
  <IconBase size={size}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </IconBase>
);

const UserIcon = ({ size = 14 }: { size?: number }) => (
  <IconBase size={size}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </IconBase>
);

const SettingsIcon = ({ size = 14 }: { size?: number }) => (
  <IconBase size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </IconBase>
);

const LogoutIcon = ({ size = 14 }: { size?: number }) => (
  <IconBase size={size}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </IconBase>
);

const ChevronDownIcon = ({ size = 14 }: { size?: number }) => (
  <IconBase size={size}>
    <polyline points="6 9 12 15 18 9" />
  </IconBase>
);

const CommandIcon = ({ size = 10 }: { size?: number }) => (
  <IconBase size={size}>
    <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
  </IconBase>
);

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface NavbarProps {
  onMenuClick?: () => void;
}

interface NotificationItem {
  id: number | string;
  title?: string | null;
  message?: string | null;
  created_at?: string | null;
  read?: boolean;
}

/* ------------------------------------------------------------------ */
/* Navbar                                                              */
/* ------------------------------------------------------------------ */

export function Navbar({ onMenuClick }: NavbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { showSuccess, showError } = useNotification();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  /* -------------------- Fetch notifications -------------------- */

  useEffect(() => {
    let active = true;
    setNotificationsLoading(true);

    apiClient
      .request('GET', '/notifications?per_page=10')
      .then((res: unknown) => {
        if (!active) return;
        const list = Array.isArray(res)
          ? res
          : ((res as { data?: NotificationItem[] })?.data ?? []);
        setNotifications(list);
      })
      .catch(() => {
        if (active) setNotifications([]);
      })
      .finally(() => {
        if (active) setNotificationsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  /* -------------------- Logout -------------------- */

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await apiClient.logout();
      showSuccess('Logged out', 'You have been successfully logged out.');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Could not log out. Please try again.';
      showError('Logout failed', message);
    } finally {
      logout();
      setIsLoggingOut(false);
      navigate('/login');
    }
  }, [logout, navigate, showSuccess, showError]);

  /* -------------------- Dropdown toggles -------------------- */

  const toggleDropdown = useCallback(() => {
    setIsDropdownOpen((prev) => !prev);
    setIsNotificationsOpen(false);
  }, []);

  const toggleNotifications = useCallback(() => {
    setIsNotificationsOpen((prev) => !prev);
    setIsDropdownOpen(false);
  }, []);

  /* -------------------- Click outside -------------------- */

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* -------------------- Keyboard shortcuts -------------------- */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* -------------------- Derived -------------------- */

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((segment) => segment[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : null;

  /* -------------------- Render -------------------- */

  return (
    <nav className="sticky top-0 z-50 h-20 border-b border-slate-800 bg-slate-950">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
        {/* ─────────── Left: Menu + brand ─────────── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition hover:bg-slate-800 hover:text-white md:hidden"
            aria-label="Open sidebar"
          >
            <MenuIcon />
          </button>

          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-3"
            aria-label="Go to dashboard"
          >
            <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-sm font-black text-white md:flex">
              OS
            </div>
            <div className="hidden text-left md:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-400">
                Business OS
              </p>
              <p className="text-sm font-bold text-white">ERP Console</p>
            </div>
          </button>
        </div>

        {/* ─────────── Center: Search ─────────── */}
        <div className="hidden flex-1 items-center justify-center md:flex">
          <div className="relative w-full max-w-xl">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
              <SearchIcon />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search modules, orders, invoices…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-16 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              aria-label="Global search"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:flex">
              <CommandIcon /> K
            </kbd>
          </div>
        </div>

        {/* ─────────── Right: Notifications + User ─────────── */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={toggleNotifications}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition hover:bg-slate-800 hover:text-white"
              aria-label="Notifications"
              aria-haspopup="true"
              aria-expanded={isNotificationsOpen}
            >
              <BellIcon />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-xl shadow-black/40">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                  <p className="text-sm font-semibold text-white">Notifications</p>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                      {unreadCount} unread
                    </span>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {notificationsLoading ? (
                    <div className="px-4 py-8 text-center text-xs text-slate-500">
                      Loading…
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-800 text-slate-500">
                        <BellIcon />
                      </div>
                      <p className="mt-3 text-xs font-semibold text-slate-300">
                        No notifications yet
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        You&apos;re all caught up.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-800">
                      {notifications.map((n) => (
                        <li
                          key={n.id}
                          className={`flex items-start gap-3 px-4 py-3 transition hover:bg-slate-800/50 ${
                            !n.read ? 'bg-slate-800/30' : ''
                          }`}
                        >
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                              !n.read ? 'bg-indigo-400' : 'bg-slate-600'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            {n.title && (
                              <p className="truncate text-xs font-semibold text-white">
                                {n.title}
                              </p>
                            )}
                            {n.message && (
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                                {n.message}
                              </p>
                            )}
                            {n.created_at && (
                              <p className="mt-1 text-[10px] text-slate-500">
                                {new Date(n.created_at).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={toggleDropdown}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-2 py-1.5 text-slate-100 transition hover:bg-slate-800"
              aria-haspopup="true"
              aria-expanded={isDropdownOpen}
              aria-label="User menu"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                {initials || <UserIcon />}
              </span>
              {user?.name && (
                <span className="hidden text-sm font-medium sm:block">
                  {user.name.split(' ')[0]}
                </span>
              )}
              <span
                className={`hidden text-slate-500 transition-transform sm:block ${
                  isDropdownOpen ? 'rotate-180' : ''
                }`}
              >
                <ChevronDownIcon />
              </span>
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-xl shadow-black/40">
                {(user?.name || user?.email) && (
                  <div className="border-b border-slate-800 px-4 py-3">
                    {user?.name && (
                      <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                    )}
                    {user?.email && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{user.email}</p>
                    )}
                  </div>
                )}

                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      navigate('/profile');
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                  >
                    <UserIcon />
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      navigate('/settings');
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                  >
                    <SettingsIcon />
                    Settings
                  </button>
                </div>

                <div className="border-t border-slate-800 p-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-400 transition hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    <LogoutIcon />
                    {isLoggingOut ? 'Logging out…' : 'Logout'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;