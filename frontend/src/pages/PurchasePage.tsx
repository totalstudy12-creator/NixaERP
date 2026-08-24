// src/pages/PurchasePage.tsx
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
import ReactDOM from 'react-dom';
import {
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiDownload,
  FiEye,
  FiEdit,
  FiCheckCircle,
  FiAlertCircle,
  FiFilter,
  FiSearch,
  FiDollarSign,
  FiCalendar,
  FiClock,
  FiUser,
  FiHash,
  FiChevronDown,
  FiChevronRight,
  FiMail,
  FiPrinter,
  FiPackage,
  FiCreditCard,
  FiCopy,
  FiMoreVertical,
  FiFileText,
  FiUpload,
  FiX,
} from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import InvoicePrint from '../components/InvoicePrint';

// ---------- Lazy loaded heavy components ----------
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

// ---------- Types ----------
interface Supplier {
  id: number;
  name: string;
  email?: string;
}

interface PurchaseInvoice {
  id: number;
  purchase_number: string;
  bill_number?: string;
  supplier_id: number;
  supplier: Supplier;
  grand_total: number | string;
  paid_amount: number | string;
  status: string;
  payment_status: string;
  purchase_date: string;
  due_date: string | null;
  warehouse?: string;
  created_at?: string;
  updated_at?: string;
  items?: any[];
  payments?: any[];
  company_id?: number;
}

// ---------- Simple API Cache Hook (with cleanup) ----------
const cache = new Map<string, { data: any; timestamp: number }>();

function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 300_000
) {
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
      setError(err.message || 'Failed to load');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [key, fetcher, ttlMs]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

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

const StatCard = memo(
  ({
    icon: Icon,
    label,
    value,
    tone,
    prefix,
  }: {
    icon: any;
    label: string;
    value: string | number;
    tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal' | 'slate';
    prefix?: string;
  }) => {
    const bg =
      tone === 'blue'
        ? 'bg-blue-100 text-blue-600'
        : tone === 'emerald'
        ? 'bg-emerald-100 text-emerald-600'
        : tone === 'amber'
        ? 'bg-amber-100 text-amber-600'
        : tone === 'rose'
        ? 'bg-rose-100 text-rose-600'
        : tone === 'purple'
        ? 'bg-purple-100 text-purple-600'
        : tone === 'slate'
        ? 'bg-slate-100 text-slate-600'
        : 'bg-teal-100 text-teal-600';
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900">
            {prefix}
            {value}
          </p>
        </div>
      </div>
    );
  }
);

// ---------- Portal-based Action Dropdown ----------
const ActionDropdown = memo(
  ({
    row,
    onPrint,
    onRecordPayment,
    onDuplicate,
    onDelete,
  }: {
    row: PurchaseInvoice;
    onPrint: (p: PurchaseInvoice) => void;
    onRecordPayment: (p: PurchaseInvoice) => void;
    onDuplicate: (p: PurchaseInvoice) => void;
    onDelete: (p: PurchaseInvoice) => void;
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
              rect.bottom + 4 + 280 > viewportHeight
                ? rect.top - 4 - 280
                : rect.bottom + 4;
            setMenuStyle({
              position: 'fixed',
              left: rect.left,
              top: top,
              minWidth: 200,
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
          ReactDOM.createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="z-[9999] bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 animate-fadeIn"
            >
              <Link
                to={`/purchases/${row.id}/edit`}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                onClick={() => closeAndAct(() => {})}
              >
                <FiEdit size={16} className="text-slate-500" /> Edit
              </Link>

              <button
                onClick={() => closeAndAct(() => onDuplicate(row))}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <FiCopy size={16} className="text-slate-500" /> Duplicate
              </button>

              <div className="border-t border-slate-200 my-1"></div>

              <button
                onClick={() => closeAndAct(() => onPrint(row))}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <FiPrinter size={16} className="text-slate-500" /> Print
              </button>

              <button
                onClick={() => closeAndAct(() => onRecordPayment(row))}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <FiCreditCard size={16} className="text-slate-500" /> Record Payment
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

// ---------- CSV Parser ----------
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

// ---------- Purchase Import Modal ----------
const PurchaseImportModal = memo(
  ({ isOpen, onClose, onImported }: { isOpen: boolean; onClose: () => void; onImported: () => void }) => {
    const { showSuccess, showError } = useNotification();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
    const [fileName, setFileName] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);

    const [companies, setCompanies] = useState<any[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [defaultCompanyId, setDefaultCompanyId] = useState<string>('');
    const [defaultBranchId, setDefaultBranchId] = useState<string>('');
    const [loadingCompanies, setLoadingCompanies] = useState(false);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [loadingSuppliers, setLoadingSuppliers] = useState(false);

    useEffect(() => {
      if (isOpen) {
        setLoadingCompanies(true);
        setLoadingSuppliers(true);

        apiClient.getCompanies()
          .then((res: any) => {
            const list = Array.isArray(res) ? res : (res?.data ?? []);
            setCompanies(list);
            if (list.length > 0) setDefaultCompanyId(String(list[0].id));
          })
          .catch((err: any) => console.warn('Failed to load companies', err))
          .finally(() => setLoadingCompanies(false));

        apiClient.request('GET', '/suppliers')
          .then((res: any) => {
            const list = Array.isArray(res) ? res : (res?.data ?? []);
            setSuppliers(list);
          })
          .catch((err: any) => console.warn('Failed to load suppliers', err))
          .finally(() => setLoadingSuppliers(false));
      } else {
        setParsedRows([]);
        setFileName('');
        setError(null);
        setImportProgress({ current: 0, total: 0 });
        setCompanies([]);
        setBranches([]);
        setSuppliers([]);
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
          const list = Array.isArray(res) ? res : (res?.data ?? []);
          setBranches(list);
          if (list.length > 0) setDefaultBranchId(String(list[0].id));
          else setDefaultBranchId('');
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
            if (!Array.isArray(data)) throw new Error('JSON file must contain an array of purchase objects.');
            setParsedRows(data);
          } else if (extension === 'csv') {
            setParsedRows(parseCSV(text));
          } else {
            throw new Error('Unsupported file type. Please upload .csv or .json.');
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
        const csvContent = `purchase_number,supplier_id,supplier_name,supplier_email,purchase_date,due_date,grand_total,paid_amount,status,payment_status,warehouse,company_id,branch_id,payment_amount,payment_method,payment_reference,payment_date,payment_notes,payment_direction\nPO-2024-001,1,ABC Supplies,supplier@abc.com,2024-01-15,2024-02-15,1000.00,500.00,Ordered,Partial,Main Warehouse,1,1,500.00,Bank Transfer,REF001,2024-01-15,Partial payment,outward`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'purchase_template.csv';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const jsonData = [
          {
            purchase_number: 'PO-2024-001',
            supplier_id: 1,
            supplier_name: 'ABC Supplies',
            supplier_email: 'supplier@abc.com',
            purchase_date: '2024-01-15',
            due_date: '2024-02-15',
            grand_total: 1000.00,
            paid_amount: 500.00,
            status: 'Ordered',
            payment_status: 'Partial',
            warehouse: 'Main Warehouse',
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
                payment_method: 'Bank Transfer',
                reference: 'REF001',
                payment_date: '2024-01-15',
                notes: 'Partial payment',
                payment_direction: 'outward',
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
        a.download = 'purchase_template.json';
        a.click();
        URL.revokeObjectURL(url);
      }
    };

    const findOrCreateSupplier = async (row: Record<string, any>) => {
      if (row.supplier_id && !isNaN(Number(row.supplier_id))) return Number(row.supplier_id);
      if (row.supplier_name) {
        let allSuppliers = suppliers;
        if (allSuppliers.length === 0) {
          try {
            const res = await apiClient.request('GET', '/suppliers');
            allSuppliers = Array.isArray(res) ? res : (res?.data ?? []);
            setSuppliers(allSuppliers);
          } catch (err) {
            console.warn('Failed to fetch suppliers', err);
          }
        }
        const matched = allSuppliers.find(
          (s: any) =>
            (row.supplier_email && s.email?.toLowerCase() === row.supplier_email.toLowerCase()) ||
            s.name.toLowerCase() === row.supplier_name.toLowerCase()
        );
        if (matched) return matched.id;
        try {
          const newSupplier = await apiClient.request('POST', '/suppliers', {
            name: row.supplier_name,
            email: row.supplier_email || undefined,
            ...(row.supplier_phone && { contact_no: row.supplier_phone }),
            ...(row.supplier_address && { address: row.supplier_address }),
          });
          return newSupplier?.id ?? (newSupplier as any)?.data?.id;
        } catch (err) {
          console.warn('Supplier creation failed', err);
          return null;
        }
      }
      return null;
    };

    // Enhanced ID extraction
    const extractId = (obj: any): number | null => {
      if (!obj) return null;
      if (typeof obj === 'number') return obj;
      if (typeof obj === 'string' && /^\d+$/.test(obj)) return parseInt(obj, 10);
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const id = extractId(item);
          if (id) return id;
        }
        return null;
      }
      if (typeof obj === 'object') {
        // Check direct properties
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (val == null) continue;
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('id')) {
            if (typeof val === 'number') return val;
            if (typeof val === 'string' && /^\d+$/.test(val)) return parseInt(val, 10);
          }
        }
        // Recursively search nested objects and arrays
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (val && typeof val === 'object') {
            const id = extractId(val);
            if (id) return id;
          }
        }
      }
      return null;
    };

    // Fallback: wait and search for purchase by number
    const waitForPurchaseByNumber = async (purchaseNumber: string, retries = 3): Promise<number | null> => {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          // Try list endpoint
          const listRes = await apiClient.getPurchaseInvoices();
          const list = Array.isArray(listRes) ? listRes : (listRes as any)?.data ?? [];
          const match = list.find((p: any) => p.purchase_number === purchaseNumber);
          if (match?.id) return match.id;

          // Try search endpoint
          try {
            const searchRes = await apiClient.request('GET', `/purchases?search=${encodeURIComponent(purchaseNumber)}`);
            const searchData = Array.isArray(searchRes) ? searchRes : (searchRes as any)?.data ?? [];
            const searchMatch = searchData.find((p: any) => p.purchase_number === purchaseNumber);
            if (searchMatch?.id) return searchMatch.id;
          } catch {}

          // Wait before retrying
          if (attempt < retries - 1) {
            await new Promise(res => setTimeout(res, 500));
          }
        } catch (err) {
          console.warn('Fallback purchase lookup attempt failed:', err);
        }
      }
      return null;
    };

    const handleImport = async () => {
      if (parsedRows.length === 0) {
        setError('No data to import.');
        return;
      }

      const firstRow = parsedRows[0];
      const keys = Object.keys(firstRow).map(k => k.toLowerCase());
      const required = ['purchase_number', 'grand_total'];
      const missing = required.filter(f => !keys.includes(f));
      if (missing.length > 0) {
        setError(`Missing required columns: ${missing.join(', ')}`);
        return;
      }

      if (!defaultCompanyId) {
        setError('Please select a default company.');
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
          const supplierId = await findOrCreateSupplier(normalizedRow);
          if (!supplierId) throw new Error('Supplier not found and could not be created.');

          const companyId = normalizedRow.company_id ? Number(normalizedRow.company_id) : Number(defaultCompanyId);
          const branchId = normalizedRow.branch_id ? Number(normalizedRow.branch_id) : (defaultBranchId ? Number(defaultBranchId) : undefined);

          const grandTotal = parseFloat(normalizedRow.grand_total);
          const paidAmount = parseFloat(normalizedRow.paid_amount || '0');

          let status = normalizedRow.status || 'Ordered';
          let paymentStatus = normalizedRow.payment_status;
          if (!paymentStatus) {
            paymentStatus = paidAmount >= grandTotal ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
          }

          const payload: any = {
            purchase_number: normalizedRow.purchase_number,
            supplier_id: supplierId,
            purchase_date: normalizedRow.purchase_date || new Date().toISOString().split('T')[0],
            due_date: normalizedRow.due_date || null,
            grand_total: grandTotal,
            paid_amount: paidAmount,
            status: status,
            payment_status: paymentStatus,
            warehouse: normalizedRow.warehouse || undefined,
            company_id: companyId,
            branch_id: branchId,
            bill_number: normalizedRow.bill_number || undefined,
            supplier_address: normalizedRow.supplier_address || undefined,
            contact_person: normalizedRow.contact_person || undefined,
            phone_no: normalizedRow.phone_no || undefined,
            gstin: normalizedRow.gstin || undefined,
            pan: normalizedRow.pan || undefined,
            reverse_charge: normalizedRow.reverse_charge ? Boolean(normalizedRow.reverse_charge) : undefined,
            ship_to: normalizedRow.ship_to || undefined,
            place_of_supply: normalizedRow.place_of_supply || undefined,
            challan_no: normalizedRow.challan_no || undefined,
            challan_date: normalizedRow.challan_date || undefined,
            po_no: normalizedRow.po_no || undefined,
            po_date: normalizedRow.po_date || undefined,
            lr_no: normalizedRow.lr_no || undefined,
            eway_no: normalizedRow.eway_no || undefined,
            delivery_mode: normalizedRow.delivery_mode || undefined,
            payment_type: normalizedRow.payment_type || undefined,
            payment_term: normalizedRow.payment_term || undefined,
            bank_id: normalizedRow.bank_id ? Number(normalizedRow.bank_id) : undefined,
            packing_charges: normalizedRow.packing_charges ? Number(normalizedRow.packing_charges) : 0,
            general_discount_percent: normalizedRow.general_discount_percent ? Number(normalizedRow.general_discount_percent) : 0,
            general_discount_amount: normalizedRow.general_discount_amount ? Number(normalizedRow.general_discount_amount) : 0,
            tcs_percent: normalizedRow.tcs_percent ? Number(normalizedRow.tcs_percent) : 0,
            round_off: normalizedRow.round_off ? Number(normalizedRow.round_off) : 0,
            terms_title: normalizedRow.terms_title || undefined,
            terms_detail: normalizedRow.terms_detail || undefined,
            document_note: normalizedRow.document_note || undefined,
            internal_note: normalizedRow.internal_note || undefined,
            additional_charges: normalizedRow.additional_charges || [],
            total_amount: normalizedRow.total_amount || grandTotal,
            tax_amount: normalizedRow.tax_amount ? Number(normalizedRow.tax_amount) : 0,
            discount_amount: normalizedRow.discount_amount ? Number(normalizedRow.discount_amount) : 0,
          };

          Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

          if (Array.isArray(normalizedRow.items)) {
            payload.items = normalizedRow.items.map((item: any) => ({
              product_id: Number(item.product_id),
              product_name: item.product_name || '',
              hsn_sac_code: item.hsn_sac_code || '',
              unit: item.unit || 'PCS',
              quantity: Number(item.quantity || 1),
              purchase_price: Number(item.purchase_price || item.unit_price || 0),
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
              total: Number(item.total || (item.quantity * item.purchase_price)),
            }));
          } else {
            payload.items = [];
          }

          // Attempt to create purchase invoice
          let newPurchaseResponse: any;
          if (typeof (apiClient as any).createPurchaseInvoice === 'function') {
            newPurchaseResponse = await (apiClient as any).createPurchaseInvoice(payload);
          } else {
            newPurchaseResponse = await apiClient.request('POST', '/purchases', payload);
          }

          let newPurchaseId = extractId(newPurchaseResponse);

          // If not found, try fallback with retries
          if (!newPurchaseId) {
            newPurchaseId = await waitForPurchaseByNumber(normalizedRow.purchase_number);
          }

          if (!newPurchaseId) {
            console.error('Purchase creation response:', newPurchaseResponse);
            throw new Error(`Purchase created but could not retrieve ID. Please check the server response.`);
          }

          const paymentsToCreate: any[] = [];
          if (Array.isArray(normalizedRow.payments)) {
            normalizedRow.payments.forEach((payment: any) => {
              paymentsToCreate.push({
                amount: Number(payment.amount),
                payment_method: payment.payment_method || 'bank_transfer',
                reference_no: payment.reference_no || payment.reference || `PAY-${newPurchaseId}-${paymentsToCreate.length + 1}`,
                payment_date: payment.payment_date || new Date().toISOString().split('T')[0],
                bank_name: payment.bank_name || '',
                account_number: payment.account_number || '',
                remarks: payment.notes || payment.remarks || '',
                payment_direction: payment.payment_direction || 'outward',
                company_id: payment.company_id ? Number(payment.company_id) : companyId,
                branch_id: payment.branch_id ? Number(payment.branch_id) : branchId,
              });
            });
          } else {
            const paymentAmount = parseFloat(normalizedRow.payment_amount || '0');
            if (paymentAmount > 0) {
              paymentsToCreate.push({
                amount: paymentAmount,
                payment_method: normalizedRow.payment_method || 'bank_transfer',
                reference_no: normalizedRow.payment_reference || normalizedRow.payment_reference_no || `PAY-${newPurchaseId}-1`,
                payment_date: normalizedRow.payment_date || new Date().toISOString().split('T')[0],
                bank_name: normalizedRow.payment_bank_name || '',
                account_number: normalizedRow.payment_account_number || '',
                remarks: normalizedRow.payment_notes || normalizedRow.payment_remarks || '',
                payment_direction: normalizedRow.payment_direction || 'outward',
                company_id: normalizedRow.payment_company_id ? Number(normalizedRow.payment_company_id) : companyId,
                branch_id: normalizedRow.payment_branch_id ? Number(normalizedRow.payment_branch_id) : branchId,
              });
            }
          }

          if (paymentsToCreate.length > 0) {
            for (const payment of paymentsToCreate) {
              await apiClient.request('POST', '/payments', {
                company_id: payment.company_id,
                invoice_id: newPurchaseId,
                reference_no: payment.reference_no,
                amount: payment.amount,
                payment_method: payment.payment_method,
                status: 'completed',
                payment_direction: payment.payment_direction,
                transaction_date: payment.payment_date,
                bank_name: payment.bank_name,
                account_number: payment.account_number,
                ledger_reference: payment.reference_no,
                remarks: payment.remarks,
                ...(payment.branch_id && { branch_id: payment.branch_id }),
              });
            }
          }

          successCount++;
        } catch (err: any) {
          errors.push(`Row ${i + 1}: ${err.message}`);
        }
        setImportProgress({ current: i + 1, total: parsedRows.length });
      }

      setIsImporting(false);
      if (successCount > 0) {
        showSuccess('Import completed', `${successCount} purchase(s) created.`);
        addAppLog({
          module: 'Purchases',
          action: 'Import',
          status: 'success',
          message: `Imported ${successCount} purchases from ${fileName}`,
        });
        onImported();
      }
      if (errors.length > 0) {
        showError('Some rows failed', errors.slice(0, 5).join('; '));
        setError(errors.slice(0, 5).join('; '));
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
              <h2 className="text-xl font-bold text-slate-800">Import Purchases</h2>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
                <FiX size={20} />
              </button>
            </div>

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
                {loadingCompanies && <FiRefreshCw className="animate-spin inline ml-2" size={14} />}
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
                {loadingBranches && <FiRefreshCw className="animate-spin inline ml-2" size={14} />}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 mb-4 text-sm text-slate-600">
              <p className="font-medium mb-2">File format requirements:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>CSV or JSON file.</li>
                <li>CSV: first row must be headers (case‑insensitive).</li>
                <li>Required columns: <code>purchase_number</code>, <code>grand_total</code></li>
                <li>Supplier: <code>supplier_id</code> or <code>supplier_name</code> + <code>supplier_email</code></li>
                <li>Optional: <code>purchase_date</code>, <code>due_date</code>, <code>paid_amount</code>, <code>status</code>, <code>payment_status</code>, <code>warehouse</code>, <code>supplier_address</code>, <code>gstin</code>, etc.</li>
                <li>Company/Branch: <code>company_id</code>, <code>branch_id</code> (fallback to defaults).</li>
                <li>Payments (CSV): <code>payment_amount</code>, <code>payment_method</code>, <code>payment_reference</code>, <code>payment_date</code>, <code>payment_notes</code>, <code>payment_direction</code> (inward/outward, default outward).</li>
                <li>Payments (JSON): <code>payments</code> array with same fields; <code>payment_direction</code> can be set.</li>
                <li>Items are only supported in JSON via <code>items</code> array.</li>
                <li>If <code>supplier_id</code> is absent, we will try to match an existing supplier by name/email, or create a new one.</li>
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
                  <FiRefreshCw className="animate-spin" size={16} />
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
                {isImporting ? 'Importing...' : 'Import Purchases'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

// ---------- Main Component ----------
export function PurchasePage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseInvoice | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [printInvoice, setPrintInvoice] = useState<PurchaseInvoice | null>(null);
  const printTriggered = useRef(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payingPurchase, setPayingPurchase] = useState<PurchaseInvoice | null>(null);
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payDirection, setPayDirection] = useState<'inward' | 'outward'>('outward');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);

  const [companies, setCompanies] = useState<any[]>([]);
  useEffect(() => {
    apiClient.getCompanies()
      .then((res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setCompanies(list);
      })
      .catch(() => {});
  }, []);

  const {
    data: purchases,
    loading,
    error,
    refresh,
  } = useApiCache<PurchaseInvoice[]>('purchase-invoices', () => apiClient.getPurchaseInvoices());

  const filteredPurchases = useMemo(() => {
    if (!purchases) return [];
    let filtered = [...purchases];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.purchase_number?.toLowerCase().includes(term) ||
          (p.supplier?.name || '').toLowerCase().includes(term) ||
          p.status?.toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(p => p.status === filterStatus);
    }
    if (filterMonth) {
      filtered = filtered.filter(p => p.purchase_date?.startsWith(filterMonth));
    }
    return filtered;
  }, [purchases, searchTerm, filterStatus, filterMonth]);

  const safeNum = (val: any) => {
    const n = typeof val === 'number' ? val : parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  const summary = useMemo(() => {
    if (!purchases) return { total: 0, totalAmount: 0, paidAmount: 0, outstanding: 0 };
    const total = purchases.length;
    const totalAmount = purchases.reduce((s, p) => s + safeNum(p.grand_total), 0);
    const paidAmount = purchases.reduce((s, p) => s + safeNum(p.paid_amount), 0);
    const outstanding = totalAmount - paidAmount;
    return { total, totalAmount, paidAmount, outstanding };
  }, [purchases]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredPurchases.length / rowsPerPage);
  const paginatedPurchases = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredPurchases.slice(start, start + rowsPerPage);
  }, [filteredPurchases, currentPage]);

  useEffect(() => setCurrentPage(1), [searchTerm, filterStatus, filterMonth]);

  const handlePrint = useCallback((invoice: PurchaseInvoice) => {
    setPrintInvoice(invoice);
    printTriggered.current = false;
  }, []);

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
    if (!confirm(`Delete ${selectedIds.length} purchase(s)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.deletePurchaseInvoice(id)));
      showSuccess('Bulk delete', `${selectedIds.length} purchase(s) deleted.`);
      addAppLog({ module: 'Purchases', action: 'Bulk delete', status: 'success', message: `Deleted ${selectedIds.length} purchases` });
      startTransition(() => setSelectedIds([]));
      refresh();
    } catch (err: any) {
      showError('Bulk delete failed', err.message);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Change ${selectedIds.length} purchase(s) to "${status}"?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.updatePurchaseInvoice(id, { status } as any)));
      showSuccess('Bulk update', `${selectedIds.length} purchase(s) updated.`);
      addAppLog({ module: 'Purchases', action: 'Bulk status change', status: 'success', message: `Changed status to ${status} for ${selectedIds.length} purchases` });
      startTransition(() => setSelectedIds([]));
      refresh();
    } catch (err: any) {
      showError('Bulk update failed', err.message);
    }
  };

  const handleView = useCallback((purchase: PurchaseInvoice) => {
    setViewingPurchase(purchase);
    setIsViewPanelOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (purchase: PurchaseInvoice) => {
      if (!confirm(`Delete purchase ${purchase.purchase_number}?`)) return;
      try {
        await apiClient.deletePurchaseInvoice(purchase.id);
        showSuccess('Purchase deleted', `Purchase ${purchase.purchase_number} removed.`);
        addAppLog({ module: 'Purchases', action: 'Delete', status: 'success', message: `Deleted ${purchase.purchase_number}` });
        refresh();
      } catch (err: any) {
        showError('Delete failed', err.message);
      }
    },
    [refresh, showSuccess, showError]
  );

  const handleDuplicate = useCallback(
    async (purchase: PurchaseInvoice) => {
      showError('Not available', 'Duplicate feature is not yet integrated.');
    },
    [showError]
  );

  const handleRecordPaymentTrigger = useCallback((purchase: PurchaseInvoice) => {
    setPayingPurchase(purchase);
    setPayAmt('');
    setPayMethod('Bank Transfer');
    setPayDirection('outward');
    setShowPaymentModal(true);
  }, []);

  const handleRecordPaymentSubmit = async () => {
    if (!payingPurchase) return;
    const amount = parseFloat(payAmt);
    if (isNaN(amount) || amount <= 0) {
      showError('Validation', 'Please enter a valid amount.');
      return;
    }
    setPaySubmitting(true);
    try {
      const companyId = payingPurchase.company_id || (companies[0]?.id ?? 1);
      await apiClient.request('POST', '/payments', {
        company_id: companyId,
        invoice_id: payingPurchase.id,
        reference_no: `PAY-${payingPurchase.id}-${Date.now()}`,
        amount,
        payment_method: payMethod.toLowerCase().replace(' ', '_'),
        status: 'completed',
        payment_direction: payDirection,
        transaction_date: new Date().toISOString().split('T')[0],
        bank_name: '',
        account_number: '',
        ledger_reference: `PAY-${payingPurchase.id}-${Date.now()}`,
        remarks: '',
      });
      showSuccess('Payment recorded', `₹${amount.toFixed(2)} paid.`);
      addAppLog({
        module: 'Purchases',
        action: 'Record Payment',
        status: 'success',
        message: `Payment of ₹${amount} for ${payingPurchase.purchase_number}`,
      });
      setShowPaymentModal(false);
      setPayingPurchase(null);
      refresh();
    } catch (err: any) {
      showError('Payment failed', err.message);
    } finally {
      setPaySubmitting(false);
    }
  };

  const escapeCsvField = (value: string) => {
    if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
    return value;
  };

  const handleExport = useCallback(() => {
    if (filteredPurchases.length === 0) {
      showError('Export failed', 'No data');
      return;
    }
    const headers = ['Purchase #', 'Supplier', 'Date', 'Total', 'Paid', 'Outstanding', 'Status', 'Payment'];
    const rows = filteredPurchases.map(p =>
      [
        escapeCsvField(p.purchase_number),
        escapeCsvField(p.supplier?.name || ''),
        p.purchase_date,
        safeNum(p.grand_total).toFixed(2),
        safeNum(p.paid_amount).toFixed(2),
        (safeNum(p.grand_total) - safeNum(p.paid_amount)).toFixed(2),
        p.status,
        p.payment_status,
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchases-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'File downloaded.');
  }, [filteredPurchases, showSuccess, showError]);

  const columns = useMemo(
    () => [
      {
        name: 'Purchase #',
        selector: (row: PurchaseInvoice) => row.purchase_number,
        sortable: true,
        cell: (row: PurchaseInvoice) => (
          <span className="font-medium text-blue-700">{row.purchase_number}</span>
        ),
        width: '140px',
      },
      {
        name: 'Supplier',
        selector: (row: PurchaseInvoice) => row.supplier?.name || '-',
        cell: (row: PurchaseInvoice) => (
          <span className="text-sm">{row.supplier?.name || '-'}</span>
        ),
        width: '180px',
      },
      {
        name: 'Date',
        selector: (row: PurchaseInvoice) => row.purchase_date,
        sortable: true,
        width: '100px',
      },
      {
        name: 'Total',
        selector: (row: PurchaseInvoice) => safeNum(row.grand_total),
        sortable: true,
        cell: (row: PurchaseInvoice) => (
          <span className="font-medium">₹{safeNum(row.grand_total).toFixed(2)}</span>
        ),
        width: '120px',
      },
      {
        name: 'Outstanding',
        selector: (row: PurchaseInvoice) => safeNum(row.grand_total) - safeNum(row.paid_amount),
        sortable: true,
        cell: (row: PurchaseInvoice) => {
          const out = safeNum(row.grand_total) - safeNum(row.paid_amount);
          return (
            <span className={`font-medium ${out > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              ₹{out.toFixed(2)}
            </span>
          );
        },
        width: '120px',
      },
      {
        name: 'Status',
        selector: (row: PurchaseInvoice) => row.status,
        cell: (row: PurchaseInvoice) => {
          const colors: Record<string, string> = {
            Draft: 'bg-slate-100 text-slate-600',
            Ordered: 'bg-indigo-100 text-indigo-700',
            Received: 'bg-cyan-100 text-cyan-700',
            Completed: 'bg-emerald-100 text-emerald-700',
            Cancelled: 'bg-rose-100 text-rose-700',
          };
          return (
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[row.status] || 'bg-slate-100'}`}
            >
              {row.status}
            </span>
          );
        },
        width: '120px',
      },
      {
        name: 'Payment',
        selector: (row: PurchaseInvoice) => row.payment_status,
        cell: (row: PurchaseInvoice) => {
          const paid = row.payment_status === 'Paid';
          return (
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                paid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {row.payment_status}
            </span>
          );
        },
        width: '100px',
      },
      {
        name: 'Actions',
        cell: (row: PurchaseInvoice) => (
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
              onRecordPayment={handleRecordPaymentTrigger}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          </div>
        ),
        width: '120px',
      },
    ],
    [handleView, handleDelete, handleDuplicate, handlePrint, handleRecordPaymentTrigger]
  );

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow text-center max-w-md">
          <FiAlertCircle size={48} className="mx-auto text-rose-500" />
          <h2 className="text-xl font-bold mt-4">Failed to load purchases</h2>
          <p className="text-slate-600 mt-2">{error}</p>
          <button
            onClick={refresh}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Purchase Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiPackage className="text-cyan-300" /> Purchases
          </h1>
          <p className="text-sm text-slate-300">Procurement & supplier payments</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-60 transition-colors"
          >
            <FiRefreshCw className={loading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button
            onClick={handleExport}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 transition-colors"
          >
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 transition-colors"
          >
            <FiUpload className="inline mr-1" size={14} /> Import
          </button>
          <Link
            to="/purchases/create"
            className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-cyan-300 shadow-md inline-flex items-center transition-colors"
          >
            <FiPlus className="mr-1" size={14} /> Create Purchase
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by purchase #, supplier..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all duration-200"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-36 text-sm rounded-xl border-slate-200 bg-white py-2 px-3 focus:ring-cyan-100"
          >
            <option value="all">All Status</option>
            <option value="Draft">Draft</option>
            <option value="Ordered">Ordered</option>
            <option value="Received">Received</option>
            <option value="Completed">Completed</option>
          </select>
          <input
            type="month"
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="w-44 text-sm rounded-xl border-slate-200 bg-white py-2 px-3 focus:ring-cyan-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {purchases ? (
          <>
            <StatCard icon={FiPackage} label="Total Purchases" value={summary.total} tone="blue" />
            <StatCard icon={FiDollarSign} label="Total Amount" value={summary.totalAmount.toFixed(2)} tone="teal" prefix="₹" />
            <StatCard icon={FiCheckCircle} label="Paid" value={summary.paidAmount.toFixed(2)} tone="emerald" prefix="₹" />
            <StatCard icon={FiAlertCircle} label="Outstanding" value={summary.outstanding.toFixed(2)} tone="rose" prefix="₹" />
          </>
        ) : (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="bg-white p-3 rounded-xl shadow-sm border mb-4 flex flex-wrap items-center gap-3 animate-fadeIn">
          <span className="text-sm font-medium text-slate-700">{selectedIds.length} selected</span>
          <button
            onClick={() => handleBulkStatusChange('Received')}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600 transition-colors"
          >
            <FiCheckCircle size={16} /> Mark Received
          </button>
          <button
            onClick={handleBulkDelete}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600 transition-colors"
          >
            <FiTrash2 size={16} /> Delete
          </button>
          <button
            onClick={() => startTransition(() => setSelectedIds([]))}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <Suspense fallback={<TableSkeleton />}>
          {loading ? (
            <TableSkeleton />
          ) : (
            <ModernDataTable
              title="Purchase Orders"
              columns={columns}
              data={paginatedPurchases}
              loading={false}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={(ids: number[]) => startTransition(() => setSelectedIds(ids))}
              striped
              highlightOnHover
              pointerOnHover
            />
          )}
        </Suspense>
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t">
            <span className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => startTransition(() => setCurrentPage(1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40"
              >
                ««
              </button>
              <button
                onClick={() => startTransition(() => setCurrentPage(p => Math.max(1, p - 1)))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40"
              >
                ‹
              </button>
              <span className="px-3 py-1 text-sm font-medium">
                {currentPage}/{totalPages}
              </span>
              <button
                onClick={() =>
                  startTransition(() => setCurrentPage(p => Math.min(totalPages, p + 1)))
                }
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40"
              >
                ›
              </button>
              <button
                onClick={() => startTransition(() => setCurrentPage(totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40"
              >
                »»
              </button>
            </div>
          </div>
        )}
      </div>

      {isViewPanelOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
              <div className="bg-white p-8 rounded-2xl">Loading details...</div>
            </div>
          }
        >
          <Offcanvas
            isOpen={isViewPanelOpen}
            title={`Purchase ${viewingPurchase?.purchase_number || ''}`}
            onClose={() => setIsViewPanelOpen(false)}
          >
            {viewingPurchase && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">{viewingPurchase.purchase_number}</h3>
                  <p className="text-sm text-slate-500">{viewingPurchase.supplier?.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Date</p>
                    <p>{viewingPurchase.purchase_date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Due Date</p>
                    <p>{viewingPurchase.due_date || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Grand Total</p>
                    <p className="font-bold">₹{safeNum(viewingPurchase.grand_total).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Paid</p>
                    <p>₹{safeNum(viewingPurchase.paid_amount).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {showPaymentModal && payingPurchase && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Record Payment</h3>
            <p className="text-sm mb-4">
              For {payingPurchase.purchase_number} - {payingPurchase.supplier?.name}
            </p>
            <div className="space-y-3">
              <input
                type="number"
                value={payAmt}
                onChange={e => setPayAmt(e.target.value)}
                placeholder="Amount"
                className="w-full rounded-lg border px-3 py-2"
              />
              <select
                value={payMethod}
                onChange={e => setPayMethod(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>UPI</option>
              </select>
              <select
                value={payDirection}
                onChange={e => setPayDirection(e.target.value as 'inward' | 'outward')}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="outward">Outward (Payment to Supplier)</option>
                <option value="inward">Inward (Refund/Receipt)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowPaymentModal(false)}
                disabled={paySubmitting}
                className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPaymentSubmit}
                disabled={paySubmitting}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-60 transition-colors flex items-center gap-2"
              >
                {paySubmitting && <FiRefreshCw className="animate-spin" size={14} />}
                Save Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {printInvoice && (
        <InvoicePrint
          invoice={{
            ...printInvoice,
            invoice_no: printInvoice.purchase_number,
            customer: printInvoice.supplier,
            total_amount: printInvoice.grand_total,
            tax_amount: 0,
            items: printInvoice.items ?? [],
          }}
          onReady={() => {}}
        />
      )}

      <PurchaseImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={refresh}
      />

      <style>{`
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .rdt_TableHeader .search-container,
        .rdt_TableHeader input[type="text"] { display: none !important; }
        .rdt_TableHeader > div:last-child { display: none !important; }
        .rdt_TableCol:first-child,
        .rdt_TableCell:first-child { display: none !important; }
      `}</style>
    </div>
  );
}