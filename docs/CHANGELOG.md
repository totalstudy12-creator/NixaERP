# RaptorERP Changelog

All notable changes to the RaptorERP project are documented in this file.

---

## [2.2.0] — 2026-10-23

### Bug Fixes & Stability
- **Inventory Bill-Wise & Party-Wise HTTP 500 Resolution**:
  - Resolved `BadMethodCallException: Call to undefined method App\Models\Product::saleItems() / purchaseItems()` triggered when opening the "Bill-Wise" or "Party" tabs in the product details modal.
  - Added `invoiceItems()`, `saleItems()`, `purchaseInvoiceItems()`, and `purchaseItems()` relationships to `App\Models\Product`.
  - Added backward-compatible relationship aliases: `sale()` on `App\Models\InvoiceItem` and `purchase()` on `App\Models\PurchaseInvoiceItem`.
  - Refactored `ProductController::transactions` and `ProductController::partyTransactions` to accurately query real `invoice_items` and `purchase_invoice_items`, correctly joining `invoices` (`invoice_no`, `invoice_date`, `customer`) and `purchase_invoices` (`bill_number`, `purchase_number`, `purchase_date`, `supplier`).
  - Added direct tab-loading support for `case 'party':` in `fetchTabData` within `InventoryPage.tsx`, enabling seamless direct navigation to the "Party" tab without requiring a prior click on "Bill-Wise".

### Security & RBAC Enforcement
- **Purchase Price Privacy in Product Transactions**:
  - Enforced `canViewPurchasePrice` authorization checks on `GET /api/products/{id}/transactions` and `GET /api/products/{id}/party-transactions`.
  - Unauthorized users (e.g. Sales Executives or staff without `products.purchase_price.view`) receive sanitized transactions where purchase bill amounts (`unit_price`, `price_with_tax`, `item_net`, and `item_total`) are nullified in the JSON response, while sales retail prices remain visible.
  - In `InventoryPage.tsx`, updated `renderBillwise()` and `renderParty()` to conditionally mask purchase cost values while preserving clear visibility for sales billing prices.
  - Added `Show: [All | Sales | Purchases]` filter pills and transaction `Type` badges (`SALE` / `PURCHASE`) to the "Party" tab.
  - Gated the local modal eye toggle button behind `canViewPurchasePrice` so unprivileged users are not presented with non-functional price toggle controls.

### Automated Testing
- **New Feature Tests in `PurchasePricePermissionTest.php`**:
  - `test_product_transactions_shows_sales_and_masks_purchase_without_permission()`: Validates that sales prices are intact and purchase rates are masked for users without permission, and properly revealed once permission is granted.
  - Verified party grouping semantics via `GET /api/products/{id}/party-transactions`.
  - Full suite verified: 87 passed tests with 0 failures, and `npm run build` passing with 0 errors.

---

## [2.1.0] — 2026-10-22

### Security Hardening
- **P0 Arbitrary File Upload (RCE) Fixed**: Hardened `UploadController.php` with strict extension whitelisting (`ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'csv', 'xlsx', 'docx']`), rejection of executable file types, active scanning for malicious `<script>` tags in SVG uploads, and UUID-randomized storage names.
- **P0 Arbitrary File Deletion / Path Traversal Fixed**: Enforced directory confinement (`uploads/`) and blocked path traversal tokens (`..`) in `UploadController::destroy`.
- **P1 Plaintext API Token Storage Remediated**: Migrated API token storage to SHA-256 cryptographic hashing (`hash('sha256', $plainToken)`). Updated `ApiTokenMiddleware` to use constant-time `hash_equals` comparisons with dual-mode fallback for backward compatibility.
- **P1 Gemini AI TLS / SSL Verification**: Enforced TLS certificate validation by default (`GEMINI_VERIFY_SSL=true`) in `GeminiProvider.php`, protecting against MITM attacks. Expanded model fallback chain to include `gemini-2.5-flash`, `gemini-2.0-flash`, and `gemini-1.5-flash`.
- **P2 Missing Marketing Route Method Fixed**: Implemented `gbpLocations()` in `MarketingController.php` to prevent HTTP 500 errors on public marketing routes.
- **P2 Migration Idempotence Guards**: Added `Schema::hasTable` checks across legacy migration files (`2026_09_01_create_product_purchase_price_history_table`, `2026_09_01_create_product_warehouse_stocks_table`, `2026_09_01_create_stock_movements_table`), successfully bringing all 77 database migrations to `[Ran]` status with 0 pending.

### Frontend & UX Improvements
- **Top-Level Error Boundary**: Added `frontend/src/components/ErrorBoundary.tsx` wrapping the application root in `main.tsx` to prevent blank-screen crashes.
- **Session Eviction Protection**: Refactored `AuthBootstrap` in `App.tsx` to evict users only on explicit HTTP 401 Unauthorized responses, eliminating session loss caused by network drops or transient server errors.
- **Toast Notification Relocation**: Shifted notification toasts to `top-5 right-5` to eliminate coordinate overlap with the floating voice agent at `bottom-5 right-5`.
- **React Router Navigation Fixes**: Replaced unrouted anchor `<a>` in `NotFoundPage.tsx` with `<Link to="/dashboard">`. Corrected broken security role paths (`/user-role-management` $\rightarrow$ `/user-roles`) in `SecurityPage.tsx` and added alias routes in `App.tsx`.
- **Memory Leak Cleanups**: Fixed uncleaned `setInterval` timers in `MediaLibraryPage.tsx` and `AttendancePage.tsx`.
- **RBAC Reactivity**: Updated `<RequirePermission>` to subscribe to Zustand `useAuthStore` to ensure immediate reactive UI updates.
- **ModernDataTable Bugfix**: Fixed `selectedRows` prop usage in `ModernDataTable.tsx` to use the library's `selectableRowSelected`.

### Replacement of Placeholder Pages with Real Implementations
- **`QRPaymentPage.tsx`**: Implemented real interactive UPI/POS QR payment generator using `qrcode.react`, copyable payment link, print standee dialog, and ERP inward payment recording modal.
- **`AutomationPage.tsx`**: Replaced static dummy workflows with live API data loading via `apiClient.getAutomationWorkflows()`, toggle activation, and execution trigger actions.
- **`StockTransfersPage.tsx`**: Replaced mock data with live warehouse, branch, and product loading, plus verified transfer submission.
- **`ManualOrdersPage.tsx`**: Connected to `apiClient.getOrders()` with real-time customer search and order status management.
- **`CustomersCRMPage.tsx`**: Replaced stub placeholder with full customer CRM directory, search, call/email actions, and live statistics.

### Performance & Bundling
- **Rollup Vendor Chunk Splitting**: Configured `manualChunks` in `frontend/vite.config.ts`, splitting heavy dependencies into `vendor-charts` (672 kB), `vendor-table` (140 kB), `vendor-icons` (76 kB), `vendor-date` (25 kB), `vendor-maps` (11 kB), `vendor-react` (0.8 kB), and `vendor-core` (0.69 kB). Reduced initial entry bundle by nearly 1 MB.

### Documentation & Developer Experience
- **`AGENTS.md`**: Created autonomous agent operating guide specifying architecture, safety invariants, testing commands, and coding conventions.
- **`docs/ARCHITECTURE.md`**: Rebuilt architecture documentation to accurately reflect Laravel 12, MySQL, React 18, and Sanctum RBAC.
- **`docs/SECURITY.md`**: Documented security controls, token hashing, and upload defenses.
- **`docs/TESTING.md`**: Added testing workflows and PHPUnit suite documentation.
- **`docs/DEPLOYMENT.md`**: Authored complete production deployment guide with Nginx, Supervisor, and disaster recovery procedures.
- **`docs/audit/2026-10-22-audit-report.md`**: Completed technical audit report with verified test results and remediation matrix.
