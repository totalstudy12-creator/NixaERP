import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
  EmployeesPage,
  AttendancePage,
  PayrollPage,
  HrPayrollPage,
  MediaLibraryPage,
  MarketingPage,
  BannerPosterPage,
  QRPaymentPage,
  SettingsPage,
  UserRoleManagementPage,
  CustomersCRMPage,
  DealersPage,
  SuppliersPage,
  AIAssistantPage,
  PageTemplate,
  CreateInvoicePage,
  BankCashPage,
  AutomationPage,
  SecurityPage,
  NotFoundPage,
  CreatePurchaseInvoicePage,
  EditPurchaseInvoicePage,
} from './pages';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';

const protectedRoutes = [
  { path: 'dashboard', element: <DashboardPage /> },
  { path: 'companies', element: <CompaniesPage /> },
  { path: 'customers', element: <CustomersPage /> },
  { path: 'products', element: <ProductsPage /> },
  { path: 'orders', element: <OrdersPage /> },
  { path: 'invoices', element: <InvoicesPage /> },
  { path: 'invoices/create', element: <CreateInvoicePage /> },
  { path: 'invoices/:id/edit', element: <EditInvoicePage /> },
  { path: 'invoices/:id', element: <InvoiceDetailPage /> },
  { path: 'bank-cash', element: <BankCashPage /> },
  { path: 'automation', element: <AutomationPage /> },
  { path: 'security', element: <SecurityPage /> },
  { path: 'branches', element: <BranchesPage /> },
  { path: 'warehouses', element: <WarehousesPage /> },
  { path: 'users', element: <UsersPage /> },
  { path: 'inventory', element: <InventoryPage /> },
  { path: 'reports', element: <ReportsPage /> },
  { path: 'files', element: <FilesPage /> },
  { path: 'payments', element: <PaymentsPage /> },
  
  { path: 'manual-orders', element: <ManualOrdersPage /> },
  { path: 'audit-logs', element: <AuditLogsPage /> },
  { path: 'sales-pos', element: <SalesPOSPage /> },
  { path: 'purchases', element: <PurchasePage /> },
  { path: 'purchases/create', element: <CreatePurchaseInvoicePage /> },
  { path: 'purchases/:id/edit', element: <EditPurchaseInvoicePage /> },
  { path: 'employees', element: <EmployeesPage /> },
  { path: 'attendance', element: <AttendancePage /> },
  { path: 'payroll', element: <PayrollPage /> },
  { path: 'hr-payroll', element: <HrPayrollPage /> },
  { path: 'media-library', element: <MediaLibraryPage /> },
  { path: 'ai-assistant', element: <AIAssistantPage /> },
  { path: 'marketing', element: <MarketingPage /> },
  { path: 'banner-poster', element: <BannerPosterPage /> },
  { path: 'qr-payment', element: <QRPaymentPage /> },
  { path: 'settings', element: <SettingsPage /> },
  { path: 'user-roles', element: <UserRoleManagementPage /> },
  { path: 'customers-crm', element: <CustomersCRMPage /> },
  { path: 'dealers', element: <DealersPage /> },
  { path: 'suppliers', element: <SuppliersPage /> },
];

const placeholderRoutes = [
  { path: 'salesman', title: 'Salesman', description: 'Manage salesman assignments, routes, and performance metrics.' },
  { path: 'call-ordering', title: 'Call Ordering', description: 'Create orders from phone calls and manage call order queues.' },
  { path: 'barcode-qr', title: 'Barcode / QR', description: 'Scan and manage barcode or QR-based inventory workflows.' },
  { path: 'backup-restore', title: 'Backup / Restore', description: 'Backup and restore your business data securely.' },
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

function App() {
  return (
    <BrowserRouter>
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
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
          {placeholderRoutes.map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={<PageTemplate title={page.title} description={page.description} />}
            />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;