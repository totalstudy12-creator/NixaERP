export interface CashDrawerDenominationItem {
  label: string;
  value: number;
  quantity: number;
  amount: number;
}

export interface CashDrawerSession {
  id: number;
  company_id: number;
  branch_id: number;
  cash_drawer_id: number;
  user_id: number;
  session_number: string;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  opening_balance: string | number;
  suggested_opening_balance: string | number;
  opening_difference: string | number;
  opening_difference_reason: string | null;
  opening_notes: string | null;
  opening_denominations: CashDrawerDenominationItem[] | null;
  total_cash_in: string | number;
  total_cash_out: string | number;
  expected_closing_cash: string | number;
  actual_closing_cash: string | number | null;
  closing_difference: string | number | null;
  closing_notes: string | null;
  discrepancy_reason: string | null;
  closing_denominations: CashDrawerDenominationItem[] | null;
  closed_by: number | null;
  discrepancy_status: 'none' | 'pending_approval' | 'approved' | 'rejected';
  approved_by: number | null;
  approved_at: string | null;
  approval_notes: string | null;
  hasDiscrepancy?: boolean;
  cash_drawer?: {
    id: number;
    name: string;
    code: string;
  };
  cashier_name?: string;
  cashier?: {
    id: number;
    name: string;
    email: string;
  };
  closer?: {
    id: number;
    name: string;
  };
  approver?: {
    id: number;
    name: string;
  };
  transactions?: CashDrawerTransaction[];
}

export interface CashDrawer {
  id: number;
  company_id: number;
  branch_id: number;
  name: string;
  code: string;
  status: 'active' | 'inactive' | 'maintenance';
  is_default: boolean;
  starting_balance: string | number;
  current_balance: string | number;
  allow_overdraft: boolean;
  overdraft_limit: string | number;
  account_id: number | null;
  notes: string | null;
  is_open?: boolean;
  suggested_opening_cash?: number;
  branch_name?: string;
  branch?: {
    id: number;
    name: string;
    code: string;
  };
  active_session?: CashDrawerSession | null;
}

export interface CashDrawerTransaction {
  id: number;
  company_id: number;
  branch_id: number;
  cash_drawer_id: number;
  cash_drawer_session_id: number;
  transaction_number: string;
  transaction_type: 'cash_in' | 'cash_out' | 'opening_float' | 'transfer_in' | 'transfer_out' | 'adjustment' | 'reversal';
  category: string;
  amount: string | number;
  balance_before: string | number;
  balance_after: string | number;
  transaction_date: string;
  reference_no: string | null;
  received_from_or_paid_to: string | null;
  description: string | null;
  source_type: string | null;
  source_id: number | null;
  idempotency_key: string | null;
  is_reversal: boolean;
  creator?: {
    id: number;
    name: string;
  };
  cash_drawer?: {
    id: number;
    name: string;
    code: string;
  };
  branch?: {
    id: number;
    name: string;
  };
  session?: {
    id: number;
    session_number: string;
  };
}

export interface CashDrawerTransfer {
  id: number;
  company_id: number;
  transfer_number: string;
  source_drawer_id: number;
  source_branch_id: number;
  source_session_id: number | null;
  destination_drawer_id: number;
  destination_branch_id: number;
  destination_session_id: number | null;
  amount: string | number;
  status: 'initiated' | 'in_transit' | 'received' | 'completed' | 'rejected' | 'cancelled';
  initiated_by: number;
  initiated_at: string;
  created_at?: string;
  received_by: number | null;
  received_at: string | null;
  rejected_by: number | null;
  rejected_at: string | null;
  notes: string | null;
  rejection_reason: string | null;
  source_drawer?: {
    id: number;
    name: string;
  };
  source_branch?: {
    id: number;
    name: string;
  };
  destination_drawer?: {
    id: number;
    name: string;
  };
  destination_branch?: {
    id: number;
    name: string;
  };
  initiator?: {
    id: number;
    name: string;
  };
  sender?: {
    id: number;
    name: string;
  };
  receiver?: {
    id: number;
    name: string;
  };
  rejector?: {
    id: number;
    name: string;
  };
}

export interface CashDrawerDenominationConfig {
  label: string;
  value: number;
  sort_order: number;
  currency: string;
  is_active: boolean;
}

export interface CashDrawerDashboardData {
  total_drawers: number;
  active_drawers: number;
  open_drawers: number;
  total_current_cash: number;
  opening_cash_balance: number;
  total_cash_in: number;
  total_cash_out: number;
  cash_sales_received: number;
  customer_cash_payments: number;
  cash_expenses: number;
  supplier_cash_payments: number;
  transfers_out: number;
  expected_closing_cash: number;
  actual_closing_cash: number;
  cash_difference: number;
  drawers: CashDrawer[];
  branch_breakdown?: Array<{
    branch_id: number;
    branch_name: string;
    total_drawers: number;
    open_drawers: number;
    total_balance: number;
  }>;
}

export interface CashDrawerAuditLog {
  id: number;
  company_id: number;
  cash_drawer_id?: number | null;
  cash_drawer_session_id?: number | null;
  user_id?: number | null;
  action: string;
  notes?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
  cash_drawer?: {
    id: number;
    name: string;
  };
  user?: {
    id: number;
    name: string;
  };
}
