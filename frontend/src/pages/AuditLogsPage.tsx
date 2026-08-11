import { useEffect, useState, useCallback, useMemo, lazy, Suspense, memo } from 'react';
import {
  FiTrash2, FiRefreshCw, FiDownload, FiAlertCircle,
  FiSearch, FiFilter, FiClock, FiCheckCircle, FiXCircle,
  FiBarChart2, FiFileText
} from 'react-icons/fi';

// ---------- Lazy loaded heavy components ----------
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);

import { useNotification } from '../components/NotificationContext';
import { AppLogEntry, getAppLogs } from '../services/appLogger';

// ---------- Skeleton Components ----------
const StatCardSkeleton = memo(() => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 animate-pulse">
    <div className="h-10 w-10 rounded-xl bg-slate-200" />
    <div className="space-y-2 flex-1">
      <div className="h-3 w-16 bg-slate-200 rounded" />
      <div className="h-6 w-8 bg-slate-200 rounded" />
    </div>
  </div>
));

const TableSkeleton = memo(() => (
  <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4 animate-pulse">
    <div className="h-6 w-48 bg-slate-200 rounded" />
    {[...Array(10)].map((_, i) => (
      <div key={i} className="flex gap-4">
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
        <div className="h-4 w-1/5 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
      </div>
    ))}
  </div>
));

const StatCard = memo(({ icon: Icon, label, value, tone, prefix }: {
  icon: any;
  label: string;
  value: string | number;
  tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal';
  prefix?: string;
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' :
             tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
             tone === 'amber' ? 'bg-amber-100 text-amber-600' :
             tone === 'rose' ? 'bg-rose-100 text-rose-600' :
             tone === 'purple' ? 'bg-purple-100 text-purple-600' :
             'bg-teal-100 text-teal-600';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{prefix}{value}</p>
      </div>
    </div>
  );
});

// ---------- Helper ----------
const formatDate = (timestamp: string | number) => new Date(timestamp).toLocaleString();

// ---------- Component ----------
export function AuditLogsPage() {
  const [logs, setLogs] = useState<AppLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDays, setFilterDays] = useState<number>(0);

  const { showSuccess, showError } = useNotification();

  // ---------- Data loading ----------
  const loadLogs = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      const data = getAppLogs();
      setLogs(data);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Error loading logs:', err);
      const msg = err.message || 'Failed to load audit logs.';
      setError(msg);
      showError('Load failed', msg);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadLogs();
    const listener = () => loadLogs();
    window.addEventListener('app-log-updated', listener);
    return () => window.removeEventListener('app-log-updated', listener);
  }, [loadLogs]);

  // ---------- Filtering & Search ----------
  const filteredLogs = useMemo(() => {
    let filtered = [...logs];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(log =>
        log.module?.toLowerCase().includes(term) ||
        log.action?.toLowerCase().includes(term) ||
        log.message?.toLowerCase().includes(term)
      );
    }
    if (filterModule !== 'all') {
      filtered = filtered.filter(log => log.module === filterModule);
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(log => log.status === filterStatus);
    }
    if (filterDays > 0) {
      const cutoff = Date.now() - filterDays * 24 * 60 * 60 * 1000;
      filtered = filtered.filter(log => new Date(log.timestamp).getTime() >= cutoff);
    }
    return filtered;
  }, [logs, searchTerm, filterModule, filterStatus, filterDays]);

  // ---------- Summary stats ----------
  const summary = useMemo(() => {
    const total = logs.length;
    const success = logs.filter(l => l.status === 'success').length;
    const errorCount = logs.filter(l => l.status === 'error').length;
    const moduleSet = new Set(logs.map(l => l.module));
    return { total, success, errorCount, modules: moduleSet.size };
  }, [logs]);

  const moduleBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    logs.forEach(log => {
      map[log.module] = (map[log.module] || 0) + 1;
    });
    return map;
  }, [logs]);

  // ---------- Pagination ----------
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredLogs.length / rowsPerPage);
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredLogs.slice(start, start + rowsPerPage);
  }, [filteredLogs, currentPage]);

  useEffect(() => setCurrentPage(1), [searchTerm, filterModule, filterStatus, filterDays]);

  // ---------- Actions ----------
  const handleClearLogs = () => {
    if (!confirm('Clear all audit logs? This cannot be undone.')) return;
    try {
      localStorage.removeItem('business_os_audit_logs');
      loadLogs();
      showSuccess('Logs cleared', 'Audit logs have been cleared.');
    } catch (err: any) {
      showError('Clear failed', err.message || 'Could not clear logs.');
    }
  };

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      showError('Export failed', 'No logs to export.');
      return;
    }
    const headers = ['Timestamp', 'Module', 'Action', 'Status', 'Message'];
    const rows = filteredLogs.map(log => [
      new Date(log.timestamp).toISOString(),
      log.module,
      log.action,
      log.status,
      log.message,
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Audit logs exported.');
  };

  // ---------- Table Columns ----------
  const columns = useMemo(() => [
    {
      name: 'Timestamp',
      selector: (row: AppLogEntry) => new Date(row.timestamp).toISOString(),
      sortable: true,
      cell: (row: AppLogEntry) => (
        <span className="text-sm text-slate-600">{formatDate(row.timestamp)}</span>
      ),
      width: '180px',
    },
    {
      name: 'Module',
      selector: (row: AppLogEntry) => row.module,
      sortable: true,
      cell: (row: AppLogEntry) => (
        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
          {row.module}
        </span>
      ),
      width: '130px',
    },
    {
      name: 'Action',
      selector: (row: AppLogEntry) => row.action,
      sortable: true,
      cell: (row: AppLogEntry) => <span className="text-sm font-medium">{row.action}</span>,
      width: '140px',
    },
    {
      name: 'Status',
      selector: (row: AppLogEntry) => row.status,
      sortable: true,
      cell: (row: AppLogEntry) => (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
          row.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
          'bg-rose-100 text-rose-700'
        }`}>
          {row.status}
        </span>
      ),
      width: '110px',
    },
    {
      name: 'Message',
      selector: (row: AppLogEntry) => row.message,
      cell: (row: AppLogEntry) => <span className="text-sm text-slate-600 max-w-[300px] truncate block">{row.message}</span>,
      width: '250px',
    },
  ], []);

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Audit & Monitoring
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiFileText className="text-cyan-300" /> Audit Logs
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Activity</span>
          </h1>
          <p className="text-sm text-slate-300">Track system events, successes, and failures</p>
          {lastUpdated && (
            <p className="text-xs text-slate-400 mt-1">
              Last updated: {lastUpdated.toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20">
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button onClick={loadLogs} disabled={loading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={loading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={handleClearLogs} className="rounded-xl bg-rose-500 text-white px-3 py-2 text-sm font-medium transition hover:bg-rose-600 shadow-md shadow-rose-500/20">
            <FiTrash2 className="inline mr-1" size={14} /> Clear Logs
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {logs.length > 0 ? (
          <>
            <StatCard icon={FiFileText} label="Total Logs" value={summary.total} tone="blue" />
            <StatCard icon={FiCheckCircle} label="Success" value={summary.success} tone="emerald" />
            <StatCard icon={FiXCircle} label="Errors" value={summary.errorCount} tone="rose" />
            <StatCard icon={FiBarChart2} label="Modules" value={summary.modules} tone="purple" />
          </>
        ) : loading ? (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={FiFileText} label="Total Logs" value={0} tone="blue" />
            <StatCard icon={FiCheckCircle} label="Success" value={0} tone="emerald" />
            <StatCard icon={FiXCircle} label="Errors" value={0} tone="rose" />
            <StatCard icon={FiBarChart2} label="Modules" value={0} tone="purple" />
          </>
        )}
      </div>

      {/* Module breakdown pills */}
      {Object.keys(moduleBreakdown).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(moduleBreakdown).map(([mod, count]) => (
            <span
              key={mod}
              className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 shadow-sm"
            >
              {mod}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by module, action, or message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all duration-200"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            className="input-field w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3 focus:ring-cyan-100"
          >
            <option value="all">All Modules</option>
            {Array.from(new Set(logs.map(l => l.module))).map(mod => (
              <option key={mod} value={mod}>{mod}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3"
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
          <select
            value={filterDays}
            onChange={(e) => setFilterDays(parseInt(e.target.value))}
            className="input-field w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3"
          >
            <option value={0}>All time</option>
            <option value={1}>Last 24h</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiAlertCircle size={20} /> {error}
        </div>
      )}

      {/* Table with skeleton & pagination */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {loading ? (
            <TableSkeleton />
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center">
              <FiFileText size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-lg font-medium text-slate-500">No audit logs found</p>
              <p className="text-sm text-slate-400 mt-1">Try adjusting your filters or check back later.</p>
            </div>
          ) : (
            <>
              <ModernDataTable
                title=""
                columns={columns}
                data={paginatedLogs}
                loading={false}
                striped
                highlightOnHover
                pointerOnHover
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <span className="text-sm text-slate-600">
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredLogs.length)} of {filteredLogs.length}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">««</button>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">‹</button>
                    <span className="px-3 py-1 text-sm font-medium">{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">›</button>
                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">»»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </Suspense>
      </div>

      {/* Styles */}
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        @media (max-width: 640px) {
          .rdt_TableCol, .rdt_TableCell { white-space: nowrap; }
        }
        .rdt_TableHeader .search-container,
        .rdt_TableHeader input[type="text"] { display: none !important; }
        .rdt_TableHeader > div:last-child { display: none !important; }
        .rdt_TableCol:first-child, .rdt_TableCell:first-child { display: none !important; }
      `}</style>
    </div>
  );
}