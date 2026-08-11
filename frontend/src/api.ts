import { useAuthStore } from './store/auth';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');
const normalizeEndpoint = (endpoint: string) => (endpoint.startsWith('/') ? endpoint : `/${endpoint}`);

export const apiClient = {
  async request(method: string, endpoint: string, data?: any, options?: any) {
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

    if (data) {
      requestOptions.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`${API_BASE}${normalizeEndpoint(endpoint)}`, requestOptions);

      if (response.status === 401) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
        throw new Error('Unauthorized - please login again');
      }

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json') || contentType.includes('text/json');
      const body = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        const errorMessage = isJson ? body.message || response.statusText : response.statusText;
        throw new Error(errorMessage || `API Error: ${response.statusText}`);
      }

      return body;
    } catch (error: any) {
      console.error('API Error:', error);
      throw error;
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

  async sendAIAssistantChat(message: string) {
    return this.request('POST', '/ai/assistant/chat', { message });
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

  async getPurchases(params?: any) {
    return this.request('GET', '/purchases', params);
  },

  async getPurchase(id: number) {
    return this.request('GET', `/purchases/${id}`);
  },

  async createPurchase(data: any) {
    return this.request('POST', '/purchases', data);
  },

  async updatePurchase(id: number, data: any) {
    return this.request('PUT', `/purchases/${id}`, data);
  },

  async deletePurchase(id: number) {
    return this.request('DELETE', `/purchases/${id}`);
  },

  async duplicatePurchase(id: number) {
    return this.request('POST', `/purchases/${id}/duplicate`);
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
// Purchase Invoices (handled earlier under /purchases)

};