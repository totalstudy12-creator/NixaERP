// src/pages/NotificationsPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, BellRing, Inbox, Mail, MessageSquare, Smartphone, Send, Settings2, RefreshCw,
  CheckCheck, Check, X, Search, Filter, ChevronDown, ChevronLeft, ChevronRight,
  Sparkles, AlertCircle, AlertTriangle, Info, CheckCircle2, Trash2, Download, Copy,
  Loader2, Zap, Activity, TrendingUp, TrendingDown, BarChart3, Calendar, Radio,
  CircleDot, Archive, Ban, Save, XCircle, Brain, Lightbulb, Target, CornerUpLeft,
  FileText, Plus, Pencil, ArrowUp, ArrowDown, RotateCw, Paperclip, Moon, Layers,
  ShieldAlert, Play, Pause, Timer, Repeat, TestTube, Users, User, Building2,
  Phone, MapPin, ExternalLink, Star, MessageCircle, PhoneCall, Package, Briefcase,
  Truck, Store, Handshake, CheckCircle,
} from 'lucide-react';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../store/auth';

/* ================================================================ */
/* Types                                                            */
/* ================================================================ */

type Priority = 'critical' | 'high' | 'normal' | 'low';
type Channel = 'in_app' | 'email' | 'whatsapp' | 'sms' | 'push';
type Tab = 'overview' | 'inbox' | 'send' | 'templates' | 'automation' | 'schedule'
         | 'daily' | 'queue' | 'delivery' | 'channels' | 'preferences';
type RecipientType = 'groups' | 'customers' | 'suppliers' | 'employees' | 'manual';

interface NotificationItem {
  id: number; title: string; message: string; read: boolean; created_at?: string;
  category?: string | null; priority?: string | null; channel?: string | null;
  event?: string | null; data?: Record<string, unknown>;
}
interface ProviderStatus {
  configured: boolean; ready: boolean; detail: string; public_key?: string | null;
  status?: string; subscriptions?: number; last_success_at?: string | null;
  last_error_at?: string | null; health?: 'healthy' | 'degraded' | 'down' | 'unknown';
}
interface DeliveryLog {
  id: number; channel: string; provider: string | null; recipient: string | null;
  status: string; attempt_count: number; error_message: string | null;
  sent_at: string | null; created_at: string; event?: string | null;
  notification_id?: number | null;
}
interface NotificationStats {
  notifications: { total: number; unread: number; critical: number };
  deliveries: { total: number; sent: number; failed: number; rate: number; by_channel: Record<string, Record<string, number>> };
}
interface Template {
  id: number | string; name: string; channel: Channel; subject?: string | null;
  body: string; enabled: boolean;
}
interface Rule {
  id: number | string; event: string; label?: string | null; channels: string[];
  priority: Priority; enabled: boolean;
}
interface Schedule {
  id: number | string; title: string; channel: Channel;
  message?: string; recipients?: string[];
  schedule_type: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
  run_at: string; timezone: string; enabled: boolean;
  last_run_at?: string | null; next_run_at?: string | null;
}
interface DailySettings {
  enabled: boolean; send_time: string; timezone: string; channels: string[];
  company_id?: number; branch_id?: number; recipients?: string[];
}
interface Prefs {
  channels: Record<string, boolean>;
  events: Record<string, boolean>;
  quiet_hours: boolean; quiet_from: string; quiet_to: string; critical_override: boolean;
}
interface Fallback { enabled: boolean; order: Channel[] }
interface RecipientOption { value: string; label: string }

/** A selected recipient (customer, dealer, employee, or raw phone/email). */
interface SelectedRecipient {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  type: RecipientType;
  raw?: string;
}

/** Minimal shape we require from `/customers`, `/suppliers`, `/employees`. */
interface EntityRecord {
  id: number | string;
  name?: string | null;
  full_name?: string | null;
  company_name?: string | null;
  business_name?: string | null;
  phone?: string | null;
  mobile?: string | null;
  contact_number?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  [key: string]: unknown;
}

/* ================================================================ */
/* Constants                                                        */
/* ================================================================ */

const CHANNELS: { value: Channel; label: string; icon: typeof Mail }[] = [
  { value: 'in_app',   label: 'In-App',   icon: Bell },
  { value: 'email',    label: 'Email',    icon: Mail },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { value: 'sms',      label: 'SMS',      icon: Smartphone },
  { value: 'push',     label: 'Push',     icon: Radio },
];

const PRIORITY: Record<Priority, { label: string; cls: string; icon: typeof Info }> = {
  critical: { label: 'Critical', cls: 'border-rose-200 bg-rose-50 text-rose-700',       icon: AlertTriangle },
  high:     { label: 'High',     cls: 'border-orange-200 bg-orange-50 text-orange-700', icon: AlertCircle },
  normal:   { label: 'Normal',   cls: 'border-slate-200 bg-slate-50 text-slate-600',    icon: Info },
  low:      { label: 'Low',      cls: 'border-slate-200 bg-slate-50 text-slate-500',    icon: Info },
};

const DELIVERY_TONE: Record<string, string> = {
  sent:       'border-emerald-200 bg-emerald-50 text-emerald-700',
  delivered:  'border-emerald-200 bg-emerald-50 text-emerald-700',
  pending:    'border-amber-200 bg-amber-50 text-amber-700',
  queued:     'border-indigo-200 bg-indigo-50 text-indigo-700',
  processing: 'border-blue-200 bg-blue-50 text-blue-700',
  failed:     'border-rose-200 bg-rose-50 text-rose-700',
};

const EVENTS = [
  { value: 'invoice.created',    label: 'Invoice created',    cat: 'Sales' },
  { value: 'invoice.paid',       label: 'Invoice paid',       cat: 'Sales' },
  { value: 'payment.received',   label: 'Payment received',   cat: 'Accounting' },
  { value: 'invoice.overdue',    label: 'Invoice overdue',    cat: 'Sales' },
  { value: 'customer.created',   label: 'New customer',       cat: 'Sales' },
  { value: 'purchase.created',   label: 'New purchase',       cat: 'Purchase' },
  { value: 'expense.created',    label: 'Expense created',    cat: 'Accounting' },
  { value: 'expense.approved',   label: 'Expense approved',   cat: 'Accounting' },
  { value: 'expense.rejected',   label: 'Expense rejected',   cat: 'Accounting' },
];

const VARS = [
  '{{customer_name}}','{{invoice_number}}','{{amount}}','{{company_name}}',
  '{{branch_name}}','{{date}}','{{vendor_name}}','{{product_name}}',
  '{{order_number}}','{{payment_method}}',
];

const RECIPIENT_TYPES: { value: RecipientType; label: string; icon: typeof Users }[] = [
  { value: 'groups',    label: 'Groups / Roles', icon: Users },
  { value: 'customers', label: 'Customers',      icon: User },
  { value: 'suppliers', label: 'Dealers / Suppliers', icon: Truck },
  { value: 'employees', label: 'Employees',      icon: Briefcase },
  { value: 'manual',    label: 'Manual entry',   icon: PhoneCall },
];

const DATE_PRESETS = [
  { value: 'all', label: 'All time' }, { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' },
] as const;
type DatePreset = (typeof DATE_PRESETS)[number]['value'] | 'custom';

const PER_PAGE = [10, 25, 50];

/* ================================================================ */
/* Helpers                                                          */
/* ================================================================ */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const decodeVapid = (encoded: string): ArrayBuffer => {
  const pad = '='.repeat((4 - (encoded.length % 4)) % 4);
  const b64 = (encoded + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(window.atob(b64), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
};

const normPriority = (raw?: string | null): Priority => {
  const s = String(raw ?? 'normal').toLowerCase();
  return s === 'critical' || s === 'urgent' ? 'critical'
       : s === 'high' || s === 'important' ? 'high'
       : s === 'low' || s === 'info' ? 'low' : 'normal';
};

const asList = <T,>(r: unknown): T[] => {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object') {
    const d = (r as { data?: unknown }).data;
    if (Array.isArray(d)) return d as T[];
    if (d && typeof d === 'object' && Array.isArray((d as { data?: unknown }).data))
      return (d as { data: T[] }).data;
  }
  throw new Error('The server returned an unexpected list response.');
};

const asObj = <T,>(r: unknown): T | null => {
  if (!r) return null;
  if (typeof r === 'object' && 'data' in (r as object))
    return ((r as { data?: unknown }).data ?? null) as T | null;
  return r as T;
};

const describeApiFailure = (label: string, error: unknown): string => {
  const apiError = error as { status?: number; backendMessage?: string; message?: string; validationErrors?: Record<string, string[] | string> };
  if (apiError.status === 401) return 'Your session expired. Sign in again to continue.';
  if (apiError.status === 403) return `You don't have permission to load ${label.toLowerCase()}.`;
  if (apiError.status === 422) {
    const validation = Object.values(apiError.validationErrors ?? {}).flatMap((value) => Array.isArray(value) ? value : [value])[0];
    return typeof validation === 'string' ? validation : `The ${label.toLowerCase()} request was invalid.`;
  }
  if (apiError.status && apiError.status >= 500) return `The server could not load ${label.toLowerCase()}.`;
  if (!apiError.status) return `Unable to connect while loading ${label.toLowerCase()}.`;
  return apiError.backendMessage ?? apiError.message ?? `Unable to load ${label.toLowerCase()}.`;
};

const fmtDate = (raw?: string | null): string => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch { return '—'; }
};

const fmtRel = (raw?: string | null): string => {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  try { return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(d); }
  catch { return ''; }
};

const money = (v: unknown): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    .format(Number(v) || 0);

const pctOf = (n: number, d: number) => (d <= 0 ? 0 : Math.round((n / d) * 100));

/**
 * Normalize a phone number to E.164 style for WhatsApp / SMS.
 * Handles spaces, dashes, brackets and the common Indian 10-digit format.
 * Returns '' when nothing usable remains.
 */
const normalizePhone = (raw: unknown, defaultCountry = '91'): string => {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const hadPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (hadPlus) return `+${digits}`;
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+${defaultCountry}${digits.slice(1)}`;
  return `+${digits}`;
};

const isValidPhone = (phone: string): boolean => /^\+[1-9]\d{6,14}$/.test(phone);

const entityName = (e: EntityRecord): string =>
  e.name || e.full_name || e.company_name || e.business_name || `#${e.id}`;

const entityPhone = (e: EntityRecord): string =>
  normalizePhone(e.whatsapp ?? e.phone ?? e.mobile ?? e.contact_number);

const entityEmail = (e: EntityRecord): string => String(e.email ?? '').trim();

const inPreset = (raw: string | null | undefined, p: DatePreset): boolean => {
  if (p === 'all') return true;
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const days = p === 'today' ? 0 : p === '7d' ? 6 : p === '30d' ? 29 : 0;
  const start = new Date(now); start.setDate(start.getDate() - days); start.setHours(0, 0, 0, 0);
  return d.getTime() >= start.getTime();
};

const dateRangeForPreset = (preset: DatePreset): { date_from?: string; date_to?: string } => {
  if (preset === 'all' || preset === 'custom') return {};
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (preset === 'today' ? 0 : preset === '7d' ? 6 : 29));
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { date_from: localDate(start), date_to: localDate(end) };
};

const localDateTimeInput = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const csvEscape = (v: unknown): string => {
  const raw = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `\t${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const download = (rows: string[][], filename: string) => {
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Render a template body with `{{var}}` placeholders replaced by the current
 * variable map. Any unresolved placeholders are left visible so the operator
 * notices them in the preview before sending.
 */
const renderTemplate = (body: string, vars: Record<string, string>): string =>
  body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, name) => {
    const value = vars[name];
    return value !== undefined && value !== '' ? value : match;
  });

/* ================================================================ */
/* Atoms                                                            */
/* ================================================================ */

const Pill = ({ children, cls }: { children: React.ReactNode; cls?: string }) => (
  <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', cls ?? 'border-slate-200 bg-slate-50 text-slate-600')}>
    {children}
  </span>
);

const PriorityPill = ({ p }: { p: Priority }) => {
  const cfg = PRIORITY[p];
  const Icon = cfg.icon;
  return <Pill cls={cfg.cls}><Icon size={10} />{cfg.label}</Pill>;
};

const StatusPill = ({ s }: { s: string }) => {
  const key = String(s).toLowerCase();
  return <Pill cls={DELIVERY_TONE[key] ?? DELIVERY_TONE.pending}>
    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
    {key.charAt(0).toUpperCase() + key.slice(1)}
  </Pill>;
};

const ChannelPill = ({ c }: { c: string }) => {
  const found = CHANNELS.find((x) => x.value === c);
  const Icon = found?.icon ?? Bell;
  return <Pill><Icon size={10} />{found?.label ?? c}</Pill>;
};

const Kpi = ({ icon: Icon, label, value, hint, tone }:
  { icon: typeof Bell; label: string; value: string; hint?: string; tone: string }) => {
  const grads: Record<string, string> = {
    emerald: 'from-emerald-500 to-teal-500',
    amber:   'from-amber-500 to-orange-500',
    indigo:  'from-indigo-500 to-blue-500',
    rose:    'from-rose-500 to-pink-500',
    violet:  'from-violet-500 to-purple-500',
    teal:    'from-teal-500 to-cyan-500',
  };
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cx('grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md', grads[tone])}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-0.5 truncate text-xl font-bold text-slate-900">{value}</p>
          {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="block text-sm">
    <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[10px] text-slate-500">{hint}</span>}
  </label>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={cx(
    'h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition',
    'focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10',
    props.className,
  )} />
);

const Select = ({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...rest} className={cx(
    'h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition',
    'focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10',
    rest.className,
  )}>{children}</select>
);

const Btn = ({ icon: Icon, children, variant = 'default', ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: typeof Bell; variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'outline' | 'whatsapp' }) => {
  const styles = {
    default:  'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    primary:  'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    ghost:    'text-slate-600 hover:bg-slate-100',
    danger:   'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    outline:  'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    whatsapp: 'bg-[#25D366] text-white hover:bg-[#1ebe5b] shadow-sm',
  };
  return (
    <button {...rest} className={cx(
      'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition disabled:opacity-50',
      styles[variant], rest.className,
    )}>
      {Icon && <Icon size={14} />}{children}
    </button>
  );
};

const Modal = ({ open, onClose, title, icon: Icon, children, footer, wide }:
  { open: boolean; onClose: () => void; title: string; icon?: typeof Bell;
    children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={cx('max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl', wide ? 'max-w-3xl' : 'max-w-xl')}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-2.5">
            {Icon && <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Icon size={16} /></div>}
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>
        <div className="p-6">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
};

/* ================================================================ */
/* Recipient picker (used inside Send tab)                         */
/* ================================================================ */

interface RecipientPickerProps {
  type: RecipientType;
  onTypeChange: (t: RecipientType) => void;
  groups: RecipientOption[];
  entities: EntityRecord[];
  entityLoading: boolean;
  selected: SelectedRecipient[];
  onSelect: (r: SelectedRecipient) => void;
  onRemove: (id: string) => void;
  channel: Channel;
  canUseWhatsApp: boolean;
}

function RecipientPicker({
  type, onTypeChange, groups, entities, entityLoading, selected, onSelect, onRemove, channel, canUseWhatsApp,
}: RecipientPickerProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entities.slice(0, 40);
    return entities
      .filter((e) => {
        const hay = [entityName(e), entityPhone(e), entityEmail(e), e.city]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [entities, search]);

  const disabledForWhatsApp = (e: EntityRecord): boolean =>
    channel === 'whatsapp' && !isValidPhone(entityPhone(e));

  return (
    <div className="space-y-3">
      {/* Type tabs */}
      <div className="flex flex-wrap gap-1.5">
        {RECIPIENT_TYPES.map((rt) => {
          const active = type === rt.value;
          const Icon = rt.icon;
          return (
            <button
              key={rt.value}
              type="button"
              onClick={() => onTypeChange(rt.value)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition',
                active
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              <Icon size={12} /> {rt.label}
            </button>
          );
        })}
      </div>

      {/* Groups mode */}
      {type === 'groups' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          {groups.length === 0 ? (
            <p className="text-xs text-slate-500">No recipient groups available for your account.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const isSelected = selected.some((s) => s.type === 'groups' && s.raw === g.value);
                return (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => isSelected
                      ? onRemove(`group:${g.value}`)
                      : onSelect({ id: `group:${g.value}`, name: g.label, type: 'groups', raw: g.value })}
                    className={cx(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
                      isSelected
                        ? 'border-emerald-400 bg-emerald-500 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700',
                    )}
                  >
                    {isSelected ? <Check size={10} /> : <Plus size={10} />}
                    {g.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Entity mode (customers/suppliers/employees) */}
      {type !== 'groups' && type !== 'manual' && (
        <div className="space-y-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${type === 'customers' ? 'customers' : type === 'suppliers' ? 'dealers / suppliers' : 'employees'} by name, phone, or email…`}
              className="pl-9"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white">
            {entityLoading ? (
              <div className="space-y-1.5 p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {search ? 'No matches.' : 'Nothing to show yet.'}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((e) => {
                  const id = `${type}:${e.id}`;
                  const isSelected = selected.some((s) => s.id === id);
                  const phone = entityPhone(e);
                  const disabled = disabledForWhatsApp(e);
                  return (
                    <li key={String(e.id)}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => isSelected ? onRemove(id) : onSelect({
                          id,
                          name: entityName(e),
                          phone,
                          email: entityEmail(e),
                          company: String(e.company_name ?? e.business_name ?? ''),
                          type,
                        })}
                        className={cx(
                          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition',
                          isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50',
                          disabled && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <span className={cx(
                          'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold',
                          isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500',
                        )}>
                          {isSelected ? <Check size={12} /> : (type === 'customers' ? <User size={12} /> : type === 'suppliers' ? <Truck size={12} /> : <Briefcase size={12} />)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-800">{entityName(e)}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                            {phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone size={9} />
                                {phone}
                                {channel === 'whatsapp' && !isValidPhone(phone) && (
                                  <span className="text-rose-600">· invalid</span>
                                )}
                              </span>
                            )}
                            {entityEmail(e) && <span className="inline-flex items-center gap-1"><Mail size={9} />{entityEmail(e)}</span>}
                            {e.city && <span className="inline-flex items-center gap-1"><MapPin size={9} />{String(e.city)}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Manual mode */}
      {type === 'manual' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-[11px] text-slate-600">
            Enter raw {channel === 'whatsapp' || channel === 'sms' ? 'phone numbers (one per line, +country code preferred)' : 'email addresses or user IDs (comma or newline separated)'} below. They will be added to the recipients list.
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            Tip: use the “Add recipient” field in the next section to append individual numbers.
          </p>
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
              {selected.length} recipient{selected.length === 1 ? '' : 's'} selected
            </p>
            <button
              type="button"
              onClick={() => selected.forEach((s) => onRemove(s.id))}
              className="text-[10px] font-medium text-emerald-700 hover:underline"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                {r.type === 'groups' ? <Users size={10} /> : r.type === 'customers' ? <User size={10} /> : r.type === 'suppliers' ? <Truck size={10} /> : r.type === 'employees' ? <Briefcase size={10} /> : <PhoneCall size={10} />}
                <span className="max-w-[140px] truncate">{r.name}</span>
                {r.phone && <span className="text-[9px] text-emerald-600">{r.phone}</span>}
                <button type="button" onClick={() => onRemove(r.id)} className="ml-0.5 grid h-4 w-4 place-items-center rounded-full hover:bg-emerald-100">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* WhatsApp warning when no valid phones */}
      {channel === 'whatsapp' && selected.length > 0 && !selected.some((r) => r.type === 'groups' || isValidPhone(r.phone ?? '')) && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          No valid WhatsApp number selected. Add customers, dealers, or employees with a phone number, or use manual entry.
        </p>
      )}

      {channel === 'whatsapp' && !canUseWhatsApp && (
        <p className="flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
          <AlertCircle size={11} className="mt-0.5 shrink-0" />
          You do not have permission to send WhatsApp notifications.
        </p>
      )}
    </div>
  );
}

/* ================================================================ */
/* Live preview                                                     */
/* ================================================================ */

function LivePreview({
  channel, title, body, subject, recipients, provider, priority,
}: {
  channel: Channel;
  title: string;
  body: string;
  subject: string;
  recipients: SelectedRecipient[];
  provider?: ProviderStatus;
  priority: Priority;
}) {
  const first = recipients[0];

  /* WhatsApp / SMS chat-style preview */
  if (channel === 'whatsapp' || channel === 'sms') {
    const isWhatsApp = channel === 'whatsapp';
    return (
      <div className={cx(
        'overflow-hidden rounded-2xl border shadow-sm',
        isWhatsApp ? 'border-[#25D366]/30 bg-[#0b141a]' : 'border-slate-200 bg-slate-100',
      )}>
        <div className={cx(
          'flex items-center gap-2 px-4 py-3',
          isWhatsApp ? 'bg-[#111b21] text-white' : 'border-b border-slate-200 bg-white',
        )}>
          <div className={cx('grid h-9 w-9 place-items-center rounded-full', isWhatsApp ? 'bg-[#25D366]' : 'bg-slate-200 text-slate-600')}>
            {isWhatsApp ? <MessageSquare size={16} /> : <Smartphone size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className={cx('truncate text-sm font-semibold', isWhatsApp ? 'text-white' : 'text-slate-800')}>
              {first ? first.name : 'No recipient'}
            </p>
            <p className={cx('truncate text-[10px]', isWhatsApp ? 'text-emerald-200' : 'text-slate-500')}>
              {first?.phone ? first.phone : first?.email ? first.email : 'Select a recipient'}
            </p>
          </div>
          <ChannelPill c={channel} />
        </div>
        <div className={cx('min-h-[220px] space-y-2 p-4', isWhatsApp ? '' : 'bg-slate-100')}>
          <div className={cx(
            'ml-auto max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm',
            isWhatsApp
              ? 'rounded-tr-sm bg-[#005c4b] text-white'
              : 'rounded-tr-sm bg-indigo-600 text-white',
          )}>
            {body
              ? <p className="whitespace-pre-wrap break-words">{body}</p>
              : <p className="italic opacity-60">Type the message body to see it here…</p>}
            <p className={cx('mt-1.5 flex items-center justify-end gap-1 text-[9px]', isWhatsApp ? 'text-emerald-200' : 'text-indigo-200')}>
              {fmtDate(new Date().toISOString())}
              <CheckCheck size={10} />
            </p>
          </div>

          {recipients.length > 1 && (
            <p className={cx('text-center text-[10px]', isWhatsApp ? 'text-slate-400' : 'text-slate-500')}>
              …and {recipients.length - 1} more recipient{recipients.length > 2 ? 's' : ''} will receive the same message
            </p>
          )}
        </div>
        <div className={cx('border-t px-4 py-2 text-[10px]', isWhatsApp ? 'border-white/5 bg-[#0b141a] text-slate-400' : 'border-slate-200 bg-white text-slate-500')}>
          {isWhatsApp
            ? <><PhoneCall size={10} className="mr-1 inline" />Delivered via WhatsApp Web worker{provider?.ready ? ' · provider ready' : ' · provider not ready'}</>
            : <><Smartphone size={10} className="mr-1 inline" />SMS gateway</>}
        </div>
      </div>
    );
  }

  /* Email preview */
  if (channel === 'email') {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Mail size={12} className="text-emerald-600" />
            <span className="font-semibold uppercase tracking-wider">Email preview</span>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid gap-1.5 text-xs">
            <div className="flex items-center gap-2 text-slate-500"><span className="w-16 font-semibold">From:</span><span className="text-slate-800">Nexa ERP &lt;no-reply@nexaerp.local&gt;</span></div>
            <div className="flex items-center gap-2 text-slate-500"><span className="w-16 font-semibold">To:</span><span className="truncate text-slate-800">{recipients.length ? recipients.map((r) => r.email || r.name).join(', ') : '—'}</span></div>
            <div className="flex items-center gap-2 text-slate-500"><span className="w-16 font-semibold">Subject:</span><span className="truncate font-semibold text-slate-900">{subject || title || '(no subject)'}</span></div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">
              {body || <span className="italic text-slate-400">Type the message body to preview it…</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <PriorityPill p={priority} />
            <span>·</span>
            <span>{provider?.ready ? 'Provider ready' : 'Provider not configured'}</span>
          </div>
        </div>
      </div>
    );
  }

  /* Push preview */
  if (channel === 'push') {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Radio size={12} className="text-emerald-600" />
            <span className="font-semibold uppercase tracking-wider">Push notification</span>
          </div>
        </div>
        <div className="p-4">
          <div className="mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                <Bell size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{title || 'Notification title'}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{body || 'Message body appears here.'}</p>
                <p className="mt-1 text-[10px] text-slate-400">Nexa ERP · now</p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[10px] text-slate-500">
            Delivered to {provider?.subscriptions ?? 0} subscribed device{(provider?.subscriptions ?? 0) === 1 ? '' : 's'}
          </p>
        </div>
      </div>
    );
  }

  /* In-app preview */
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <Bell size={12} className="text-emerald-600" />
          <span className="font-semibold uppercase tracking-wider">In-app notification</span>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Bell size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-slate-900">{title || 'Notification title'}</p>
                <PriorityPill p={priority} />
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-slate-700">{body || 'Message body appears here.'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================ */
/* Page                                                             */
/* ================================================================ */

export function NotificationsPage() {
  const { showSuccess, showError } = useNotification();
  const { can, canAny } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  const canView = canAny(['notifications.view', 'view notifications']);
  const canSend = can('notifications.send');
  const canSendWhatsApp = can('notifications.whatsapp.send');
  const canTemplates = canAny(['notifications.templates', 'notifications.manage']);
  const canAutomation = canAny(['notifications.automation', 'notifications.manage']);
  const canSchedule = canAny(['notifications.schedule', 'notifications.manage']);
  const canQueue = canAny(['notifications.queue', 'notifications.manage']);
  const canDelivery = canAny(['notifications.delivery', 'notifications.view']);
  const canManagePreferences = can('notifications.preferences');
  const canManageSettings = can('notifications.manage');
  const canConfig = canAny(['daily_summary.configure', 'reports.daily_summary.configure']);
  const canViewWhatsAppProvider = canAny(['notifications.providers', 'notifications.whatsapp.view', 'notifications.view']);
  const canConnectWhatsApp = canAny(['notifications.whatsapp.connect', 'notifications.providers']);
  const canTestWhatsApp = canAny(['notifications.whatsapp.test', 'notifications.send']);

  /* -------- State: core -------- */
  const [tab, setTab] = useState<Tab>('overview');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailures, setLoadFailures] = useState<Record<string, string>>({});
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [notificationStats, setNotificationStats] = useState<NotificationStats | null>(null);
  const [providers, setProviders] = useState<Record<string, ProviderStatus>>({});
  const [whatsappQr, setWhatsappQr] = useState<string | null>(null);
  const [whatsappTestNumber, setWhatsappTestNumber] = useState('');
  const [recipientGroups, setRecipientGroups] = useState<RecipientOption[]>([]);
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [summary, setSummary] = useState<{ profit?: { gross_profit?: number; net_profit?: number }; sales?: number; expenses?: number; receivables?: number } | null>(null);

  /* -------- State: enterprise -------- */
  const [templates, setTemplates] = useState<Template[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [queue, setQueue] = useState<DeliveryLog[]>([]);
  const [settings, setSettings] = useState<DailySettings>({ enabled: false, send_time: '21:00', timezone: 'Asia/Kolkata', channels: ['email'] });
  const [prefs, setPrefs] = useState<Prefs>({
    channels: { in_app: true, email: true, whatsapp: false, sms: false, push: true },
    events: EVENTS.reduce((a, e) => ({ ...a, [e.value]: true }), {} as Record<string, boolean>),
    quiet_hours: false, quiet_from: '22:00', quiet_to: '07:00', critical_override: true,
  });
  const [fallback, setFallback] = useState<Fallback>({ enabled: false, order: ['whatsapp', 'email', 'sms', 'push', 'in_app'] });

  /* -------- State: filters -------- */
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [channelF, setChannelF] = useState<'all' | Channel>('all');
  const [priorityF, setPriorityF] = useState<'all' | Priority>('all');
  const [readF, setReadF] = useState<'all' | 'read' | 'unread'>('all');
  const [eventF, setEventF] = useState('all');
  const [dateF, setDateF] = useState<DatePreset>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [selected, setSelected] = useState<number[]>([]);
  const [viewing, setViewing] = useState<NotificationItem | null>(null);

  /* -------- State: compose form -------- */
  const [recipientType, setRecipientType] = useState<RecipientType>('customers');
  const [selectedRecipients, setSelectedRecipients] = useState<SelectedRecipient[]>([]);
  const [manualEntry, setManualEntry] = useState('');
  const [customers, setCustomers] = useState<EntityRecord[]>([]);
  const [suppliers, setSuppliers] = useState<EntityRecord[]>([]);
  const [employees, setEmployees] = useState<EntityRecord[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);

  const [compose, setCompose] = useState({
    title: '', message: '', channel: 'in_app' as Channel, priority: 'normal' as Priority,
    subject: '', schedule_at: '', template_id: '', variables: {} as Record<string, string>,
    attachment: null as File | null,
  });
  const composeVariables = VARS.filter((variable) =>
    [compose.title, compose.message, compose.subject].some((content) => content.includes(variable)),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushHere, setPushHere] = useState(false);
  const [configMode, setConfigMode] = useState(false);
  const [editing, setEditing] = useState<{ kind: 'template' | 'rule' | 'schedule'; value: any } | null>(null);

  /* -------- State: AI -------- */
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLog, setAiLog] = useState<{ id: string; role: 'user' | 'ai'; text: string; suggestions?: string[] }[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const aiEnd = useRef<HTMLDivElement | null>(null);

  /* -------- Loaders -------- */
  const loadResource = useCallback(async (label: string, load: () => Promise<void>) => {
    try {
      await load();
      setLoadFailures((current) => {
        if (!(label in current)) return current;
        const next = { ...current }; delete next[label]; return next;
      });
    } catch (error) {
      const message = describeApiFailure(label, error);
      setLoadFailures((current) => ({ ...current, [label]: message }));
      showError('Unable to load notifications', message);
    }
  }, [showError]);

  const loadCore = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (query) params.set('search', query);
    if (channelF !== 'all') params.set('channel', channelF);
    if (priorityF !== 'all') params.set('priority', priorityF);
    if (readF !== 'all') params.set('read', readF);
    if (eventF !== 'all') params.set('event', eventF);
    Object.entries(dateRangeForPreset(dateF)).forEach(([key, value]) => params.set(key, value));
    await Promise.all([
      loadResource('notifications', async () => {
        const response = await apiClient.request('GET', `/notifications?${params.toString()}`) as {
          current_page?: number; last_page?: number; total?: number;
        };
        setItems(asList<NotificationItem>(response));
        setPagination({ current_page: response.current_page ?? page, last_page: response.last_page ?? 1, total: response.total ?? 0 });
      }),
      loadResource('notification statistics', async () => {
        const response = asObj<NotificationStats>(await apiClient.request('GET', '/notifications/summary'));
        if (!response || !response.notifications || !response.deliveries) throw new Error('Notification statistics response was invalid.');
        setNotificationStats(response);
        setUnreadTotal(response.notifications.unread);
      }),
      loadResource('provider status', async () => {
        const response = await apiClient.request('GET', '/notifications/providers');
        const data = asObj<Record<string, ProviderStatus>>(response);
        if (!data) throw new Error('Provider status response was empty.');
        setProviders(data);
      }),
      loadResource('delivery history', async () => setLogs(asList<DeliveryLog>(await apiClient.request('GET', '/notifications/deliveries?per_page=100')))),
      loadResource('daily summary', async () => {
        const data = asObj<typeof summary>(await apiClient.request('GET', '/daily-summary'));
        if (!data) throw new Error('Daily summary response was empty.');
        setSummary(data);
      }),
    ]);
    setLoading(false);
  }, [loadResource, page, perPage, query, channelF, priorityF, readF, eventF, dateF]);

  const loadEnterprise = useCallback(async () => {
    await Promise.all([
      loadResource('templates', async () => setTemplates(asList<Template>(await apiClient.request('GET', '/notifications/templates')))),
      loadResource('automation rules', async () => setRules(asList<Rule>(await apiClient.request('GET', '/notifications/automation')))),
      loadResource('scheduled notifications', async () => setSchedules(asList<Schedule>(await apiClient.request('GET', '/notifications/scheduled')))),
      loadResource('notification queue', async () => setQueue(asList<DeliveryLog>(await apiClient.request('GET', '/notifications/queue')))),
      loadResource('daily summary settings', async () => {
        const data = asObj<DailySettings>(await apiClient.request('GET', '/daily-summary/settings'));
        if (!data) throw new Error('Daily summary settings response was empty.');
        setSettings((previous) => ({ ...previous, ...data }));
      }),
      loadResource('notification preferences', async () => {
        const data = asObj<Partial<Prefs>>(await apiClient.request('GET', '/notifications/preferences'));
        if (!data) throw new Error('Notification preferences response was empty.');
        setPrefs((previous) => ({ ...previous, ...data, channels: { ...previous.channels, ...(data.channels ?? {}) }, events: { ...previous.events, ...(data.events ?? {}) } }));
      }),
      loadResource('fallback settings', async () => {
        const data = asObj<Fallback>(await apiClient.request('GET', '/notifications/fallback'));
        if (!data || !Array.isArray(data.order)) throw new Error('Fallback settings response was invalid.');
        setFallback(data);
      }),
    ]);
  }, [loadResource]);

  /** Load recipient groups (roles) — needed by the Send tab. */
  useEffect(() => {
    if (!canSend) return;
    void loadResource('recipient groups', async () => {
      setRecipientGroups(asList<RecipientOption>(await apiClient.request('GET', '/notifications/recipients')));
    });
  }, [canSend, loadResource]);

  /** Load customers / suppliers / employees — only when the Send tab is active. */
  const loadEntities = useCallback(async () => {
    setEntityLoading(true);
    try {
      const [c, s, e] = await Promise.all([
        apiClient.request('GET', '/customers?per_page=200').catch(() => []),
        apiClient.request('GET', '/suppliers?per_page=200').catch(() => []),
        apiClient.request('GET', '/employees?per_page=200').catch(() => []),
      ]);
      try { setCustomers(asList<EntityRecord>(c)); } catch { setCustomers([]); }
      try { setSuppliers(asList<EntityRecord>(s)); } catch { setSuppliers([]); }
      try { setEmployees(asList<EntityRecord>(e)); } catch { setEmployees([]); }
    } finally { setEntityLoading(false); }
  }, []);

  useEffect(() => {
    if (tab !== 'send') return;
    if (customers.length || suppliers.length || employees.length) return;
    void loadEntities();
  }, [tab, customers.length, suppliers.length, employees.length, loadEntities]);

  const loadWhatsAppQr = useCallback(async () => {
    if (!canViewWhatsAppProvider) return;
    try {
      const response = await apiClient.request('GET', '/notifications/providers/whatsapp/qr');
      const payload = asObj<{ qr?: string }>(response);
      setWhatsappQr(payload?.qr || null);
    } catch { setWhatsappQr(null); }
  }, [canViewWhatsAppProvider]);

  useEffect(() => {
    if (providers.whatsapp?.status === 'qr_required' && canViewWhatsAppProvider) { void loadWhatsAppQr(); return; }
    setWhatsappQr(null);
  }, [providers.whatsapp?.status, canViewWhatsAppProvider, loadWhatsAppQr]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCore(), loadEnterprise()]);
  }, [loadCore, loadEnterprise]);

  useEffect(() => {
    if (loadingUser && !hasUser) return;
    void loadCore();
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration('/').then(async (r) => {
        try { setPushHere(Boolean(await r?.pushManager.getSubscription())); } catch { /* ignore */ }
      });
    }
  }, [loadingUser, hasUser, loadCore]);

  useEffect(() => {
    if (loadingUser && !hasUser) return;
    void loadEnterprise();
  }, [loadingUser, hasUser, loadEnterprise]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => void loadCore(), 60_000);
    return () => window.clearInterval(refreshTimer);
  }, [loadCore]);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(searchInput.trim().toLowerCase()), 220);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [query, channelF, priorityF, readF, eventF, dateF, perPage]);
  useEffect(() => { try { aiEnd.current?.scrollIntoView({ behavior: 'smooth' }); } catch { /* ignore */ } }, [aiLog, aiBusy]);

  /* -------- Derived -------- */
  const unread = notificationStats?.notifications.unread ?? unreadTotal;
  const critical = notificationStats?.notifications.critical ?? items.filter((n) => !n.read && normPriority(n.priority) === 'critical').length;
  const dStats = useMemo(() => {
    if (notificationStats) return notificationStats.deliveries;
    const total = logs.length;
    const sent = logs.filter((l) => ['sent', 'delivered'].includes(String(l.status).toLowerCase())).length;
    const failed = logs.filter((l) => String(l.status).toLowerCase() === 'failed').length;
    return { total, sent, failed, rate: pctOf(sent, total), by_channel: {} };
  }, [logs, notificationStats]);

  const filtered = useMemo(() => {
    let r = [...items];
    if (readF === 'unread') r = r.filter((n) => !n.read);
    else if (readF === 'read') r = r.filter((n) => n.read);
    if (priorityF !== 'all') r = r.filter((n) => normPriority(n.priority) === priorityF);
    if (channelF !== 'all') r = r.filter((n) => (n.channel ?? 'in_app') === channelF);
    if (eventF !== 'all') r = r.filter((n) => String(n.event ?? n.data?.event ?? n.category ?? '') === eventF);
    if (query) r = r.filter((n) => [n.title, n.message, n.category].filter(Boolean).join(' ').toLowerCase().includes(query));
    if (dateF !== 'all') r = r.filter((n) => inPreset(n.created_at, dateF));
    r.sort((a, b) => (new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()));
    return r;
  }, [items, readF, priorityF, channelF, eventF, query, dateF]);

  const pages = Math.max(1, pagination.last_page);
  const curPage = Math.min(pagination.current_page, pages);
  const paged = filtered;
  const pageSel = paged.length > 0 && paged.every((n) => selected.includes(n.id));

  const chips = useMemo(() => {
    const c: { label: string; clear: () => void }[] = [];
    if (channelF !== 'all') c.push({ label: `Channel: ${CHANNELS.find((x) => x.value === channelF)?.label}`, clear: () => setChannelF('all') });
    if (priorityF !== 'all') c.push({ label: `Priority: ${PRIORITY[priorityF].label}`, clear: () => setPriorityF('all') });
    if (readF !== 'all') c.push({ label: `Status: ${readF}`, clear: () => setReadF('all') });
    if (eventF !== 'all') c.push({ label: `Event: ${eventF}`, clear: () => setEventF('all') });
    if (dateF !== 'all') c.push({ label: `Date: ${DATE_PRESETS.find((p) => p.value === dateF)?.label ?? 'Custom'}`, clear: () => setDateF('all') });
    if (query) c.push({ label: `Search: "${query.slice(0, 15)}…"`, clear: () => { setSearchInput(''); setQuery(''); } });
    return c;
  }, [channelF, priorityF, readF, eventF, dateF, query]);

  /* -------- Preview helpers -------- */
  const resolvedMessage = useMemo(
    () => renderTemplate(compose.message, compose.variables),
    [compose.message, compose.variables],
  );
  const resolvedTitle = useMemo(
    () => renderTemplate(compose.title, compose.variables),
    [compose.title, compose.variables],
  );

  /** When a customer/supplier/employee is added, auto-fill variables from their record. */
  const fillVariablesFromRecipient = useCallback((recipient: SelectedRecipient) => {
    setCompose((previous) => {
      const next = { ...previous.variables };
      if (recipient.name) {
        if (recipient.type === 'suppliers') next.vendor_name = next.vendor_name || recipient.name;
        else next.customer_name = next.customer_name || recipient.name;
      }
      if (recipient.company && !next.company_name) next.company_name = recipient.company;
      return { ...previous, variables: next };
    });
  }, []);

  /* -------- Actions -------- */
  const api = async <T,>(method: string, url: string, data?: unknown): Promise<T | null> => {
    try { return await apiClient.request(method, url, data) as T; }
    catch (e) { showError('Action failed', describeApiFailure(url, e)); return null; }
  };

  const markRead = async (id: number) => {
    const ok = await api('POST', `/notifications/${id}/read`);
    if (ok !== null) setItems((p) => p.map((n) => n.id === id ? { ...n, read: true } : n));
  };
  const markUnread = async (id: number) => {
    const ok = await api('POST', `/notifications/${id}/unread`);
    if (ok !== null) {
      setItems((p) => p.map((n) => n.id === id ? { ...n, read: false } : n));
      setViewing((v) => v?.id === id ? { ...v, read: false } : v);
    }
  };
  const markAllRead = async () => {
    const ok = await api('POST', '/notifications/read-all');
    if (ok !== null) { await loadCore(); showSuccess('Done', 'All marked as read.'); }
  };
  const archive = async (id: number) => {
    const ok = await api('POST', `/notifications/${id}/archive`);
    if (ok !== null) { setItems((p) => p.filter((n) => n.id !== id)); setViewing((v) => v?.id === id ? null : v); }
  };
  const remove = async (id: number) => {
    if (!window.confirm('Delete this notification?')) return;
    const ok = await api('DELETE', `/notifications/${id}`);
    if (ok !== null) { setItems((p) => p.filter((n) => n.id !== id)); setViewing((v) => v?.id === id ? null : v); showSuccess('Deleted', ''); }
  };
  const bulkMarkRead = async () => {
    if (!selected.length) return;
    const results = await Promise.all(selected.map((id) => api('POST', `/notifications/${id}/read`)));
    if (results.some((r) => r === null)) return;
    setItems((p) => p.map((n) => selected.includes(n.id) ? { ...n, read: true } : n));
    setSelected([]); showSuccess('Done', `${selected.length} marked as read.`);
  };
  const bulkArchive = async () => {
    if (!selected.length || !window.confirm(`Archive ${selected.length}?`)) return;
    const results = await Promise.all(selected.map((id) => api('POST', `/notifications/${id}/archive`)));
    if (results.some((r) => r === null)) return;
    setItems((p) => p.filter((n) => !selected.includes(n.id)));
    showSuccess('Archived', `${selected.length} archived.`); setSelected([]);
  };

  /** Add manual entries (phone numbers or emails) as recipients. */
  const addManualRecipients = () => {
    const entries = manualEntry.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
    if (!entries.length) return;
    const created: SelectedRecipient[] = [];
    for (const entry of entries) {
      const looksLikeEmail = entry.includes('@');
      const phone = looksLikeEmail ? '' : normalizePhone(entry);
      if (!looksLikeEmail && !phone) continue;
      created.push({
        id: `manual:${looksLikeEmail ? entry : phone}`,
        name: looksLikeEmail ? entry : phone,
        phone: looksLikeEmail ? undefined : phone,
        email: looksLikeEmail ? entry : undefined,
        type: 'manual',
        raw: entry,
      });
    }
    if (!created.length) { showError('No valid entries', 'Enter at least one phone number or email.'); return; }
    setSelectedRecipients((cur) => {
      const merged = [...cur];
      for (const c of created) if (!merged.some((x) => x.id === c.id)) merged.push(c);
      return merged;
    });
    setManualEntry('');
  };

  /** Send the composed notification. */
  const send = async () => {
    if (!canSend || !compose.title.trim() || !compose.message.trim()) {
      showError('Validation', 'Title and message are required.'); return;
    }
    if (compose.channel === 'whatsapp' && !canSendWhatsApp) {
      showError('Permission denied', 'You do not have permission to send WhatsApp notifications.'); return;
    }
    if (selectedRecipients.length === 0) {
      showError('Validation', 'Add at least one recipient before sending.'); return;
    }

    /* The API resolves recipients from string tokens, not picker objects. */
    const payloadRecipients = selectedRecipients.map((recipient) => {
      if (recipient.type === 'groups') return recipient.raw ?? recipient.id;
      if (recipient.type === 'manual') return recipient.raw ?? recipient.phone ?? recipient.email ?? '';

      const kind = recipient.type === 'customers'
        ? 'customer'
        : recipient.type === 'suppliers' ? 'supplier' : 'employee';
      const id = recipient.id.slice(recipient.id.indexOf(':') + 1);
      return `${kind}:${id}`;
    });

    /* WhatsApp: validate every phone number up front. */
    if (compose.channel === 'whatsapp') {
      const invalid = selectedRecipients.filter((r) => r.type !== 'groups' && !isValidPhone(r.phone ?? ''));
      if (invalid.length) {
        showError('Invalid WhatsApp number', `Check phone numbers for: ${invalid.map((r) => r.name).join(', ')}.`); return;
      }
    }

    /* Validate required template variables. */
    const missingVariables = composeVariables.filter((variable) => !compose.variables[variable.slice(2, -2)]?.trim());
    if (missingVariables.length) {
      showError('Validation', `Enter values for: ${missingVariables.map((variable) => variable.slice(2, -2).replace(/_/g, ' ')).join(', ')}.`);
      return;
    }

    setBusy('send');
    let attachmentPath: string | undefined;
    if (compose.attachment) {
      const formData = new FormData();
      formData.append('attachment', compose.attachment);
      const uploaded = await api<{ data?: { path?: string } }>('POST', '/notifications/attachments', formData);
      attachmentPath = uploaded?.data?.path;
      if (!attachmentPath) { setBusy(null); return; }
    }

    const result = await api<{ message?: string }>('POST', '/notifications/send', {
      title: compose.title.trim(),
      message: compose.message.trim(),
      channel: compose.channel,
      priority: compose.priority,
      subject: compose.subject || undefined,
      recipients: payloadRecipients,
      schedule_at: compose.schedule_at || undefined,
      template_id: compose.template_id || undefined,
      variables: compose.variables,
      attachment: attachmentPath,
    });
    setBusy(null);
    if (result !== null) {
      const message = result.message ?? 'Notification accepted.';
      const lower = message.toLowerCase();
      showSuccess(lower.includes('scheduled') ? 'Scheduled' : lower.includes('queued') ? 'Queued' : 'Sent', message);
      /* Reset the form but keep the recipient type for convenience. */
      setCompose({ title: '', message: '', channel: compose.channel, priority: 'normal', subject: '', schedule_at: '', template_id: '', variables: {}, attachment: null });
      setSelectedRecipients([]);
      await loadCore();
    }
  };

  const saveTemplate = async () => {
    if (!editing) return;
    const t = editing.value as Template;
    if (!t.name.trim() || !t.body.trim()) { showError('Validation', 'Name and body are required.'); return; }
    setBusy('edit');
    const isNew = !t.id;
    const ok = await api(isNew ? 'POST' : 'PUT', isNew ? '/notifications/templates' : `/notifications/templates/${t.id}`, t);
    setBusy(null);
    if (ok !== null) { setEditing(null); await loadEnterprise(); showSuccess('Saved', ''); }
  };
  const saveRule = async () => {
    if (!editing) return;
    const r = editing.value as Rule;
    setBusy('edit');
    const isNew = !r.id;
    const ok = await api(isNew ? 'POST' : 'PUT', isNew ? '/notifications/automation' : `/notifications/automation/${r.id}`, r);
    setBusy(null);
    if (ok !== null) { setEditing(null); await loadEnterprise(); showSuccess('Saved', ''); }
  };
  const saveSchedule = async () => {
    if (!editing) return;
    const s = editing.value as Schedule;
    if (!s.title.trim()) { showError('Validation', 'Title is required.'); return; }
    setBusy('edit');
    const isNew = !s.id;
    const ok = await api(isNew ? 'POST' : 'PUT', isNew ? '/notifications/scheduled' : `/notifications/scheduled/${s.id}`, s);
    setBusy(null);
    if (ok !== null) { setEditing(null); await loadEnterprise(); showSuccess('Saved', ''); }
  };
  const deleteEntry = async (kind: 'template' | 'rule' | 'schedule', id: number | string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    const base = kind === 'template' ? 'templates' : kind === 'rule' ? 'automation' : 'scheduled';
    const ok = await api('DELETE', `/notifications/${base}/${id}`);
    if (ok !== null) { await loadEnterprise(); showSuccess('Deleted', ''); }
  };
  const toggleEnabled = async (kind: 'template' | 'rule' | 'schedule', id: number | string, enabled: boolean) => {
    const base = kind === 'template' ? 'templates' : kind === 'rule' ? 'automation' : 'scheduled';
    const ok = await api('PUT', `/notifications/${base}/${id}`, { enabled: !enabled });
    if (ok !== null) await loadEnterprise();
  };

  const queueAction = async (id: number, action: 'retry' | 'cancel') => {
    if (action === 'cancel' && !window.confirm('Cancel this job?')) return;
    const ok = await api('POST', `/notifications/queue/${id}/${action}`);
    if (ok !== null) await refreshAll();
  };

  const pushToggle = async () => {
    setPushBusy(true);
    try {
      if (pushHere) {
        const r = await navigator.serviceWorker.getRegistration('/');
        const s = await r?.pushManager.getSubscription();
        if (s) {
          await apiClient.request('DELETE', '/notifications/push-subscriptions', { endpoint: s.endpoint });
          await s.unsubscribe();
        }
        setPushHere(false);
        showSuccess('Push disabled', '');
      } else {
        const p = providers.push;
        if (!p?.configured || !p.public_key) throw new Error(p?.detail ?? 'Web Push not configured.');
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push not supported.');
        if ((await Notification.requestPermission()) !== 'granted') throw new Error('Allow notifications to continue.');
        const reg = await navigator.serviceWorker.register('/notification-sw.js');
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapid(p.public_key) });
        await apiClient.request('POST', '/notifications/push-subscriptions', sub.toJSON());
        setPushHere(true);
        showSuccess('Push enabled', '');
      }
      await loadCore();
    } catch (e) {
      const err = e as { message?: string };
      showError('Push failed', err?.message ?? 'Unable to update push.');
    } finally { setPushBusy(false); }
  };

  const saveDaily = async () => {
    if (!canConfig) { showError('Permission denied', ''); return; }
    const ok = await api('PUT', '/daily-summary/settings', settings);
    if (ok !== null) { setConfigMode(false); showSuccess('Saved', ''); }
  };
  const savePrefs = async () => {
    const ok = await api('PUT', '/notifications/preferences', prefs);
    if (ok !== null) showSuccess('Preferences saved', '');
  };
  const saveFallback = async () => {
    const ok = await api('PUT', '/notifications/fallback', fallback);
    if (ok !== null) showSuccess('Fallback saved', '');
  };

  const exportInbox = () => download(
    [['ID','Title','Message','Priority','Channel','Category','Read','Created'],
     ...filtered.map((n) => [String(n.id), n.title, n.message, normPriority(n.priority), n.channel ?? 'in_app', n.category ?? '', n.read ? 'yes' : 'no', n.created_at ?? ''])],
    `notifications-${new Date().toISOString().slice(0, 10)}.csv`,
  );
  const exportLogs = () => download(
    [['ID','Channel','Recipient','Event','Status','Attempts','Error','Sent At'],
     ...logs.map((l) => [String(l.id), l.channel, l.recipient ?? '', l.event ?? '', l.status, String(l.attempt_count), l.error_message ?? '', l.sent_at ?? l.created_at])],
    `delivery-${new Date().toISOString().slice(0, 10)}.csv`,
  );

  /* -------- AI -------- */
  const aiContext = (extra: string) => [
    `Notifications: ${items.length} (${unread} unread, ${critical} critical).`,
    `Sample: ${JSON.stringify(items.slice(0, 30).map((n) => ({ t: n.title, p: normPriority(n.priority), r: n.read, c: n.channel })))}`,
    `Delivery: total ${dStats.total}, sent ${dStats.sent}, failed ${dStats.failed}.`,
    `Queue: ${queue.length}, schedules: ${schedules.length}, rules: ${rules.length}.`,
    '', extra,
  ].join('\n');

  const askAi = async (prompt: string) => {
    setAiBusy(true);
    setAiLog((p) => [...p, { id: randomId(), role: 'user', text: prompt }]);
    try {
      const res = await apiClient.geminiChat(prompt, [
        { role: 'user', text: 'Reply in clean markdown. Bold key numbers. Bullet with "- ". Never invent facts. End with up to 3 lines starting "FOLLOW_UP: ".' },
        { role: 'assistant', text: 'Understood.' },
      ]);
      const raw = (res as { response?: unknown; data?: { response?: unknown } }).response
              ?? (res as { data?: { response?: unknown } }).data?.response;
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!text) throw new Error('Empty AI response.');
      const suggestions = text.split('\n').map((l) => l.match(/^\s*FOLLOW_UP:\s*(.+)$/i)?.[1]?.trim())
        .filter((x): x is string => Boolean(x)).slice(0, 3);
      const body = text.replace(/^\s*FOLLOW_UP:\s*.+$/gim, '').trim();
      setAiLog((p) => [...p, { id: randomId(), role: 'ai', text: body, suggestions: suggestions.length ? suggestions : undefined }]);
    } catch (e) {
      const err = e as { message?: string };
      setAiLog((p) => [...p, { id: randomId(), role: 'ai', text: `⚠ ${err?.message ?? 'AI unavailable.'}` }]);
    } finally { setAiBusy(false); }
  };

  /* -------- Guards -------- */
  if (loadingUser && !hasUser) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-2xl bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">Loading…</div>
    </div>;
  }
  if (!canView) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600"><ShieldAlert size={22} /></div>
        <h2 className="mt-4 text-lg font-bold">Access denied</h2>
        <p className="mt-1.5 text-sm text-slate-500">You don't have permission to view notifications.</p>
      </div>
    </div>;
  }

  /* ================================================================ */
  /* Render                                                           */
  /* ================================================================ */

  const TABS: { key: Tab; label: string; icon: typeof Bell; badge?: number }[] = [
    { key: 'overview',    label: 'Overview',      icon: BarChart3 },
    { key: 'inbox',       label: 'Inbox',         icon: Inbox,       badge: unread },
    { key: 'send',        label: 'Compose',       icon: Send },
    { key: 'templates',   label: 'Templates',     icon: FileText,    badge: templates.length },
    { key: 'automation',  label: 'Automation',    icon: Zap },
    { key: 'schedule',    label: 'Scheduled',     icon: Calendar,    badge: schedules.length },
    { key: 'daily',       label: 'Daily Summary', icon: Activity },
    { key: 'queue',       label: 'Queue',         icon: Layers,      badge: queue.length },
    { key: 'delivery',    label: 'Delivery',      icon: Send,        badge: dStats.failed || undefined },
    { key: 'channels',    label: 'Channels',      icon: Radio },
    { key: 'preferences', label: 'Preferences',   icon: Settings2 },
  ];

  const recipientEntities: EntityRecord[] =
    recipientType === 'customers' ? customers :
    recipientType === 'suppliers' ? suppliers :
    recipientType === 'employees' ? employees : [];

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">

        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-lg sm:px-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
                <BellRing size={11} /> {unread} unread · {critical} critical
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
                <CircleDot size={11} /> {dStats.rate}% delivery
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
                <Layers size={11} /> {queue.length} in queue
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Btn variant="ghost" icon={Brain} onClick={() => setAiOpen((v) => !v)}
                className={cx('rounded-xl px-4 py-2 text-sm font-semibold',
                  aiOpen ? 'bg-gradient-to-r from-violet-400 to-indigo-400 text-slate-950' : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20')}>
                AI Insights
              </Btn>
              <Btn variant="ghost" icon={Download} onClick={exportInbox} disabled={!canDelivery || !filtered.length}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-50">
                Export
              </Btn>
              <Btn variant="ghost" icon={RefreshCw} onClick={() => void refreshAll()}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/20">
                Refresh
              </Btn>
            </div>
          </div>
        </section>

        {Object.keys(loadFailures).length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            <p className="font-semibold">Some notification data could not be loaded.</p>
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(loadFailures).map(([resource, message]) => (
                <li key={resource}><span className="font-medium">{resource}:</span> {message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ============ KPI ============ */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi icon={Inbox} label="Total" value={String(notificationStats?.notifications.total ?? pagination.total)} tone="indigo" />
          <Kpi icon={BellRing} label="Unread" value={String(unread)} tone="amber" />
          <Kpi icon={AlertTriangle} label="Critical" value={String(critical)} tone="rose" />
          <Kpi icon={CheckCheck} label="Delivery" value={`${dStats.rate}%`} hint={`${dStats.sent}/${dStats.total}`} tone="emerald" />
          <Kpi icon={Layers} label="Queue" value={String(queue.length)} tone="violet" />
          <Kpi icon={Calendar} label="Scheduled" value={String(schedules.length)} tone="teal" />
        </section>

        {/* ============ TABS ============ */}
        <section className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => {
            const I = t.icon; const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cx('inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
                  active ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                <I size={14} /> {t.label}
                {t.badge != null && t.badge > 0 && (
                  <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    active ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700')}>{t.badge}</span>
                )}
              </button>
            );
          })}
        </section>

        {/* ============ MAIN GRID ============ */}
        <section className={cx('grid gap-5', aiOpen ? 'xl:grid-cols-[minmax(0,1fr)_380px]' : 'grid-cols-1')}>
          <div className="space-y-5">

            {/* ---------- OVERVIEW ---------- */}
            {tab === 'overview' && (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-5 py-4">
                      <h3 className="flex items-center gap-2 text-sm font-semibold"><BarChart3 size={15} className="text-emerald-600" /> Channel statistics</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {CHANNELS.map((c) => {
                        const channelStats = notificationStats?.deliveries.by_channel[c.value];
                        const stat = logs.filter((l) => l.channel === c.value);
                        const statTotal = channelStats ? Object.values(channelStats).reduce((sum, value) => sum + value, 0) : stat.length;
                        const sent = channelStats ? (channelStats.sent ?? 0) + (channelStats.delivered ?? 0) : stat.filter((l) => ['sent', 'delivered'].includes(String(l.status).toLowerCase())).length;
                        const rate = pctOf(sent, statTotal);
                        const Icon = c.icon;
                        return (
                          <div key={c.value} className="flex items-center gap-3 p-4">
                            <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon size={15} /></div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold">{c.label}</p>
                              <p className="mt-0.5 text-[11px] text-slate-500">{statTotal} total · {sent} sent</p>
                            </div>
                            <span className={cx('text-sm font-bold', rate >= 90 ? 'text-emerald-600' : rate >= 70 ? 'text-amber-600' : 'text-rose-600')}>{rate}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 to-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-600"><Activity size={15} /></div>
                      <h3 className="text-sm font-bold">Business snapshot</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['Gross profit', money(summary?.profit?.gross_profit ?? 0)],
                        ['Net profit', money(summary?.profit?.net_profit ?? 0)],
                        ['Sales', money(summary?.sales ?? 0)],
                        ['Receivables', money(summary?.receivables ?? 0)],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-xl border border-emerald-100 bg-white/70 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">{k}</p>
                          <p className="mt-1 text-base font-bold text-slate-900">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Quick ranges</p>
                  <div className="flex flex-wrap gap-2">
                    {DATE_PRESETS.map((p) => (
                      <button key={p.value} onClick={() => { setDateF(p.value); setTab('inbox'); }}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700">
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ---------- INBOX ---------- */}
            {tab === 'inbox' && (
              <>
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <button onClick={() => setFiltersOpen((v) => !v)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/60 sm:px-5">
                    <div className="flex items-center gap-3">
                      <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow">
                        <Filter size={15} />
                        {chips.length > 0 && (
                          <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">{chips.length}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Advanced filters</p>
                        <p className="text-[11px] text-slate-500">{chips.length ? `${chips.length} active` : 'Channel · Priority · Status · Event · Date'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {chips.length > 0 && (
                        <span onClick={(e) => { e.stopPropagation(); setChannelF('all'); setPriorityF('all'); setReadF('all'); setEventF('all'); setDateF('all'); setSearchInput(''); setQuery(''); }}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600">
                          <XCircle size={12} /> Reset
                        </span>
                      )}
                      <ChevronDown size={14} className={cx('text-slate-400 transition', filtersOpen && 'rotate-180')} />
                    </div>
                  </button>

                  {filtersOpen && (
                    <div className="space-y-3 border-t border-slate-100 p-4 sm:p-5">
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-12">
                        <div className="relative lg:col-span-4">
                          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search title, message, category…" className="pl-9" />
                        </div>
                        <Select value={channelF} onChange={(e) => setChannelF(e.target.value as any)} className="lg:col-span-2">
                          <option value="all">All channels</option>
                          {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </Select>
                        <Select value={priorityF} onChange={(e) => setPriorityF(e.target.value as any)} className="lg:col-span-2">
                          <option value="all">All priorities</option>
                          <option value="critical">Critical</option><option value="high">High</option>
                          <option value="normal">Normal</option><option value="low">Low</option>
                        </Select>
                        <Select value={eventF} onChange={(e) => setEventF(e.target.value)} className="lg:col-span-2">
                          <option value="all">All events</option>
                          {EVENTS.map((ev) => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
                        </Select>
                        <Select value={readF} onChange={(e) => setReadF(e.target.value as any)} className="lg:col-span-2">
                          <option value="all">All statuses</option>
                          <option value="unread">Unread</option><option value="read">Read</option>
                        </Select>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {DATE_PRESETS.map((p) => (
                          <button key={p.value} onClick={() => setDateF(p.value)}
                            className={cx('rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                              dateF === p.value ? 'bg-indigo-600 text-white shadow' : 'border border-slate-200 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-700')}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selected.length > 0 && (
                  <div className="sticky top-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur">
                    <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{selected.length} selected</span>
                    <Btn icon={CheckCheck} onClick={bulkMarkRead}>Mark read</Btn>
                    <Btn icon={Archive} onClick={bulkArchive}>Archive</Btn>
                    <Btn variant="ghost" onClick={() => setSelected([])} className="ml-auto">Clear</Btn>
                  </div>
                )}

                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Inbox size={15} /></div>
                      <div>
                        <p className="text-sm font-semibold">Inbox</p>
                        <p className="text-[11px] text-slate-500">{loading ? 'Loading…' : `${items.length} loaded · ${pagination.total} total`}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={String(perPage)} onChange={(e) => setPerPage(Number(e.target.value))} className="h-8 w-20 text-xs">
                        {PER_PAGE.map((v) => <option key={v} value={v}>{v}/page</option>)}
                      </Select>
                      {paged.length > 0 && (
                        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          <input type="checkbox" checked={pageSel}
                            onChange={() => {
                              const ids = paged.map((r) => r.id);
                              setSelected((cur) => pageSel ? cur.filter((id) => !ids.includes(id)) : Array.from(new Set([...cur, ...ids])));
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600" />
                          Page
                        </label>
                      )}
                      <Btn icon={CheckCheck} onClick={markAllRead} disabled={!unread}>Mark all read</Btn>
                    </div>
                  </div>

                  {loading ? (
                    <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
                  ) : paged.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Inbox size={24} /></div>
                      <p className="mt-4 text-base font-semibold">No notifications</p>
                      <p className="mt-1 text-sm text-slate-500">{chips.length ? 'Try clearing filters.' : 'You are all caught up.'}</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {paged.map((n) => {
                        const p = normPriority(n.priority);
                        const Icon = PRIORITY[p].icon;
                        const checked = selected.includes(n.id);
                        return (
                          <li key={n.id} onClick={() => setViewing(n)}
                            className={cx('group flex cursor-pointer items-start gap-3 p-4 transition',
                              n.read ? 'hover:bg-slate-50/80' : 'bg-emerald-50/30 hover:bg-emerald-50/60')}>
                            <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                              <input type="checkbox" checked={checked}
                                onChange={() => setSelected((cur) => cur.includes(n.id) ? cur.filter((id) => id !== n.id) : [...cur, n.id])}
                                className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
                            </div>
                            <div className={cx('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl', PRIORITY[p].cls)}><Icon size={16} /></div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
                                    <p className={cx('truncate text-sm', n.read ? 'font-medium text-slate-800' : 'font-bold text-slate-900')}>{n.title}</p>
                                  </div>
                                  <p className="mt-0.5 line-clamp-2 text-[13px] text-slate-600">{n.message}</p>
                                </div>
                                <PriorityPill p={p} />
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                                <ChannelPill c={n.channel ?? 'in_app'} /><span>·</span>
                                <span>{fmtRel(n.created_at)}</span>
                                {n.category && <><span>·</span><span className="text-slate-500">{n.category}</span></>}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {!n.read && (
                                <button onClick={(e) => { e.stopPropagation(); void markRead(n.id); }} title="Mark read"
                                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600">
                                  <Check size={15} />
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); void archive(n.id); }} title="Archive"
                                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100">
                                <Archive size={15} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); void remove(n.id); }} title="Delete"
                                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {!loading && paged.length > 0 && (
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                      <p className="text-xs text-slate-500">
                        Showing {pagination.total === 0 ? 0 : (curPage - 1) * perPage + 1}–{Math.min(curPage * perPage, pagination.total)} of {pagination.total}
                      </p>
                      <div className="flex items-center gap-1">
                        <Btn icon={ChevronLeft} variant="outline" disabled={curPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="!px-2" />
                        <span className="mx-1 text-xs font-semibold">{curPage} / {pages}</span>
                        <Btn icon={ChevronRight} variant="outline" disabled={curPage === pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="!px-2" />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ---------- COMPOSE (redesigned) ---------- */}
            {tab === 'send' && (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
                {/* Left: form */}
                <div className="space-y-4">
                  {/* Recipients */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-5 py-4">
                      <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <Users size={15} className="text-emerald-600" /> Recipients
                      </h2>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Pick customers, dealers, employees or groups — the recipient list stays synchronized with your real ERP data.
                      </p>
                    </div>
                    <div className="p-5">
                      <RecipientPicker
                        type={recipientType}
                        onTypeChange={setRecipientType}
                        groups={recipientGroups}
                        entities={recipientEntities}
                        entityLoading={entityLoading}
                        selected={selectedRecipients}
                        onSelect={(r) => { setSelectedRecipients((cur) => cur.some((x) => x.id === r.id) ? cur : [...cur, r]); fillVariablesFromRecipient(r); }}
                        onRemove={(id) => setSelectedRecipients((cur) => cur.filter((x) => x.id !== id))}
                        channel={compose.channel}
                        canUseWhatsApp={canSendWhatsApp}
                      />

                      {/* Manual entry */}
                      {recipientType === 'manual' && (
                        <div className="mt-3 flex gap-2">
                          <Input
                            value={manualEntry}
                            onChange={(e) => setManualEntry(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualRecipients(); } }}
                            placeholder="+91 98765 43210 or name@example.com"
                          />
                          <Btn icon={Plus} onClick={addManualRecipients}>Add</Btn>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-5 py-4">
                      <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <FileText size={15} className="text-emerald-600" /> Message
                      </h2>
                    </div>
                    <div className="space-y-4 p-5">
                      <div className="grid gap-3 md:grid-cols-3">
                        <Field label="Channel">
                          <Select value={compose.channel} onChange={(event) => {
                            const channel = event.target.value as Channel;
                            setCompose((previous) => ({ ...previous, channel, attachment: channel === 'whatsapp' ? null : previous.attachment }));
                          }}>
                            {CHANNELS.map((c) => <option key={c.value} value={c.value} disabled={c.value === 'whatsapp' && !canSendWhatsApp}>{c.label}</option>)}
                          </Select>
                        </Field>
                        <Field label="Priority">
                          <Select value={compose.priority} onChange={(e) => setCompose({ ...compose, priority: e.target.value as Priority })}>
                            <option value="low">Low</option><option value="normal">Normal</option>
                            <option value="high">High</option><option value="critical">Critical</option>
                          </Select>
                        </Field>
                        <Field label="Schedule for (optional)">
                          <Input type="datetime-local" value={compose.schedule_at} onChange={(e) => setCompose({ ...compose, schedule_at: e.target.value })} />
                        </Field>
                      </div>

                      <Field label="Use template (optional)">
                        <Select value={compose.template_id} onChange={(e) => {
                          const t = templates.find((x) => String(x.id) === e.target.value);
                          setCompose((p) => ({ ...p, template_id: e.target.value, title: t?.name ?? p.title, message: t?.body ?? p.message, subject: t?.subject ?? p.subject, channel: t?.channel ?? p.channel, variables: {} }));
                        }}>
                          <option value="">No template</option>
                          {templates.filter((t) => t.enabled).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </Select>
                      </Field>

                      {compose.channel === 'email' && (
                        <Field label="Subject"><Input value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} /></Field>
                      )}

                      <Field label="Title"><Input value={compose.title} onChange={(e) => setCompose({ ...compose, title: e.target.value })} placeholder="Notification title" /></Field>

                      <Field label="Message">
                        <textarea value={compose.message} onChange={(e) => setCompose({ ...compose, message: e.target.value })}
                          rows={5} placeholder="Message body"
                          className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10" />
                        <div className="mt-2 flex flex-wrap gap-1">
                          {VARS.map((v) => (
                            <button key={v} type="button" onClick={() => setCompose((p) => ({ ...p, message: `${p.message}${p.message ? ' ' : ''}${v}` }))}
                              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-mono text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700">
                              {v}
                            </button>
                          ))}
                        </div>
                      </Field>

                      {composeVariables.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-slate-700">Variable values</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {composeVariables.map((variable) => {
                              const name = variable.slice(2, -2);
                              const label = name.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
                              return (
                                <Field key={variable} label={label}>
                                  <Input required value={compose.variables[name] ?? ''} onChange={(e) => setCompose((previous) => ({ ...previous, variables: { ...previous.variables, [name]: e.target.value } }))} />
                                </Field>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {compose.channel !== 'whatsapp' && (
                        <Field label="Attachment (optional)">
                          <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" onChange={(e) => setCompose({ ...compose, attachment: e.target.files?.[0] ?? null })} />
                        </Field>
                      )}

                      {providers[compose.channel] && !providers[compose.channel].ready && (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          <AlertCircle size={12} className="mt-0.5 shrink-0" />{providers[compose.channel].detail}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <p className="text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{selectedRecipients.length}</span> recipient{selectedRecipients.length === 1 ? '' : 's'} · <span className="font-semibold text-slate-700">{compose.channel}</span> channel
                    </p>
                    <div className="flex gap-2">
                      <Btn variant="ghost" onClick={() => { setSelectedRecipients([]); setCompose({ ...compose, title: '', message: '', subject: '', variables: {}, attachment: null }); }}>Reset</Btn>
                      <Btn
                        variant={compose.channel === 'whatsapp' ? 'whatsapp' : 'primary'}
                        icon={busy === 'send' ? Loader2 : compose.channel === 'whatsapp' ? MessageSquare : Send}
                        onClick={() => void send()}
                        disabled={
                          !canSend || busy === 'send' || !selectedRecipients.length ||
                          (compose.channel === 'whatsapp' ? !canSendWhatsApp : !providers[compose.channel]?.ready)
                        }
                        className="!px-5"
                      >
                        {busy === 'send'
                          ? 'Sending…'
                          : compose.schedule_at
                          ? 'Schedule notification'
                          : compose.channel === 'whatsapp'
                          ? 'Send via WhatsApp'
                          : 'Send notification'}
                      </Btn>
                    </div>
                  </div>
                </div>

                {/* Right: live preview */}
                <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
                  <LivePreview
                    channel={compose.channel}
                    title={resolvedTitle}
                    body={resolvedMessage}
                    subject={compose.subject}
                    recipients={selectedRecipients}
                    provider={providers[compose.channel]}
                    priority={compose.priority}
                  />

                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Send summary</p>
                    <ul className="space-y-1.5 text-[11px]">
                      <li className="flex items-center justify-between"><span className="text-slate-500">Channel</span><ChannelPill c={compose.channel} /></li>
                      <li className="flex items-center justify-between"><span className="text-slate-500">Priority</span><PriorityPill p={compose.priority} /></li>
                      <li className="flex items-center justify-between"><span className="text-slate-500">Recipients</span><span className="font-semibold text-slate-800">{selectedRecipients.length}</span></li>
                      <li className="flex items-center justify-between"><span className="text-slate-500">Delivery</span><span className="font-semibold text-slate-800">{compose.schedule_at ? 'Scheduled' : 'Immediate'}</span></li>
                      <li className="flex items-center justify-between"><span className="text-slate-500">Provider</span><span className={cx('font-semibold', providers[compose.channel]?.ready ? 'text-emerald-600' : 'text-amber-600')}>{providers[compose.channel]?.ready ? 'Ready' : 'Not ready'}</span></li>
                    </ul>
                  </div>
                </aside>
              </div>
            )}

            {/* ---------- TEMPLATES ---------- */}
            {tab === 'templates' && (
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><FileText size={15} className="text-emerald-600" /> Templates</h2>
                    <p className="mt-1 text-[11px] text-slate-500">{templates.length} total · {templates.filter((t) => t.enabled).length} enabled</p>
                  </div>
                  {canTemplates && <Btn variant="primary" icon={Plus} onClick={() => setEditing({ kind: 'template', value: { id: '', name: '', channel: 'email', subject: '', body: '', enabled: true } })}>New</Btn>}
                </div>
                {templates.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><FileText size={24} /></div>
                    <p className="mt-4 font-semibold">No templates yet</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {templates.map((t) => (
                      <li key={t.id} className="flex items-center gap-4 p-4">
                        <div className={cx('grid h-10 w-10 place-items-center rounded-xl', t.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
                          {(() => { const I = CHANNELS.find((c) => c.value === t.channel)?.icon ?? FileText; return <I size={16} />; })()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold">{t.name}</p>
                            <ChannelPill c={t.channel} />
                            {!t.enabled && <Pill>Disabled</Pill>}
                          </div>
                          {t.subject && <p className="mt-0.5 truncate text-xs text-slate-500">{t.subject}</p>}
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{t.body}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {canTemplates && canSend && (t.channel !== 'whatsapp' || canSendWhatsApp) && <Btn variant="ghost" icon={TestTube} title="Test" onClick={async () => { if (await api('POST', `/notifications/templates/${t.id}/test`) !== null) await loadCore(); }} />}
                          {canTemplates && <Btn variant="ghost" icon={t.enabled ? Pause : Play} title="Toggle" onClick={() => void toggleEnabled('template', t.id, t.enabled)} />}
                          {canTemplates && <Btn variant="ghost" icon={Pencil} title="Edit" onClick={() => setEditing({ kind: 'template', value: { ...t } })} />}
                          {canTemplates && <Btn variant="ghost" icon={Trash2} title="Delete" onClick={() => void deleteEntry('template', t.id, t.name)} />}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ---------- AUTOMATION ---------- */}
            {tab === 'automation' && (
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><Zap size={15} className="text-emerald-600" /> Automation rules</h2>
                    <p className="mt-1 text-[11px] text-slate-500">{rules.filter((r) => r.enabled).length} active of {rules.length}</p>
                  </div>
                  {canAutomation && <Btn variant="primary" icon={Plus} onClick={() => setEditing({ kind: 'rule', value: { id: '', event: EVENTS[0].value, label: '', channels: ['in_app'], priority: 'normal', enabled: true } })}>New</Btn>}
                </div>
                {rules.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Zap size={24} /></div>
                    <p className="mt-4 font-semibold">No automation rules</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {rules.map((r) => {
                      const ev = EVENTS.find((e) => e.value === r.event);
                      return (
                        <li key={r.id} className="flex items-center gap-4 p-4">
                          <div className={cx('grid h-10 w-10 place-items-center rounded-xl', r.enabled ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow' : 'bg-slate-100 text-slate-500')}>
                            <Zap size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold">{r.label || ev?.label || r.event}</p>
                              <PriorityPill p={r.priority} />
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              <code className="rounded bg-slate-100 px-1 font-mono text-[10px]">{r.event}</code>
                              {ev?.cat && <> · {ev.cat}</>}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">{r.channels.map((c) => <ChannelPill key={c} c={c} />)}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {canAutomation && <Btn variant="ghost" icon={r.enabled ? Pause : Play} onClick={() => void toggleEnabled('rule', r.id, r.enabled)} />}
                            {canAutomation && <Btn variant="ghost" icon={Pencil} onClick={() => setEditing({ kind: 'rule', value: { ...r } })} />}
                            {canAutomation && <Btn variant="ghost" icon={Trash2} onClick={() => void deleteEntry('rule', r.id, r.label ?? r.event)} />}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* ---------- SCHEDULE ---------- */}
            {tab === 'schedule' && (
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><Calendar size={15} className="text-emerald-600" /> Scheduled notifications</h2>
                    <p className="mt-1 text-[11px] text-slate-500">{schedules.filter((s) => s.enabled).length} active of {schedules.length}</p>
                  </div>
                  {canSchedule && <Btn variant="primary" icon={Plus} onClick={() => setEditing({ kind: 'schedule', value: { id: '', title: '', message: '', recipients: [], channel: 'email', schedule_type: 'daily', run_at: localDateTimeInput(new Date()), timezone: 'Asia/Kolkata', enabled: true } })}>New</Btn>}
                </div>
                {schedules.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Calendar size={24} /></div>
                    <p className="mt-4 font-semibold">No scheduled notifications</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {schedules.map((s) => (
                      <li key={s.id} className="flex items-center gap-4 p-4">
                        <div className={cx('grid h-10 w-10 place-items-center rounded-xl', s.enabled ? 'bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow' : 'bg-slate-100 text-slate-500')}>
                          {s.schedule_type === 'once' ? <Timer size={16} /> : <Repeat size={16} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{s.title}</p><ChannelPill c={s.channel} /></div>
                          <p className="mt-0.5 text-xs text-slate-500">{s.schedule_type} · Next: {fmtDate(s.next_run_at)}</p>
                          {s.last_run_at && <p className="mt-0.5 text-[11px] text-slate-400">Last run: {fmtRel(s.last_run_at)}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {canSchedule && <Btn variant="ghost" icon={Pencil} onClick={() => setEditing({ kind: 'schedule', value: { ...s } })} />}
                          {canSchedule && <Btn variant="ghost" icon={Trash2} onClick={() => void deleteEntry('schedule', s.id, s.title)} />}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ---------- DAILY ---------- */}
            {tab === 'daily' && (
              <>
                {summary && (
                  <div className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 to-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-600"><BarChart3 size={15} /></div>
                      <h3 className="text-sm font-bold">Snapshot preview</h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      {[
                        ['Gross', money(summary.profit?.gross_profit ?? 0)],
                        ['Net', money(summary.profit?.net_profit ?? 0)],
                        ['Sales', money(summary.sales ?? 0)],
                        ['Receivables', money(summary.receivables ?? 0)],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-xl border border-emerald-100 bg-white/70 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">{k}</p>
                          <p className="mt-1 text-base font-bold text-slate-900">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><Calendar size={15} className="text-emerald-600" /> Daily summary settings</h2>
                    {canConfig && <Btn onClick={() => setConfigMode((v) => !v)}>{configMode ? 'Cancel' : 'Configure'}</Btn>}
                  </div>
                  {!configMode ? (
                    <div className="grid gap-3 p-5 sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <p className="text-[10px] font-semibold uppercase text-slate-500">Status</p>
                        <p className={cx('mt-1 text-sm font-bold', settings.enabled ? 'text-emerald-600' : 'text-slate-600')}>{settings.enabled ? 'Enabled' : 'Disabled'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <p className="text-[10px] font-semibold uppercase text-slate-500">Send time</p>
                        <p className="mt-1 text-sm font-bold">{settings.send_time}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <p className="text-[10px] font-semibold uppercase text-slate-500">Timezone</p>
                        <p className="mt-1 text-sm font-bold">{settings.timezone}</p>
                      </div>
                      <div className="sm:col-span-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <p className="text-[10px] font-semibold uppercase text-slate-500">Channels</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">{settings.channels.map((c) => <ChannelPill key={c} c={c} />)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 p-5">
                      <label className="flex items-center gap-2.5">
                        <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
                        <span className="text-sm font-medium">Enable daily summary</span>
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Send time (24h)"><Input type="time" value={settings.send_time} onChange={(e) => setSettings({ ...settings, send_time: e.target.value })} /></Field>
                        <Field label="Timezone"><Input value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} /></Field>
                        <Field label="Company ID (optional)"><Input type="number" min="1" value={settings.company_id || ''} onChange={(e) => setSettings({ ...settings, company_id: e.target.value ? Number(e.target.value) : 0 })} /></Field>
                        <Field label="Branch ID (optional)"><Input type="number" min="1" value={settings.branch_id || ''} onChange={(e) => setSettings({ ...settings, branch_id: e.target.value ? Number(e.target.value) : 0 })} /></Field>
                        <div className="sm:col-span-2">
                          <Field label="Authorized recipients (user IDs, emails, or role names)">
                            <textarea value={(settings.recipients ?? []).join(', ')} onChange={(e) => setSettings({ ...settings, recipients: e.target.value.split(/[ ,\n]+/).map((value) => value.trim()).filter(Boolean) })}
                              rows={2} className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
                          </Field>
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold">Delivery channels</p>
                        <div className="flex flex-wrap gap-2">
                          {CHANNELS.map((c) => {
                            const on = settings.channels.includes(c.value);
                            const I = c.icon;
                            return (
                              <button key={c.value} onClick={() => setSettings((p) => ({ ...p, channels: on ? p.channels.filter((v) => v !== c.value) : [...p.channels, c.value] }))}
                                disabled={c.value === 'whatsapp' && !canSendWhatsApp && !on}
                                className={cx('inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
                                  on ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                                <I size={13} /> {c.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <Btn variant="primary" icon={Save} onClick={() => void saveDaily()} className="w-full">Save settings</Btn>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ---------- QUEUE ---------- */}
            {tab === 'queue' && (
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold"><Layers size={15} className="text-emerald-600" /> Queue & retries</h2>
                  {canQueue && <Btn icon={RefreshCw} onClick={() => void loadEnterprise()}>Refresh</Btn>}
                </div>
                {queue.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Layers size={24} /></div>
                    <p className="mt-4 font-semibold">Queue is empty</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {queue.map((j) => (
                      <li key={j.id} className="flex items-center gap-4 p-4">
                        <div className={cx('grid h-10 w-10 place-items-center rounded-xl',
                          String(j.status).toLowerCase() === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600')}>
                          {String(j.status).toLowerCase() === 'failed' ? <AlertCircle size={16} /> : <Loader2 className="animate-spin" size={16} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold">#{j.id} · {j.recipient || 'Internal'}</p>
                            <StatusPill s={j.status} />
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">{j.channel} · Attempt {j.attempt_count} · {fmtRel(j.created_at)}</p>
                          {j.error_message && <p className="mt-1 line-clamp-1 text-[11px] text-rose-600">{j.error_message}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {canQueue && ['failed', 'retrying'].includes(j.status) && <Btn variant="ghost" icon={RotateCw} title="Retry" onClick={() => void queueAction(j.id, 'retry')} />}
                          {canQueue && ['queued', 'retrying'].includes(j.status) && <Btn variant="ghost" icon={X} title="Cancel" onClick={() => void queueAction(j.id, 'cancel')} />}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ---------- DELIVERY ---------- */}
            {tab === 'delivery' && (
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><Activity size={15} className="text-emerald-600" /> Delivery logs</h2>
                    <p className="mt-1 text-[11px] text-slate-500">{logs.length} deliveries · {dStats.rate}% success</p>
                  </div>
                  <div className="flex gap-2">
                    {canDelivery && <Btn icon={Download} onClick={exportLogs} disabled={!logs.length}>Export</Btn>}
                    <Btn icon={RefreshCw} onClick={() => void loadCore()}>Refresh</Btn>
                  </div>
                </div>
                {logs.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Send size={24} /></div>
                    <p className="mt-4 font-semibold">No deliveries yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="border-b border-slate-100 bg-slate-50/60 text-[11px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Channel</th><th className="px-5 py-3">Recipient</th>
                          <th className="px-5 py-3">Event</th><th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Attempts</th><th className="px-5 py-3">Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {logs.slice(0, 50).map((l) => (
                          <tr key={l.id} className="hover:bg-slate-50/60">
                            <td className="px-5 py-3"><ChannelPill c={l.channel} /></td>
                            <td className="px-5 py-3 text-slate-600">{l.recipient || <span className="italic text-slate-400">Internal</span>}</td>
                            <td className="px-5 py-3 font-mono text-xs text-slate-500">{l.event ?? '—'}</td>
                            <td className="px-5 py-3">
                              <StatusPill s={l.status} />
                              {l.error_message && <p className="mt-1 max-w-xs text-[11px] text-rose-700">{l.error_message}</p>}
                            </td>
                            <td className="px-5 py-3 text-slate-700">{l.attempt_count}</td>
                            <td className="px-5 py-3 text-xs text-slate-500">{fmtDate(l.sent_at ?? l.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ---------- CHANNELS ---------- */}
            {tab === 'channels' && (
              <>
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><Radio size={15} className="text-emerald-600" /> Provider management</h2>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {CHANNELS.map((c) => {
                      const p = providers[c.value];
                      const I = c.icon;
                      const health = p?.health ?? (p?.ready ? 'healthy' : 'unknown');
                      return (
                        <div key={c.value} className="flex items-start gap-4 p-4 sm:items-center">
                          <div className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl', p?.ready ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}><I size={18} /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold">{c.label}</p>
                              <Pill cls={
                                health === 'healthy' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                                health === 'degraded' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                                health === 'down' ? 'border-rose-200 bg-rose-50 text-rose-700' :
                                'border-slate-200 bg-slate-50 text-slate-500'
                              }>{health}</Pill>
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500">{p?.detail ?? 'Checking…'}</p>
                            <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-400">
                              {p?.last_success_at && <span className="inline-flex items-center gap-1"><CheckCircle2 size={10} className="text-emerald-500" /> {fmtRel(p.last_success_at)}</span>}
                              {p?.last_error_at && <span className="inline-flex items-center gap-1"><AlertCircle size={10} className="text-rose-500" /> {fmtRel(p.last_error_at)}</span>}
                              {c.value === 'push' && <span>{p?.subscriptions ?? 0} device(s)</span>}
                            </div>
                          </div>
                          <Pill cls={p?.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}>
                            {p?.ready ? 'Ready' : 'Setup needed'}
                          </Pill>
                        </div>
                      );
                    })}
                    {providers.whatsapp && canViewWhatsAppProvider && (
                      <div className="border-t border-slate-100 bg-slate-50/60 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {canConnectWhatsApp && (
                            <button onClick={async () => {
                              try {
                                setBusy('whatsapp-connect');
                                const response = await apiClient.request('POST', '/notifications/providers/whatsapp/connect');
                                const data = asObj<Record<string, unknown>>(response);
                                if (!data) throw new Error('The WhatsApp connect response was empty.');
                                showSuccess('WhatsApp request accepted', 'The ERP worker is connecting to WhatsApp.');
                                await refreshAll();
                              } catch (error) {
                                showError('Unable to connect WhatsApp', describeApiFailure('WhatsApp connect', error));
                              } finally { setBusy(null); }
                            }} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white" disabled={busy === 'whatsapp-connect'}>
                              {busy === 'whatsapp-connect' ? 'Connecting…' : 'Connect WhatsApp'}
                            </button>
                          )}
                          {canConnectWhatsApp && (
                            <button onClick={async () => {
                              try {
                                setBusy('whatsapp-logout');
                                await apiClient.request('POST', '/notifications/providers/whatsapp/logout');
                                showSuccess('WhatsApp disconnected', '');
                                await refreshAll();
                              } catch (error) {
                                showError('Logout failed', describeApiFailure('WhatsApp logout', error));
                              } finally { setBusy(null); }
                            }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700" disabled={busy === 'whatsapp-logout'}>
                              {busy === 'whatsapp-logout' ? 'Logging out…' : 'Logout'}
                            </button>
                          )}
                          {canTestWhatsApp && (
                            <button onClick={async () => {
                              try {
                                const to = whatsappTestNumber || '';
                                if (!to) { showError('Phone required', 'Enter a WhatsApp destination.'); return; }
                                const normalized = normalizePhone(to);
                                if (!isValidPhone(normalized)) { showError('Invalid phone', 'Enter a valid phone number with country code.'); return; }
                                setBusy('whatsapp-test');
                                await apiClient.request('POST', '/notifications/providers/whatsapp/test', { to: normalized, message: 'Nexa ERP WhatsApp test message.' });
                                showSuccess('Test message queued', '');
                                await refreshAll();
                              } catch (error) {
                                showError('Test failed', describeApiFailure('WhatsApp test', error));
                              } finally { setBusy(null); }
                            }} className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700" disabled={busy === 'whatsapp-test'}>
                              {busy === 'whatsapp-test' ? 'Sending…' : 'Test message'}
                            </button>
                          )}
                        </div>
                        {providers.whatsapp?.status === 'qr_required' && whatsappQr && (
                          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Scan QR code with WhatsApp</p>
                            <img src={whatsappQr} alt="WhatsApp QR code" className="mx-auto h-40 w-40 rounded-xl border border-slate-200 bg-white p-2" />
                            <p className="mt-2 text-center text-[11px] text-slate-500">WhatsApp → Linked devices → Link a device → Scan QR code</p>
                          </div>
                        )}
                        {canTestWhatsApp && (
                          <div className="mt-4">
                            <input value={whatsappTestNumber} onChange={(event) => setWhatsappTestNumber(event.target.value)} placeholder="+91XXXXXXXXXX" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/60 to-white shadow-sm">
                  <div className="border-b border-indigo-100 px-5 py-4">
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><Repeat size={15} className="text-indigo-600" /> Smart channel fallback</h2>
                  </div>
                  <div className="p-5">
                    <label className="flex items-center gap-2.5">
                      <input type="checkbox" checked={fallback.enabled} disabled={!canManageSettings} onChange={(e) => setFallback({ ...fallback, enabled: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                      <span className="text-sm font-medium">Enable automatic fallback</span>
                    </label>
                    <div className="mt-4 space-y-2">
                      {fallback.order.map((ch, i) => {
                        const info = CHANNELS.find((c) => c.value === ch);
                        const I = info?.icon ?? Bell;
                        return (
                          <div key={ch} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
                            <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">{i + 1}</span>
                            <I size={14} />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{info?.label ?? ch}</span>
                            <div className="flex gap-1">
                              {canManageSettings && <Btn variant="ghost" icon={ArrowUp} disabled={i === 0} onClick={() => setFallback((p) => { const n = [...p.order]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return { ...p, order: n }; })} />}
                              {canManageSettings && <Btn variant="ghost" icon={ArrowDown} disabled={i === fallback.order.length - 1} onClick={() => setFallback((p) => { const n = [...p.order]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return { ...p, order: n }; })} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {canManageSettings && <Btn variant="primary" icon={Save} onClick={() => void saveFallback()} className="mt-4">Save fallback</Btn>}
                  </div>
                </div>

                {providers.push?.configured && (
                  <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/60 to-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow"><Smartphone size={20} /></div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold">Browser push</h3>
                        <p className="mt-1 text-[12px] text-slate-600">
                          {pushHere ? 'Subscribed on this device.' : 'Enable to receive notifications even when the tab is closed.'}
                        </p>
                      </div>
                      <Btn variant={pushHere ? 'default' : 'primary'} icon={pushBusy ? Loader2 : pushHere ? Ban : Zap} onClick={() => void pushToggle()} disabled={pushBusy}>
                        {pushBusy ? 'Working…' : pushHere ? 'Disable' : 'Enable push'}
                      </Btn>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ---------- PREFERENCES ---------- */}
            {tab === 'preferences' && (
              <>
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><Settings2 size={15} className="text-emerald-600" /> Channel preferences</h2>
                  </div>
                  <div className="grid gap-2 p-5 sm:grid-cols-2">
                    {CHANNELS.map((c) => {
                      const I = c.icon; const on = prefs.channels[c.value] !== false;
                      return (
                        <label key={c.value} className={cx('flex items-center gap-3 rounded-xl border px-3.5 py-3 transition', on ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200')}>
                          <input type="checkbox" checked={on} disabled={!canManagePreferences}
                            onChange={(e) => setPrefs((p) => ({ ...p, channels: { ...p.channels, [c.value]: e.target.checked } }))}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
                          <I size={15} className={on ? 'text-emerald-600' : 'text-slate-400'} />
                          <span className="flex-1 text-sm font-medium">{c.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><Moon size={15} className="text-indigo-600" /> Quiet hours</h2>
                  </div>
                  <div className="space-y-4 p-5">
                    <label className="flex items-center gap-2.5">
                      <input type="checkbox" checked={prefs.quiet_hours} disabled={!canManagePreferences} onChange={(e) => setPrefs({ ...prefs, quiet_hours: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                      <span className="text-sm font-medium">Enable quiet hours</span>
                    </label>
                    {prefs.quiet_hours && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="From"><Input type="time" value={prefs.quiet_from} disabled={!canManagePreferences} onChange={(e) => setPrefs({ ...prefs, quiet_from: e.target.value })} /></Field>
                        <Field label="To"><Input type="time" value={prefs.quiet_to} disabled={!canManagePreferences} onChange={(e) => setPrefs({ ...prefs, quiet_to: e.target.value })} /></Field>
                        <label className="mt-6 flex items-center gap-2 text-sm font-medium">
                          <input type="checkbox" checked={prefs.critical_override} disabled={!canManagePreferences} onChange={(e) => setPrefs({ ...prefs, critical_override: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-rose-600" />
                          Critical override
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><BellRing size={15} className="text-emerald-600" /> Event subscriptions</h2>
                  </div>
                  <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
                    {EVENTS.map((e) => {
                      const on = prefs.events[e.value] !== false;
                      return (
                        <label key={e.value} className={cx('flex items-start gap-3 rounded-xl border px-3.5 py-3 transition', on ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200')}>
                          <input type="checkbox" checked={on} disabled={!canManagePreferences}
                            onChange={(ev) => setPrefs((p) => ({ ...p, events: { ...p.events, [e.value]: ev.target.checked } }))}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600" />
                          <div className="min-w-0"><p className="truncate text-sm font-medium">{e.label}</p><p className="text-[10px] uppercase tracking-wider text-slate-400">{e.cat}</p></div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {canManagePreferences && <Btn variant="primary" icon={Save} onClick={() => void savePrefs()}>Save preferences</Btn>}
              </>
            )}
          </div>

          {/* AI PANEL */}
          {aiOpen && (
            <aside className="sticky top-4 flex h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="relative overflow-hidden bg-gradient-to-br from-[#0f0b2e] via-[#1a1444] to-[#0c0728] px-4 py-3 text-white">
                <div className="relative flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow"><Brain size={16} /></span>
                    <div>
                      <p className="text-sm font-bold">AI Insights</p>
                      <p className="text-[10px] text-violet-200">Powered by your ERP AI</p>
                    </div>
                  </div>
                  <button onClick={() => setAiOpen(false)} className="grid size-7 place-items-center rounded-md text-slate-300 hover:bg-white/10"><X size={14} /></button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50/60 p-3">
                {[
                  ['Digest inbox', 'Give me a concise digest of my notification inbox.'],
                  ['Prioritise', 'Identify the 3–5 most urgent notifications.'],
                  ['Delivery health', 'Summarise delivery performance and flag failure patterns.'],
                  ['Suggest automations', 'Suggest 3 automation rules that would reduce manual work.'],
                ].map(([l, p]) => (
                  <button key={l} disabled={aiBusy} onClick={() => void askAi(aiContext(p))}
                    className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50">
                    <Sparkles size={10} /> {l}
                  </button>
                ))}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-3.5">
                {aiLog.length === 0 && !aiBusy && (
                  <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                    <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50"><Lightbulb className="h-5 w-5 text-violet-500" /></div>
                    <p className="mt-3 text-sm font-semibold">Ask anything</p>
                    <p className="mt-1 text-[11px] text-slate-500">Use a quick action or type below.</p>
                  </div>
                )}
                {aiLog.map((m) => (
                  <div key={m.id}>
                    {m.role === 'user' ? (
                      <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-violet-600 px-3.5 py-2 text-[12px] text-white">{m.text}</div>
                    ) : (
                      <div className="max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-md border border-slate-200 bg-white p-3 text-[13px] text-slate-800 shadow-sm">
                        {m.text}
                        {m.suggestions && m.suggestions.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
                            {m.suggestions.map((s, i) => (
                              <button key={i} onClick={() => { setSearchInput(s); setQuery(s.toLowerCase()); setTab('inbox'); }}
                                className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-100">
                                <CornerUpLeft size={9} /> {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {aiBusy && (
                  <div className="flex gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: '0.15s' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: '0.3s' }} />
                  </div>
                )}
                <div ref={aiEnd} />
              </div>

              <div className="border-t border-slate-100 bg-white p-3">
                <div className="flex items-end gap-2">
                  <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = aiPrompt.trim(); if (!t || aiBusy) return; setAiPrompt(''); void askAi(aiContext(t)); } }}
                    rows={1} maxLength={500} placeholder="Ask about your notifications…"
                    className="min-h-9 max-h-24 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10" />
                  <button disabled={!aiPrompt.trim() || aiBusy}
                    onClick={() => { const t = aiPrompt.trim(); if (!t || aiBusy) return; setAiPrompt(''); void askAi(aiContext(t)); }}
                    className="grid size-9 place-items-center rounded-xl bg-violet-600 text-white shadow-sm hover:bg-violet-700 disabled:opacity-40">
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </aside>
          )}
        </section>
      </div>

      {/* DETAIL DRAWER */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm" onClick={() => setViewing(null)}>
          <div className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-4 text-white">
              <div className="flex items-start gap-3">
                <div className={cx('grid size-10 shrink-0 place-items-center rounded-xl', PRIORITY[normPriority(viewing.priority)].cls)}>
                  {(() => { const I = PRIORITY[normPriority(viewing.priority)].icon; return <I size={18} />; })()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200">Notification</p>
                  <h2 className="mt-0.5 truncate text-base font-bold">{viewing.title}</h2>
                  <p className="mt-0.5 text-[11px] text-slate-300">{fmtDate(viewing.created_at)} · {fmtRel(viewing.created_at)}</p>
                </div>
                <button onClick={() => setViewing(null)} className="grid size-8 place-items-center rounded-md text-slate-300 hover:bg-white/10"><X size={16} /></button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <PriorityPill p={normPriority(viewing.priority)} />
                <ChannelPill c={viewing.channel ?? 'in_app'} />
                {viewing.read && <Pill cls="border-emerald-200 bg-emerald-50 text-emerald-700"><Check size={10} /> Read</Pill>}
              </div>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Message</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{viewing.message}</p>
              </div>
              {viewing.data && Object.keys(viewing.data).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Metadata</p>
                  <div className="mt-2 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    {Object.entries(viewing.data).map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between gap-3 text-xs">
                        <span className="font-medium text-slate-500">{k}</span>
                        <span className="text-right text-slate-800">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Btn icon={Copy} onClick={async () => { try { await navigator.clipboard.writeText(viewing.title + '\n\n' + viewing.message); showSuccess('Copied', ''); } catch { /* ignore */ } }}>Copy</Btn>
                {!viewing.read
                  ? <Btn variant="primary" icon={Check} onClick={() => { void markRead(viewing.id); setViewing({ ...viewing, read: true }); }}>Mark read</Btn>
                  : <Btn icon={Bell} onClick={() => void markUnread(viewing.id)}>Mark unread</Btn>}
                <Btn icon={Archive} onClick={() => void archive(viewing.id)}>Archive</Btn>
                <Btn variant="danger" icon={Trash2} onClick={() => void remove(viewing.id)}>Delete</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE EDITOR */}
      <Modal open={editing?.kind === 'template'} onClose={() => setEditing(null)} title={editing?.value?.id ? 'Edit template' : 'New template'} icon={FileText}>
        {editing?.kind === 'template' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={editing.value.name} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, name: e.target.value } })} /></Field>
            <Field label="Channel">
              <Select value={editing.value.channel} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, channel: e.target.value } })}>
                {CHANNELS.map((c) => <option key={c.value} value={c.value} disabled={c.value === 'whatsapp' && !canSendWhatsApp}>{c.label}</option>)}
              </Select>
            </Field>
            {editing.value.channel === 'email' && (
              <div className="sm:col-span-2"><Field label="Subject"><Input value={editing.value.subject ?? ''} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, subject: e.target.value } })} /></Field></div>
            )}
            <div className="sm:col-span-2">
              <Field label="Body">
                <textarea value={editing.value.body} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, body: e.target.value } })} rows={6}
                  className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
              </Field>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {VARS.map((v) => (
                  <button key={v} onClick={() => setEditing({ ...editing, value: { ...editing.value, body: `${editing.value.body}${editing.value.body ? ' ' : ''}${v}` } })}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-mono text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700">
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2.5 sm:col-span-2">
              <input type="checkbox" checked={editing.value.enabled} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, enabled: e.target.checked } })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              <span className="text-sm font-medium">Enabled</span>
            </label>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Btn onClick={() => setEditing(null)}>Cancel</Btn>
          <Btn variant="primary" icon={busy === 'edit' ? Loader2 : Save} onClick={() => void saveTemplate()} disabled={busy === 'edit'}>Save</Btn>
        </div>
      </Modal>

      {/* RULE EDITOR */}
      <Modal open={editing?.kind === 'rule'} onClose={() => setEditing(null)} title={editing?.value?.id ? 'Edit rule' : 'New automation rule'} icon={Zap}>
        {editing?.kind === 'rule' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Trigger event">
                <Select value={editing.value.event} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, event: e.target.value } })}>
                  {EVENTS.map((e) => <option key={e.value} value={e.value}>{e.cat} · {e.label}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Label"><Input value={editing.value.label ?? ''} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, label: e.target.value } })} placeholder="Optional" /></Field>
            <Field label="Priority">
              <Select value={editing.value.priority} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, priority: e.target.value } })}>
                <option value="low">Low</option><option value="normal">Normal</option>
                <option value="high">High</option><option value="critical">Critical</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs font-semibold">Channels</p>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                  const on = editing.value.channels.includes(c.value);
                  const I = c.icon;
                  return (
                    <button key={c.value} onClick={() => setEditing({ ...editing, value: { ...editing.value, channels: on ? editing.value.channels.filter((v: string) => v !== c.value) : [...editing.value.channels, c.value] } })}
                      disabled={c.value === 'whatsapp' && !canSendWhatsApp && !on}
                      className={cx('inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50',
                        on ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                      <I size={13} /> {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2.5 sm:col-span-2">
              <input type="checkbox" checked={editing.value.enabled} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, enabled: e.target.checked } })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              <span className="text-sm font-medium">Enabled</span>
            </label>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Btn onClick={() => setEditing(null)}>Cancel</Btn>
          <Btn variant="primary" icon={busy === 'edit' ? Loader2 : Save} onClick={() => void saveRule()} disabled={busy === 'edit'}>Save</Btn>
        </div>
      </Modal>

      {/* SCHEDULE EDITOR */}
      <Modal open={editing?.kind === 'schedule'} onClose={() => setEditing(null)} title={editing?.value?.id ? 'Edit schedule' : 'New schedule'} icon={Calendar}>
        {editing?.kind === 'schedule' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Title"><Input value={editing.value.title} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, title: e.target.value } })} /></Field></div>
            <div className="sm:col-span-2">
              <Field label="Message">
                <textarea value={editing.value.message ?? ''} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, message: e.target.value } })} rows={4}
                  className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Recipients (optional; defaults to you)">
                <textarea value={(editing.value.recipients ?? []).join(', ')} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, recipients: e.target.value.split(/[ ,\n]+/).map((r: string) => r.trim()).filter(Boolean) } })} rows={2}
                  className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
              </Field>
            </div>
            <Field label="Channel">
              <Select value={editing.value.channel} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, channel: e.target.value } })}>
                {CHANNELS.map((c) => <option key={c.value} value={c.value} disabled={c.value === 'whatsapp' && !canSendWhatsApp}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={editing.value.schedule_type} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, schedule_type: e.target.value } })}>
                <option value="once">One-time</option><option value="daily">Daily</option>
                <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              </Select>
            </Field>
            <Field label="Run at"><Input type="datetime-local" value={editing.value.run_at} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, run_at: e.target.value } })} /></Field>
            <Field label="Timezone"><Input value={editing.value.timezone} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, timezone: e.target.value } })} /></Field>
            <label className="flex items-center gap-2.5 sm:col-span-2">
              <input type="checkbox" checked={editing.value.enabled} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, enabled: e.target.checked } })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              <span className="text-sm font-medium">Enabled</span>
            </label>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Btn onClick={() => setEditing(null)}>Cancel</Btn>
          <Btn variant="primary" icon={busy === 'edit' ? Loader2 : Save} onClick={() => void saveSchedule()} disabled={busy === 'edit'}>Save</Btn>
        </div>
      </Modal>
    </div>
  );
}

export default NotificationsPage;