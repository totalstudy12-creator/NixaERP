import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { apiClient } from '../api';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../components/NotificationContext';

interface NavbarProps {
  onMenuClick?: () => void;
}

// Inline SVG Icons (Fallback if react-icons not working)
const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);

const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

export function Navbar({ onMenuClick }: NavbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { showSuccess, showError } = useNotification();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const toggleDropdown = useCallback(() => {
    setIsDropdownOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
            className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            aria-label="Open sidebar"
          >
            <MenuIcon />
          </button>
          <div className="hidden md:flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-lg">
            <span className="text-xl font-bold">OS</span>
          </div>
          <div className="hidden md:block">
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">Business OS</p>
            <h1 className="text-lg font-semibold text-white">ERP Console</h1>
          </div>
        </div>

        {/* Center: Search (desktop) */}
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="relative w-full max-w-xl">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <SearchIcon />
            </span>
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
            <BellIcon />
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
              <span className="hidden sm:block text-slate-400">
                <ChevronDownIcon />
              </span>
            </button>

            {/* Dropdown menu */}
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl z-50">
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
                  <UserIcon />
                  Profile
                </button>
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    navigate('/settings');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <SettingsIcon />
                  Settings
                </button>
                <hr className="border-slate-700" />
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-rose-400 hover:bg-slate-800 hover:text-rose-300 disabled:opacity-50"
                >
                  <LogoutIcon />
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