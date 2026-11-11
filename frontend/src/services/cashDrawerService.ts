import apiClient from '../api';
import {
  CashDrawer,
  CashDrawerSession,
  CashDrawerTransaction,
  CashDrawerTransfer,
  CashDrawerDashboardData,
  CashDrawerDenominationConfig,
  CashDrawerAuditLog,
} from '../types/cashDrawer';

export const cashDrawerService = {
  // Cash Drawers Master
  async getDrawers(params: Record<string, unknown> = {}): Promise<{ success: boolean; data: CashDrawer[] }> {
    return apiClient.request('GET', `/finance/cash-drawers${buildQueryString(params)}`);
  },

  async listDrawers(params: Record<string, unknown> = {}): Promise<{ success: boolean; data: CashDrawer[] }> {
    return this.getDrawers(params);
  },

  async getDrawer(id: number): Promise<{ success: boolean; data: CashDrawer }> {
    return apiClient.request('GET', `/finance/cash-drawers/${id}`);
  },

  async createDrawer(data: Partial<CashDrawer>): Promise<{ success: boolean; data: CashDrawer; message: string }> {
    return apiClient.request('POST', '/finance/cash-drawers', data);
  },

  async updateDrawer(id: number, data: Partial<CashDrawer>): Promise<{ success: boolean; data: CashDrawer; message: string }> {
    return apiClient.request('PUT', `/finance/cash-drawers/${id}`, data);
  },

  // Sessions
  async getActiveSession(drawerId: number): Promise<{ success: boolean; is_open: boolean; data: CashDrawerSession | null; suggested_opening_cash: number }> {
    return apiClient.request('GET', `/finance/cash-drawers/${drawerId}/active-session`);
  },

  async openSession(drawerId: number, data: {
    opening_balance: number;
    opening_difference_reason?: string;
    opening_notes?: string;
    opening_denominations?: Array<{ label: string; value: number; quantity: number; amount: number }>;
  }): Promise<{ success: boolean; data: CashDrawerSession; message: string }> {
    return apiClient.request('POST', `/finance/cash-drawers/${drawerId}/open`, data);
  },

  async closeSession(drawerId: number, data: {
    actual_closing_cash: number;
    discrepancy_reason?: string;
    closing_notes?: string;
    closing_denominations?: Array<{ label: string; value: number; quantity: number; amount: number }>;
  }): Promise<{ success: boolean; data: CashDrawerSession; message: string }> {
    return apiClient.request('POST', `/finance/cash-drawers/${drawerId}/close`, data);
  },

  async listSessions(drawerId: number, params: Record<string, unknown> = {}): Promise<{ success: boolean; data: CashDrawerSession[]; meta: any }> {
    return apiClient.request('GET', `/finance/cash-drawers/${drawerId}/sessions${buildQueryString(params)}`);
  },

  async reviewDiscrepancy(sessionId: number, data: { action: 'approve' | 'reject'; notes?: string }): Promise<{ success: boolean; data: CashDrawerSession; message: string }> {
    return apiClient.request('POST', `/finance/cash-drawer/sessions/${sessionId}/review-discrepancy`, data);
  },

  // Transactions
  async recordCashIn(drawerId: number, data: {
    amount: number;
    category: string;
    received_from?: string;
    reference_no?: string;
    description?: string;
    notes?: string;
  }): Promise<{ success: boolean; data: CashDrawerTransaction; message: string }> {
    return apiClient.request('POST', `/finance/cash-drawers/${drawerId}/cash-in`, data);
  },

  async recordCashOut(drawerId: number, data: {
    amount: number;
    category: string;
    paid_to?: string;
    reference_no?: string;
    description?: string;
    notes?: string;
  }): Promise<{ success: boolean; data: CashDrawerTransaction; message: string }> {
    return apiClient.request('POST', `/finance/cash-drawers/${drawerId}/cash-out`, data);
  },

  async getTransactions(params: Record<string, unknown> = {}): Promise<{ success: boolean; data: CashDrawerTransaction[]; meta: any }> {
    return apiClient.request('GET', `/finance/cash-drawer/transactions${buildQueryString(params)}`);
  },

  async listTransactions(params: Record<string, unknown> = {}): Promise<{ success: boolean; data: CashDrawerTransaction[]; meta: any }> {
    return this.getTransactions(params);
  },

  async getDrawerTransactions(drawerId: number, params: Record<string, unknown> = {}): Promise<{ success: boolean; data: CashDrawerTransaction[]; meta: any }> {
    return apiClient.request('GET', `/finance/cash-drawers/${drawerId}/transactions${buildQueryString(params)}`);
  },

  // Transfers
  async getTransfers(params: Record<string, unknown> = {}): Promise<{ success: boolean; data: CashDrawerTransfer[]; meta: any }> {
    return apiClient.request('GET', `/finance/cash-drawer-transfers${buildQueryString(params)}`);
  },

  async listTransfers(params: Record<string, unknown> = {}): Promise<{ success: boolean; data: CashDrawerTransfer[]; meta: any }> {
    return this.getTransfers(params);
  },

  async initiateTransfer(data: {
    source_drawer_id: number;
    destination_drawer_id: number;
    amount: number;
    notes?: string;
  }): Promise<{ success: boolean; data: CashDrawerTransfer; message: string }> {
    return apiClient.request('POST', '/finance/cash-drawer-transfers', data);
  },

  async receiveTransfer(transferId: number, data: { notes?: string } = {}): Promise<{ success: boolean; data: CashDrawerTransfer; message: string }> {
    return apiClient.request('POST', `/finance/cash-drawer-transfers/${transferId}/receive`, data);
  },

  async rejectTransfer(transferId: number, data: { reason: string }): Promise<{ success: boolean; data: CashDrawerTransfer; message: string }> {
    return apiClient.request('POST', `/finance/cash-drawer-transfers/${transferId}/reject`, data);
  },

  // Dashboard & Configuration
  async getDashboard(params: Record<string, unknown> = {}): Promise<{ success: boolean; data: CashDrawerDashboardData }> {
    return apiClient.request('GET', `/finance/cash-drawer/dashboard${buildQueryString(params)}`);
  },

  async getDashboardMetrics(params: Record<string, unknown> = {}): Promise<{ success: boolean; data: CashDrawerDashboardData }> {
    return this.getDashboard(params);
  },

  async getDenominations(currency = 'INR'): Promise<{ success: boolean; data: CashDrawerDenominationConfig[] }> {
    return apiClient.request('GET', `/finance/cash-drawer/denominations?currency=${encodeURIComponent(currency)}`);
  },

  async getAuditLogs(params: Record<string, unknown> = {}): Promise<{ success: boolean; data: CashDrawerAuditLog[]; meta: any }> {
    return apiClient.request('GET', `/finance/cash-drawer/audit-logs${buildQueryString(params)}`);
  },

  getExportCsvUrl(params: Record<string, unknown> = {}): string {
    return `/api/finance/cash-drawer/export-csv${buildQueryString(params)}`;
  },
};

function buildQueryString(params: Record<string, unknown>): string {
  const query = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '' && v !== 'all')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return query ? `?${query}` : '';
}

export default cashDrawerService;
