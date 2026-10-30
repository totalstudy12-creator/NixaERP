export type AccountType = 'bank' | 'cash';

export interface BankAccount {
  id: number;
  company_id?: number;
  branch_id?: number | null;
  account_name: string;
  account_type: AccountType;
  bank_name?: string | null;
  account_number?: string | null;
  masked_account_number?: string | null;
  ifsc_code?: string | null;
  branch_name?: string | null;
  opening_balance: string | number;
  current_balance: string | number;
  currency: string;
  is_active: boolean;
  is_default: boolean;
  gl_account_code?: string | null;
  branch?: {
    id: number;
    name: string;
  } | null;
  created_at?: string;
  updated_at?: string;
}

export type BankTransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'transfer_in'
  | 'transfer_out'
  | 'bank_charges'
  | 'interest'
  | 'adjustment';

export interface BankAccountTransaction {
  id: number;
  bank_account_id: number;
  company_id?: number;
  branch_id?: number | null;
  transaction_date: string;
  transaction_type: BankTransactionType;
  amount: string | number;
  running_balance: string | number;
  payment_id?: number | null;
  counterpart_account_id?: number | null;
  reference_no?: string | null;
  description?: string | null;
  status: 'pending' | 'cleared' | 'reconciled' | 'cancelled';
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
  bank_account?: BankAccount;
  payment?: any;
}

export type CashClosingStatus = 'balanced' | 'excess' | 'shortage' | 'approved' | 'rejected';

export interface CashClosing {
  id: number;
  company_id?: number;
  branch_id?: number | null;
  cash_account_id: number;
  closing_date: string;
  opening_cash: string | number;
  cash_received: string | number;
  cash_paid: string | number;
  expected_cash: string | number;
  physical_cash_counted: string | number;
  difference: string | number;
  denomination_breakdown?: Record<string, number> | null;
  status: CashClosingStatus;
  approved_by?: number | null;
  approved_at?: string | null;
  approval_notes?: string | null;
  remarks?: string | null;
  created_by?: number | null;
  created_at?: string;
  cash_account?: BankAccount;
  branch?: { id: number; name: string } | null;
  approver?: { id: number; name: string; email: string } | null;
  creator?: { id: number; name: string; email: string } | null;
}

export interface BankStatement {
  id: number;
  bank_account_id: number;
  company_id?: number;
  filename: string;
  original_filename: string;
  file_hash: string;
  bank_format: string;
  from_date?: string | null;
  to_date?: string | null;
  opening_balance?: string | number | null;
  closing_balance?: string | number | null;
  total_transactions: number;
  reconciled_transactions: number;
  status: 'pending' | 'in_progress' | 'reconciled';
  uploaded_by?: number | null;
  created_at?: string;
  bank_account?: BankAccount;
}

export interface BankStatementTransaction {
  id: number;
  statement_id: number;
  bank_account_id: number;
  company_id?: number;
  transaction_date: string;
  value_date?: string | null;
  description: string;
  reference_no?: string | null;
  cheque_no?: string | null;
  debit: string | number;
  credit: string | number;
  balance?: string | number | null;
  status?: string;
  reconciliation_status: 'unmatched' | 'matched' | 'split' | 'ignored' | 'expense_draft_created' | 'needs_review' | 'unmatched_income' | 'duplicate' | 'transfer_pending';
  expense_draft_id?: number | null;
  expense_draft?: any;
  learned_rule_id?: number | null;
  ignore_reason?: string | null;
  matched_payment_id?: number | null;
  matched_at?: string | null;
  matched_by?: number | null;
  created_at?: string;
  statement?: BankStatement;
  matched_payment?: any;
}

export interface ReconciliationDashboardMetrics {
  total_bank_balance: number;
  total_cash_balance: number;
  total_liquidity: number;
  book_balance: number;
  statement_balance: number;
  unmatched_credits: number;
  unmatched_debits: number;
  adjusted_book_balance: number;
  difference: number;
  total_statement_txns: number;
  reconciled_txns: number;
  pending_txns: number;
  reconciled_percentage: number;
  unreconciled_payments_count: number;
  unreconciled_payments_amount: number;
}

export interface ReconciliationSuggestion {
  statement_transaction: BankStatementTransaction;
  suggested_match: any | null;
  confidence_score: number;
  match_rule: string;
  reasoning: string;
  candidate_payments: any[];
}

export interface AiReconciliationAnalysis {
  narration?: string;
  counterparty_name?: string | null;
  channel?: string;
  reference_number?: string | null;
  extracted_utr?: string | null;
  transaction_type?: string;
  clean_description?: string;
  candidate_payment_id?: number | null;
  confidence?: number;
  ai_reasoning?: string;
  explanation?: string;
  suggested_gl_category?: string | null;
  suggested_category?: string | null;
}

export interface DailyCashMetrics {
  cash_in: number;
  cash_out: number;
  net_cash: number;
  upi_in: number;
  upi_out: number;
  bank_in: number;
  bank_out: number;
  total_in: number;
  total_out: number;
}

export interface MonthlyCashTrend {
  month: string;
  start_date: string;
  end_date: string;
  cash_in: number;
  cash_out: number;
  net_cash: number;
}

export interface CashSummaryData {
  date: string;
  financial_year: string;
  financial_year_start: string;
  financial_year_end: string;
  available_financial_years: string[];
  daily: DailyCashMetrics;
  financial_year_totals: DailyCashMetrics;
  monthly_breakdown: MonthlyCashTrend[];
}

export interface BankReconciliationRule {
  id: number;
  company_id: number;
  branch_id?: number | null;
  rule_name: string;
  pattern_type: 'contains' | 'regex' | 'upi_vpa' | 'exact' | 'starts_with';
  pattern_value: string;
  action: 'create_expense_draft' | 'categorize_expense' | 'match_vendor' | 'match_transfer' | 'ignore';
  category?: string | null;
  vendor_name?: string | null;
  confidence_score: number;
  times_used: number;
  last_matched_at?: string | null;
  is_active: boolean;
  source: 'learned' | 'manual';
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface StatementReconciliationSummary {
  total_rows: number;
  matched_rows: number;
  partially_matched_rows: number;
  expense_drafts_count: number;
  needs_review_count: number;
  unmatched_income_count: number;
  duplicates_count: number;
  transfer_pending_count: number;
  ignored_count: number;
  unmatched_rows: number;
  total_debits: number;
  total_credits: number;
  matched_amount: number;
  reconciled_percentage: number;
}

