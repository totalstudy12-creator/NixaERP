import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setSidebarOpen(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Navbar onMenuClick={() => setSidebarOpen((open) => !open)} />

      <div className="flex min-h-[calc(100vh-4rem)]">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main
          className={clsx(
            'flex-1 overflow-y-auto px-4 py-4 lg:px-10 lg:py-8 scrollbar-hide',
            sidebarOpen ? 'md:ml-72' : 'md:ml-0'
          )}
        >
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>

      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 text-center md:flex-row md:justify-between md:text-left">
          <p>© 2026 Business OS. ERP dashboard, order, payment, catalog, attendance and payroll management.</p>
        </div>
      </footer>
    </div>
  );
}