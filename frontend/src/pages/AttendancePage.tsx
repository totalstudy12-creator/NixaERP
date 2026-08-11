import { useEffect, useState, useCallback, useMemo, memo, lazy, Suspense } from 'react';
import {
  FiRefreshCw, FiDownload, FiUser, FiUsers, FiCheckCircle, FiXCircle,
  FiUserCheck, FiUserX, FiSun, FiEye, FiX, FiSearch,
  FiCalendar, FiClock, FiActivity, FiServer,
  FiAlertTriangle, FiPlus, FiRotateCcw,
  FiEdit, FiUserPlus, FiInfo, FiEdit2, FiTrash2,
  FiSettings
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

// ---------- Lazy loaded Offcanvas ----------
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

// ---------- Simple API Cache ----------
const cache = new Map<string, { data: any; timestamp: number }>();
function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300_000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        setData(entry.data);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      let result;
      if (key === 'today_attendance_summary') {
        console.log('API response for summary:', res);
        result = (res as any)?.data ?? res;
        if (Array.isArray(result)) {
          result = result[0] || null;
        }
        console.log('Processed summary data:', result);
      } else {
        const potentialArray = (res as any)?.data;
        if (Array.isArray(potentialArray)) {
            result = potentialArray;
        } else if (Array.isArray(res)) {
            result = res;
        } else {
            result = [];
        }
      }
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result as T);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttlMs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

// ---------- Types ----------
type AttendanceStatus =
  | 'present' | 'absent' | 'leave' | 'paid_leave' | 'remote' | 'late'
  | 'on_time' | 'time_off' | 'half_day' | 'holiday' | 'not_set';

interface EmployeeFull {
  id: number;
  name: string;
  first_name?: string;
  last_name?: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  branch_id?: number;
  company_id?: number;
  joining_date?: string;
  shift?: string;
  weekly_off?: string;
  salary_days?: number;
  working_days?: number;
  present_percent?: number;
  late_count?: number;
  early_exit?: number;
}

interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  shift: string;
  overtime: number;
  notes: string;
  device?: string;
  location?: string;
}

interface Company { id: number; name: string; }
interface Branch { id: number; name: string; company_id: number; }
interface Department { id: number; name: string; }

interface ESP32Device {
  id: string;
  numericId: number;
  name: string;
  branch: string;
  status: 'online' | 'offline' | 'syncing' | 'firmware_update' | 'restarting';
  wifi: 'Connected' | 'Disconnected' | 'Weak';
  ip: string;
  signal: number;
  power: 'External' | 'Battery';
  lastSync: string;
  firmware: string;
  cpu: number;
  memory: number;
  flash: number;
  temperature: number;
  uptime: string;
  restartCount: number;
  lastRestartReason: string;
  ping: number;
  enrollmentStatus?: string;
  enrollmentEmployeeId?: number;
}

// ---------- Helpers ----------
const getStatusColor = (status: AttendanceStatus): string => {
  const map: Record<AttendanceStatus, string> = {
    present: 'bg-emerald-500', on_time: 'bg-emerald-500',
    late: 'bg-amber-500', absent: 'bg-rose-500',
    leave: 'bg-yellow-500', paid_leave: 'bg-purple-500',
    remote: 'bg-sky-500', time_off: 'bg-gray-400',
    half_day: 'bg-indigo-500', holiday: 'bg-pink-500',
    not_set: 'bg-gray-200',
  };
  return map[status] || 'bg-gray-200';
};

const getStatusAbbr = (status: AttendanceStatus): string => {
  const map: Record<AttendanceStatus, string> = {
    present: 'P', on_time: 'P', late: 'L', absent: 'A',
    leave: 'LV', paid_leave: 'PL', remote: 'R',
    time_off: 'TO', half_day: 'HD', holiday: 'H', not_set: '',
  };
  return map[status] || '';
};

const getStatusLabel = (status: AttendanceStatus): string => {
  const map: Record<AttendanceStatus, string> = {
    present: 'Present', on_time: 'On Time', late: 'Late',
    absent: 'Absent', leave: 'Leave', paid_leave: 'Paid Leave',
    remote: 'Remote', time_off: 'Time Off', half_day: 'Half Day',
    holiday: 'Holiday', not_set: 'Not Set',
  };
  return map[status] || 'Not Set';
};

const formatTime = (time: string | null) => time || '—';
const getDaysInMonth = (year: number, month: number): number => new Date(year, month, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number): number => new Date(year, month - 1, 1).getDay();
const isDateToday = (dateStr: string): boolean => dateStr === new Date().toISOString().slice(0, 10);
const calculateWorkingHours = (check_in: string | null, check_out: string | null): number => {
  if (!check_in || !check_out) return 0;
  const [h1, m1] = check_in.split(':').map(Number);
  const [h2, m2] = check_out.split(':').map(Number);
  let total = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (total < 0) total += 1440;
  return total;
};
const formatWorkingHours = (minutes: number): string => {
  if (minutes <= 0) return '—';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const getDeviceStatusInfo = (status: ESP32Device['status']) => {
  const map = {
    online: { color: 'bg-emerald-500', text: 'Online', icon: FiCheckCircle },
    offline: { color: 'bg-rose-500', text: 'Offline', icon: FiXCircle },
    syncing: { color: 'bg-amber-500', text: 'Syncing', icon: FiRefreshCw },
    firmware_update: { color: 'bg-blue-500', text: 'Firmware Update', icon: FiDownload },
    restarting: { color: 'bg-purple-500', text: 'Restarting', icon: FiRotateCcw },
  };
  return map[status] || { color: 'bg-rose-500', text: 'Offline', icon: FiXCircle };
};

// ---------- Skeleton Loaders ----------
const SkeletonBox = ({ className = '' }: { className?: string }) => (
  <div className={`bg-slate-200 animate-pulse rounded ${className}`} />
);

const DeviceCardSkeleton = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <SkeletonBox className="h-4 w-20 mb-2" />
    <SkeletonBox className="h-3 w-32 mb-3" />
    <div className="space-y-2">
      <div className="flex justify-between"><SkeletonBox className="h-2 w-12" /><SkeletonBox className="h-2 w-16" /></div>
      <div className="flex justify-between"><SkeletonBox className="h-2 w-12" /><SkeletonBox className="h-2 w-16" /></div>
      <div className="flex justify-between"><SkeletonBox className="h-2 w-12" /><SkeletonBox className="h-2 w-16" /></div>
      <div className="flex justify-between"><SkeletonBox className="h-2 w-12" /><SkeletonBox className="h-2 w-16" /></div>
    </div>
  </div>
);

const CalendarSkeleton = () => (
  <div className="grid grid-cols-7 gap-2">
    {[...Array(7)].map((_, i) => <SkeletonBox key={i} className="h-6 rounded-lg" />)}
    {[...Array(35)].map((_, i) => <SkeletonBox key={i + 7} className="h-14 rounded-lg" />)}
  </div>
);

// ---------- Custom Debounce Hook ----------
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ---------- Memoised Sub‑components ----------
const CalendarCell = memo(({ day, dateStr, record, isToday, isWeekend, onClick }: any) => {
  const status = record?.status || 'not_set';
  return (
    <div
      className={`relative h-14 md:h-16 rounded-lg border-2 transition-all hover:shadow-md cursor-pointer flex flex-col items-center justify-center
        ${isToday ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}
        ${status !== 'not_set' ? getStatusColor(status) : isWeekend ? 'bg-slate-50' : 'bg-white'}
      `}
      onClick={() => onClick(dateStr, record)}
    >
      <span className={`text-sm font-semibold ${status !== 'not_set' ? 'text-white' : 'text-slate-700'}`}>{day}</span>
      {status !== 'not_set' && (
        <span className="text-[10px] font-bold mt-0.5 text-white opacity-90">{getStatusAbbr(status)}</span>
      )}
      {record?.check_in && (
        <span className="text-[8px] mt-0.5 text-white/80 flex items-center gap-1"><FiClock size={8} />{formatTime(record.check_in)}</span>
      )}
    </div>
  );
});

const AttendanceCalendar = memo(({ year, month, records, onDayClick }: any) => {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="h-14 md:h-16 bg-slate-50 border border-slate-200 rounded-lg" />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const record = records[dateStr];
    const isToday = isDateToday(dateStr);
    const isWeekend = [0, 6].includes(new Date(year, month - 1, day).getDay());
    days.push(<CalendarCell key={day} day={day} dateStr={dateStr} record={record} isToday={isToday} isWeekend={isWeekend} onClick={onDayClick} />);
  }
  return (
    <div className="grid grid-cols-7 gap-2">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
        <div key={d} className="text-xs font-medium text-slate-400 text-center py-1">{d}</div>
      ))}
      {days}
    </div>
  );
});

const StatCards = memo(({ todayStats }: any) => {
  console.log('StatCards received props:', { todayStats });
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: 'Present', value: todayStats?.present, icon: FiUserCheck, tone: 'emerald' },
        { label: 'Absent', value: todayStats?.absent, icon: FiUserX, tone: 'rose' },
        { label: 'Late', value: todayStats?.late, icon: FiClock, tone: 'amber' },
        { label: 'Leave', value: todayStats?.on_leave, icon: FiSun, tone: 'indigo' },
      ].map((item, idx) => (
        <div key={idx} className="stat-card flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 transition hover:border-slate-200 hover:bg-white hover:shadow-md">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
            item.tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
            item.tone === 'rose' ? 'bg-rose-100 text-rose-600' :
            item.tone === 'amber' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'
          }`}><item.icon size={16} /></div>
          <div>
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900">{item.value ?? '...'}</p>
          </div>
        </div>
      ))}
    </div>
  );
});

// ---------- Main Component ----------
export function AttendancePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filter state
  const { data: companies } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());
  const { data: branches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const { data: departments } = useApiCache<Department[]>('departments', () => apiClient.getDepartments?.() ?? []);
  const [selectedCompany, setSelectedCompany] = useState<number | ''>('');
  const [selectedBranch, setSelectedBranch] = useState<number | ''>('');
  const [selectedDepartment, setSelectedDepartment] = useState<number | ''>('');
  const [employees, setEmployees] = useState<EmployeeFull[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<number | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Month navigation
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord>>({});

  // UI state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showTimeView, setShowTimeView] = useState(false);
  const [selectedRecordForTime, setSelectedRecordForTime] = useState<AttendanceRecord | null>(null);

  // ---------- FIXED: Ensure apiClient.getBiometricDevices() returns an array before mapping ----------
  const { data: devices, loading: devicesLoading, refresh: refreshDevices } = useApiCache<ESP32Device[]>(
    'biometric_devices',
    async () => {
      const raw = await apiClient.getBiometricDevices();
      // Normalise the response: could be array, or object with data prop
      const list = Array.isArray(raw) ? raw : raw?.data ?? [];
      return list.map((d: any) => ({
        id: d.device_uid,
        numericId: d.id,
        name: d.name,
        branch: d.branch?.name || d.branch || 'N/A',
        status: d.status || 'offline',
        wifi: d.wifi || (d.status === 'online' ? 'Connected' : 'Disconnected'),
        ip: d.ip_address || '—',
        signal: d.signal ?? (d.status === 'online' ? -50 : 0),
        power: d.power || (d.status === 'online' ? 'External' : 'Battery'),
        lastSync: d.last_sync_at
          ? new Date(d.last_sync_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
          : '—',
        firmware: d.firmware_version || '—',
        cpu: d.cpu || 0,
        memory: d.memory || 0,
        flash: d.flash || 0,
        temperature: d.temperature || 0,
        uptime: d.uptime || '—',
        restartCount: d.restartCount || 0,
        lastRestartReason: d.last_restart_reason || '—',
        ping: d.ping || 0,
        enrollmentStatus: d.enrollment_status || null,
        enrollmentEmployeeId: d.enrollment_employee_id || null,
      }));
    }
  );

  // Add / Edit device modal
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<ESP32Device | null>(null);
  const [deviceForm, setDeviceForm] = useState({
    name: '', device_uid: '', firmware_version: 'v2.0.0', ip_address: '',
  });
  const [savingDevice, setSavingDevice] = useState(false);

  // Enrollment
  const [enrollCompany, setEnrollCompany] = useState<number | ''>('');
  const [enrollBranch, setEnrollBranch] = useState<number | ''>('');
  const [enrollDevice, setEnrollDevice] = useState<ESP32Device | null>(null);
  const [enrollEmployeeId, setEnrollEmployeeId] = useState<number | ''>('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrollmentProgress, setEnrollmentProgress] = useState(0);
  const [enrollmentStep, setEnrollmentStep] = useState('');
  const [enrolledFingers, setEnrolledFingers] = useState<any[]>([]);
  const [loadingEnrolled, setLoadingEnrolled] = useState(false);

  // Today stats
  const { data: todayStats, refresh: refreshTodayStats } = useApiCache<{
    present: number; absent: number; late: number; on_leave: number;
  }>('today_attendance_summary', () => apiClient.getTodayAttendanceSummary());

  // Today employee attendance list
  const { data: todayEmployeeList, loading: todayListLoading, refresh: refreshTodayList } = useApiCache<any[]>(
    'today_employee_attendance',
    () => apiClient.getTodayEmployeeAttendance(),
    30_000
  );

  // UI toggles
  const [autoAttendanceEnabled, setAutoAttendanceEnabled] = useState(true);
  const [activeView, setActiveView] = useState<'overview' | 'attendance' | 'devices'>('overview');

  const { showSuccess, showError } = useNotification();

  // ---------- Branch filtering ----------
  const filteredBranches = useMemo(() => {
    if (selectedCompany && branches) {
      return branches.filter(b => b.company_id === Number(selectedCompany));
    }
    return [];
  }, [selectedCompany, branches]);

  useEffect(() => { if (!selectedCompany) setSelectedBranch(''); }, [selectedCompany]);

  // Employees fetch
  const loadEmployees = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCompany) params.append('company_id', String(selectedCompany));
      if (selectedBranch) params.append('branch_id', String(selectedBranch));
      if (selectedDepartment) params.append('department_id', String(selectedDepartment));
      if (debouncedSearch) params.append('search', debouncedSearch);
      const response = await apiClient.getEmployees(params.toString());
      const data = Array.isArray(response) ? response : response.data || [];
      setEmployees(data.map((emp: any) => ({
        ...emp,
        name: emp.name || [emp.first_name, emp.last_name].filter(Boolean).join(' ') || 'Unknown',
      })));
      if (selectedEmployee && !data.some((e: any) => e.id === selectedEmployee)) {
        setSelectedEmployee('');
      }
    } catch (err) {
      showError('Error', 'Could not load employees.');
    }
  }, [selectedCompany, selectedBranch, selectedDepartment, debouncedSearch, showError, selectedEmployee]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // Attendance load
  const loadAttendance = useCallback(async () => {
    if (!selectedEmployee) return;
    setLoading(true);
    try {
      const monthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
      const params = new URLSearchParams({ employee_id: String(selectedEmployee), month: monthStr });
      const response = await apiClient.getAttendance(params.toString());
      const data = Array.isArray(response) ? response : response.data || [];
      const recordsMap: Record<string, AttendanceRecord> = {};
      data.forEach((rec: any) => {
        const date = rec.date ? String(rec.date).split('T')[0] : '';
        if (date) recordsMap[date] = { ...rec, date };
      });
      setAttendanceRecords(recordsMap);
      setLastUpdated(new Date());
    } catch (err: any) {
      showError('Load failed', err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedEmployee, currentYear, currentMonth, showError]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  // Refresh today data when overview tab active
  useEffect(() => {
    if (activeView !== 'overview') return;
    const id = setInterval(() => {
      refreshTodayStats();
      refreshTodayList();
    }, 30000);
    return () => clearInterval(id);
  }, [activeView, refreshTodayStats, refreshTodayList]);

  // ----- LIVE MONITORING: auto-refresh devices every 15s when Devices tab active -----
  useEffect(() => {
    if (activeView !== 'devices') return;
    const interval = setInterval(() => {
      refreshDevices();
    }, 15000);
    return () => clearInterval(interval);
  }, [activeView, refreshDevices]);

  // Enrollment data
  const fetchEnrolledFingers = useCallback(async () => {
    if (!enrollEmployeeId) return;
    setLoadingEnrolled(true);
    try {
      const result = await apiClient.getEnrolledFingers(enrollEmployeeId);
      setEnrolledFingers(Array.isArray(result) ? result : result.data || []);
    } catch (err) { setEnrolledFingers([]); }
    finally { setLoadingEnrolled(false); }
  }, [enrollEmployeeId]);

  useEffect(() => {
    if (enrollEmployeeId) fetchEnrolledFingers();
    else setEnrolledFingers([]);
  }, [enrollEmployeeId, fetchEnrolledFingers]);

  // ----- Enrollment logic -----
  const enrollableBranches = useMemo(() => {
    if (!enrollCompany || !branches) return [];
    return branches.filter(b => b.company_id === Number(enrollCompany));
  }, [enrollCompany, branches]);

  const enrollableDevices = useMemo(() => {
    if (!enrollBranch || !devices) return [];
    const selectedBranchObj = branches?.find(b => b.id === Number(enrollBranch));
    if (!selectedBranchObj) return [];
    return devices.filter(d => d.status === 'online' && d.branch === selectedBranchObj.name);
  }, [enrollBranch, devices, branches]);

  const handleStartEnrollment = async () => {
    if (!enrollDevice || !enrollEmployeeId) {
      showError('Validation', 'Select a device and employee first.');
      return;
    }
    setEnrolling(true);
    setEnrollmentProgress(0);
    setEnrollmentStep('Initiating...');
    try {
      await apiClient.startDeviceEnrollment(enrollDevice.numericId, enrollEmployeeId);
      showSuccess('Enrollment', 'Sent to device. Waiting for fingerprint...');

      const checkStatus = setInterval(async () => {
        try {
          await refreshDevices();
          const raw = await apiClient.getBiometricDevices();
          const list = Array.isArray(raw) ? raw : raw?.data ?? [];
          const updatedDevice = list.find((d: any) => d.id === enrollDevice.numericId);
          if (updatedDevice && !updatedDevice.enrollment_status) {
            clearInterval(checkStatus);
            setEnrolling(false);
            setEnrollmentProgress(100);
            setEnrollmentStep('Completed');
            showSuccess('Enrollment', 'Fingerprint registered successfully!');
            fetchEnrolledFingers();
          }
        } catch (e) {}
      }, 2000);

      setTimeout(() => {
        clearInterval(checkStatus);
        if (enrolling) {
          setEnrolling(false);
          showError('Timeout', 'Enrollment took too long.');
        }
      }, 120000);
    } catch (err: any) {
      setEnrolling(false);
      showError('Enrollment failed', err.message);
    }
  };

  // ---------- Extended Summary (monthly) ----------
  const summary = useMemo(() => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    let present = 0, absent = 0, leave = 0, halfDay = 0, late = 0, early = 0;
    let totalOvertime = 0, totalWorkingMinutes = 0;

    Object.values(attendanceRecords).forEach(rec => {
      const s = rec.status;
      if (s === 'present' || s === 'on_time' || s === 'remote') present++;
      else if (s === 'absent') absent++;
      else if (s === 'leave' || s === 'paid_leave') leave++;
      else if (s === 'half_day') halfDay++;
      if (s === 'late') late++;
      if (rec.check_out && (s === 'present' || s === 'on_time' || s === 'remote')) {
        const [h, m] = rec.check_out.split(':').map(Number);
        if (h < 16) early++;
      }
      totalOvertime += rec.overtime || 0;
      totalWorkingMinutes += calculateWorkingHours(rec.check_in, rec.check_out);
    });

    return {
      present,
      absent,
      leave,
      halfDay,
      late,
      early,
      overtimeHours: Math.floor(totalOvertime / 60),
      overtimeMins: totalOvertime % 60,
      totalWorkingHours: formatWorkingHours(totalWorkingMinutes),
      presentPercent: daysInMonth > 0 ? Math.round((present / daysInMonth) * 100) : 0,
    };
  }, [attendanceRecords, currentYear, currentMonth]);

  // ---------- Handlers ----------
  const handleDayClick = (dateStr: string, record: AttendanceRecord | null) => {
    if (!selectedEmployee) { showError('No employee', 'Please select an employee first.'); return; }
    setSelectedDate(dateStr);
    setEditingRecord(record || {
      id: 0, employee_id: Number(selectedEmployee), date: dateStr, status: 'not_set',
      check_in: '', check_out: '', shift: 'Office Hour', overtime: 0, notes: '',
      device: 'Fingerprint', location: 'Office',
    });
    setIsPanelOpen(true);
  };

  // UPDATED handleSaveAttendance with deletion on "Not Set"
  const handleSaveAttendance = async (status: AttendanceStatus, check_in?: string, check_out?: string, notes?: string) => {
    if (!selectedEmployee || !selectedDate) return;

    // ── Delete existing record when "Not Set" is clicked ──
    if (status === 'not_set' && editingRecord?.id && editingRecord.id !== 0) {
      setSubmitting(true);
      try {
        await apiClient.deleteAttendance(editingRecord.id);
        showSuccess('Deleted', 'Attendance record removed.');
        setIsPanelOpen(false);
        loadAttendance();
        refreshTodayStats();
        refreshTodayList();
      } catch (err: any) {
        showError('Delete failed', err.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ── If "Not Set" on a new record, simply close the panel ──
    if (status === 'not_set') {
      setIsPanelOpen(false);
      return;
    }

    // ── Otherwise, create or update normally ──
    const payload = {
      employee_id: Number(selectedEmployee),
      date: selectedDate,
      status,
      check_in: check_in || null,
      check_out: check_out || null,
      shift: editingRecord?.shift || 'Office Hour',
      overtime: editingRecord?.overtime || 0,
      notes: notes || '',
    };

    setSubmitting(true);
    try {
      if (editingRecord?.id && editingRecord.id !== 0) {
        await apiClient.updateAttendance(editingRecord.id, payload);
        showSuccess('Updated', `Status: ${getStatusLabel(status)}`);
      } else {
        await apiClient.createAttendance(payload);
        showSuccess('Recorded', `Status: ${getStatusLabel(status)}`);
      }
      setIsPanelOpen(false);
      loadAttendance();
      refreshTodayStats();
      refreshTodayList();
    } catch (err: any) {
      showError('Save failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const goToPrevMonth = () => {
    if (currentMonth === 1) { setCurrentYear(y => y - 1); setCurrentMonth(12); }
    else setCurrentMonth(m => m - 1);
  };
  const goToNextMonth = () => {
    if (currentMonth === 12) { setCurrentYear(y => y + 1); setCurrentMonth(1); }
    else setCurrentMonth(m => m + 1);
  };
  const goToToday = () => {
    const now = new Date(); setCurrentYear(now.getFullYear()); setCurrentMonth(now.getMonth() + 1);
  };

  const handleManualAttendance = () => {
    const today = new Date().toISOString().slice(0, 10);
    handleDayClick(today, attendanceRecords[today] || null);
  };

  const handleExport = () => {
    if (!Object.keys(attendanceRecords).length) { showError('No data', 'No records to export.'); return; }
    const headers = ['Date', 'Status', 'Check In', 'Check Out', 'Shift', 'Overtime(min)', 'Notes'];
    const rows = Object.values(attendanceRecords).map(r => [
      r.date, getStatusLabel(r.status), r.check_in || '', r.check_out || '',
      r.shift, r.overtime, r.notes,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    showSuccess('Export', 'CSV downloaded.');
  };

  // ---------- Device CRUD ----------
  const handleSyncDevice = async (numericId: number, name: string) => {
    try { await apiClient.syncDevice(numericId); showSuccess('Sync', `${name} sync started`); setTimeout(refreshDevices, 2000); }
    catch (err: any) { showError('Sync failed', err.message); }
  };
  const handleDeviceSettings = async (numericId: number) => {
    const json = prompt('Settings JSON:', '{"sleep_mode": false}');
    if (!json) return;
    try { await apiClient.updateDeviceSettings(numericId, JSON.parse(json)); showSuccess('Settings', 'Updated'); }
    catch (err: any) { showError('Settings error', err.message); }
  };
  const handleRestartDevice = async (numericId: number, name: string) => {
    if (!confirm(`Restart ${name}?`)) return;
    try { await apiClient.restartDevice(numericId); showSuccess('Restart', `${name} restarting`); setTimeout(refreshDevices, 5000); }
    catch (err: any) { showError('Restart failed', err.message); }
  };

  const openEditDeviceModal = (device: ESP32Device) => {
    setEditingDevice(device);
    setDeviceForm({
      name: device.name,
      device_uid: device.id,
      firmware_version: device.firmware,
      ip_address: device.ip !== '—' ? device.ip : '',
    });
    setShowDeviceModal(true);
  };

  const handleSaveDevice = async () => {
    if (!deviceForm.name || !deviceForm.device_uid) {
      showError('Validation', 'Name and UID are required.');
      return;
    }
    setSavingDevice(true);
    try {
      if (editingDevice) {
        await apiClient.updateDevice(editingDevice.numericId, {
          name: deviceForm.name,
          device_uid: deviceForm.device_uid,
          firmware_version: deviceForm.firmware_version,
          ip_address: deviceForm.ip_address || null,
        });
        showSuccess('Updated', 'Device details saved.');
      } else {
        await apiClient.registerDevice({
          device_uid: deviceForm.device_uid,
          name: deviceForm.name,
          company_id: 1,
          branch_id: 1,
          firmware_version: deviceForm.firmware_version,
          ip_address: deviceForm.ip_address || '',
        });
        showSuccess('Added', 'Device registered.');
      }
      setShowDeviceModal(false);
      refreshDevices();
    } catch (err: any) { showError('Save failed', err.message); }
    finally { setSavingDevice(false); }
  };

  const handleDeleteDevice = async (device: ESP32Device) => {
    if (!confirm(`Delete device "${device.name}"?`)) return;
    try {
      await apiClient.deleteDevice(device.numericId);
      showSuccess('Deleted', `${device.name} removed.`);
      refreshDevices();
    } catch (err: any) { showError('Delete failed', err.message); }
  };

  const selectedEmployeeData = useMemo(() => employees.find(e => e.id === selectedEmployee), [employees, selectedEmployee]);

  const [empSearch, setEmpSearch] = useState('');
  const filteredTodayList = useMemo(() => {
    if (!todayEmployeeList) return [];
    if (!empSearch.trim()) return todayEmployeeList;
    const q = empSearch.toLowerCase();
    return todayEmployeeList.filter(e =>
      e.employee_name.toLowerCase().includes(q) ||
      (e.employee_code || '').toLowerCase().includes(q)
    );
  }, [todayEmployeeList, empSearch]);

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Live operations
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiActivity className="text-cyan-300" /> Biometric Attendance
            <span className="text-sm font-normal text-cyan-100/70 ml-2">⚡ Live</span>
          </h1>
          <p className="text-sm text-slate-300">Real-time ESP32 biometric monitoring & attendance</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToToday} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20">Today</button>
          <button onClick={loadAttendance} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60" disabled={loading}><FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} /></button>
          <button onClick={handleExport} className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400 text-slate-950 transition hover:bg-cyan-300"><FiDownload size={14} /></button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="mb-5 flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {[
          { id: 'overview', label: 'Overview', icon: FiActivity },
          { id: 'attendance', label: 'Attendance', icon: FiCalendar },
          { id: 'devices', label: 'Devices', icon: FiServer },
        ].map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id as typeof activeView)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition ${
                activeView === item.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={16} /> {item.label}
            </button>
          );
        })}
      </nav>

      {/* Attendance mode controls */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><FiClock size={19} /></div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Attendance mode</p>
            <p className="text-xs text-slate-500">Manual or biometric capture.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setActiveView('attendance'); handleManualAttendance(); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition">
            <FiEdit size={15} /> Manual
          </button>
          <button
            onClick={() => setAutoAttendanceEnabled(!autoAttendanceEnabled)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              autoAttendanceEnabled ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${autoAttendanceEnabled ? 'bg-emerald-200 live-pulse' : 'bg-slate-400'}`} />
            Auto {autoAttendanceEnabled ? 'on' : 'off'}
          </button>
        </div>
      </div>

      {/* Overview Dashboard */}
      {activeView === 'overview' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-800">Today at a glance</h2>
                <p className="text-xs text-slate-500">Live attendance overview</p>
              </div>
              <span className="text-xs text-emerald-600 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 live-pulse" /> Updated live
              </span>
            </div>
            <StatCards todayStats={todayStats || { present: 0, absent: 0, late: 0, on_leave: 0 }} />
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">Employee Attendance Today</h3>
                <p className="text-xs text-slate-500">Real‑time status for all employees</p>
              </div>
              <div className="relative w-full sm:w-64">
                <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                />
              </div>
            </div>
            {todayListLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                    <SkeletonBox className="h-8 w-8 rounded-full" />
                    <SkeletonBox className="h-4 w-32" />
                    <SkeletonBox className="h-4 w-20 ml-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto custom-scrollbar">
                {filteredTodayList.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No attendance data found for today.</p>
                ) : (
                  filteredTodayList.map(emp => (
                    <div
                      key={emp.employee_id}
                      className="flex items-center justify-between py-2 px-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {emp.employee_name.charAt(0)}
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-medium text-slate-800 truncate">{emp.employee_name}</p>
                          {emp.employee_code && <p className="text-xs text-slate-400">{emp.employee_code}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 ml-4">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          emp.status === 'present' || emp.status === 'on_time' ? 'bg-emerald-100 text-emerald-700' :
                          emp.status === 'late' ? 'bg-amber-100 text-amber-700' :
                          emp.status === 'absent' ? 'bg-rose-100 text-rose-700' :
                          emp.status === 'leave' || emp.status === 'paid_leave' ? 'bg-purple-100 text-purple-700' :
                          emp.status === 'half_day' ? 'bg-indigo-100 text-indigo-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {getStatusLabel(emp.status)}
                        </span>
                        <span className="text-xs text-slate-500 hidden sm:block">{formatTime(emp.check_in)}</span>
                        <span className="text-xs text-slate-500 hidden sm:block">{formatTime(emp.check_out)}</span>
                        <span className="text-xs text-slate-400 hidden md:block">{formatWorkingHours(calculateWorkingHours(emp.check_in, emp.check_out))}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search & Filter (Attendance) */}
      {activeView === 'attendance' && (
        <>
          <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
            <div className="relative max-w-md">
              <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input
                type="text" placeholder="Search employees..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              />
            </div>
          </div>
          <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">🏢 Company</label>
                <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value ? Number(e.target.value) : '')} className="input-field w-full text-sm">
                  <option value="">All Companies</option>
                  {(companies || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">📍 Branch</label>
                <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value ? Number(e.target.value) : '')} className="input-field w-full text-sm" disabled={!selectedCompany}>
                  <option value="">All Branches</option>
                  {(filteredBranches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">📁 Department</label>
                <select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value ? Number(e.target.value) : '')} className="input-field w-full text-sm">
                  <option value="">All Departments</option>
                  {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">👤 Employee</label>
                <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value ? Number(e.target.value) : '')} className="input-field w-full text-sm" disabled={employees.length === 0}>
                  <option value="">Select Employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.employee_code ? `${emp.employee_code} - ` : ''}{emp.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Devices & Enrollment */}
      {activeView === 'devices' && (
        <>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-50"><FiServer className="text-cyan-600" /></span>
                ESP32 Devices
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{(devices || []).length}</span>
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditingDevice(null); setDeviceForm({ name: '', device_uid: '', firmware_version: 'v2.0.0', ip_address: '' }); setShowDeviceModal(true); }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-cyan-700 transition"
                >
                  <FiPlus size={16} /> Add Device
                </button>
              </div>
            </div>

            {devicesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => <DeviceCardSkeleton key={i} />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {(devices || []).map(device => {
                  const statusInfo = getDeviceStatusInfo(device.status);
                  return (
                    <div key={device.id} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-semibold text-slate-800">{device.name}</span>
                          <p className="text-[11px] text-slate-400">{device.id}</p>
                        </div>
                        <span className={`text-xs font-medium flex items-center gap-1.5 ${
                          device.status === 'online' ? 'text-emerald-600' : device.status === 'offline' ? 'text-rose-600' : 'text-amber-600'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${statusInfo.color}`} />
                          {statusInfo.text}
                          <statusInfo.icon size={12} />
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 space-y-1">
                        <div className="flex justify-between"><span>Branch:</span><span>{device.branch}</span></div>
                        <div className="flex justify-between"><span>WiFi:</span><span className={device.wifi === 'Connected' ? 'text-emerald-600' : 'text-rose-600'}>{device.wifi}</span></div>
                        <div className="flex justify-between"><span>IP:</span><span>{device.ip}</span></div>
                        <div className="flex justify-between"><span>CPU:</span><span>{device.cpu}</span></div>
                        <div className="flex justify-between"><span>FLASH:</span><span>{device.flash}</span></div>
                        <div className="flex justify-between"><span>MEMORY:</span><span>{device.memory}</span></div>
                        <div className="flex justify-between"><span>TEMPERATURE:</span><span>{device.temperature}</span></div>
                        <div className="flex justify-between"><span>UP TIME:</span><span>{device.uptime}</span></div>
                        <div className="flex justify-between"><span>Signal:</span><span>{device.signal} dBm</span></div>
                        <div className="flex justify-between"><span>Power:</span><span>{device.power}</span></div>
                        <div className="flex justify-between"><span>Last Sync:</span><span>{device.lastSync}</span></div>
                        {device.enrollmentStatus === 'pending' && (
                          <div className="mt-1 text-[11px] bg-purple-50 text-purple-700 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
                            <FiUserPlus size={10} /> Pending Enrollment (ID: {device.enrollmentEmployeeId})
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs text-slate-400">
                        <div className="flex gap-1.5">
                          <button onClick={() => handleSyncDevice(device.numericId, device.name)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-cyan-600 transition"
                            title="Sync">
                            <FiRefreshCw size={14} />
                          </button>
                          <button onClick={() => handleDeviceSettings(device.numericId)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-cyan-600 transition"
                            title="Settings">
                            <FiSettings size={14} />
                          </button>
                          <button onClick={() => openEditDeviceModal(device)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition"
                            title="Edit">
                            <FiEdit2 size={14} />
                          </button>
                          <button onClick={() => handleRestartDevice(device.numericId, device.name)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-rose-600 transition"
                            title="Restart">
                            <FiRotateCcw size={14} />
                          </button>
                          <button onClick={() => handleDeleteDevice(device)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition"
                            title="Delete">
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ===== Enrollment Section ===== */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
            <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <FiUserPlus className="text-purple-500" /> Fingerprint Enrollment
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Company</label>
                    <select value={enrollCompany} onChange={e => { setEnrollCompany(e.target.value ? Number(e.target.value) : ''); setEnrollBranch(''); setEnrollDevice(null); }} className="input-field w-full text-sm">
                      <option value="">Select Company</option>
                      {(companies || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Branch</label>
                    <select value={enrollBranch} onChange={e => { setEnrollBranch(e.target.value ? Number(e.target.value) : ''); setEnrollDevice(null); }} disabled={!enrollCompany} className="input-field w-full text-sm">
                      <option value="">Select Branch</option>
                      {(enrollableBranches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Online Device</label>
                    <select
                      value={enrollDevice?.numericId || ''}
                      onChange={e => {
                        const id = Number(e.target.value);
                        setEnrollDevice(devices?.find(d => d.numericId === id) || null);
                      }}
                      disabled={!enrollBranch || enrollableDevices.length === 0}
                      className="input-field w-full text-sm"
                    >
                      <option value="">Select a device</option>
                      {(enrollableDevices || []).map(d => (
                        <option key={d.numericId} value={d.numericId}>{d.name}</option>
                      ))}
                    </select>
                    {enrollBranch && enrollableDevices.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No online devices in this branch.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Employee</label>
                    <select value={enrollEmployeeId} onChange={e => setEnrollEmployeeId(e.target.value ? Number(e.target.value) : '')} className="input-field w-full text-sm" disabled={!enrollDevice}>
                      <option value="">Select Employee</option>
                      {employees.filter(e => !enrollBranch || e.branch_id === Number(enrollBranch)).map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleStartEnrollment}
                    disabled={enrolling || !enrollDevice || !enrollEmployeeId}
                    className="btn-primary w-full justify-center gap-2 py-2.5 mt-2"
                  >
                    {enrolling ? (
                      <><FiRefreshCw className="animate-spin" size={16} /> Enrolling...</>
                    ) : (
                      <><FiPlus size={16} /> Start Enrollment</>
                    )}
                  </button>
                  {enrolling && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>{enrollmentStep}</span>
                        <span>{enrollmentProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${enrollmentProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-700">Enrolled Fingers</h4>
                  <button onClick={fetchEnrolledFingers} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1" disabled={loadingEnrolled}>
                    <FiRefreshCw size={12} className={loadingEnrolled ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>
                {enrollEmployeeId ? (
                  enrolledFingers.length > 0 ? (
                    <ul className="space-y-2 text-sm max-h-48 overflow-y-auto custom-scrollbar">
                      {enrolledFingers.map((f: any, idx: number) => (
                        <li key={idx} className="flex items-center justify-between border-b border-slate-100 pb-1">
                          <span className="flex items-center gap-2">
                            <FiCheckCircle className="text-emerald-500" size={14} />
                            Finger #{f.fingerId || idx + 1}
                          </span>
                          {f.enrolledAt && <span className="text-xs text-slate-400">{new Date(f.enrolledAt).toLocaleDateString()}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400 py-4">{loadingEnrolled ? <SkeletonBox className="h-4 w-32" /> : 'No fingers enrolled.'}</p>
                  )
                ) : (
                  <p className="text-sm text-slate-400 py-4">Select an employee to view enrolled fingers.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Attendance Calendar */}
      {activeView === 'attendance' && (
        selectedEmployee && selectedEmployeeData ? (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold shadow-md">
                    {selectedEmployeeData.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{selectedEmployeeData.name}</h2>
                    <p className="text-sm text-slate-500">ID: {selectedEmployeeData.employee_code || 'N/A'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 flex-1 text-sm">
                  <div><p className="text-xs text-slate-400">Department</p><p className="font-medium truncate">{selectedEmployeeData.department || '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Designation</p><p className="font-medium truncate">{selectedEmployeeData.designation || '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Joining</p><p className="font-medium">{selectedEmployeeData.joining_date || '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Shift</p><p className="font-medium text-xs truncate">{selectedEmployeeData.shift || '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Weekly Off</p><p className="font-medium">{selectedEmployeeData.weekly_off || '—'}</p></div>
                </div>
              </div>
            </div>

            {/* Monthly Summary Cards */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
              <h3 className="text-md font-bold text-slate-800 mb-3 flex items-center gap-2">
                <FiCalendar className="text-blue-500" />
                {new Date(currentYear, currentMonth - 1).toLocaleString('default', { month: 'long' })} {currentYear} Summary
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
                <div className="bg-slate-50 rounded-lg p-2">
                  <span className="text-slate-500">Present</span>
                  <p className="font-bold text-emerald-600">{summary.present}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <span className="text-slate-500">Absent</span>
                  <p className="font-bold text-rose-600">{summary.absent}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <span className="text-slate-500">Half Day</span>
                  <p className="font-bold text-indigo-600">{summary.halfDay}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <span className="text-slate-500">Leaves</span>
                  <p className="font-bold text-purple-600">{summary.leave}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <span className="text-slate-500">Overtime</span>
                  <p className="font-bold text-amber-600">{summary.overtimeHours}h {summary.overtimeMins}m</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <span className="text-slate-500">Total Hours</span>
                  <p className="font-bold text-blue-600">{summary.totalWorkingHours}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-md font-semibold text-slate-700 flex items-center gap-2">
                  <FiCalendar className="text-blue-500" />
                  {new Date(currentYear, currentMonth - 1).toLocaleString('default', { month: 'long' })} {currentYear}
                </h3>
                <div className="flex gap-2">
                  <button onClick={goToPrevMonth} className="btn btn-sm btn-ghost">‹</button>
                  <button onClick={goToNextMonth} className="btn btn-sm btn-ghost">›</button>
                </div>
              </div>
              {loading ? <CalendarSkeleton /> : (
                <AttendanceCalendar year={currentYear} month={currentMonth} records={attendanceRecords} onDayClick={handleDayClick} />
              )}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <FiUsers size={48} className="mx-auto text-slate-300" />
            <p className="mt-2 text-slate-500">Select an employee to view attendance records.</p>
          </div>
        )
      )}

      {/* Offcanvas for editing attendance */}
      {isPanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas isOpen={isPanelOpen} title={`Attendance for ${selectedDate || ''}`} onClose={() => setIsPanelOpen(false)}>
            {editingRecord && (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-3 gap-2">
                  {(['present', 'half_day', 'absent', 'leave', 'holiday', 'not_set'] as AttendanceStatus[]).map(status => (
                    <button key={status} onClick={() => handleSaveAttendance(status)} disabled={submitting}
                      className={`btn ${editingRecord.status === status ? 'btn-primary' : 'btn-secondary'} w-full justify-center text-sm`}>
                      {getStatusLabel(status)}
                    </button>
                  ))}
                </div>
                <div className="border-t pt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-slate-500">Check In</label><input type="time" value={editingRecord.check_in || ''} onChange={e => setEditingRecord({...editingRecord, check_in: e.target.value})} className="input-field w-full" /></div>
                    <div><label className="text-xs text-slate-500">Check Out</label><input type="time" value={editingRecord.check_out || ''} onChange={e => setEditingRecord({...editingRecord, check_out: e.target.value})} className="input-field w-full" /></div>
                  </div>
                  <div><label className="text-xs text-slate-500">Overtime (min)</label><input type="number" value={editingRecord.overtime} onChange={e => setEditingRecord({...editingRecord, overtime: Number(e.target.value)})} className="input-field w-full" /></div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => handleSaveAttendance(editingRecord.status, editingRecord.check_in || undefined, editingRecord.check_out || undefined)} disabled={submitting} className="btn btn-primary flex-1">{submitting ? 'Saving...' : 'Save'}</button>
                    <button onClick={() => { setShowTimeView(true); setSelectedRecordForTime(editingRecord); }} className="btn btn-secondary"><FiEye size={16} /></button>
                  </div>
                </div>
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {/* View Time Popup */}
      {showTimeView && selectedRecordForTime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Attendance Details</h3>
              <button onClick={() => setShowTimeView(false)} className="p-1 hover:bg-slate-100 rounded-full"><FiX size={24} /></button>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Check In:</span> {formatTime(selectedRecordForTime.check_in)}</div>
              <div><span className="font-medium">Check Out:</span> {formatTime(selectedRecordForTime.check_out)}</div>
              <div><span className="font-medium">Working Hours:</span> {formatWorkingHours(calculateWorkingHours(selectedRecordForTime.check_in, selectedRecordForTime.check_out))}</div>
              <div><span className="font-medium">Overtime:</span> {selectedRecordForTime.overtime} min</div>
            </div>
            <div className="mt-4 flex justify-end"><button onClick={() => setShowTimeView(false)} className="btn btn-secondary">Close</button></div>
          </div>
        </div>
      )}

      {/* Add / Edit Device Modal */}
      {showDeviceModal && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">{editingDevice ? 'Edit Device' : 'Register New ESP32 Device'}</h3>
                <button onClick={() => setShowDeviceModal(false)} className="p-1 hover:bg-slate-100 rounded-full"><FiX size={24} /></button>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-slate-500">Device UID *</label>
                  <input type="text" value={deviceForm.device_uid} onChange={e => setDeviceForm({...deviceForm, device_uid: e.target.value})} className="input-field w-full" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Name *</label>
                  <input type="text" value={deviceForm.name} onChange={e => setDeviceForm({...deviceForm, name: e.target.value})} className="input-field w-full" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Firmware Version</label>
                  <input type="text" value={deviceForm.firmware_version} onChange={e => setDeviceForm({...deviceForm, firmware_version: e.target.value})} className="input-field w-full" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">IP Address</label>
                  <input type="text" value={deviceForm.ip_address} onChange={e => setDeviceForm({...deviceForm, ip_address: e.target.value})} className="input-field w-full" />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => setShowDeviceModal(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={handleSaveDevice} disabled={savingDevice} className="btn btn-primary">
                  {savingDevice ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </Suspense>
      )}

      <style>{`
        .stat-card { animation: attendance-fade-up .38s ease-out both; }
        .stat-card:nth-child(2) { animation-delay: .05s; }
        .stat-card:nth-child(3) { animation-delay: .1s; }
        .stat-card:nth-child(4) { animation-delay: .15s; }
        @keyframes attendance-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .live-pulse { animation: attendance-live-pulse 1.6s ease-in-out infinite; }
        @keyframes attendance-live-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.72); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}