// src/pages/InvoicesPage.tsx
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  lazy,
  Suspense,
  memo,
  useRef,
  startTransition,
} from 'react';
import { createPortal } from 'react-dom';
import {
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiDownload,
  FiEye,
  FiCheckCircle,
  FiAlertCircle,
  FiFilter,
  FiSearch,
  FiDollarSign,
  FiCalendar,
  FiClock,
  FiHash,
  FiChevronDown,
  FiChevronRight,
  FiMail,
  FiPrinter,
  FiEdit,
  FiMoreVertical,
  FiTruck,
  FiCopy,
  FiFileText,
  FiRepeat,
  FiUpload,
  FiX,
  FiLoader,
} from 'react-icons/fi';
import { Link } from 'react-router-dom';

// Lazy loaded heavy components
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import InvoicePrint from '../components/InvoicePrint';

// ---------- Simple API Cache Hook (with cleanup) ----------
const cache = new Map<string, { data: any; timestamp: number }>();

function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 300_000
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

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
      if (!mountedRef.current) return;
      const result = Array.isArray(res) ? res : (res as any).data ?? [];
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg = err.message || 'Failed to load';
      setError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [key, fetcher, ttlMs]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

// ---------- CSV Helpers (safe export) ----------
const escapeCsvField = (value: string): string => {
  if (/[",\n\r]/.test(value) || value.startsWith('=') || value.startsWith('+') || value.startsWith('-') || value.startsWith('@')) {
    let escaped = value.replace(/"/g, '""');
    escaped = '\t' + escaped;
    return `"${escaped}"`;
  }
  return value;
};

// ---------- CSV Parser (simple) ----------
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length !== headers.length) {
      console.warn(`Row ${i + 1} has mismatched columns`);
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx].trim();
    });
    rows.push(row);
  }
  return rows;
}

// ---------- Types ----------
interface Customer {
  id: number;
  name: string;
  email?: string;
}

interface Invoice {
  id: number;
  invoice_no: string;
  customer_id: number;
  customer: Customer;
  total_amount: number | string;
  tax_amount: number | string;
  status: 'paid' | 'pending' | 'overdue' | 'draft';
  due_date: string | null;
  invoice_date?: string;
  created_at?: string;
  updated_at?: string;
  items?: any[];
}

// ---------- Original Simple StatCard (clean, no gradients) ----------
const StatCard = memo(({ icon: Icon, label, value, tone, prefix }: {
  icon: any;
  label: string;
  value: string | number;
  tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal' | 'slate';
  prefix?: string;
}) => {
  const bg =
    tone === 'blue' ? 'bg-blue-100 text-blue-600' :
    tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
    tone === 'amber' ? 'bg-amber-100 text-amber-600' :
    tone === 'rose' ? 'bg-rose-100 text-rose-600' :
    tone === 'purple' ? 'bg-purple-100 text-purple-600' :
    tone === 'slate' ? 'bg-slate-100 text-slate-600' :
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

// ---------- Portal-based Action Dropdown ----------
const ActionDropdown = memo(
  ({
    row,
    onPrint,
    onDuplicate,
    onDelete,
  }: {
    row: Invoice;
    onPrint: (inv: Invoice) => void;
    onDuplicate: (inv: Invoice) => void;
    onDelete: (inv: Invoice) => void;
  }) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

    const toggle = useCallback(() => {
      startTransition(() => {
        setOpen(prev => {
          const willOpen = !prev;
          if (willOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const top =
              rect.bottom + 4 + 320 > viewportHeight
                ? rect.top - 4 - 320
                : rect.bottom + 4;
            setMenuStyle({
              position: 'fixed',
              left: rect.left,
              top: top,
              minWidth: 220,
            });
          }
          return willOpen;
        });
      });
    }, []);

    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (
          menuRef.current &&
          !menuRef.current.contains(e.target as Node) &&
          buttonRef.current &&
          !buttonRef.current.contains(e.target as Node)
        ) {
          startTransition(() => setOpen(false));
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const closeAndAct = useCallback((action: () => void) => {
      startTransition(() => setOpen(false));
      action();
    }, []);

    return (
      <>
        <button
          ref={buttonRef}
          onClick={toggle}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          title="More actions"
        >
          <FiMoreVertical size={16} />
        </button>
        {open &&
          createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="z-[9999] bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 animate-fadeIn"
            >
              <Link
                to={`/invoices/${row.id}/edit`}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                onClick={() => closeAndAct(() => {})}
              >
                <FiEdit size={16} className="text-slate-500" /> Edit
              </Link>
              <button
                onClick={() => closeAndAct(() => onPrint(row))}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <FiPrinter size={16} className="text-slate-500" /> Print
              </button>
              <button
                onClick={() => closeAndAct(() => onDuplicate(row))}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <FiCopy size={16} className="text-slate-500" /> Duplicate
              </button>
              <div className="border-t border-slate-200 my-1"></div>
              <button
                disabled
                className="w-full text-left px-4 py-2.5 text-sm text-slate-400 flex items-center gap-2 cursor-not-allowed"
              >
                <FiTruck size={16} /> Shipping Label
              </button>
              <button
                disabled
                className="w-full text-left px-4 py-2.5 text-sm text-slate-400 flex items-center gap-2 cursor-not-allowed"
              >
                <FiFileText size={16} /> Generate E‑way Bill
              </button>
              <button
                disabled
                className="w-full text-left px-4 py-2.5 text-sm text-slate-400 flex items-center gap-2 cursor-not-allowed"
              >
                <FiRepeat size={16} /> Convert to Purchase
              </button>
              <div className="border-t border-slate-200 my-1"></div>
              <button
                onClick={() => closeAndAct(() => onDelete(row))}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
              >
                <FiTrash2 size={16} /> Delete
              </button>
            </div>,
            document.body
          )}
      </>
    );
  }
);

// ---------- Invoice Import Modal ----------
const InvoiceImportModal = memo(
  ({ isOpen, onClose, onImported }: { isOpen: boolean; onClose: () => void; onImported: () => void }) => {
    const { showSuccess, showError } = useNotification();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
    const [fileName, setFileName] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);

    // Default company/branch state
    const [companies, setCompanies] = useState<any[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [defaultCompanyId, setDefaultCompanyId] = useState<string>('');
    const [defaultBranchId, setDefaultBranchId] = useState<string>('');
    const [loadingCompanies, setLoadingCompanies] = useState(false);
    const [loadingBranches, setLoadingBranches] = useState(false);

    useEffect(() => {
      if (isOpen) {
        setLoadingCompanies(true);
        apiClient.getCompanies()
          .then((res: any) => {
            const companyList = Array.isArray(res) ? res : (res?.data ?? []);
            setCompanies(companyList);
            if (companyList.length > 0) {
              setDefaultCompanyId(String(companyList[0].id));
            }
          })
          .catch((err: any) => {
            console.warn('Failed to load companies', err);
          })
          .finally(() => setLoadingCompanies(false));
      } else {
        setParsedRows([]);
        setFileName('');
        setError(null);
        setImportProgress({ current: 0, total: 0 });
        setCompanies([]);
        setBranches([]);
        setDefaultCompanyId('');
        setDefaultBranchId('');
      }
    }, [isOpen]);

    useEffect(() => {
      if (!defaultCompanyId) {
        setBranches([]);
        setDefaultBranchId('');
        return;
      }
      setLoadingBranches(true);
      apiClient.getBranchesByCompany(Number(defaultCompanyId))
        .then((res: any) => {
          const branchList = Array.isArray(res) ? res : (res?.data ?? []);
          setBranches(branchList);
          if (branchList.length > 0) {
            setDefaultBranchId(String(branchList[0].id));
          } else {
            setDefaultBranchId('');
          }
        })
        .catch(() => {
          setBranches([]);
          setDefaultBranchId('');
        })
        .finally(() => setLoadingBranches(false));
    }, [defaultCompanyId]);

    const handleFile = (file: File) => {
      setError(null);
      setParsedRows([]);
      setFileName(file.name);

      const extension = file.name.split('.').pop()?.toLowerCase();
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        try {
          if (extension === 'json') {
            const data = JSON.parse(text);
            if (!Array.isArray(data)) {
              throw new Error('JSON file must contain an array of invoice objects.');
            }
            setParsedRows(data);
          } else if (extension === 'csv') {
            setParsedRows(parseCSV(text));
          } else {
            throw new Error('Unsupported file type. Please upload a .csv or .json file.');
          }
        } catch (err: any) {
          setError(err.message);
          setParsedRows([]);
        }
      };
      reader.readAsText(file);
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    };

    const downloadTemplate = (type: 'csv' | 'json') => {
      if (type === 'csv') {
        const csvContent = `invoice_no,customer_id,customer_name,customer_email,invoice_date,due_date,total_amount,tax_amount,status,company_id,branch_id,payment_amount,payment_method,payment_reference_no,payment_transaction_date,payment_bank_name,payment_account_number,payment_remarks,payment_direction\nINV-2024-001,1,ABC Corp,abc@example.com,2024-01-15,2024-02-15,1000.00,180.00,pending,1,1,500.00,cash,REF001,2024-01-15,State Bank,1234567890,Partial payment,inward`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'invoice_template.csv';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const jsonData = [
          {
            invoice_no: 'INV-2024-001',
            customer_id: 1,
            customer_name: 'ABC Corp',
            customer_email: 'abc@example.com',
            invoice_date: '2024-01-15',
            due_date: '2024-02-15',
            total_amount: 1000.00,
            tax_amount: 180.00,
            status: 'pending',
            company_id: 1,
            branch_id: 1,
            items: [
              {
                product_id: 1,
                quantity: 1,
                unit_price: 1000.00,
                discount_type: 'percent',
                discount_percent: 0,
                discount_amount: 0,
                gst_slab: 18,
                is_inter_state: true,
                cgst_percent: 0,
                sgst_percent: 0,
                igst_percent: 18,
                cgst_amount: 0,
                sgst_amount: 0,
                igst_amount: 180.00,
                total: 1180.00,
              },
            ],
            payments: [
              {
                amount: 500.00,
                payment_method: 'cash',
                reference_no: 'REF001',
                transaction_date: '2024-01-15',
                bank_name: '',
                account_number: '',
                remarks: 'Partial payment',
                payment_direction: 'inward',
                company_id: 1,
                branch_id: 1,
              },
            ],
          },
        ];
        const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'invoice_template.json';
        a.click();
        URL.revokeObjectURL(url);
      }
    };

    const findOrCreateCustomer = async (row: Record<string, any>) => {
      if (row.customer_id && !isNaN(Number(row.customer_id))) {
        return Number(row.customer_id);
      }
      if (row.customer_name) {
        try {
          const customers = await apiClient.getAllCustomers();
          const customersArray = Array.isArray(customers) ? customers : (customers as any).data ?? [];
          const matched = customersArray.find(
            (c: any) =>
              (row.customer_email && c.email?.toLowerCase() === row.customer_email.toLowerCase()) ||
              c.name.toLowerCase() === row.customer_name.toLowerCase()
          );
          if (matched) return matched.id;
          const newCustomer = await apiClient.createCustomer({
            name: row.customer_name,
            email: row.customer_email || undefined,
            billing_city: row.billing_city || undefined,
          });
          return newCustomer.id;
        } catch (err) {
          console.warn('Customer lookup/creation failed', err);
          return null;
        }
      }
      return null;
    };

    const handleImport = async () => {
      if (parsedRows.length === 0) {
        setError('No data to import. Please upload a valid file.');
        return;
      }

      const requiredFields = ['total_amount'];
      const firstRow = parsedRows[0];
      const keys = Object.keys(firstRow).map(k => k.toLowerCase());
      const missingFields = requiredFields.filter(f => !keys.includes(f));
      if (missingFields.length > 0) {
        setError(`Missing required columns: ${missingFields.join(', ')}`);
        return;
      }

      if (!defaultCompanyId) {
        setError('Please select a default company before importing.');
        return;
      }

      setIsImporting(true);
      setImportProgress({ current: 0, total: parsedRows.length });
      let successCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        const normalizedRow: Record<string, any> = {};
        Object.keys(row).forEach(key => {
          normalizedRow[key.toLowerCase()] = row[key];
        });

        try {
          const customerId = await findOrCreateCustomer(normalizedRow);
          if (!customerId) {
            throw new Error('Customer not found and could not be created.');
          }

          const invoiceCompanyId = normalizedRow.company_id ? Number(normalizedRow.company_id) : Number(defaultCompanyId);
          const invoiceBranchId = normalizedRow.branch_id ? Number(normalizedRow.branch_id) : (defaultBranchId ? Number(defaultBranchId) : undefined);

          const invoicePayload: any = {
            customer_id: customerId,
            invoice_date: normalizedRow.invoice_date || new Date().toISOString().split('T')[0],
            due_date: normalizedRow.due_date || null,
            total_amount: parseFloat(normalizedRow.total_amount),
            tax_amount: parseFloat(normalizedRow.tax_amount || '0'),
            status: (normalizedRow.status as Invoice['status']) || 'pending',
          };

          if (normalizedRow.invoice_no && String(normalizedRow.invoice_no).trim()) {
            invoicePayload.invoice_no = String(normalizedRow.invoice_no).trim();
          }

          if (invoiceCompanyId) invoicePayload.company_id = invoiceCompanyId;
          if (invoiceBranchId) invoicePayload.branch_id = invoiceBranchId;

          if (Array.isArray(normalizedRow.items)) {
            invoicePayload.items = normalizedRow.items.map((item: any) => ({
              product_id: Number(item.product_id),
              quantity: Number(item.quantity),
              unit_price: Number(item.unit_price),
              discount_type: item.discount_type || 'percent',
              discount_percent: Number(item.discount_percent || 0),
              discount_amount: Number(item.discount_amount || 0),
              gst_slab: Number(item.gst_slab || 0),
              is_inter_state: Boolean(item.is_inter_state),
              cgst_percent: Number(item.cgst_percent || 0),
              sgst_percent: Number(item.sgst_percent || 0),
              igst_percent: Number(item.igst_percent || 0),
              cgst_amount: Number(item.cgst_amount || 0),
              sgst_amount: Number(item.sgst_amount || 0),
              igst_amount: Number(item.igst_amount || 0),
              total: Number(item.total || 0),
            }));
          } else {
            invoicePayload.items = [];
          }

          const res = await apiClient.createInvoice(invoicePayload);
          const newInvoice = (res as any).data ?? res;

          const paymentsToCreate: any[] = [];
          if (Array.isArray(normalizedRow.payments)) {
            normalizedRow.payments.forEach((payment: any) => {
              paymentsToCreate.push({
                amount: Number(payment.amount),
                payment_method: payment.payment_method || 'cash',
                reference_no: payment.reference_no || `PAY-${newInvoice.id}-${paymentsToCreate.length + 1}`,
                transaction_date: payment.transaction_date || new Date().toISOString().split('T')[0],
                bank_name: payment.bank_name || '',
                account_number: payment.account_number || '',
                remarks: payment.remarks || '',
                payment_direction: payment.payment_direction || 'inward',
                company_id: payment.company_id ? Number(payment.company_id) : invoiceCompanyId,
                branch_id: payment.branch_id ? Number(payment.branch_id) : invoiceBranchId,
              });
            });
          } else {
            const paymentAmount = parseFloat(normalizedRow.payment_amount || '0');
            if (paymentAmount > 0) {
              paymentsToCreate.push({
                amount: paymentAmount,
                payment_method: normalizedRow.payment_method || 'cash',
                reference_no: normalizedRow.payment_reference_no || `PAY-${newInvoice.id}-1`,
                transaction_date: normalizedRow.payment_transaction_date || new Date().toISOString().split('T')[0],
                bank_name: normalizedRow.payment_bank_name || '',
                account_number: normalizedRow.payment_account_number || '',
                remarks: normalizedRow.payment_remarks || '',
                payment_direction: normalizedRow.payment_direction || 'inward',
                company_id: normalizedRow.payment_company_id ? Number(normalizedRow.payment_company_id) : invoiceCompanyId,
                branch_id: normalizedRow.payment_branch_id ? Number(normalizedRow.payment_branch_id) : invoiceBranchId,
              });
            }
          }

          if (paymentsToCreate.length > 0) {
            const paymentPromises = paymentsToCreate.map((payment, idx) => {
              if (!payment.company_id) {
                throw new Error(`Payment row ${idx + 1} missing company_id.`);
              }
              return apiClient.request('POST', '/payments', {
                company_id: payment.company_id,
                invoice_id: newInvoice.id,
                reference_no: payment.reference_no,
                amount: payment.amount,
                payment_method: payment.payment_method,
                status: 'completed',
                payment_direction: payment.payment_direction,
                transaction_date: payment.transaction_date,
                bank_name: payment.bank_name,
                account_number: payment.account_number,
                ledger_reference: payment.reference_no,
                remarks: payment.remarks,
                ...(payment.branch_id && { branch_id: payment.branch_id }),
              });
            });
            await Promise.all(paymentPromises);
          }

          successCount++;
        } catch (err: any) {
          errors.push(`Row ${i + 1}: ${err.message}`);
        }
        setImportProgress({ current: i + 1, total: parsedRows.length });
      }

      setIsImporting(false);
      if (successCount > 0) {
        showSuccess('Import completed', `${successCount} invoice(s) created successfully.`);
        addAppLog({
          module: 'Invoices',
          action: 'Import',
          status: 'success',
          message: `Imported ${successCount} invoices from ${fileName}`,
        });
      }
      if (errors.length > 0) {
        showError('Some rows failed', errors.slice(0, 5).join('; '));
        setError(errors.slice(0, 5).join('; '));
      }
      if (successCount > 0) {
        onImported();
      }
      if (errors.length === 0 && successCount === parsedRows.length) {
        onClose();
      }
    };

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={onClose} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">Import Invoices</h2>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
                <FiX size={20} />
              </button>
            </div>

            {/* Default Company & Branch Selectors */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Default Company *</label>
                <select
                  value={defaultCompanyId}
                  onChange={(e) => setDefaultCompanyId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                  disabled={loadingCompanies}
                >
                  <option value="">Select Company</option>
                  {companies.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {loadingCompanies && <FiLoader className="animate-spin inline ml-2" size={14} />}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Default Branch</label>
                <select
                  value={defaultBranchId}
                  onChange={(e) => setDefaultBranchId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                  disabled={loadingBranches || !defaultCompanyId}
                >
                  <option value="">Select Branch</option>
                  {branches.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {loadingBranches && <FiLoader className="animate-spin inline ml-2" size={14} />}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 mb-4 text-sm text-slate-600">
              <p className="font-medium mb-2">File format requirements:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>CSV or JSON file.</li>
                <li>CSV: first row must be headers (case‑insensitive).</li>
                <li>Required columns: <code>invoice_no</code>, <code>total_amount</code></li>
                <li>Recommended: <code>customer_id</code> or <code>customer_name</code> + <code>customer_email</code></li>
                <li>Optional: <code>invoice_date</code>, <code>due_date</code>, <code>tax_amount</code>, <code>status</code></li>
                <li>Company/Branch: use columns <code>company_id</code>, <code>branch_id</code> (fallback to defaults above).</li>
                <li>Payments (CSV): include <code>payment_amount</code>, <code>payment_method</code>, <code>payment_reference_no</code>, <code>payment_transaction_date</code>, <code>payment_bank_name</code>, <code>payment_account_number</code>, <code>payment_remarks</code>, <code>payment_direction</code> (inward/outward).</li>
                <li>Payments (JSON): include <code>payments</code> array with same fields plus optional <code>company_id</code>, <code>branch_id</code>.</li>
                <li>If <code>customer_id</code> is absent, we will try to match an existing customer by name/email, or create a new one.</li>
              </ul>
            </div>

            <div className="flex gap-3 items-center mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                onChange={onFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
              >
                <FiUpload size={16} /> Choose File
              </button>
              <span className="text-sm text-slate-500 truncate">{fileName || 'No file selected'}</span>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => downloadTemplate('csv')}
                className="text-sm text-blue-600 underline hover:text-blue-800"
              >
                Download CSV template
              </button>
              <button
                onClick={() => downloadTemplate('json')}
                className="text-sm text-blue-600 underline hover:text-blue-800"
              >
                Download JSON template
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            {parsedRows.length > 0 && (
              <div className="mb-4 max-h-64 overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      {Object.keys(parsedRows[0]).slice(0, 8).map(key => (
                        <th key={key} className="px-2 py-2 text-left text-xs font-medium text-slate-500">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-t">
                        {Object.values(row).slice(0, 8).map((value: any, i) => (
                          <td key={i} className="px-2 py-1 text-xs truncate max-w-[150px]">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 10 && (
                  <div className="text-xs text-slate-500 p-2">Showing first 10 of {parsedRows.length} rows</div>
                )}
              </div>
            )}

            {isImporting && (
              <div className="mb-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <FiLoader className="animate-spin" size={16} />
                  Importing... {importProgress.current}/{importProgress.total}
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                disabled={isImporting}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={parsedRows.length === 0 || isImporting}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isImporting ? 'Importing...' : 'Import Invoices'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

// ---------- Main Component ----------
export function InvoicesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    details: true,
    amounts: true,
    dates: true,
  });

  const [printInvoice, setPrintInvoice] = useState<any | null>(null);
  const printTriggered = useRef(false);

  const [isImportOpen, setIsImportOpen] = useState(false);

  const { showSuccess, showError } = useNotification();

  const {
    data: invoices,
    loading: invLoading,
    error: invError,
    refresh: refreshInvoices,
  } = useApiCache<Invoice[]>('invoices', () => apiClient.getInvoices());

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    let filtered = [...invoices];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(inv =>
        inv.invoice_no?.toLowerCase().includes(term) ||
        (inv.customer?.name || '').toLowerCase().includes(term) ||
        inv.status?.toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(inv => inv.status === filterStatus);
    }
    if (filterMonth) {
      filtered = filtered.filter(inv => {
        const dateStr = inv.invoice_date || inv.created_at;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return month === filterMonth;
      });
    }
    return filtered;
  }, [invoices, searchTerm, filterStatus, filterMonth]);

  const safeNum = (val: any) => {
    const n = typeof val === 'number' ? val : parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  const summary = useMemo(() => {
    if (!invoices) return { total: 0, paid: 0, pending: 0, overdue: 0, totalAmount: 0, paidAmount: 0, outstandingAmount: 0 };
    const total = invoices.length;
    const paid = invoices.filter(inv => inv.status === 'paid').length;
    const pending = invoices.filter(inv => inv.status === 'pending').length;
    const overdue = invoices.filter(inv => inv.status === 'overdue').length;
    const totalAmount = invoices.reduce((sum, inv) => sum + safeNum(inv.total_amount), 0);
    const paidAmount = invoices
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + safeNum(inv.total_amount), 0);
    const outstandingAmount = invoices
      .filter(inv => inv.status !== 'paid')
      .reduce((sum, inv) => sum + safeNum(inv.total_amount), 0);
    return { total, paid, pending, overdue, totalAmount, paidAmount, outstandingAmount };
  }, [invoices]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredInvoices.length / rowsPerPage);
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredInvoices.slice(start, start + rowsPerPage);
  }, [filteredInvoices, currentPage]);

  useEffect(() => setCurrentPage(1), [searchTerm, filterStatus, filterMonth]);

  const handlePrint = useCallback(async (invoice: Invoice) => {
    try {
      const res = await apiClient.getInvoice(invoice.id);
      const fullInvoice = (res as any).data ?? res;
      setPrintInvoice(fullInvoice);
      printTriggered.current = false;
    } catch (err: any) {
      showError('Print failed', err.message || 'Failed to load invoice details.');
    }
  }, [showError]);

  useEffect(() => {
    if (printInvoice && !printTriggered.current) {
      const timer = setTimeout(() => {
        window.print();
        printTriggered.current = true;
        setPrintInvoice(null);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [printInvoice]);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} invoice(s)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.deleteInvoice(id)));
      showSuccess('Bulk delete', `${selectedIds.length} invoice(s) deleted.`);
      addAppLog({
        module: 'Invoices',
        action: 'Bulk delete',
        status: 'success',
        message: `Deleted ${selectedIds.length} invoices`,
      });
      setSelectedIds([]);
      refreshInvoices();
    } catch (err: any) {
      showError('Bulk delete failed', err.message);
    }
  };

  const handleBulkStatusChange = async (status: 'paid' | 'pending' | 'overdue') => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Change ${selectedIds.length} invoice(s) to "${status}"?`)) return;
    try {
      await Promise.all(
        selectedIds.map(id =>
          apiClient.updateInvoice(id, { status } as Partial<Invoice>)
        )
      );
      showSuccess('Bulk update', `${selectedIds.length} invoice(s) updated.`);
      addAppLog({
        module: 'Invoices',
        action: 'Bulk status change',
        status: 'success',
        message: `Changed status to ${status} for ${selectedIds.length} invoices`,
      });
      setSelectedIds([]);
      refreshInvoices();
    } catch (err: any) {
      showError('Bulk update failed', err.message);
    }
  };

  const handleView = useCallback(async (invoice: Invoice) => {
    setViewingInvoice(invoice);
    setIsViewPanelOpen(true);

    try {
      const res = await apiClient.getInvoice(invoice.id);
      const fullInvoice = (res as any).data ?? res;
      setViewingInvoice(fullInvoice);
    } catch (err: any) {
      showError('View failed', err.message || 'Failed to load invoice details.');
    }
  }, [showError]);

  const handleDelete = useCallback(async (invoice: Invoice) => {
    if (!confirm(`Delete invoice ${invoice.invoice_no}?`)) return;
    try {
      await apiClient.deleteInvoice(invoice.id);
      showSuccess('Invoice deleted', `Invoice ${invoice.invoice_no} removed.`);
      addAppLog({
        module: 'Invoices',
        action: 'Delete invoice',
        status: 'success',
        message: `Deleted invoice ${invoice.invoice_no}`,
      });
      refreshInvoices();
    } catch (err: any) {
      showError('Delete failed', err.message);
    }
  }, [refreshInvoices, showError, showSuccess]);

  const handleDuplicateInvoice = useCallback(async (invoice: Invoice) => {
    try {
      if (typeof apiClient.duplicateInvoice === 'function') {
        await apiClient.duplicateInvoice(invoice.id);
        showSuccess('Duplicate', `Invoice ${invoice.invoice_no} duplicated.`);
        refreshInvoices();
      } else {
        showError('Not available', 'Duplicate feature is not yet integrated.');
      }
    } catch (err: any) {
      showError('Duplicate failed', err.message);
    }
  }, [refreshInvoices, showSuccess, showError]);

  const handleExport = useCallback(() => {
    if (filteredInvoices.length === 0) {
      showError('Export failed', 'No invoices to export.');
      return;
    }
    const headers = ['Invoice #', 'Customer', 'Total', 'Outstanding', 'Status', 'Invoice Date', 'Due Date'];
    const rows = filteredInvoices.map(inv => [
      escapeCsvField(inv.invoice_no),
      escapeCsvField(inv.customer?.name || '-'),
      escapeCsvField(safeNum(inv.total_amount).toFixed(2)),
      escapeCsvField(inv.status === 'paid' ? '0.00' : safeNum(inv.total_amount).toFixed(2)),
      escapeCsvField(inv.status),
      escapeCsvField(inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '-'),
      escapeCsvField(inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'),
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Invoices exported.');
  }, [filteredInvoices, showSuccess, showError]);

  const columns = useMemo(() => [
    {
      name: 'Invoice #',
      selector: (row: Invoice) => row.invoice_no,
      sortable: true,
      cell: (row: Invoice) => <span className="font-medium text-slate-800">{row.invoice_no}</span>,
      width: '140px',
    },
    {
      name: 'Customer',
      selector: (row: Invoice) => row.customer?.name || '-',
      sortable: true,
      cell: (row: Invoice) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            {(row.customer?.name || '?')[0]?.toUpperCase()}
          </div>
          <span className="text-sm">{row.customer?.name || '-'}</span>
        </div>
      ),
      width: '200px',
    },
    {
      name: 'Total',
      selector: (row: Invoice) => safeNum(row.total_amount),
      sortable: true,
      cell: (row: Invoice) => (
        <span className="font-medium">₹{safeNum(row.total_amount).toFixed(2)}</span>
      ),
      width: '120px',
    },
    {
      name: 'Outstanding',
      selector: (row: Invoice) => (row.status === 'paid' ? 0 : safeNum(row.total_amount)),
      sortable: true,
      cell: (row: Invoice) => {
        const outstanding = row.status === 'paid' ? 0 : safeNum(row.total_amount);
        return (
          <span className={`font-medium ${outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            ₹{outstanding.toFixed(2)}
          </span>
        );
      },
      width: '120px',
    },
    {
      name: 'Status',
      selector: (row: Invoice) => row.status,
      sortable: true,
      cell: (row: Invoice) => {
        const statusMap: Record<string, { label: string; color: string }> = {
          paid: { label: 'Paid', color: 'bg-emerald-100 text-emerald-700' },
          pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
          overdue: { label: 'Overdue', color: 'bg-rose-100 text-rose-700' },
          draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700' },
        };
        const s = statusMap[row.status] || statusMap.pending;
        return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>;
      },
      width: '110px',
    },
    {
      name: 'Invoice Date',
      selector: (row: Invoice) => row.invoice_date || '',
      cell: (row: Invoice) => (
        <span className="text-sm text-slate-600">
          {row.invoice_date ? new Date(row.invoice_date).toLocaleDateString() : '-'}
        </span>
      ),
      sortable: true,
      width: '120px',
    },
    {
      name: 'Due Date',
      selector: (row: Invoice) => row.due_date || '',
      cell: (row: Invoice) => (
        <span className="text-sm text-slate-600">
          {row.due_date ? new Date(row.due_date).toLocaleDateString() : '-'}
        </span>
      ),
      sortable: true,
      width: '120px',
    },
    {
      name: 'Actions',
      cell: (row: Invoice) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleView(row)}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            title="View details"
          >
            <FiEye size={16} />
          </button>
          <ActionDropdown
            row={row}
            onPrint={handlePrint}
            onDuplicate={handleDuplicateInvoice}
            onDelete={handleDelete}
          />
        </div>
      ),
      width: '120px',
    },
  ], [handleView, handleDelete, handlePrint, handleDuplicateInvoice]);

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Invoice Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiDollarSign className="text-cyan-300" /> Invoices
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Billing & Payments</span>
          </h1>
          <p className="text-sm text-slate-300">Track invoices, payments, and due dates</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshInvoices}
            disabled={invLoading}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60"
          >
            <FiRefreshCw className={invLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button
            onClick={handleExport}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20"
          >
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20"
          >
            <FiUpload className="inline mr-1" size={14} /> Import
          </button>
          <Link
            to="/invoices/create"
            className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium transition hover:bg-cyan-300 shadow-md shadow-cyan-500/20 inline-flex items-center"
          >
            <FiPlus className="mr-1" size={14} /> Create Invoice
          </Link>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by invoice #, customer or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all duration-200"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3 focus:ring-cyan-100"
          >
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
            <option value="draft">Draft</option>
          </select>
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="input-field w-44 text-sm rounded-xl border-slate-200 bg-white py-2 px-3 focus:ring-cyan-100"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {invoices ? (
          <>
            <StatCard icon={FiHash} label="Total Invoices" value={summary.total} tone="blue" />
            <StatCard icon={FiCheckCircle} label="Paid" value={summary.paid} tone="emerald" />
            <StatCard icon={FiClock} label="Pending" value={summary.pending} tone="amber" />
            <StatCard icon={FiAlertCircle} label="Overdue" value={summary.overdue} tone="rose" />
            <StatCard icon={FiDollarSign} label="Outstanding" value={summary.outstandingAmount.toFixed(2)} tone="slate" prefix="₹" />
            <StatCard icon={FiDollarSign} label="Total Amount" value={summary.totalAmount.toFixed(2)} tone="teal" prefix="₹" />
          </>
        ) : (
          [...Array(6)].map((_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {/* Error banner */}
      {invError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiAlertCircle size={20} /> {invError}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-4 flex flex-wrap items-center gap-3 animate-fadeIn">
          <span className="text-sm font-medium text-slate-700">{selectedIds.length} selected</span>
          <button
            onClick={() => handleBulkStatusChange('paid')}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
          >
            <FiCheckCircle size={16} /> Mark Paid
          </button>
          <button
            onClick={() => handleBulkStatusChange('pending')}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 transition-colors"
          >
            <FiMail size={16} /> Mark Pending
          </button>
          <button
            onClick={() => handleBulkStatusChange('overdue')}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600 transition-colors"
          >
            <FiMail size={16} /> Mark Overdue
          </button>
          <button
            onClick={handleBulkDelete}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 transition-colors"
          >
            <FiTrash2 size={16} /> Delete
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* Table wrapper */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <Suspense fallback={<TableSkeleton />}>
          {invLoading ? (
            <TableSkeleton />
          ) : (
            <>
              <ModernDataTable
                title="Invoices List"
                columns={columns}
                data={paginatedInvoices}
                loading={false}
                selectable
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                striped
                highlightOnHover
                pointerOnHover
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <span className="text-sm text-slate-600">
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredInvoices.length)} of {filteredInvoices.length}
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

      {/* View Invoice Offcanvas */}
      {isViewPanelOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl">Loading details...</div>
          </div>
        }>
          <Offcanvas
            isOpen={isViewPanelOpen}
            title={`Invoice ${viewingInvoice?.invoice_no || ''}`}
            onClose={() => setIsViewPanelOpen(false)}
            footer={
              <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
                <button onClick={() => setIsViewPanelOpen(false)} className="btn btn-secondary w-full sm:w-auto">
                  Close
                </button>
                {viewingInvoice && (
                  <Link
                    to={`/invoices/${viewingInvoice.id}`}
                    className="btn btn-primary w-full sm:w-auto"
                  >
                    View Full Details
                  </Link>
                )}
                {viewingInvoice && (
                  <button onClick={() => { handlePrint(viewingInvoice); setIsViewPanelOpen(false); }} className="btn btn-ghost w-full sm:w-auto">
                    <FiPrinter size={16} /> Print
                  </button>
                )}
              </div>
            }
          >
            {viewingInvoice && (
              <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                {(() => {
                  const toggleSection = (section: string) => {
                    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
                  };
                  const Section = ({ title, sectionKey, icon, children }: any) => (
                    <div className="border-b border-gray-200 pb-4 mb-4 last:border-0">
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionKey)}
                        className="flex items-center justify-between w-full text-left group"
                      >
                        <div className="flex items-center gap-2 text-base font-semibold text-gray-800">
                          {icon}
                          <span>{title}</span>
                        </div>
                        <span className="text-gray-400 group-hover:text-gray-600 transition-transform duration-200">
                          {expandedSections[sectionKey] ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
                        </span>
                      </button>
                      {expandedSections[sectionKey] && (
                        <div className="mt-4 space-y-4 animate-fadeIn">{children}</div>
                      )}
                    </div>
                  );

                  return (
                    <>
                      <Section title="Invoice Details" sectionKey="details" icon={<FiHash size={18} className="text-blue-500" />}>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Invoice #</label>
                            <div className="mt-1 text-gray-900 font-semibold">{viewingInvoice.invoice_no}</div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Status</label>
                            <div className="mt-1">
                              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                viewingInvoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                viewingInvoice.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                viewingInvoice.status === 'overdue' ? 'bg-rose-100 text-rose-700' :
                                'bg-slate-100 text-slate-700'
                              }`}>{viewingInvoice.status}</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Customer</label>
                            <div className="mt-1 text-gray-900">{viewingInvoice.customer?.name || '-'}</div>
                            {viewingInvoice.customer?.email && (
                              <div className="text-sm text-gray-500">{viewingInvoice.customer.email}</div>
                            )}
                          </div>
                        </div>
                      </Section>

                      <Section title="Amounts" sectionKey="amounts" icon={<FiDollarSign size={18} className="text-emerald-500" />}>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Total</label>
                            <div className="mt-1 text-gray-900 font-bold">₹{safeNum(viewingInvoice.total_amount).toFixed(2)}</div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Tax</label>
                            <div className="mt-1 text-gray-900">₹{safeNum(viewingInvoice.tax_amount).toFixed(2)}</div>
                          </div>
                        </div>
                      </Section>

                      <Section title="Dates" sectionKey="dates" icon={<FiCalendar size={18} className="text-purple-500" />}>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Invoice Date</label>
                            <div className="mt-1 text-gray-900">
                              {viewingInvoice.invoice_date ? new Date(viewingInvoice.invoice_date).toLocaleDateString() : '-'}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Due Date</label>
                            <div className="mt-1 text-gray-900">
                              {viewingInvoice.due_date ? new Date(viewingInvoice.due_date).toLocaleDateString() : '-'}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Created At</label>
                            <div className="mt-1 text-gray-900">
                              {viewingInvoice.created_at ? new Date(viewingInvoice.created_at).toLocaleString() : '-'}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Updated At</label>
                            <div className="mt-1 text-gray-900">
                              {viewingInvoice.updated_at ? new Date(viewingInvoice.updated_at).toLocaleString() : '-'}
                            </div>
                          </div>
                        </div>
                      </Section>
                    </>
                  );
                })()}
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {/* Print hidden component */}
      {printInvoice && (
        <InvoicePrint invoice={printInvoice} onReady={() => {}} />
      )}

      {/* Import Modal */}
      <InvoiceImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={refreshInvoices}
      />

      {/* Styles */}
      <style>{`
        .stat-card { animation: attendance-fade-up 0.38s ease-out both; }
        .stat-card:nth-child(2) { animation-delay: 0.05s; }
        .stat-card:nth-child(3) { animation-delay: 0.1s; }
        .stat-card:nth-child(4) { animation-delay: 0.15s; }
        .stat-card:nth-child(5) { animation-delay: 0.2s; }
        .stat-card:nth-child(6) { animation-delay: 0.25s; }
        @keyframes attendance-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .rdt_TableHeader .search-container,
        .rdt_TableHeader input[type="text"] { display: none !important; }
        .rdt_TableHeader > div:last-child { display: none !important; }
        .rdt_TableCol:first-child, .rdt_TableCell:first-child { display: none !important; }
        .rdt_Table { overflow: visible !important; }
        .rdt_TableBody { overflow: visible !important; }
      `}</style>
    </div>
  );
}

export default InvoicesPage;