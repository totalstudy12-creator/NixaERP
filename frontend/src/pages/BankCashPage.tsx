// frontend/src/pages/BankCashPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Landmark,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Wallet,
  ArrowRightLeft,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Plus,
  Filter,
  Download,
  SlidersHorizontal,
  ArrowDown,
  ArrowUp,
  Sparkles,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Check,
  X,
  ShieldAlert,
  Cpu,
  HelpCircle,
  FileText,
  Clock,
  Layers,
  ChevronRight,
  Calculator,
  Calendar,
  CreditCard,
  Copy,
  BookOpen,
  Zap,
  RotateCw,
  Edit3,
  Ban,
  Tag,
  Brain,
  Play,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  CheckSquare,
} from 'lucide-react';
import apiClient from '../api';
import { useAuthStore } from '../store/auth';
import { useNotification } from '../components/NotificationContext';
import {
  BankAccount,
  BankAccountTransaction,
  CashClosing,
  BankStatement,
  ReconciliationDashboardMetrics,
  ReconciliationSuggestion,
  AiReconciliationAnalysis,
  CashSummaryData,
  BankReconciliationRule,
  StatementReconciliationSummary,
} from '../types/banking';

type ActiveTab = 'dashboard' | 'accounts' | 'ledger' | 'cash_closing' | 'statements' | 'reconciliation' | 'rules';

const INDIAN_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

export const BankCashPage: React.FC = () => {
  const { hasPermission } = useAuthStore();
  const { showSuccess, showError } = useNotification();

  // Tab State
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [loading, setLoading] = useState(false);

  // Financial Year (FY) State
  const [selectedFy, setSelectedFy] = useState<string>('FY 2026-27');
  const [availableFys, setAvailableFys] = useState<string[]>([
    'FY 2026-27',
    'FY 2025-26',
    'FY 2024-25',
    'FY 2023-24',
  ]);
  const [cashSummary, setCashSummary] = useState<CashSummaryData | null>(null);

  // Core Data States
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<ReconciliationDashboardMetrics | null>(null);

  // Detailed Ledger State
  const [transactions, setTransactions] = useState<BankAccountTransaction[]>([]);
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState<number | 'all'>('all');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('all');
  const [ledgerDirectionFilter, setLedgerDirectionFilter] = useState<string>('all'); // all | inflow | outflow
  const [ledgerMethodFilter, setLedgerMethodFilter] = useState<string>('all'); // all | upi | bank_transfer | cash | cheque | bank_charges
  const [ledgerSearch, setLedgerSearch] = useState<string>('');
  const [ledgerDateFrom, setLedgerDateFrom] = useState<string>('');
  const [ledgerDateTo, setLedgerDateTo] = useState<string>('');
  const [ledgerMinAmount, setLedgerMinAmount] = useState<string>('');
  const [ledgerMaxAmount, setLedgerMaxAmount] = useState<string>('');
  const [ledgerSortBy, setLedgerSortBy] = useState<'date' | 'amount' | 'ref' | 'balance'>('date');
  const [ledgerSortDir, setLedgerSortDir] = useState<'asc' | 'desc'>('desc');
  const [showDetailedLedgerFilters, setShowDetailedLedgerFilters] = useState<boolean>(false);

  // Detailed Cash Closing State
  const [cashClosings, setCashClosings] = useState<CashClosing[]>([]);
  const [closingStatusFilter, setClosingStatusFilter] = useState<string>('all');
  const [closingDrawerFilter, setClosingDrawerFilter] = useState<number | 'all'>('all');
  const [closingVarianceFilter, setClosingVarianceFilter] = useState<string>('all');
  const [closingDateFrom, setClosingDateFrom] = useState<string>('');
  const [closingDateTo, setClosingDateTo] = useState<string>('');
  const [selectedCashAccountId, setSelectedCashAccountId] = useState<number | null>(null);
  const [denominations, setDenominations] = useState<Record<number, number>>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0,
  });
  const [closingDate, setClosingDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [closingRemarks, setClosingRemarks] = useState('');

  // Detailed Statements State
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [statementFilterAccount, setStatementFilterAccount] = useState<number | 'all'>('all');
  const [statementSearch, setStatementSearch] = useState<string>('');
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [uploadBankFormat, setUploadBankFormat] = useState<string>('generic');
  const [uploadAccountId, setUploadAccountId] = useState<number | null>(null);
  const [uploadingStatement, setUploadingStatement] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'text'>('file');
  const [statementPassword, setStatementPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [statementRawText, setStatementRawText] = useState<string>('');
  const [isEncryptedDetected, setIsEncryptedDetected] = useState<boolean>(false);

  // Detailed Reconciliation Workspace State
  const [reconAccountId, setReconAccountId] = useState<number | null>(null);
  const [reconStatementId, setReconStatementId] = useState<number | null>(null);
  const [reconSuggestions, setReconSuggestions] = useState<ReconciliationSuggestion[]>([]);
  const [reconDirectionFilter, setReconDirectionFilter] = useState<'all' | 'inward' | 'outward'>('all');
  const [reconConfidenceFilter, setReconConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [reconMethodFilter, setReconMethodFilter] = useState<string>('all');
  const [reconSearch, setReconSearch] = useState<string>('');
  const [reconDateFrom, setReconDateFrom] = useState<string>('');
  const [reconDateTo, setReconDateTo] = useState<string>('');
  const [reconMinAmount, setReconMinAmount] = useState<string>('');
  const [reconMaxAmount, setReconMaxAmount] = useState<string>('');
  const [showDetailedReconFilters, setShowDetailedReconFilters] = useState<boolean>(false);
  const [recentReconciled, setRecentReconciled] = useState<any[]>([]);
  const [activeAiAnalysis, setActiveAiAnalysis] = useState<Record<number, AiReconciliationAnalysis>>({});
  const [analyzingAiRowId, setAnalyzingAiRowId] = useState<number | null>(null);
  const [autoMatchThreshold, setAutoMatchThreshold] = useState<number>(90);
  const [processingActionId, setProcessingActionId] = useState<number | null>(null);

  // Full Statement Processing & Summary State
  const [statementSummary, setStatementSummary] = useState<StatementReconciliationSummary | null>(null);
  const [reconStatusFilter, setReconStatusFilter] = useState<string>('all');
  const [isProcessingFullRecon, setIsProcessingFullRecon] = useState<boolean>(false);
  const [rulesList, setRulesList] = useState<BankReconciliationRule[]>([]);
  const [loadingRules, setLoadingRules] = useState<boolean>(false);
  const [ruleSearch, setRuleSearch] = useState<string>('');
  const [showRuleModal, setShowRuleModal] = useState<boolean>(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleFormData, setRuleFormData] = useState({
    rule_name: '',
    pattern_type: 'contains',
    pattern_value: '',
    action: 'create_expense_draft',
    category: 'Bank Charges',
    vendor_name: '',
    confidence_score: 95,
    notes: '',
  });

  // Expense Draft Actions Modal State
  const [showEditDraftModal, setShowEditDraftModal] = useState<boolean>(false);
  const [editingDraftData, setEditingDraftData] = useState<{
    statementTxnId: number;
    description: string;
    category: string;
    counterparty: string;
    amount: number;
    notes: string;
  } | null>(null);

  // Ignore Row Modal State
  const [showIgnoreModal, setShowIgnoreModal] = useState<boolean>(false);
  const [ignoringTxn, setIgnoringTxn] = useState<{
    id: number;
    description: string;
    amount: number;
    reason: string;
  } | null>(null);
  const [rememberRuleOnApprove, setRememberRuleOnApprove] = useState<boolean>(true);

  // Quick Record Payment & Match Modal
  const [showQuickRecordModal, setShowQuickRecordModal] = useState(false);
  const [quickRecordData, setQuickRecordData] = useState({
    statement_transaction_id: 0,
    statement_description: '',
    amount: 0,
    payment_direction: 'inward' as 'inward' | 'outward',
    payment_method: 'upi',
    transaction_date: new Date().toISOString().slice(0, 10),
    reference_no: '',
    customer_name: '',
    remarks: '',
  });

  // Other Modals
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [accountFormData, setAccountFormData] = useState({
    account_name: '',
    account_type: 'bank' as 'bank' | 'cash',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    branch_name: '',
    opening_balance: 0,
    is_default: false,
  });

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFormData, setTransferFormData] = useState({
    source_account_id: 0,
    destination_account_id: 0,
    amount: '',
    transaction_date: new Date().toISOString().slice(0, 10),
    reference_no: '',
    description: '',
  });

  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentFormData, setAdjustmentFormData] = useState({
    bank_account_id: 0,
    transaction_type: 'bank_charges',
    amount: '',
    transaction_date: new Date().toISOString().slice(0, 10),
    reference_no: '',
    description: '',
  });

  // Permissions
  const canViewAccounts = hasPermission('banking.accounts.view');
  const canManageAccounts = hasPermission('banking.accounts.manage');
  const canViewTransactions = hasPermission('banking.transactions.view');
  const canManageTransactions = hasPermission('banking.transactions.manage');
  const canViewCashClosing = hasPermission('banking.cash_closing.view');
  const canManageCashClosing = hasPermission('banking.cash_closing.manage');
  const canApproveCashClosing = hasPermission('banking.cash_closing.approve');
  const canUploadStatements = hasPermission('banking.statements.upload');
  const canViewReconciliation = hasPermission('banking.reconciliation.view');
  const canManageReconciliation = hasPermission('banking.reconciliation.manage');
  const canViewRules = hasPermission('banking.rules.view');
  const canManageRules = hasPermission('banking.rules.manage');

  /* --------------------------------------------------------------------------
   * 1. Data Fetching
   * -------------------------------------------------------------------------- */

  const loadAccounts = useCallback(async () => {
    try {
      const res: any = await apiClient.getBankAccounts();
      const list: BankAccount[] = res?.data || [];
      setAccounts(list);
      if (list.length > 0 && !selectedAccountId) {
        setSelectedAccountId(list[0].id);
      }
      if (list.length > 0 && !reconAccountId) {
        setReconAccountId(list[0].id);
      }
      const cashAccts = list.filter((a) => a.account_type === 'cash');
      if (cashAccts.length > 0 && !selectedCashAccountId) {
        setSelectedCashAccountId(cashAccts[0].id);
      }
      return list;
    } catch (err: any) {
      showError('Failed to load accounts', err.message || 'Network error');
      return [];
    }
  }, [selectedAccountId, reconAccountId, selectedCashAccountId, showError]);

  const loadCashSummary = useCallback(async (fy?: string) => {
    try {
      const res: any = await apiClient.getCashSummary({
        financial_year: fy || selectedFy,
        date: closingDate,
      });
      if (res?.data) {
        setCashSummary(res.data);
        if (res.data.available_financial_years?.length > 0) {
          setAvailableFys(res.data.available_financial_years);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load cash summary', err);
    }
  }, [selectedFy, closingDate]);

  const loadDashboardMetrics = useCallback(async (fy?: string) => {
    try {
      const res: any = await apiClient.getReconciliationDashboard({
        financial_year: fy || selectedFy,
      });
      if (res?.data) {
        setMetrics(res.data);
      }
    } catch (err: any) {
      console.warn('Dashboard metrics fetch error:', err);
    }
  }, [selectedFy]);

  const loadLedger = useCallback(async () => {
    if (!canViewTransactions) return;
    try {
      setLoading(true);
      const targetAccountId = ledgerAccountFilter;
      const params: Record<string, unknown> = {
        financial_year: selectedFy,
        per_page: 250,
      };
      if (ledgerDateFrom) params.start_date = ledgerDateFrom;
      if (ledgerDateTo) params.end_date = ledgerDateTo;
      if (ledgerTypeFilter !== 'all') params.transaction_type = ledgerTypeFilter;
      if (ledgerDirectionFilter !== 'all') params.direction = ledgerDirectionFilter;
      if (ledgerMinAmount) params.min_amount = ledgerMinAmount;
      if (ledgerMaxAmount) params.max_amount = ledgerMaxAmount;
      if (ledgerMethodFilter !== 'all') params.payment_method = ledgerMethodFilter;
      if (ledgerSearch.trim()) params.search = ledgerSearch.trim();

      const res: any = await apiClient.getBankAccountTransactions(targetAccountId, params);
      setTransactions(res?.data?.data || res?.data || []);
    } catch (err: any) {
      showError('Failed to load ledger', err.message || 'Server error');
    } finally {
      setLoading(false);
    }
  }, [canViewTransactions, ledgerAccountFilter, selectedFy, ledgerDateFrom, ledgerDateTo, ledgerTypeFilter, ledgerDirectionFilter, ledgerMinAmount, ledgerMaxAmount, ledgerMethodFilter, ledgerSearch, showError]);

  const loadCashClosings = useCallback(async () => {
    if (!canViewCashClosing) return;
    try {
      const res: any = await apiClient.getCashClosings();
      setCashClosings(res?.data?.data || res?.data || []);
    } catch (err: any) {
      showError('Failed to load cash closings', err.message);
    }
  }, [canViewCashClosing, showError]);

  const loadStatements = useCallback(async () => {
    try {
      const res: any = await apiClient.getBankStatements();
      setStatements(res?.data?.data || res?.data || []);
    } catch (err: any) {
      console.warn('Statements load error:', err);
    }
  }, []);

  const loadReconciliationWorkspace = useCallback(async (accountId: number, statementId?: number | null) => {
    if (!canViewReconciliation || !accountId) return;
    try {
      setLoading(true);
      const res: any = await apiClient.getReconciliationWorkspace(accountId, statementId || undefined);
      if (res?.success) {
        setReconSuggestions(res.suggestions || []);
        setRecentReconciled(res.recent_reconciled || []);
        if (res.statement_summary) {
          setStatementSummary(res.statement_summary);
        } else if (statementId) {
          apiClient.getStatementSummary(statementId).then((sumRes: any) => {
            if (sumRes?.summary) setStatementSummary(sumRes.summary);
          }).catch(() => {});
        }
        if (res.learned_rules) {
          setRulesList(res.learned_rules);
        }
      }
    } catch (err: any) {
      showError('Failed to load workspace', err.message);
    } finally {
      setLoading(false);
    }
  }, [canViewReconciliation, showError]);

  const loadRules = useCallback(async () => {
    try {
      setLoadingRules(true);
      const res: any = await apiClient.getReconciliationRules();
      setRulesList(res?.rules?.data || res?.rules || res?.data || []);
    } catch (err: any) {
      console.warn('Failed to load rules:', err);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const accts = await loadAccounts();
      await loadDashboardMetrics();
      await loadCashSummary();
      if (accts.length > 0) {
        loadStatements();
      }
      setLoading(false);
    };
    init();
  }, [loadAccounts, loadDashboardMetrics, loadCashSummary, loadStatements]);

  // Tab switch reaction
  useEffect(() => {
    if (activeTab === 'ledger' && accounts.length > 0) {
      loadLedger();
    } else if (activeTab === 'cash_closing') {
      loadCashClosings();
      loadCashSummary();
    } else if (activeTab === 'statements') {
      loadStatements();
    } else if (activeTab === 'reconciliation' && reconAccountId) {
      loadReconciliationWorkspace(reconAccountId, reconStatementId);
    } else if (activeTab === 'rules') {
      loadRules();
    } else if (activeTab === 'dashboard') {
      loadDashboardMetrics();
      loadCashSummary();
    }
  }, [activeTab, reconAccountId, reconStatementId, accounts.length, loadLedger, loadCashClosings, loadCashSummary, loadStatements, loadReconciliationWorkspace, loadDashboardMetrics, loadRules]);

  // When FY changes
  const handleFyChange = (newFy: string) => {
    setSelectedFy(newFy);
    loadDashboardMetrics(newFy);
    loadCashSummary(newFy);
  };

  /* --------------------------------------------------------------------------
   * 2. Calculation Helpers
   * -------------------------------------------------------------------------- */

  const physicalCashTotal = useMemo(() => {
    return Object.entries(denominations).reduce((acc, [denom, count]) => {
      return acc + Number(denom) * (Number(count) || 0);
    }, 0);
  }, [denominations]);

  const currencyFmt = (val: number | string | null | undefined) => {
    const num = Number(val) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  /* --------------------------------------------------------------------------
   * 3. Actions & Submissions
   * -------------------------------------------------------------------------- */

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAccount) {
        await apiClient.updateBankAccount(editingAccount.id, accountFormData);
        showSuccess('Account updated', `${accountFormData.account_name} has been updated.`);
      } else {
        await apiClient.createBankAccount(accountFormData);
        showSuccess('Account created', `${accountFormData.account_name} has been added.`);
      }
      setShowAccountModal(false);
      setEditingAccount(null);
      loadAccounts();
    } catch (err: any) {
      showError('Save failed', err.message || 'Could not save account details');
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFormData.source_account_id || !transferFormData.destination_account_id) {
      showError('Validation error', 'Please select both source and destination accounts.');
      return;
    }
    if (transferFormData.source_account_id === transferFormData.destination_account_id) {
      showError('Validation error', 'Source and destination accounts must be different.');
      return;
    }
    const amt = parseFloat(transferFormData.amount);
    if (isNaN(amt) || amt <= 0) {
      showError('Validation error', 'Please enter a valid transfer amount.');
      return;
    }

    try {
      setLoading(true);
      await apiClient.createBankTransfer({
        source_account_id: transferFormData.source_account_id,
        destination_account_id: transferFormData.destination_account_id,
        amount: amt,
        transaction_date: transferFormData.transaction_date,
        reference_no: transferFormData.reference_no,
        description: transferFormData.description,
      });
      showSuccess('Transfer complete', `Transferred ${currencyFmt(amt)} successfully.`);
      setShowTransferModal(false);
      setTransferFormData({
        source_account_id: 0,
        destination_account_id: 0,
        amount: '',
        transaction_date: new Date().toISOString().slice(0, 10),
        reference_no: '',
        description: '',
      });
      loadAccounts();
      loadLedger();
    } catch (err: any) {
      showError('Transfer failed', err.message || 'Transfer could not be processed');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(adjustmentFormData.amount);
    if (!adjustmentFormData.bank_account_id || isNaN(amt) || amt <= 0) {
      showError('Validation error', 'Please fill account and valid amount.');
      return;
    }
    try {
      setLoading(true);
      await apiClient.createBankAdjustment({
        bank_account_id: adjustmentFormData.bank_account_id,
        transaction_type: adjustmentFormData.transaction_type,
        amount: amt,
        transaction_date: adjustmentFormData.transaction_date,
        reference_no: adjustmentFormData.reference_no,
        description: adjustmentFormData.description,
      });
      showSuccess('Adjustment recorded', 'Account balance updated.');
      setShowAdjustmentModal(false);
      loadAccounts();
      loadLedger();
    } catch (err: any) {
      showError('Adjustment failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCashClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCashAccountId) {
      showError('Selection error', 'Please select a cash till/account.');
      return;
    }
    try {
      setLoading(true);
      await apiClient.createCashClosing({
        cash_account_id: selectedCashAccountId,
        closing_date: closingDate,
        physical_cash_counted: physicalCashTotal,
        denomination_breakdown: denominations,
        remarks: closingRemarks,
      });
      showSuccess('Closing recorded', 'Cash closing submitted successfully.');
      setDenominations({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      setClosingRemarks('');
      loadCashClosings();
      loadCashSummary();
      loadAccounts();
    } catch (err: any) {
      showError('Closing failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveClosing = async (id: number) => {
    try {
      await apiClient.approveCashClosing(id, 'Approved by manager');
      showSuccess('Approved', 'Cash closing difference approved.');
      loadCashClosings();
    } catch (err: any) {
      showError('Approval failed', err.message);
    }
  };

  const handleUploadStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadAccountId) {
      showError('Missing account', 'Please select a bank account for this statement.');
      return;
    }
    if (uploadMode === 'file' && !statementFile) {
      showError('Missing file', 'Please select a CSV, XLSX, or PDF statement file.');
      return;
    }
    if (uploadMode === 'text' && !statementRawText.trim()) {
      showError('Missing text', 'Please paste bank statement rows or text to import.');
      return;
    }

    const formData = new FormData();
    formData.append('bank_account_id', String(uploadAccountId));
    formData.append('bank_format', uploadBankFormat);
    if (uploadMode === 'file' && statementFile) {
      formData.append('statement_file', statementFile);
      if (statementPassword.trim()) {
        formData.append('password', statementPassword.trim());
      }
    } else if (uploadMode === 'text') {
      formData.append('raw_text', statementRawText.trim());
    }

    try {
      setUploadingStatement(true);
      const res: any = await apiClient.uploadBankStatement(formData);
      if (res?.success) {
        showSuccess('Statement uploaded', `Successfully imported ${res.statement?.total_transactions || 0} transactions.`);
        setStatementFile(null);
        setStatementPassword('');
        setStatementRawText('');
        setIsEncryptedDetected(false);
        loadStatements();
        setActiveTab('reconciliation');
        setReconAccountId(uploadAccountId);
        setReconStatementId(res.statement?.id || null);
      }
    } catch (err: any) {
      const errData = err?.response?.data || err;
      if (errData?.is_encrypted) {
        setIsEncryptedDetected(true);
        showError('Password Protected PDF', 'This bank statement is encrypted with a password. Please enter the password below and click Decrypt & Import.');
      } else {
        showError('Upload failed', errData?.message || err.message || 'Failed to parse statement. Please check file format or password.');
      }
    } finally {
      setUploadingStatement(false);
    }
  };

  const handleConfirmMatch = async (stmtTxnId: number, paymentId: number) => {
    try {
      setProcessingActionId(stmtTxnId);
      await apiClient.confirmReconciliationMatch({
        statement_transaction_id: stmtTxnId,
        payment_id: paymentId,
        match_type: 'manual',
      });
      showSuccess('Matched', 'Transaction reconciled successfully.');
      if (reconAccountId) {
        loadReconciliationWorkspace(reconAccountId, reconStatementId);
        loadDashboardMetrics();
      }
    } catch (err: any) {
      showError('Match failed', err.message);
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleUnmatch = async (stmtTxnId: number) => {
    try {
      setProcessingActionId(stmtTxnId);
      await apiClient.unmatchReconciliation(stmtTxnId);
      showSuccess('Unmatched', 'Reconciliation reversed safely.');
      if (reconAccountId) {
        loadReconciliationWorkspace(reconAccountId, reconStatementId);
        loadDashboardMetrics();
      }
    } catch (err: any) {
      showError('Unmatch failed', err.message);
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleAutoMatch = async () => {
    if (!reconAccountId) return;
    try {
      setLoading(true);
      const res: any = await apiClient.autoMatchReconciliation(reconAccountId, autoMatchThreshold);
      const count = res?.data?.reconciled_count ?? 0;
      showSuccess('Auto-reconciliation complete', `${count} transaction(s) reconciled.`);
      loadReconciliationWorkspace(reconAccountId, reconStatementId);
      loadDashboardMetrics();
    } catch (err: any) {
      showError('Auto-match failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAiAnalyze = async (stmtTxnId: number) => {
    try {
      setAnalyzingAiRowId(stmtTxnId);
      const res: any = await apiClient.getAiReconciliationSuggestion(stmtTxnId);
      if (res?.data) {
        setActiveAiAnalysis((prev) => ({
          ...prev,
          [stmtTxnId]: res.data,
        }));
      }
    } catch (err: any) {
      showError('AI analysis failed', err.message);
    } finally {
      setAnalyzingAiRowId(null);
    }
  };

  const handleCreateAdjustmentFromStatement = async (stmtTxnId: number, amount: number, desc: string) => {
    try {
      setProcessingActionId(stmtTxnId);
      await apiClient.createReconciliationAdjustment({
        statement_transaction_id: stmtTxnId,
        transaction_type: 'bank_charges',
        amount: Math.abs(amount),
        description: desc || 'Bank charges and fees',
      });
      showSuccess('Adjusted', 'Bank charges booked and reconciled.');
      if (reconAccountId) {
        loadReconciliationWorkspace(reconAccountId, reconStatementId);
        loadDashboardMetrics();
      }
    } catch (err: any) {
      showError('Adjustment failed', err.message);
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleQuickRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await apiClient.quickRecordPaymentAndMatch({
        statement_transaction_id: quickRecordData.statement_transaction_id,
        payment_direction: quickRecordData.payment_direction,
        payment_method: quickRecordData.payment_method,
        transaction_date: quickRecordData.transaction_date,
        reference_no: quickRecordData.reference_no,
        customer_name: quickRecordData.customer_name,
        remarks: quickRecordData.remarks,
      });
      showSuccess(
        'Payment Recorded & Reconciled',
        `${quickRecordData.payment_direction === 'inward' ? 'Received' : 'Sent'} ₹${quickRecordData.amount} via ${String(quickRecordData.payment_method || 'transfer').toUpperCase()}`
      );
      setShowQuickRecordModal(false);
      if (reconAccountId) {
        loadReconciliationWorkspace(reconAccountId, reconStatementId);
        loadDashboardMetrics();
        loadCashSummary();
      }
    } catch (err: any) {
      showError('Quick record failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  /* --------------------------------------------------------------------------
   * Full Statement Processing, Drafts & Rule Handlers
   * -------------------------------------------------------------------------- */

  const handleProcessFullReconciliation = async (autoApprove = false) => {
    if (!reconStatementId) {
      showError('Select Statement', 'Please select a specific statement batch to reconcile all rows.');
      return;
    }
    try {
      setIsProcessingFullRecon(true);
      const res: any = await apiClient.processFullStatementReconciliation(reconStatementId, autoApprove);
      if (res?.success) {
        const sum = res.summary;
        setStatementSummary(sum);
        showSuccess(
          'Reconciliation Complete',
          `Processed all ${sum.total_rows} rows: ${sum.matched_rows} matched, ${sum.expense_drafts_count} drafts created, ${sum.needs_review_count} need review, ${sum.duplicates_count} duplicates.`
        );
        if (reconAccountId) {
          await loadReconciliationWorkspace(reconAccountId, reconStatementId);
        }
        await loadDashboardMetrics();
      }
    } catch (err: any) {
      showError('Full reconciliation failed', err.message || 'Server error');
    } finally {
      setIsProcessingFullRecon(false);
    }
  };

  const handleApproveExpenseDraft = async (stmtTxnId: number, saveRule = true) => {
    try {
      setProcessingActionId(stmtTxnId);
      const res: any = await apiClient.approveExpenseDraft(stmtTxnId, saveRule);
      showSuccess('Expense Draft Approved', 'Expense posted to financial entries and ledger transaction reconciled.');
      if (reconAccountId) {
        loadReconciliationWorkspace(reconAccountId, reconStatementId);
        loadDashboardMetrics();
      }
    } catch (err: any) {
      showError('Approval failed', err.message || 'Failed to approve expense draft');
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleRejectExpenseDraft = async (stmtTxnId: number) => {
    try {
      setProcessingActionId(stmtTxnId);
      await apiClient.rejectExpenseDraft(stmtTxnId);
      showSuccess('Draft Rejected', 'Expense draft removed and row marked for review.');
      if (reconAccountId) {
        loadReconciliationWorkspace(reconAccountId, reconStatementId);
      }
    } catch (err: any) {
      showError('Rejection failed', err.message || 'Failed to reject expense draft');
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleEditExpenseDraftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDraftData) return;
    try {
      setLoading(true);
      await apiClient.editExpenseDraft(editingDraftData.statementTxnId, {
        category: editingDraftData.category,
        counterparty: editingDraftData.counterparty,
        amount: editingDraftData.amount,
        description: editingDraftData.description,
        notes: editingDraftData.notes,
      });
      showSuccess('Draft Updated', 'Expense draft details updated successfully.');
      setShowEditDraftModal(false);
      setEditingDraftData(null);
      if (reconAccountId) {
        loadReconciliationWorkspace(reconAccountId, reconStatementId);
      }
    } catch (err: any) {
      showError('Update failed', err.message || 'Failed to update draft');
    } finally {
      setLoading(false);
    }
  };

  const handleIgnoreTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ignoringTxn) return;
    try {
      setLoading(true);
      await apiClient.ignoreStatementTransaction(ignoringTxn.id, ignoringTxn.reason);
      showSuccess('Row Ignored', 'Statement transaction marked as ignored with documented reason.');
      setShowIgnoreModal(false);
      setIgnoringTxn(null);
      if (reconAccountId) {
        loadReconciliationWorkspace(reconAccountId, reconStatementId);
        loadDashboardMetrics();
      }
    } catch (err: any) {
      showError('Ignore failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnignoreTransaction = async (stmtTxnId: number) => {
    try {
      setProcessingActionId(stmtTxnId);
      await apiClient.unignoreStatementTransaction(stmtTxnId);
      showSuccess('Restored', 'Statement transaction un-ignored and returned to queue.');
      if (reconAccountId) {
        loadReconciliationWorkspace(reconAccountId, reconStatementId);
        loadDashboardMetrics();
      }
    } catch (err: any) {
      showError('Restore failed', err.message);
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleToggleRule = async (ruleId: number) => {
    try {
      await apiClient.toggleReconciliationRule(ruleId);
      showSuccess('Rule Updated', 'Reconciliation rule status toggled.');
      loadRules();
    } catch (err: any) {
      showError('Failed to toggle rule', err.message);
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    if (!window.confirm('Are you sure you want to delete this learned rule?')) return;
    try {
      await apiClient.deleteReconciliationRule(ruleId);
      showSuccess('Rule Deleted', 'Reconciliation rule removed.');
      loadRules();
    } catch (err: any) {
      showError('Failed to delete rule', err.message);
    }
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (editingRuleId) {
        await apiClient.updateReconciliationRule(editingRuleId, ruleFormData);
        showSuccess('Rule Updated', 'Rule updated successfully.');
      } else {
        await apiClient.createReconciliationRule(ruleFormData);
        showSuccess('Rule Created', 'New reconciliation rule created.');
      }
      setShowRuleModal(false);
      setEditingRuleId(null);
      loadRules();
    } catch (err: any) {
      showError('Rule save failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  /* --------------------------------------------------------------------------
   * 4. Filtered Ledger Rows
   * -------------------------------------------------------------------------- */

  const filteredTransactions = useMemo(() => {
    let rows = transactions.filter((t) => {
      const isCredit = ['deposit', 'transfer_in', 'interest'].includes(t.transaction_type);
      const amt = Number(t.amount) || 0;

      // Account filter
      if (ledgerAccountFilter !== 'all' && t.bank_account_id !== ledgerAccountFilter) {
        return false;
      }

      // Type filter
      if (ledgerTypeFilter !== 'all' && t.transaction_type !== ledgerTypeFilter) {
        return false;
      }

      // Direction / Flow
      if (ledgerDirectionFilter === 'inflow' && !isCredit) return false;
      if (ledgerDirectionFilter === 'outflow' && isCredit) return false;

      // Channel / Method
      if (ledgerMethodFilter !== 'all') {
        const text = `${t.reference_no || ''} ${t.description || ''}`.toLowerCase();
        if (ledgerMethodFilter === 'upi' && !text.includes('upi')) return false;
        if (ledgerMethodFilter === 'bank_transfer' && !text.includes('neft') && !text.includes('imps') && !text.includes('rtgs') && !text.includes('transfer')) return false;
        if (ledgerMethodFilter === 'cash' && !text.includes('cash')) return false;
        if (ledgerMethodFilter === 'cheque' && !text.includes('chq') && !text.includes('cheque')) return false;
        if (ledgerMethodFilter === 'bank_charges' && t.transaction_type !== 'bank_charges' && !text.includes('fee') && !text.includes('charge')) return false;
      }

      // Amounts
      if (ledgerMinAmount !== '' && amt < Number(ledgerMinAmount)) return false;
      if (ledgerMaxAmount !== '' && amt > Number(ledgerMaxAmount)) return false;

      // Dates
      if (ledgerDateFrom && t.transaction_date < ledgerDateFrom) return false;
      if (ledgerDateTo && t.transaction_date > ledgerDateTo) return false;

      // Search Query
      if (ledgerSearch.trim()) {
        const q = ledgerSearch.toLowerCase();
        const ref = (t.reference_no || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const acct = (t.bank_account?.account_name || '').toLowerCase();
        return ref.includes(q) || desc.includes(q) || acct.includes(q);
      }

      return true;
    });

    // Sorting
    rows.sort((a, b) => {
      let x: any = '';
      let y: any = '';
      if (ledgerSortBy === 'amount') {
        x = Number(a.amount) || 0;
        y = Number(b.amount) || 0;
      } else if (ledgerSortBy === 'ref') {
        x = a.reference_no || '';
        y = b.reference_no || '';
      } else if (ledgerSortBy === 'balance') {
        x = Number(a.running_balance) || 0;
        y = Number(b.running_balance) || 0;
      } else {
        x = `${a.transaction_date}_${String(a.id).padStart(8, '0')}`;
        y = `${b.transaction_date}_${String(b.id).padStart(8, '0')}`;
      }
      if (typeof x === 'number' && typeof y === 'number') {
        return ledgerSortDir === 'asc' ? x - y : y - x;
      }
      return ledgerSortDir === 'asc' ? String(x).localeCompare(String(y)) : String(y).localeCompare(String(x));
    });

    return rows;
  }, [transactions, ledgerAccountFilter, ledgerTypeFilter, ledgerDirectionFilter, ledgerMethodFilter, ledgerMinAmount, ledgerMaxAmount, ledgerDateFrom, ledgerDateTo, ledgerSearch, ledgerSortBy, ledgerSortDir]);

  const ledgerSummary = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const tx of filteredTransactions) {
      const amt = Number(tx.amount) || 0;
      const isCredit = ['deposit', 'transfer_in', 'interest'].includes(tx.transaction_type);
      if (isCredit) {
        inflow += amt;
      } else {
        outflow += amt;
      }
    }
    return {
      count: filteredTransactions.length,
      inflow,
      outflow,
      net: inflow - outflow,
    };
  }, [filteredTransactions]);

  const activeLedgerFiltersCount = useMemo(() => {
    let c = 0;
    if (ledgerAccountFilter !== 'all') c++;
    if (ledgerTypeFilter !== 'all') c++;
    if (ledgerDirectionFilter !== 'all') c++;
    if (ledgerMethodFilter !== 'all') c++;
    if (ledgerDateFrom || ledgerDateTo) c++;
    if (ledgerMinAmount || ledgerMaxAmount) c++;
    if (ledgerSearch.trim()) c++;
    return c;
  }, [ledgerAccountFilter, ledgerTypeFilter, ledgerDirectionFilter, ledgerMethodFilter, ledgerDateFrom, ledgerDateTo, ledgerMinAmount, ledgerMaxAmount, ledgerSearch]);

  const clearLedgerFilters = () => {
    setLedgerAccountFilter('all');
    setLedgerTypeFilter('all');
    setLedgerDirectionFilter('all');
    setLedgerMethodFilter('all');
    setLedgerDateFrom('');
    setLedgerDateTo('');
    setLedgerMinAmount('');
    setLedgerMaxAmount('');
    setLedgerSearch('');
    setLedgerSortBy('date');
    setLedgerSortDir('desc');
  };

  const exportLedgerCsv = () => {
    if (!filteredTransactions.length) {
      showError('Export error', 'No transactions found with current filters.');
      return;
    }
    const headers = ['Date', 'Account', 'Type', 'Reference/UTR', 'Description', 'Debit (Outflow)', 'Credit (Inflow)', 'Running Balance'];
    const rows = filteredTransactions.map((tx) => {
      const isCredit = ['deposit', 'transfer_in', 'interest'].includes(tx.transaction_type);
      const amt = Number(tx.amount) || 0;
      return [
        tx.transaction_date,
        `"${(tx.bank_account?.account_name || 'Account').replace(/"/g, '""')}"`,
        tx.transaction_type,
        `"${(tx.reference_no || '').replace(/"/g, '""')}"`,
        `"${(tx.description || '').replace(/"/g, '""')}"`,
        !isCredit ? amt.toFixed(2) : '0.00',
        isCredit ? amt.toFixed(2) : '0.00',
        Number(tx.running_balance || 0).toFixed(2),
      ].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ledger-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showSuccess('Export complete', `Exported ${filteredTransactions.length} transactions to CSV.`);
  };

  // Detailed Reconciliation Workspace Filter
  const filteredReconSuggestions = useMemo(() => {
    return reconSuggestions.filter((item) => {
      const stmt = item.statement_transaction;
      const isDebit = Number(stmt.debit) > 0;
      const amt = Number(isDebit ? stmt.debit : stmt.credit);

      // Direction
      if (reconDirectionFilter === 'inward' && isDebit) return false;
      if (reconDirectionFilter === 'outward' && !isDebit) return false;

      // Status Filter
      if (reconStatusFilter !== 'all') {
        const itemStatus = stmt.status || stmt.reconciliation_status || 'needs_review';
        if (reconStatusFilter === 'matched' && !['matched', 'partially_matched'].includes(itemStatus)) return false;
        if (reconStatusFilter === 'partially_matched' && itemStatus !== 'partially_matched') return false;
        if (reconStatusFilter === 'draft' && itemStatus !== 'expense_draft_created') return false;
        if (reconStatusFilter === 'review' && itemStatus !== 'needs_review' && itemStatus !== 'unmatched') return false;
        if (reconStatusFilter === 'unmatched_income' && itemStatus !== 'unmatched_income') return false;
        if (reconStatusFilter === 'duplicate' && itemStatus !== 'duplicate') return false;
        if (reconStatusFilter === 'transfer' && itemStatus !== 'transfer_pending') return false;
        if (reconStatusFilter === 'ignored' && itemStatus !== 'ignored') return false;
      }

      // Confidence
      const confScore = item.confidence_score ?? (item as any).confidence ?? 0;
      if (reconConfidenceFilter === 'high' && confScore < 90) return false;
      if (reconConfidenceFilter === 'medium' && (confScore < 70 || confScore >= 90)) return false;
      if (reconConfidenceFilter === 'low' && confScore >= 70) return false;

      // Method / Channel
      if (reconMethodFilter !== 'all') {
        const desc = (stmt.description || '').toLowerCase();
        const ref = (stmt.reference_no || '').toLowerCase();
        if (reconMethodFilter === 'upi' && !desc.includes('upi') && !ref.includes('upi')) return false;
        if (reconMethodFilter === 'bank_transfer' && !desc.includes('neft') && !desc.includes('imps') && !desc.includes('rtgs') && !desc.includes('transfer')) return false;
        if (reconMethodFilter === 'cheque' && !desc.includes('chq') && !desc.includes('cheque') && !stmt.cheque_no) return false;
        if (reconMethodFilter === 'charges' && !desc.includes('fee') && !desc.includes('charge') && !desc.includes('chrg') && !desc.includes('tax')) return false;
      }

      // Amounts
      if (reconMinAmount !== '' && amt < Number(reconMinAmount)) return false;
      if (reconMaxAmount !== '' && amt > Number(reconMaxAmount)) return false;

      // Dates
      if (reconDateFrom && stmt.transaction_date < reconDateFrom) return false;
      if (reconDateTo && stmt.transaction_date > reconDateTo) return false;

      // Search Query
      if (reconSearch.trim()) {
        const q = reconSearch.toLowerCase();
        const d = (stmt.description || '').toLowerCase();
        const r = (stmt.reference_no || '').toLowerCase();
        if (!d.includes(q) && !r.includes(q)) return false;
      }

      return true;
    });
  }, [reconSuggestions, reconDirectionFilter, reconStatusFilter, reconConfidenceFilter, reconMethodFilter, reconMinAmount, reconMaxAmount, reconDateFrom, reconDateTo, reconSearch]);

  const activeReconFiltersCount = useMemo(() => {
    let c = 0;
    if (reconDirectionFilter !== 'all') c++;
    if (reconConfidenceFilter !== 'all') c++;
    if (reconMethodFilter !== 'all') c++;
    if (reconDateFrom || reconDateTo) c++;
    if (reconMinAmount || reconMaxAmount) c++;
    if (reconSearch.trim()) c++;
    return c;
  }, [reconDirectionFilter, reconConfidenceFilter, reconMethodFilter, reconDateFrom, reconDateTo, reconMinAmount, reconMaxAmount, reconSearch]);

  const clearReconFilters = () => {
    setReconDirectionFilter('all');
    setReconConfidenceFilter('all');
    setReconMethodFilter('all');
    setReconDateFrom('');
    setReconDateTo('');
    setReconMinAmount('');
    setReconMaxAmount('');
    setReconSearch('');
  };

  // Detailed Cash Closing Filter
  const filteredCashClosings = useMemo(() => {
    return cashClosings.filter((c) => {
      if (closingStatusFilter !== 'all' && c.status !== closingStatusFilter) return false;
      if (closingDrawerFilter !== 'all' && c.cash_account_id !== closingDrawerFilter) return false;
      if (closingDateFrom && c.closing_date < closingDateFrom) return false;
      if (closingDateTo && c.closing_date > closingDateTo) return false;
      const diff = Number(c.difference) || 0;
      if (closingVarianceFilter === 'has_variance' && diff === 0) return false;
      if (closingVarianceFilter === 'zero_variance' && diff !== 0) return false;
      return true;
    });
  }, [cashClosings, closingStatusFilter, closingDrawerFilter, closingDateFrom, closingDateTo, closingVarianceFilter]);

  // Detailed Statements Filter
  const filteredStatements = useMemo(() => {
    return statements.filter((s) => {
      if (statementFilterAccount !== 'all' && s.bank_account_id !== statementFilterAccount) return false;
      if (statementSearch.trim()) {
        const q = statementSearch.toLowerCase();
        const fn = (s.original_filename || s.filename || '').toLowerCase();
        const fmt = (s.bank_format || '').toLowerCase();
        if (!fn.includes(q) && !fmt.includes(q)) return false;
      }
      return true;
    });
  }, [statements, statementFilterAccount, statementSearch]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      {/* Top Banner / Title Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                  <Landmark className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                      Bank & Cash Management
                    </h1>
                    {/* Financial Year Selector */}
                    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                      <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                      <select
                        value={selectedFy}
                        onChange={(e) => handleFyChange(e.target.value)}
                        className="bg-transparent font-bold text-indigo-900 focus:outline-none"
                      >
                        {availableFys.map((fy) => (
                          <option key={fy} value={fy}>{fy}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500">
                    Indian Financial Year ledger, daily cash in/out, UPI/Bank transfers, PDF statement parser & AI reconciliation
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  loadAccounts();
                  loadDashboardMetrics();
                  loadCashSummary();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>

              {canManageTransactions && (
                <button
                  type="button"
                  onClick={() => {
                    if (accounts.length >= 2) {
                      setTransferFormData({
                        source_account_id: accounts[0].id,
                        destination_account_id: accounts[1].id,
                        amount: '',
                        transaction_date: new Date().toISOString().slice(0, 10),
                        reference_no: '',
                        description: '',
                      });
                      setShowTransferModal(true);
                    } else {
                      showError('Accounts required', 'You need at least 2 bank/cash accounts to transfer.');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Internal Transfer
                </button>
              )}

              {canManageAccounts && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAccount(null);
                    setAccountFormData({
                      account_name: '',
                      account_type: 'bank',
                      bank_name: '',
                      account_number: '',
                      ifsc_code: '',
                      branch_name: '',
                      opening_balance: 0,
                      is_default: false,
                    });
                    setShowAccountModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Account
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-6 flex overflow-x-auto border-b border-slate-200 text-sm font-medium">
            {[
              { id: 'dashboard', label: 'Dashboard & Equation', icon: Layers },
              { id: 'accounts', label: 'Accounts & Drawers', icon: Landmark },
              { id: 'ledger', label: 'Unified Ledger', icon: FileText },
              { id: 'cash_closing', label: 'Daily Cash In/Out & Closing', icon: Calculator },
              { id: 'statements', label: 'Statement Upload (PDF/CSV/XLSX)', icon: UploadCloud },
              { id: 'reconciliation', label: 'AI Reconciliation (UPI & Bank)', icon: Sparkles },
              { id: 'rules', label: 'Learned AI Rules & Memory', icon: BookOpen },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as ActiveTab)}
                  className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                    isActive
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.id === 'reconciliation' && reconSuggestions.length > 0 && (
                    <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                      {reconSuggestions.length}
                    </span>
                  )}
                  {tab.id === 'rules' && rulesList.length > 0 && (
                    <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                      {rulesList.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* =========================================================================
            TAB 1: DASHBOARD & RECONCILIATION EQUATION + DAILY & FY CASH FLOW
           ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Total Bank Balance
                  </span>
                  <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
                    <Landmark className="h-5 w-5" />
                  </span>
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900">
                  {currencyFmt(metrics?.total_bank_balance)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Across {accounts.filter((a) => a.account_type === 'bank').length} active bank accounts
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Cash in Hand / Tills
                  </span>
                  <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                    <Wallet className="h-5 w-5" />
                  </span>
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900">
                  {currencyFmt(metrics?.total_cash_balance)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Across {accounts.filter((a) => a.account_type === 'cash').length} cash drawers
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Total Liquidity
                  </span>
                  <span className="rounded-lg bg-purple-50 p-2 text-purple-600">
                    <DollarSign className="h-5 w-5" />
                  </span>
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900">
                  {currencyFmt(metrics?.total_liquidity)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Total available operating funds
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Reconciliation Health
                  </span>
                  <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">
                    {metrics?.reconciled_percentage || 0}%
                  </span>
                  <span className="text-xs text-slate-500">reconciled</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-500"
                    style={{ width: `${metrics?.reconciled_percentage || 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* DAILY CASH IN/OUT & FINANCIAL YEAR (FY) SUMMARY CARDS */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Daily Cash In / Out (Today) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                      <Wallet className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Today's Daily Cash In & Out</h3>
                      <p className="text-[11px] text-slate-400">Date: {cashSummary?.date || closingDate}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                    Daily Till
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                    <span className="text-[11px] font-semibold uppercase text-emerald-700">Cash In (Received)</span>
                    <div className="mt-1 text-base font-bold text-emerald-700">
                      +{currencyFmt(cashSummary?.daily?.cash_in)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
                    <span className="text-[11px] font-semibold uppercase text-rose-700">Cash Out (Paid)</span>
                    <div className="mt-1 text-base font-bold text-rose-700">
                      -{currencyFmt(cashSummary?.daily?.cash_out)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                    <span className="text-[11px] font-semibold uppercase text-indigo-700">Net Cash Today</span>
                    <div className={`mt-1 text-base font-bold ${Number(cashSummary?.daily?.net_cash) >= 0 ? 'text-indigo-900' : 'text-rose-700'}`}>
                      {currencyFmt(cashSummary?.daily?.net_cash)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <div className="flex justify-between rounded-lg bg-slate-50 p-2">
                    <span>UPI Received (Today):</span>
                    <span className="font-semibold text-emerald-700">+{currencyFmt(cashSummary?.daily?.upi_in)}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-slate-50 p-2">
                    <span>UPI Sent (Today):</span>
                    <span className="font-semibold text-rose-700">-{currencyFmt(cashSummary?.daily?.upi_out)}</span>
                  </div>
                </div>
              </div>

              {/* Financial Year (FY) Cash In / Out */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                      <Calendar className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {cashSummary?.financial_year || selectedFy} Annual Cash In & Out
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        {cashSummary?.financial_year_start} to {cashSummary?.financial_year_end} (Apr - Mar)
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800">
                    Indian FY
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                    <span className="text-[11px] font-semibold uppercase text-emerald-700">FY Cash In</span>
                    <div className="mt-1 text-base font-bold text-emerald-700">
                      +{currencyFmt(cashSummary?.financial_year_totals?.cash_in)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
                    <span className="text-[11px] font-semibold uppercase text-rose-700">FY Cash Out</span>
                    <div className="mt-1 text-base font-bold text-rose-700">
                      -{currencyFmt(cashSummary?.financial_year_totals?.cash_out)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3">
                    <span className="text-[11px] font-semibold uppercase text-purple-700">FY Net Cash Flow</span>
                    <div className={`mt-1 text-base font-bold ${Number(cashSummary?.financial_year_totals?.net_cash) >= 0 ? 'text-purple-900' : 'text-rose-700'}`}>
                      {currencyFmt(cashSummary?.financial_year_totals?.net_cash)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <div className="flex justify-between rounded-lg bg-slate-50 p-2">
                    <span>Total Digital In (UPI+Bank):</span>
                    <span className="font-semibold text-emerald-700">
                      +{currencyFmt(Number(cashSummary?.financial_year_totals?.upi_in || 0) + Number(cashSummary?.financial_year_totals?.bank_in || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-slate-50 p-2">
                    <span>Total Digital Out (UPI+Bank):</span>
                    <span className="font-semibold text-rose-700">
                      -{currencyFmt(Number(cashSummary?.financial_year_totals?.upi_out || 0) + Number(cashSummary?.financial_year_totals?.bank_out || 0))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Reconciliation Equation Card */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/75 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Standard Bank Reconciliation Equation
                    </h2>
                    <p className="text-xs text-slate-500">
                      Mathematical verification matching ERP General Ledger with Verified Bank Statements
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {metrics && Math.abs(metrics.difference) < 0.01 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Reconciled & Balanced
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                        <AlertCircle className="h-3.5 w-3.5" /> Variance Detected
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 items-center gap-4 text-center md:grid-cols-5">
                  {/* Step 1: Book Balance */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">
                      Book Balance (ERP)
                    </span>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      {currencyFmt(metrics?.book_balance)}
                    </div>
                    <span className="text-[10px] text-slate-400">Total ledger transactions</span>
                  </div>

                  {/* Step 2: Unmatched Credits (+) */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <span className="text-[11px] font-semibold uppercase text-emerald-700">
                      + Unmatched Credits
                    </span>
                    <div className="mt-1 text-lg font-bold text-emerald-700">
                      +{currencyFmt(metrics?.unmatched_credits)}
                    </div>
                    <span className="text-[10px] text-emerald-600">Deposits not in bank stmt</span>
                  </div>

                  {/* Step 3: Unmatched Debits (-) */}
                  <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                    <span className="text-[11px] font-semibold uppercase text-rose-700">
                      - Unmatched Debits
                    </span>
                    <div className="mt-1 text-lg font-bold text-rose-700">
                      -{currencyFmt(metrics?.unmatched_debits)}
                    </div>
                    <span className="text-[10px] text-rose-600">Cheques/fees not cleared</span>
                  </div>

                  {/* Step 4: Adjusted Book Balance */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                    <span className="text-[11px] font-semibold uppercase text-indigo-700">
                      = Adjusted Balance
                    </span>
                    <div className="mt-1 text-lg font-bold text-indigo-900">
                      {currencyFmt(metrics?.adjusted_book_balance)}
                    </div>
                    <span className="text-[10px] text-indigo-600">Expected bank statement</span>
                  </div>

                  {/* Step 5: Statement Balance & Difference */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">
                      Statement Balance
                    </span>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      {currencyFmt(metrics?.statement_balance)}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold">
                      Difference: <span className={metrics?.difference === 0 ? 'text-emerald-600' : 'text-amber-600'}>
                        {currencyFmt(metrics?.difference)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-slate-400" />
                    <span>
                      Unreconciled Payments Pending: <strong>{metrics?.unreconciled_payments_count || 0}</strong> ({currencyFmt(metrics?.unreconciled_payments_amount)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('reconciliation')}
                    className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Open Automated AI Reconciliation Workspace <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Monthly Cash Breakdown Table for the Financial Year */}
            {cashSummary?.monthly_breakdown && cashSummary.monthly_breakdown.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {cashSummary.financial_year} 12-Month Cash In & Out Flow
                    </h3>
                    <p className="text-xs text-slate-500">
                      Month-by-month cash movement across all till registers and counters
                    </p>
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">Month</th>
                        <th className="px-3 py-2.5 text-right">Cash In (Received)</th>
                        <th className="px-3 py-2.5 text-right">Cash Out (Paid)</th>
                        <th className="px-3 py-2.5 text-right">Net Cash Flow</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {cashSummary.monthly_breakdown.map((m) => (
                        <tr key={m.month} className="hover:bg-slate-50/50">
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">{m.month}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-emerald-700">
                            +{currencyFmt(m.cash_in)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-rose-700">
                            -{currencyFmt(m.cash_out)}
                          </td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right font-bold ${
                            m.net_cash >= 0 ? 'text-indigo-900' : 'text-rose-700'
                          }`}>
                            {currencyFmt(m.net_cash)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 2: ACCOUNTS & DRAWERS
           ========================================================================= */}
        {activeTab === 'accounts' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Configured Accounts</h2>
                <p className="text-xs text-slate-500">Corporate bank accounts and branch cash registers</p>
              </div>
              {canManageAccounts && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAccount(null);
                    setAccountFormData({
                      account_name: '',
                      account_type: 'bank',
                      bank_name: '',
                      account_number: '',
                      ifsc_code: '',
                      branch_name: '',
                      opening_balance: 0,
                      is_default: false,
                    });
                    setShowAccountModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Bank / Till
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {accounts.map((acc) => (
                <div key={acc.id} className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`rounded-xl p-3 ${acc.account_type === 'bank' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {acc.account_type === 'bank' ? <Landmark className="h-6 w-6" /> : <Wallet className="h-6 w-6" />}
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{acc.account_name}</h3>
                        <p className="text-xs text-slate-500">
                          {acc.account_type === 'bank' ? (acc.bank_name || 'Bank Account') : 'Cash Counter / Drawer'}
                        </p>
                      </div>
                    </div>
                    {acc.is_default && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        Default
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs">
                    {acc.account_type === 'bank' ? (
                      <>
                        <div className="flex justify-between text-slate-600">
                          <span>Account No:</span>
                          <span className="font-mono font-medium">{acc.masked_account_number || acc.account_number || '—'}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>IFSC Code:</span>
                          <span className="font-mono font-medium">{acc.ifsc_code || '—'}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-slate-600">
                        <span>Drawer Type:</span>
                        <span className="font-medium">Physical Cash In Hand</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-1.5 text-slate-900 font-bold">
                      <span>Book Balance:</span>
                      <span className="text-indigo-600">{currencyFmt(acc.current_balance)}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setLedgerAccountFilter(acc.id);
                        setActiveTab('ledger');
                      }}
                      className="font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      View Ledger &rarr;
                    </button>
                    {canManageAccounts && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAccount(acc);
                            setAccountFormData({
                              account_name: acc.account_name,
                              account_type: acc.account_type,
                              bank_name: acc.bank_name || '',
                              account_number: acc.account_number || '',
                              ifsc_code: acc.ifsc_code || '',
                              branch_name: acc.branch_name || '',
                              opening_balance: Number(acc.opening_balance) || 0,
                              is_default: !!acc.is_default,
                            });
                            setShowAccountModal(true);
                          }}
                          className="text-slate-500 hover:text-slate-700"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: UNIFIED LEDGER & TRANSFERS
           ========================================================================= */}
        {activeTab === 'ledger' && (
          <div className="space-y-6">
            {/* Detailed Filter Toolbar */}
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-52">
                    <select
                      value={ledgerAccountFilter}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLedgerAccountFilter(v === 'all' ? 'all' : Number(v));
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="all">All Accounts (Consolidated)</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.account_name} ({a.account_type === 'cash' ? 'Cash Drawer' : a.bank_name || 'Bank'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Flow Direction Pills */}
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    {[
                      { id: 'all', label: 'All Flows' },
                      { id: 'inflow', label: '+ Credits (In)' },
                      { id: 'outflow', label: '- Debits (Out)' },
                    ].map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setLedgerDirectionFilter(pill.id)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                          ledgerDirectionFilter === pill.id
                            ? 'bg-white text-indigo-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>

                  {/* Quick Search */}
                  <div className="relative w-56">
                    <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      placeholder="Search UTR, ref, desc..."
                      className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
                    />
                    {ledgerSearch && (
                      <button
                        type="button"
                        onClick={() => setLedgerSearch('')}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Toggle Detailed Filters */}
                  <button
                    type="button"
                    onClick={() => setShowDetailedLedgerFilters(!showDetailedLedgerFilters)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      showDetailedLedgerFilters || activeLedgerFiltersCount > 0
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Detailed Filters
                    {activeLedgerFiltersCount > 0 && (
                      <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                        {activeLedgerFiltersCount}
                      </span>
                    )}
                  </button>

                  {/* Reset Button */}
                  {activeLedgerFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={clearLedgerFilters}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reset
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Export Filtered CSV */}
                  <button
                    type="button"
                    onClick={exportLedgerCsv}
                    title="Export currently filtered view to CSV"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                    Export CSV
                  </button>

                  {canManageTransactions && (
                    <button
                      type="button"
                      onClick={() => {
                        if (accounts.length > 0) {
                          setAdjustmentFormData({
                            bank_account_id: accounts[0].id,
                            transaction_type: 'bank_charges',
                            amount: '',
                            transaction_date: new Date().toISOString().slice(0, 10),
                            reference_no: '',
                            description: '',
                          });
                          setShowAdjustmentModal(true);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adjustment / Fee
                    </button>
                  )}
                </div>
              </div>

              {/* Expandable Detailed Filter Drawer */}
              {showDetailedLedgerFilters && (
                <div className="border-t border-slate-100 pt-3 mt-3">
                  {/* Quick Date Presets */}
                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Date Preset:</span>
                    {[
                      { label: 'All Dates', from: '', to: '' },
                      { label: 'Today', from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
                      { label: 'Yesterday', from: new Date(Date.now() - 86400000).toISOString().slice(0, 10), to: new Date(Date.now() - 86400000).toISOString().slice(0, 10) },
                      { label: 'Last 7 Days', from: new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
                      { label: 'Last 30 Days', from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
                      { label: 'This Month', from: `${new Date().toISOString().slice(0, 7)}-01`, to: new Date().toISOString().slice(0, 10) },
                      {
                        label: 'This FY (Apr-Mar)',
                        from: new Date().toISOString().slice(5, 7) >= '04' ? `${new Date().toISOString().slice(0, 4)}-04-01` : `${Number(new Date().toISOString().slice(0, 4)) - 1}-04-01`,
                        to: new Date().toISOString().slice(5, 7) >= '04' ? `${Number(new Date().toISOString().slice(0, 4)) + 1}-03-31` : `${new Date().toISOString().slice(0, 4)}-03-31`,
                      },
                    ].map((preset) => {
                      const isActive = ledgerDateFrom === preset.from && ledgerDateTo === preset.to;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setLedgerDateFrom(preset.from);
                            setLedgerDateTo(preset.to);
                          }}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                            isActive
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {/* Date From */}
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">Date From</label>
                      <input
                        type="date"
                        value={ledgerDateFrom}
                        onChange={(e) => setLedgerDateFrom(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                      />
                    </div>

                    {/* Date To */}
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">Date To</label>
                      <input
                        type="date"
                        value={ledgerDateTo}
                        onChange={(e) => setLedgerDateTo(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                      />
                    </div>

                    {/* Transaction Type */}
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">Transaction Type</label>
                      <select
                        value={ledgerTypeFilter}
                        onChange={(e) => setLedgerTypeFilter(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                      >
                        <option value="all">All Types</option>
                        <option value="deposit">Deposits</option>
                        <option value="withdrawal">Withdrawals</option>
                        <option value="transfer_in">Transfers In</option>
                        <option value="transfer_out">Transfers Out</option>
                        <option value="bank_charges">Bank Charges</option>
                        <option value="adjustment">Adjustments</option>
                      </select>
                    </div>

                    {/* Payment Method / Channel */}
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">Channel / Method</label>
                      <select
                        value={ledgerMethodFilter}
                        onChange={(e) => setLedgerMethodFilter(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                      >
                        <option value="all">All Channels</option>
                        <option value="upi">UPI</option>
                        <option value="bank_transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                        <option value="cash">Cash</option>
                        <option value="cheque">Cheque</option>
                        <option value="bank_charges">Charges / Fees</option>
                      </select>
                    </div>

                    {/* Amount Range */}
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">Amount Range (₹)</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          placeholder="Min ₹"
                          value={ledgerMinAmount}
                          onChange={(e) => setLedgerMinAmount(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                        />
                        <span className="text-slate-400 text-xs">-</span>
                        <input
                          type="number"
                          placeholder="Max ₹"
                          value={ledgerMaxAmount}
                          onChange={(e) => setLedgerMaxAmount(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sorting Options */}
                  <div className="mt-3 flex flex-wrap items-center justify-between border-t border-slate-100 pt-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Sort by:</span>
                      <select
                        value={ledgerSortBy}
                        onChange={(e) => setLedgerSortBy(e.target.value as any)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                      >
                        <option value="date">Transaction Date</option>
                        <option value="amount">Amount</option>
                        <option value="ref">Reference / UTR</option>
                        <option value="balance">Running Balance</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setLedgerSortDir(ledgerSortDir === 'asc' ? 'desc' : 'asc')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {ledgerSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {ledgerSortDir === 'asc' ? 'Ascending' : 'Descending'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => loadLedger()}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Apply & Refresh Server Data
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Stats Banner for Filtered Ledger */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-600">
                    Showing <strong className="text-slate-900">{filteredTransactions.length}</strong> transactions
                  </span>
                  {activeLedgerFiltersCount > 0 && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      {activeLedgerFiltersCount} filter(s) active
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                    Inflow: {currencyFmt(ledgerSummary.inflow)}
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    Outflow: {currencyFmt(ledgerSummary.outflow)}
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                    <Wallet className="h-3.5 w-3.5" />
                    Net Flow: {ledgerSummary.net >= 0 ? `+${currencyFmt(ledgerSummary.net)}` : currencyFmt(ledgerSummary.net)}
                  </div>
                </div>
              </div>
            </div>

            {/* Ledger Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Reference / UTR</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3 text-right">Debit (Outflow)</th>
                      <th className="px-4 py-3 text-right">Credit (Inflow)</th>
                      <th className="px-4 py-3 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredTransactions.map((tx) => {
                      const isCredit = ['deposit', 'transfer_in', 'interest'].includes(tx.transaction_type);
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/50">
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                            {tx.transaction_date}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {tx.bank_account?.account_name || '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isCredit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {(tx.transaction_type || 'transaction').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px]">
                            {tx.reference_no || '—'}
                          </td>
                          <td className="max-w-xs truncate px-4 py-3 text-slate-600" title={tx.description || ''}>
                            {tx.description || '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-rose-600">
                            {!isCredit ? currencyFmt(tx.amount) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-600">
                            {isCredit ? currencyFmt(tx.amount) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-slate-900">
                            {currencyFmt(tx.running_balance)}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredTransactions.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          No transactions found in this view.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: DAILY CASH CLOSING & DENOMINATION CALCULATOR
           ========================================================================= */}
        {activeTab === 'cash_closing' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Denomination Counter Form */}
              <div className="lg:col-span-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                  <Calculator className="h-5 w-5 text-indigo-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Physical Cash Denomination</h3>
                    <p className="text-[11px] text-slate-400">Count till notes & coins at shift close</p>
                  </div>
                </div>

                <form onSubmit={handleSubmitCashClosing} className="mt-4 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Cash Drawer / Till</label>
                    <select
                      value={selectedCashAccountId || ''}
                      onChange={(e) => setSelectedCashAccountId(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                      required
                    >
                      <option value="">Select cash account...</option>
                      {accounts.filter((a) => a.account_type === 'cash').map((a) => (
                        <option key={a.id} value={a.id}>{a.account_name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Closing Date</label>
                    <input
                      type="date"
                      value={closingDate}
                      onChange={(e) => setClosingDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                      required
                    />
                  </div>

                  {/* Denomination grid */}
                  <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-bold uppercase text-slate-500">Denomination Count</p>
                    {INDIAN_DENOMINATIONS.map((d) => (
                      <div key={d} className="flex items-center justify-between gap-2 text-xs">
                        <span className="w-16 font-semibold text-slate-700">₹{d} &times;</span>
                        <input
                          type="number"
                          min="0"
                          value={denominations[d] || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            setDenominations((prev) => ({ ...prev, [d]: val }));
                          }}
                          placeholder="0"
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-xs"
                        />
                        <span className="w-20 text-right font-medium text-slate-500">
                          {currencyFmt(d * (denominations[d] || 0))}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
                    <div className="flex justify-between text-xs font-bold text-indigo-900">
                      <span>Physical Cash Counted:</span>
                      <span>{currencyFmt(physicalCashTotal)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Closing Remarks</label>
                    <textarea
                      rows={2}
                      value={closingRemarks}
                      onChange={(e) => setClosingRemarks(e.target.value)}
                      placeholder="e.g. Evening drawer closing by cashier"
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                    />
                  </div>

                  {canManageCashClosing && (
                    <button
                      type="submit"
                      disabled={loading || !selectedCashAccountId}
                      className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Submit Daily Closing Record
                    </button>
                  )}
                </form>
              </div>

              {/* Cash Closing History Table */}
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 pb-4 border-b border-slate-100 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Cash Closing Audit Trail</h3>
                    <p className="text-xs text-slate-500">Expected vs physical count with shortage/excess approval</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status Filter */}
                    <select
                      value={closingStatusFilter}
                      onChange={(e) => setClosingStatusFilter(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700"
                    >
                      <option value="all">All Statuses</option>
                      <option value="balanced">Balanced</option>
                      <option value="shortage">Shortage</option>
                      <option value="excess">Excess</option>
                      <option value="approved">Approved</option>
                    </select>

                    {/* Variance Filter */}
                    <select
                      value={closingVarianceFilter}
                      onChange={(e) => setClosingVarianceFilter(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700"
                    >
                      <option value="all">All Variances</option>
                      <option value="has_variance">Shortage/Excess Only</option>
                      <option value="zero_variance">Balanced Only</option>
                    </select>

                    {/* Till Filter */}
                    <select
                      value={closingDrawerFilter}
                      onChange={(e) => setClosingDrawerFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700"
                    >
                      <option value="all">All Tills</option>
                      {accounts.filter((a) => a.account_type === 'cash').map((a) => (
                        <option key={a.id} value={a.id}>{a.account_name}</option>
                      ))}
                    </select>

                    {(closingStatusFilter !== 'all' || closingVarianceFilter !== 'all' || closingDrawerFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setClosingStatusFilter('all');
                          setClosingVarianceFilter('all');
                          setClosingDrawerFilter('all');
                        }}
                        className="text-xs text-rose-600 font-semibold"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Till / Drawer</th>
                        <th className="px-3 py-2.5 text-right">Expected</th>
                        <th className="px-3 py-2.5 text-right">Counted</th>
                        <th className="px-3 py-2.5 text-right">Variance</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                        <th className="px-3 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredCashClosings.map((c) => {
                        const diff = Number(c.difference) || 0;
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/50">
                            <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">
                              {c.closing_date}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              {c.cash_account?.account_name || 'Cash Till'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right">
                              {currencyFmt(c.expected_cash)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                              {currencyFmt(c.physical_cash_counted)}
                            </td>
                            <td className={`whitespace-nowrap px-3 py-2.5 text-right font-bold ${
                              diff === 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-amber-600'
                            }`}>
                              {diff > 0 ? `+${currencyFmt(diff)}` : currencyFmt(diff)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-center">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                c.status === 'balanced' || c.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : c.status === 'shortage'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right">
                              {canApproveCashClosing && (c.status === 'shortage' || c.status === 'excess') && (
                                <button
                                  type="button"
                                  onClick={() => handleApproveClosing(c.id)}
                                  className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                                >
                                  Approve
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {cashClosings.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            No cash closings recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 5: STATEMENT UPLOAD WIZARD (PDF / CSV / XLSX)
           ========================================================================= */}
        {activeTab === 'statements' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Upload Card */}
              <div className="lg:col-span-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                  <UploadCloud className="h-5 w-5 text-indigo-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Upload Bank Statement</h3>
                    <p className="text-[11px] text-slate-400">Supports PDF, Excel (.xlsx), and CSV formats</p>
                  </div>
                </div>

                <form onSubmit={handleUploadStatement} className="mt-4 space-y-4">
                  {/* Mode Selector Tabs */}
                  <div className="flex rounded-lg bg-slate-100 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setUploadMode('file')}
                      className={`flex-1 rounded-md py-1.5 font-medium transition ${
                        uploadMode === 'file'
                          ? 'bg-white text-indigo-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Upload File (PDF / Excel / CSV)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode('text')}
                      className={`flex-1 rounded-md py-1.5 font-medium transition ${
                        uploadMode === 'text'
                          ? 'bg-white text-indigo-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Paste Statement Text
                    </button>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Bank Account</label>
                    <select
                      value={uploadAccountId || ''}
                      onChange={(e) => setUploadAccountId(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                      required
                    >
                      <option value="">Select target bank account...</option>
                      {accounts.filter((a) => a.account_type === 'bank').map((a) => (
                        <option key={a.id} value={a.id}>{a.account_name} ({a.masked_account_number || '••••'})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Bank Statement Preset</label>
                    <select
                      value={uploadBankFormat}
                      onChange={(e) => setUploadBankFormat(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                    >
                      <option value="generic">Auto-Detect / Generic Indian Banks</option>
                      <option value="sbi">State Bank of India (SBI)</option>
                      <option value="hdfc">HDFC Bank</option>
                      <option value="icici">ICICI Bank</option>
                      <option value="axis">Axis Bank</option>
                      <option value="pnb">Punjab National Bank (PNB)</option>
                    </select>
                  </div>

                  {uploadMode === 'file' ? (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-slate-700">Statement File (PDF, CSV, XLSX)</label>
                        <div className="mt-1 rounded-xl border-2 border-dashed border-slate-300 p-4 text-center hover:border-indigo-400 transition bg-slate-50/50">
                          <input
                            type="file"
                            accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                setStatementFile(e.target.files[0]);
                                setIsEncryptedDetected(false);
                              }
                            }}
                            className="w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-indigo-50 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                            required={uploadMode === 'file'}
                          />
                          {statementFile && (
                            <div className="mt-2 text-left text-[11px] text-slate-600 bg-white border border-slate-200 rounded p-2 shadow-2xs">
                              <p className="font-semibold text-slate-900">{statementFile.name}</p>
                              <p className="text-slate-400">{(statementFile.size / 1024).toFixed(1)} KB &bull; {statementFile.type || 'Document'}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Password Protection Alert & Input */}
                      {isEncryptedDetected && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                          <div className="flex items-center gap-2 font-semibold">
                            <Lock className="h-4 w-4 text-amber-700" />
                            PDF is Password-Protected
                          </div>
                          <p className="mt-1 text-[11px] text-amber-800 leading-relaxed">
                            Please enter the PDF password below (standard format: PAN number, Date of Birth DDMMYYYY, or Account Number) and click Decrypt & Import.
                          </p>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5 text-slate-400" />
                            Statement Password <span className="text-[10px] font-normal text-slate-400">(if PDF is locked)</span>
                          </label>
                        </div>
                        <div className="relative mt-1">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={statementPassword}
                            onChange={(e) => setStatementPassword(e.target.value)}
                            placeholder="e.g. PAN (ABCDE1234F), DOB (DDMMYYYY), or Account No"
                            className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-10 text-xs focus:border-indigo-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          SBI: Mobile (last 5) + DOB | HDFC: Customer ID / PAN | ICICI: DOB (DDMM) + Acc (last 4) | Axis: Acc No
                        </p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-700">Paste Statement Text / Table</label>
                        <span className="text-[10px] text-slate-400">
                          {statementRawText.split('\n').filter(Boolean).length} rows detected
                        </span>
                      </div>
                      <textarea
                        value={statementRawText}
                        onChange={(e) => setStatementRawText(e.target.value)}
                        placeholder="Paste text copied from PDF statement, NetBanking transaction table, or CSV lines here...\n\nExample:\n15/10/2026  UPI/6291048  15,000.00 Cr  85,000.00\n16/10/2026  NEFT/REF882  5,000.00 Dr   80,000.00"
                        rows={7}
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-mono text-[11px] leading-relaxed focus:border-indigo-500 focus:outline-none"
                        required={uploadMode === 'text'}
                      />
                      <p className="mt-1 text-[10px] text-slate-400">
                        Tab, comma, or space separated dates, narration, and amounts are automatically parsed.
                      </p>
                    </div>
                  )}

                  {canUploadStatements && (
                    <button
                      type="submit"
                      disabled={
                        uploadingStatement ||
                        !uploadAccountId ||
                        (uploadMode === 'file' ? !statementFile : !statementRawText.trim())
                      }
                      className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {uploadingStatement ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Extracting & Parsing Statement...</span>
                        </>
                      ) : isEncryptedDetected ? (
                        <>
                          <Unlock className="h-4 w-4" />
                          <span>Decrypt & Import Statement</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-4 w-4" />
                          <span>Parse & Import Statement</span>
                        </>
                      )}
                    </button>
                  )}
                </form>
              </div>

              {/* Uploaded Statements History */}
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 pb-4 border-b border-slate-100 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Uploaded Statements Repository</h3>
                    <p className="text-xs text-slate-500">History of imported statements with reconciliation status</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={statementFilterAccount}
                      onChange={(e) => setStatementFilterAccount(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700"
                    >
                      <option value="all">All Bank Accounts</option>
                      {accounts.filter((a) => a.account_type === 'bank').map((a) => (
                        <option key={a.id} value={a.id}>{a.account_name}</option>
                      ))}
                    </select>

                    <div className="relative w-40">
                      <Search className="pointer-events-none absolute left-2.5 top-1.5 h-3 w-3 text-slate-400" />
                      <input
                        type="text"
                        value={statementSearch}
                        onChange={(e) => setStatementSearch(e.target.value)}
                        placeholder="Search filename..."
                        className="w-full rounded-lg border border-slate-300 pl-7 pr-2 py-1 text-xs text-slate-700"
                      />
                    </div>

                    {(statementFilterAccount !== 'all' || statementSearch) && (
                      <button
                        type="button"
                        onClick={() => {
                          setStatementFilterAccount('all');
                          setStatementSearch('');
                        }}
                        className="text-xs text-rose-600 font-semibold"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">Statement File</th>
                        <th className="px-3 py-2.5">Account</th>
                        <th className="px-3 py-2.5">Date Range</th>
                        <th className="px-3 py-2.5 text-center">Txns</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                        <th className="px-3 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredStatements.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/50">
                          <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">
                            {s.original_filename || s.filename}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {s.bank_account?.account_name || 'Bank A/C'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                            {s.from_date || '—'} to {s.to_date || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-center">
                            <span className="font-semibold text-slate-900">{s.reconciled_transactions}</span> / {s.total_transactions}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              s.status === 'reconciled'
                                ? 'bg-emerald-100 text-emerald-800'
                                : s.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setReconAccountId(s.bank_account_id);
                                setReconStatementId(s.id);
                                setActiveTab('reconciliation');
                              }}
                              className="font-semibold text-indigo-600 hover:text-indigo-700"
                            >
                              Reconcile &rarr;
                            </button>
                          </td>
                        </tr>
                      ))}
                      {statements.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No statements uploaded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 6: AUTOMATED AI RECONCILIATION WORKSPACE (UPI & BANK TRANSFER)
           ========================================================================= */}
        {activeTab === 'reconciliation' && (
          <div className="space-y-6">
            {/* Workspace Controls */}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-56">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Bank Account</label>
                  <select
                    value={reconAccountId || ''}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setReconAccountId(id);
                      loadReconciliationWorkspace(id, reconStatementId);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    {accounts.filter((a) => a.account_type === 'bank').map((a) => (
                      <option key={a.id} value={a.id}>{a.account_name}</option>
                    ))}
                  </select>
                </div>

                <div className="w-56">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Statement Batch</label>
                  <select
                    value={reconStatementId || ''}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      setReconStatementId(id);
                      if (reconAccountId) loadReconciliationWorkspace(reconAccountId, id);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
                  >
                    <option value="">All Uploaded Statements</option>
                    {statements.filter((s) => !reconAccountId || s.bank_account_id === reconAccountId).map((s) => (
                      <option key={s.id} value={s.id}>{s.original_filename || s.filename}</option>
                    ))}
                  </select>
                </div>
              </div>

              {canManageReconciliation && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Threshold:</span>
                    <input
                      type="number"
                      min="70"
                      max="100"
                      value={autoMatchThreshold}
                      onChange={(e) => setAutoMatchThreshold(Number(e.target.value) || 90)}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-xs font-semibold"
                    />
                    <span className="text-xs font-bold text-slate-600">%</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoMatch}
                    disabled={loading || reconSuggestions.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Auto-Reconcile Matches
                  </button>

                  <button
                    type="button"
                    onClick={() => handleProcessFullReconciliation(false)}
                    disabled={isProcessingFullRecon || !reconStatementId}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                    title={reconStatementId ? 'Run comprehensive 4-tier reconciliation across every row in this statement' : 'Select a statement batch first'}
                  >
                    {isProcessingFullRecon ? (
                      <RotateCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {isProcessingFullRecon ? 'Processing Entire Statement...' : 'Reconcile Entire Statement'}
                  </button>
                </div>
              )}
            </div>

            {/* 8-Status Reconciliation Summary Dashboard Bar */}
            {statementSummary && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Statement Batch Status Ledger & Summary
                    </h4>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {statementSummary.total_rows} Total Rows
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500">
                      Reconciled: <strong className="text-emerald-600">{statementSummary.reconciled_percentage}%</strong>
                    </span>
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${Math.min(statementSummary.reconciled_percentage || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                  {/* 1. Matched */}
                  <button
                    type="button"
                    onClick={() => setReconStatusFilter(reconStatusFilter === 'matched' ? 'all' : 'matched')}
                    className={`flex flex-col rounded-xl p-2.5 text-left border transition ${
                      reconStatusFilter === 'matched'
                        ? 'border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500'
                        : 'border-slate-100 bg-slate-50 hover:bg-slate-100/80'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase text-emerald-700">Matched</span>
                    <span className="text-base font-extrabold text-emerald-900">{statementSummary.matched_rows}</span>
                    <span className="text-[9px] text-emerald-600 font-medium">Auto & verified</span>
                  </button>

                  {/* 2. Partially Matched */}
                  <button
                    type="button"
                    onClick={() => setReconStatusFilter(reconStatusFilter === 'partially_matched' ? 'all' : 'partially_matched')}
                    className={`flex flex-col rounded-xl p-2.5 text-left border transition ${
                      reconStatusFilter === 'partially_matched'
                        ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500'
                        : 'border-slate-100 bg-slate-50 hover:bg-slate-100/80'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase text-blue-700">Partial</span>
                    <span className="text-base font-extrabold text-blue-900">{statementSummary.partially_matched_rows || 0}</span>
                    <span className="text-[9px] text-blue-600 font-medium">Split/allocation</span>
                  </button>

                  {/* 3. Expense Drafts Created */}
                  <button
                    type="button"
                    onClick={() => setReconStatusFilter(reconStatusFilter === 'draft' ? 'all' : 'draft')}
                    className={`flex flex-col rounded-xl p-2.5 text-left border transition ${
                      reconStatusFilter === 'draft'
                        ? 'border-purple-500 bg-purple-50/70 ring-1 ring-purple-500'
                        : 'border-slate-100 bg-slate-50 hover:bg-slate-100/80'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase text-purple-700">Expense Drafts</span>
                    <span className="text-base font-extrabold text-purple-900">{statementSummary.expense_drafts_count}</span>
                    <span className="text-[9px] text-purple-600 font-medium">AI auto-detected</span>
                  </button>

                  {/* 4. Needs Review */}
                  <button
                    type="button"
                    onClick={() => setReconStatusFilter(reconStatusFilter === 'review' ? 'all' : 'review')}
                    className={`flex flex-col rounded-xl p-2.5 text-left border transition ${
                      reconStatusFilter === 'review'
                        ? 'border-amber-500 bg-amber-50/70 ring-1 ring-amber-500'
                        : 'border-slate-100 bg-slate-50 hover:bg-slate-100/80'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase text-amber-700">Needs Review</span>
                    <span className="text-base font-extrabold text-amber-900">{statementSummary.needs_review_count}</span>
                    <span className="text-[9px] text-amber-600 font-medium">Pending match</span>
                  </button>

                  {/* 5. Unmatched Inflows */}
                  <button
                    type="button"
                    onClick={() => setReconStatusFilter(reconStatusFilter === 'unmatched_income' ? 'all' : 'unmatched_income')}
                    className={`flex flex-col rounded-xl p-2.5 text-left border transition ${
                      reconStatusFilter === 'unmatched_income'
                        ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500'
                        : 'border-slate-100 bg-slate-50 hover:bg-slate-100/80'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase text-indigo-700">Inflows</span>
                    <span className="text-base font-extrabold text-indigo-900">{statementSummary.unmatched_income_count}</span>
                    <span className="text-[9px] text-indigo-600 font-medium">Customer credits</span>
                  </button>

                  {/* 6. Duplicates */}
                  <button
                    type="button"
                    onClick={() => setReconStatusFilter(reconStatusFilter === 'duplicate' ? 'all' : 'duplicate')}
                    className={`flex flex-col rounded-xl p-2.5 text-left border transition ${
                      reconStatusFilter === 'duplicate'
                        ? 'border-rose-500 bg-rose-50/70 ring-1 ring-rose-500'
                        : 'border-slate-100 bg-slate-50 hover:bg-slate-100/80'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase text-rose-700">Duplicates</span>
                    <span className="text-base font-extrabold text-rose-900">{statementSummary.duplicates_count}</span>
                    <span className="text-[9px] text-rose-600 font-medium">Fingerprint match</span>
                  </button>

                  {/* 7. Transfer Pending */}
                  <button
                    type="button"
                    onClick={() => setReconStatusFilter(reconStatusFilter === 'transfer' ? 'all' : 'transfer')}
                    className={`flex flex-col rounded-xl p-2.5 text-left border transition ${
                      reconStatusFilter === 'transfer'
                        ? 'border-sky-500 bg-sky-50/70 ring-1 ring-sky-500'
                        : 'border-slate-100 bg-slate-50 hover:bg-slate-100/80'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase text-sky-700">Own Transfers</span>
                    <span className="text-base font-extrabold text-sky-900">{statementSummary.transfer_pending_count}</span>
                    <span className="text-[9px] text-sky-600 font-medium">Inter-account</span>
                  </button>

                  {/* 8. Ignored */}
                  <button
                    type="button"
                    onClick={() => setReconStatusFilter(reconStatusFilter === 'ignored' ? 'all' : 'ignored')}
                    className={`flex flex-col rounded-xl p-2.5 text-left border transition ${
                      reconStatusFilter === 'ignored'
                        ? 'border-slate-500 bg-slate-100 ring-1 ring-slate-500'
                        : 'border-slate-100 bg-slate-50 hover:bg-slate-100/80'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase text-slate-700">Ignored</span>
                    <span className="text-base font-extrabold text-slate-800">{statementSummary.ignored_count}</span>
                    <span className="text-[9px] text-slate-500 font-medium">With audit reason</span>
                  </button>
                </div>
              </div>
            )}

            {/* Detailed Filter Bar for Pending Statement Transactions */}
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Flow Direction Pills */}
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    {[
                      { id: 'all', label: 'All Items' },
                      { id: 'inward', label: '+ Received (Credits)' },
                      { id: 'outward', label: '- Sent (Debits)' },
                    ].map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setReconDirectionFilter(pill.id as any)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                          reconDirectionFilter === pill.id
                            ? 'bg-white text-indigo-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>

                  {/* Status Filter Pills */}
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    {[
                      { id: 'all', label: 'All Statuses' },
                      { id: 'draft', label: 'AI Expense Drafts' },
                      { id: 'review', label: 'Needs Review' },
                      { id: 'matched', label: 'Matched' },
                      { id: 'unmatched_income', label: 'Inflows' },
                      { id: 'duplicate', label: 'Duplicates' },
                      { id: 'transfer', label: 'Transfers' },
                      { id: 'ignored', label: 'Ignored' },
                    ].map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setReconStatusFilter(pill.id)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                          reconStatusFilter === pill.id
                            ? 'bg-white text-indigo-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>

                  {/* Confidence filter */}
                  <select
                    value={reconConfidenceFilter}
                    onChange={(e) => setReconConfidenceFilter(e.target.value as any)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    <option value="all">All Confidence Scores</option>
                    <option value="high">High Confidence (≥ 90%)</option>
                    <option value="medium">Medium Match (70% - 89%)</option>
                    <option value="low">Unmatched / Review Needed (&lt; 70%)</option>
                  </select>

                  {/* Channel filter */}
                  <select
                    value={reconMethodFilter}
                    onChange={(e) => setReconMethodFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                  >
                    <option value="all">All Channels</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                    <option value="cheque">Cheque</option>
                    <option value="charges">Fees & Charges</option>
                  </select>

                  {/* Search */}
                  <div className="relative w-56">
                    <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={reconSearch}
                      onChange={(e) => setReconSearch(e.target.value)}
                      placeholder="Search narration, UTR, ref..."
                      className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-xs text-slate-700"
                    />
                  </div>

                  {/* Toggle more filters */}
                  <button
                    type="button"
                    onClick={() => setShowDetailedReconFilters(!showDetailedReconFilters)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      showDetailedReconFilters || activeReconFiltersCount > 0
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Amounts & Dates
                    {activeReconFiltersCount > 0 && (
                      <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                        {activeReconFiltersCount}
                      </span>
                    )}
                  </button>

                  {activeReconFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={clearReconFilters}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reset
                    </button>
                  )}
                </div>

                <div className="text-xs font-semibold text-slate-500">
                  Showing <strong className="text-slate-900">{filteredReconSuggestions.length}</strong> of {reconSuggestions.length} items
                </div>
              </div>

              {/* Expandable amounts and dates */}
              {showDetailedReconFilters && (
                <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400">Statement Date From</label>
                    <input
                      type="date"
                      value={reconDateFrom}
                      onChange={(e) => setReconDateFrom(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400">Statement Date To</label>
                    <input
                      type="date"
                      value={reconDateTo}
                      onChange={(e) => setReconDateTo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400">Min Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="Min ₹"
                      value={reconMinAmount}
                      onChange={(e) => setReconMinAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400">Max Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="Max ₹"
                      value={reconMaxAmount}
                      onChange={(e) => setReconMaxAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Unmatched Statement Rows with Matching Cards */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Pending Reconciliation Queue ({filteredReconSuggestions.length} items matching filter)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Supports Payment Received (Credits) and Sent (Debits) via UPI, Bank Transfer, NEFT, Cheque
                  </p>
                </div>
              </div>

              {filteredReconSuggestions.map((item) => {
                const stmt = item.statement_transaction;
                const match = item.suggested_match || (item as any).suggested_payment;
                const score = item.confidence_score ?? (item as any).confidence ?? 0;
                const isDebit = Number(stmt.debit) > 0;
                const amt = isDebit ? stmt.debit : stmt.credit;
                const aiAnalysis = activeAiAnalysis[stmt.id];

                return (
                  <div key={stmt.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
                      {/* Left: Statement Item (5 cols) */}
                      <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900">{stmt.transaction_date}</span>
                            {/* Row Status Badge */}
                            {(stmt.status === 'expense_draft_created' || (stmt as any).expense_draft) ? (
                              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 flex items-center gap-1">
                                <Sparkles className="h-2.5 w-2.5" />
                                Draft Created
                              </span>
                            ) : stmt.status === 'duplicate' ? (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 flex items-center gap-1">
                                <AlertCircle className="h-2.5 w-2.5" />
                                Duplicate
                              </span>
                            ) : stmt.status === 'transfer_pending' ? (
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 flex items-center gap-1">
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                Transfer
                              </span>
                            ) : stmt.status === 'ignored' || stmt.reconciliation_status === 'ignored' ? (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 flex items-center gap-1">
                                <Ban className="h-2.5 w-2.5" />
                                Ignored
                              </span>
                            ) : stmt.status === 'matched' || stmt.reconciliation_status === 'matched' ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                Matched
                              </span>
                            ) : stmt.status === 'unmatched_income' ? (
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                Inflow
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                Needs Review
                              </span>
                            )}
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isDebit ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {isDebit ? 'Payment Sent (Debit)' : 'Payment Received (Credit)'}
                          </span>
                        </div>
                        <p className="mt-2 text-xs font-medium text-slate-800 break-words">
                          {stmt.description}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-mono text-[11px] flex items-center gap-1">
                            Ref/UTR: <strong className="text-slate-800">{stmt.reference_no || 'None'}</strong>
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            {currencyFmt(amt)}
                          </span>
                        </div>

                        {/* Action buttons on the statement item */}
                        <div className="mt-3 border-t border-slate-200 pt-2 flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleAiAnalyze(stmt.id)}
                            disabled={analyzingAiRowId === stmt.id}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 hover:text-purple-800"
                          >
                            <Sparkles className="h-3 w-3" />
                            {analyzingAiRowId === stmt.id ? 'Analyzing...' : 'Analyze with AI'}
                          </button>

                          {/* Quick Record & Match Button */}
                          <button
                            type="button"
                            onClick={() => {
                              const isUpi = /upi/i.test(stmt.description);
                              setQuickRecordData({
                                statement_transaction_id: stmt.id,
                                statement_description: stmt.description,
                                amount: Number(amt),
                                payment_direction: isDebit ? 'outward' : 'inward',
                                payment_method: isUpi ? 'upi' : 'bank_transfer',
                                transaction_date: stmt.transaction_date || new Date().toISOString().slice(0, 10),
                                reference_no: stmt.reference_no || '',
                                customer_name: '',
                                remarks: stmt.description,
                              });
                              setShowQuickRecordModal(true);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            <CreditCard className="h-3 w-3" />
                            + Record & Reconcile
                          </button>

                          {/* Quick create adjustment for bank charges */}
                          {isDebit && (
                            <button
                              type="button"
                              onClick={() => handleCreateAdjustmentFromStatement(stmt.id, Number(amt), stmt.description)}
                              disabled={processingActionId === stmt.id}
                              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                            >
                              Fee / Charge
                            </button>
                          )}

                          {/* Ignore / Unignore Action */}
                          {stmt.status === 'ignored' || stmt.reconciliation_status === 'ignored' ? (
                            <button
                              type="button"
                              onClick={() => handleUnignoreTransaction(stmt.id)}
                              disabled={processingActionId === stmt.id}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                            >
                              <RotateCw className="h-3 w-3" />
                              Un-ignore
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIgnoringTxn({
                                id: stmt.id,
                                description: stmt.description,
                                amount: Number(amt),
                                reason: '',
                              })}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700"
                            >
                              <Ban className="h-3 w-3" />
                              Ignore
                            </button>
                          )}
                        </div>

                        {/* AI Analysis Result Card */}
                        {aiAnalysis && (
                          <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900">
                            <div className="flex items-center gap-1.5 font-bold">
                              <Cpu className="h-3.5 w-3.5 text-purple-600" />
                              <span>Gemini Indian Banking Interpretation</span>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-purple-800">
                              {aiAnalysis.ai_reasoning || aiAnalysis.explanation || 'Analyzed statement narration.'}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                              {aiAnalysis.channel && (
                                <span className="rounded bg-purple-200/70 px-1.5 py-0.5 font-bold">
                                  Channel: {String(aiAnalysis.channel).toUpperCase()}
                                </span>
                              )}
                              {aiAnalysis.suggested_category && (
                                <span className="rounded bg-purple-200/70 px-1.5 py-0.5 font-bold">
                                  Category: {String(aiAnalysis.suggested_category).replace(/_/g, ' ').toUpperCase()}
                                </span>
                              )}
                              {aiAnalysis.counterparty_name && (
                                <span className="rounded bg-purple-200/70 px-1.5 py-0.5">
                                  Counterparty: {aiAnalysis.counterparty_name}
                                </span>
                              )}
                              {(aiAnalysis.reference_number || aiAnalysis.extracted_utr) && (
                                <span className="rounded bg-purple-200/70 px-1.5 py-0.5 font-mono">
                                  Ref: {aiAnalysis.reference_number || aiAnalysis.extracted_utr}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Middle: Match Status & Score (2 cols) */}
                      <div className="lg:col-span-2 flex flex-col items-center justify-center p-2 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                          score >= 95
                            ? 'bg-emerald-100 text-emerald-800'
                            : score >= 80
                            ? 'bg-blue-100 text-blue-800'
                            : score > 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {score}% Match
                        </span>
                        <span className="mt-1 text-[11px] font-semibold text-slate-500">
                          {(item.match_rule || (item as any).match_type || 'unmatched').replace(/_/g, ' ')}
                        </span>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {item.reasoning || (item as any).reason || 'No candidate ERP payment found.'}
                        </p>
                      </div>

                      {/* Right: ERP Candidate Match (5 cols) */}
                      <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4">
                        {match ? (
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900">
                                ERP Payment #{match.id} ({match.transaction_date || match.payment_date})
                              </span>
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                {String(match.payment_method || 'payment').toUpperCase()} &bull; {String(match.payment_direction || 'inward').toUpperCase()}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-slate-600">
                              Ref: <span className="font-mono">{match.reference_no || 'None'}</span> &bull; Invoice:{' '}
                              <strong>{match.invoice?.invoice_no || 'N/A'}</strong>
                            </p>
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="text-slate-500">
                                Status: <strong>{match.status}</strong>
                              </span>
                              <span className="text-sm font-bold text-indigo-600">
                                {currencyFmt(match.amount)}
                              </span>
                            </div>

                            {canManageReconciliation && (
                              <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmMatch(stmt.id, match.id)}
                                  disabled={processingActionId === stmt.id}
                                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Confirm Match
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (stmt.status === 'expense_draft_created' || (stmt as any).expense_draft) ? (
                          /* AI Missing Expense Draft Card */
                          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                                <Sparkles className="h-4 w-4 text-purple-600" />
                                AI Missing Expense Draft
                              </span>
                              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-extrabold text-purple-700">
                                Unposted Draft
                              </span>
                            </div>

                            {(() => {
                              const draft = (stmt as any).expense_draft;
                              const draftCategory = draft?.category || (item as any).suggested_category || 'Bank Charges';
                              const draftVendor = draft?.counterparty || (item as any).suggested_vendor || 'Auto-Detected Vendor';
                              const draftNotes = draft?.notes || item.reasoning || 'Auto-generated expense draft based on bank description.';

                              return (
                                <div className="mt-2.5 space-y-2">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Category:</span>
                                    <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-purple-200">
                                      {draftCategory}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Vendor / Payee:</span>
                                    <span className="font-semibold text-slate-800">
                                      {draftVendor}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Proposed Amount:</span>
                                    <span className="font-extrabold text-purple-800">
                                      {currencyFmt(draft?.amount || amt)}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-purple-800 bg-purple-100/60 p-2 rounded leading-relaxed">
                                    {draftNotes}
                                  </p>

                                  {canManageReconciliation && (
                                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-purple-200 pt-3">
                                      <button
                                        type="button"
                                        onClick={() => handleRejectExpenseDraft(stmt.id)}
                                        disabled={processingActionId === stmt.id}
                                        className="rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                      >
                                        Reject Draft
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingDraftData({
                                            statementTxnId: stmt.id,
                                            description: stmt.description,
                                            category: draftCategory,
                                            counterparty: draftVendor,
                                            amount: Number(draft?.amount || amt),
                                            notes: draftNotes,
                                          });
                                          setShowEditDraftModal(true);
                                        }}
                                        disabled={processingActionId === stmt.id}
                                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                                      >
                                        <Edit3 className="h-3.5 w-3.5" />
                                        Edit Draft
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleApproveExpenseDraft(stmt.id, rememberRuleOnApprove)}
                                        disabled={processingActionId === stmt.id}
                                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Approve & Post to Ledger
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : stmt.status === 'transfer_pending' ? (
                          /* Internal Transfer Pending Card */
                          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                            <div className="flex items-center gap-2 text-sky-900 font-bold text-xs">
                              <ArrowRightLeft className="h-4 w-4 text-sky-600" />
                              <span>Internal Account Transfer Detected</span>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-sky-800">
                              This debit appears to be an internal funds transfer to another company account.
                              Under strict ERP accounting rules, <strong>no duplicate expense is created</strong>.
                            </p>
                            <p className="mt-2 font-mono text-[11px] text-sky-700">
                              {item.reasoning || 'Matched with own company account patterns.'}
                            </p>
                          </div>
                        ) : stmt.status === 'duplicate' ? (
                          /* Potential Duplicate Alert Card */
                          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                            <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                              <AlertCircle className="h-4 w-4 text-rose-600" />
                              <span>Potential Duplicate Transaction</span>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-rose-800">
                              An identical transaction fingerprint was detected in another statement or existing ledger entry.
                              Verify whether this is a duplicate before reconciling.
                            </p>
                          </div>
                        ) : stmt.status === 'ignored' || stmt.reconciliation_status === 'ignored' ? (
                          /* Ignored Transaction Card */
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                <Ban className="h-4 w-4 text-slate-500" />
                                Excluded from Reconciliation
                              </span>
                              <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                Ignored
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-slate-600">
                              Reason: <em>{(stmt as any).ignore_reason || 'Documented by user'}</em>
                            </p>
                            {canManageReconciliation && (
                              <button
                                type="button"
                                onClick={() => handleUnignoreTransaction(stmt.id)}
                                className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                              >
                                Restore to Queue
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="py-6 text-center text-slate-400">
                            <p className="text-xs font-medium">No candidate ERP payment found</p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              Use <strong>+ Record & Reconcile</strong> or <strong>Fee / Charge</strong> above, or run <strong>Reconcile Entire Statement</strong>.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {reconSuggestions.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                  <p className="mt-2 text-sm font-bold text-slate-900">All Statement Items Reconciled</p>
                  <p className="text-xs text-slate-400">
                    No pending unmatched statement transactions for this account/statement batch.
                  </p>
                </div>
              )}
            </div>

              {filteredReconSuggestions.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                  <p className="mt-2 text-sm font-bold text-slate-800">No unmatched items match your filters</p>
                  <p className="text-xs text-slate-400">Try adjusting your direction, confidence, or search criteria.</p>
                  {activeReconFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={clearReconFilters}
                      className="mt-3 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              )}

            {/* Recently Reconciled Audit Trail with Unmatch Action */}
            {recentReconciled.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Recently Reconciled Items</h3>
                  <span className="text-xs text-slate-400">Safe unmatch reverses both payment and statement status</span>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Narration</th>
                        <th className="px-3 py-2">Reference</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Matched ERP Payment</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {recentReconciled.map((r) => {
                        const amt = Number(r.debit) > 0 ? r.debit : r.credit;
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/50">
                            <td className="whitespace-nowrap px-3 py-2 font-medium">{r.transaction_date}</td>
                            <td className="max-w-xs truncate px-3 py-2">{r.description}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">{r.reference_no || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-bold">{currencyFmt(amt)}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {r.matched_payment ? `#${r.matched_payment.id} (${r.matched_payment.reference_no || 'No ref'})` : 'Adjustment'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              {canManageReconciliation && (
                                <button
                                  type="button"
                                  onClick={() => handleUnmatch(r.id)}
                                  disabled={processingActionId === r.id}
                                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                                >
                                  Unmatch
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 7: LEARNED AI RECONCILIATION RULES & MEMORY
           ========================================================================= */}
        {activeTab === 'rules' && (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-purple-50 p-2 text-purple-700">
                      <Brain className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Learned Reconciliation Rules & AI Memory
                      </h3>
                      <p className="text-xs text-slate-500">
                        Deterministic matching rules learned from confirmed reconciliations and manual entries.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadRules}
                    disabled={loadingRules}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingRules ? 'animate-spin' : ''}`} />
                    Refresh Rules
                  </button>
                  {canManageRules && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRuleId(null);
                        setRuleFormData({
                          rule_name: '',
                          pattern_type: 'contains',
                          pattern_value: '',
                          action: 'create_expense_draft',
                          category: 'Bank Charges',
                          vendor_name: '',
                          confidence_score: 95,
                          notes: '',
                        });
                        setShowRuleModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                    >
                      <Plus className="h-4 w-4" />
                      New Matching Rule
                    </button>
                  )}
                </div>
              </div>

              {/* Stats Bar */}
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Total Rules Active</span>
                  <p className="text-lg font-extrabold text-slate-900">
                    {rulesList.filter((r) => r.is_active).length} / {rulesList.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Times Applied</span>
                  <p className="text-lg font-extrabold text-indigo-600">
                    {rulesList.reduce((acc, r) => acc + (r.times_used || 0), 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-500">AI Learned from Users</span>
                  <p className="text-lg font-extrabold text-purple-600">
                    {rulesList.filter((r) => r.source === 'learned').length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Manual Rules</span>
                  <p className="text-lg font-extrabold text-slate-700">
                    {rulesList.filter((r) => r.source === 'manual').length}
                  </p>
                </div>
              </div>
            </div>

            {/* Rules Table */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 pb-3 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-64">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={ruleSearch}
                    onChange={(e) => setRuleSearch(e.target.value)}
                    placeholder="Search pattern, vendor, category..."
                    className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-xs text-slate-700"
                  />
                </div>
                <span className="text-xs text-slate-400">
                  Tenant scoped: Rules only match transactions within your company.
                </span>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Rule Name & Pattern</th>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">Action & Category</th>
                      <th className="px-3 py-2.5">Target Vendor</th>
                      <th className="px-3 py-2.5 text-center">Confidence</th>
                      <th className="px-3 py-2.5 text-center">Usage</th>
                      <th className="px-3 py-2.5">Source</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {rulesList
                      .filter((r) => {
                        if (!ruleSearch.trim()) return true;
                        const q = ruleSearch.toLowerCase();
                        return (
                          (r.rule_name || '').toLowerCase().includes(q) ||
                          (r.pattern_value || '').toLowerCase().includes(q) ||
                          (r.category || '').toLowerCase().includes(q) ||
                          (r.vendor_name || '').toLowerCase().includes(q)
                        );
                      })
                      .map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2.5 font-medium">
                            <div className="font-semibold text-slate-900">{r.rule_name}</div>
                            <code className="text-[11px] text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded font-mono">
                              {r.pattern_value}
                            </code>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 uppercase">
                              {r.pattern_type}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="font-semibold text-slate-800">
                              {r.category || 'N/A'}
                            </div>
                            <span className="text-[10px] text-slate-400 capitalize">
                              {r.action.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {r.vendor_name || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              {r.confidence_score}%
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold whitespace-nowrap">
                            {r.times_used}x
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              r.source === 'learned'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {r.source === 'learned' ? 'AI Learned' : 'Manual'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            {canManageRules ? (
                              <button
                                type="button"
                                onClick={() => handleToggleRule(r.id)}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                                  r.is_active
                                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                }`}
                              >
                                {r.is_active ? 'Active' : 'Disabled'}
                              </button>
                            ) : (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                r.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {r.is_active ? 'Active' : 'Disabled'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {canManageRules && (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRuleId(r.id);
                                    setRuleFormData({
                                      rule_name: r.rule_name,
                                      pattern_type: r.pattern_type,
                                      pattern_value: r.pattern_value,
                                      action: r.action,
                                      category: r.category || 'Bank Charges',
                                      vendor_name: r.vendor_name || '',
                                      confidence_score: r.confidence_score,
                                      notes: r.notes || '',
                                    });
                                    setShowRuleModal(true);
                                  }}
                                  className="text-slate-500 hover:text-indigo-600"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRule(r.id)}
                                  className="text-slate-400 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    {rulesList.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          <Brain className="mx-auto h-6 w-6 text-slate-300" />
                          <p className="mt-1 font-medium">No rules learned yet</p>
                          <p className="text-[11px] text-slate-400">
                            Confirm reconciliation matches or create a rule above to build the system memory.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL: QUICK RECORD PAYMENT & RECONCILE (UPI / BANK TRANSFER)
         ========================================================================= */}
      {showQuickRecordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                  <CreditCard className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Record Payment & Reconcile</h3>
                  <p className="text-[11px] text-slate-400">
                    {quickRecordData.payment_direction === 'inward' ? 'Payment Received (Customer / Inflow)' : 'Payment Sent (Vendor / Outflow)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickRecordModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleQuickRecordPayment} className="mt-4 space-y-3">
              <div className="rounded-xl bg-slate-50 p-3 text-xs">
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Statement Amount:</span>
                  <span className={quickRecordData.payment_direction === 'inward' ? 'text-emerald-700' : 'text-rose-700'}>
                    {currencyFmt(quickRecordData.amount)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 truncate" title={quickRecordData.statement_description}>
                  {quickRecordData.statement_description}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Payment Direction</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickRecordData((p) => ({ ...p, payment_direction: 'inward' }))}
                    className={`rounded-lg border p-2 text-center text-xs font-bold ${
                      quickRecordData.payment_direction === 'inward'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Payment Received (Inward)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickRecordData((p) => ({ ...p, payment_direction: 'outward' }))}
                    className={`rounded-lg border p-2 text-center text-xs font-bold ${
                      quickRecordData.payment_direction === 'outward'
                        ? 'border-rose-500 bg-rose-50 text-rose-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Payment Sent (Outward)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Transaction Date *</label>
                  <input
                    type="date"
                    value={quickRecordData.transaction_date}
                    onChange={(e) => setQuickRecordData((p) => ({ ...p, transaction_date: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Payment Method</label>
                  <select
                    value={quickRecordData.payment_method}
                    onChange={(e) => setQuickRecordData((p) => ({ ...p, payment_method: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-medium"
                  >
                    <option value="upi">UPI (GPay / PhonePe / Paytm / BHIM)</option>
                    <option value="bank_transfer">Bank Transfer (IMPS / NEFT / RTGS)</option>
                    <option value="cheque">Cheque</option>
                    <option value="cash">Cash</option>
                    <option value="card">Debit / Credit Card</option>
                    <option value="other">Other Method</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Reference / UTR Number</label>
                <input
                  type="text"
                  value={quickRecordData.reference_no}
                  onChange={(e) => setQuickRecordData((p) => ({ ...p, reference_no: e.target.value }))}
                  placeholder="e.g. 12-digit UPI UTR or Cheque No"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">
                  {quickRecordData.payment_direction === 'outward'
                    ? 'Vendor / Payee Name'
                    : 'Customer / Payer Name'}
                </label>
                <input
                  type="text"
                  value={quickRecordData.customer_name}
                  onChange={(e) => setQuickRecordData((p) => ({ ...p, customer_name: e.target.value }))}
                  placeholder={
                    quickRecordData.payment_direction === 'outward'
                      ? 'e.g. Supplier Pvt Ltd / Landlord / Vendor'
                      : 'e.g. Amit Kumar / Client Corp'
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Remarks / Ledger Note</label>
                <input
                  type="text"
                  value={quickRecordData.remarks}
                  onChange={(e) => setQuickRecordData((p) => ({ ...p, remarks: e.target.value }))}
                  placeholder="e.g. Settlement for invoice"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowQuickRecordModal(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save & Reconcile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: ADD / EDIT BANK ACCOUNT OR CASH DRAWER
         ========================================================================= */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingAccount ? 'Edit Account' : 'New Bank Account / Cash Drawer'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAccountModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-semibold text-slate-700">Account Type</label>
                  <select
                    value={accountFormData.account_type}
                    onChange={(e) => setAccountFormData((p) => ({ ...p, account_type: e.target.value as 'bank' | 'cash' }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-medium"
                    required
                  >
                    <option value="bank">Bank Account</option>
                    <option value="cash">Cash In Hand / Till</option>
                  </select>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-semibold text-slate-700">Account Name</label>
                  <input
                    type="text"
                    value={accountFormData.account_name}
                    onChange={(e) => setAccountFormData((p) => ({ ...p, account_name: e.target.value }))}
                    placeholder="e.g. HDFC Operating Current A/C"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                    required
                  />
                </div>
              </div>

              {accountFormData.account_type === 'bank' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Bank Name</label>
                      <input
                        type="text"
                        value={accountFormData.bank_name}
                        onChange={(e) => setAccountFormData((p) => ({ ...p, bank_name: e.target.value }))}
                        placeholder="e.g. HDFC Bank Ltd"
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Account Number</label>
                      <input
                        type="text"
                        value={accountFormData.account_number}
                        onChange={(e) => setAccountFormData((p) => ({ ...p, account_number: e.target.value }))}
                        placeholder="e.g. 50200012345678"
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">IFSC Code</label>
                      <input
                        type="text"
                        value={accountFormData.ifsc_code}
                        onChange={(e) => setAccountFormData((p) => ({ ...p, ifsc_code: (e.target.value || '').toUpperCase() }))}
                        placeholder="e.g. HDFC0001234"
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Branch Name</label>
                      <input
                        type="text"
                        value={accountFormData.branch_name}
                        onChange={(e) => setAccountFormData((p) => ({ ...p, branch_name: e.target.value }))}
                        placeholder="e.g. Connaught Place"
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                      />
                    </div>
                  </div>
                </>
              )}

              {!editingAccount && (
                <div>
                  <label className="text-xs font-semibold text-slate-700">Opening Balance (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={accountFormData.opening_balance}
                    onChange={(e) => setAccountFormData((p) => ({ ...p, opening_balance: parseFloat(e.target.value) || 0 }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Will automatically post an initial opening deposit to the ledger.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={accountFormData.is_default}
                  onChange={(e) => setAccountFormData((p) => ({ ...p, is_default: e.target.checked }))}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <label htmlFor="is_default" className="text-xs font-medium text-slate-700">
                  Set as default account for payments
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAccountModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  {editingAccount ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: INTERNAL INTER-ACCOUNT TRANSFER
         ========================================================================= */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Transfer Funds Between Accounts</h3>
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Source Account (Outflow)</label>
                <select
                  value={transferFormData.source_account_id}
                  onChange={(e) => setTransferFormData((p) => ({ ...p, source_account_id: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-medium"
                  required
                >
                  <option value={0}>Select source account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_name} ({currencyFmt(a.current_balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Destination Account (Inflow)</label>
                <select
                  value={transferFormData.destination_account_id}
                  onChange={(e) => setTransferFormData((p) => ({ ...p, destination_account_id: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-medium"
                  required
                >
                  <option value={0}>Select destination account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_name} ({currencyFmt(a.current_balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={transferFormData.amount}
                    onChange={(e) => setTransferFormData((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Transfer Date</label>
                  <input
                    type="date"
                    value={transferFormData.transaction_date}
                    onChange={(e) => setTransferFormData((p) => ({ ...p, transaction_date: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Reference / Cheque / UTR No</label>
                <input
                  type="text"
                  value={transferFormData.reference_no}
                  onChange={(e) => setTransferFormData((p) => ({ ...p, reference_no: e.target.value }))}
                  placeholder="e.g. TRF-20250101-01"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Description</label>
                <input
                  type="text"
                  value={transferFormData.description}
                  onChange={(e) => setTransferFormData((p) => ({ ...p, description: e.target.value }))}
                  placeholder="e.g. Cash deposit to HDFC bank account"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  Execute Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: ADJUSTMENT / BANK CHARGES
         ========================================================================= */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Record Adjustment / Bank Charge</h3>
              <button
                type="button"
                onClick={() => setShowAdjustmentModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteAdjustment} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Account</label>
                <select
                  value={adjustmentFormData.bank_account_id}
                  onChange={(e) => setAdjustmentFormData((p) => ({ ...p, bank_account_id: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-medium"
                  required
                >
                  <option value={0}>Select account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Transaction Type</label>
                <select
                  value={adjustmentFormData.transaction_type}
                  onChange={(e) => setAdjustmentFormData((p) => ({ ...p, transaction_type: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                >
                  <option value="bank_charges">Bank Charges (Outflow)</option>
                  <option value="interest">Interest Earned (Inflow)</option>
                  <option value="adjustment">General Adjustment</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={adjustmentFormData.amount}
                    onChange={(e) => setAdjustmentFormData((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Date</label>
                  <input
                    type="date"
                    value={adjustmentFormData.transaction_date}
                    onChange={(e) => setAdjustmentFormData((p) => ({ ...p, transaction_date: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Description</label>
                <input
                  type="text"
                  value={adjustmentFormData.description}
                  onChange={(e) => setAdjustmentFormData((p) => ({ ...p, description: e.target.value }))}
                  placeholder="e.g. Annual debit card fees"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  Record Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: EDIT AI EXPENSE DRAFT DETAILS
         ========================================================================= */}
      {showEditDraftModal && editingDraftData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-purple-50 p-2 text-purple-700">
                  <Edit3 className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit AI Expense Draft</h3>
                  <p className="text-[11px] text-slate-400">Refine category and vendor before posting to financial entries</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditDraftModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditExpenseDraftSubmit} className="mt-4 space-y-3">
              <div className="rounded-xl bg-slate-50 p-3 text-xs">
                <span className="font-bold text-slate-700">Statement Narration:</span>
                <p className="mt-1 font-mono text-[11px] text-slate-600 break-words">{editingDraftData.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Expense Category</label>
                  <input
                    type="text"
                    value={editingDraftData.category}
                    onChange={(e) => setEditingDraftData({ ...editingDraftData, category: e.target.value })}
                    placeholder="e.g. Electricity, Bank Charges, Shop Rent"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Vendor / Payee Name</label>
                  <input
                    type="text"
                    value={editingDraftData.counterparty}
                    onChange={(e) => setEditingDraftData({ ...editingDraftData, counterparty: e.target.value })}
                    placeholder="e.g. State Bank of India, BESCOM"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingDraftData.amount}
                  onChange={(e) => setEditingDraftData({ ...editingDraftData, amount: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Accounting Purpose / Notes</label>
                <textarea
                  value={editingDraftData.notes}
                  onChange={(e) => setEditingDraftData({ ...editingDraftData, notes: e.target.value })}
                  placeholder="Business rationale for expense deduction"
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditDraftModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                >
                  Save Draft Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: IGNORE STATEMENT ROW (WITH AUDIT REASON)
         ========================================================================= */}
      {showIgnoreModal && ignoringTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-rose-50 p-2 text-rose-700">
                  <Ban className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Ignore Transaction</h3>
                  <p className="text-[11px] text-slate-400">Document why this bank row is excluded from reconciliation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIgnoreModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleIgnoreTransactionSubmit} className="mt-4 space-y-3">
              <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                <div className="flex justify-between font-bold">
                  <span>Amount:</span>
                  <span>{currencyFmt(ignoringTxn.amount)}</span>
                </div>
                <p className="font-mono text-[11px] text-slate-600 truncate">{ignoringTxn.description}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Reason for Ignoring *</label>
                <select
                  onChange={(e) => {
                    if (e.target.value !== 'other') {
                      setIgnoringTxn({ ...ignoringTxn, reason: e.target.value });
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                >
                  <option value="">Select common reason...</option>
                  <option value="Personal draw / owner withdrawal not recorded as expense">Owner draw / personal expense</option>
                  <option value="Opening balance adjustment already accounted for">Prior period opening balance</option>
                  <option value="Reversal of earlier erroneous transaction">Bank reversal / corrected error</option>
                  <option value="Non-operating capital infusion">Non-operating capital item</option>
                  <option value="other">Other custom reason...</option>
                </select>
                <textarea
                  value={ignoringTxn.reason}
                  onChange={(e) => setIgnoringTxn({ ...ignoringTxn, reason: e.target.value })}
                  placeholder="Enter audit explanation for auditors..."
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowIgnoreModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !ignoringTxn.reason.trim()}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                >
                  Confirm & Ignore Row
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CREATE / EDIT RECONCILIATION RULE
         ========================================================================= */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
                  <BookOpen className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingRuleId ? 'Edit Reconciliation Rule' : 'New Reconciliation Rule'}
                  </h3>
                  <p className="text-[11px] text-slate-400">Company-scoped deterministic rule for bank statements</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRuleModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Rule Name *</label>
                <input
                  type="text"
                  value={ruleFormData.rule_name}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, rule_name: e.target.value })}
                  placeholder="e.g. BESCOM Electricity Auto-Match"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Pattern Match Type</label>
                  <select
                    value={ruleFormData.pattern_type}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, pattern_type: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  >
                    <option value="contains">Contains Substring</option>
                    <option value="upi_vpa">UPI VPA Token</option>
                    <option value="starts_with">Starts With</option>
                    <option value="exact">Exact Match</option>
                    <option value="regex">Regular Expression (Regex)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Pattern Value *</label>
                  <input
                    type="text"
                    value={ruleFormData.pattern_value}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, pattern_value: e.target.value })}
                    placeholder="e.g. BESCOM or merchant@upi"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Action</label>
                  <select
                    value={ruleFormData.action}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, action: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  >
                    <option value="create_expense_draft">Create Expense Draft</option>
                    <option value="categorize_expense">Categorize Expense</option>
                    <option value="match_vendor">Match Vendor</option>
                    <option value="ignore">Ignore Transaction</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Target Category</label>
                  <input
                    type="text"
                    value={ruleFormData.category}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, category: e.target.value })}
                    placeholder="e.g. Electricity, Bank Charges, Fuel"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Vendor / Payee Name</label>
                  <input
                    type="text"
                    value={ruleFormData.vendor_name}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, vendor_name: e.target.value })}
                    placeholder="e.g. BESCOM Bangalore"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Confidence Score (%)</label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={ruleFormData.confidence_score}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, confidence_score: Number(e.target.value) || 95 })}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Notes & Internal Memo</label>
                <textarea
                  value={ruleFormData.notes}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, notes: e.target.value })}
                  placeholder="Notes for accounting team"
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {editingRuleId ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankCashPage;
