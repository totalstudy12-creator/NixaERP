// frontend/src/types/dashboard.ts

export type DateRangeKey =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | '7d'
  | '30d'
  | '90d'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_financial_year'
  | 'last_financial_year'
  | 'custom'
  | 'all';

export interface DashboardOverview {
  totalSales: number;
  totalPurchase: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
  netMargin: number;
  totalExpenses: number;
  otherIncome: number;
  cashBalance: number;
  bankBalance: number;
  receivable: number;
  payable: number;
  overdueReceivable: number;
  overduePayable: number;
  stockValue: number;
  totalOrders: number;
  totalCustomers: number;
  totalEmployees: number;
  businessGrowth: number;
}

export interface DashboardAlert {
  type: 'warning' | 'danger' | 'info';
  title: string;
  message: string;
  link?: string;
}

export interface ExpenseCategoryBreakdown {
  category: string;
  amount: number;
}

export interface DashboardFinance {
  cashInflow: number;
  cashOutflow: number;
  netCashFlow: number;
  cashBalance: number;
  bankBalance: number;
  receivable: number;
  payable: number;
  overdueReceivable: number;
  overduePayable: number;
  expense: number;
  expenseByCategory: ExpenseCategoryBreakdown[];
  profitAndLoss: {
    revenue: number;
    cogs: number;
    gross_profit: number;
    expenses: number;
    other_income: number;
    net: number;
  };
}

export interface DashboardSales {
  today: number;
  monthly: number;
  growth: number;
  target: number;
  achievement: number;
  topProducts: any[];
  topCustomers: any[];
  averageOrderValue: number;
  salesReturn: number;
  discount: number;
  profit: number;
}

export interface DashboardInventory {
  totalStock: number;
  stockValue: number;
  lowStock: number;
  outOfStock: number;
  overstock: number;
  reservedStock: number;
  damagedStock: number;
  fastMovingStock: number;
  slowMovingStock: number;
  deadStock: number;
  stockTurnover: number;
  stockAging: number;
  warehouseWise: any[];
}

export interface DashboardCustomers {
  totalCustomers: number;
  newCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  returningCustomers: number;
  customerGrowth: number;
  purchaseTrend: any[];
  topCustomers: any[];
  outstanding: number;
  lifetimeValue: string;
}

export interface DashboardAnalyticsData {
  overview: DashboardOverview;
  sales: DashboardSales;
  inventory: DashboardInventory;
  finance: DashboardFinance;
  customers: DashboardCustomers;
  alerts: DashboardAlert[];
  ai?: {
    status: string;
    insights: any[];
  };
}

export interface DashboardAnalyticsResponse {
  success: boolean;
  data: DashboardAnalyticsData;
}

export interface ReceivablesAgingRow {
  customer: string;
  invoice: string;
  due_date: string | null;
  outstanding_amount: number;
  overdue_days: number;
  aging_bucket: '0-30' | '31-60' | '61-90' | '90+';
}

export interface PayablesAgingRow {
  supplier: string;
  purchase_number: string;
  due_date: string | null;
  outstanding_amount: number;
  overdue_days: number;
  aging_bucket: '0-30' | '31-60' | '61-90' | '90+';
}

export interface SalesPurchaseTrendPoint {
  month: string;
  sales: number;
  purchases: number;
}

export interface PaymentModeRow {
  payment_method: string;
  amount: number;
  count: number;
}

export interface CashFlowData {
  cash_inflow: number;
  cash_outflow: number;
  net_cash_flow: number;
}

export interface PaymentSummaryBucket {
  total: number;
  online: number;
  cash: number;
}

export interface PaymentSummary {
  inward: PaymentSummaryBucket;
  outward: PaymentSummaryBucket;
}

export interface LowStockProduct {
  product_name: string;
  qty: number;
}

export interface TopCounterparty {
  name: string;
  amount: number;
}

export interface RecentTransactionRow {
  id: string | number;
  type: 'sale' | 'purchase' | 'inward_payment' | 'outward_payment' | 'expense';
  reference: string;
  entityName: string;
  date: string;
  amount: number;
  status: string;
  link: string;
}
