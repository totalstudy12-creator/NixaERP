<?php

use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BiometricAttendanceController;
use App\Http\Controllers\Api\BiometricDeviceController;
use App\Http\Controllers\Api\BiometricScanController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\AccountingController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DealerController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\FingerprintController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\PurchaseInvoiceController;
use App\Http\Controllers\Api\OfflineSyncController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PayrollController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\SalesController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\Api\UserAccessController;
use App\Http\Controllers\Api\BackupController;
use App\Http\Controllers\Api\WarehouseController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\MarketingController;
use App\Http\Controllers\Api\SocialAuthController;
use App\Http\Controllers\Api\InboxController;
use App\Http\Controllers\Api\WhatsAppWebhookController;
use App\Http\Controllers\Api\EmailWebhookController;
use App\Http\Controllers\Api\GeminiVoiceController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Middleware\ApiTokenMiddleware;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// ---------- Health check ----------
Route::get('status', fn() => response()->json(['status' => 'ok', 'service' => 'Business OS API']));

// ---------- Auth (Public) ----------
Route::post('login', [AuthController::class, 'login'])->name('login');
Route::post('logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
Route::get('me', [AuthController::class, 'me'])->middleware('auth:sanctum');
Route::get('profile', [AuthController::class, 'profile'])->middleware('auth:sanctum');
Route::put('profile', [AuthController::class, 'updateProfile'])->middleware('auth:sanctum');

// ---------- Public biometric device endpoints (no auth) ----------
Route::post('biometric/device/register', [BiometricDeviceController::class, 'register']);
Route::post('biometric/device/heartbeat', [BiometricDeviceController::class, 'heartbeat']);
Route::post('biometric/attendance', [BiometricAttendanceController::class, 'store']);
Route::post('biometric/offline/sync', [OfflineSyncController::class, 'batchSync']);

// Public suppliers
Route::apiResource('suppliers', SupplierController::class);

// Public enrollment check
Route::get('biometric/device/pending-enrollment', [BiometricDeviceController::class, 'pendingEnrollment']);

// Enrollment status reporting
Route::post('biometric/device/{device}/enroll', [BiometricDeviceController::class, 'startEnrollment']);
Route::post('biometric/device/{device}/enroll-status', [BiometricDeviceController::class, 'updateEnrollmentStatus']);

// ---------- Protected routes (frontend + admin) ----------
Route::middleware(['auth:sanctum'])->group(function () {

    // ---------- Dashboard & Report endpoints ----------
    Route::prefix('dashboard')->group(function () {
        Route::get('analytics', [DashboardController::class, 'analytics']);
        Route::get('payments-summary', [DashboardController::class, 'paymentSummary']);
        Route::get('inventory-summary', [DashboardController::class, 'inventorySummary']);
        Route::get('invoices-count-summary', [DashboardController::class, 'invoiceCountSummary']);
        Route::get('invoices-amount-summary', [DashboardController::class, 'invoiceAmountSummary']);
        Route::get('business-health', [DashboardController::class, 'businessHealth']);
        Route::get('forecast', [DashboardController::class, 'forecast']);
        Route::get('risks', [DashboardController::class, 'risks']);
        Route::get('anomalies', [DashboardController::class, 'anomalies']);
        Route::get('rankings', [DashboardController::class, 'rankings']);
        Route::get('hero-product', [DashboardController::class, 'heroProduct']);
        Route::get('hero-customer', [DashboardController::class, 'heroCustomer']);
        Route::get('district-sales', [DashboardController::class, 'districtSales']);
        Route::get('new-vs-existing-customers', [DashboardController::class, 'newVsExistingCustomers']);
        Route::get('profit', [DashboardController::class, 'profit']);
        Route::get('profit-summary', [DashboardController::class, 'profitSummary']);
        Route::get('low-stock', [DashboardController::class, 'lowStockProducts']);
        Route::get('top-customers', [DashboardController::class, 'topCustomers']);
        Route::get('top-vendors', [DashboardController::class, 'topVendors']);
        Route::get('purchase-due', [DashboardController::class, 'purchaseDueInvoices']);
        Route::get('login-activity', [DashboardController::class, 'loginActivity']);
    });

    // Reports
    Route::prefix('reports')->group(function () {
        Route::get('all', [DashboardController::class, 'allReports']);
        Route::get('top-selling-products', [DashboardController::class, 'topSellingProducts']);
        Route::get('least-selling-products', [DashboardController::class, 'leastSellingProducts']);

        // Advanced reports
        Route::get('summary', [ReportController::class, 'summary']);

        // Sales reports
        Route::get('sales-summary', [ReportController::class, 'salesSummary']);
        Route::get('sales-register', [ReportController::class, 'salesRegister']);
        Route::get('sales-by-customer', [ReportController::class, 'salesByCustomer']);
        Route::get('sales-by-product', [ReportController::class, 'salesByProduct']);
        Route::get('gst-sales', [ReportController::class, 'gstSalesReport']);
        Route::get('outstanding-sales', [ReportController::class, 'outstandingSales']);

        // Purchase reports
        Route::get('purchase-summary', [ReportController::class, 'purchaseSummary']);
        Route::get('purchase-register', [ReportController::class, 'purchaseRegister']);
        Route::get('purchase-by-vendor', [ReportController::class, 'purchaseByVendor']);
        Route::get('outstanding-purchases', [ReportController::class, 'outstandingPurchases']);

        // Accounting reports
        Route::get('general-ledger', [ReportController::class, 'generalLedger']);
        Route::get('customer-ledger', [ReportController::class, 'customerLedger']);
        Route::get('profit-loss', [ReportController::class, 'profitLoss']);
        Route::get('profit-loss/summary', [ReportController::class, 'profitLossSummary']);
        Route::get('profit-loss/products', [ReportController::class, 'profitLossProducts']);
        Route::get('profit-loss/customers', [ReportController::class, 'profitLossCustomers']);
        Route::get('profit-loss/branches', [ReportController::class, 'profitLossBranches']);
        Route::get('profit-loss/monthly', [ReportController::class, 'profitLossMonthly']);
        Route::get('profit-loss/yearly', [ReportController::class, 'profitLossYearly']);
        Route::get('profit-loss/comparison', [ReportController::class, 'profitLossComparison']);
        Route::get('profit-loss/invoices', [ReportController::class, 'invoiceProfitability']);
        Route::get('profit-loss/invoices/{invoice}', [ReportController::class, 'invoiceProfitabilityDetail']);
        Route::get('product-profitability', [ReportController::class, 'productProfitability']);

        // GST reports
        Route::get('gst-summary', [ReportController::class, 'gstSummary']);
    });

    // Alternative dashboard endpoints
    Route::get('products/low-stock', [DashboardController::class, 'lowStockProducts']);
    Route::get('customers/top', [DashboardController::class, 'topCustomers']);
    Route::get('vendors/top', [DashboardController::class, 'topVendors']);
    Route::get('purchases/due', [DashboardController::class, 'purchaseDueInvoices']);
    Route::get('admin/login-activity', [DashboardController::class, 'loginActivity']);

    // Core business resources
    Route::apiResource('companies', CompanyController::class);
    Route::apiResource('branches', BranchController::class);
    Route::apiResource('warehouses', WarehouseController::class);
    Route::apiResource('customers', CustomerController::class);
    Route::apiResource('products', ProductController::class);
    Route::apiResource('orders', OrderController::class);
    Route::apiResource('payments', PaymentController::class);
    Route::apiResource('dealers', DealerController::class);

    // Invoice routes - IMPORTANT: next-number MUST be before apiResource
    Route::get('invoices/next-number', [InvoiceController::class, 'nextNumber']);
    Route::post('invoices/from-order', [InvoiceController::class, 'fromOrder']);
    Route::apiResource('invoices', InvoiceController::class);

    Route::apiResource('purchase-invoices', PurchaseInvoiceController::class);
    Route::post('purchase-invoices/{purchase_invoice}/payments', [PurchaseInvoiceController::class, 'addPayment']);
    Route::apiResource('employees', EmployeeController::class);

    // Accounting
    Route::get('accounting/summary', [AccountingController::class, 'summary']);
    Route::get('accounting/accounts', [AccountingController::class, 'index']);
    Route::post('accounting/accounts', [AccountingController::class, 'store']);
    Route::get('accounting/accounts/{id}', [AccountingController::class, 'show']);
    Route::put('accounting/accounts/{id}', [AccountingController::class, 'update']);
    Route::delete('accounting/accounts/{id}', [AccountingController::class, 'destroy']);
    Route::get('accounting/journals', [AccountingController::class, 'journals']);
    Route::post('accounting/journals', [AccountingController::class, 'storeJournal']);
    Route::get('accounting/statements', [AccountingController::class, 'statements']);

    // Sales
    Route::get('sales/summary', [SalesController::class, 'summary']);
    Route::get('sales/orders', [SalesController::class, 'orders']);
    Route::post('sales/orders', [SalesController::class, 'storeOrder']);
    Route::get('sales/quotations', [SalesController::class, 'quotations']);
    Route::post('sales/quotations', [SalesController::class, 'storeQuotation']);
    Route::get('sales/proformas', [SalesController::class, 'proformas']);
    Route::post('sales/proformas', [SalesController::class, 'storeProforma']);
    Route::get('sales/delivery-challans', [SalesController::class, 'deliveryChallans']);
    Route::post('sales/delivery-challans', [SalesController::class, 'storeDeliveryChallan']);
    Route::get('sales/returns', [SalesController::class, 'returns']);
    Route::post('sales/returns', [SalesController::class, 'storeReturn']);
    Route::get('sales/reports', [SalesController::class, 'reports']);

    // Purchases
    Route::get('purchases/summary', [SalesController::class, 'purchaseSummary']);
    Route::get('purchases/orders', [SalesController::class, 'purchaseOrders']);
    Route::post('purchases/orders', [SalesController::class, 'storePurchaseOrder']);
    Route::get('purchases/bills', [SalesController::class, 'purchaseBills']);
    Route::post('purchases/bills', [SalesController::class, 'storePurchaseBill']);
    Route::get('purchases/grn', [SalesController::class, 'grn']);
    Route::get('purchases/returns', [SalesController::class, 'purchaseReturns']);
    Route::get('purchases/reports', [SalesController::class, 'purchaseReports']);

    // Attendance
    Route::get('attendance/today-summary', [AttendanceController::class, 'todaySummary']);
    Route::get('attendance/today-employees', [AttendanceController::class, 'todayEmployees']);
    Route::get('attendance', [AttendanceController::class, 'index']);
    Route::post('attendance', [AttendanceController::class, 'store']);
    Route::get('attendance/{attendance}', [AttendanceController::class, 'show']);
    Route::match(['put', 'patch'], 'attendance/{attendance}', [AttendanceController::class, 'update']);
    Route::delete('attendance/{attendance}', [AttendanceController::class, 'destroy']);
    Route::post('attendance/bulk-status', [AttendanceController::class, 'bulkUpdateStatus']);
    Route::post('attendance/bulk-delete', [AttendanceController::class, 'bulkDelete']);

    // Payroll & HR
    Route::prefix('payroll')->group(function () {
        Route::get('/', [PayrollController::class, 'index']);
        Route::post('/', [PayrollController::class, 'store']);
        Route::post('/run', [PayrollController::class, 'runPayroll']);

        Route::get('/advances', [PayrollController::class, 'advances']);
        Route::post('/advances', [PayrollController::class, 'storeAdvance']);
        Route::get('/advances/{advance}', [PayrollController::class, 'showAdvance']);
        Route::match(['put', 'patch'], '/advances/{advance}', [PayrollController::class, 'updateAdvance']);
        Route::delete('/advances/{advance}', [PayrollController::class, 'destroyAdvance']);

        Route::get('/leaves', [PayrollController::class, 'leaves']);
        Route::post('/leaves', [PayrollController::class, 'storeLeave']);
        Route::get('/leaves/{leave}', [PayrollController::class, 'showLeave']);
        Route::match(['put', 'patch'], '/leaves/{leave}', [PayrollController::class, 'updateLeave']);
        Route::delete('/leaves/{leave}', [PayrollController::class, 'destroyLeave']);

        Route::get('/shifts', [PayrollController::class, 'shifts']);
        Route::post('/shifts', [PayrollController::class, 'storeShift']);
        Route::get('/shifts/{shift}', [PayrollController::class, 'showShift']);
        Route::match(['put', 'patch'], '/shifts/{shift}', [PayrollController::class, 'updateShift']);
        Route::delete('/shifts/{shift}', [PayrollController::class, 'destroyShift']);

        Route::get('/loans', [PayrollController::class, 'loans']);
        Route::post('/loans', [PayrollController::class, 'storeLoan']);
        Route::get('/loans/{loan}', [PayrollController::class, 'showLoan']);
        Route::match(['put', 'patch'], '/loans/{loan}', [PayrollController::class, 'updateLoan']);
        Route::delete('/loans/{loan}', [PayrollController::class, 'destroyLoan']);

        Route::get('/payslips', [PayrollController::class, 'payslips']);
        Route::post('/payslips', [PayrollController::class, 'storePayslip']);
        Route::get('/payslips/{payslip}', [PayrollController::class, 'showPayslip']);
        Route::match(['put', 'patch'], '/payslips/{payslip}', [PayrollController::class, 'updatePayslip']);
        Route::delete('/payslips/{payslip}', [PayrollController::class, 'destroyPayslip']);

        // Wildcard – must be LAST
        Route::get('/{payroll}', [PayrollController::class, 'show']);
        Route::match(['put', 'patch'], '/{payroll}', [PayrollController::class, 'update']);
        Route::delete('/{payroll}', [PayrollController::class, 'destroy']);
        Route::get('/{payroll}/payslip', [PayrollController::class, 'payslip']);
    });

    // Biometric management
    Route::get('biometric/devices', [BiometricDeviceController::class, 'index']);
    Route::post('biometric/templates/upload', [FingerprintController::class, 'upload']);
    Route::post('biometric/templates/download', [FingerprintController::class, 'downloadAll']);
    Route::delete('biometric/templates/{id}', [FingerprintController::class, 'destroy']);

    Route::get('biometric/scans', [BiometricScanController::class, 'liveFeed']);
    Route::get('biometric/offline/pending', [BiometricScanController::class, 'pendingQueue']);
    Route::get('biometric/unknown-fingers', [BiometricScanController::class, 'unknownFingers']);

    Route::post('biometric/device/{device}/sync', [BiometricDeviceController::class, 'sync']);
    Route::post('biometric/device/{device}/settings', [BiometricDeviceController::class, 'updateSettings']);
    Route::post('biometric/device/{device}/restart', [BiometricDeviceController::class, 'restart']);
    Route::put('biometric/device/{device}', [BiometricDeviceController::class, 'update']);
    Route::delete('biometric/device/{device}', [BiometricDeviceController::class, 'destroy']);

    // File uploads
    Route::get('uploads', [UploadController::class, 'index']);
    Route::post('uploads', [UploadController::class, 'store']);
    Route::post('uploads/folders', [UploadController::class, 'createFolder']);
    Route::post('uploads/delete', [UploadController::class, 'destroy']);
    
    // User Access Management
    Route::get('roles', [UserAccessController::class, 'roles']);
    Route::post('roles', [UserAccessController::class, 'storeRole']);
    Route::put('roles/{roleId}', [UserAccessController::class, 'updateRole']);
    Route::delete('roles/{roleId}', [UserAccessController::class, 'destroyRole']);
    Route::get('permissions', [UserAccessController::class, 'permissions']);
    Route::post('permissions', [UserAccessController::class, 'storePermission']);
    Route::get('users', [UserAccessController::class, 'users']);
    Route::post('users', [UserAccessController::class, 'storeUser']);
    Route::post('users/{userId}/roles', [UserAccessController::class, 'assignRolesToUser']);

    // Settings routes
    Route::get('settings', [SettingsController::class, 'index']);
    Route::post('settings', [SettingsController::class, 'store']);
    Route::get('settings/export', [SettingsController::class, 'export']);
    Route::post('settings/import', [SettingsController::class, 'import']);
    Route::post('settings/bulk', [SettingsController::class, 'bulkUpdate']);
    Route::get('settings/quickstart', [SettingsController::class, 'quickstart']);
    Route::get('settings/cache/clear', [SettingsController::class, 'clearCache']);
    Route::get('settings/{key}', [SettingsController::class, 'show']);
    Route::put('settings/{key}', [SettingsController::class, 'update']);
    Route::delete('settings/{key}', [SettingsController::class, 'destroy']);

    // API Token management routes
    Route::prefix('api-tokens')->group(function () {
        Route::get('/', [SettingsController::class, 'listTokens']);
        Route::post('/generate', [SettingsController::class, 'generateToken']);
        Route::delete('/{id}', [SettingsController::class, 'revokeToken']);
        Route::delete('/', [SettingsController::class, 'revokeAllTokens']);
    });

    Route::get('health/cron', [HealthController::class, 'cron']);
    Route::get('health/backups', [BackupController::class, 'index']);
    Route::post('health/backup', [BackupController::class, 'store']);
    Route::get('backups', [BackupController::class, 'index']);
    Route::post('backups', [BackupController::class, 'store']);
    Route::post('backups/restore', [BackupController::class, 'restore']);
    Route::get('backups/{backup}/download', [BackupController::class, 'download']);

    // Marketing
    Route::prefix('marketing')->group(function () {
        Route::get('dashboard', [MarketingController::class, 'dashboard']);
        Route::get('accounts', [MarketingController::class, 'accounts']);
        Route::get('posts', [MarketingController::class, 'posts']);
        Route::post('posts', [MarketingController::class, 'store']);
        Route::put('posts/{post}', [MarketingController::class, 'update']);
        Route::delete('posts/{post}', [MarketingController::class, 'destroy']);
        Route::get('calendar', [MarketingController::class, 'calendar']);
        Route::get('analytics', [MarketingController::class, 'analytics']);
        Route::get('inbox', [MarketingController::class, 'inbox']);
    });

    // Social OAuth
    Route::get('/auth/{provider}/redirect-url', [SocialAuthController::class, 'redirectUrl']);
    Route::get('/auth/{provider}/redirect', [SocialAuthController::class, 'redirect']);
    Route::post('/auth/{provider}/disconnect', [SocialAuthController::class, 'disconnect']);

    // Unified Inbox
    Route::get('/inbox', [InboxController::class, 'index']);
    Route::post('/inbox/{message}/read', [InboxController::class, 'markAsRead']);
    Route::post('/inbox/email/send', [InboxController::class, 'sendEmail']);
    Route::post('/inbox/whatsapp/send', [InboxController::class, 'sendWhatsApp']);

    // AI Assistant
    Route::get('ai/assistant/insights', [\App\Http\Controllers\Api\AiController::class, 'insights']);
    Route::post('ai/assistant/chat', [\App\Http\Controllers\Api\AiController::class, 'chat']);
    Route::post('ai/assistant/voice', [\App\Http\Controllers\Api\AiController::class, 'voice']);
    Route::post('dashboard/ai/ask', [\App\Http\Controllers\Api\DashboardAiController::class, 'ask']);
    Route::post('dashboard/ai/business-health', [\App\Http\Controllers\Api\DashboardAiController::class, 'businessHealth']);
    Route::post('dashboard/ai/forecast', [\App\Http\Controllers\Api\DashboardAiController::class, 'forecast']);
    Route::post('dashboard/ai/generic', [\App\Http\Controllers\Api\DashboardAiController::class, 'genericAnalysis']);
    Route::get('ai/providers', [\App\Http\Controllers\Api\AiProviderController::class, 'index']);
    Route::post('ai/providers', [\App\Http\Controllers\Api\AiProviderController::class, 'store']);
    Route::put('ai/providers/{provider}', [\App\Http\Controllers\Api\AiProviderController::class, 'update']);

    // Inventory import/export
    Route::post('/inventory/import', [ProductController::class, 'import']);
    Route::get('/inventory/export', [ProductController::class, 'export']);
    Route::get('/inventory/template', [ProductController::class, 'template']);
    Route::get('products/all', [App\Http\Controllers\Api\ProductController::class, 'all']);

    // Customer import/template
    Route::get('customers/template', [CustomerController::class, 'template']);
    Route::post('customers/import', [CustomerController::class, 'import']);

    // Email webhook
    Route::post('/webhooks/email', [EmailWebhookController::class, 'handle']);
});

// ---------- Public OAuth callback ----------
Route::get('/auth/{provider}/callback', [SocialAuthController::class, 'callback']);

// ---------- Public webhooks ----------
Route::post('/webhooks/whatsapp', [WhatsAppWebhookController::class, 'handle']);
Route::get('marketing/gbp-locations', [MarketingController::class, 'gbpLocations']);
// In routes/api.php, inside auth:sanctum middleware group:

Route::prefix('gemini')->group(function () {
    Route::post('voice', [GeminiVoiceController::class, 'processVoice']);
    Route::post('chat', [GeminiVoiceController::class, 'chat']);
    Route::get('insights', [GeminiVoiceController::class, 'dashboardInsights']);
    Route::get('test', [GeminiVoiceController::class, 'testConnection']);
});
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/products/{product}/inventory-summary', [ProductController::class, 'inventorySummary']);
    Route::get('/products/{product}/warehouse-stock', [ProductController::class, 'warehouseStock']);
    Route::get('/products/{product}/stock-movements', [ProductController::class, 'stockMovements']);
    Route::get('/products/{product}/purchase-price-history', [ProductController::class, 'purchasePriceHistory']);
    Route::get('/products/{product}/transactions', [ProductController::class, 'transactions']);
    Route::get('/products/{product}/party-transactions', [ProductController::class, 'partyTransactions']);
    Route::get('/products/{product}/price-list', [ProductController::class, 'priceList']);
    Route::post('/products/{product}/stock-in', [ProductController::class, 'stockIn']);
    Route::post('/products/{product}/stock-out', [ProductController::class, 'stockOut']);
    Route::post('/products/{product}/transfer', [ProductController::class, 'transfer']);
});