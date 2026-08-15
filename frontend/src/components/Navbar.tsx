import { useState, useCallback, useRef, useEffect } from 'react';
import {
  FiBell,
  FiMenu,
  FiSearch,
  FiUser,
  FiSettings,
  FiLogOut,
  FiChevronDown,
} from 'react-icons/fi';
import { useAuthStore } from '../store/auth';
import { apiClient } from '../api';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../components/NotificationContext';

interface NavbarProps {
  onMenuClick?: () => void;
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { showSuccess, showError } = useNotification();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ---------- Logout ----------
  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await apiClient.logout();
      showSuccess('Logged out', 'You have been successfully logged out.');
    } catch (error: any) {
      console.error('Logout error:', error);
      showError('Logout failed', error.message || 'Could not log out. Please try again.');
    } finally {
      logout();
      setIsLoggingOut(false);
      navigate('/login');
    }
  }, [logout, navigate, showSuccess, showError]);

  // ---------- Dropdown toggle ----------
  const toggleDropdown = useCallback(() => {
    setIsDropdownOpen((prev) => !prev);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  return (
    <nav className="sticky top-0 z-50 h-20 border-b border-slate-800 bg-slate-950/95 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left: Menu toggle (mobile) + Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 md:hidden"
            aria-label="Open sidebar"
          >
            <FiMenu className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-lg">
            <span className="text-xl font-bold">OS</span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">Business OS</p>
            <h1 className="text-lg font-semibold text-white">ERP Console</h1>
          </div>
        </div>

        {/* Center: Search (desktop) */}
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="relative w-full max-w-xl">
            <FiSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search modules, orders, invoices... (Ctrl+K)"
              value={searchQuery}
              onChange={handleSearch}
              className="w-full rounded-full border border-slate-700 bg-slate-900 py-2.5 pl-12 pr-16 text-sm text-white placeholder-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all outline-none"
              aria-label="Global search"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              <span className="text-[0.6rem]">⌘</span>K
            </kbd>
          </div>
        </div>

        {/* Right: Notifications + User */}
        <div className="flex items-center gap-3">
          <button
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
            aria-label="Notifications"
          >
            <FiBell className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[0.65rem] font-semibold text-white">
              4
            </span>
          </button>

          {/* User dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={toggleDropdown}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 hover:bg-slate-800 transition-colors"
              aria-haspopup="true"
              aria-expanded={isDropdownOpen}
              aria-label="User menu"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-white text-sm font-medium">
                {user?.name
                  ? user.name
                      .split(' ')
                      .map((segment) => segment[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                  : 'U'}
              </span>
              <span className="hidden sm:block text-sm text-white">
                {user?.name?.split(' ')[0] || 'User'}
              </span>
              <FiChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                  isDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown menu */}
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl">
                <div className="px-4 py-3 border-b border-slate-700">
                  <p className="text-sm font-medium text-white">{user?.name || 'User'}</p>
                  <p className="text-xs text-slate-400 truncate">{user?.email || 'user@example.com'}</p>
                </div>
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    navigate('/profile');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <FiUser className="h-4 w-4" />
                  Profile
                </button>
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    navigate('/settings');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <FiSettings className="h-4 w-4" />
                  Settings
                </button>
                <hr className="border-slate-700" />
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-rose-400 hover:bg-slate-800 hover:text-rose-300 disabled:opacity-50"
                >
                  <FiLogOut className="h-4 w-4" />
                  {isLoggingOut ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}