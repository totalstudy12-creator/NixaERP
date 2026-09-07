import { config } from './config.js';
export class NixaerpClient {
    baseUrl;
    token;
    timeoutMs = 15_000;
    constructor() {
        this.baseUrl = config.nixaerpApiBaseUrl.replace(/\/+$/, '');
        this.token = config.nixaerpMcpToken;
        if (!this.baseUrl) {
            throw new Error('NIXAERP_API_BASE_URL is not configured.');
        }
        if (!this.token) {
            throw new Error('NIXAERP_MCP_TOKEN is not configured.');
        }
    }
    async get(path, query) {
        const url = new URL(`${this.baseUrl}${path}`);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined &&
                    value !== '') {
                    url.searchParams.set(key, String(value));
                }
            }
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, this.timeoutMs);
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${this.token}`,
                },
                signal: controller.signal,
            });
            const responseText = await response.text();
            const data = this.parseResponse(responseText);
            if (!response.ok) {
                throw new Error(this.buildErrorMessage(response.status, data));
            }
            if (data === null ||
                typeof data !== 'object' ||
                Array.isArray(data)) {
                throw new Error(`NixaERP returned an invalid response for ${path}.`);
            }
            return data;
        }
        catch (error) {
            if (error instanceof Error &&
                error.name === 'AbortError') {
                throw new Error(`NixaERP request timed out after ${this.timeoutMs}ms.`);
            }
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Unknown NixaERP API error.');
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    parseResponse(text) {
        const trimmed = text.trim();
        if (!trimmed) {
            return null;
        }
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return {
                message: trimmed.slice(0, 1000),
            };
        }
    }
    buildErrorMessage(status, payload) {
        const message = this.extractErrorMessage(payload);
        return `NixaERP API error (${status}): ${message}`;
    }
    extractErrorMessage(payload) {
        if (payload &&
            typeof payload === 'object' &&
            !Array.isArray(payload)) {
            const data = payload;
            const directMessages = [
                data.message,
                data.error,
                data.backendMessage,
            ];
            for (const value of directMessages) {
                if (typeof value === 'string' &&
                    value.trim()) {
                    return value.trim();
                }
            }
            if (data.errors &&
                typeof data.errors === 'object' &&
                !Array.isArray(data.errors)) {
                const errors = data.errors;
                for (const value of Object.values(errors)) {
                    if (typeof value === 'string' &&
                        value.trim()) {
                        return value.trim();
                    }
                    if (Array.isArray(value)) {
                        const firstMessage = value.find((item) => typeof item === 'string' &&
                            item.trim().length > 0);
                        if (firstMessage) {
                            return firstMessage.trim();
                        }
                    }
                }
            }
        }
        if (typeof payload === 'string' &&
            payload.trim()) {
            return payload.trim();
        }
        return 'Unknown backend error.';
    }
    validateId(value, fieldName) {
        if (!Number.isInteger(value) ||
            value <= 0) {
            throw new Error(`${fieldName} must be a positive integer.`);
        }
    }
    /*
     * --------------------------------------------------------------------------
     * AUTHENTICATED USER CONTEXT
     * --------------------------------------------------------------------------
     */
    async getContext() {
        return this.get('/mcp/context');
    }
    /*
     * --------------------------------------------------------------------------
     * DASHBOARD
     * --------------------------------------------------------------------------
     */
    async getDashboard() {
        return this.get('/dashboard/analytics');
    }
    async getLowStock() {
        return this.get('/dashboard/low-stock');
    }
    async getTopCustomers() {
        return this.get('/dashboard/top-customers');
    }
    /*
     * --------------------------------------------------------------------------
     * REPORTS
     * --------------------------------------------------------------------------
     */
    async getTopSellingProducts() {
        return this.get('/reports/top-selling-products');
    }
    async getLeastSellingProducts() {
        return this.get('/reports/least-selling-products');
    }
    async getSalesSummary() {
        return this.get('/reports/sales-summary');
    }
    async getPurchaseSummary() {
        return this.get('/reports/purchase-summary');
    }
    async getOutstandingSales() {
        return this.get('/reports/outstanding-sales');
    }
    async getOutstandingPurchases() {
        return this.get('/reports/outstanding-purchases');
    }
    /*
     * --------------------------------------------------------------------------
     * CUSTOMER
     * --------------------------------------------------------------------------
     */
    async getCustomer(customerId) {
        this.validateId(customerId, 'customerId');
        return this.get(`/customers/${customerId}`);
    }
    /*
     * --------------------------------------------------------------------------
     * PRODUCT
     * --------------------------------------------------------------------------
     */
    async getProduct(productId) {
        this.validateId(productId, 'productId');
        return this.get(`/products/${productId}`);
    }
    /*
     * --------------------------------------------------------------------------
     * INVOICE
     * --------------------------------------------------------------------------
     */
    async getInvoice(invoiceId) {
        this.validateId(invoiceId, 'invoiceId');
        return this.get(`/invoices/${invoiceId}`);
    }
}
