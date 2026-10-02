// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import {
  LoginPage,
  DashboardPage,
  CompaniesPage,
  CustomersPage,
  ProductsPage,
  OrdersPage,
  InvoicesPage,
  InvoiceDetailPage,
  BranchesPage,
  WarehousesPage,
  UsersPage,
  InventoryPage,
  ReportsPage,
  FilesPage,
  PaymentsPage,
  EditInvoicePage,
  ManualOrdersPage,
  AuditLogsPage,
  SalesPOSPage,
  PurchasePage,
  BackupRestorePage,
  EmployeesPage,
  AttendancePage,
  PayrollPage,
  HrPayrollPage,
  MediaLibraryPage,
  MarketingPage,
  BannerPosterPage,
  QRPaymentPage,
  SettingsPage,
  ProfilePage,
  UserRoleManagementPage,
  CustomersCRMPage,
  DealersPage,
  SuppliersPage,
  AIAssistantPage,
  PageTemplate,
  CreateInvoicePage,
  BankCashPage,
  IncomePage,
  ExpensesPage,
  AutomationPage,
  SecurityPage,
  HealthMonitoringPage,
  NotFoundPage,
  CreatePurchaseInvoicePage,
  EditPurchaseInvoicePage,
  IncomeExpensePage,
  SalesInvoiceReturnPage,
  LeadsPage,
  ContactsPage,
  OpportunitiesPage,
  CampaignsPage,
  QuotationsPage,
  StockTransfersPage,
  BudgetsPage,
  RecruitmentPage,
  KnowledgeBasePage,
  TicketsPage,
  ProjectBoardsPage,
  CalendarPage,
} from './pages';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RequirePermission } from './components/RequirePermission';
import { apiClient } from './api';
import { useAuthStore } from './store/auth';
import type { AuthUser } from './store/auth';

/* ------------------------------------------------------------------ */
/* Auth bootstrap — populates the store with the full RBAC payload     */
/* ------------------------------------------------------------------ */

function AuthBootstrap() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const setLoadingUser = useAuthStore((s) => s.setLoadingUser);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoadingUser(false);
      return;
    }

    let cancelled = false;
    setLoadingUser(true);

    (async () => {
      try {
        const res = await apiClient.getMe();
        // Handle both `{ data: user }` and bare `user` payloads.
        const payload =
          (res as { data?: AuthUser }).data ?? (res as unknown as AuthUser);
        if (!cancelled) setUser(payload);
      } catch {
        // 401 is handled by apiClient — it wipes the store and redirects.
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, setUser, setLoadingUser, logout]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Route tables                                                        */
/*                                                                     */
/* Each entry declares the permissions it requires.                    */
/*   • `permissions` uses ANY-of semantics — the user needs at least   */
/*     one of the listed keys.                                         */
/*   • When a page self-gates on a dot-notation key (e.g. `security.view`) */
/*     we ALSO list the space-notation equivalent so the route-level   */
/*     gate matches whichever form the admin assigned.                 */
/*   • Omit `permissions` for routes any authenticated user may see    */
/*     (e.g. Profile).                                                 */
/* ------------------------------------------------------------------ */

interface ProtectedRouteDef {
  path: string;
  element: React.ReactNode;
  permissions?: string[];
}

const protectedRoutes: ProtectedRouteDef[] = [
  /* Dashboard — page self-gates on `dashboard.view` */
  {
    path: 'dashboard',
    element: <DashboardPage />,
    permissions: ['dashboard.view', 'view dashboard', 'view dashboard analytics'],
  },

  /* Masters */
  { path: 'companies', element: <CompaniesPage />, permissions: ['view companies'] },
  { path: 'customers', element: <CustomersPage />, permissions: ['view customers'] },
  { path: 'products', element: <ProductsPage />, permissions: ['view products'] },
  { path: 'branches', element: <BranchesPage />, permissions: ['view branches'] },
  {
    path: 'warehouses',
    element: <WarehousesPage />,
    permissions: ['warehouses.view', 'view warehouses'],
  },
  { path: 'suppliers', element: <SuppliersPage />, permissions: ['view suppliers', 'suppliers:view'] },
  { path: 'dealers', element: <DealersPage />, permissions: ['view dealers'] },

  /* Sales */
  { path: 'orders', element: <OrdersPage />, permissions: ['view orders'] },
  { path: 'manual-orders', element: <ManualOrdersPage />, permissions: ['view orders'] },
  { path: 'invoices', element: <InvoicesPage />, permissions: ['view invoices'] },
  { path: 'invoices/create', element: <CreateInvoicePage />, permissions: ['create invoices'] },
  { path: 'invoices/:id/edit', element: <EditInvoicePage />, permissions: ['edit invoices'] },
  { path: 'invoices/:id', element: <InvoiceDetailPage />, permissions: ['view invoices'] },
  {
    path: 'sales-invoice-returns',
    element: <SalesInvoiceReturnPage />,
    permissions: ['sales.returns.view', 'view sales returns'],
  },
  {
    path: 'sales-pos',
    element: <SalesPOSPage />,
    permissions: ['pos.view', 'view pos', 'create invoices'],
  },
  {
    path: 'pos',
    element: <SalesPOSPage />,
    permissions: ['pos.view', 'view pos', 'create invoices'],
  },

  /* Purchases */
  { path: 'purchases', element: <PurchasePage />, permissions: ['view purchase invoices'] },
  { path: 'purchases/create', element: <CreatePurchaseInvoicePage />, permissions: ['create purchase invoices'] },
  { path: 'purchases/:id/edit', element: <EditPurchaseInvoicePage />, permissions: ['edit purchase invoices'] },

  /* Finance */
  { path: 'payments', element: <PaymentsPage />, permissions: ['view payments'] },
  { path: 'bank-cash', element: <BankCashPage />, permissions: ['view accounting accounts'] },
  { path: 'income', element: <IncomePage />, permissions: ['view payments'] },
  { path: 'expenses', element: <ExpensesPage />, permissions: ['view payments'] },
  { path: 'income-expenses', element: <IncomeExpensePage />, permissions: ['income_expenses.view'] },
  { path: 'budgets', element: <BudgetsPage />, permissions: ['view accounting accounts'] },
  { path: 'qr-payment', element: <QRPaymentPage />, permissions: ['view payments'] },

  /* Inventory */
  {
    path: 'inventory',
    element: <InventoryPage />,
    permissions: ['view products', 'view inventory'],
  },
  {
    path: 'stock-transfers',
    element: <StockTransfersPage />,
    permissions: ['view products', 'view inventory'],
  },

  /* HR */
  { path: 'employees', element: <EmployeesPage />, permissions: ['view employees'] },
  { path: 'attendance', element: <AttendancePage />, permissions: ['view attendance'] },
  {
    path: 'payroll',
    element: <PayrollPage />,
    permissions: ['payroll.view', 'view payroll', 'payroll:view'],
  },
  {
    path: 'hr-payroll',
    element: <HrPayrollPage />,
    permissions: ['payroll.view', 'view payroll', 'payroll:view', 'view hr'],
  },
  { path: 'recruitment', element: <RecruitmentPage />, permissions: ['view employees'] },

  /* CRM / Sales pipeline */
  { path: 'customers-crm', element: <CustomersCRMPage />, permissions: ['view customers'] },
  { path: 'leads', element: <LeadsPage />, permissions: ['view customers'] },
  { path: 'contacts', element: <ContactsPage />, permissions: ['view customers'] },
  { path: 'opportunities', element: <OpportunitiesPage />, permissions: ['view customers'] },
  { path: 'quotations', element: <QuotationsPage />, permissions: ['view sales quotations'] },
  {
    path: 'campaigns',
    element: <CampaignsPage />,
    permissions: ['marketing.view', 'view marketing dashboard', 'view marketing posts'],
  },

  /* Reports — page self-gates on `reports.view` */
  {
    path: 'reports',
    element: <ReportsPage />,
    permissions: ['reports.view', 'view reports', 'view dashboard analytics'],
  },

  /* Files / media — page self-gates on `files.view` */
  {
    path: 'files',
    element: <FilesPage />,
    permissions: ['files.view', 'view uploads'],
  },
  {
    path: 'media-library',
    element: <MediaLibraryPage />,
    permissions: ['files.view', 'view uploads'],
  },

  /* Marketing — page self-gates on `marketing.view` */
  {
    path: 'marketing',
    element: <MarketingPage />,
    permissions: ['marketing.view', 'view marketing dashboard'],
  },
  {
    path: 'banner-poster',
    element: <BannerPosterPage />,
    permissions: ['marketing.view', 'view marketing dashboard'],
  },

  /* AI */
  { path: 'ai-assistant', element: <AIAssistantPage />, permissions: ['view ai assistant insights'] },

  /* Admin / Ops */
  { path: 'users', element: <UsersPage />, permissions: ['users.view', 'view users'] },
  {
    path: 'user-roles',
    element: <UserRoleManagementPage />,
    permissions: ['users.view', 'view users', 'view roles', 'security.roles.view'],
  },
  {
    path: 'settings',
    element: <SettingsPage />,
    permissions: ['settings.view', 'view settings'],
  },
  {
    path: 'security',
    element: <SecurityPage />,
    permissions: ['security.view', 'view security', 'view settings'],
  },
  { path: 'automation', element: <AutomationPage />, permissions: ['view settings'] },
  {
    path: 'health-monitoring',
    element: <HealthMonitoringPage />,
    permissions: ['health.view', 'view health', 'view health cron'],
  },
  {
    path: 'backup-restore',
    element: <BackupRestorePage />,
    permissions: ['view backups'],
  },
  {
    path: 'audit-logs',
    element: <AuditLogsPage />,
    permissions: ['view dashboard login activity', 'view admin login activity'],
  },

  /* Company / generic — accessible to any authenticated user */
  { path: 'knowledge-base', element: <KnowledgeBasePage /> },
  { path: 'tickets', element: <TicketsPage /> },
  { path: 'project-boards', element: <ProjectBoardsPage /> },
  { path: 'calendar', element: <CalendarPage /> },

  /* Profile — any authenticated user */
  { path: 'profile', element: <ProfilePage /> },
];

/**
 * Placeholder pages — informational only. The duplicate `backup-restore`
 * entry has been removed because a real page exists at that path.
 */
const placeholderRoutes = [
  { path: 'salesman', title: 'Salesman', description: 'Manage salesman assignments, routes, and performance metrics.' },
  { path: 'call-ordering', title: 'Call Ordering', description: 'Create orders from phone calls and manage call order queues.' },
  { path: 'barcode-qr', title: 'Barcode / QR', description: 'Scan and manage barcode or QR-based inventory workflows.' },
  { path: 'gst-reports', title: 'GST Reports', description: 'Generate GST reports for filing and tax compliance.' },
  { path: 'thermal-printing', title: 'Thermal Printing', description: 'Configure and test thermal printing for invoices and receipts.' },
  { path: 'label-printing', title: 'Label Printing', description: 'Design and print product or shipping labels.' },
  { path: 'inventory-forecasting', title: 'Inventory Forecasting', description: 'Forecast inventory demand using historical trends.' },
  { path: 'sales-prediction', title: 'Sales Prediction', description: 'Predict future sales using analytics and seasonal patterns.' },
  { path: 'reorder-suggestions', title: 'Reorder Suggestions', description: 'Receive reorder suggestions to avoid stockouts.' },
  { path: 'customer-insights', title: 'Customer Insights', description: 'View customer behavior, retention, and insight reports.' },
  { path: 'dealer-insights', title: 'Dealer Insights', description: 'Analyze dealer trends, performance, and order history.' },
  { path: 'ai-poster-generator', title: 'AI Poster Generator', description: 'Generate marketing posters with AI-powered templates.' },
  { path: 'ai-marketing-content', title: 'AI Marketing Content', description: 'Produce marketing copy and campaigns using AI.' },
  { path: 'ocr-bills-invoices', title: 'OCR for Bills/Invoices', description: 'Extract bill and invoice data using OCR.' },
  { path: 'natural-language-reports', title: 'Natural Language Reports', description: 'Generate reports in natural language summaries.' },
  { path: 'fraud-anomaly-detection', title: 'Fraud & Anomaly Detection', description: 'Detect suspicious activity and anomalies automatically.' },
  { path: 'qr-linked-device', title: 'QR Linked Device', description: 'Link devices through QR codes for WhatsApp or payment flows.' },
  { path: 'direct-messages', title: 'Direct Messages', description: 'Send and manage WhatsApp direct messages to customers.' },
  { path: 'bulk-messages', title: 'Bulk Messages', description: 'Send bulk WhatsApp or notification messages to groups.' },
  { path: 'catalogue-sharing', title: 'Catalogue Sharing', description: 'Share your product catalogue on WhatsApp and web.' },
  { path: 'invoice-pdf', title: 'Invoice PDF', description: 'Generate invoice PDFs for sharing and record keeping.' },
  { path: 'payment-reminder', title: 'Payment Reminder', description: 'Send payment reminders for outstanding invoices.' },
  { path: 'order-updates', title: 'Order Updates', description: 'Push order updates and shipment status to customers.' },
  { path: 'cash-payments', title: 'Cash Payments', description: 'Manage cash payment records and settlements.' },
  { path: 'upi-payments', title: 'UPI Payments', description: 'Process and track UPI payment transactions.' },
  { path: 'card-payments', title: 'Card Payments', description: 'Manage card payment gateways and receipts.' },
  { path: 'split-payments', title: 'Split Payments', description: 'Handle split payments across multiple methods.' },
  { path: 'outstanding-tracking', title: 'Outstanding Tracking', description: 'Track customer outstanding balances and dues.' },
  { path: 'qr-collection', title: 'QR Collection', description: 'Collect payments using QR-based collection links.' },
  { path: 'whatsapp-business', title: 'WhatsApp Business', description: 'Integrate with WhatsApp Business for messaging and orders.' },
  { path: 'openai', title: 'OpenAI', description: 'Manage OpenAI integration and AI feature settings.' },
  { path: 'google-gemini', title: 'Google Gemini', description: 'Manage Google Gemini AI integrations and settings.' },
  { path: 'razorpay', title: 'Razorpay', description: 'Manage Razorpay payment gateway settings and transactions.' },
  { path: 'phonepe', title: 'PhonePe', description: 'Manage PhonePe integration and payment workflows.' },
  { path: 'paytm', title: 'Paytm', description: 'Manage Paytm integration and payment workflows.' },
  { path: 'sms-gateway', title: 'SMS Gateway', description: 'Configure SMS gateway integration for alerts and OTPs.' },
  { path: 'email-smtp', title: 'Email SMTP', description: 'Configure SMTP email settings for notifications and billing.' },
  { path: 'google-drive', title: 'Google Drive', description: 'Manage Google Drive integration for file storage.' },
  { path: 'one-drive', title: 'OneDrive', description: 'Manage OneDrive integration for file storage.' },
  { path: 'dropbox', title: 'Dropbox', description: 'Manage Dropbox integration for file storage.' },
  { path: 'shiprocket', title: 'Shiprocket', description: 'Manage Shiprocket shipping integration and orders.' },
  { path: 'delhivery', title: 'Delhivery', description: 'Manage Delhivery shipping integration and orders.' },
  { path: 'gst-apis', title: 'GST APIs', description: 'Manage GST API integrations for tax filing and returns.' },
  { path: 'tally-import-export', title: 'Tally Import/Export', description: 'Import and export data to/from Tally software.' },
  { path: 'busy-import-export', title: 'Busy Import/Export', description: 'Import and export data to/from Busy accounting software.' },
];

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

function App() {
  return (
    <BrowserRouter>
      {/* Populates the RBAC store with /me on every mount / token change */}
      <AuthBootstrap />

      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />

          {protectedRoutes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                route.permissions && route.permissions.length > 0 ? (
                  <RequirePermission permissions={route.permissions}>
                    {route.element}
                  </RequirePermission>
                ) : (
                  route.element
                )
              }
            />
          ))}

          {placeholderRoutes.map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={
                <PageTemplate
                  title={page.title}
                  description={page.description}
                />
              }
            />
          ))}

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
