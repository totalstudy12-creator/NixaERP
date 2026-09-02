# NixaERP Reports Implementation - Frontend Update Guide

## Changes Made (Backend & API Layer)

### 1. Backend Services
- **File**: `backend/app/Services/ReportService.php`  
- **Methods Implemented**:
  - `getDashboardSummary()` - Overview KPIs
  - `getSalesSummary()` - Sales with pagination
  - `getSalesRegister()` - Transaction-level sales
  - `getSalesByCustomer()` - Grouped by customer  
  - `getSalesByProduct()` - Grouped by product
  - `getGstSalesReport()` - GST invoice-item data
  - `getOutstandingSales()` - Unpaid invoices
  - `getPurchaseSummary()` - Purchase summaries
  - `getOutstandingPurchases()` - Unpaid purchases
  - `getDetailedProfitLoss()` - Full P&L statement
  - `getGstSummary()` - GSTR-3B prep data

### 2. API Controller
- **File**: `backend/app/Http/Controllers/Api/ReportController.php`
- **Response Format**: All endpoints return `{ success: true, data: [...], meta: {...} }`

### 3. API Routes
- **File**: `backend/routes/api.php`
- **Prefix**: `/api/reports/`
- **Endpoints Added**:
  - `GET /reports/summary`
  - `GET /reports/sales-summary`
  - `GET /reports/sales-register`
  - `GET /reports/sales-by-customer`
  - `GET /reports/sales-by-product`
  - `GET /reports/gst-sales`
  - `GET /reports/outstanding-sales`
  - `GET /reports/purchase-summary`
  - `GET /reports/outstanding-purchases`
  - `GET /reports/profit-loss`
  - `GET /reports/gst-summary`

### 4. Frontend API Client
- **File**: `frontend/src/api.ts`
- **Methods Added**: `getReportSummary()`, `getSalesSummary()`, `getSalesRegister()`, etc.
- **Pattern**: All methods accept a params object with filters: `from`, `to`, `branch_id`, `page`, `per_page`

### 5. useApiCache Hook
- **File**: `frontend/src/pages/ReportsPage.tsx`
- **Updated**: Now handles both array and object responses with `data/meta/summary` structure

## Required Frontend Changes (ReportsPage.tsx)

### TypeScript Interfaces to Add
```typescript
interface SalesSummaryData {
  data: Array<{
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
  }>;
  summary: {
    count: number;
    total_amount: number;
    total_tax: number;
    total_discount: number;
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

interface ProfitLossData {
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
    operating_expenses: Array<any>;
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
```

### Fetchers to Add
```typescript
// Sales reports
const salesSummaryFetcher = useCallback(
  () => apiClient.getSalesSummary({ 
    from: dateFrom, 
    to: dateTo, 
    page: 1, 
    per_page: 25 
  }),
  [dateFrom, dateTo]
);

const profitLossFetcher = useCallback(
  () => apiClient.getProfitLossReport({ 
    from: dateFrom, 
    to: dateTo 
  }),
  [dateFrom, dateTo]
);
```

### useApiCache Calls to Add
```typescript
const {
  data: salesSummaryData,
  loading: salesSummaryLoading,
  error: salesSummaryError,
} = useApiCache<SalesSummaryData>(
  `sales-summary-${dateFrom}-${dateTo}`,
  salesSummaryFetcher
);

const {
  data: profitLossData,
  loading: profitLossLoading,
  error: profitLossError,
} = useApiCache<ProfitLossData>(
  `profit-loss-${dateFrom}-${dateTo}`,
  profitLossFetcher
);
```

### Report Components to Update
Replace ComingSoonReport placeholders in:
1. **Sales Register** - Show transaction-level data with invoice items
2. **Sales by Customer** - Show grouped data with totals
3. **Sales by Product** - Show product-level aggregation
4. **GST Sales Report** - Show item-level GST breakdown
5. **Outstanding Sales** - Show aging analysis with overdue days
6. **Purchase Register** - Similar to sales register
7. **Outstanding Purchases** - Vendor aging analysis
8. **Trial Balance** - Accounting balances
9. **Profit & Loss** - Detailed P&L statement with sections
10. **Balance Sheet** - Assets/liabilities/equity
11. **Cash Flow** - Cash movement analysis
12. **GSTR-1, GSTR-2, GSTR-3B** - GST forms
13. **Expense Reports** - Category-wise breakdown
14. **Input Tax Credit** - ITC eligibility analysis

## Key Implementation Notes

### Pagination
- Backend returns `meta` with `current_page`, `per_page`, `total`, `last_page`
- Frontend should render pagination controls
- CSV export should handle all pages, not just current page

### Error Handling
- API error: Show "Unable to load this report" with retry button
- Empty data (0 records): Show "No records found for the selected period"
- Use `error` state from useApiCache to distinguish between them

### Filters & Parameters
All new report endpoints accept:
- `from` - Start date (YYYY-MM-DD)
- `to` - End date (YYYY-MM-DD)
- `branch_id` - Optional, filters by branch
- `page` - Current page (default: 1)
- `per_page` - Records per page (default: 25)
- `customer_id` / `supplier_id` - For future filtering
- `status` - Status filter

### Authorization
- All endpoints require `Authorization: Bearer <token>` header
- Backend automatically filters by authenticated user's company
- Company isolation is enforced in ReportService
- Branch access is enforced if branchId is provided

## Testing Checklist

- [ ] Test each report endpoint in browser console: `apiClient.getSalesSummary({...})`
- [ ] Verify pagination works correctly
- [ ] Verify date filtering works
- [ ] Verify error messages appear for invalid dates
- [ ] Verify empty data shows correct message
- [ ] Verify export/print functionality works
- [ ] Verify filters update cache keys properly
- [ ] Test with different companies/branches
- [ ] Verify no unauthorized data access

## Next Steps

1. Create report table components for each report type
2. Add fetchers for all new report endpoints
3. Update render logic in ReportsPage to use real data
4. Implement pagination UI components
5. Add CSV export for each report
6. Add print-friendly styling
7. Add proper error handling and retry logic
8. Create unit/integration tests for report endpoints
9. Verify company/branch isolation in tests
10. Documentation for report API usage
