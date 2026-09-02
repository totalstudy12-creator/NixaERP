// src/types/reports.ts

export interface ReportMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: string;
  to: string;
}

export interface SalesSummaryItem {
  id: number;
  invoice_number: string;
  invoice_date: string;
  customer: string;
  gstin: string;
  branch: string;
  subtotal: number;
  discount: number;
  taxable_amount: number;
  tax: number;
  total: number;
  paid_amount: number;
  due_amount: number;
  status: string;
}

export interface SalesSummaryReport {
  data: SalesSummaryItem[];
  summary: {
    count: number;
    total_amount: number;
    total_tax: number;
    total_discount: number;
  };
  meta: ReportMeta;
}

export interface SalesRegisterItem {
  date: string;
  invoice_number: string;
  customer: string;
  gstin: string;
  item_count: number;
  taxable_value: number;
  gst: number;
  total: number;
  status: string;
}

export interface SalesRegisterReport {
  data: SalesRegisterItem[];
  meta: ReportMeta;
}

export interface SalesByCustomerItem {
  customer: string;
  invoice_count: number;
  taxable_sales: number;
  gst: number;
  total_sales: number;
  paid: number;
  outstanding: number;
}

export interface SalesByCustomerReport {
  data: SalesByCustomerItem[];
  meta: ReportMeta;
}

export interface SalesByProductItem {
  product: string;
  sku: string;
  quantity: number;
  taxable_sales: number;
  discount: number;
  gst: number;
  total_sales: number;
  avg_selling_price: number;
}

export interface SalesByProductReport {
  data: SalesByProductItem[];
  meta: ReportMeta;
}

export interface OutstandingSalesItem {
  customer: string;
  invoice: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  overdue_days: number;
  status: string;
}

export interface OutstandingSalesReport {
  data: OutstandingSalesItem[];
  meta: ReportMeta;
}

export interface GstSalesItem {
  invoice_no: string;
  invoice_date: string;
  customer: string;
  gstin: string;
  description: string;
  quantity: number;
  unit_price: number;
  taxable_value: number;
  cgst_percent: number;
  cgst_amount: number;
  sgst_percent: number;
  sgst_amount: number;
  igst_percent: number;
  igst_amount: number;
  cess: number;
  total_tax: number;
  total_amount: number;
  supply_type: 'Intrastate' | 'Interstate';
}

export interface GstSalesReport {
  data: GstSalesItem[];
  meta: ReportMeta;
}

export interface PurchaseSummaryItem {
  id: number;
  purchase_number: string;
  purchase_date: string;
  supplier: string;
  gstin: string;
  subtotal: number;
  discount: number;
  taxable_amount: number;
  tax: number;
  total: number;
  paid_amount: number;
  due_amount: number;
  status: string;
}

export interface PurchaseSummaryReport {
  data: PurchaseSummaryItem[];
  summary: {
    count: number;
    total_amount: number;
    total_tax: number;
    total_discount: number;
  };
  meta: ReportMeta;
}

export interface OutstandingPurchasesItem {
  supplier: string;
  purchase_number: string;
  purchase_date: string;
  due_date: string;
  purchase_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  overdue_days: number;
  status: string;
}

export interface OutstandingPurchasesReport {
  data: OutstandingPurchasesItem[];
  meta: ReportMeta;
}

export interface ProfitLossReport {
  success: boolean;
  data: {
    revenue: {
      gross_sales: number;
      sales_returns: number;
      sales_discounts: number;
      net_sales: number;
    };
    cogs: {
      opening_stock: number;
      purchases: number;
      purchase_returns: number;
      purchase_discounts: number;
      direct_costs: number;
      closing_stock: number;
      cost_of_goods_sold: number;
    };
    gross_profit: number;
    gross_margin: number;
    operating_expenses: Array<{
      name: string;
      amount: number;
    }>;
    total_operating_expenses: number;
    operating_profit: number;
    other_income: number;
    other_expenses: number;
    net_profit: number;
    net_margin: number;
  };
  meta: {
    from: string;
    to: string;
  };
}

export interface ProductProfitabilityItem {
  product_id: number;
  product_name: string;
  sku: string;
  quantity_sold: number;
  sales_value: number;
  cost_value: number;
  gross_profit: number;
  margin_percent: number;
}

export interface InvoiceProfitabilityItem {
  invoice_id: number;
  invoice_no: string;
  invoice_date: string | null;
  customer_id?: number | null;
  customer_name: string;
  gross_sales: number;
  discount: number;
  tax: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  profit_margin: number;
  status: string;
  items: Array<{
    product_id: number;
    product_name: string;
    sku: string;
    quantity: number;
    unit_price: number;
    gross_sales: number;
    discount: number;
    net_sales: number;
    unit_cost: number;
    cogs: number;
    gross_profit: number;
    margin_percent: number;
  }>;
}

export interface InvoiceProfitabilityReport {
  success: boolean;
  data: InvoiceProfitabilityItem[];
  summary: {
    total_invoices: number;
    total_revenue: number;
    total_cogs: number;
    total_gross_profit: number;
    average_margin_percent: number;
  };
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
    from: string;
    to: string;
  };
}

export interface ProductProfitabilityReport {
  success: boolean;
  data: ProductProfitabilityItem[];
  summary: {
    total_products: number;
    total_sales_value: number;
    total_cost_value: number;
    total_gross_profit: number;
  };
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
    from: string;
    to: string;
  };
}

export interface ProfitLossSummaryReport {
  success: boolean;
  data: {
    gross_revenue: number;
    net_revenue: number;
    cogs: number;
    gross_profit: number;
    gross_margin: number;
    operating_expenses: number;
    operating_profit: number;
    net_profit: number;
    net_margin: number;
    contribution_margin: number;
    contribution_margin_percent: number;
    total_sales: number;
    total_sales_returns: number;
    total_discounts: number;
    total_purchase_cost: number;
  };
  meta: {
    from: string;
    to: string;
  };
}

export interface ProfitLossCustomerRow {
  customer: string;
  invoice_count: number;
  gross_sales: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  margin_percent: number;
}

export interface ProfitLossBranchRow {
  branch: string;
  gross_sales: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  margin_percent: number;
}

export interface ProfitLossMonthlyRow {
  month: string;
  revenue: number;
  cogs: number;
  gross_profit: number;
  margin_percent: number;
}

export interface ProfitLossYearlyRow {
  year: string;
  revenue: number;
  cogs: number;
  gross_profit: number;
  margin_percent: number;
}

export interface ProfitLossComparisonRow {
  metric: string;
  current: number;
  previous: number;
  change_percent: number;
}

export interface GstSummaryReport {
  success: boolean;
  data: {
    outward: {
      taxable_value: number;
      cgst: number;
      sgst: number;
      igst: number;
      total_tax: number;
    };
    inward: {
      taxable_value: number;
      cgst: number;
      sgst: number;
      igst: number;
      total_tax: number;
    };
    input_tax_credit: {
      cgst_itc: number;
      sgst_itc: number;
      igst_itc: number;
      total_itc: number;
    };
    net_liability: {
      cgst: number;
      sgst: number;
      igst: number;
      total: number;
    };
  };
  meta: {
    from: string;
    to: string;
  };
}

export interface DashboardSummary {
  total_sales: number;
  total_purchases: number;
  gross_profit: number;
  receivables: number;
  payables: number;
  payments_received: number;
  payments_made: number;
  outstanding_amount: number;
  sales_count: number;
  purchase_count: number;
  invoice_count: number;
  profit_margin: number;
}
