import { useAuthStore } from './store/auth';

// -----------------------------------------------------------------------------
// API BASE
// -----------------------------------------------------------------------------

export const API_BASE = (
  import.meta.env.VITE_API_BASE || '/api'
).replace(/\/$/, '');

const normalizeEndpoint = (endpoint: string) =>
  endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

// -----------------------------------------------------------------------------
// ENDPOINT CLASSIFICATION
// -----------------------------------------------------------------------------

/**
 * Endpoints that must NOT trigger the global "session expired → logout +
 * redirect to /login" behaviour on a 401, because the caller is either
 * unauthenticated (login) or deliberately handling the error inline
 * (2FA challenge verification).
 */
const PUBLIC_AUTH_ENDPOINTS: readonly string[] = [
  '/login',
  '/auth/login',
  '/auth/2fa/verify',
];

const isPublicAuthEndpoint = (endpoint: string): boolean =>
  PUBLIC_AUTH_ENDPOINTS.some(
    (publicEndpoint) =>
      endpoint === publicEndpoint || endpoint.startsWith(`${publicEndpoint}?`),
  );

// -----------------------------------------------------------------------------
// FALLBACK ENDPOINTS
// -----------------------------------------------------------------------------

const DASHBOARD_ENDPOINT_FALLBACKS: Record<string, string[]> = {
  '/products/low-stock': ['/dashboard/low-stock'],
  '/customers/top': ['/dashboard/top-customers'],
  '/vendors/top': ['/dashboard/top-vendors'],
  '/purchases/due': ['/dashboard/purchase-due'],
  '/admin/login-activity': ['/dashboard/login-activity'],
  '/reports/profit-loss-customers': ['/reports/profit-loss/customers'],
  '/reports/profit-loss-branches': ['/reports/profit-loss/branches'],
  '/reports/profit-loss-summary': ['/reports/profit-loss/summary'],
  '/reports/invoice-profitability': ['/reports/profit-loss/invoices'],
};

// -----------------------------------------------------------------------------
// SHARED TYPES
// -----------------------------------------------------------------------------

export interface ApiError extends Error {
  status?: number;
  endpoint?: string;
  method?: string;
  backendMessage?: string;
  validationErrors?: Record<string, string[] | string>;
  requestId?: string;
}

export interface PaginationMeta {
  current_page: number;
  from: number | null;
  last_page: number;
  per_page: number;
  to: number | null;
  total: number;
  path?: string;
}

export interface PaginatedResponse<T> {
  current_page: number;
  data: T[];
  first_page_url?: string;
  from: number | null;
  last_page: number;
  last_page_url?: string;
  links?: Array<{
    url: string | null;
    label: string;
    page: number | null;
    active: boolean;
  }>;
  next_page_url?: string | null;
  path?: string;
  per_page: number;
  prev_page_url?: string | null;
  to: number | null;
  total: number;
}

export type InvoicePaymentState = 'paid' | 'partial' | 'unpaid' | 'overdue';

export interface InvoiceListQuery {
  page?: number;
  per_page?: number;

  search?: string;

  company_id?: number | string;
  branch_id?: number | string;
  customer_id?: number | string;

  status?: string;
  payment_state?: InvoicePaymentState | string;

  date_from?: string;
  date_to?: string;

  due_from?: string;
  due_to?: string;

  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

export interface InvoiceSummary {
  total_invoices: number;
  total_amount: number;
  tax_amount: number;
  received_amount: number;
  outstanding_amount: number;

  paid_count: number;
  partial_count: number;
  unpaid_count: number;
  draft_count: number;
  overdue_count: number;

  today_count: number;
  today_amount: number;
}

export interface InvoiceSummaryResponse {
  success: boolean;
  data: InvoiceSummary;
  filters?: Record<string, unknown>;
}

export interface TwoFactorStatus {
  enabled: boolean;
  pending: boolean;
  confirmed_at: string | null;
  recovery_codes_remaining: number;
}

export interface TwoFactorChallengeResponse {
  two_factor_required: true;
  challenge_token: string;
  expires_in: number;
}

export interface TwoFactorEnableResponse {
  secret: string;
  otpauth_url: string;
}

export interface TwoFactorConfirmResponse {
  message: string;
  recovery_codes: string[];
}

export interface TwoFactorRecoveryCodesResponse {
  recovery_codes: string[];
}

/* ------------------------------------------------------------------ */
/* RBAC types                                                          */
/* ------------------------------------------------------------------ */

export interface RBACPermission {
  id: number;
  name: string;
  group: string | null;
  description: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RBACRole {
  id: number;
  name: string;
  group: string | null;
  description: string | null;
  active: boolean;
  permissions: number[];
  permission_names?: string[];
  users_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface RBACUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  two_factor_enabled?: boolean;
  email_verified_at?: string | null;
  roles: Array<{ id: number; name: string; group?: string | null }>;
  role_names?: string[];
  permission_names?: string[];
  permission_ids?: number[];
  created_at?: string;
  updated_at?: string;
}

export interface MyPermissionsResponse {
  success: boolean;
  data: {
    roles: string[];
    permissions: Array<{ id: number; name: string; group: string | null }>;
    permission_names: string[];
    permission_ids: number[];
  };
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

const normalizeApiPayload = <T>(payload: unknown, fallback: T): T => {
  if (payload === null || payload === undefined) {
    return fallback;
  }
  return payload as T;
};

const unwrapApiData = <T>(payload: unknown, fallback: T): T => {
  let current: any = payload;

  for (let depth = 0; depth < 3; depth += 1) {
    if (current === null || current === undefined) {
      return fallback;
    }
    if (Array.isArray(current)) {
      return current as T;
    }
    if (typeof current !== 'object') {
      return fallback;
    }

    const record = current as Record<string, unknown>;

    if (
      !('data' in record) ||
      record.data === undefined ||
      record.data === null
    ) {
      return current as T;
    }

    current = record.data;
  }

  return current as T;
};

const buildQuery = (params?: Record<string, unknown> | null): string => {
  const search = new URLSearchParams();

  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      search.set(key, String(value));
    });
  }

  const query = search.toString();
  return query ? `?${query}` : '';
};

const buildApiError = (options: {
  status: number;
  endpoint: string;
  method: string;
  fallbackMessage: string;
  payload?: unknown;
}): ApiError => {
  const payloadObject =
    options.payload && typeof options.payload === 'object'
      ? (options.payload as Record<string, unknown>)
      : {};

  const backendMessage =
    (typeof payloadObject.message === 'string' && payloadObject.message) ||
    (typeof payloadObject.error === 'string' && payloadObject.error) ||
    options.fallbackMessage;

  const validationErrors =
    payloadObject.errors && typeof payloadObject.errors === 'object'
      ? (payloadObject.errors as Record<string, string[] | string>)
      : undefined;

  const requestId =
    typeof payloadObject.request_id === 'string'
      ? payloadObject.request_id
      : undefined;

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

const statusFallbackMessage = (status: number, statusText: string): string => {
  switch (status) {
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return "You don't have permission to perform this action.";
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'This action conflicts with the current record state.';
    case 422:
      return 'Please correct the highlighted fields.';
    case 429:
      return 'Too many requests. Please try again shortly.';
    default:
      return status >= 500
        ? 'The server could not complete the request. Please try again.'
        : statusText || 'Request failed.';
  }
};

/** Safely compute the byte length of a request body without tripping TS. */
const getBodyByteLength = (body: BodyInit | null | undefined): number => {
  if (!body) return 0;
  if (typeof body === 'string') return new Blob([body]).size;
  if (body instanceof Blob) return body.size;
  if (body instanceof URLSearchParams) return new Blob([body.toString()]).size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  return 0;
};

// -----------------------------------------------------------------------------
// API CLIENT
// -----------------------------------------------------------------------------

export const apiClient = {
  // ---------------------------------------------------------------------------
  // GENERIC REQUEST
  // ---------------------------------------------------------------------------

  async request<T = any>(
    method: string,
    endpoint: string,
    data?: any,
    options?: any
  ): Promise<T> {
    const token = useAuthStore.getState().token;
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options?.headers || {}),
    };

    if (!isFormData) headers['Content-Type'] = 'application/json';

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const requestOptions: RequestInit = {
      method,
      headers,
    };

    if (data !== undefined && data !== null) {
      requestOptions.body = isFormData ? data : JSON.stringify(data);
    }

    const paramsToBuild = options?.params;
    let queryString = '';
    if (paramsToBuild && typeof paramsToBuild === 'object') {
      queryString = buildQuery(paramsToBuild);
    }
    const cleanEndpoint = normalizeEndpoint(endpoint);
    const requestUrl = `${API_BASE}${cleanEndpoint}${
      queryString
        ? cleanEndpoint.includes('?')
          ? '&' + queryString.replace(/^\?/, '')
          : queryString
        : ''
    }`;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const controller = new AbortController();

      timeoutId = setTimeout(() => controller.abort(), 30000);

      const requestOptionsWithRedirect: RequestInit = {
        ...requestOptions,
        redirect: 'manual',
        signal: controller.signal,
      };

      const response = await fetch(requestUrl, requestOptionsWithRedirect);

      // -----------------------------------------------------------------------
      // REDIRECT
      // -----------------------------------------------------------------------

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');

        throw buildApiError({
          status: response.status,
          endpoint,
          method,
          fallbackMessage:
            `Redirect to ${location || 'unknown'} - check authentication and permissions`,
          payload: { location },
        });
      }

      // -----------------------------------------------------------------------
      // UNAUTHORIZED
      // -----------------------------------------------------------------------

      if (response.status === 401 && !isPublicAuthEndpoint(endpoint)) {
        useAuthStore.getState().logout();

        if (
          typeof window !== 'undefined' &&
          window.location.pathname !== '/login'
        ) {
          window.location.href = '/login';
        }

        throw buildApiError({
          status: 401,
          endpoint,
          method,
          fallbackMessage: 'Unauthorized - please login again',
        });
      }

      // -----------------------------------------------------------------------
      // RESPONSE PARSING
      // -----------------------------------------------------------------------

      const contentType = response.headers.get('content-type') || '';

      const isJson =
        contentType.includes('application/json') ||
        contentType.includes('text/json') ||
        contentType.includes('+json');

      let body: any = null;

      try {
        if (response.status === 204) {
          body = null;
        } else {
          const raw = await response.text();
          body = raw ? (isJson ? JSON.parse(raw) : raw) : null;
        }
      } catch (parseError: any) {
        throw buildApiError({
          status: response.status,
          endpoint,
          method,
          fallbackMessage: 'Failed to parse server response.',
          payload: { parseError: parseError?.message },
        });
      }

      // -----------------------------------------------------------------------
      // HTTP ERRORS
      // -----------------------------------------------------------------------

      if (!response.ok) {
        const fallbackEndpoints =
          method === 'GET'
            ? DASHBOARD_ENDPOINT_FALLBACKS[endpoint] || []
            : [];

        if (response.status === 404 && fallbackEndpoints.length > 0) {
          let lastError: unknown;

          for (const fallbackEndpoint of fallbackEndpoints) {
            try {
              return await this.request<T>(
                method,
                fallbackEndpoint,
                data,
                options
              );
            } catch (error) {
              lastError = error;
            }
          }

          if (lastError) {
            throw lastError;
          }
        }

        throw buildApiError({
          status: response.status,
          endpoint,
          method,
          fallbackMessage: statusFallbackMessage(
            response.status,
            response.statusText,
          ),
          payload: body,
        });
      }

      return normalizeApiPayload<T>(body, (body ?? null) as T);
    } catch (error: any) {
      const apiError = error as ApiError;

      if (apiError?.name === 'ApiRequestError') {
        throw apiError;
      }

      // -----------------------------------------------------------------------
      // NETWORK / TIMEOUT ERRORS
      // -----------------------------------------------------------------------

      let networkMessage = 'Network request failed';

      if (error instanceof DOMException && error.name === 'AbortError') {
        networkMessage = 'The request timed out. Please try again.';
      } else if (error instanceof TypeError) {
        if (error.message.includes('Failed to fetch')) {
          networkMessage = 'Unable to connect to the server. Please try again.';
        } else {
          networkMessage = `Network error: ${error.message}`;
        }
      } else if (error instanceof Error) {
        networkMessage = error.message;
      }

      throw buildApiError({
        status: 0,
        endpoint,
        method,
        fallbackMessage: networkMessage || 'Network request failed',
        payload: {
          attempted_url: requestUrl,
          has_authorization: !!useAuthStore.getState().token,
          error: error?.message,
          body_bytes: getBodyByteLength(requestOptions.body),
        },
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  },

  // ---------------------------------------------------------------------------
  // GENERIC HTTP HELPERS
  // ---------------------------------------------------------------------------

  async get<T = any>(endpoint: string, options?: any): Promise<T> {
    return this.request<T>('GET', endpoint, undefined, options);
  },

  async post<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>('POST', endpoint, data);
  },

  async put<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>('PUT', endpoint, data);
  },

  async delete<T = any>(endpoint: string): Promise<T> {
    return this.request<T>('DELETE', endpoint);
  },

  // ---------------------------------------------------------------------------
  // AUTH
  // ---------------------------------------------------------------------------

  async login(email: string, password: string) {
    return this.request<
      | {
          access_token: string;
          token_type: string;
          expires_at?: string;
          user?: RBACUser;
        }
      | TwoFactorChallengeResponse
    >('POST', '/login', { email, password });
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

  // ---------------------------------------------------------------------------
  // TWO-FACTOR AUTHENTICATION
  // ---------------------------------------------------------------------------

  async verifyTwoFactor(challengeToken: string, code: string) {
    return this.request<{
      access_token: string;
      token_type: string;
      expires_at?: string;
      recovery_code_used?: boolean;
    }>('POST', '/auth/2fa/verify', {
      challenge_token: challengeToken,
      code,
    });
  },

  async getTwoFactorStatus() {
    return this.request<TwoFactorStatus>('GET', '/auth/2fa/status');
  },

  async enableTwoFactor(password: string) {
    return this.request<TwoFactorEnableResponse>('POST', '/auth/2fa/enable', {
      password,
    });
  },

  async confirmTwoFactor(code: string) {
    return this.request<TwoFactorConfirmResponse>('POST', '/auth/2fa/confirm', {
      code,
    });
  },

  async disableTwoFactor(password: string, code: string) {
    return this.request<{ message: string }>('POST', '/auth/2fa/disable', {
      password,
      code,
    });
  },

  async regenerateRecoveryCodes(password: string) {
    return this.request<TwoFactorRecoveryCodesResponse>(
      'POST',
      '/auth/2fa/recovery-codes',
      { password }
    );
  },

  // ---------------------------------------------------------------------------
  // COMPANIES
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // CUSTOMERS
  // ---------------------------------------------------------------------------

  async getCustomers(page = 1) {
    return this.request('GET', `/customers?page=${page}`);
  },

  async getAllCustomers() {
    return this.request('GET', '/customers?per_page=1000');
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

  async getCustomerGroups() {
    return this.request('GET', '/customer-groups');
  },

  async createCustomerGroup(data: { name: string }) {
    return this.request('POST', '/customer-groups', data);
  },

  async importCustomers(
    file: File,
    duplicateAction: 'skip' | 'update' | 'stop',
    dryRun: boolean
  ) {
    const formData = new FormData();

    formData.append('file', file);
    formData.append('duplicate_action', duplicateAction);
    formData.append('dry_run', dryRun ? '1' : '0');

    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/customers/import`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson =
      contentType.includes('application/json') ||
      contentType.includes('text/json');

    const body = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new Error(
        isJson ? body.message || response.statusText : response.statusText
      );
    }

    return body;
  },

  async downloadCustomerTemplate(): Promise<Blob> {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/customers/template`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || response.statusText);
    }

    return response.blob();
  },

  async lookupGst(gstin: string) {
    return this.request('GET', `/gstin/${gstin}`);
  },

  // ---------------------------------------------------------------------------
  // PRODUCTS
  // ---------------------------------------------------------------------------

  async getProducts(page = 1) {
    return this.request('GET', `/products?page=${page}`);
  },

  async getAllProducts() {
    return this.request('GET', '/products?per_page=all');
  },

  async generateProductSku(name?: string, prefix?: string): Promise<{ success: boolean; sku: string }> {
    const params = new URLSearchParams();
    if (name) params.append('name', name);
    if (prefix) params.append('prefix', prefix);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request('GET', `/products/generate-sku${query}`);
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

  async regenerateBarcode(productId: number) {
    return this.request('POST', `/products/${productId}/regenerate-barcode`);
  },

  async regenerateQr(productId: number) {
    return this.request('POST', `/products/${productId}/regenerate-qr`);
  },

  async lookupBarcode(barcode: string) {
    return this.request('GET', `/products/lookup-barcode/${encodeURIComponent(barcode)}`);
  },

  async suggestProduct(data: Record<string, any>) {
    return this.request('POST', '/ai/products/suggest', data);
  },

  async bulkEditProducts(payload: Record<string, any>) {
    return this.request('POST', '/products/bulk-edit', payload);
  },

  async aiBulkSuggest(instruction: string, products: any[]) {
    return this.request('POST', '/ai/products/bulk-suggest', { instruction, products });
  },

  async getPublicInvoiceMetadata(token: string) {
    return this.request('GET', `/public/invoices/${encodeURIComponent(token)}`);
  },

  async verifyPublicInvoice(token: string, mobile: string) {
    return this.request('POST', `/public/invoices/${encodeURIComponent(token)}/verify`, { mobile });
  },

  async importInventory(
    file: File,
    duplicateAction: 'skip' | 'update' | 'stop',
    dryRun: boolean
  ) {
    const formData = new FormData();

    formData.append('file', file);
    formData.append('duplicate_action', duplicateAction);
    formData.append('dry_run', dryRun ? '1' : '0');

    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/inventory/import`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson =
      contentType.includes('application/json') ||
      contentType.includes('text/json');

    const body = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new Error(
        isJson ? body.message || response.statusText : response.statusText
      );
    }

    return body;
  },

  async exportInventory(params: any = {}): Promise<Blob> {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const query = buildQuery(params);

    const response = await fetch(`${API_BASE}/inventory/export${query}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || response.statusText);
    }

    return response.blob();
  },

  async downloadTemplate(): Promise<Blob> {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/inventory/template`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || response.statusText);
    }

    return response.blob();
  },

  // ---------------------------------------------------------------------------
  // ORDERS
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // DEALERS
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // PAYMENTS
  // ---------------------------------------------------------------------------

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

  async getIncomeExpenses(params: Record<string, unknown> = {}) {
    return this.request('GET', `/income-expenses${buildQuery(params)}`);
  },

  async getIncomeExpenseDashboard(params: Record<string, unknown> = {}) {
    return this.request('GET', `/income-expenses/dashboard${buildQuery(params)}`);
  },

  async createIncomeExpense(data: any) {
    return this.request('POST', '/income-expenses', data);
  },

  async updateIncomeExpense(id: number, data: any) {
    return this.request('PUT', `/income-expenses/${id}`, data);
  },

  async deleteIncomeExpense(id: number) {
    return this.request('DELETE', `/income-expenses/${id}`);
  },

  async getFinancialCategories(params: Record<string, unknown> = {}) {
    return this.request('GET', `/financial-categories${buildQuery(params)}`);
  },

  async createFinancialCategory(data: any) {
    return this.request('POST', '/financial-categories', data);
  },

  async updateFinancialCategory(id: number, data: any) {
    return this.request('PUT', `/financial-categories/${id}`, data);
  },

  // ---------------------------------------------------------------------------
  // SALES
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // SALES INVOICE RETURNS
  // ---------------------------------------------------------------------------

  async getSalesInvoiceReturns(params: Record<string, unknown> = {}) {
    return this.request(
      'GET',
      `/sales-returns${buildQuery({ per_page: 1000, ...params })}`
    );
  },

  async getSalesInvoiceReturn(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid sales return ID.');
    }
    return this.request('GET', `/sales-returns/${id}`);
  },

  async createSalesInvoiceReturn(data: any) {
    return this.request('POST', '/sales-returns', data);
  },

  async updateSalesInvoiceReturn(id: number, data: any) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid sales return ID.');
    }
    return this.request('PUT', `/sales-returns/${id}`, data);
  },

  async deleteSalesInvoiceReturn(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid sales return ID.');
    }
    return this.request('DELETE', `/sales-returns/${id}`);
  },

  async searchReturnCustomers(query: string) {
    const trimmedQuery = String(query ?? '').trim();

    if (!trimmedQuery) {
      return { data: [] };
    }

    return this.request(
      'GET',
      `/sales-returns/search/customers${buildQuery({ query: trimmedQuery })}`
    );
  },

  async searchReturnInvoices(query: string, customerId?: number) {
    const trimmedQuery = String(query ?? '').trim();

    if (!trimmedQuery) {
      return { data: [] };
    }

    return this.request(
      'GET',
      `/sales-returns/search/invoices${buildQuery({
        query: trimmedQuery,
        customer_id: customerId && customerId > 0 ? customerId : undefined,
        per_page: 20,
      })}`
    );
  },

  async searchReturnProducts(query: string) {
    const trimmedQuery = String(query ?? '').trim();

    if (!trimmedQuery) {
      return { data: [] };
    }

    return this.request(
      'GET',
      `/sales-returns/search/products${buildQuery({ query: trimmedQuery })}`
    );
  },

  async getCustomerInvoicesForReturn(customerId: number) {
    if (!Number.isInteger(customerId) || customerId <= 0) {
      throw new Error('Invalid customer ID.');
    }

    return this.request(
      'GET',
      `/sales-returns/customer/${customerId}/invoices`
    );
  },

  async getInvoiceItemsForReturn(invoiceId: number) {
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      throw new Error('Invalid invoice ID.');
    }

    return this.request('GET', `/sales-returns/invoice/${invoiceId}/items`);
  },

  async getInvoiceDetailsForReturn(invoiceId: number) {
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      throw new Error('Invalid invoice ID.');
    }

    const response = await this.request<any>(
      'GET',
      `/sales-returns/invoice/${invoiceId}/details`
    );

    const invoice = unwrapApiData<any>(response, null);

    if (!invoice || typeof invoice !== 'object' || !invoice.id) {
      throw new Error('Invoice details were not returned by the server.');
    }

    return { data: invoice };
  },

  async getSalesReports() {
    return this.request('GET', '/sales/reports');
  },

  // ---------------------------------------------------------------------------
  // PURCHASES
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // ACCOUNTING
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // ATTENDANCE
  // ---------------------------------------------------------------------------

  async getAttendance(query?: string | number) {
    const q = query
      ? typeof query === 'number'
        ? `?page=${query}`
        : `?${query}`
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

  // ---------------------------------------------------------------------------
  // BIOMETRIC
  // ---------------------------------------------------------------------------

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
    return this.request('POST', `/biometric/device/${deviceId}/settings`, {
      settings,
    });
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
    return this.request('POST', `/biometric/device/${deviceId}/enroll`, {
      employee_id: employeeId,
    });
  },

  async updateDevice(id: number, data: any) {
    return this.request('PUT', `/biometric/device/${id}`, data);
  },

  async deleteDevice(id: number) {
    return this.request('DELETE', `/biometric/device/${id}`);
  },

  async getEnrolledFingers(employeeId: number) {
    return this.request('GET', `/biometric/employees/${employeeId}/fingers`);
  },

  // ---------------------------------------------------------------------------
  // PAYROLL
  // ---------------------------------------------------------------------------

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

  async getPayrollAdvances() {
    return this.request('GET', '/payroll/advances');
  },

  async createPayrollAdvance(data: any) {
    return this.request('POST', '/payroll/advances', data);
  },

  async updatePayrollAdvance(id: number, data: any) {
    return this.request('PUT', `/payroll/advances/${id}`, data);
  },

  async deletePayrollAdvance(id: number) {
    return this.request('DELETE', `/payroll/advances/${id}`);
  },

  async getPayrollLeaves() {
    return this.request('GET', '/payroll/leaves');
  },

  async createPayrollLeave(data: any) {
    return this.request('POST', '/payroll/leaves', data);
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

  async getPayrollShifts() {
    return this.request('GET', '/payroll/shifts');
  },

  async createPayrollShift(data: any) {
    return this.request('POST', '/payroll/shifts', data);
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

  async getPayrollLoans() {
    return this.request('GET', '/payroll/loans');
  },

  async createPayrollLoan(data: any) {
    return this.request('POST', '/payroll/loans', data);
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

  async getPayrollPayslips() {
    return this.request('GET', '/payroll/payslips');
  },

  async createPayrollPayslip(data: any) {
    return this.request('POST', '/payroll/payslips', data);
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

  // ---------------------------------------------------------------------------
  // INVOICES
  // ---------------------------------------------------------------------------

  async getNextInvoiceNumber() {
    return this.request('GET', '/invoices/next-number');
  },

  /**
   * Get invoices with production-grade server-side filtering.
   *
   * Backward compatible:
   *   getInvoices()
   *   getInvoices(1)
   *
   * New:
   *   getInvoices({
   *     page: 1,
   *     per_page: 25,
   *     search: 'INV-2026',
   *     company_id: 1,
   *     branch_id: 2,
   *     status: 'issued',
   *     payment_state: 'partial',
   *     date_from: '2026-09-01',
   *     date_to: '2026-09-10',
   *     sort_by: 'invoice_date',
   *     sort_dir: 'desc'
   *   })
   */
  async getInvoices(
    queryOrPage: number | InvoiceListQuery = 1
  ): Promise<PaginatedResponse<any>> {
    const params =
      typeof queryOrPage === 'number' ? { page: queryOrPage } : queryOrPage;

    return this.request<PaginatedResponse<any>>(
      'GET',
      `/invoices${buildQuery(params as Record<string, unknown>)}`
    );
  },

  /**
   * Get invoice KPI summary using the same filter scope as the listing.
   */
  async getInvoiceSummary(
    params: InvoiceListQuery = {}
  ): Promise<InvoiceSummaryResponse> {
    return this.request<InvoiceSummaryResponse>(
      'GET',
      `/invoices/summary${buildQuery({
        ...params,
        // Pagination does not affect summary.
        page: undefined,
        per_page: undefined,
        sort_by: undefined,
        sort_dir: undefined,
      })}`
    );
  },

  async getInvoice(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid invoice ID.');
    }
    return this.request('GET', `/invoices/${id}`);
  },

  async createInvoice(data: any) {
    return this.request('POST', '/invoices', data);
  },

  async createInvoiceFromOrder(
    orderId: number,
    invoiceNo: string,
    opts?: any
  ) {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error('Invalid order ID.');
    }

    return this.request('POST', '/invoices/from-order', {
      order_id: orderId,
      invoice_no: invoiceNo,
      ...(opts || {}),
    });
  },

  async updateInvoice(id: number, data: any) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid invoice ID.');
    }
    return this.request('PUT', `/invoices/${id}`, data);
  },
  async updateInvoiceDeliveryStatus(
    id: number | string,
    data: { delivery_status: string; items?: any[]; notes?: string }
  ) {
    return this.request('PATCH', `/invoices/${id}/delivery-status`, data);
  },

  async updateInvoiceItemDeliveryStatus(
    invoiceId: number | string,
    itemId: number | string,
    data: { delivery_status: string; packed_quantity?: number; delivered_quantity?: number }
  ) {
    return this.request('PATCH', `/invoices/${invoiceId}/items/${itemId}/delivery-status`, data);
  },


  async deleteInvoice(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid invoice ID.');
    }
    return this.request('DELETE', `/invoices/${id}`);
  },

  /**
   * Bulk invoice status update.
   *
   * POST /api/invoices/bulk-status
   */
  async bulkUpdateInvoiceStatus(ids: number[], status: string) {
    const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);

    if (validIds.length === 0) {
      throw new Error('At least one valid invoice ID is required.');
    }

    if (!status.trim()) {
      throw new Error('Invoice status is required.');
    }

    return this.request('POST', '/invoices/bulk-status', {
      ids: validIds,
      status,
    });
  },

  /**
   * Bulk invoice soft-delete.
   *
   * POST /api/invoices/bulk-delete
   */
  async bulkDeleteInvoices(ids: number[]) {
    const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);

    if (validIds.length === 0) {
      throw new Error('At least one valid invoice ID is required.');
    }

    return this.request('POST', '/invoices/bulk-delete', {
      ids: validIds,
    });
  },

  /**
   * Backward/alternative naming aliases.
   */
  async updateInvoiceStatusBulk(ids: number[], status: string) {
    return this.bulkUpdateInvoiceStatus(ids, status);
  },

  async deleteInvoicesBulk(ids: number[]) {
    return this.bulkDeleteInvoices(ids);
  },

  /**
   * Duplicate invoice.
   */
  async duplicateInvoice(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid invoice ID.');
    }
    return this.request('POST', `/invoices/${id}/duplicate`);
  },

  // ---------------------------------------------------------------------------
  // PURCHASE INVOICES
  // ---------------------------------------------------------------------------

  async getPurchaseInvoices(params: number | Record<string, unknown> = {}) {
    if (typeof params === 'number') {
      return this.request('GET', `/purchase-invoices?page=${params}`);
    }
    const query = buildQuery(params);
    return this.request('GET', `/purchase-invoices${query}`);
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

  // Aliases
  async getPurchase(id: number) {
    const response = await this.getPurchaseInvoice(id);
    return response?.data ? response : { data: response };
  },

  async updatePurchase(id: number, data: any) {
    const response = await this.updatePurchaseInvoice(id, data);
    return response?.data ? response : { data: response };
  },

  // ---------------------------------------------------------------------------
  // BRANCHES
  // ---------------------------------------------------------------------------

  async getBranches(page = 1) {
    return this.request('GET', `/branches?page=${page}`);
  },

  async getBranchesByCompany(companyId: number) {
    if (!Number.isInteger(Number(companyId)) || Number(companyId) <= 0) {
      throw new Error('Invalid company ID.');
    }

    return this.request(
      'GET',
      `/branches${buildQuery({ company_id: companyId })}`
    );
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

  // ---------------------------------------------------------------------------
  // EMPLOYEES
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // WAREHOUSES
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // UPLOADS
  // ---------------------------------------------------------------------------

  async getUploads() {
    return this.request('GET', '/uploads');
  },

  async uploadFile(formData: FormData) {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson =
      contentType.includes('application/json') ||
      contentType.includes('text/json');

    const body = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new Error(
        isJson ? body.message || response.statusText : response.statusText
      );
    }

    return body;
  },

  async createUploadFolder(folder: string) {
    return this.request('POST', '/uploads/folders', { folder });
  },

  async deleteUpload(path: string) {
    return this.request('POST', '/uploads/delete', { path });
  },

  // ---------------------------------------------------------------------------
  // USERS / ROLES / PERMISSIONS — full RBAC surface
  // ---------------------------------------------------------------------------

  /* ---------------------------- USERS ---------------------------- */

  async getUsers(): Promise<{ success: boolean; data: RBACUser[] } | RBACUser[]> {
    return this.request('GET', '/users');
  },

  async getUser(id: number) {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid user ID.');
    return this.request('GET', `/users/${id}`);
  },

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    phone?: string | null;
    role_ids?: number[];
  }) {
    return this.request('POST', '/users', data);
  },

  async updateUser(
    id: number,
    data: {
      name?: string;
      email?: string;
      password?: string | null;
      phone?: string | null;
      role_ids?: number[];
    }
  ) {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid user ID.');
    return this.request('PUT', `/users/${id}`, data);
  },

  async deleteUser(id: number) {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid user ID.');
    return this.request('DELETE', `/users/${id}`);
  },

  async assignRolesToUser(userId: number, roleIds: number[]) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error('Invalid user ID.');
    }
    return this.request('POST', `/users/${userId}/roles`, {
      role_ids: roleIds,
    });
  },

  /* ---------------------------- ROLES ---------------------------- */

  async getRoles(): Promise<{ success: boolean; data: RBACRole[] } | RBACRole[]> {
    return this.request('GET', '/roles');
  },

  async getRole(id: number) {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid role ID.');
    return this.request('GET', `/roles/${id}`);
  },

  async createRole(data: {
    name: string;
    group?: string | null;
    description?: string | null;
    active?: boolean;
    permission_ids?: number[];
  }) {
    return this.request('POST', '/roles', data);
  },

  async updateRole(
    id: number,
    data: {
      name: string;
      group?: string | null;
      description?: string | null;
      active?: boolean;
      permission_ids?: number[];
    }
  ) {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid role ID.');
    return this.request('PUT', `/roles/${id}`, data);
  },

  async deleteRole(id: number) {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid role ID.');
    return this.request('DELETE', `/roles/${id}`);
  },

  /* ------------------------- PERMISSIONS ------------------------- */

  async getPermissions(): Promise<
    { success: boolean; data: RBACPermission[] } | RBACPermission[]
  > {
    return this.request('GET', '/permissions');
  },

  async createPermission(data: {
    name: string;
    group?: string | null;
    description?: string | null;
    active?: boolean;
  }) {
    return this.request('POST', '/permissions', data);
  },

  async updatePermission(
    id: number,
    data: {
      name: string;
      group?: string | null;
      description?: string | null;
      active?: boolean;
    }
  ) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid permission ID.');
    }
    return this.request('PUT', `/permissions/${id}`, data);
  },

  async deletePermission(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid permission ID.');
    }
    return this.request('DELETE', `/permissions/${id}`);
  },

  /**
   * Self-inspection — "what can I do right now?"
   * Public to any authenticated user.
   */
  async getMyPermissions(): Promise<MyPermissionsResponse> {
    return this.request<MyPermissionsResponse>('GET', '/permissions/me');
  },

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------

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

    if (providerId) {
      payload.provider_id = providerId;
    }

    return this.request('POST', '/ai/assistant/chat', payload);
  },

  async liveConverse(payload: {
    transcript: string;
    voice?: string;
    language?: string;
    history?: Array<{ role: string; text: string }>;
    turn_id?: string;
  }) {
    return this.request('POST', '/ai/assistant/live-converse', payload);
  },

  async generateAiSpeech(
    text: string,
    provider: 'browser' | 'cloud' | 'auto' = 'auto',
    language = 'en-US',
    voice_name?: string
  ) {
    return this.request('POST', '/ai/assistant/voice', {
      text,
      provider,
      language,
      voice_name,
    });
  },

  // ---------------------------------------------------------------------------
  // DASHBOARD
  // ---------------------------------------------------------------------------

  async getDashboardAnalytics(params?: any) {
    const query = params ? buildQuery(params) : '';
    return this.request('GET', `/dashboard/analytics${query}`);
  },

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
    const qs = state ? buildQuery({ state }) : '';
    return this.request('GET', `/dashboard/district-sales${qs}`);
  },

  async getNewVsExistingCustomerSale(
    companyId?: number | string,
    branchId?: number | string
  ) {
    const params: Record<string, unknown> = {};

    if (companyId) params.company_id = companyId;
    if (branchId) params.branch_id = branchId;

    return this.request(
      'GET',
      `/dashboard/new-vs-existing-customers${buildQuery(params)}`
    );
  },

  // ---------------------------------------------------------------------------
  // API TOKENS
  // ---------------------------------------------------------------------------

  async getApiTokens() {
    return this.request('GET', '/api-tokens');
  },

  async generateApiToken(data: {
    name: string;
    abilities?: string[];
    expires_at?: string | null;
  }) {
    return this.request('POST', '/api-tokens/generate', data);
  },

  async revokeApiToken(id: number) {
    return this.request('DELETE', `/api-tokens/${id}`);
  },

  async revokeAllApiTokens() {
    return this.request('DELETE', '/api-tokens');
  },

  // ---------------------------------------------------------------------------
  // SUPPLIERS
  // ---------------------------------------------------------------------------

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

  async getSupplierGroups() {
    return this.request('GET', '/supplier-groups');
  },

  async createSupplierGroup(data: { name: string }) {
    return this.request('POST', '/supplier-groups', data);
  },

  // ---------------------------------------------------------------------------
  // REPORTS
  // ---------------------------------------------------------------------------

  async getAllReports(params?: any) {
    const query = params ? buildQuery(params) : '';
    return this.request('GET', `/reports/all${query}`);
  },

  async getReportSummary(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/summary${query}`);
  },

  async getSalesSummary(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/sales-summary${query}`);
  },

  async getSalesRegister(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/sales-register${query}`);
  },

  async getSalesByCustomer(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/sales-by-customer${query}`);
  },

  async getSalesByProduct(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/sales-by-product${query}`);
  },

  async getGstSalesReport(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/gst-sales${query}`);
  },

  async getOutstandingSales(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/outstanding-sales${query}`);
  },

  async getPurchaseSummary(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/purchase-summary${query}`);
  },

  async getPurchaseRegister(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/purchase-register${query}`);
  },

  async getPurchaseByVendor(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/purchase-by-vendor${query}`);
  },

  async getGeneralLedger(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/general-ledger${query}`);
  },

  async getOutstandingPurchases(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/outstanding-purchases${query}`);
  },

  async getProfitLossReport(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/profit-loss${query}`);
  },

  async getProfitLossSummary(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/profit-loss/summary${query}`);
  },

  async getProfitLossProducts(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/profit-loss/products${query}`);
  },

  async getProfitLossCustomers(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/profit-loss/customers${query}`);
  },

  async getProfitLossBranches(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/profit-loss/branches${query}`);
  },

  async getProfitLossMonthly(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/profit-loss/monthly${query}`);
  },

  async getProfitLossYearly(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/profit-loss/yearly${query}`);
  },

  async getProfitLossComparison(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/profit-loss/comparison${query}`);
  },

  async getInvoiceProfitabilityReport(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/profit-loss/invoices${query}`);
  },

  async getInvoiceProfitabilityDetail(
    invoice: string | number,
    params: any = {}
  ) {
    const query = buildQuery(params);
    return this.request(
      'GET',
      `/reports/profit-loss/invoices/${invoice}${query}`
    );
  },

  async getProductProfitabilityReport(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/product-profitability${query}`);
  },

  async getGstSummary(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/gst-summary${query}`);
  },

  async getCustomerLedger(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/customer-ledger${query}`);
  },

  async getReceivablesAging(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/receivables-aging${query}`);
  },

  async getPayablesAging(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/payables-aging${query}`);
  },

  async getSalesPurchaseTrend(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/sales-purchase-trend${query}`);
  },

  async getPaymentModeSummary(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/payment-mode-summary${query}`);
  },

  async getExpenseReport(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/expense-report${query}`);
  },

  async getCashFlowSummary(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/cash-flow${query}`);
  },

  async getStockSummaryReport(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/reports/stock-summary${query}`);
  },

  async getAuditLogs(params: any = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/audit-logs${query}`);
  },

  // ---------------------------------------------------------------------------
  // GEMINI VOICE AI
  // ---------------------------------------------------------------------------

  async processGeminiVoice(text: string) {
    return this.request('POST', '/gemini/voice', { text });
  },

  async getGeminiInsights() {
    return this.request('GET', '/gemini/insights');
  },

  async geminiChat(
    message: string,
    history?: Array<{ role: string; text: string }>,
    memory?: string,
  ) {
    return this.request('POST', '/gemini/chat', { message, history, memory });
  },

  async geminiVoice(text: string) {
    return this.request('POST', '/gemini/voice', { text });
  },

  async geminiInsights() {
    return this.request('GET', '/gemini/insights');
  },

  async geminiTest() {
    return this.request('GET', '/gemini/test');
  },

  async getGeminiLiveToken() {
    return this.request('POST', '/gemini/live-token');
  },

  // Add inside the apiClient object in api.ts

  // ---------------------------------------------------------------------------
  // VOICE AI CONVERSATION (New Endpoints)
  // ---------------------------------------------------------------------------

  async voiceConverse(payload: {
    message?: string;
    audioBase64?: string;
    audioMime?: string;
    voice?: string;
    persona?: string;
    chatHistory?: Array<{ role: string; content: string }>;
  }) {
    return this.request('POST', '/voice-converse', payload);
  },

  async transcribeAudio(audioBase64: string, mimeType: string = 'audio/webm') {
    return this.request('POST', '/transcribe', { audioBase64, mimeType });
  },


  // ---------------------------------------------------------------------------
  // AUTOMATION
  // ---------------------------------------------------------------------------

  async getAutomationWorkflows(params: Record<string, unknown> = {}) {
    return this.request('GET', `/automation/workflows${buildQuery(params)}`);
  },

  async createAutomationWorkflow(data: any) {
    return this.request('POST', '/automation/workflows', data);
  },

  async updateAutomationWorkflow(id: number, data: any) {
    return this.request('PUT', `/automation/workflows/${id}`, data);
  },

  async deleteAutomationWorkflow(id: number) {
    return this.request('DELETE', `/automation/workflows/${id}`);
  },

  async runAutomationWorkflow(id: number, data: any = {}) {
    return this.request('POST', `/automation/workflows/${id}/run`, data);
  },

  async duplicateAutomationWorkflow(id: number) {
    return this.request('POST', `/automation/workflows/${id}/duplicate`);
  },

  async getAutomationRuns(params: Record<string, unknown> = {}) {
    return this.request('GET', `/automation/runs${buildQuery(params)}`);
  },

  async getAutomationStats() {
    return this.request('GET', '/automation/stats');
  },

  // ---------------------------------------------------------------------------
  // WMS / STOCK TRANSFERS
  // ---------------------------------------------------------------------------
  async getWmsTransfers(params?: any) {
    return this.request('GET', '/wms/transfers', undefined, { params });
  },

  async createWmsTransfer(data: any) {
    return this.request('POST', '/wms/transfers', data);
  },

  async approveWmsTransfer(id: number) {
    return this.request('POST', `/wms/transfers/${id}/approve`);
  },

  async dispatchWmsTransfer(id: number) {
    return this.request('POST', `/wms/transfers/${id}/dispatch`);
  },

  async receiveWmsTransfer(id: number) {
    return this.request('POST', `/wms/transfers/${id}/receive`);
  },

  async cancelWmsTransfer(id: number, reason?: string) {
    return this.request('POST', `/wms/transfers/${id}/cancel`, { reason });
  },

  // ---------------------------------------------------------------------------
  // CONNECTED APPS (Flutter & Mobile App Management)
  // ---------------------------------------------------------------------------

  async getConnectedApps(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/connected-apps${query}`);
  },

  async getConnectedApp(id: number) {
    return this.request('GET', `/connected-apps/${id}`);
  },

  async createConnectedApp(data: any) {
    return this.request('POST', '/connected-apps', data);
  },

  async updateConnectedApp(id: number, data: any) {
    return this.request('PUT', `/connected-apps/${id}`, data);
  },

  async deleteConnectedApp(id: number) {
    return this.request('DELETE', `/connected-apps/${id}`);
  },

  async regenerateAppToken(id: number) {
    return this.request('POST', `/connected-apps/${id}/regenerate-token`);
  },

  async getAppHandshake(identifier: string, version = '1.0.0') {
    return this.request('GET', `/v1/apps/${encodeURIComponent(identifier)}/handshake?version=${encodeURIComponent(version)}`);
  },

  async checkAppOta(identifier: string, version = '1.0.0') {
    return this.request('GET', `/v1/apps/${encodeURIComponent(identifier)}/check-update?version=${encodeURIComponent(version)}`);
  },

  async testFlutterLogin(identifier: string, data: { email: string; password: string; device_name?: string; app_version?: string }) {
    return this.request('POST', `/v1/apps/${encodeURIComponent(identifier)}/login`, data);
  },

  // ---------------------------------------------------------------------------
  // BANK & CASH MANAGEMENT + AUTOMATED RECONCILIATION
  // ---------------------------------------------------------------------------

  async getBankAccounts(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/banking/accounts${query}`);
  },

  async getBankAccount(id: number) {
    return this.request('GET', `/banking/accounts/${id}`);
  },

  async createBankAccount(data: any) {
    return this.request('POST', '/banking/accounts', data);
  },

  async updateBankAccount(id: number, data: any) {
    return this.request('PUT', `/banking/accounts/${id}`, data);
  },

  async deleteBankAccount(id: number) {
    return this.request('DELETE', `/banking/accounts/${id}`);
  },

  async getBankAccountTransactions(accountId: number | string, params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/banking/accounts/${accountId}/transactions${query}`);
  },

  async createBankTransfer(data: {
    source_account_id: number;
    destination_account_id: number;
    amount: number;
    transaction_date: string;
    reference_no?: string;
    description?: string;
  }) {
    return this.request('POST', '/banking/transfers', data);
  },

  async createBankAdjustment(data: {
    bank_account_id: number;
    transaction_type: string;
    amount: number;
    transaction_date: string;
    reference_no?: string;
    description?: string;
  }) {
    return this.request('POST', '/banking/adjustments', data);
  },

  async getCashClosings(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/banking/cash-closings${query}`);
  },

  async createCashClosing(data: {
    cash_account_id: number;
    closing_date: string;
    physical_cash_counted: number;
    denomination_breakdown?: Record<string, number>;
    remarks?: string;
  }) {
    return this.request('POST', '/banking/cash-closings', data);
  },

  async approveCashClosing(id: number, note?: string) {
    return this.request('POST', `/banking/cash-closings/${id}/approve`, { note });
  },

  async rejectCashClosing(id: number, reason: string) {
    return this.request('POST', `/banking/cash-closings/${id}/reject`, { reason });
  },

  async uploadBankStatement(formData: FormData) {
    return this.request('POST', '/banking/statements/upload', formData);
  },

  async getBankStatements(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/banking/statements${query}`);
  },

  async deleteBankStatement(id: number) {
    return this.request('DELETE', `/banking/statements/${id}`);
  },

  async getReconciliationDashboard(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/banking/reconciliation/dashboard${query}`);
  },

  async getReconciliationWorkspace(accountId: number, statementId?: number) {
    const query = statementId ? `?statement_id=${statementId}` : '';
    return this.request('GET', `/banking/reconciliation/${accountId}${query}`);
  },

  async confirmReconciliationMatch(data: {
    statement_transaction_id: number;
    payment_id: number;
    allocated_amount?: number;
    match_type?: string;
  }) {
    return this.request('POST', '/banking/reconciliation/match', data);
  },

  async unmatchReconciliation(statementTransactionId: number) {
    return this.request('POST', '/banking/reconciliation/unmatch', {
      statement_transaction_id: statementTransactionId,
    });
  },

  async autoMatchReconciliation(bankAccountId: number, confidenceThreshold = 95) {
    return this.request('POST', '/banking/reconciliation/auto-match', {
      bank_account_id: bankAccountId,
      confidence_threshold: confidenceThreshold,
    });
  },

  async getAiReconciliationSuggestion(statementTransactionId: number) {
    return this.request('POST', '/banking/reconciliation/ai-suggest', {
      statement_transaction_id: statementTransactionId,
    });
  },

  async createReconciliationAdjustment(data: {
    statement_transaction_id: number;
    transaction_type: string;
    amount: number;
    description?: string;
  }) {
    return this.request('POST', '/banking/reconciliation/adjustments', data);
  },

  async getCashSummary(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/banking/cash-summary${query}`);
  },

  async quickRecordPaymentAndMatch(data: {
    statement_transaction_id: number;
    payment_direction: 'inward' | 'outward';
    payment_method: string;
    transaction_date?: string;
    reference_no?: string;
    customer_name?: string;
    remarks?: string;
    invoice_id?: number;
  }) {
    return this.request('POST', '/banking/reconciliation/quick-record', data);
  },

  async processFullStatementReconciliation(statementId: number, autoApprove = false) {
    return this.request('POST', `/banking/statements/${statementId}/process-full-reconciliation`, {
      auto_approve: autoApprove,
    });
  },

  async getStatementSummary(statementId: number) {
    return this.request('GET', `/banking/statements/${statementId}/summary`);
  },

  async approveExpenseDraft(statementTxnId: number, saveLearnedRule = true) {
    return this.request('POST', `/banking/reconciliation/expense-drafts/${statementTxnId}/approve`, {
      save_learned_rule: saveLearnedRule,
    });
  },

  async editExpenseDraft(statementTxnId: number, data: {
    category?: string;
    counterparty?: string;
    amount?: number;
    description?: string;
    notes?: string;
  }) {
    return this.request('PUT', `/banking/reconciliation/expense-drafts/${statementTxnId}`, data);
  },

  async rejectExpenseDraft(statementTxnId: number) {
    return this.request('POST', `/banking/reconciliation/expense-drafts/${statementTxnId}/reject`);
  },

  async ignoreStatementTransaction(statementTxnId: number, reason: string) {
    return this.request('POST', `/banking/reconciliation/transactions/${statementTxnId}/ignore`, {
      reason,
    });
  },

  async unignoreStatementTransaction(statementTxnId: number) {
    return this.request('POST', `/banking/reconciliation/transactions/${statementTxnId}/unignore`);
  },

  async getReconciliationRules(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/banking/rules${query}`);
  },

  async createReconciliationRule(data: {
    rule_name: string;
    pattern_type: string;
    pattern_value: string;
    action: string;
    category?: string;
    vendor_name?: string;
    confidence_score?: number;
    notes?: string;
  }) {
    return this.request('POST', '/banking/rules', data);
  },

  async updateReconciliationRule(id: number, data: Record<string, unknown>) {
    return this.request('PUT', `/banking/rules/${id}`, data);
  },

  async deleteReconciliationRule(id: number) {
    return this.request('DELETE', `/banking/rules/${id}`);
  },

  async toggleReconciliationRule(id: number) {
    return this.request('POST', `/banking/rules/${id}/toggle`);
  },
  // --- Quotations ---
  async getQuotations(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/quotations${query}`);
  },

  async getQuotation(id: number) {
    return this.request('GET', `/quotations/${id}`);
  },

  async getQuotationSummary(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/quotations/summary${query}`);
  },

  async getNextQuotationNumber() {
    return this.request('GET', '/quotations/next-number');
  },

  async createQuotation(data: any) {
    return this.request('POST', '/quotations', data);
  },

  async updateQuotation(id: number, data: any) {
    return this.request('PUT', `/quotations/${id}`, data);
  },

  async updateQuotationStatus(id: number, data: { status: string; rejection_reason?: string; follow_up_date?: string }) {
    return this.request('PATCH', `/quotations/${id}/status`, data);
  },

  async convertQuotation(id: number, data: { invoice_date?: string; due_date?: string; auto_deduct_stock?: boolean; warehouse_id?: number; payment_term?: string } = {}) {
    return this.request('POST', `/quotations/${id}/convert`, data);
  },

  async duplicateQuotation(id: number) {
    return this.request('POST', `/quotations/${id}/duplicate`);
  },

  async deleteQuotation(id: number) {
    return this.request('DELETE', `/quotations/${id}`);
  },

  // --- Leads ---
  async getLeads(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/leads${query}`);
  },

  async getLead(id: number) {
    return this.request('GET', `/leads/${id}`);
  },

  async getLeadSummary(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/leads/summary${query}`);
  },

  async createLead(data: any) {
    return this.request('POST', '/leads', data);
  },

  async updateLead(id: number, data: any) {
    return this.request('PUT', `/leads/${id}`, data);
  },

  async updateLeadStage(id: number, stage: string, note?: string, lost_reason?: string) {
    return this.request('PATCH', `/leads/${id}/stage`, { stage, note, lost_reason });
  },

  async addLeadActivity(id: number, data: { activity_type: string; title: string; description?: string; activity_date?: string; follow_up_date?: string }) {
    return this.request('POST', `/leads/${id}/activities`, data);
  },

  async convertLead(id: number, data: { create_customer?: boolean; create_contact?: boolean; customer_name?: string; gstin?: string; pan?: string } = {}) {
    return this.request('POST', `/leads/${id}/convert`, data);
  },

  async deleteLead(id: number) {
    return this.request('DELETE', `/leads/${id}`);
  },

  // --- Contacts ---
  async getContacts(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/contacts${query}`);
  },

  async getContact(id: number) {
    return this.request('GET', `/contacts/${id}`);
  },

  async getContactSummary(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/contacts/summary${query}`);
  },

  async checkContactDuplicate(params: { phone?: string; email?: string; gstin?: string; exclude_id?: number }) {
    const query = buildQuery(params);
    return this.request('GET', `/contacts/check-duplicate${query}`);
  },

  async createContact(data: any) {
    return this.request('POST', '/contacts', data);
  },

  async updateContact(id: number, data: any) {
    return this.request('PUT', `/contacts/${id}`, data);
  },

  async deleteContact(id: number) {
    return this.request('DELETE', `/contacts/${id}`);
  },

  // --- Opportunities ---
  async getOpportunities(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/opportunities${query}`);
  },

  async getOpportunitySummary(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/opportunities/summary${query}`);
  },

  async createOpportunity(data: any) {
    return this.request('POST', '/opportunities', data);
  },

  async updateOpportunity(id: number, data: any) {
    return this.request('PUT', `/opportunities/${id}`, data);
  },

  async deleteOpportunity(id: number) {
    return this.request('DELETE', `/opportunities/${id}`);
  },

  // --- Campaigns ---
  async getCampaigns(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/campaigns${query}`);
  },

  async getCampaignSummary(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/campaigns/summary${query}`);
  },

  async createCampaign(data: any) {
    return this.request('POST', '/campaigns', data);
  },

  async updateCampaign(id: number, data: any) {
    return this.request('PUT', `/campaigns/${id}`, data);
  },

  async deleteCampaign(id: number) {
    return this.request('DELETE', `/campaigns/${id}`);
  },


// --- Enterprise Auth & Sessions Management ---
  async getUserSessions() {
    return this.request('GET', '/auth/sessions');
  },

  async terminateUserSession(sessionId: number) {
    return this.request('DELETE', `/auth/sessions/${sessionId}`);
  },

  async terminateOtherSessions() {
    return this.request('POST', '/auth/sessions/terminate-others');
  },

  async changePassword(data: { current_password: string; password: string; password_confirmation: string }) {
    return this.request('POST', '/auth/change-password', data);
  },

  // --- User Account Control & Banning ---
  async getBannedUsers() {
    return this.request('GET', '/users/banned');
  },

  async banUser(userId: number, data: { action: 'ban' | 'suspend' | 'deactivate'; reason: string; duration_minutes?: number; duration_days?: number }) {
    return this.request('POST', `/users/${userId}/ban`, data);
  },

  async unbanUser(userId: number, reason?: string) {
    return this.request('POST', `/users/${userId}/unban`, { reason });
  },

  async resetUserLockout(userId: number) {
    return this.request('POST', `/users/${userId}/reset-lockout`);
  },

  async forceLogoutUser(userId: number) {
    return this.request('POST', `/users/${userId}/force-logout`);
  },

  async getUserSecurityOverview(userId: number) {
    return this.request('GET', `/users/${userId}/security-overview`);
  },

  // --- Security & IP Firewall ---
  async getSecurityDashboard() {
    return this.request('GET', '/security/dashboard');
  },

  async getIpRules(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/security/ip-rules${query ? '?' + query : ''}`);
  },

  async createIpRule(data: { ip_address: string; rule_type?: 'deny' | 'allow'; type?: 'block' | 'allow'; reason?: string; notes?: string; duration_minutes?: number; duration_hours?: number }) {
    return this.request('POST', '/security/ip-rules', data);
  },

  async deleteIpRule(id: number) {
    return this.request('DELETE', `/security/ip-rules/${id}`);
  },

  async getLoginAttempts(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/security/login-attempts${query ? '?' + query : ''}`);
  },

  async getActiveSessionsAdmin(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/security/active-sessions${query ? '?' + query : ''}`);
  },

  async terminateSessionAdmin(id: number) {
    return this.request('DELETE', `/security/sessions/${id}`);
  },

  // --- Customer 360 Workspace ---
  async getCustomer360(customerId: number) {
    return this.request('GET', `/customers/${customerId}/customer-360`);
  },

  async toggleCustomerArchive(customerId: number) {
    return this.request('POST', `/customers/${customerId}/archive`);
  },

  // --- Nixa Multi-App Ecosystem & Launcher ---
  async getAppLauncher() {
    return this.request('GET', '/apps/launcher');
  },

  // --- Super Admin Control Center ---
  async getAdminSystemOverview() {
    return this.request('GET', '/admin/system-overview');
  },
  // --- Cash Drawer Management ---
  async getCashDrawers(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/finance/cash-drawers${query ? '?' + query : ''}`);
  },

  async getCashDrawer(id: number) {
    return this.request('GET', `/finance/cash-drawers/${id}`);
  },

  async createCashDrawer(data: Record<string, unknown>) {
    return this.request('POST', '/finance/cash-drawers', data);
  },

  async updateCashDrawer(id: number, data: Record<string, unknown>) {
    return this.request('PUT', `/finance/cash-drawers/${id}`, data);
  },

  async getActiveCashDrawerSession(drawerId: number) {
    return this.request('GET', `/finance/cash-drawers/${drawerId}/active-session`);
  },

  async openCashDrawerSession(drawerId: number, data: Record<string, unknown>) {
    return this.request('POST', `/finance/cash-drawers/${drawerId}/open`, data);
  },

  async closeCashDrawerSession(drawerId: number, data: Record<string, unknown>) {
    return this.request('POST', `/finance/cash-drawers/${drawerId}/close`, data);
  },

  async recordCashIn(drawerId: number, data: Record<string, unknown>) {
    return this.request('POST', `/finance/cash-drawers/${drawerId}/cash-in`, data);
  },

  async recordCashOut(drawerId: number, data: Record<string, unknown>) {
    return this.request('POST', `/finance/cash-drawers/${drawerId}/cash-out`, data);
  },

  async getCashDrawerTransactions(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/finance/cash-drawer/transactions${query ? '?' + query : ''}`);
  },

  async getCashDrawerDashboard(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/finance/cash-drawer/dashboard${query ? '?' + query : ''}`);
  },

  async getCashDrawerTransfers(params: Record<string, unknown> = {}) {
    const query = buildQuery(params);
    return this.request('GET', `/finance/cash-drawer-transfers${query ? '?' + query : ''}`);
  },

  async initiateCashDrawerTransfer(data: Record<string, unknown>) {
    return this.request('POST', '/finance/cash-drawer-transfers', data);
  },

  async receiveCashDrawerTransfer(transferId: number, data: Record<string, unknown> = {}) {
    return this.request('POST', `/finance/cash-drawer-transfers/${transferId}/receive`, data);
  },

  async rejectCashDrawerTransfer(transferId: number, data: Record<string, unknown>) {
    return this.request('POST', `/finance/cash-drawer-transfers/${transferId}/reject`, data);
  },

};

export default apiClient;

