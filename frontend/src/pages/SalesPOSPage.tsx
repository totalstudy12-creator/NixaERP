// src/pages/SalesPOSPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  FiDollarSign,
  FiMail,
  FiMinus,
  FiPackage,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiShoppingCart,
  FiUser,
  FiAlertCircle,
  FiLock,
  FiLoader,
  FiTrash2,
} from 'react-icons/fi';
import { useNotification } from '../components/NotificationContext';
import { apiClient } from '../api';
import { addAppLog } from '../services/appLogger';
import { useAuthStore } from '../store/auth';

/* ------------------------------------------------------------------ */
/* RBAC — Permission keys                                              */
/* ------------------------------------------------------------------ */

const PERMISSIONS = {
  POS_VIEW: 'pos.view',
  POS_CREATE_SALE: 'pos.create_sale',
  POS_HOLD_SALE: 'pos.hold_sale',
  POS_RESUME_SALE: 'pos.resume_sale',
  POS_APPLY_DISCOUNT: 'pos.apply_discount',
  POS_EMAIL_RECEIPT: 'pos.email_receipt',
  POS_VIEW_HISTORY: 'pos.view_history',
} as const;

type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/* ------------------------------------------------------------------ */
/* RBAC — Store-backed permissions (admin-aware + notation-insensitive) */
/* ------------------------------------------------------------------ */

/**
 * Collapse a permission key so different notations of the SAME permission
 * match each other:
 *
 *   "pos.create_sale"        → "create pos sale"
 *   "create sale"            → "create sale"
 *   "pos:create_sale"        → "create pos sale"
 *   "create pos sale"        → "create pos sale"
 */
function normalisePermission(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.:_/\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

interface UsePagePermissionsResult {
  can: (permission: string | string[]) => boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  loadingUser: boolean;
}

function usePagePermissions(): UsePagePermissionsResult {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const storeIsSuperAdmin = useAuthStore((s) => s.isSuperAdmin);
  const storeHasAnyPermission = useAuthStore((s) => s.hasAnyPermission);

  const isSuperAdmin = useMemo(() => storeIsSuperAdmin(), [storeIsSuperAdmin, user]);

  const can = useCallback(
    (permission: string | string[]): boolean => {
      if (!isAuthenticated) return false;
      if (isSuperAdmin) return true;

      const keys = Array.isArray(permission) ? permission : [permission];

      if (storeHasAnyPermission(keys)) return true;

      const hasMetadata =
        (user?.permission_names?.length ?? 0) > 0 ||
        (user?.permissions?.length ?? 0) > 0 ||
        (user?.roles?.length ?? 0) > 0 ||
        (user?.role_names?.length ?? 0) > 0;
      if (!hasMetadata) return false;

      const normalised = new Set<string>();
      (user?.permission_names ?? []).forEach((p) =>
        normalised.add(normalisePermission(p)),
      );
      (user?.permissions ?? []).forEach((p) =>
        normalised.add(normalisePermission(p.name)),
      );

      return keys.some((k) => normalised.has(normalisePermission(k)));
    },
    [isAuthenticated, isSuperAdmin, storeHasAnyPermission, user],
  );

  return { can, isAuthenticated, isSuperAdmin, loadingUser };
}

/* ------------------------------------------------------------------ */
/* Access-restricted screen                                            */
/* ------------------------------------------------------------------ */

function AccessRestricted() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
          <FiLock size={26} />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Access restricted</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Your account does not have permission to use the POS. Contact your
          administrator to request the{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">
            pos.view
          </code>{' '}
          permission.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Product {
  id: number;
  name: string;
  sku: string;
  price: number;
  stock: number;
  category: string;
}

interface CartItem extends Product {
  quantity: number;
}

interface SaleRecord {
  id: number;
  customer: string;
  total: number;
  status: string;
  paymentMethod: string;
  time: string;
  created_at?: string;
}

interface HeldSale {
  id: number;
  customer: string;
  items: CartItem[];
  total: number;
  created_at?: string;
}

interface AppLogEntry {
  module: string;
  action: string;
  status: 'success' | 'error' | 'info';
  message: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const currency = (value: number) =>
  `₹ ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const toNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const safeLog = (entry: AppLogEntry): void => {
  try {
    addAppLog(entry);
  } catch {
    /* no-op */
  }
};

const errorMessage = (error: unknown, fallback: string): string => {
  const err = error as any;
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.backendMessage ||
    err?.message ||
    fallback
  );
};

function unwrapList<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  const data = (response as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as T[];
  return [];
}

/* ------------------------------------------------------------------ */
/* Cached fetch hook                                                   */
/* ------------------------------------------------------------------ */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 60_000,
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
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(
    async (skipCache = false) => {
      if (!skipCache) {
        const entry = cache.get(key);
        if (entry && Date.now() - entry.timestamp < ttlMs) {
          if (!mountedRef.current) return;
          setData(entry.data as T);
          setLoading(false);
          setError(null);
          return;
        }
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetcherRef.current();
        if (!mountedRef.current) return;
        cache.set(key, { data: res, timestamp: Date.now() });
        setData(res);
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        setError(errorMessage(err, 'Failed to load data.'));
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [key, ttlMs],
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refresh = useCallback(async () => {
    cache.delete(key);
    await fetchData(true);
  }, [fetchData, key]);

  return { data, loading, error, refresh };
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 px-4 py-6">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function SalesPOSPage() {
  const { showSuccess, showError } = useNotification();
  const { can, isAuthenticated, loadingUser } = usePagePermissions();

  const canView          = can(PERMISSIONS.POS_VIEW);
  const canCreateSale    = can(PERMISSIONS.POS_CREATE_SALE);
  const canHoldSale      = can(PERMISSIONS.POS_HOLD_SALE);
  const canResumeSale    = can(PERMISSIONS.POS_RESUME_SALE);
  const canApplyDiscount = can(PERMISSIONS.POS_APPLY_DISCOUNT);
  const canEmailReceipt  = can(PERMISSIONS.POS_EMAIL_RECEIPT);
  const canViewHistory   = can(PERMISSIONS.POS_VIEW_HISTORY);

  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState('0');
  const [taxRate, setTaxRate] = useState('18');
  const [coupon, setCoupon] = useState('');
  const [paymentMethods, setPaymentMethods] = useState({
    cash: '',
    card: '',
    upi: '',
    bank: '',
  });
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [holdingSale, setHoldingSale] = useState(false);
  const [resumingId, setResumingId] = useState<number | null>(null);

  /* ---------- Real data from backend ---------- */

  const {
    data: rawProducts,
    loading: productsLoading,
    error: productsError,
    refresh: refreshProducts,
  } = useApiCache<unknown>('pos-products', () => apiClient.request('GET', '/products'));

  const {
    data: rawSales,
    loading: salesLoading,
    error: salesError,
    refresh: refreshSales,
  } = useApiCache<unknown>('pos-sales', () => apiClient.request('GET', '/sales'));

  const {
    data: rawHeld,
    loading: heldLoading,
    error: heldError,
    refresh: refreshHeld,
  } = useApiCache<unknown>('pos-held-sales', () => apiClient.request('GET', '/sales/held'));

  const products: Product[] = useMemo(() => {
    return unwrapList<Record<string, unknown>>(rawProducts).map((p) => ({
      id: toNumber(p.id),
      name: String(p.name ?? ''),
      sku: String(p.sku ?? p.code ?? ''),
      price: toNumber(p.price ?? p.selling_price ?? p.mrp),
      stock: toNumber(p.stock ?? p.quantity ?? p.stock_qty),
      category: String(p.category ?? p.category_name ?? '—'),
    }));
  }, [rawProducts]);

  const salesHistory: SaleRecord[] = useMemo(() => {
    return unwrapList<Record<string, unknown>>(rawSales).map((s) => {
      const createdAt = String(s.created_at ?? s.date ?? '');
      const displayTime = createdAt
        ? new Date(createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      return {
        id: toNumber(s.id),
        customer: String(
          (s.customer as { name?: string } | undefined)?.name ?? s.customer_name ?? 'Walk-in',
        ),
        total: toNumber(s.total ?? s.grand_total),
        status: String(s.status ?? 'Completed'),
        paymentMethod: String(s.payment_method ?? s.paymentMethod ?? '—'),
        time: displayTime,
        created_at: createdAt,
      };
    });
  }, [rawSales]);

  const heldSales: HeldSale[] = useMemo(() => {
    return unwrapList<Record<string, unknown>>(rawHeld).map((h) => ({
      id: toNumber(h.id),
      customer: String(
        (h.customer as { name?: string } | undefined)?.name ?? h.customer_name ?? 'Walk-in',
      ),
      total: toNumber(h.total ?? h.grand_total),
      items: Array.isArray(h.items)
        ? (h.items as Record<string, unknown>[]).map((i) => ({
            id: toNumber(i.id ?? i.product_id),
            name: String(i.name ?? i.product_name ?? ''),
            sku: String(i.sku ?? ''),
            price: toNumber(i.price ?? i.rate),
            stock: toNumber(i.stock ?? 0),
            category: String(i.category ?? '—'),
            quantity: toNumber(i.quantity ?? i.qty),
          }))
        : [],
      created_at: String(h.created_at ?? ''),
    }));
  }, [rawHeld]);

  const dataError = productsError || salesError || heldError;
  const isLoading = productsLoading || salesLoading || heldLoading;

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshProducts(), refreshSales(), refreshHeld()]);
  }, [refreshProducts, refreshSales, refreshHeld]);

  /* ---------- Filtering ---------- */

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term),
    );
  }, [products, search]);

  /* ---------- Cart ---------- */

  const addToCart = useCallback((product: Product) => {
    if (!canCreateSale) {
      showError('Permission denied', 'You do not have permission to add items to the sale.');
      return;
    }
    if (product.stock <= 0) {
      showError('Out of stock', `${product.name} is not available.`);
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          showError('Stock limit', `Only ${product.stock} unit(s) of ${product.name} are available.`);
          return current;
        }
        return current.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...current, { ...product, quantity: 1 }];
    });
  }, [canCreateSale, showError]);

  const updateQuantity = useCallback(
    (id: number, delta: number) => {
      if (!canCreateSale) return;
      setCart((current) =>
        current.flatMap((item) => {
          if (item.id !== id) return [item];
          const next = item.quantity + delta;
          if (next <= 0) return [];
          if (next > item.stock) {
            showError('Stock limit', `Only ${item.stock} unit(s) available.`);
            return [item];
          }
          return [{ ...item, quantity: next }];
        }),
      );
    },
    [canCreateSale, showError],
  );

  const removeFromCart = useCallback(
    (id: number) => {
      if (!canCreateSale) return;
      setCart((current) => current.filter((item) => item.id !== id));
    },
    [canCreateSale],
  );

  const resetCart = useCallback(() => {
    setCart([]);
    setPaymentMethods({ cash: '', card: '', upi: '', bank: '' });
    setDiscount('0');
    setTaxRate('18');
    setCoupon('');
  }, []);

  /* ---------- Totals ---------- */

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );
  const discountValue = useMemo(() => {
    if (!canApplyDiscount) return 0;
    const v = toNumber(discount, 0);
    return Math.max(0, Math.min(v, subtotal));
  }, [discount, subtotal, canApplyDiscount]);
  const taxValue = useMemo(
    () => (subtotal - discountValue) * (toNumber(taxRate, 0) / 100),
    [subtotal, discountValue, taxRate],
  );
  const total = useMemo(
    () => Math.max(0, subtotal - discountValue + taxValue),
    [subtotal, discountValue, taxValue],
  );
  const paymentTotal = useMemo(
    () => Object.values(paymentMethods).reduce((sum, v) => sum + toNumber(v, 0), 0),
    [paymentMethods],
  );

  /* ---------- Checkout ---------- */

  const buildSalePayload = useCallback(
    () => ({
      customer_name: customer.trim() || 'Walk-in',
      items: cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        price: item.price,
      })),
      subtotal,
      discount: discountValue,
      tax_rate: toNumber(taxRate, 0),
      tax: taxValue,
      coupon: coupon.trim() || null,
      total,
      payment: {
        cash: toNumber(paymentMethods.cash, 0),
        card: toNumber(paymentMethods.card, 0),
        upi: toNumber(paymentMethods.upi, 0),
        bank: toNumber(paymentMethods.bank, 0),
      },
    }),
    [customer, cart, subtotal, discountValue, taxRate, taxValue, coupon, total, paymentMethods],
  );

  const handleCheckout = useCallback(async () => {
    if (!canCreateSale) {
      showError('Permission denied', 'You do not have permission to complete a sale.');
      return;
    }
    if (cart.length === 0) {
      showError('Empty cart', 'Add at least one product before completing the sale.');
      return;
    }
    if (paymentTotal < total) {
      showError(
        'Payment incomplete',
        `Enter at least ${currency(total - paymentTotal)} more to cover the balance.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.request('POST', '/sales', buildSalePayload());
      showSuccess('Sale completed', 'The sale was recorded and stock updated.');
      safeLog({
        module: 'POS',
        action: 'Checkout',
        status: 'success',
        message: `Completed sale for ${customer.trim() || 'Walk-in'} (${currency(total)})`,
      });
      setCheckoutOpen(false);
      resetCart();
      setCustomer('');
      await refreshAll();
    } catch (err: unknown) {
      const msg = errorMessage(err, 'Could not complete the sale.');
      showError('Checkout failed', msg);
      safeLog({ module: 'POS', action: 'Checkout', status: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }, [
    canCreateSale,
    cart.length,
    paymentTotal,
    total,
    buildSalePayload,
    customer,
    showSuccess,
    showError,
    resetCart,
    refreshAll,
  ]);

  /* ---------- Hold / Resume ---------- */

  const handleHoldSale = useCallback(async () => {
    if (!canHoldSale) {
      showError('Permission denied', 'You do not have permission to hold sales.');
      return;
    }
    if (cart.length === 0) {
      showError('Empty cart', 'There is nothing to hold.');
      return;
    }
    setHoldingSale(true);
    try {
      await apiClient.request('POST', '/sales/hold', buildSalePayload());
      showSuccess('Sale held', 'The basket was saved and can be resumed later.');
      safeLog({
        module: 'POS',
        action: 'Hold Sale',
        status: 'success',
        message: `Held sale for ${customer.trim() || 'Walk-in'}`,
      });
      resetCart();
      setCustomer('');
      await refreshAll();
    } catch (err: unknown) {
      const msg = errorMessage(err, 'Could not hold the sale.');
      showError('Hold failed', msg);
    } finally {
      setHoldingSale(false);
    }
  }, [
    canHoldSale,
    cart.length,
    buildSalePayload,
    customer,
    showSuccess,
    showError,
    resetCart,
    refreshAll,
  ]);

  const handleResumeSale = useCallback(
    async (sale: HeldSale) => {
      if (!canResumeSale) {
        showError('Permission denied', 'You do not have permission to resume sales.');
        return;
      }
      setResumingId(sale.id);
      try {
        const response = await apiClient.request('GET', `/sales/held/${sale.id}`);
        const detail = (response as { data?: Record<string, unknown> })?.data ?? response;
        const root = (detail ?? {}) as Record<string, unknown>;
        const itemsRaw = Array.isArray(root.items) ? (root.items as Record<string, unknown>[]) : [];
        const restored: CartItem[] = itemsRaw.length
          ? itemsRaw.map((i) => ({
              id: toNumber(i.product_id ?? i.id),
              name: String(i.name ?? i.product_name ?? ''),
              sku: String(i.sku ?? ''),
              price: toNumber(i.price ?? i.rate),
              stock: toNumber(i.stock ?? 0),
              category: String(i.category ?? '—'),
              quantity: toNumber(i.quantity ?? i.qty),
            }))
          : sale.items;

        setCart(restored);
        setCustomer(
          String(
            (root.customer as { name?: string } | undefined)?.name ??
              root.customer_name ??
              sale.customer,
          ),
        );
        setDiscount(String(toNumber(root.discount ?? 0)));
        setTaxRate(String(toNumber(root.tax_rate ?? 18)));
        setCoupon(String(root.coupon ?? ''));
        showSuccess('Sale resumed', 'The held basket has been restored.');

        // Remove the held sale on the backend so it isn't resumed twice.
        try {
          await apiClient.request('DELETE', `/sales/held/${sale.id}`);
        } catch {
          /* best-effort cleanup — the sale is already in the cart */
        }
        await refreshAll();
      } catch (err: unknown) {
        showError('Resume failed', errorMessage(err, 'Could not resume the sale.'));
      } finally {
        setResumingId(null);
      }
    },
    [canResumeSale, showSuccess, showError, refreshAll],
  );

  /* ---------- Email receipt ---------- */

  const handleEmailReceipt = useCallback(() => {
    if (!canEmailReceipt) {
      showError('Permission denied', 'You do not have permission to email receipts.');
      return;
    }
    if (cart.length === 0) {
      showError('Empty cart', 'Complete the sale before emailing a receipt.');
      return;
    }
    showError(
      'Receipt not sent',
      'Email receipts require a completed sale. Finalize the sale first.',
    );
  }, [canEmailReceipt, cart.length, showError]);

  /* ---------- Badge / derived display ---------- */

  const totalItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  /* --------------------------------------------------------------- */
  /* RBAC page gate                                                  */
  /* --------------------------------------------------------------- */

  if (loadingUser && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Loading permissions…
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !canView) {
    return <AccessRestricted />;
  }

  /* --------------------------------------------------------------- */
  /* Render                                                          */
  /* --------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
              Sales & POS
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              Fast checkout, flexible payments, and complete sales control
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Search products, manage the cart, hold and resume transactions, and
              complete split payments from one screen.
            </p>
          </div>
          <div className="flex gap-2">
            {canCreateSale && (
              <button
                type="button"
                onClick={() => setCheckoutOpen(true)}
                disabled={cart.length === 0}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
              >
                Checkout
              </button>
            )}
            {canHoldSale && (
              <button
                type="button"
                onClick={() => void handleHoldSale()}
                disabled={holdingSale || cart.length === 0}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 disabled:opacity-60"
              >
                {holdingSale ? 'Holding…' : 'Hold sale'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={isLoading}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 disabled:opacity-60"
            >
              <FiRefreshCw
                className={isLoading ? 'mr-1 inline animate-spin' : 'mr-1 inline'}
                size={14}
              />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {dataError && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <FiAlertCircle className="mt-0.5 shrink-0" size={18} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Some POS data could not be loaded</p>
            <p className="mt-0.5 break-words">{dataError}</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <FiSearch />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products / SKU"
                  className="w-48 bg-transparent outline-none"
                />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <FiUser />
                <input
                  value={customer}
                  onChange={(event) => setCustomer(event.target.value)}
                  className="w-40 bg-transparent outline-none"
                  placeholder="Customer (optional)"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {productsLoading ? (
                [...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
                  />
                ))
              ) : filteredProducts.length === 0 ? (
                <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  No products match your search.
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const disabled = product.stock <= 0 || !canCreateSale;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={disabled}
                      className={clsx(
                        'rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left shadow-sm transition',
                        disabled
                          ? 'cursor-not-allowed opacity-60'
                          : 'hover:border-cyan-400',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900">
                          {product.name}
                        </span>
                        <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">
                          {product.stock} left
                        </span>
                      </div>
                      <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                        {product.sku}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-base font-semibold text-slate-900">
                          {currency(product.price)}
                        </span>
                        <span className="text-sm text-slate-500">
                          {product.category}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Daily sales summary
              </h2>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <FiRefreshCw /> Today
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                {
                  label: 'Transactions',
                  value: salesLoading ? '…' : salesHistory.length,
                  icon: FiShoppingCart,
                },
                {
                  label: 'Revenue',
                  value: salesLoading
                    ? '…'
                    : currency(salesHistory.reduce((sum, sale) => sum + sale.total, 0)),
                  icon: FiDollarSign,
                },
                {
                  label: 'Held',
                  value: heldLoading ? '…' : heldSales.length,
                  icon: FiPackage,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center gap-2 text-slate-500">
                      <Icon size={15} /> {item.label}
                    </div>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {item.value}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Cart */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Current cart</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {totalItems} items
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {cart.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No items yet. Search and tap a product to add it.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{item.name}</p>
                    <p className="text-sm text-slate-500">
                      {currency(item.price)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, -1)}
                      disabled={!canCreateSale}
                      className="rounded-full border border-slate-200 p-1.5 disabled:opacity-50"
                      aria-label="Decrease quantity"
                    >
                      <FiMinus size={12} />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold text-slate-900">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, 1)}
                      disabled={!canCreateSale}
                      className="rounded-full border border-slate-200 p-1.5 disabled:opacity-50"
                      aria-label="Increase quantity"
                    >
                      <FiPlus size={12} />
                    </button>
                    {canCreateSale && (
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        className="rounded-full border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                        aria-label="Remove"
                      >
                        <FiTrash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{currency(subtotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Discount</span>
              <span>- {currency(discountValue)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Tax ({toNumber(taxRate, 0)}%)</span>
              <span>{currency(taxValue)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
              <span>Total</span>
              <span>{currency(total)}</span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                type="number"
                min={0}
                disabled={!canApplyDiscount}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                placeholder="Discount"
              />
              <input
                value={taxRate}
                onChange={(event) => setTaxRate(event.target.value)}
                type="number"
                min={0}
                disabled={!canCreateSale}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                placeholder="Tax rate"
              />
            </div>
            <input
              value={coupon}
              onChange={(event) => setCoupon(event.target.value)}
              disabled={!canApplyDiscount}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
              placeholder="Coupon / promo"
            />
            <div className="flex flex-wrap gap-2">
              {canCreateSale && (
                <button
                  type="button"
                  onClick={() => setCheckoutOpen(true)}
                  disabled={cart.length === 0}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Complete sale
                </button>
              )}
              {canHoldSale && (
                <button
                  type="button"
                  onClick={() => void handleHoldSale()}
                  disabled={holdingSale || cart.length === 0}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
                >
                  Hold
                </button>
              )}
              {canEmailReceipt && (
                <button
                  type="button"
                  onClick={handleEmailReceipt}
                  disabled={cart.length === 0}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
                >
                  <FiMail className="mr-1 inline" /> Email
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Held + History */}
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Held sales</h2>
          <div className="mt-4 space-y-2">
            {heldLoading ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                Loading held sales…
              </div>
            ) : heldSales.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No held sales.
              </div>
            ) : (
              heldSales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {sale.customer}
                    </p>
                    <p className="text-slate-500">{sale.items.length} items</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">
                      {currency(sale.total)}
                    </p>
                    {canResumeSale && (
                      <button
                        type="button"
                        onClick={() => void handleResumeSale(sale)}
                        disabled={resumingId === sale.id}
                        className="mt-1 inline-flex items-center gap-1 text-cyan-600 disabled:opacity-60"
                      >
                        {resumingId === sale.id ? (
                          <>
                            <FiLoader className="animate-spin" size={12} /> Resuming…
                          </>
                        ) : (
                          'Resume'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Sales history</h2>
          <div className="mt-4 space-y-2">
            {!canViewHistory ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                You do not have permission to view sales history.
              </div>
            ) : salesLoading ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                Loading sales history…
              </div>
            ) : salesHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No sales recorded today.
              </div>
            ) : (
              salesHistory.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {sale.customer}
                    </p>
                    <p className="text-slate-500">{sale.time || '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">
                      {currency(sale.total)}
                    </p>
                    <p className="text-slate-500">{sale.paymentMethod}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Checkout modal */}
      {canCreateSale && (
        <Modal
          open={checkoutOpen}
          title="Checkout & payment"
          onClose={() => setCheckoutOpen(false)}
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Customer</span>
                <span className="font-semibold text-slate-900">
                  {customer.trim() || 'Walk-in'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Balance due</span>
                <span className="font-semibold text-slate-900">{currency(total)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Entered</span>
                <span
                  className={clsx(
                    'font-semibold',
                    paymentTotal >= total ? 'text-emerald-600' : 'text-amber-600',
                  )}
                >
                  {currency(paymentTotal)}
                </span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {(['cash', 'card', 'upi', 'bank'] as const).map((key) => (
                <input
                  key={key}
                  value={paymentMethods[key]}
                  type="number"
                  min={0}
                  step="0.01"
                  onChange={(event) =>
                    setPaymentMethods((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
                />
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCheckout()}
                disabled={submitting || paymentTotal < total}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting && <FiLoader className="animate-spin" size={14} />}
                {submitting ? 'Processing…' : 'Finalize sale'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* Small local util that keeps the JSX above readable. */
function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export default SalesPOSPage;