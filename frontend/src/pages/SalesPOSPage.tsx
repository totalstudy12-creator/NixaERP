import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FiDollarSign, FiMail, FiMinus, FiPackage, FiPlus, FiRefreshCw, FiSearch, FiShoppingCart, FiUser } from 'react-icons/fi';
import { useNotification } from '../components/NotificationContext';

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
}

interface HeldSale {
  id: number;
  customer: string;
  items: CartItem[];
  total: number;
}

const currency = (value: number) => `₹ ${value.toLocaleString('en-IN')}`;

const initialProducts: Product[] = [
  { id: 1, name: 'Wireless Mouse', sku: 'ACC-001', price: 1299, stock: 24, category: 'Accessories' },
  { id: 2, name: 'Mechanical Keyboard', sku: 'ACC-002', price: 3999, stock: 16, category: 'Accessories' },
  { id: 3, name: '24" Monitor', sku: 'DEV-100', price: 14500, stock: 8, category: 'Displays' },
  { id: 4, name: 'USB Hub', sku: 'ACC-003', price: 1499, stock: 18, category: 'Accessories' },
];

const initialSales: SaleRecord[] = [
  { id: 1, customer: 'Blue Retail', total: 15800, status: 'Completed', paymentMethod: 'Card', time: '10:20 AM' },
  { id: 2, customer: 'North Traders', total: 7198, status: 'Held', paymentMethod: 'Cash', time: '09:45 AM' },
];

function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 px-4 py-6">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function SalesPOSPage() {
  const { showSuccess } = useNotification();
  const [products] = useState(initialProducts);
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState('Walk-in');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState('0');
  const [taxRate, setTaxRate] = useState('18');
  const [coupon, setCoupon] = useState('');
  const [paymentMethods, setPaymentMethods] = useState({ cash: '', card: '', upi: '', bank: '' });
  const [salesHistory, setSalesHistory] = useState(initialSales);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase();
    return products.filter((product) => product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term));
  }, [products, search]);

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...current, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart((current) => current.flatMap((item) => (item.id === id ? (item.quantity + delta > 0 ? [{ ...item, quantity: item.quantity + delta }] : []) : [item])));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountValue = Number(discount || 0);
  const taxValue = (subtotal - discountValue) * (Number(taxRate || 0) / 100);
  const total = subtotal - discountValue + taxValue;

  const handleCheckout = () => {
    const paymentTotal = Object.values(paymentMethods).reduce((sum, value) => sum + Number(value || 0), 0);
    if (paymentTotal < total) {
      showSuccess('Payment incomplete', 'Please split the balance across available payment methods.');
      return;
    }
    const record: SaleRecord = {
      id: Date.now(),
      customer,
      total,
      status: 'Completed',
      paymentMethod: paymentTotal >= total ? 'Split' : 'Cash',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setSalesHistory((current) => [record, ...current]);
    setCart([]);
    setPaymentMethods({ cash: '', card: '', upi: '', bank: '' });
    setCheckoutOpen(false);
    setDiscount('0');
    setTaxRate('18');
    setCoupon('');
    showSuccess('Sale completed', 'The invoice was generated and inventory updated.');
  };

  const holdSale = () => {
    if (!cart.length) return;
    const sale: HeldSale = { id: Date.now(), customer, items: cart, total };
    setHeldSales((current) => [sale, ...current]);
    setCart([]);
    showSuccess('Sale held', 'The basket was saved and can be resumed later.');
  };

  const resumeSale = (sale: HeldSale) => {
    setCart(sale.items);
    setCustomer(sale.customer);
    showSuccess('Sale resumed', 'The held basket has been restored.');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">Sales & POS</p>
            <h1 className="mt-2 text-2xl font-semibold">Fast checkout, flexible payments, and complete sales control</h1>
            <p className="mt-2 text-sm text-slate-300">Search products, manage the cart, hold and resume transactions, and complete split payments from one screen.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCheckoutOpen(true)} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Checkout</button>
            <button type="button" onClick={holdSale} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100">Hold sale</button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <FiSearch />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products / SKU" className="w-48 bg-transparent outline-none" />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <FiUser />
                <input value={customer} onChange={(event) => setCustomer(event.target.value)} className="w-40 bg-transparent outline-none" placeholder="Customer" />
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {filteredProducts.map((product) => (
                <button key={product.id} type="button" onClick={() => addToCart(product)} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left shadow-sm transition hover:border-cyan-400">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{product.name}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">{product.stock} left</span>
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">{product.sku}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-base font-semibold text-slate-900">{currency(product.price)}</span>
                    <span className="text-sm text-slate-500">{product.category}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Daily sales summary</h2>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <FiRefreshCw /> Today
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                { label: 'Transactions', value: salesHistory.length, icon: FiShoppingCart },
                { label: 'Revenue', value: currency(salesHistory.reduce((sum, sale) => sum + sale.total, 0)), icon: FiDollarSign },
                { label: 'Held', value: heldSales.length, icon: FiPackage },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-2 text-slate-500"><Icon size={15} /> {item.label}</div>
                    <p className="mt-2 text-xl font-semibold text-slate-900">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Current cart</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{cart.reduce((sum, item) => sum + item.quantity, 0)} items</span>
          </div>
          <div className="mt-4 space-y-2">
            {cart.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No items yet. Search and tap a product to add it.</div>
            ) : cart.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 px-3 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{item.name}</p>
                  <p className="text-sm text-slate-500">{currency(item.price)} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => updateQuantity(item.id, -1)} className="rounded-full border border-slate-200 p-1.5"><FiMinus size={12} /></button>
                  <span className="w-6 text-center text-sm font-semibold text-slate-900">{item.quantity}</span>
                  <button type="button" onClick={() => updateQuantity(item.id, 1)} className="rounded-full border border-slate-200 p-1.5"><FiPlus size={12} /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <div className="flex items-center justify-between"><span>Subtotal</span><span>{currency(subtotal)}</span></div>
            <div className="mt-2 flex items-center justify-between"><span>Discount</span><span>- {currency(discountValue)}</span></div>
            <div className="mt-2 flex items-center justify-between"><span>Tax</span><span>{currency(taxValue)}</span></div>
            <div className="mt-3 border-t border-slate-200 pt-3 flex items-center justify-between text-base font-semibold text-slate-900"><span>Total</span><span>{currency(total)}</span></div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input value={discount} onChange={(event) => setDiscount(event.target.value)} type="number" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Discount" />
              <input value={taxRate} onChange={(event) => setTaxRate(event.target.value)} type="number" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Tax rate" />
            </div>
            <input value={coupon} onChange={(event) => setCoupon(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Coupon / promo" />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setCheckoutOpen(true)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Complete sale</button>
              <button type="button" onClick={holdSale} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">Hold</button>
              <button type="button" onClick={() => showSuccess('Invoice queued', 'The receipt will be sent via email shortly.')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"><FiMail className="mr-1 inline" />Email</button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Held sales</h2>
          <div className="mt-4 space-y-2">
            {heldSales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">{sale.customer}</p>
                  <p className="text-slate-500">{sale.items.length} items</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{currency(sale.total)}</p>
                  <button type="button" onClick={() => resumeSale(sale)} className="mt-1 text-cyan-600">Resume</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Sales history</h2>
          <div className="mt-4 space-y-2">
            {salesHistory.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">{sale.customer}</p>
                  <p className="text-slate-500">{sale.time}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{currency(sale.total)}</p>
                  <p className="text-slate-500">{sale.paymentMethod}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={checkoutOpen} title="Checkout & payment" onClose={() => setCheckoutOpen(false)}>
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <div className="flex items-center justify-between"><span>Customer</span><span className="font-semibold text-slate-900">{customer}</span></div>
            <div className="mt-2 flex items-center justify-between"><span>Balance due</span><span className="font-semibold text-slate-900">{currency(total)}</span></div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(paymentMethods).map(([key, value]) => (
              <input key={key} value={value} type="number" onChange={(event) => setPaymentMethods((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder={key.charAt(0).toUpperCase() + key.slice(1)} />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCheckoutOpen(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">Cancel</button>
            <button type="button" onClick={handleCheckout} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Finalize sale</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
