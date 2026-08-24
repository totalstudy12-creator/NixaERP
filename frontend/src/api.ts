import { useAuthStore } from './store/auth';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');
const normalizeEndpoint = (endpoint: string) => (endpoint.startsWith('/') ? endpoint : `/${endpoint}`);
const DASHBOARD_ENDPOINT_FALLBACKS: Record<string, string[]> = {
  '/products/low-stock': ['/dashboard/low-stock'],
  '/customers/top': ['/dashboard/top-customers'],
  '/vendors/top': ['/dashboard/top-vendors'],
  '/purchases/due': ['/dashboard/purchase-due'],
  '/admin/login-activity': ['/dashboard/login-activity'],
};

export interface ApiError extends Error {
  status?: number;
  endpoint?: string;
  method?: string;
  backendMessage?: string;
  validationErrors?: Record<string, string[] | string>;
  requestId?: string;
}

const normalizeApiPayload = <T>(payload: unknown, fallback: T): T => {
  if (payload === null || payload === undefined) return fallback;

  if (Array.isArray(payload)) return payload as T;

  if (typeof payload !== 'object') return fallback;

  const record = payload as Record<string, unknown>;
  if ('data' in record && record.data !== undefined) {
    return normalizeApiPayload(record.data, fallback);
  }

  if ('success' in record && record.success === true && 'data' in record) {
    return normalizeApiPayload(record.data, fallback);
  }

  return payload as T;
};

const buildApiError = (options: {
  status: number;
  endpoint: string;
  method: string;
  fallbackMessage: string;
  payload?: unknown;
}): ApiError => {
  const payloadObject = options.payload && typeof options.payload === 'object' ? options.payload as Record<string, unknown> : {};
  const backendMessage =
    (typeof payloadObject.message === 'string' && payloadObject.message) ||
    (typeof payloadObject.error === 'string' && payloadObject.error) ||
    options.fallbackMessage;

  const validationErrors =
    payloadObject.errors && typeof payloadObject.errors === 'object'
      ? (payloadObject.errors as Record<string, string[] | string>)
      : undefined;

  const requestId = typeof payloadObject.request_id === 'string' ? payloadObject.request_id : undefined;

  const error = new Error(backendMessage) as ApiError;
  error.name = 'ApiRequestError';
  error.status = options.status;
  error.endpoint = options.endpoint;
  error.method = options.method;
  error.backendMessage = backendMessage;
  error.validationErrors = validationErrors;
  error.requestId = requestId;

  return error;
};

export const apiClient = {
  async request<T = any>(method: string, endpoint: string, data?: any, options?: any): Promise<T> {
    const token = useAuthStore.getState().token;
    const headers: any = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const requestOptions: any = {
      method,
      headers,
    };

    if (data !== undefined && data !== null) {
      requestOptions.body = JSON.stringify(data);
    }

    const requestUrl = `${API_BASE}${normalizeEndpoint(endpoint)}`;

    try {
      const response = await fetch(requestUrl, requestOptions);

      if (response.status === 401) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
        throw buildApiError({
          status: 401,
          endpoint,
          method,
          fallbackMessage: 'Unauthorized - please login again',
        });
      }

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json') || contentType.includes('text/json');
      const body = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        const fallbackEndpoints = method === 'GET' ? DASHBOARD_ENDPOINT_FALLBACKS[endpoint] || [] : [];
        if (response.status === 404 && fallbackEndpoints.length > 0) {
          let lastError: unknown;
          for (const fallbackEndpoint of fallbackEndpoints) {
            try {
              return await this.request(method, fallbackEndpoint, data, options);
            } catch (error) {
              lastError = error;
            }
          }
          if (lastError) throw lastError;
        }

        throw buildApiError({
          status: response.status,
          endpoint,
          method,
          fallbackMessage: response.statusText || 'Request failed',
          payload: body,
        });
      }

      return normalizeApiPayload(body, body ?? null);
    } catch (error: any) {
      const apiError = error as ApiError;

      if (apiError?.name === 'ApiRequestError') {
        console.error(`API request failed: ${method.toUpperCase()} ${endpoint}`, {
          status: apiError.status,
          backendMessage: apiError.backendMessage,
          validationErrors: apiError.validationErrors,
        });
        throw apiError;
      }

      const networkMessage = error instanceof Error ? error.message : 'Network request failed';
      console.error(`API request failed: ${method.toUpperCase()} ${endpoint}`, error);
      throw buildApiError({
        status: 0,
        endpoint,
        method,
        fallbackMessage: networkMessage || 'Network request failed',
        payload: error,
      });
    }
  },

  // Auth
  async login(email: string, password: string) {
    return this.request('POST', '/login', { email, password });
  },

  async logout() {
    return this.request('POST', '/logout');
  },

  async getMe() {
    return this.request('GET', '/me');
  },

  async getProfile() {
    return this.request('GET', '/profile');
  },

  async updateProfile(data: any) {
    return this.request('PUT', '/profile', data);
  },

  // Companies
  async getCompanies(page = 1) {
    return this.request('GET', `/companies?page=${page}`);
  },

  async createCompany(data: any) {
    return this.request('POST', '/companies', data);
  },

  async updateCompany(id: number, data: any) {
    return this.request('PUT', `/companies/${id}`, data);
  },

  async deleteCompany(id: number) {
    return this.request('DELETE', `/companies/${id}`);
  },

  // Customers
  async getCustomers(page = 1) {
    return this.request('GET', `/customers?page=${page}`);
  },

  async createCustomer(data: any) {
    return this.request('POST', '/customers', data);
  },

  async updateCustomer(id: number, data: any) {
    return this.request('PUT', `/customers/${id}`, data);
  },

  async deleteCustomer(id: number) {
    return this.request('DELETE', `/customers/${id}`);
  },

  // Products
  async getProducts(page = 1) {
    return this.request('GET', `/products?page=${page}`);
  },

  async createProduct(data: any) {
    return this.request('POST', '/products', data);
  },

  async updateProduct(id: number, data: any) {
    return this.request('PUT', `/products/${id}`, data);
  },

  async deleteProduct(id: number) {
    return this.request('DELETE', `/products/${id}`);
  },

  // Orders
  async getOrders(page = 1) {
    return this.request('GET', `/orders?page=${page}`);
  },

  async createOrder(data: any) {
    return this.request('POST', '/orders', data);
  },

  async updateOrder(id: number, data: any) {
    return this.request('PUT', `/orders/${id}`, data);
  },

  async deleteOrder(id: number) {
    return this.request('DELETE', `/orders/${id}`);
  },

  // Dealers
  async getDealers(page = 1) {
    return this.request('GET', `/dealers?page=${page}`);
  },

  async createDealer(data: any) {
    return this.request('POST', '/dealers', data);
  },

  async updateDealer(id: number, data: any) {
    return this.request('PUT', `/dealers/${id}`, data);
  },

  async deleteDealer(id: number) {
    return this.request('DELETE', `/dealers/${id}`);
  },

  // Payments
  async getPayments(page = 1) {
    return this.request('GET', `/payments?page=${page}`);
  },

  async createPayment(data: any) {
    return this.request('POST', '/payments', data);
  },

  async updatePayment(id: number, data: any) {
    return this.request('PUT', `/payments/${id}`, data);
  },

  async deletePayment(id: number) {
    return this.request('DELETE', `/payments/${id}`);
  },

  // Billing / Sales
  async getSalesSummary() {
    return this.request('GET', '/sales/summary');
  },

  async getSalesOrders() {
    return this.request('GET', '/sales/orders');
  },

  async createSalesOrder(data: any) {
    return this.request('POST', '/sales/orders', data);
  },

  async getSalesQuotations() {
    return this.request('GET', '/sales/quotations');
  },

  async createSalesQuotation(data: any) {
    return this.request('POST', '/sales/quotations', data);
  },

  async getSalesProformas() {
    return this.request('GET', '/sales/proformas');
  },

  async createSalesProforma(data: any) {
    return this.request('POST', '/sales/proformas', data);
  },

  async getSalesDeliveryChallans() {
    return this.request('GET', '/sales/delivery-challans');
  },

  async createSalesDeliveryChallan(data: any) {
    return this.request('POST', '/sales/delivery-challans', data);
  },

  async getSalesReturns() {
    return this.request('GET', '/sales/returns');
  },

  async createSalesReturn(data: any) {
    return this.request('POST', '/sales/returns', data);
  },

  async getSalesReports() {
    return this.request('GET', '/sales/reports');
  },

  async getPurchaseSummary() {
    return this.request('GET', '/purchases/summary');
  },

  async getPurchaseOrders() {
    return this.request('GET', '/purchases/orders');
  },

  async createPurchaseOrder(data: any) {
    return this.request('POST', '/purchases/orders', data);
  },

  async getPurchaseBills() {
    return this.request('GET', '/purchases/bills');
  },

  async createPurchaseBill(data: any) {
    return this.request('POST', '/purchases/bills', data);
  },

  async getPurchaseGRN() {
    return this.request('GET', '/purchases/grn');
  },

  async getPurchaseReturns() {
    return this.request('GET', '/purchases/returns');
  },

  async getPurchaseReports() {
    return this.request('GET', '/purchases/reports');
  },

  // Accounting
  async getAccountingSummary() {
    return this.request('GET', '/accounting/summary');
  },

  async getAccountingAccounts() {
    return this.request('GET', '/accounting/accounts');
  },

  async createAccountingAccount(data: any) {
    return this.request('POST', '/accounting/accounts', data);
  },

  async getAccountingJournals() {
    return this.request('GET', '/accounting/journals');
  },

  async createAccountingJournal(data: any) {
    return this.request('POST', '/accounting/journals', data);
  },

  async getAccountingStatements() {
    return this.request('GET', '/accounting/statements');
  },

  // Import/Export jobs
  async getImports(page = 1) {
    return this.request('GET', `/import-exports?page=${page}`);
  },

  async createImport(data: any) {
    return this.request('POST', '/import-exports', data);
  },

  async updateImport(id: number, data: any) {
    return this.request('PUT', `/import-exports/${id}`, data);
  },

  async deleteImport(id: number) {
    return this.request('DELETE', `/import-exports/${id}`);
  },

  // Catalog Management
  async getCatalog(page = 1) {
    return this.request('GET', `/products?page=${page}`);
  },
  // ADD THIS NEW METHOD
  async getAllProducts() {
    return this.request('GET', '/products?per_page=all');
  },
  async getCatalogItems(page = 1) {
    return this.getCatalog(page);
  },

  async createCatalogItem(data: any) {
    return this.createProduct(data);
  },

  async updateCatalogItem(id: number, data: any) {
    return this.updateProduct(id, data);
  },

  async deleteCatalogItem(id: number) {
    return this.deleteProduct(id);
  },

  // Attendance
  async getAttendance(query?: string | number) {
    const q = query
      ? (typeof query === 'number' ? `?page=${query}` : `?${query}`)
      : '';
    return this.request('GET', `/attendance${q}`);
  },

  async createAttendance(data: any) {
    return this.request('POST', '/attendance', data);
  },

  async updateAttendance(id: number, data: any) {
    return this.request('PUT', `/attendance/${id}`, data);
  },

  async deleteAttendance(id: number) {
    return this.request('DELETE', `/attendance/${id}`);
  },

  async getTodayAttendanceSummary() {
    return this.request('GET', '/attendance/today-summary');
  },

  async getTodayEmployeeAttendance() {
    return this.request('GET', '/attendance/today-employees');
  },

  // Biometric
  async getBiometricDevices() {
    return this.request('GET', '/biometric/devices');
  },

  async getScanEvents() {
    return this.request('GET', '/biometric/scans');
  },

  async getPendingRecords() {
    return this.request('GET', '/biometric/offline/pending');
  },

  async getUnknownFingers() {
    return this.request('GET', '/biometric/unknown-fingers');
  },

  async syncDevice(deviceId: number) {
    return this.request('POST', `/biometric/device/${deviceId}/sync`);
  },

  async updateDeviceSettings(deviceId: number, settings: object) {
    return this.request('POST', `/biometric/device/${deviceId}/settings`, { settings });
  },

  async restartDevice(deviceId: number) {
    return this.request('POST', `/biometric/device/${deviceId}/restart`);
  },

  async registerDevice(data: {
    device_uid: string;
    name: string;
    company_id: number;
    branch_id?: number;
    firmware_version: string;
    ip_address?: string;
  }) {
    return this.request('POST', '/biometric/device/register', data);
  },

  async startDeviceEnrollment(deviceId: number, employeeId: number) {
    return this.request('POST', `/biometric/device/${deviceId}/enroll`, { employee_id: employeeId });
  },

  // Payroll
  async getPayrolls(page = 1) {
    return this.request('GET', `/payroll?page=${page}`);
  },

  async createPayroll(data: any) {
    return this.request('POST', '/payroll', data);
  },

  async updatePayroll(id: number, data: any) {
    return this.request('PUT', `/payroll/${id}`, data);
  },

  async deletePayroll(id: number) {
    return this.request('DELETE', `/payroll/${id}`);
  },

  async runPayroll(data: any) {
    return this.request('POST', '/payroll/run', data);
  },

  async getPayrollLeaves() {
    return this.request('GET', '/payroll/leaves');
  },

  async createPayrollLeave(data: any) {
    return this.request('POST', '/payroll/leaves', data);
  },

  async getPayrollShifts() {
    return this.request('GET', '/payroll/shifts');
  },

  async createPayrollShift(data: any) {
    return this.request('POST', '/payroll/shifts', data);
  },

  async getPayrollLoans() {
    return this.request('GET', '/payroll/loans');
  },

  async createPayrollLoan(data: any) {
    return this.request('POST', '/payroll/loans', data);
  },

  async getPayrollPayslips() {
    return this.request('GET', '/payroll/payslips');
  },

  async getPayrollLeave(id: number) {
    return this.request('GET', `/payroll/leaves/${id}`);
  },

  async updatePayrollLeave(id: number, data: any) {
    return this.request('PUT', `/payroll/leaves/${id}`, data);
  },

  async deletePayrollLeave(id: number) {
    return this.request('DELETE', `/payroll/leaves/${id}`);
  },

  async createPayrollPayslip(data: any) {
    return this.request('POST', '/payroll/payslips', data);
  },

  async getPayrollShift(id: number) {
    return this.request('GET', `/payroll/shifts/${id}`);
  },

  async updatePayrollShift(id: number, data: any) {
    return this.request('PUT', `/payroll/shifts/${id}`, data);
  },

  async deletePayrollShift(id: number) {
    return this.request('DELETE', `/payroll/shifts/${id}`);
  },

  async getPayrollLoan(id: number) {
    return this.request('GET', `/payroll/loans/${id}`);
  },

  async updatePayrollLoan(id: number, data: any) {
    return this.request('PUT', `/payroll/loans/${id}`, data);
  },

  async deletePayrollLoan(id: number) {
    return this.request('DELETE', `/payroll/loans/${id}`);
  },

  async getPayrollPayslip(id: number) {
    return this.request('GET', `/payroll/payslips/${id}`);
  },

  async updatePayrollPayslip(id: number, data: any) {
    return this.request('PUT', `/payroll/payslips/${id}`, data);
  },

  async deletePayrollPayslip(id: number) {
    return this.request('DELETE', `/payroll/payslips/${id}`);
  },

  // Invoices
  async getInvoices(page = 1) {
    return this.request('GET', `/invoices?page=${page}`);
  },

  async getInvoice(id: number) {
    return this.request('GET', `/invoices/${id}`);
  },

  async createInvoice(data: any) {
    return this.request('POST', '/invoices', data);
  },

  async createInvoiceFromOrder(orderId: number, invoiceNo: string, opts?: any) {
    return this.request('POST', '/invoices/from-order', { order_id: orderId, invoice_no: invoiceNo, ...opts });
  },

  async updateInvoice(id: number, data: any) {
    return this.request('PUT', `/invoices/${id}`, data);
  },

  async deleteInvoice(id: number) {
    return this.request('DELETE', `/invoices/${id}`);
  },

  // Branches
  async getBranches(page = 1) {
    return this.request('GET', `/branches?page=${page}`);
  },

  async createBranch(data: any) {
    return this.request('POST', '/branches', data);
  },

  async updateBranch(id: number, data: any) {
    return this.request('PUT', `/branches/${id}`, data);
  },

  async deleteBranch(id: number) {
    return this.request('DELETE', `/branches/${id}`);
  },

  // Departments
  async getDepartments(page = 1) {
    return this.request('GET', `/departments?page=${page}`);
  },

  // Designations
  async getDesignations(page = 1) {
    return this.request('GET', `/designations?page=${page}`);
  },

  // Biometric
  async getEnrolledFingers(employeeId: number) {
    return this.request('GET', `/biometric/employees/${employeeId}/fingers`);
  },

  // Users / Roles / Permissions
  async getUsers() {
    return this.request('GET', '/users');
  },

  async getRoles() {
    return this.request('GET', '/roles');
  },

  async getPermissions() {
    return this.request('GET', '/permissions');
  },

  async deleteUser(id: number) {
    return this.request('DELETE', `/users/${id}`);
  },

  async assignRolesToUser(userId: number, roleIds: number[]) {
    return this.request('POST', `/users/${userId}/roles`, { role_ids: roleIds });
  },

  async deleteRole(id: number) {
    return this.request('DELETE', `/roles/${id}`);
  },

  async updateRole(id: number, data: any) {
    return this.request('PUT', `/roles/${id}`, data);
  },

  async createRole(data: any) {
    return this.request('POST', '/roles', data);
  },

  async getAIAssistantInsights() {
    return this.request('GET', '/ai/assistant/insights');
  },

  async getAIAssistantWorkflows() {
    return this.request('GET', '/ai/assistant/workflows');
  },

  async getAiProviders() {
    return this.request('GET', '/ai/providers');
  },
  async createAiProvider(data: any) {
    return this.request('POST', '/ai/providers', data);
  },
  async updateAiProvider(id: number, data: any) {
    return this.request('PUT', `/ai/providers/${id}`, data);
  },

  async sendAIAssistantChat(message: string, providerId?: number) {
    const payload: any = { message };
    if (providerId) payload.provider_id = providerId;
    return this.request('POST', '/ai/assistant/chat', payload);
  },

  // Dashboard / summaries
  async getPaymentSummary() {
    return this.request('GET', '/dashboard/payments-summary');
  },

  async getInventorySummary() {
    return this.request('GET', '/dashboard/inventory-summary');
  },

  async getInvoiceCountSummary() {
    return this.request('GET', '/dashboard/invoices-count-summary');
  },

  async getInvoiceAmountSummary() {
    return this.request('GET', '/dashboard/invoices-amount-summary');
  },

  // 🆕 Net Profit Summary
  async getProfitSummary() {
    return this.request('GET', '/dashboard/profit');
  },

  async getTopSellingProducts(limit = 5) {
    return this.request('GET', `/reports/top-selling-products?limit=${limit}`);
  },

  async getLeastSellingProducts(limit = 5) {
    return this.request('GET', `/reports/least-selling-products?limit=${limit}`);
  },

  async getLowStockProducts() {
    return this.request('GET', '/products/low-stock');
  },

  async getTopCustomers(limit = 5) {
    return this.request('GET', `/customers/top?limit=${limit}`);
  },

  async getTopVendors(limit = 5) {
    return this.request('GET', `/vendors/top?limit=${limit}`);
  },

  async getPurchaseDueInvoices() {
    return this.request('GET', '/purchases/due');
  },

  async getLoginActivity() {
    return this.request('GET', '/admin/login-activity');
  },

  // Dashboard AI & advanced summaries
  async getBusinessHealthScore() {
    return this.request('GET', '/dashboard/business-health');
  },

  async getForecastData() {
    return this.request('GET', '/dashboard/forecast');
  },

  async getRiskCenter() {
    return this.request('GET', '/dashboard/risks');
  },

  async getAnomalies() {
    return this.request('GET', '/dashboard/anomalies');
  },

  async getRankings() {
    return this.request('GET', '/dashboard/rankings');
  },

  async getHeroProduct() {
    return this.request('GET', '/dashboard/hero-product');
  },

  async getHeroCustomer() {
    return this.request('GET', '/dashboard/hero-customer');
  },

  async getDistrictSales(state?: string) {
    const qs = state ? `?state=${encodeURIComponent(state)}` : '';
    return this.request('GET', `/dashboard/district-sales${qs}`);
  },

  async getBankAccounts() {
    return this.request('GET', '/bank-accounts');
  },

  // Invoice helpers
  async duplicateInvoice(id: number) {
    return this.request('POST', `/invoices/${id}/duplicate`);
  },

  // Purchase invoices — backend resource is /purchase-invoices
  async getPurchaseInvoices(page = 1) {
    return this.request('GET', `/purchase-invoices?page=${page}`);
  },

  async getPurchaseInvoice(id: number) {
    return this.request('GET', `/purchase-invoices/${id}`);
  },

  async createPurchaseInvoice(data: any) {
    return this.request('POST', '/purchase-invoices', data);
  },

  async updatePurchaseInvoice(id: number, data: any) {
    return this.request('PUT', `/purchase-invoices/${id}`, data);
  },

  async deletePurchaseInvoice(id: number) {
    return this.request('DELETE', `/purchase-invoices/${id}`);
  },

  async addPurchaseInvoicePayment(id: number, data: any) {
    return this.request('POST', `/purchase-invoices/${id}/payments`, data);
  },

  // Employees
  async getEmployees(query?: string) {
    const q = query ? `?${query}` : '';
    return this.request('GET', `/employees${q}`);
  },

  async createEmployee(data: any) {
    return this.request('POST', '/employees', data);
  },

  async updateEmployee(id: number, data: any) {
    return this.request('PUT', `/employees/${id}`, data);
  },

  async deleteEmployee(id: number) {
    return this.request('DELETE', `/employees/${id}`);
  },

  // Warehouses
  async getWarehouses(page = 1) {
    return this.request('GET', `/warehouses?page=${page}`);
  },

  async createWarehouse(data: any) {
    return this.request('POST', '/warehouses', data);
  },

  async updateWarehouse(id: number, data: any) {
    return this.request('PUT', `/warehouses/${id}`, data);
  },

  async deleteWarehouse(id: number) {
    return this.request('DELETE', `/warehouses/${id}`);
  },

  // Uploads / File management
  async getUploads() {
    return this.request('GET', '/uploads');
  },

  async uploadFile(formData: FormData) {
    const token = useAuthStore.getState().token;
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json') || contentType.includes('text/json');
    const body = isJson ? await response.json() : await response.text();
    if (!response.ok) throw new Error(isJson ? body.message || response.statusText : response.statusText);
    return body;
  },

  async createUploadFolder(folder: string) {
    return this.request('POST', '/uploads/folders', { folder });
  },

  async deleteUpload(path: string) {
    return this.request('POST', '/uploads/delete', { path });
  },

  async updateDevice(id: number, data: any) {
    return this.request('PUT', `/biometric/device/${id}`, data);
  },

  async deleteDevice(id: number) {
    return this.request('DELETE', `/biometric/device/${id}`);
  },

  // Advances
  async updatePayrollAdvance(id: number, data: any) {
    return this.request('PUT', `/payroll/advances/${id}`, data);
  },

  async deletePayrollAdvance(id: number) {
    return this.request('DELETE', `/payroll/advances/${id}`);
  },

  async getPayrollAdvances() {
    return this.request('GET', '/payroll/advances');
  },

  async createPayrollAdvance(data: any) {
    return this.request('POST', '/payroll/advances', data);
  },

  // Branches by company
  async getBranchesByCompany(companyId: number) {
    return this.request('GET', `/branches?company_id=${companyId}`);
  },

  // Legacy purchase endpoints – kept for compatibility, but point to /purchase-invoices if needed
  async getPurchases(params?: any) {
    return this.getPurchaseInvoices(params?.page || 1);
  },

  async getPurchase(id: number) {
    return this.getPurchaseInvoice(id);
  },

  async createPurchase(data: any) {
    return this.createPurchaseInvoice(data);
  },

  async updatePurchase(id: number, data: any) {
    return this.updatePurchaseInvoice(id, data);
  },

  async deletePurchase(id: number) {
    return this.deletePurchaseInvoice(id);
  },

  async duplicatePurchase(id: number) {
    // Not implemented in backend; keep placeholder
    throw new Error('Duplicate purchase is not available.');
  },

  // Customer Groups
  async getCustomerGroups() {
    return this.request('GET', '/customer-groups');
  },

  async createCustomerGroup(data: { name: string }) {
    return this.request('POST', '/customer-groups', data);
  },

  // GST Lookup
  async lookupGst(gstin: string) {
    return this.request('GET', `/gstin/${gstin}`);
  },

  async getAllCustomers() {
    return this.request('GET', '/customers?per_page=1000');
  },

  // Suppliers
  async getSuppliers() {
    return this.request('GET', '/suppliers?per_page=1000');
  },

  async createSupplier(data: any) {
    return this.request('POST', '/suppliers', data);
  },

  async updateSupplier(id: number, data: any) {
    return this.request('PUT', `/suppliers/${id}`, data);
  },

  async deleteSupplier(id: number) {
    return this.request('DELETE', `/suppliers/${id}`);
  },

  // Supplier Groups
  async getSupplierGroups() {
    return this.request('GET', '/supplier-groups');
  },

  async createSupplierGroup(data: { name: string }) {
    return this.request('POST', '/supplier-groups', data);
  },

  // ── Inventory Import/Export ──
  async importInventory(file: File, duplicateAction: 'skip' | 'update' | 'stop', dryRun: boolean) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('duplicate_action', duplicateAction);
    formData.append('dry_run', dryRun ? '1' : '0');

    const token = useAuthStore.getState().token;
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}/inventory/import`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json') || contentType.includes('text/json');
    const body = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new Error(isJson ? body.message || response.statusText : response.statusText);
    }
    return body;
  },

  async exportInventory(params: any = {}): Promise<Blob> {
    const token = useAuthStore.getState().token;
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const query = new URLSearchParams(params).toString();
    const url = `${API_BASE}/inventory/export${query ? '?' + query : ''}`;

    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || response.statusText);
    }
    return response.blob();
  },

  async downloadTemplate(): Promise<Blob> {
    const token = useAuthStore.getState().token;
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}/inventory/template`, { method: 'GET', headers });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || response.statusText);
    }
    return response.blob();
  },

  // Customers import
  async importCustomers(file: File, duplicateAction: 'skip' | 'update' | 'stop', dryRun: boolean) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('duplicate_action', duplicateAction);
    formData.append('dry_run', dryRun ? '1' : '0');

    const token = useAuthStore.getState().token;
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}/customers/import`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json') || contentType.includes('text/json');
    const body = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new Error(isJson ? body.message || response.statusText : response.statusText);
    }
    return body;
  },

  async downloadCustomerTemplate(): Promise<Blob> {
    const token = useAuthStore.getState().token;
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}/customers/template`, { method: 'GET', headers });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || response.statusText);
    }
    return response.blob();
  },
  // New vs Existing Customer Sales
  async getNewVsExistingCustomerSale(companyId?: number | string, branchId?: number | string) {
    const params = new URLSearchParams();
    if (companyId) params.append('company_id', String(companyId));
    if (branchId) params.append('branch_id', String(branchId));
    const qs = params.toString();
    return this.request('GET', `/dashboard/new-vs-existing-customers${qs ? '?' + qs : ''}`);
  },

};