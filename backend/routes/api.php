<?php

use App\Http\Controllers\Api\DeliveryController;

use App\Http\Controllers\Api\AccountingController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BackupController;
use App\Http\Controllers\Api\BackupSystemController;
use App\Http\Controllers\Api\BiometricAttendanceController;
use App\Http\Controllers\Api\BiometricDeviceController;
use App\Http\Controllers\Api\BiometricScanController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\ConnectedAppController;
use App\Http\Controllers\Api\CashDrawerController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DealerController;
use App\Http\Controllers\Api\EmailWebhookController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\FinancialCategoryController;
use App\Http\Controllers\Api\FinancialEntryController;
use App\Http\Controllers\Api\FingerprintController;
use App\Http\Controllers\Api\IncomeExpenseController;
use App\Http\Controllers\Api\GeminiVoiceController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\InboxController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\PublicInvoiceController;
use App\Http\Controllers\Api\MarketingController;
use App\Http\Controllers\Api\McpController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\OfflineSyncController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PayrollController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\PurchaseInvoiceController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SalesController;
use App\Http\Controllers\Api\SalesReturnController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\SocialAuthController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\TwoFactorController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\Api\UserAccessController;
use App\Http\Controllers\Api\WarehouseController;
use App\Http\Controllers\Api\WhatsAppWebhookController;
use App\Http\Controllers\Api\PrinterController;
use App\Http\Controllers\Api\ThermalPaperProfileController;
use App\Http\Controllers\Api\LabelTemplateController;
use App\Http\Controllers\Api\PrintJobController;
use App\Http\Controllers\Api\QuotationController;
use App\Http\Controllers\Api\LeadController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\OpportunityController;
use App\Http\Controllers\Api\CampaignController;
use App\Http\Controllers\Api\SecurityFirewallController;
use App\Http\Controllers\Api\AdminControlCenterController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — RBAC-enabled
|--------------------------------------------------------------------------
| Middleware alias: `permission` → App\Http\Middleware\CheckPermission
| Comma-separated  = ANY-of   e.g. permission:view users,edit users
| Pipe-separated   = ALL-of   e.g. permission:view users|edit users
| Admin / Super Admin role bypasses every check.
|
| NOTE: apiResource() middleware does NOT support per-method mapping. Every
|       REST resource below is written as explicit Route::get/post/put/delete
|       calls so each HTTP verb is gated by exactly ONE permission.
*/


/* ==================== PUBLIC — Customer Invoice Access =================== */
Route::get('public/invoices/{token}', [PublicInvoiceController::class, 'getMetadata']);
Route::post('public/invoices/{token}/verify', [PublicInvoiceController::class, 'verify']);

/* ============================= HEALTH (public) ========================== */
Route::get('status', fn () => response()->json([
    'status'  => 'ok',
    'service' => 'Business OS API',
]));

/* ========================== AUTH — public =============================== */
Route::prefix('auth')->group(function () {
    Route::post('login',      [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('2fa/verify', [TwoFactorController::class, 'verify'])->middleware('throttle:2fa-verify');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('logout',   [AuthController::class, 'logout']);
        Route::get('me',        [AuthController::class, 'me']);
        Route::get('profile',   [AuthController::class, 'profile']);
        Route::put('profile',   [AuthController::class, 'updateProfile'])
            ->middleware('permission:edit profile');

        Route::get('sessions',                   [AuthController::class, 'sessions']);
        Route::delete('sessions/{id}',           [AuthController::class, 'terminateSession']);
        Route::post('sessions/terminate-others', [AuthController::class, 'terminateOtherSessions']);
        Route::post('change-password',           [AuthController::class, 'changePassword']);

        Route::prefix('2fa')->group(function () {
            Route::get('status',                 [TwoFactorController::class, 'status']);
            Route::post('enable',                [TwoFactorController::class, 'enable'])->middleware('throttle:2fa-sensitive');
            Route::post('confirm',               [TwoFactorController::class, 'confirm'])->middleware('throttle:2fa-sensitive');
            Route::post('disable',               [TwoFactorController::class, 'disable'])->middleware('throttle:2fa-sensitive');
            Route::post('recovery-codes',        [TwoFactorController::class, 'regenerateRecoveryCodes'])->middleware('throttle:2fa-sensitive');
        });
    });
});

// Legacy top-level auth aliases.
Route::post('login',   [AuthController::class, 'login'])->middleware('throttle:login')->name('login');
Route::post('logout',  [AuthController::class, 'logout'])->middleware('auth:sanctum');
Route::get('me',       [AuthController::class, 'me'])->middleware('auth:sanctum');
Route::get('profile',  [AuthController::class, 'profile'])->middleware('auth:sanctum');
Route::put('profile',  [AuthController::class, 'updateProfile'])
    ->middleware(['auth:sanctum', 'permission:edit profile']);

/* ============ PUBLIC — device-token biometric / OAuth / webhooks ========= */
Route::post('biometric/device/heartbeat', [BiometricDeviceController::class, 'heartbeat'])->middleware('biometric.device');
Route::post('biometric/attendance', [BiometricAttendanceController::class, 'store'])->middleware('biometric.device');
Route::post('biometric/offline/sync', [OfflineSyncController::class, 'batchSync'])->middleware('biometric.device');
Route::get('biometric/device/pending-enrollment', [BiometricDeviceController::class, 'pendingEnrollment'])->middleware('biometric.device');
Route::post('biometric/device/{device}/enroll-status', [BiometricDeviceController::class, 'updateEnrollmentStatus'])->middleware('biometric.device');

Route::get('/auth/{provider}/callback',                 [SocialAuthController::class, 'callback']);
Route::post('/webhooks/whatsapp', [WhatsAppWebhookController::class, 'handle'])->middleware('throttle:60,1');
Route::post('/webhooks/twilio/notification-status', [NotificationController::class, 'twilioStatus'])->middleware('throttle:120,1');
Route::get('marketing/gbp-locations',                   [MarketingController::class, 'gbpLocations']);

/* ========================== FLUTTER APPS — public handshake, OTA & auth =============== */
Route::get('v1/apps/{identifier}/handshake',    [ConnectedAppController::class, 'handshake']);
Route::get('v1/apps/{identifier}/check-update', [ConnectedAppController::class, 'checkUpdate']);
Route::post('v1/apps/{identifier}/ping',        [ConnectedAppController::class, 'ping']);
Route::post('v1/apps/{identifier}/login',       [ConnectedAppController::class, 'login'])->middleware('throttle:30,1');

/* =========================================================================
 |  PROTECTED — auth:sanctum + RBAC
 | ========================================================================= */
Route::middleware('auth:sanctum')->group(function () {

    /* ----------------------------- Audit Logs -------------------------- */
    Route::get('audit-logs/export', [AuditLogController::class, 'exportCsv'])->middleware('permission:view settings,view users');
    Route::get('audit-logs',        [AuditLogController::class, 'index']);
    Route::get('audit-logs/{id}',   [AuditLogController::class, 'show'])->middleware('permission:view settings,view users');
    Route::post('audit-logs',       [AuditLogController::class, 'store'])->middleware('throttle:120,1');
    Route::delete('audit-logs',     [AuditLogController::class, 'destroy']);

    /* ------------------------------- MCP ------------------------------- */
    // MCP token management is gated by `settings.mcp.manage` — matches the
    // seeder and the frontend (SettingsPage.tsx → MCP_MANAGE).
    Route::prefix('mcp')->group(function () {
        Route::get('status',            [McpController::class, 'status']);
        Route::get('context',           [McpController::class, 'context']);
        Route::get('context/{section}', [McpController::class, 'section']);

        Route::get('tokens',              [SettingsController::class, 'listMcpTokens'])->middleware('permission:settings.mcp.manage');
        Route::post('tokens',             [SettingsController::class, 'generateMcpToken'])->middleware('permission:settings.mcp.manage');
        Route::delete('tokens/{tokenId}', [SettingsController::class, 'revokeMcpToken'])->middleware('permission:settings.mcp.manage');
        Route::delete('tokens',           [SettingsController::class, 'revokeAllMcpTokens'])->middleware('permission:settings.mcp.manage');
    });

    /* ----------------------------- Dashboard --------------------------- */
    Route::prefix('dashboard')->group(function () {
        Route::get('analytics',                [DashboardController::class, 'analytics'])->middleware('permission:view dashboard analytics');
        Route::get('payments-summary',         [DashboardController::class, 'paymentSummary'])->middleware('permission:view dashboard payment summary');
        Route::get('inventory-summary',        [DashboardController::class, 'inventorySummary'])->middleware('permission:view dashboard inventory summary');
        Route::get('invoices-count-summary',   [DashboardController::class, 'invoiceCountSummary'])->middleware('permission:view dashboard invoice count summary');
        Route::get('invoices-amount-summary',  [DashboardController::class, 'invoiceAmountSummary'])->middleware('permission:view dashboard invoice amount summary');
        Route::get('business-health',          [DashboardController::class, 'businessHealth'])->middleware('permission:view dashboard business health');
        Route::get('forecast',                 [DashboardController::class, 'forecast'])->middleware('permission:view dashboard forecast');
        Route::get('risks',                    [DashboardController::class, 'risks'])->middleware('permission:view dashboard risks');
        Route::get('anomalies',                [DashboardController::class, 'anomalies'])->middleware('permission:view dashboard anomalies');
        Route::get('rankings',                 [DashboardController::class, 'rankings'])->middleware('permission:view dashboard rankings');
        Route::get('hero-product',             [DashboardController::class, 'heroProduct'])->middleware('permission:view dashboard hero product');
        Route::get('hero-customer',            [DashboardController::class, 'heroCustomer'])->middleware('permission:view dashboard hero customer');
        Route::get('district-sales',           [DashboardController::class, 'districtSales'])->middleware('permission:view dashboard district sales');
        Route::get('new-vs-existing-customers',[DashboardController::class, 'newVsExistingCustomers'])->middleware('permission:view new vs existing customer sales');
        Route::get('profit',                   [DashboardController::class, 'profit'])->middleware('permission:view dashboard profit');
        Route::get('profit-summary',           [DashboardController::class, 'profitSummary'])->middleware('permission:view dashboard profit');
        Route::get('low-stock',                [DashboardController::class, 'lowStockProducts'])->middleware('permission:view dashboard low stock');
        Route::get('top-customers',            [DashboardController::class, 'topCustomers'])->middleware('permission:view dashboard top customers');
        Route::get('top-vendors',              [DashboardController::class, 'topVendors'])->middleware('permission:view dashboard top vendors');
        Route::get('purchase-due',             [DashboardController::class, 'purchaseDueInvoices'])->middleware('permission:view dashboard purchase due');
        Route::get('login-activity',           [DashboardController::class, 'loginActivity'])->middleware('permission:view dashboard login activity');
    });

    /* ------------------------------ Reports ---------------------------- */
    Route::prefix('reports')->group(function () {
        Route::get('all',                    [DashboardController::class, 'allReports'])->middleware('permission:view dashboard analytics');
        Route::get('top-selling-products',   [DashboardController::class, 'topSellingProducts'])->middleware('permission:view reports top selling products');
        Route::get('least-selling-products', [DashboardController::class, 'leastSellingProducts'])->middleware('permission:view reports least selling products');

        Route::get('summary',                 [ReportController::class, 'summary'])->middleware('permission:view dashboard analytics');
        Route::get('sales-summary',           [ReportController::class, 'salesSummary'])->middleware('permission:view sales summary');
        Route::get('sales-register',          [ReportController::class, 'salesRegister'])->middleware('permission:view sales reports');
        Route::get('sales-by-customer',       [ReportController::class, 'salesByCustomer'])->middleware('permission:view sales reports');
        Route::get('sales-by-product',        [ReportController::class, 'salesByProduct'])->middleware('permission:view sales reports');
        Route::get('gst-sales',               [ReportController::class, 'gstSalesReport'])->middleware('permission:view sales reports');
        Route::get('outstanding-sales',       [ReportController::class, 'outstandingSales'])->middleware('permission:view sales reports');

        Route::get('purchase-summary',        [ReportController::class, 'purchaseSummary'])->middleware('permission:view purchase summary');
        Route::get('purchase-register',       [ReportController::class, 'purchaseRegister'])->middleware('permission:view purchase reports');
        Route::get('purchase-by-vendor',      [ReportController::class, 'purchaseByVendor'])->middleware('permission:view purchase reports');
        Route::get('outstanding-purchases',   [ReportController::class, 'outstandingPurchases'])->middleware('permission:view purchase reports');

        Route::get('income-summary', [FinancialEntryController::class, 'index'])->defaults('direction', 'income')->middleware('permission:income_expenses.view_reports,view reports expenses');
        Route::get('expense-summary', [FinancialEntryController::class, 'index'])->defaults('direction', 'expense')->middleware('permission:income_expenses.view_reports,view reports expenses');

        Route::get('general-ledger',          [ReportController::class, 'generalLedger'])->middleware('permission:view accounting statements');
        Route::get('customer-ledger',         [ReportController::class, 'customerLedger'])->middleware('permission:view accounting statements');

        Route::get('profit-loss',                    [ReportController::class, 'profitLoss'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss/summary',            [ReportController::class, 'profitLossSummary'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss-summary',            [ReportController::class, 'profitLossSummary'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss/products',           [ReportController::class, 'profitLossProducts'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss/customers',          [ReportController::class, 'profitLossCustomers'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss-customers',          [ReportController::class, 'profitLossCustomers'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss/branches',           [ReportController::class, 'profitLossBranches'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss-branches',           [ReportController::class, 'profitLossBranches'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss/monthly',            [ReportController::class, 'profitLossMonthly'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss/yearly',             [ReportController::class, 'profitLossYearly'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss/comparison',         [ReportController::class, 'profitLossComparison'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss/invoices',           [ReportController::class, 'invoiceProfitability'])->middleware('permission:view dashboard profit');
        Route::get('profit-loss/invoices/{invoice}', [ReportController::class, 'invoiceProfitabilityDetail'])->middleware('permission:view dashboard profit');

        Route::get('product-profitability',  [ReportController::class, 'productProfitability'])->middleware('permission:view dashboard profit');
        Route::get('gst-summary',            [ReportController::class, 'gstSummary'])->middleware('permission:view accounting summary');
        Route::get('sales-purchase-trend',   [ReportController::class, 'salesPurchaseTrend'])->middleware('permission:view sales reports');
        Route::get('payment-mode-summary',   [ReportController::class, 'paymentModeSummary'])->middleware('permission:view accounting statements');
        Route::get('expense-report',         [ReportController::class, 'expenseReport'])->middleware('permission:income_expenses.view_reports,view reports expenses,income_expenses.view');
        Route::get('receivables-aging',      [ReportController::class, 'receivablesAging'])->middleware('permission:view sales reports');
        Route::get('payables-aging',         [ReportController::class, 'payablesAging'])->middleware('permission:view purchase reports');
        Route::get('cash-flow',              [ReportController::class, 'cashFlow'])->middleware('permission:view accounting statements');
        Route::get('stock-summary',          [ReportController::class, 'stockSummary'])->middleware('permission:view inventory');
    });

    /* ------------------ Alternative dashboard endpoints ---------------- */
    Route::get('products/low-stock',   [DashboardController::class, 'lowStockProducts'])->middleware('permission:view low stock products');
    Route::get('customers/top',        [DashboardController::class, 'topCustomers'])->middleware('permission:view customers top');
    Route::get('vendors/top',          [DashboardController::class, 'topVendors'])->middleware('permission:view vendors top');
    Route::get('purchases/due',        [DashboardController::class, 'purchaseDueInvoices'])->middleware('permission:view purchases due');
    Route::get('admin/login-activity', [DashboardController::class, 'loginActivity'])->middleware('permission:view admin login activity');

    /* --------------------- Customer custom routes ---------------------- */
    Route::get('customers/template',                  [CustomerController::class, 'template'])
        ->middleware('permission:download customer template');
    Route::post('customers/import',                   [CustomerController::class, 'import'])
        ->middleware('permission:import customers');
    Route::get('customers/{customer}/ledger',         [CustomerController::class, 'ledger'])
        ->middleware('permission:view customers');
    Route::get('customers/{customer}/ledger-entries', [CustomerController::class, 'ledgerEntries'])
        ->middleware('permission:view customers');
    Route::get('ledger',                              [CustomerController::class, 'ledgerByCustomer'])
        ->middleware('permission:view customers');

    /* ============================== RBAC ============================== */
    Route::get('permissions/me', [UserAccessController::class, 'myPermissions']);

    // Roles
    Route::get('roles',             [UserAccessController::class, 'roles'])->middleware('permission:view roles');
    Route::get('roles/{roleId}',    [UserAccessController::class, 'showRole'])->middleware('permission:view roles');
    Route::post('roles',            [UserAccessController::class, 'storeRole'])->middleware('permission:create roles');
    Route::put('roles/{roleId}',    [UserAccessController::class, 'updateRole'])->middleware('permission:edit roles');
    Route::delete('roles/{roleId}', [UserAccessController::class, 'destroyRole'])->middleware('permission:delete roles');

    Route::get('permissions',                   [UserAccessController::class, 'permissions'])->middleware('permission:view permissions');
    Route::post('permissions',                  [UserAccessController::class, 'storePermission'])->middleware('permission:create permissions');
    Route::put('permissions/{permissionId}',    [UserAccessController::class, 'updatePermission'])->middleware('permission:edit permissions');
    Route::delete('permissions/{permissionId}', [UserAccessController::class, 'destroyPermission'])->middleware('permission:delete permissions');

    // Users
    Route::get('users',                           [UserAccessController::class, 'users'])->middleware('permission:view users');
    Route::get('users/banned',                    [UserAccessController::class, 'bannedUsers'])->middleware('permission:view users');
    Route::get('users/{userId}',                  [UserAccessController::class, 'showUser'])->whereNumber('userId')->middleware('permission:view users');
    Route::post('users',                          [UserAccessController::class, 'storeUser'])->middleware('permission:create users');
    Route::put('users/{userId}',                  [UserAccessController::class, 'updateUser'])->middleware('permission:edit users');
    Route::delete('users/{userId}',               [UserAccessController::class, 'destroyUser'])->middleware('permission:delete users');
    Route::post('users/{userId}/roles',           [UserAccessController::class, 'assignRolesToUser'])->middleware('permission:assign roles to user');
    Route::post('users/{userId}/ban',             [UserAccessController::class, 'banUser'])->middleware('permission:view users');
    Route::post('users/{userId}/unban',           [UserAccessController::class, 'unbanUser'])->middleware('permission:view users');
    Route::post('users/{userId}/reset-lockout',   [UserAccessController::class, 'resetLockout'])->middleware('permission:view users');
    Route::post('users/{userId}/force-logout',    [UserAccessController::class, 'forceLogoutUser'])->middleware('permission:view users');
    Route::get('users/{userId}/security-overview',[UserAccessController::class, 'userSecurityOverview'])->middleware('permission:view users');

    /* ====================== Core Business Resources ==================== */
    /* Each resource is written as explicit per-method routes because
       apiResource(...)->middleware([...]) does NOT support per-action mapping. */

    /* ---------------------------- Companies ---------------------------- */
    Route::prefix('companies')->group(function () {
        Route::get('/',                [CompanyController::class, 'index'])->middleware('permission:view companies');
        Route::get('/{company}',       [CompanyController::class, 'show'])->middleware('permission:view companies');
        Route::post('/',               [CompanyController::class, 'store'])->middleware('permission:create companies');
        Route::match(['put', 'patch'], '/{company}', [CompanyController::class, 'update'])->middleware('permission:edit companies');
        Route::delete('/{company}',    [CompanyController::class, 'destroy'])->middleware('permission:delete companies');
    });

    /* ---------------------------- Branches ----------------------------- */
    Route::prefix('branches')->group(function () {
        Route::get('/',                [BranchController::class, 'index'])->middleware('permission:view branches');
        Route::get('/{branch}',        [BranchController::class, 'show'])->middleware('permission:view branches');
        Route::post('/',               [BranchController::class, 'store'])->middleware('permission:create branches');
        Route::match(['put', 'patch'], '/{branch}', [BranchController::class, 'update'])->middleware('permission:edit branches');
        Route::delete('/{branch}',     [BranchController::class, 'destroy'])->middleware('permission:delete branches');
    });

    /* --------------------------- Warehouses ---------------------------- */
    Route::prefix('warehouses')->group(function () {
        Route::get('/',                [WarehouseController::class, 'index'])->middleware('permission:view warehouses');
        Route::get('/{warehouse}',     [WarehouseController::class, 'show'])->middleware('permission:view warehouses');
        Route::post('/',               [WarehouseController::class, 'store'])->middleware('permission:create warehouses');
        Route::match(['put', 'patch'], '/{warehouse}', [WarehouseController::class, 'update'])->middleware('permission:edit warehouses');
        Route::delete('/{warehouse}',  [WarehouseController::class, 'destroy'])->middleware('permission:delete warehouses');
    });

    /* ---------------------------- Customers ---------------------------- */
    Route::prefix('customers')->group(function () {
        Route::get('/',                          [CustomerController::class, 'index'])->middleware('permission:view customers');
        Route::get('/{customer}/customer-360',   [CustomerController::class, 'customer360'])->middleware('permission:view customers');
        Route::post('/{customer}/archive',       [CustomerController::class, 'toggleArchive'])->middleware('permission:edit customers');
        Route::get('/{customer}',                [CustomerController::class, 'show'])->middleware('permission:view customers');
        Route::post('/',                         [CustomerController::class, 'store'])->middleware('permission:create customers');
        Route::match(['put', 'patch'], '/{customer}', [CustomerController::class, 'update'])->middleware('permission:edit customers');
        Route::delete('/{customer}',             [CustomerController::class, 'destroy'])->middleware('permission:delete customers');
    });

    /* ---------------------------- Suppliers ---------------------------- */
    Route::get('suppliers', [SupplierController::class, 'index'])
        ->middleware('permission:view suppliers')->name('suppliers.index');
    Route::get('suppliers/{supplier}', [SupplierController::class, 'show'])
        ->middleware('permission:view suppliers')->name('suppliers.show');
    Route::post('suppliers', [SupplierController::class, 'store'])
        ->middleware('permission:create suppliers')->name('suppliers.store');
    Route::match(['put', 'patch'], 'suppliers/{supplier}', [SupplierController::class, 'update'])
        ->middleware('permission:edit suppliers')->name('suppliers.update');
    Route::delete('suppliers/{supplier}', [SupplierController::class, 'destroy'])
        ->middleware('permission:delete suppliers')->name('suppliers.destroy');

    /* ---------------------------- Products ----------------------------- */
    Route::prefix('products')->group(function () {
        Route::get('/',                [ProductController::class, 'index'])->middleware('permission:view products');
        Route::get('/all',             [ProductController::class, 'all'])->middleware('permission:view products');
        Route::get('/low-stock',       [DashboardController::class, 'lowStockProducts'])->middleware('permission:view low stock products');
        Route::get('/generate-sku',    [ProductController::class, 'generateSku'])->middleware('permission:view products,create products');
        Route::post('/bulk-edit',      [ProductController::class, 'bulkEdit'])->middleware('permission:edit products');
        Route::get('/{product}',       [ProductController::class, 'show'])->middleware('permission:view products');
        Route::post('/',               [ProductController::class, 'store'])->middleware('permission:create products');
        Route::match(['put', 'patch'], '/{product}', [ProductController::class, 'update'])->middleware('permission:edit products');
        Route::delete('/{product}',    [ProductController::class, 'destroy'])->middleware('permission:delete products');
    });

    /* ----------------------------- Orders ------------------------------ */
    Route::prefix('orders')->group(function () {
        Route::get('/',                [OrderController::class, 'index'])->middleware('permission:view orders');
        Route::get('/{order}',         [OrderController::class, 'show'])->middleware('permission:view orders');
        Route::post('/',               [OrderController::class, 'store'])->middleware('permission:create orders');
        Route::match(['put', 'patch'], '/{order}', [OrderController::class, 'update'])->middleware('permission:edit orders');
        Route::delete('/{order}',      [OrderController::class, 'destroy'])->middleware('permission:delete orders');
    });

    /* ---------------------------- Payments ----------------------------- */
    Route::prefix('payments')->group(function () {
        Route::get('/',                [PaymentController::class, 'index'])->middleware('permission:view payments');
        Route::get('/{payment}',       [PaymentController::class, 'show'])->middleware('permission:view payments');
        Route::post('/',               [PaymentController::class, 'store'])->middleware('permission:create payments');
        Route::match(['put', 'patch'], '/{payment}', [PaymentController::class, 'update'])->middleware('permission:edit payments');
        Route::delete('/{payment}',    [PaymentController::class, 'destroy'])->middleware('permission:delete payments');
    });

    Route::prefix('income-expenses')->group(function () {
        Route::get('/', [IncomeExpenseController::class, 'index'])->middleware('permission:income_expenses.view');
        Route::get('/dashboard', [IncomeExpenseController::class, 'dashboard'])->middleware('permission:income_expenses.view');
        Route::get('/export', [IncomeExpenseController::class, 'export'])->middleware('permission:income_expenses.export');
        Route::get('/{financialEntry}', [IncomeExpenseController::class, 'show'])->middleware('permission:income_expenses.view');
        Route::post('/', [IncomeExpenseController::class, 'store'])->middleware('permission:income_expenses.create');
        Route::match(['put', 'patch'], '/{financialEntry}', [IncomeExpenseController::class, 'update'])->middleware('permission:income_expenses.edit');
        Route::delete('/{financialEntry}', [IncomeExpenseController::class, 'destroy'])->middleware('permission:income_expenses.delete');
    });

    Route::prefix('financial-categories')->group(function () {
        Route::get('/', [FinancialCategoryController::class, 'index'])->middleware('permission:income_expenses.manage_categories');
        Route::post('/', [FinancialCategoryController::class, 'store'])->middleware('permission:income_expenses.manage_categories');
        Route::match(['put', 'patch'], '/{financialCategory}', [FinancialCategoryController::class, 'update'])->middleware('permission:income_expenses.manage_categories');
        Route::delete('/{financialCategory}', [FinancialCategoryController::class, 'destroy'])->middleware('permission:income_expenses.manage_categories');
    });

    Route::get('financial-accounts', [AccountingController::class, 'index'])->middleware('permission:income_expenses.manage_accounts');
    Route::post('financial-accounts', [AccountingController::class, 'store'])->middleware('permission:income_expenses.manage_accounts');
    Route::put('financial-accounts/{id}', [AccountingController::class, 'update'])->middleware('permission:income_expenses.manage_accounts');

    /* --------------------------- Biometric ----------------------------- */
    Route::post('biometric/device/register', [BiometricDeviceController::class, 'register'])->middleware('permission:register biometric device');
    Route::post('biometric/device/{device}/enroll', [BiometricDeviceController::class, 'startEnrollment'])->middleware('permission:start device enrollment');

    Route::get('financial-entries', [FinancialEntryController::class, 'index'])->middleware('permission:view payments');
    Route::post('financial-entries', [FinancialEntryController::class, 'store'])->middleware('permission:create payments');
    Route::put('financial-entries/{financialEntry}', [FinancialEntryController::class, 'update'])->middleware('permission:edit payments');
    Route::delete('financial-entries/{financialEntry}', [FinancialEntryController::class, 'destroy'])->middleware('permission:delete payments');

    /* ---------------------------- Dealers ------------------------------ */
    Route::prefix('dealers')->group(function () {
        Route::get('/',                [DealerController::class, 'index'])->middleware('permission:view dealers');
        Route::get('/{dealer}',        [DealerController::class, 'show'])->middleware('permission:view dealers');
        Route::post('/',               [DealerController::class, 'store'])->middleware('permission:create dealers');
        Route::match(['put', 'patch'], '/{dealer}', [DealerController::class, 'update'])->middleware('permission:edit dealers');
        Route::delete('/{dealer}',     [DealerController::class, 'destroy'])->middleware('permission:delete dealers');
    });


    /* ---------------------------- Quotations --------------------------- */
    Route::get('quotations/next-number', [QuotationController::class, 'nextNumber'])->middleware('permission:quotations.create');
    Route::get('quotations/summary',     [QuotationController::class, 'summary'])->middleware('permission:quotations.view');
    Route::prefix('quotations')->group(function () {
        Route::get('/',                        [QuotationController::class, 'index'])->middleware('permission:quotations.view');
        Route::get('/{quotation}',             [QuotationController::class, 'show'])->middleware('permission:quotations.view');
        Route::post('/',                       [QuotationController::class, 'store'])->middleware('permission:quotations.create');
        Route::match(['put', 'patch'], '/{quotation}', [QuotationController::class, 'update'])->middleware('permission:quotations.update');
        Route::patch('/{quotation}/status',    [QuotationController::class, 'updateStatus'])->middleware('permission:quotations.update');
        Route::post('/{quotation}/convert',    [QuotationController::class, 'convert'])->middleware('permission:quotations.convert,create invoices,invoices.create,quotations.update,edit sales quotations,quotations.create,create sales quotations,quotations.view,view sales quotations');
        Route::post('/{quotation}/duplicate',  [QuotationController::class, 'duplicate'])->middleware('permission:quotations.create');
        Route::delete('/{quotation}',          [QuotationController::class, 'destroy'])->middleware('permission:quotations.delete');
    });

    /* ------------------------------ CRM Leads ---------------------------- */
    Route::get('leads/summary', [LeadController::class, 'summary'])->middleware('permission:leads.view');
    Route::prefix('leads')->group(function () {
        Route::get('/',                     [LeadController::class, 'index'])->middleware('permission:leads.view');
        Route::get('/{lead}',               [LeadController::class, 'show'])->middleware('permission:leads.view');
        Route::post('/',                    [LeadController::class, 'store'])->middleware('permission:leads.create');
        Route::match(['put', 'patch'], '/{lead}', [LeadController::class, 'update'])->middleware('permission:leads.update');
        Route::patch('/{lead}/stage',       [LeadController::class, 'updateStage'])->middleware('permission:leads.update');
        Route::post('/{lead}/activities',   [LeadController::class, 'addActivity'])->middleware('permission:leads.update');
        Route::post('/{lead}/convert',      [LeadController::class, 'convert'])->middleware('permission:leads.convert,create customers,customers.create,leads.update,edit leads,leads.create,create leads,leads.view,view leads,customers.view,view customers');
        Route::delete('/{lead}',            [LeadController::class, 'destroy'])->middleware('permission:leads.delete');
    });

    /* ------------------------------ Contacts ---------------------------- */
    Route::get('contacts/summary',          [ContactController::class, 'summary'])->middleware('permission:contacts.view');
    Route::get('contacts/check-duplicate',  [ContactController::class, 'checkDuplicate'])->middleware('permission:contacts.view');
    Route::prefix('contacts')->group(function () {
        Route::get('/',                     [ContactController::class, 'index'])->middleware('permission:contacts.view');
        Route::get('/{contact}',            [ContactController::class, 'show'])->middleware('permission:contacts.view');
        Route::post('/',                    [ContactController::class, 'store'])->middleware('permission:contacts.create');
        Route::match(['put', 'patch'], '/{contact}', [ContactController::class, 'update'])->middleware('permission:contacts.update');
        Route::delete('/{contact}',         [ContactController::class, 'destroy'])->middleware('permission:contacts.delete');
    });

    /* ---------------------------- Opportunities ------------------------- */
    Route::get('opportunities/summary', [OpportunityController::class, 'summary'])->middleware('permission:opportunities.view');
    Route::prefix('opportunities')->group(function () {
        Route::get('/',                     [OpportunityController::class, 'index'])->middleware('permission:opportunities.view');
        Route::post('/',                    [OpportunityController::class, 'store'])->middleware('permission:opportunities.create');
        Route::match(['put', 'patch'], '/{opportunity}', [OpportunityController::class, 'update'])->middleware('permission:opportunities.update');
        Route::delete('/{opportunity}',     [OpportunityController::class, 'destroy'])->middleware('permission:opportunities.delete');
    });

    /* ----------------------------- Campaigns ---------------------------- */
    Route::get('campaigns/summary', [CampaignController::class, 'summary'])->middleware('permission:campaigns.view');
    Route::prefix('campaigns')->group(function () {
        Route::get('/',                     [CampaignController::class, 'index'])->middleware('permission:campaigns.view');
        Route::post('/',                    [CampaignController::class, 'store'])->middleware('permission:campaigns.create');
        Route::match(['put', 'patch'], '/{campaign}', [CampaignController::class, 'update'])->middleware('permission:campaigns.update');
        Route::delete('/{campaign}',        [CampaignController::class, 'destroy'])->middleware('permission:campaigns.delete');
    });

    /* ---------------------------- Invoices ----------------------------- */
    Route::get('invoices/next-number',  [InvoiceController::class, 'nextNumber'])->middleware('permission:create invoices');
    Route::post('invoices/from-order',  [InvoiceController::class, 'fromOrder'])->middleware('permission:create invoice from order');
    Route::get('invoices/summary',      [InvoiceController::class, 'summary'])->middleware('permission:view invoices');
    Route::post('invoices/bulk-status', [InvoiceController::class, 'bulkStatus'])->middleware('permission:edit invoices');
    Route::post('invoices/bulk-delete', [InvoiceController::class, 'bulkDelete'])->middleware('permission:delete invoices');

    Route::prefix('invoices')->group(function () {
        Route::get('/',                [InvoiceController::class, 'index'])->middleware('permission:view invoices');
        Route::get('/{invoice}',       [InvoiceController::class, 'show'])->middleware('permission:view invoices');
        Route::post('/',               [InvoiceController::class, 'store'])->middleware('permission:create invoices');
        Route::match(['put', 'patch'], '/{invoice}', [InvoiceController::class, 'update'])->middleware('permission:edit invoices');
        Route::delete('/{invoice}',    [InvoiceController::class, 'destroy'])->middleware('permission:delete invoices');
        Route::patch('/{invoice}/delivery-status', [InvoiceController::class, 'updateDeliveryStatus'])->middleware('permission:edit invoices');
        Route::patch('/{invoice}/items/{item}/delivery-status', [InvoiceController::class, 'updateItemDeliveryStatus'])->middleware('permission:edit invoices');
    });

    /* ------------------------ Purchase Invoices ------------------------ */
    Route::prefix('purchase-invoices')->group(function () {
        Route::get('/',                       [PurchaseInvoiceController::class, 'index'])->middleware('permission:view purchase invoices');
        Route::get('/{purchase_invoice}',     [PurchaseInvoiceController::class, 'show'])->middleware('permission:view purchase invoices');
        Route::post('/',                      [PurchaseInvoiceController::class, 'store'])->middleware('permission:create purchase invoices');
        Route::match(['put', 'patch'], '/{purchase_invoice}', [PurchaseInvoiceController::class, 'update'])->middleware('permission:edit purchase invoices');
        Route::delete('/{purchase_invoice}',  [PurchaseInvoiceController::class, 'destroy'])->middleware('permission:delete purchase invoices');
        Route::post('/{purchase_invoice}/payments', [PurchaseInvoiceController::class, 'addPayment'])->middleware('permission:add purchase invoice payment');
    });

    /* ---------------------------- Employees ---------------------------- */
    Route::prefix('employees')->group(function () {
        Route::get('/',                [EmployeeController::class, 'index'])->middleware('permission:view employees');
        Route::get('/{employee}',      [EmployeeController::class, 'show'])->middleware('permission:view employees');
        Route::post('/',               [EmployeeController::class, 'store'])->middleware('permission:create employees');
        Route::match(['put', 'patch'], '/{employee}', [EmployeeController::class, 'update'])->middleware('permission:edit employees');
        Route::delete('/{employee}',   [EmployeeController::class, 'destroy'])->middleware('permission:delete employees');
    });

    /* --------------------------- Accounting ---------------------------- */
    Route::get('accounting/summary',          [AccountingController::class, 'summary'])->middleware('permission:view accounting summary');
    Route::get('accounting/accounts',         [AccountingController::class, 'index'])->middleware('permission:view accounting accounts');
    Route::get('accounting/accounts/{id}',    [AccountingController::class, 'show'])->middleware('permission:view accounting accounts');
    Route::get('accounting/journals',         [AccountingController::class, 'journals'])->middleware('permission:view accounting journals');
    Route::get('accounting/statements',       [AccountingController::class, 'statements'])->middleware('permission:view accounting statements');

    Route::post('accounting/accounts',        [AccountingController::class, 'store'])->middleware('permission:create accounting accounts');
    Route::put('accounting/accounts/{id}',    [AccountingController::class, 'update'])->middleware('permission:edit accounting accounts');
    Route::delete('accounting/accounts/{id}', [AccountingController::class, 'destroy'])->middleware('permission:delete accounting accounts');
    Route::post('accounting/journals',        [AccountingController::class, 'storeJournal'])->middleware('permission:create accounting journals');

    /* ---------------------- Banking & Reconciliation --------------------- */
    Route::prefix('banking')->group(function () {
        // Accounts & Balances
        Route::get('accounts',                      [\App\Http\Controllers\Api\BankCashController::class, 'indexAccounts'])->middleware('permission:banking.accounts.view');
        Route::post('accounts',                     [\App\Http\Controllers\Api\BankCashController::class, 'storeAccount'])->middleware('permission:banking.accounts.manage');
        Route::get('accounts/{id}',                 [\App\Http\Controllers\Api\BankCashController::class, 'showAccount'])->middleware('permission:banking.accounts.view');
        Route::put('accounts/{id}',                 [\App\Http\Controllers\Api\BankCashController::class, 'updateAccount'])->middleware('permission:banking.accounts.manage');
        Route::delete('accounts/{id}',              [\App\Http\Controllers\Api\BankCashController::class, 'destroyAccount'])->middleware('permission:banking.accounts.manage');

        // Ledger & Internal Transfers
        Route::get('transactions',                  [\App\Http\Controllers\Api\BankCashController::class, 'indexAllTransactions'])->middleware('permission:banking.transactions.view,reports.accounts.view');
        Route::get('accounts/{id}/transactions',    [\App\Http\Controllers\Api\BankCashController::class, 'indexTransactions'])->middleware('permission:banking.transactions.view');
        Route::post('transfers',                    [\App\Http\Controllers\Api\BankCashController::class, 'storeTransfer'])->middleware('permission:banking.transactions.manage');
        Route::post('adjustments',                  [\App\Http\Controllers\Api\BankCashController::class, 'storeAdjustment'])->middleware('permission:banking.transactions.manage');

        // Daily Cash Register Closing
        Route::get('cash-closings',                 [\App\Http\Controllers\Api\BankCashController::class, 'indexCashClosings'])->middleware('permission:banking.cash_closing.view,reports.accounts.view');
        Route::post('cash-closings',                [\App\Http\Controllers\Api\BankCashController::class, 'storeCashClosing'])->middleware('permission:banking.cash_closing.manage');
        Route::post('cash-closings/{id}/approve',   [\App\Http\Controllers\Api\BankCashController::class, 'approveCashClosing'])->middleware('permission:banking.cash_closing.approve');
        Route::post('cash-closings/{id}/reject',    [\App\Http\Controllers\Api\BankCashController::class, 'rejectCashClosing'])->middleware('permission:banking.cash_closing.approve');
        Route::get('cash-summary',                 [\App\Http\Controllers\Api\BankCashController::class, 'dailyCashSummary'])->middleware('permission:banking.cash_closing.view,reports.accounts.view');

        // Statements Upload & History
        Route::post('statements/upload',            [\App\Http\Controllers\Api\BankCashController::class, 'uploadStatement'])->middleware('permission:banking.statements.upload');
        Route::get('statements',                    [\App\Http\Controllers\Api\BankCashController::class, 'indexStatements'])->middleware('permission:banking.reconciliation.view');
        Route::get('statements/{id}/summary',       [\App\Http\Controllers\Api\BankCashController::class, 'statementSummary'])->middleware('permission:banking.reconciliation.view');
        Route::delete('statements/{id}',            [\App\Http\Controllers\Api\BankCashController::class, 'destroyStatement'])->middleware('permission:banking.statements.upload');
        Route::post('statements/{id}/process-full-reconciliation', [\App\Http\Controllers\Api\BankCashController::class, 'processFullReconciliation'])->middleware('permission:banking.reconciliation.manage');

        // Reconciliation Workspace & AI Assistant
        Route::get('reconciliation/dashboard',      [\App\Http\Controllers\Api\BankCashController::class, 'reconciliationDashboard'])->middleware('permission:banking.reconciliation.view');
        Route::get('reconciliation/{accountId}',    [\App\Http\Controllers\Api\BankCashController::class, 'reconciliationWorkspace'])->middleware('permission:banking.reconciliation.view');
        Route::post('reconciliation/match',         [\App\Http\Controllers\Api\BankCashController::class, 'confirmMatch'])->middleware('permission:banking.reconciliation.manage');
        Route::post('reconciliation/unmatch',       [\App\Http\Controllers\Api\BankCashController::class, 'unmatch'])->middleware('permission:banking.reconciliation.manage');
        Route::post('reconciliation/auto-match',    [\App\Http\Controllers\Api\BankCashController::class, 'autoMatch'])->middleware('permission:banking.reconciliation.manage');
        Route::post('reconciliation/ai-suggest',    [\App\Http\Controllers\Api\BankCashController::class, 'aiSuggest'])->middleware('permission:banking.reconciliation.view');
        Route::post('reconciliation/adjustments',   [\App\Http\Controllers\Api\BankCashController::class, 'createReconciliationAdjustment'])->middleware('permission:banking.reconciliation.manage');
        Route::post('reconciliation/quick-record',  [\App\Http\Controllers\Api\BankCashController::class, 'quickCreatePaymentAndMatch'])->middleware('permission:banking.reconciliation.manage');

        // Expense Drafts & Ignore Actions
        Route::post('reconciliation/expense-drafts/{statementTxnId}/approve',   [\App\Http\Controllers\Api\BankCashController::class, 'approveExpenseDraft'])->middleware('permission:banking.reconciliation.manage');
        Route::put('reconciliation/expense-drafts/{statementTxnId}',            [\App\Http\Controllers\Api\BankCashController::class, 'editExpenseDraft'])->middleware('permission:banking.reconciliation.manage');
        Route::post('reconciliation/expense-drafts/{statementTxnId}/reject',    [\App\Http\Controllers\Api\BankCashController::class, 'rejectExpenseDraft'])->middleware('permission:banking.reconciliation.manage');
        Route::post('reconciliation/transactions/{statementTxnId}/ignore',      [\App\Http\Controllers\Api\BankCashController::class, 'ignoreStatementTransaction'])->middleware('permission:banking.reconciliation.manage');
        Route::post('reconciliation/transactions/{statementTxnId}/unignore',    [\App\Http\Controllers\Api\BankCashController::class, 'unignoreStatementTransaction'])->middleware('permission:banking.reconciliation.manage');

        // Learned Reconciliation Rules
        Route::get('rules',              [\App\Http\Controllers\Api\BankCashController::class, 'indexRules'])->middleware('permission:banking.reconciliation.view');
        Route::post('rules',             [\App\Http\Controllers\Api\BankCashController::class, 'storeRule'])->middleware('permission:banking.reconciliation.manage');
        Route::put('rules/{id}',         [\App\Http\Controllers\Api\BankCashController::class, 'updateRule'])->middleware('permission:banking.reconciliation.manage');
        Route::delete('rules/{id}',      [\App\Http\Controllers\Api\BankCashController::class, 'deleteRule'])->middleware('permission:banking.reconciliation.manage');
        Route::post('rules/{id}/toggle', [\App\Http\Controllers\Api\BankCashController::class, 'toggleRule'])->middleware('permission:banking.reconciliation.manage');
    });

    /* ---------------------- Cash Drawer Management ---------------------- */
    Route::prefix('finance/cash-drawers')->group(function () {
        Route::get('',                             [CashDrawerController::class, 'index'])->middleware('permission:finance.cash_drawer.view,view accounting accounts');
        Route::post('',                            [CashDrawerController::class, 'store'])->middleware('permission:finance.cash_drawer.create,finance.cash_drawer.manage');
        Route::get('{id}',                         [CashDrawerController::class, 'show'])->middleware('permission:finance.cash_drawer.view,view accounting accounts');
        Route::put('{id}',                         [CashDrawerController::class, 'update'])->middleware('permission:finance.cash_drawer.manage');
        Route::get('{id}/sessions',                [CashDrawerController::class, 'listSessions'])->middleware('permission:finance.cash_drawer.view,view accounting accounts');
        Route::get('{id}/active-session',          [CashDrawerController::class, 'getActiveSession'])->middleware('permission:finance.cash_drawer.view,view accounting accounts');
        Route::post('{id}/open',                   [CashDrawerController::class, 'openSession'])->middleware('permission:finance.cash_drawer.open,finance.cash_drawer.manage');
        Route::post('{id}/close',                  [CashDrawerController::class, 'closeSession'])->middleware('permission:finance.cash_drawer.close,finance.cash_drawer.manage');
        Route::post('{id}/cash-in',                [CashDrawerController::class, 'cashIn'])->middleware('permission:finance.cash_drawer.cash_in,finance.cash_drawer.manage');
        Route::post('{id}/cash-out',               [CashDrawerController::class, 'cashOut'])->middleware('permission:finance.cash_drawer.cash_out,finance.cash_drawer.manage');
        Route::get('{id}/transactions',            [CashDrawerController::class, 'listTransactions'])->middleware('permission:finance.cash_drawer.view,view accounting accounts');
    });

    Route::prefix('finance/cash-drawer')->group(function () {
        Route::get('dashboard',                    [CashDrawerController::class, 'dashboard'])->middleware('permission:finance.cash_drawer.view,view accounting accounts');
        Route::get('transactions',                 [CashDrawerController::class, 'listTransactions'])->middleware('permission:finance.cash_drawer.view,view accounting accounts');
        Route::get('denominations',                [CashDrawerController::class, 'getDenominations'])->middleware('permission:finance.cash_drawer.view,view accounting accounts');
        Route::get('audit-logs',                   [CashDrawerController::class, 'auditLogs'])->middleware('permission:finance.cash_drawer.manage,audit.logs.view');
        Route::get('export-csv',                   [CashDrawerController::class, 'exportCsv'])->middleware('permission:finance.cash_drawer.report,finance.cash_drawer.view');
        Route::post('sessions/{id}/review-discrepancy', [CashDrawerController::class, 'reviewDiscrepancy'])->middleware('permission:finance.cash_drawer.approve,finance.cash_drawer.manage');
    });

    Route::prefix('finance/cash-drawer-transfers')->group(function () {
        Route::get('',                             [CashDrawerController::class, 'listTransfers'])->middleware('permission:finance.cash_drawer.transfer,finance.cash_drawer.view');
        Route::post('',                            [CashDrawerController::class, 'initiateTransfer'])->middleware('permission:finance.cash_drawer.transfer,finance.cash_drawer.manage');
        Route::post('{id}/receive',                [CashDrawerController::class, 'receiveTransfer'])->middleware('permission:finance.cash_drawer.transfer,finance.cash_drawer.manage');
        Route::post('{id}/reject',                 [CashDrawerController::class, 'rejectTransfer'])->middleware('permission:finance.cash_drawer.transfer,finance.cash_drawer.manage');
    });

    /* ------------------------------ Sales ------------------------------ */
    Route::get('sales/summary',           [SalesController::class, 'summary'])->middleware('permission:view sales summary');
    Route::get('sales/orders',            [SalesController::class, 'orders'])->middleware('permission:view sales orders');
    Route::get('sales/quotations',        [SalesController::class, 'quotations'])->middleware('permission:view sales quotations');
    Route::get('sales/proformas',         [SalesController::class, 'proformas'])->middleware('permission:view sales proformas');
    Route::get('sales/delivery-challans', [SalesController::class, 'deliveryChallans'])->middleware('permission:view sales delivery challans');
    Route::get('sales/returns',           [SalesController::class, 'returns'])->middleware('permission:view sales returns');
    Route::get('sales/reports',           [SalesController::class, 'reports'])->middleware('permission:view sales reports');

    Route::post('sales/orders',            [SalesController::class, 'storeOrder'])->middleware('permission:create sales orders');
    Route::post('sales/quotations',        [SalesController::class, 'storeQuotation'])->middleware('permission:create sales quotations');
    Route::post('sales/proformas',         [SalesController::class, 'storeProforma'])->middleware('permission:create sales proformas');
    Route::post('sales/delivery-challans', [SalesController::class, 'storeDeliveryChallan'])->middleware('permission:create sales delivery challans');
    Route::post('sales/returns',           [SalesController::class, 'storeReturn'])->middleware('permission:create sales returns');

    /* ---------------------------- Purchases ---------------------------- */
    Route::get('purchases/summary', [SalesController::class, 'purchaseSummary'])->middleware('permission:view purchase summary');
    Route::get('purchases/orders',  [SalesController::class, 'purchaseOrders'])->middleware('permission:view purchase orders');
    Route::get('purchases/bills',   [SalesController::class, 'purchaseBills'])->middleware('permission:view purchase bills');
    Route::get('purchases/grn',     [SalesController::class, 'grn'])->middleware('permission:view purchase grn');
    Route::get('purchases/returns', [SalesController::class, 'purchaseReturns'])->middleware('permission:view purchase returns');
    Route::get('purchases/reports', [SalesController::class, 'purchaseReports'])->middleware('permission:view purchase reports');

    Route::post('purchases/orders', [SalesController::class, 'storePurchaseOrder'])->middleware('permission:create purchase orders');
    Route::post('purchases/bills',  [SalesController::class, 'storePurchaseBill'])->middleware('permission:create purchase bills');

    /* --------------------------- Attendance ---------------------------- */
    Route::get('attendance/today-summary',   [AttendanceController::class, 'todaySummary'])->middleware('permission:view today attendance summary');
    Route::get('attendance/today-employees', [AttendanceController::class, 'todayEmployees'])->middleware('permission:view today employees attendance');
    Route::get('attendance',                 [AttendanceController::class, 'index'])->middleware('permission:view attendance');
    Route::get('attendance/{attendance}',    [AttendanceController::class, 'show'])->middleware('permission:view attendance');

    Route::post('attendance',                              [AttendanceController::class, 'store'])->middleware('permission:create attendance');
    Route::match(['put', 'patch'], 'attendance/{attendance}', [AttendanceController::class, 'update'])->middleware('permission:edit attendance');
    Route::delete('attendance/{attendance}',               [AttendanceController::class, 'destroy'])->middleware('permission:delete attendance');
    Route::post('attendance/bulk-status',                  [AttendanceController::class, 'bulkUpdateStatus'])->middleware('permission:bulk update attendance');
    Route::post('attendance/bulk-delete',                  [AttendanceController::class, 'bulkDelete'])->middleware('permission:bulk delete attendance');

    /* ----------------------------- Payroll ----------------------------- */
    Route::prefix('payroll')->group(function () {

        // Root
        Route::get('/',     [PayrollController::class, 'index'])->middleware('permission:view payroll');
        Route::post('/',    [PayrollController::class, 'store'])->middleware('permission:create payroll');
        Route::post('/run', [PayrollController::class, 'runPayroll'])->middleware('permission:run payroll');

        // Advances
        Route::get('/advances',           [PayrollController::class, 'advances'])->middleware('permission:view payroll advances');
        Route::get('/advances/{advance}', [PayrollController::class, 'showAdvance'])->middleware('permission:view payroll advances');
        Route::post('/advances',          [PayrollController::class, 'storeAdvance'])->middleware('permission:create payroll advances');
        Route::match(['put', 'patch'], '/advances/{advance}', [PayrollController::class, 'updateAdvance'])->middleware('permission:edit payroll advances');
        Route::delete('/advances/{advance}',                  [PayrollController::class, 'destroyAdvance'])->middleware('permission:delete payroll advances');

        // Leaves
        Route::get('/leaves',         [PayrollController::class, 'leaves'])->middleware('permission:view payroll leaves');
        Route::get('/leaves/{leave}', [PayrollController::class, 'showLeave'])->middleware('permission:view payroll leaves');
        Route::post('/leaves',        [PayrollController::class, 'storeLeave'])->middleware('permission:create payroll leaves');
        Route::match(['put', 'patch'], '/leaves/{leave}', [PayrollController::class, 'updateLeave'])->middleware('permission:edit payroll leaves');
        Route::delete('/leaves/{leave}',                  [PayrollController::class, 'destroyLeave'])->middleware('permission:delete payroll leaves');

        // Shifts
        Route::get('/shifts',         [PayrollController::class, 'shifts'])->middleware('permission:view payroll shifts');
        Route::get('/shifts/{shift}', [PayrollController::class, 'showShift'])->middleware('permission:view payroll shifts');
        Route::post('/shifts',        [PayrollController::class, 'storeShift'])->middleware('permission:create payroll shifts');
        Route::match(['put', 'patch'], '/shifts/{shift}', [PayrollController::class, 'updateShift'])->middleware('permission:edit payroll shifts');
        Route::delete('/shifts/{shift}',                  [PayrollController::class, 'destroyShift'])->middleware('permission:delete payroll shifts');

        // Loans
        Route::get('/loans',        [PayrollController::class, 'loans'])->middleware('permission:view payroll loans');
        Route::get('/loans/{loan}', [PayrollController::class, 'showLoan'])->middleware('permission:view payroll loans');
        Route::post('/loans',       [PayrollController::class, 'storeLoan'])->middleware('permission:create payroll loans');
        Route::match(['put', 'patch'], '/loans/{loan}', [PayrollController::class, 'updateLoan'])->middleware('permission:edit payroll loans');
        Route::delete('/loans/{loan}',                  [PayrollController::class, 'destroyLoan'])->middleware('permission:delete payroll loans');

        // Payslips
        Route::get('/payslips',           [PayrollController::class, 'payslips'])->middleware('permission:view payroll payslips');
        Route::get('/payslips/{payslip}', [PayrollController::class, 'showPayslip'])->middleware('permission:view payroll payslips');
        Route::post('/payslips',          [PayrollController::class, 'storePayslip'])->middleware('permission:create payroll payslips');
        Route::match(['put', 'patch'], '/payslips/{payslip}', [PayrollController::class, 'updatePayslip'])->middleware('permission:edit payroll payslips');
        Route::delete('/payslips/{payslip}',                  [PayrollController::class, 'destroyPayslip'])->middleware('permission:delete payroll payslips');

        // Wildcards — MUST remain last.
        Route::get('/{payroll}',         [PayrollController::class, 'show'])->middleware('permission:view payroll');
        Route::match(['put', 'patch'], '/{payroll}', [PayrollController::class, 'update'])->middleware('permission:edit payroll');
        Route::delete('/{payroll}',      [PayrollController::class, 'destroy'])->middleware('permission:delete payroll');
        Route::get('/{payroll}/payslip', [PayrollController::class, 'payslip'])->middleware('permission:generate payroll payslip');
    });

    /* --------------------------- Biometric ----------------------------- */
    Route::get('biometric/devices',         [BiometricDeviceController::class, 'index'])->middleware('permission:view biometric devices');
    Route::get('biometric/scans',           [BiometricScanController::class, 'liveFeed'])->middleware('permission:view biometric scans');
    Route::get('biometric/offline/pending', [BiometricScanController::class, 'pendingQueue'])->middleware('permission:view biometric offline pending');
    Route::get('biometric/unknown-fingers', [BiometricScanController::class, 'unknownFingers'])->middleware('permission:view unknown fingers');

    Route::post('biometric/templates/upload',   [FingerprintController::class, 'upload'])->middleware('permission:upload fingerprint templates');
    Route::post('biometric/templates/download', [FingerprintController::class, 'downloadAll'])->middleware('permission:download fingerprint templates');
    Route::delete('biometric/templates/{id}',   [FingerprintController::class, 'destroy'])->middleware('permission:delete fingerprint templates');

    Route::post('biometric/device/{device}/sync',     [BiometricDeviceController::class, 'sync'])->middleware('permission:sync biometric device');
    Route::post('biometric/device/{device}/settings', [BiometricDeviceController::class, 'updateSettings'])->middleware('permission:update biometric device settings');
    Route::post('biometric/device/{device}/restart',  [BiometricDeviceController::class, 'restart'])->middleware('permission:restart biometric device');
    Route::put('biometric/device/{device}',           [BiometricDeviceController::class, 'update'])->middleware('permission:update biometric device');
    Route::delete('biometric/device/{device}',        [BiometricDeviceController::class, 'destroy'])->middleware('permission:delete biometric device');

    /* --------------------------- File Uploads -------------------------- */
    Route::get('uploads',          [UploadController::class, 'index'])->middleware('permission:view uploads');
    Route::post('uploads',         [UploadController::class, 'store'])->middleware('permission:create uploads');
    Route::post('uploads/folders', [UploadController::class, 'createFolder'])->middleware('permission:create upload folder');
    Route::post('uploads/delete',  [UploadController::class, 'destroy'])->middleware('permission:delete upload');

    /* ----------------------------- Settings ---------------------------- */
    Route::get('settings',             [SettingsController::class, 'index'])->middleware('permission:view settings');
    Route::get('settings/export',      [SettingsController::class, 'export'])->middleware('permission:export settings');
    Route::get('settings/quickstart',  [SettingsController::class, 'quickstart'])->middleware('permission:view settings quickstart');
    Route::get('settings/cache/clear', [SettingsController::class, 'clearCache'])->middleware('permission:clear settings cache');
    Route::get('settings/{key}',       [SettingsController::class, 'show'])->middleware('permission:view settings');

    Route::post('settings',          [SettingsController::class, 'store'])->middleware('permission:create settings');
    Route::post('settings/import',   [SettingsController::class, 'import'])->middleware('permission:import settings');
    Route::post('settings/bulk',     [SettingsController::class, 'bulkUpdate'])->middleware('permission:bulk update settings');
    Route::put('settings/{key}',     [SettingsController::class, 'update'])->middleware('permission:edit settings');
    Route::delete('settings/{key}',  [SettingsController::class, 'destroy'])->middleware('permission:delete settings');

    /* --------------------------- Notifications -------------------------- */
    Route::get('notifications', [NotificationController::class, 'index'])->middleware('permission:notifications.view');
    Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount'])->middleware('permission:notifications.view');
    Route::get('notifications/summary', [NotificationController::class, 'summaryStats'])->middleware('permission:notifications.view');
    Route::get('notifications/providers', [NotificationController::class, 'providerStatus'])->middleware('permission:notifications.providers,notifications.view');
    Route::get('notifications/providers/whatsapp/status', [\App\Http\Controllers\Api\WhatsAppProviderController::class, 'status'])->middleware('permission:notifications.providers,notifications.whatsapp.view');
    Route::get('notifications/providers/whatsapp/qr', [\App\Http\Controllers\Api\WhatsAppProviderController::class, 'qr'])->middleware('permission:notifications.providers,notifications.whatsapp.view');
    Route::post('notifications/providers/whatsapp/connect', [\App\Http\Controllers\Api\WhatsAppProviderController::class, 'connect'])->middleware('permission:notifications.whatsapp.connect,notifications.providers');
    Route::post('notifications/providers/whatsapp/logout', [\App\Http\Controllers\Api\WhatsAppProviderController::class, 'logout'])->middleware('permission:notifications.whatsapp.logout,notifications.providers');
    Route::post('notifications/providers/whatsapp/test', [\App\Http\Controllers\Api\WhatsAppProviderController::class, 'test'])->middleware('permission:notifications.whatsapp.test,notifications.send');
    Route::get('notifications/deliveries', [NotificationController::class, 'deliveryLogs'])->middleware('permission:notifications.delivery,notifications.view');
    Route::get('notifications/recipients', [NotificationController::class, 'recipientOptions'])->middleware('permission:notifications.send');
    Route::get('notifications/{id}', [NotificationController::class, 'show'])->whereNumber('id')->middleware('permission:notifications.view');
    Route::post('notifications/send', [NotificationController::class, 'send'])->middleware(['permission:notifications.send', 'throttle:60,1']);
    Route::post('notifications/test', [NotificationController::class, 'sendTest'])->middleware(['permission:notifications.send', 'throttle:30,1']);
    Route::post('notifications/attachments', [NotificationController::class, 'uploadAttachment'])->middleware(['permission:notifications.send', 'throttle:30,1']);
    Route::post('notifications/push-subscriptions', [NotificationController::class, 'savePushSubscription']);
    Route::delete('notifications/push-subscriptions', [NotificationController::class, 'removePushSubscriptions']);
    Route::get('notifications/templates', [NotificationController::class, 'templates'])->middleware('permission:notifications.templates,notifications.view');
    Route::post('notifications/templates', [NotificationController::class, 'storeTemplate'])->middleware('permission:notifications.templates');
    Route::post('notifications/templates/{id}/test', [NotificationController::class, 'testTemplate'])->whereNumber('id')->middleware(['permission:notifications.templates', 'permission:notifications.send']);
    Route::put('notifications/templates/{id}', [NotificationController::class, 'updateTemplate'])->whereNumber('id')->middleware('permission:notifications.templates');
    Route::delete('notifications/templates/{id}', [NotificationController::class, 'deleteTemplate'])->whereNumber('id')->middleware('permission:notifications.templates');
    Route::get('notifications/automation', [NotificationController::class, 'automationRules'])->middleware('permission:notifications.automation,notifications.view');
    Route::post('notifications/automation', [NotificationController::class, 'storeAutomationRule'])->middleware('permission:notifications.automation');
    Route::put('notifications/automation/{id}', [NotificationController::class, 'updateAutomationRule'])->whereNumber('id')->middleware('permission:notifications.automation');
    Route::delete('notifications/automation/{id}', [NotificationController::class, 'deleteAutomationRule'])->whereNumber('id')->middleware('permission:notifications.automation');
    Route::get('notifications/scheduled', [NotificationController::class, 'scheduledNotifications'])->middleware('permission:notifications.schedule,notifications.view');
    Route::post('notifications/scheduled', [NotificationController::class, 'storeScheduledNotification'])->middleware('permission:notifications.schedule');
    Route::put('notifications/scheduled/{id}', [NotificationController::class, 'updateScheduledNotification'])->whereNumber('id')->middleware('permission:notifications.schedule');
    Route::delete('notifications/scheduled/{id}', [NotificationController::class, 'deleteScheduledNotification'])->whereNumber('id')->middleware('permission:notifications.schedule');
    Route::get('notifications/queue', [NotificationController::class, 'queueItems'])->middleware('permission:notifications.queue,notifications.view');
    Route::post('notifications/queue/{id}/retry', [NotificationController::class, 'retryQueueItem'])->whereNumber('id')->middleware('permission:notifications.queue');
    Route::post('notifications/queue/{id}/cancel', [NotificationController::class, 'cancelQueueItem'])->whereNumber('id')->middleware('permission:notifications.queue');
    Route::post('notifications/{id}/read', [NotificationController::class, 'markRead'])->whereNumber('id')->middleware('permission:notifications.view');
    Route::post('notifications/{id}/unread', [NotificationController::class, 'markUnread'])->whereNumber('id')->middleware('permission:notifications.view');
    Route::post('notifications/{id}/archive', [NotificationController::class, 'archive'])->whereNumber('id')->middleware('permission:notifications.view');
    Route::delete('notifications/{id}', [NotificationController::class, 'destroy'])->whereNumber('id')->middleware('permission:notifications.view');
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead'])->middleware('permission:notifications.view');
    Route::get('notifications/preferences', [NotificationController::class, 'preferences'])->middleware('permission:notifications.preferences,notifications.view');
    Route::put('notifications/preferences', [NotificationController::class, 'updatePreferences'])->middleware('permission:notifications.preferences');
    Route::get('notifications/fallback', [NotificationController::class, 'fallback'])->middleware('permission:notifications.providers,notifications.view');
    Route::put('notifications/fallback', [NotificationController::class, 'updateFallback'])->middleware('permission:notifications.manage');
    Route::get('notification-settings', [NotificationController::class, 'settings'])->middleware('permission:notifications.manage,notifications.view');
    Route::put('notification-settings', [NotificationController::class, 'updateSettings'])->middleware('permission:notifications.manage');

    Route::get('daily-summary/settings', [NotificationController::class, 'settings'])->middleware('permission:daily_summary.configure,reports.daily_summary.configure');
    Route::put('daily-summary/settings', [NotificationController::class, 'updateSettings'])->middleware('permission:daily_summary.configure,reports.daily_summary.configure');
    Route::get('daily-summary', [NotificationController::class, 'dailySummary'])->middleware(['permission:daily_summary.view,reports.daily_summary.view', 'permission:view dashboard profit']);

    /* --------------------------- API Tokens ---------------------------- */
    Route::prefix('api-tokens')->middleware('permission:view settings')->group(function () {
        Route::get('/',          [SettingsController::class, 'listTokens']);
        Route::post('/generate', [SettingsController::class, 'generateToken']);
        Route::delete('/{id}',   [SettingsController::class, 'revokeToken']);
        Route::delete('/',       [SettingsController::class, 'revokeAllTokens']);
    });

    /* ---------------------- Connected Apps & Multi-App Launcher ------- */
    Route::get('apps/launcher', [ConnectedAppController::class, 'launcher']);
    Route::apiResource('connected-apps', ConnectedAppController::class)->middleware('permission:view settings');
    Route::post('connected-apps/{app}/regenerate-token', [ConnectedAppController::class, 'regenerateToken'])->middleware('permission:edit settings');
    Route::get('v1/apps/{identifier}/profile', [ConnectedAppController::class, 'profile']);
    Route::post('v1/apps/{identifier}/logout', [ConnectedAppController::class, 'logout']);

    /* ---------------------- Security Firewall & Sessions --------------- */
    Route::prefix('security')->group(function () {
        Route::get('dashboard',        [SecurityFirewallController::class, 'dashboard'])->middleware('permission:view settings');
        Route::get('ip-rules',         [SecurityFirewallController::class, 'index'])->middleware('permission:view settings');
        Route::post('ip-rules',        [SecurityFirewallController::class, 'store'])->middleware('permission:edit settings');
        Route::delete('ip-rules/{id}', [SecurityFirewallController::class, 'destroy'])->middleware('permission:edit settings');
        Route::get('login-attempts',   [SecurityFirewallController::class, 'loginAttempts'])->middleware('permission:view settings');
        Route::get('active-sessions',  [SecurityFirewallController::class, 'activeSessions'])->middleware('permission:view settings');
        Route::delete('sessions/{id}', [SecurityFirewallController::class, 'terminateAdminSession'])->middleware('permission:edit settings');
    });

    /* ---------------------- Admin Control Center ----------------------- */
    Route::get('admin/system-overview', [AdminControlCenterController::class, 'overview'])->middleware('permission:view settings');

    /* ------------------------- Health / Backups ------------------------ */
    Route::get('health/cron',               [HealthController::class, 'cron'])->middleware('permission:view health cron,view settings');
    Route::get('health/backups',            [BackupController::class, 'index'])->middleware('permission:view backups');
    Route::post('health/backup',            [BackupController::class, 'store'])->middleware('permission:create backup');

    Route::get('backups',                   [BackupController::class, 'index'])->middleware('permission:view backups');
    Route::post('backups',                  [BackupController::class, 'store'])->middleware('permission:create backup');
    Route::post('backups/restore',          [BackupController::class, 'restore'])->middleware('permission:restore backup');
    Route::get('backups/{backup}/download', [BackupController::class, 'download'])->middleware('permission:download backup');

    /* ---------------- Google Drive Backup & Disaster Recovery --------------- */
    Route::prefix('backup-system')->group(function () {
        Route::get('status', [BackupSystemController::class, 'status'])->middleware('permission:system.backups.view');
        Route::get('connections', [BackupSystemController::class, 'listConnections'])->middleware('permission:system.backups.view');
        Route::post('connections/{id}/test', [BackupSystemController::class, 'testConnection'])->middleware('permission:system.backups.view');
        Route::post('connections/{id}/disconnect', [BackupSystemController::class, 'disconnect'])->middleware('permission:system.backups.settings');

        Route::get('oauth/redirect', [BackupSystemController::class, 'getOAuthRedirect'])->middleware('permission:system.backups.settings');
        Route::post('oauth/callback', [BackupSystemController::class, 'handleOAuthCallback'])->middleware('permission:system.backups.settings');

        Route::get('drive/folders', [BackupSystemController::class, 'listDriveFolders'])->middleware('permission:system.backups.settings');
        Route::post('drive/folders', [BackupSystemController::class, 'createDriveFolder'])->middleware('permission:system.backups.settings');

        Route::get('direct-download', [BackupSystemController::class, 'directDownload'])->middleware('permission:system.backups.view');
        Route::get('runs', [BackupSystemController::class, 'listRuns'])->middleware('permission:system.backups.view');
        Route::get('runs/{id}', [BackupSystemController::class, 'showRun'])->middleware('permission:system.backups.view');
        Route::get('runs/{id}/download', [BackupSystemController::class, 'downloadRun'])->middleware('permission:system.backups.view');
        Route::post('runs', [BackupSystemController::class, 'triggerRun'])->middleware('permission:system.backups.create');
        Route::post('runs/{id}/verify', [BackupSystemController::class, 'verifyRun'])->middleware('permission:system.backups.view');
        Route::post('runs/{id}/restore', [BackupSystemController::class, 'restoreRun'])->middleware('permission:system.backups.restore');
        Route::delete('runs/{id}', [BackupSystemController::class, 'destroyRun'])->middleware('permission:system.backups.delete');

        Route::get('settings', [BackupSystemController::class, 'getSettings'])->middleware('permission:system.backups.settings');
        Route::put('settings', [BackupSystemController::class, 'updateSettings'])->middleware('permission:system.backups.settings');
        Route::post('retention/run', [BackupSystemController::class, 'runRetention'])->middleware('permission:system.backups.delete');
        Route::get('audit-logs', [BackupSystemController::class, 'auditLogs'])->middleware('permission:system.backups.view');
    });


    /* ----------------------------- Marketing --------------------------- */
    Route::prefix('marketing')->group(function () {
        Route::get('dashboard', [MarketingController::class, 'dashboard'])->middleware('permission:view marketing dashboard');
        Route::get('accounts',  [MarketingController::class, 'accounts'])->middleware('permission:view marketing accounts');
        Route::get('posts',     [MarketingController::class, 'posts'])->middleware('permission:view marketing posts');
        Route::get('calendar',  [MarketingController::class, 'calendar'])->middleware('permission:view marketing calendar');
        Route::get('analytics', [MarketingController::class, 'analytics'])->middleware('permission:view marketing analytics');
        Route::get('inbox',     [MarketingController::class, 'inbox'])->middleware('permission:view marketing inbox');

        Route::post('posts',          [MarketingController::class, 'store'])->middleware('permission:create marketing posts');
        Route::put('posts/{post}',    [MarketingController::class, 'update'])->middleware('permission:edit marketing posts');
        Route::delete('posts/{post}', [MarketingController::class, 'destroy'])->middleware('permission:delete marketing posts');
    });

    /* --------------------------- Social OAuth -------------------------- */
    Route::get('/auth/{provider}/redirect-url', [SocialAuthController::class, 'redirectUrl']);
    Route::get('/auth/{provider}/redirect',     [SocialAuthController::class, 'redirect']);
    Route::post('/auth/{provider}/disconnect',  [SocialAuthController::class, 'disconnect']);

    /* --------------------------- Unified Inbox ------------------------- */
    Route::get('/inbox',                 [InboxController::class, 'index'])->middleware('permission:view marketing inbox');
    Route::post('/inbox/{message}/read', [InboxController::class, 'markAsRead'])->middleware('permission:view marketing inbox');
    Route::post('/inbox/email/send',     [InboxController::class, 'sendEmail'])->middleware('permission:create marketing posts');
    Route::post('/inbox/whatsapp/send',  [InboxController::class, 'sendWhatsApp'])->middleware('permission:create marketing posts');

    /* -------------------------------- AI ------------------------------- */
    Route::get('ai/assistant/insights', [\App\Http\Controllers\Api\AiController::class, 'insights'])->middleware('permission:view ai assistant insights');
    Route::get('ai/assistant/config', [\App\Http\Controllers\Api\AiController::class, 'assistantConfig'])->middleware('permission:settings.ai.view');
    Route::post('ai/assistant/test', [\App\Http\Controllers\Api\AiController::class, 'testAssistantConfig'])->middleware('permission:settings.ai.view');
    Route::put('ai/assistant/config', [\App\Http\Controllers\Api\AiController::class, 'saveAssistantConfig'])->middleware('permission:settings.ai.update');
    Route::delete('ai/assistant/config', [\App\Http\Controllers\Api\AiController::class, 'clearAssistantConfig'])->middleware('permission:settings.ai.update');
    Route::post('ai/assistant/chat',    [\App\Http\Controllers\Api\AiController::class, 'chat'])->middleware('permission:chat with ai assistant');
    Route::post('ai/assistant/voice',   [\App\Http\Controllers\Api\AiController::class, 'voice'])->middleware('permission:chat with ai assistant');
    Route::post('ai/assistant/live-converse', [\App\Http\Controllers\Api\AiController::class, 'liveConverse'])->middleware('permission:chat with ai assistant');
    Route::post('ai/products/bulk-suggest',   [\App\Http\Controllers\Api\AiController::class, 'bulkSuggest'])->middleware('permission:edit products');
    Route::post('ai/products/suggest',        [\App\Http\Controllers\Api\AiController::class, 'suggestProduct'])->middleware('permission:create products,edit products');

    Route::post('dashboard/ai/ask',             [\App\Http\Controllers\Api\DashboardAiController::class, 'ask'])->middleware('permission:ask dashboard ai');
    Route::post('dashboard/ai/business-health', [\App\Http\Controllers\Api\DashboardAiController::class, 'businessHealth'])->middleware('permission:view dashboard ai business health');
    Route::post('dashboard/ai/forecast',        [\App\Http\Controllers\Api\DashboardAiController::class, 'forecast'])->middleware('permission:view dashboard ai forecast');
    Route::post('dashboard/ai/generic',         [\App\Http\Controllers\Api\DashboardAiController::class, 'genericAnalysis'])->middleware('permission:view dashboard ai generic analysis');

    Route::get('ai/providers',            [\App\Http\Controllers\Api\AiProviderController::class, 'index'])->middleware('permission:view ai providers');
    Route::post('ai/providers',           [\App\Http\Controllers\Api\AiProviderController::class, 'store'])->middleware('permission:create ai providers');
    Route::put('ai/providers/{provider}', [\App\Http\Controllers\Api\AiProviderController::class, 'update'])->middleware('permission:edit ai providers');

    Route::prefix('gemini')->group(function () {
        Route::post('voice',    [GeminiVoiceController::class, 'processVoice'])->middleware('permission:chat with ai assistant');
        Route::post('chat',     [GeminiVoiceController::class, 'chat'])->middleware('permission:chat with ai assistant');
        Route::get('insights',  [GeminiVoiceController::class, 'dashboardInsights'])->middleware('permission:view ai assistant insights');
        Route::get('test',      [GeminiVoiceController::class, 'testConnection'])->middleware('permission:view ai providers');
        Route::post('live-token', [GeminiVoiceController::class, 'liveToken'])->middleware('permission:chat with ai assistant');
    });

    /* -------------------- Inventory Import / Export -------------------- */
    Route::post('/inventory/import',  [ProductController::class, 'import'])->middleware('permission:import inventory');
    Route::get('/inventory/export',   [ProductController::class, 'export'])->middleware('permission:export inventory');
    Route::get('/inventory/template', [ProductController::class, 'template'])->middleware('permission:download inventory template');

    /* -------------------- Product Details / Stock ---------------------- */
    Route::get('/products/{product}/inventory-summary',      [ProductController::class, 'inventorySummary'])->middleware('permission:view products');
    Route::get('/products/{product}/warehouse-stock',        [ProductController::class, 'warehouseStock'])->middleware('permission:view products');
    Route::get('/products/{product}/stock-movements',        [ProductController::class, 'stockMovements'])->middleware('permission:view products');
    Route::get('/products/{product}/purchase-price-history', [ProductController::class, 'purchasePriceHistory'])->middleware('permission:view products');
    Route::get('/products/{product}/transactions',           [ProductController::class, 'transactions'])->middleware('permission:view products');
    Route::get('/products/{product}/party-transactions',     [ProductController::class, 'partyTransactions'])->middleware('permission:view products');
    Route::get('/products/{product}/price-list',             [ProductController::class, 'priceList'])->middleware('permission:view products');

    Route::post('/products/{product}/stock-in',  [ProductController::class, 'stockIn'])->middleware('permission:edit products');
    Route::post('/products/{product}/stock-out', [ProductController::class, 'stockOut'])->middleware('permission:edit products');
    Route::post('/products/{product}/transfer',  [ProductController::class, 'transfer'])->middleware('permission:edit products');
    Route::post('/products/{product}/regenerate-barcode', [ProductController::class, 'regenerateBarcode'])->middleware('permission:edit products');
    Route::post('/products/{product}/regenerate-qr',      [ProductController::class, 'regenerateQr'])->middleware('permission:edit products');
    Route::get('/products/lookup-barcode/{barcode}',      [ProductController::class, 'lookupBarcode'])->middleware('permission:view products');

    /* --------------------------- Sales Returns ------------------------- */
    // Update / Delete now check the correct permissions (sales.returns.update
    // and sales.returns.delete) instead of the previous over-permissive
    // `create sales returns` fallback.
    Route::prefix('sales-returns')->group(function () {
        Route::get('/',                                [SalesReturnController::class, 'index'])->middleware('permission:sales.returns.view,sales.returns.view');
        Route::get('/search/products',                 [SalesReturnController::class, 'searchProducts'])->middleware('permission:sales.returns.view');
        Route::get('/search/invoices',                 [SalesReturnController::class, 'searchInvoices'])->middleware('permission:sales.returns.view');
        Route::get('/search/customers',                [SalesReturnController::class, 'searchCustomers'])->middleware('permission:sales.returns.view');
        Route::get('/customer/{customerId}/invoices',  [SalesReturnController::class, 'getCustomerInvoices'])->middleware('permission:sales.returns.view');
        Route::get('/invoice/{invoiceId}/items',       [SalesReturnController::class, 'getInvoiceItems'])->middleware('permission:sales.returns.view');
        Route::get('/invoice/{invoiceId}/details',     [SalesReturnController::class, 'getInvoiceDetails'])->middleware('permission:sales.returns.view');
        Route::get('/{id}',                            [SalesReturnController::class, 'show'])->middleware('permission:sales.returns.view');

        Route::post('/',       [SalesReturnController::class, 'store'])->middleware('permission:sales.returns.create');
        Route::put('/{id}',    [SalesReturnController::class, 'update'])->middleware('permission:sales.returns.update');
        Route::delete('/{id}', [SalesReturnController::class, 'destroy'])->middleware('permission:sales.returns.delete');
    });

    /* -------------------------- Email Webhook -------------------------- */
    Route::post('/webhooks/email', [EmailWebhookController::class, 'handle'])->middleware('permission:view marketing inbox');

    /* ---------------------- Legacy profitability ----------------------- */
    Route::get('/reports/invoice-profitability', [ReportController::class, 'invoiceProfitability'])->middleware('permission:view dashboard profit');

    /* ---------------------- Thermal Printing & Bluetooth ---------------- */
    // Printer Management
    Route::prefix('printers')->group(function () {
        Route::get('/',                          [PrinterController::class, 'index'])->middleware('permission:printers.view');
        Route::post('/',                         [PrinterController::class, 'store'])->middleware('permission:printers.manage');
        Route::get('/{printer}',                 [PrinterController::class, 'show'])->middleware('permission:printers.view');
        Route::match(['put', 'patch'], '/{printer}', [PrinterController::class, 'update'])->middleware('permission:printers.manage');
        Route::delete('/{printer}',              [PrinterController::class, 'destroy'])->middleware('permission:printers.manage');
        Route::post('/{printer}/default',        [PrinterController::class, 'setDefault'])->middleware('permission:printing.manage_defaults');
        Route::post('/{printer}/test-connection',[PrinterController::class, 'testConnection'])->middleware('permission:printers.connect');
    });

    // Thermal Paper Profiles
    Route::prefix('thermal-paper-profiles')->group(function () {
        Route::get('/',                          [ThermalPaperProfileController::class, 'index'])->middleware('permission:printing.manage_paper_profiles');
        Route::post('/',                         [ThermalPaperProfileController::class, 'store'])->middleware('permission:printing.manage_paper_profiles');
        Route::get('/{paperProfile}',            [ThermalPaperProfileController::class, 'show'])->middleware('permission:printing.manage_paper_profiles');
        Route::match(['put', 'patch'], '/{paperProfile}', [ThermalPaperProfileController::class, 'update'])->middleware('permission:printing.manage_paper_profiles');
        Route::delete('/{paperProfile}',         [ThermalPaperProfileController::class, 'destroy'])->middleware('permission:printing.manage_paper_profiles');
        Route::post('/{paperProfile}/default',   [ThermalPaperProfileController::class, 'setDefault'])->middleware('permission:printing.manage_defaults');
    });

    // Label Templates
    Route::prefix('label-templates')->group(function () {
        Route::get('/',                          [LabelTemplateController::class, 'index'])->middleware('permission:printing.manage_templates');
        Route::post('/',                         [LabelTemplateController::class, 'store'])->middleware('permission:printing.manage_templates');
        Route::get('/{template}',                [LabelTemplateController::class, 'show'])->middleware('permission:printing.manage_templates');
        Route::match(['put', 'patch'], '/{template}', [LabelTemplateController::class, 'update'])->middleware('permission:printing.manage_templates');
        Route::delete('/{template}',             [LabelTemplateController::class, 'destroy'])->middleware('permission:printing.manage_templates');
        Route::post('/{template}/duplicate',     [LabelTemplateController::class, 'duplicate'])->middleware('permission:printing.manage_templates');
        Route::post('/{template}/default',       [LabelTemplateController::class, 'setDefault'])->middleware('permission:printing.manage_defaults');
    });

    // Print Jobs & Queue
    Route::prefix('print-jobs')->group(function () {
        Route::get('/',                          [PrintJobController::class, 'index'])->middleware('permission:printing.view_history');
        Route::get('/queue',                     [PrintJobController::class, 'queue'])->middleware('permission:printing.print_labels');
        Route::post('/',                         [PrintJobController::class, 'store'])->middleware('permission:printing.print_labels,printing.quick_print,printing.bulk_print');
        Route::get('/{printJob}',                [PrintJobController::class, 'show'])->middleware('permission:printing.view_history');
        Route::patch('/{printJob}/status',       [PrintJobController::class, 'updateStatus'])->middleware('permission:printing.print_labels');
        Route::post('/{printJob}/cancel',        [PrintJobController::class, 'cancel'])->middleware('permission:printing.cancel_jobs');
        Route::post('/{printJob}/reprint',       [PrintJobController::class, 'reprint'])->middleware('permission:printing.reprint');
    });

    /* ---------------------- Smart Delivery & Logistics Management ---------------------- */
    Route::prefix('deliveries')->group(function () {
        Route::get('dashboard',                 [DeliveryController::class, 'dashboard'])->middleware('permission:delivery.orders.view');
        Route::get('orders',                    [DeliveryController::class, 'orders'])->middleware('permission:delivery.orders.view');
        Route::post('orders',                   [DeliveryController::class, 'createOrder'])->middleware('permission:delivery.orders.create');
        Route::get('orders/{order}',            [DeliveryController::class, 'showOrder'])->middleware('permission:delivery.orders.view');
        Route::put('orders/{order}',            [DeliveryController::class, 'updateOrder'])->middleware('permission:delivery.orders.update');
        Route::post('orders/{order}/schedule',  [DeliveryController::class, 'scheduleOrder'])->middleware('permission:delivery.orders.schedule');
        Route::post('orders/{order}/cancel',    [DeliveryController::class, 'cancelOrder'])->middleware('permission:delivery.orders.cancel');
        Route::post('orders/{order}/confirm',   [DeliveryController::class, 'confirmOrder'])->middleware('permission:delivery.orders.confirm');

        // Vehicles
        Route::get('vehicles',                  [DeliveryController::class, 'vehicles'])->middleware('permission:delivery.vehicles.view');
        Route::post('vehicles',                 [DeliveryController::class, 'createVehicle'])->middleware('permission:delivery.vehicles.create');
        Route::put('vehicles/{vehicle}',        [DeliveryController::class, 'updateVehicle'])->middleware('permission:delivery.vehicles.update');

        // Drivers
        Route::get('drivers',                   [DeliveryController::class, 'drivers'])->middleware('permission:delivery.drivers.view');
        Route::post('drivers',                  [DeliveryController::class, 'createDriver'])->middleware('permission:delivery.drivers.manage');
        Route::put('drivers/{driver}',          [DeliveryController::class, 'updateDriver'])->middleware('permission:delivery.drivers.manage');

        // Trips & Route Planning
        Route::get('trips',                     [DeliveryController::class, 'trips'])->middleware('permission:delivery.trips.view');
        Route::post('trips',                    [DeliveryController::class, 'createTrip'])->middleware('permission:delivery.trips.create');
        Route::get('trips/{trip}',              [DeliveryController::class, 'showTrip'])->middleware('permission:delivery.trips.view');
        Route::post('trips/{trip}/reorder',     [DeliveryController::class, 'reorderStops'])->middleware('permission:delivery.routes.manage');
        Route::post('trips/{trip}/confirm-loading', [DeliveryController::class, 'confirmLoading'])->middleware('permission:delivery.loading.confirm');
        Route::post('trips/{trip}/dispatch',    [DeliveryController::class, 'dispatchTrip'])->middleware('permission:delivery.trips.dispatch');
        Route::post('trips/{trip}/close',       [DeliveryController::class, 'closeTrip'])->middleware('permission:delivery.trips.close');

        // Godown Loading Items
        Route::put('loading-items/{loadingItem}', [DeliveryController::class, 'updateLoadingItem'])->middleware('permission:delivery.loading.manage');

        // Transportation Cost Allocation
        Route::post('trips/{trip}/allocate-cost', [DeliveryController::class, 'allocateCost'])->middleware('permission:delivery.costs.manage');
        Route::post('trips/{trip}/approve-cost',  [DeliveryController::class, 'approveCost'])->middleware('permission:delivery.costs.approve');
        Route::put('cost-allocations/{allocation}', [DeliveryController::class, 'adjustAllocation'])->middleware('permission:delivery.costs.manage');

        // Calendar & Areas
        Route::get('calendar',                  [DeliveryController::class, 'calendar'])->middleware('permission:delivery.orders.view');
        Route::get('areas',                     [DeliveryController::class, 'areas'])->middleware('permission:delivery.orders.view');
        Route::post('areas',                    [DeliveryController::class, 'createArea'])->middleware('permission:delivery.routes.manage');

        // Reports
        Route::get('reports',                   [DeliveryController::class, 'reports'])->middleware('permission:delivery.reports.view');
        Route::get('reports/export',            [DeliveryController::class, 'exportReport'])->middleware('permission:delivery.reports.export');
    });
});
