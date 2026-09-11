import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  FileText,
  Filter,
  Globe,
  GitBranch,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Company {
  id: number;
  name: string;
  code: string;
  email: string;
  gst_number?: string | null;
  pan_number?: string | null;
  type?: string | null;
  phone: string;
  address: string;
  website?: string | null;
  active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

interface Branch {
  id: number;
  company_id: number;
  name: string;
  code?: string | null;
}

interface CompanyForm {
  name: string;
  code: string;
  email: string;
  gst_number: string;
  pan_number: string;
  type: string;
  phone: string;
  address: string;
  website: string;
  active: boolean;
}

const COMPANY_TYPES = [
  'Private Limited',
  'Public Limited',
  'Partnership',
  'Proprietorship',
  'LLP',
  'Others',
];

const PAGE_SIZE = 15;
const HEAD =
  'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

const emptyForm = (): CompanyForm => ({
  name: '',
  code: '',
  email: '',
  gst_number: '',
  pan_number: '',
  type: '',
  phone: '',
  address: '',
  website: '',
  active: true,
});

const normalize = <T,>(response: unknown): T[] => {
  if (Array.isArray(response)) return response as T[];

  if (response && typeof response === 'object') {
    const r = response as { data?: unknown };

    if (Array.isArray(r.data)) return r.data as T[];

    if (r.data && typeof r.data === 'object') {
      const nested = r.data as { data?: unknown };
      if (Array.isArray(nested.data)) return nested.data as T[];
    }
  }

  return [];
};

const csvSafe = (value: unknown) => {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `\t${raw}` : raw;

  return /[",\n\r]/.test(safe)
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
};

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        active
          ? 'rounded-full border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700'
          : 'rounded-full border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700'
      }
    >
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

function Kpi({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  tone: 'blue' | 'emerald' | 'rose' | 'indigo';
}) {
  const styles = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400">
            {title}
          </p>
          <p className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {value}
          </p>
        </div>

        <div className={`grid h-10 w-10 place-items-center rounded-xl ${styles[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  options,
  label,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/10"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export function CompaniesPage() {
  const { showSuccess, showError } = useNotification();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [taxFilter, setTaxFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');

  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [menuId, setMenuId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<Company | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<CompanyForm>(emptyForm());
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [companyResponse, branchResponse] = await Promise.all([
        apiClient.getCompanies(),
        apiClient.getBranches(),
      ]);

      setCompanies(normalize<Company>(companyResponse));
      setBranches(normalize<Branch>(branchResponse));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load companies.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const companyBranchCount = useMemo(() => {
    const map = new Map<number, number>();

    branches.forEach((branch) => {
      map.set(
        branch.company_id,
        (map.get(branch.company_id) || 0) + 1,
      );
    });

    return map;
  }, [branches]);

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();

    return companies.filter((company) => {
      if (
        term &&
        ![
          company.name,
          company.code,
          company.email,
          company.phone,
          company.type,
          company.gst_number,
          company.pan_number,
          company.address,
          company.website,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term)
      ) {
        return false;
      }

      if (
        statusFilter === 'active' &&
        !company.active
      ) {
        return false;
      }

      if (
        statusFilter === 'inactive' &&
        company.active
      ) {
        return false;
      }

      if (
        typeFilter !== 'all' &&
        company.type !== typeFilter
      ) {
        return false;
      }

      if (
        taxFilter === 'gst' &&
        !company.gst_number
      ) {
        return false;
      }

      if (
        taxFilter === 'pan' &&
        !company.pan_number
      ) {
        return false;
      }

      if (
        taxFilter === 'complete' &&
        (!company.gst_number ||
          !company.pan_number)
      ) {
        return false;
      }

      const hasBranch =
        (companyBranchCount.get(company.id) || 0) > 0;

      if (
        branchFilter === 'with_branch' &&
        !hasBranch
      ) {
        return false;
      }

      if (
        branchFilter === 'without_branch' &&
        hasBranch
      ) {
        return false;
      }

      return true;
    });
  }, [
    companies,
    search,
    statusFilter,
    typeFilter,
    taxFilter,
    branchFilter,
    companyBranchCount,
  ]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [
    search,
    statusFilter,
    typeFilter,
    taxFilter,
    branchFilter,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCompanies.length / PAGE_SIZE),
  );

  const rows = filteredCompanies.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const summary = useMemo(
    () => ({
      total: companies.length,
      active: companies.filter((x) => x.active).length,
      inactive: companies.filter((x) => !x.active).length,
      withBranches: companies.filter(
        (x) => (companyBranchCount.get(x.id) || 0) > 0,
      ).length,
    }),
    [companies, companyBranchCount],
  );

  const activeFilterCount = [
    search,
    statusFilter !== 'all' ? statusFilter : '',
    typeFilter !== 'all' ? typeFilter : '',
    taxFilter !== 'all' ? taxFilter : '',
    branchFilter !== 'all' ? branchFilter : '',
  ].filter(Boolean).length;

  const allSelected =
    rows.length > 0 &&
    rows.every((company) =>
      selectedIds.includes(company.id),
    );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormErrors({});
    setEditOpen(true);
  };

  const openEdit = (company: Company) => {
    setMenuId(null);
    setEditingId(company.id);

    setForm({
      name: company.name || '',
      code: company.code || '',
      email: company.email || '',
      gst_number: company.gst_number || '',
      pan_number: company.pan_number || '',
      type: company.type || '',
      phone: company.phone || '',
      address: company.address || '',
      website: company.website || '',
      active: company.active,
    });

    setFormErrors({});
    setEditOpen(true);
  };

  const openView = (company: Company) => {
    setMenuId(null);
    setViewing(company);
    setViewOpen(true);
  };

  const validate = () => {
    const errors: Record<string, boolean> = {};

    if (!form.name.trim()) errors.name = true;
    if (!form.code.trim()) errors.code = true;

    if (
      form.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
    ) {
      errors.email = true;
    }

    if (
      form.phone &&
      !/^[0-9+()\-.\s]{7,20}$/.test(form.phone)
    ) {
      errors.phone = true;
    }

    if (
      form.gst_number &&
      !/^[0-9A-Z]{15}$/i.test(form.gst_number.trim())
    ) {
      errors.gst_number = true;
    }

    if (
      form.pan_number &&
      !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(form.pan_number.trim())
    ) {
      errors.pan_number = true;
    }

    setFormErrors(errors);

    if (Object.keys(errors).length) {
      showError(
        'Validation',
        'Please correct the highlighted company fields.',
      );
      return false;
    }

    return true;
  };

  const saveCompany = async () => {
    if (!validate()) return;

    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      email: form.email.trim(),
      gst_number: form.gst_number.trim() || null,
      pan_number: form.pan_number.trim().toUpperCase() || null,
      type: form.type || null,
      phone: form.phone.trim(),
      address: form.address.trim(),
      website: form.website.trim() || null,
      active: !!form.active,
    };

    setSaving(true);

    try {
      if (editingId) {
        await apiClient.updateCompany(
          editingId,
          payload,
        );

        showSuccess(
          'Company updated',
          `${payload.name} updated successfully.`,
        );

        addAppLog({
          module: 'Companies',
          action: 'Update company',
          status: 'success',
          message: payload.name,
        });
      } else {
        await apiClient.createCompany(payload);

        showSuccess(
          'Company created',
          `${payload.name} created successfully.`,
        );

        addAppLog({
          module: 'Companies',
          action: 'Create company',
          status: 'success',
          message: payload.name,
        });
      }

      setEditOpen(false);
      await load();
    } catch (err) {
      showError(
        'Save failed',
        err instanceof Error
          ? err.message
          : 'Unable to save company.',
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteCompany = async (company: Company) => {
    setMenuId(null);

    if (
      !window.confirm(
        `Delete company "${company.name}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      await apiClient.deleteCompany(company.id);

      showSuccess(
        'Company deleted',
        `${company.name} removed successfully.`,
      );

      addAppLog({
        module: 'Companies',
        action: 'Delete company',
        status: 'success',
        message: company.name,
      });

      setSelectedIds((current) =>
        current.filter((id) => id !== company.id),
      );

      if (viewing?.id === company.id) {
        setViewing(null);
        setViewOpen(false);
      }

      await load();
    } catch (err) {
      showError(
        'Delete failed',
        err instanceof Error
          ? err.message
          : 'Unable to delete company.',
      );
    }
  };

  const bulkDelete = async () => {
    if (!selectedIds.length) return;

    if (
      !window.confirm(
        `Delete ${selectedIds.length} selected company(s)? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      await Promise.all(
        selectedIds.map((id) =>
          apiClient.deleteCompany(id),
        ),
      );

      showSuccess(
        'Bulk delete complete',
        `${selectedIds.length} company(s) deleted.`,
      );

      addAppLog({
        module: 'Companies',
        action: 'Bulk delete',
        status: 'success',
        message: `${selectedIds.length} companies`,
      });

      setSelectedIds([]);
      await load();
    } catch (err) {
      showError(
        'Bulk delete failed',
        err instanceof Error
          ? err.message
          : 'Unable to delete selected companies.',
      );
    }
  };

  const exportCsv = () => {
    if (!filteredCompanies.length) {
      showError(
        'Nothing to export',
        'No companies match the current filters.',
      );
      return;
    }

    const headers = [
      'Name',
      'Code',
      'Type',
      'Email',
      'Phone',
      'GST',
      'PAN',
      'Branches',
      'Status',
      'Address',
      'Website',
    ];

    const lines = filteredCompanies.map(
      (company) =>
        [
          company.name,
          company.code,
          company.type || '',
          company.email,
          company.phone,
          company.gst_number || '',
          company.pan_number || '',
          companyBranchCount.get(company.id) || 0,
          company.active ? 'Active' : 'Inactive',
          company.address,
          company.website || '',
        ]
          .map(csvSafe)
          .join(','),
    );

    const blob = new Blob(
      [[headers.map(csvSafe).join(','), ...lines].join('\n')],
      { type: 'text/csv;charset=utf-8;' },
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `companies-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);

    showSuccess(
      'Export complete',
      `${filteredCompanies.length} company(s) exported.`,
    );
  };

  const toggleAll = () => {
    const ids = rows.map((x) => x.id);

    setSelectedIds((current) =>
      allSelected
        ? current.filter((id) => !ids.includes(id))
        : Array.from(new Set([...current, ...ids])),
    );
  };

  const toggleOne = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    );
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
      <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">

        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,.45)] sm:px-7 lg:px-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl" />

          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.18em] text-cyan-200">
                <Building2 className="h-3 w-3" />
                Business · Companies
              </div>

              <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                <Building2 className="h-7 w-7 text-cyan-300" />
                Company workspace
              </h1>

              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Manage companies, legal information, branches, GST/PAN,
                contacts and active business entities.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={exportCsv}
                disabled={loading || !filteredCompanies.length}
                className="h-10 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>

              <Button
                onClick={openCreate}
                className="h-10 rounded-xl bg-cyan-400 font-semibold text-slate-950 hover:bg-cyan-300"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add company
              </Button>
            </div>
          </div>
        </section>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            title="Companies"
            value={String(summary.total)}
            icon={Building2}
            tone="blue"
          />

          <Kpi
            title="Active"
            value={String(summary.active)}
            icon={CheckCircle2}
            tone="emerald"
          />

          <Kpi
            title="Inactive"
            value={String(summary.inactive)}
            icon={AlertCircle}
            tone="rose"
          />

          <Kpi
            title="With branches"
            value={String(summary.withBranches)}
            icon={GitBranch}
            tone="indigo"
          />
        </section>

        {/* Filters */}
        <Card className="overflow-hidden rounded-2xl border-slate-200/80">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-50 text-cyan-600">
                <Filter className="h-4 w-4" />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Company filters
                </p>
                <p className="text-[11px] text-slate-500">
                  {activeFilterCount
                    ? `${activeFilterCount} active filter${
                        activeFilterCount > 1 ? 's' : ''
                      }`
                    : 'Search, status, type, tax and branch availability'}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setFiltersOpen((x) => !x)}
              >
                <Filter className="mr-2 h-3.5 w-3.5" />
                {filtersOpen ? 'Hide' : 'Show'}
              </Button>

              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                    setTypeFilter('all');
                    setTaxFilter('all');
                    setBranchFilter('all');
                  }}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent
            className={`${
              filtersOpen ? 'block' : 'hidden'
            } p-4 sm:p-5 lg:block`}
          >
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="relative lg:col-span-4">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search company, code, GST, PAN, email, phone…"
                  className="h-10 rounded-xl pl-10"
                />
              </div>

              <SelectBox
                label="Status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'All status' },
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
                className="lg:col-span-2"
              />

              <SelectBox
                label="Company type"
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { value: 'all', label: 'All types' },
                  ...COMPANY_TYPES.map((type) => ({
                    value: type,
                    label: type,
                  })),
                ]}
                className="lg:col-span-2"
              />

              <SelectBox
                label="Tax profile"
                value={taxFilter}
                onChange={setTaxFilter}
                options={[
                  { value: 'all', label: 'All tax profiles' },
                  { value: 'gst', label: 'GST available' },
                  { value: 'pan', label: 'PAN available' },
                  { value: 'complete', label: 'GST + PAN complete' },
                ]}
                className="lg:col-span-2"
              />

              <SelectBox
                label="Branches"
                value={branchFilter}
                onChange={setBranchFilter}
                options={[
                  { value: 'all', label: 'All companies' },
                  { value: 'with_branch', label: 'With branches' },
                  { value: 'without_branch', label: 'No branches' },
                ]}
                className="lg:col-span-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold">
                Unable to load companies
              </p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Bulk */}
        {selectedIds.length > 0 && (
          <div className="sticky top-3 z-30 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-50">
                {selectedIds.length} selected
              </Badge>

              <Button
                size="sm"
                variant="destructive"
                onClick={bulkDelete}
                className="h-9 rounded-lg !bg-rose-600 !text-white hover:!bg-rose-700"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-9"
                onClick={() => setSelectedIds([])}
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <Card className="overflow-hidden rounded-2xl border-slate-200/80">
          <CardHeader className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <Building2 className="h-4 w-4" />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Company directory
                </p>
                <p className="text-[11px] text-slate-500">
                  {loading
                    ? 'Loading companies…'
                    : `${filteredCompanies.length} matching company${
                        filteredCompanies.length === 1 ? '' : 'ies'
                      }`}
                </p>
              </div>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="min-w-[1150px]">
              <TableHeader>
                <TableRow className="bg-slate-50/70">
                  <TableHead className="w-11 px-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all companies"
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                    />
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Company</span>
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Code</span>
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Type</span>
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Contact</span>
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Tax</span>
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Branches</span>
                  </TableHead>

                  <TableHead>
                    <span className={HEAD}>Status</span>
                  </TableHead>

                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((__, x) => (
                        <TableCell key={x}>
                          <div className="h-4 animate-pulse rounded bg-slate-100" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!loading &&
                  rows.map((company) => {
                    const checked = selectedIds.includes(
                      company.id,
                    );

                    const branchCount =
                      companyBranchCount.get(company.id) || 0;

                    return (
                      <TableRow
                        key={company.id}
                        onClick={() => openView(company)}
                        className={`cursor-pointer border-slate-100 hover:bg-slate-50/80 ${
                          checked
                            ? 'bg-cyan-50/40'
                            : ''
                        }`}
                      >
                        <TableCell
                          className="px-3"
                          onClick={(e) =>
                            e.stopPropagation()
                          }
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleOne(company.id)
                            }
                            aria-label={`Select ${company.name}`}
                            className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                          />
                        </TableCell>

                        <TableCell>
                          <div className="min-w-[220px]">
                            <div className="flex items-center gap-3">
                              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-600">
                                <Building2 className="h-4 w-4" />
                              </div>

                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {company.name}
                                </p>

                                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                  {company.address || 'No address'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className="rounded-full bg-slate-50"
                          >
                            {company.code || '—'}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <span className="text-xs text-slate-700">
                            {company.type || '—'}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="min-w-[180px]">
                            <p className="flex items-center gap-1.5 text-xs text-slate-700">
                              <Mail className="h-3 w-3 text-slate-400" />
                              {company.email || '—'}
                            </p>

                            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                              <Phone className="h-3 w-3 text-slate-400" />
                              {company.phone || '—'}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-[11px] font-medium text-slate-700">
                              GST: {company.gst_number || '—'}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              PAN: {company.pan_number || '—'}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <GitBranch className="h-3.5 w-3.5 text-violet-500" />
                            <span className="text-sm font-semibold text-slate-700">
                              {branchCount}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <StatusBadge active={company.active} />
                        </TableCell>

                        <TableCell
                          onClick={(e) =>
                            e.stopPropagation()
                          }
                        >
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setMenuId((id) =>
                                  id === company.id
                                    ? null
                                    : company.id,
                                )
                              }
                              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>

                            {menuId === company.id && (
                              <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-left shadow-xl">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openView(company)
                                  }
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <Eye className="h-4 w-4 text-slate-400" />
                                  View details
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openEdit(company)
                                  }
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <Pencil className="h-4 w-4 text-slate-400" />
                                  Edit company
                                </button>

                                <Separator className="my-1" />

                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteCompany(company)
                                  }
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete company
                                </button>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                {!loading &&
                  rows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="py-20 text-center"
                      >
                        <div className="mx-auto max-w-md">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100">
                            <Search className="h-6 w-6 text-slate-400" />
                          </div>

                          <p className="mt-4 font-semibold text-slate-800">
                            No companies found
                          </p>

                          <p className="mt-1 text-sm text-slate-500">
                            Adjust the filters or search phrase.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-slate-500">
              Showing{' '}
              <b>
                {filteredCompanies.length
                  ? (page - 1) * PAGE_SIZE + 1
                  : 0}
              </b>
              {' – '}
              <b>
                {Math.min(
                  page * PAGE_SIZE,
                  filteredCompanies.length,
                )}
              </b>
              {' of '}
              <b>{filteredCompanies.length}</b>
            </p>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={page === 1}
                onClick={() => setPage(1)}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={page === 1}
                onClick={() =>
                  setPage((p) =>
                    Math.max(1, p - 1),
                  )
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="min-w-[70px] rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold">
                {page} / {totalPages}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={page === totalPages}
                onClick={() =>
                  setPage((p) =>
                    Math.min(
                      totalPages,
                      p + 1,
                    ),
                  )
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={page === totalPages}
                onClick={() =>
                  setPage(totalPages)
                }
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* View sheet */}
      <Sheet
        open={viewOpen}
        onOpenChange={(open) => {
          setViewOpen(open);
          if (!open) setViewing(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-0 sm:max-w-lg"
        >
          {viewing && (
            <>
              <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
                <SheetHeader>
                  <SheetTitle className="pr-8">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-50 text-cyan-600">
                        <Building2 className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-base font-bold">
                          {viewing.name}
                        </p>

                        <p className="text-[11px] text-slate-400">
                          Company #{viewing.id}
                        </p>
                      </div>
                    </div>
                  </SheetTitle>

                  <div className="mt-2">
                    <StatusBadge
                      active={viewing.active}
                    />
                  </div>
                </SheetHeader>
              </div>

              <div className="space-y-4 px-5 py-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">
                      Code
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      {viewing.code || '—'}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">
                      Branches
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      {companyBranchCount.get(viewing.id) || 0}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border bg-white">
                  <div className="border-b bg-slate-50/70 px-3.5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide">
                      Company information
                    </p>
                  </div>

                  <div className="divide-y">
                    {[
                      ['Type', viewing.type],
                      ['Email', viewing.email],
                      ['Phone', viewing.phone],
                      ['GSTIN', viewing.gst_number],
                      ['PAN', viewing.pan_number],
                      ['Website', viewing.website],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex justify-between gap-4 px-3.5 py-3"
                      >
                        <span className="text-[11px] text-slate-400">
                          {label}
                        </span>

                        <span className="max-w-[65%] break-words text-right text-xs font-semibold">
                          {String(value || '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-3.5">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-cyan-500" />
                    <p className="text-xs font-semibold uppercase tracking-wide">
                      Registered address
                    </p>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {viewing.address || 'No address available.'}
                  </p>
                </div>

                <div className="rounded-xl border bg-white">
                  <div className="border-b bg-slate-50/70 px-3.5 py-3">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-violet-500" />
                      <p className="text-xs font-semibold uppercase tracking-wide">
                        Branches
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5">
                    {branches.filter(
                      (b) => b.company_id === viewing.id,
                    ).length ? (
                      <div className="space-y-2">
                        {branches
                          .filter(
                            (b) =>
                              b.company_id ===
                              viewing.id,
                          )
                          .map((b) => (
                            <div
                              key={b.id}
                              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                            >
                              <div>
                                <p className="text-xs font-semibold">
                                  {b.name}
                                </p>
                                {b.code && (
                                  <p className="text-[10px] text-slate-400">
                                    {b.code}
                                  </p>
                                )}
                              </div>

                              <Badge
                                variant="outline"
                                className="rounded-full text-[10px]"
                              >
                                #{b.id}
                              </Badge>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        No branches linked.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pb-4">
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={() => {
                      setViewOpen(false);
                      openEdit(viewing);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>

                  <Button
                    variant="destructive"
                    className="h-10 rounded-xl !bg-rose-600 !text-white hover:!bg-rose-700"
                    onClick={() =>
                      deleteCompany(viewing)
                    }
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create / Edit sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-0 sm:max-w-xl"
        >
          <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 pr-8">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-50 text-cyan-600">
                  {editingId ? (
                    <Pencil className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </span>

                {editingId
                  ? 'Edit company'
                  : 'Add company'}
              </SheetTitle>
            </SheetHeader>
          </div>

          <div className="space-y-4 px-5 py-5 pb-24">
            <section className="rounded-2xl border bg-white p-4">
              <p className="mb-4 text-sm font-semibold">
                Company information
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold">
                    Company name *
                  </label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm((x) => ({
                        ...x,
                        name: e.target.value,
                      }))
                    }
                    className={
                      formErrors.name
                        ? 'border-rose-400 ring-4 ring-rose-100'
                        : ''
                    }
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold">
                    Company code *
                  </label>
                  <Input
                    value={form.code}
                    onChange={(e) =>
                      setForm((x) => ({
                        ...x,
                        code: e.target.value,
                      }))
                    }
                    className={
                      formErrors.code
                        ? 'border-rose-400 ring-4 ring-rose-100'
                        : ''
                    }
                  />
                </div>

                <SelectBox
                  label="Company type"
                  value={form.type}
                  onChange={(v) =>
                    setForm((x) => ({
                      ...x,
                      type: v,
                    }))
                  }
                  options={[
                    {
                      value: '',
                      label: 'Select company type',
                    },
                    ...COMPANY_TYPES.map(
                      (type) => ({
                        value: type,
                        label: type,
                      }),
                    ),
                  ]}
                />

                <div>
                  <label className="mb-1.5 block text-xs font-semibold">
                    Status
                  </label>

                  <select
                    value={
                      form.active
                        ? 'active'
                        : 'inactive'
                    }
                    onChange={(e) =>
                      setForm((x) => ({
                        ...x,
                        active:
                          e.target.value ===
                          'active',
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="active">
                      Active
                    </option>
                    <option value="inactive">
                      Inactive
                    </option>
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <p className="mb-4 text-sm font-semibold">
                Tax & registration
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold">
                    GSTIN
                  </label>
                  <Input
                    value={form.gst_number}
                    onChange={(e) =>
                      setForm((x) => ({
                        ...x,
                        gst_number:
                          e.target.value.toUpperCase(),
                      }))
                    }
                    maxLength={15}
                    className={
                      formErrors.gst_number
                        ? 'border-rose-400 ring-4 ring-rose-100'
                        : ''
                    }
                    placeholder="15-character GSTIN"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold">
                    PAN
                  </label>
                  <Input
                    value={form.pan_number}
                    onChange={(e) =>
                      setForm((x) => ({
                        ...x,
                        pan_number:
                          e.target.value.toUpperCase(),
                      }))
                    }
                    maxLength={10}
                    className={
                      formErrors.pan_number
                        ? 'border-rose-400 ring-4 ring-rose-100'
                        : ''
                    }
                    placeholder="ABCDE1234F"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <p className="mb-4 text-sm font-semibold">
                Contact information
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((x) => ({
                        ...x,
                        email: e.target.value,
                      }))
                    }
                    className={
                      formErrors.email
                        ? 'border-rose-400 ring-4 ring-rose-100'
                        : ''
                    }
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold">
                    Phone
                  </label>
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) =>
                      setForm((x) => ({
                        ...x,
                        phone: e.target.value,
                      }))
                    }
                    className={
                      formErrors.phone
                        ? 'border-rose-400 ring-4 ring-rose-100'
                        : ''
                    }
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold">
                    Website
                  </label>
                  <Input
                    type="url"
                    value={form.website}
                    onChange={(e) =>
                      setForm((x) => ({
                        ...x,
                        website: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold">
                    Registered address
                  </label>
                  <textarea
                    rows={4}
                    value={form.address}
                    onChange={(e) =>
                      setForm((x) => ({
                        ...x,
                        address:
                          e.target.value,
                      }))
                    }
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/10"
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="fixed bottom-0 right-0 z-30 w-full border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:max-w-xl">
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() =>
                  setEditOpen(false)
                }
                className="h-10 rounded-xl"
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>

              <Button
                disabled={saving}
                onClick={saveCompany}
                className="h-10 rounded-xl bg-cyan-600 text-white hover:bg-cyan-700"
              >
                {saving
                  ? 'Saving…'
                  : editingId
                    ? 'Update company'
                    : 'Create company'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default CompaniesPage;