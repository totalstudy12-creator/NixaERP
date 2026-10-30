<?php

namespace Tests\Feature;

use App\Models\BankAccount;
use App\Models\BankAccountTransaction;
use App\Models\BankStatement;
use App\Models\BankStatementTransaction;
use App\Models\CashClosing;
use App\Models\Company;
use App\Models\FinancialEntry;
use App\Models\BankReconciliationRule;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class BankAndCashReconciliationTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

    protected User $user;
    protected Company $company;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create([
            'name' => 'Nixa ERP Test Enterprise',
            'code' => 'NIXA',
            'email' => 'finance@nixaerp.in',
            'phone' => '9876543210',
            'active' => true,
        ]);

        $this->user = User::factory()->create([
            'company_id' => $this->company->id,
        ]);
    }

    public function test_can_create_bank_account_and_cash_drawer(): void
    {
        $permissions = ['banking.accounts.view', 'banking.accounts.manage'];

        $res = $this->actingAsWithPermissions($this->user, $permissions)
            ->postJson('/api/banking/accounts', [
                'company_id' => $this->company->id,
                'account_name' => 'HDFC Current Operating A/C',
                'account_type' => 'bank',
                'bank_name' => 'HDFC Bank',
                'account_number' => '50200012345678',
                'ifsc_code' => 'HDFC0001234',
                'opening_balance' => 50000.00,
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.account_name', 'HDFC Current Operating A/C');

        $this->assertDatabaseHas('bank_accounts', [
            'account_name' => 'HDFC Current Operating A/C',
            'current_balance' => 50000.00,
        ]);

        // Verify initial opening balance ledger entry
        $this->assertDatabaseHas('bank_account_transactions', [
            'transaction_type' => 'deposit',
            'amount' => 50000.00,
            'running_balance' => 50000.00,
        ]);

        // Verify creating cash drawer with account_type = 'cash'
        $resCash = $this->actingAsWithPermissions($this->user, $permissions)
            ->postJson('/api/banking/accounts', [
                'company_id' => $this->company->id,
                'account_name' => 'Main Cash Counter 1',
                'account_type' => 'cash',
                'opening_balance' => 5000.00,
            ]);

        $resCash->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.account_type', 'cash')
            ->assertJsonPath('data.account_name', 'Main Cash Counter 1');
    }

    public function test_can_record_internal_transfer_between_accounts(): void
    {
        $source = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'Main Cash Drawer',
            'account_type' => 'cash_drawer',
            'opening_balance' => 25000.00,
            'current_balance' => 25000.00,
            'is_active' => true,
        ]);

        $dest = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'SBI Bank A/C',
            'account_type' => 'bank',
            'opening_balance' => 10000.00,
            'current_balance' => 10000.00,
            'is_active' => true,
        ]);

        $res = $this->actingAsWithPermissions($this->user, ['banking.transactions.manage'])
            ->postJson('/api/banking/transfers', [
                'source_account_id' => $source->id,
                'destination_account_id' => $dest->id,
                'amount' => 5000.00,
                'reference_no' => 'TRF-TEST-001',
                'description' => 'Cash deposit to SBI Bank',
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('success', true);

        $this->assertEquals(20000.00, (float) $source->fresh()->current_balance);
        $this->assertEquals(15000.00, (float) $dest->fresh()->current_balance);

        $this->assertDatabaseHas('bank_account_transactions', [
            'bank_account_id' => $source->id,
            'transaction_type' => 'transfer_out',
            'amount' => 5000.00,
            'running_balance' => 20000.00,
        ]);

        $this->assertDatabaseHas('bank_account_transactions', [
            'bank_account_id' => $dest->id,
            'transaction_type' => 'transfer_in',
            'amount' => 5000.00,
            'running_balance' => 15000.00,
        ]);
    }

    public function test_daily_cash_closing_calculates_difference_and_approves(): void
    {
        $cashAcc = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'Retail Cash Counter 1',
            'account_type' => 'cash_drawer',
            'opening_balance' => 10000.00,
            'current_balance' => 10000.00,
            'is_active' => true,
        ]);

        // Inward cash payment
        Payment::create([
            'company_id' => $this->company->id,
            'amount' => 2500.00,
            'payment_method' => 'cash',
            'payment_direction' => 'inward',
            'status' => 'completed',
            'transaction_date' => now()->toDateString(),
        ]);

        $res = $this->actingAsWithPermissions($this->user, ['banking.cash_closing.manage'])
            ->postJson('/api/banking/cash-closings', [
                'cash_account_id' => $cashAcc->id,
                'closing_date' => now()->toDateString(),
                'physical_cash_counted' => 12400.00, // Shortage of 100
                'denomination_breakdown' => ['500' => 24, '200' => 2],
                'remarks' => 'Minor cash shortage at till closing',
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.difference', '-100.00');

        $closingId = $res->json('data.id');

        // Approve shortage
        $approveRes = $this->actingAsWithPermissions($this->user, ['banking.cash_closing.approve'])
            ->postJson("/api/banking/cash-closings/{$closingId}/approve", [
                'note' => 'Shortage approved as roundoff expense',
            ]);

        $approveRes->assertOk()
            ->assertJsonPath('data.status', 'approved');
    }

    public function test_can_parse_and_upload_bank_statement_with_duplicate_guard(): void
    {
        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'HDFC Current A/C',
            'account_type' => 'bank',
            'current_balance' => 10000.00,
            'is_active' => true,
        ]);

        $csvContent = <<<CSV
Date,Narration,Chq/Ref No,Value Dt,Withdrawal Amt,Deposit Amt,Closing Balance
10/01/2025,"UPI/428901234567/PAYTM/AMIT/OKAXIS",428901234567,10/01/2025,,15000.00,25000.00
11/01/2025,"NEFT-N987654321-OFFICE RENT",N987654321,11/01/2025,8000.00,,17000.00
CSV;

        $file = UploadedFile::fake()->createWithContent('statement.csv', $csvContent);

        $res = $this->actingAsWithPermissions($this->user, ['banking.statements.upload'])
            ->postJson('/api/banking/statements/upload', [
                'bank_account_id' => $account->id,
                'statement_file' => $file,
                'bank_format' => 'hdfc',
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('statement.total_transactions', 2);

        $this->assertDatabaseHas('bank_statement_transactions', [
            'reference_no' => '428901234567',
            'credit' => 15000.00,
        ]);

        // Duplicate guard: same file content must be rejected
        $dupFile = UploadedFile::fake()->createWithContent('statement_dup.csv', $csvContent);
        $dupRes = $this->actingAsWithPermissions($this->user, ['banking.statements.upload'])
            ->postJson('/api/banking/statements/upload', [
                'bank_account_id' => $account->id,
                'statement_file' => $dupFile,
                'bank_format' => 'hdfc',
            ]);

        $dupRes->assertStatus(409)
            ->assertJsonPath('duplicate', true);
    }

    public function test_deterministic_reconciliation_exact_utr_and_amount_match(): void
    {
        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'HDFC Main Bank',
            'account_type' => 'bank',
            'current_balance' => 50000.00,
            'is_active' => true,
        ]);

        $payment = Payment::create([
            'company_id' => $this->company->id,
            'bank_account_id' => $account->id,
            'amount' => 12500.00,
            'payment_method' => 'upi',
            'payment_direction' => 'inward',
            'reference_no' => '428901234567',
            'status' => 'completed',
            'transaction_date' => '2025-01-10',
        ]);

        $stmtTxn = BankStatementTransaction::create([
            'statement_id' => 1,
            'bank_account_id' => $account->id,
            'company_id' => $this->company->id,
            'transaction_date' => '2025-01-10',
            'description' => 'UPI/428901234567/PAYTM/AMIT/OKAXIS',
            'reference_no' => '428901234567',
            'credit' => 12500.00,
            'debit' => 0.00,
            'balance' => 62500.00,
            'reconciliation_status' => 'unmatched',
        ]);

        // Test workspace suggestions
        $wsRes = $this->actingAsWithPermissions($this->user, ['banking.reconciliation.view'])
            ->getJson("/api/banking/reconciliation/{$account->id}");

        $wsRes->assertOk()
            ->assertJsonPath('success', true);

        // Auto Match execution
        $autoRes = $this->actingAsWithPermissions($this->user, ['banking.reconciliation.manage'])
            ->postJson('/api/banking/reconciliation/auto-match', [
                'bank_account_id' => $account->id,
                'confidence_threshold' => 95,
            ]);

        $autoRes->assertOk()
            ->assertJsonPath('data.reconciled_count', 1);

        $this->assertEquals('reconciled', $payment->fresh()->status);
        $this->assertEquals('matched', $stmtTxn->fresh()->reconciliation_status);
        $this->assertEquals($payment->id, $stmtTxn->fresh()->matched_payment_id);
    }

    public function test_unmatch_reverses_reconciliation_safely(): void
    {
        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'Bank A/C',
            'account_type' => 'bank',
            'current_balance' => 10000.00,
            'is_active' => true,
        ]);

        $payment = Payment::create([
            'company_id' => $this->company->id,
            'bank_account_id' => $account->id,
            'amount' => 5000.00,
            'payment_method' => 'bank_transfer',
            'payment_direction' => 'inward',
            'status' => 'reconciled',
            'transaction_date' => '2025-01-10',
        ]);

        $stmtTxn = BankStatementTransaction::create([
            'statement_id' => 1,
            'bank_account_id' => $account->id,
            'company_id' => $this->company->id,
            'transaction_date' => '2025-01-10',
            'description' => 'Transfer deposit',
            'credit' => 5000.00,
            'reconciliation_status' => 'matched',
            'matched_payment_id' => $payment->id,
        ]);

        $res = $this->actingAsWithPermissions($this->user, ['banking.reconciliation.manage'])
            ->postJson('/api/banking/reconciliation/unmatch', [
                'statement_transaction_id' => $stmtTxn->id,
            ]);

        $res->assertOk()
            ->assertJsonPath('success', true);

        $this->assertEquals('completed', $payment->fresh()->status);
        $this->assertEquals('unmatched', $stmtTxn->fresh()->reconciliation_status);
        $this->assertNull($stmtTxn->fresh()->matched_payment_id);
    }

    public function test_create_reconciliation_adjustment_for_bank_charges(): void
    {
        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'HDFC Current A/C',
            'account_type' => 'bank',
            'current_balance' => 20000.00,
            'is_active' => true,
        ]);

        $stmtTxn = BankStatementTransaction::create([
            'statement_id' => 1,
            'bank_account_id' => $account->id,
            'company_id' => $this->company->id,
            'transaction_date' => '2025-01-15',
            'description' => 'SMS & CONSOLIDATED CHRGS Q3',
            'debit' => 150.00,
            'credit' => 0.00,
            'reconciliation_status' => 'unmatched',
        ]);

        $res = $this->actingAsWithPermissions($this->user, ['banking.reconciliation.manage'])
            ->postJson('/api/banking/reconciliation/adjustments', [
                'statement_transaction_id' => $stmtTxn->id,
                'transaction_type' => 'bank_charges',
                'amount' => 150.00,
                'description' => 'Quarterly SMS maintenance fees',
            ]);

        $res->assertOk()
            ->assertJsonPath('success', true);

        $this->assertEquals(19850.00, (float) $account->fresh()->current_balance);
        $this->assertEquals('matched', $stmtTxn->fresh()->reconciliation_status);
        $this->assertDatabaseHas('bank_account_transactions', [
            'transaction_type' => 'bank_charges',
            'amount' => 150.00,
            'running_balance' => 19850.00,
        ]);
    }

    public function test_reconciliation_dashboard_returns_real_equation(): void
    {
        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'Primary Bank',
            'account_type' => 'bank',
            'opening_balance' => 50000.00,
            'current_balance' => 50000.00,
            'is_active' => true,
        ]);

        $res = $this->actingAsWithPermissions($this->user, ['banking.reconciliation.view'])
            ->getJson("/api/banking/reconciliation/dashboard?company_id={$this->company->id}");

        $res->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'data' => [
                    'total_bank_balance',
                    'total_cash_balance',
                    'book_balance',
                    'statement_balance',
                    'adjusted_book_balance',
                    'difference',
                    'reconciled_percentage',
                    'daily_cash_in',
                    'daily_cash_out',
                    'financial_year',
                    'fy_cash_in',
                    'fy_cash_out',
                ],
            ]);
    }

    public function test_daily_cash_summary_and_financial_year(): void
    {
        // Record cash received and paid today
        Payment::create([
            'company_id' => $this->company->id,
            'amount' => 5000.00,
            'payment_method' => 'cash',
            'payment_direction' => 'inward',
            'status' => 'completed',
            'transaction_date' => now()->toDateString(),
        ]);

        Payment::create([
            'company_id' => $this->company->id,
            'amount' => 1200.00,
            'payment_method' => 'cash',
            'payment_direction' => 'outward',
            'status' => 'completed',
            'transaction_date' => now()->toDateString(),
        ]);

        $res = $this->actingAsWithPermissions($this->user, ['banking.cash_closing.view'])
            ->getJson("/api/banking/cash-summary?company_id={$this->company->id}");

        $res->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.daily.cash_in', 5000)
            ->assertJsonPath('data.daily.cash_out', 1200)
            ->assertJsonPath('data.daily.net_cash', 3800)
            ->assertJsonStructure([
                'data' => [
                    'date',
                    'financial_year',
                    'available_financial_years',
                    'daily' => ['cash_in', 'cash_out', 'net_cash', 'upi_in', 'upi_out', 'bank_in', 'bank_out'],
                    'financial_year_totals' => ['cash_in', 'cash_out', 'net_cash'],
                    'monthly_breakdown',
                ],
            ]);
    }

    public function test_quick_create_payment_and_match(): void
    {
        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'HDFC Current A/C',
            'account_type' => 'bank',
            'current_balance' => 20000.00,
            'is_active' => true,
        ]);

        $stmtTxn = BankStatementTransaction::create([
            'statement_id' => 1,
            'bank_account_id' => $account->id,
            'company_id' => $this->company->id,
            'transaction_date' => '2025-01-20',
            'description' => 'UPI/428999888777/PAYTM/CLIENT/OKAXIS',
            'reference_no' => '428999888777',
            'credit' => 18500.00,
            'debit' => 0.00,
            'reconciliation_status' => 'unmatched',
        ]);

        $res = $this->actingAsWithPermissions($this->user, ['banking.reconciliation.manage'])
            ->postJson('/api/banking/reconciliation/quick-record', [
                'statement_transaction_id' => $stmtTxn->id,
                'payment_direction' => 'inward',
                'payment_method' => 'upi',
                'reference_no' => '428999888777',
                'remarks' => 'Direct client payment via UPI',
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('success', true);

        $this->assertEquals(38500.00, (float) $account->fresh()->current_balance);
        $this->assertEquals('matched', $stmtTxn->fresh()->reconciliation_status);
        $this->assertDatabaseHas('payments', [
            'reference_no' => '428999888777',
            'amount' => 18500.00,
            'payment_method' => 'upi',
            'payment_direction' => 'inward',
            'status' => 'reconciled',
        ]);

        // Outward payment (Vendor / Outflow) with explicit transaction_date and customer_name
        $stmtOutward = BankStatementTransaction::create([
            'statement_id' => 1,
            'bank_account_id' => $account->id,
            'company_id' => $this->company->id,
            'transaction_date' => '2026-03-25',
            'description' => 'NEFT/OUT/SUPPLIER-SETTLEMENT',
            'reference_no' => 'NEFT998811',
            'credit' => 0.00,
            'debit' => 4500.00,
            'reconciliation_status' => 'unmatched',
        ]);

        $resOutward = $this->actingAsWithPermissions($this->user, ['banking.reconciliation.manage'])
            ->postJson('/api/banking/reconciliation/quick-record', [
                'statement_transaction_id' => $stmtOutward->id,
                'payment_direction' => 'outward',
                'payment_method' => 'bank_transfer',
                'transaction_date' => '2026-03-25',
                'reference_no' => 'NEFT998811',
                'customer_name' => 'Apex Logistics Services Pvt Ltd',
                'remarks' => 'Freight vendor payment',
            ]);

        $resOutward->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.payment.payment_direction', 'outward')
            ->assertJsonPath('data.payment.amount', '4500.00');

        $this->assertDatabaseHas('payments', [
            'reference_no' => 'NEFT998811',
            'amount' => 4500.00,
            'payment_direction' => 'outward',
            'transaction_date' => '2026-03-25 00:00:00',
            'status' => 'reconciled',
        ]);

        $this->assertDatabaseHas('bank_account_transactions', [
            'reference_no' => 'NEFT998811',
            'amount' => 4500.00,
            'transaction_type' => 'withdrawal',
            'counterparty' => 'Apex Logistics Services Pvt Ltd',
            'status' => 'reconciled',
        ]);
    }

    public function test_can_upload_pdf_statement(): void
    {
        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'SBI Corporate A/C',
            'account_type' => 'bank',
            'current_balance' => 100000.00,
            'is_active' => true,
        ]);

        // Simple text-based PDF statement content
        $pdfText = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" .
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" .
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n" .
            "4 0 obj\n<< /Length 200 >>\nstream\nBT\n" .
            "/F1 12 Tf\n" .
            "(10/01/2025 UPI/555666777888/GPAY 25000.00 125000.00) Tj\n" .
            "ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n" .
            "trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n500\n%%EOF";

        $file = UploadedFile::fake()->createWithContent('statement.pdf', $pdfText);

        $res = $this->actingAsWithPermissions($this->user, ['banking.statements.upload'])
            ->postJson('/api/banking/statements/upload', [
                'bank_account_id' => $account->id,
                'statement_file' => $file,
                'bank_format' => 'generic',
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('success', true);
    }

    public function test_detailed_transactions_filtering_and_summary(): void
    {
        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'Axis Bank Operating A/C',
            'account_type' => 'bank',
            'opening_balance' => 0.00,
            'current_balance' => 50000.00,
            'is_active' => true,
        ]);

        // Create deposit (inflow)
        \App\Models\BankAccountTransaction::create([
            'bank_account_id' => $account->id,
            'company_id' => $this->company->id,
            'transaction_date' => '2026-05-10',
            'transaction_type' => 'deposit',
            'amount' => 75000.00,
            'running_balance' => 75000.00,
            'reference_no' => 'UPI/555123/RENT',
            'description' => 'Customer advance payment via UPI',
            'status' => 'cleared',
        ]);

        // Create bank charge (outflow)
        \App\Models\BankAccountTransaction::create([
            'bank_account_id' => $account->id,
            'company_id' => $this->company->id,
            'transaction_date' => '2026-05-15',
            'transaction_type' => 'bank_charges',
            'amount' => 500.00,
            'running_balance' => 74500.00,
            'reference_no' => 'CHG-ANNUAL-FEE',
            'description' => 'Annual debit card fee',
            'status' => 'cleared',
        ]);

        // 1. Filter by direction=inflow on 'all' accounts
        $resInflow = $this->actingAsWithPermissions($this->user, ['banking.transactions.view'])
            ->getJson('/api/banking/accounts/all/transactions?direction=inflow');

        $resInflow->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('summary.total_inflow', 75000)
            ->assertJsonPath('summary.total_outflow', 0)
            ->assertJsonPath('summary.net_flow', 75000);

        // 2. Filter by direction=outflow
        $resOutflow = $this->actingAsWithPermissions($this->user, ['banking.transactions.view'])
            ->getJson("/api/banking/accounts/{$account->id}/transactions?direction=outflow");

        $resOutflow->assertStatus(200)
            ->assertJsonPath('summary.total_inflow', 0)
            ->assertJsonPath('summary.total_outflow', 500)
            ->assertJsonPath('summary.net_flow', -500);

        // 3. Test global transactions endpoint with amount range
        $resRange = $this->actingAsWithPermissions($this->user, ['banking.transactions.view'])
            ->getJson("/api/banking/transactions?min_amount=1000&max_amount=100000");

        $resRange->assertStatus(200)
            ->assertJsonPath('summary.total_count', 1);

        // 4. Test ledger transactions filtering by financial_year
        $resFy = $this->actingAsWithPermissions($this->user, ['banking.transactions.view'])
            ->getJson("/api/banking/accounts/all/transactions?financial_year=FY 2026-27");

        $resFy->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    public function test_can_paste_raw_statement_text(): void
    {
        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'Kotak Bank Current A/C',
            'account_type' => 'bank',
            'opening_balance' => 0.00,
            'current_balance' => 0.00,
            'is_active' => true,
        ]);

        $rawText = "Date\tDescription\tChq/Ref No\tWithdrawal\tDeposit\tBalance\n" .
                   "15/10/2026\tUPI/AXIS/592019/PAYMENT\tUPI592019\t0.00\t18500.00\t18500.00\n" .
                   "16/10/2026\tNEFT-VENDOR-SETTLEMENT\tNEFT123456\t3500.00\t0.00\t15000.00\n";

        $res = $this->actingAsWithPermissions($this->user, ['banking.statements.upload'])
            ->postJson('/api/banking/statements/upload', [
                'bank_account_id' => $account->id,
                'raw_text' => $rawText,
                'bank_format' => 'generic',
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('statement.total_transactions', 2);
    }

    public function test_encrypted_pdf_detection_requires_password(): void
    {
        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'Protected Bank A/C',
            'account_type' => 'bank',
            'opening_balance' => 0.00,
            'current_balance' => 0.00,
            'is_active' => true,
        ]);

        // Simulated encrypted PDF structure with /Encrypt dictionary
        $fakeEncryptedPdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" .
                            "2 0 obj\n<< /Encrypt 3 0 R >>\nendobj\n" .
                            "3 0 obj\n<< /Filter /Standard /V 2 /R 3 /P -4 >>\nendobj\ntrailer\n<< /Encrypt 3 0 R >>\n%%EOF";

        $file = UploadedFile::fake()->createWithContent('locked_statement.pdf', $fakeEncryptedPdf);

        $res = $this->actingAsWithPermissions($this->user, ['banking.statements.upload'])
            ->postJson('/api/banking/statements/upload', [
                'bank_account_id' => $account->id,
                'statement_file' => $file,
            ]);

        $res->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('is_encrypted', true);
    }

    public function test_process_full_reconciliation_processes_all_rows_and_assigns_statuses(): void
    {
        $permissions = ['banking.reconciliation.view', 'banking.reconciliation.manage', 'banking.accounts.view'];

        // 1. Account 1 (Operating Bank) & Account 2 (Treasury Bank for internal transfers)
        $account1 = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'HDFC Main Operating A/C',
            'account_type' => 'bank',
            'account_number' => '50100123456789',
            'opening_balance' => 50000.00,
            'current_balance' => 50000.00,
            'is_active' => true,
        ]);

        $account2 = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'ICICI Treasury Account',
            'account_type' => 'bank',
            'account_number' => '98765432109876',
            'opening_balance' => 10000.00,
            'current_balance' => 10000.00,
            'is_active' => true,
        ]);

        // 2. Existing ERP payment for exact match
        Payment::create([
            'company_id' => $this->company->id,
            'bank_account_id' => $account1->id,
            'amount' => 1500.00,
            'transaction_date' => '2026-03-10',
            'payment_direction' => 'inward',
            'payment_method' => 'upi',
            'reference_no' => 'UPI9988776655',
            'status' => 'completed',
        ]);

        // 3. Bank Statement with 4 diverse rows
        $statement = BankStatement::create([
            'company_id' => $this->company->id,
            'bank_account_id' => $account1->id,
            'file_name' => 'batch_recon.csv',
            'total_transactions' => 4,
            'status' => 'uploaded',
        ]);

        // Row 1: Exact match with existing payment
        $row1 = BankStatementTransaction::create([
            'company_id' => $this->company->id,
            'statement_id' => $statement->id,
            'bank_account_id' => $account1->id,
            'transaction_date' => '2026-03-10',
            'description' => 'UPI/CR/9988776655/Customer payment',
            'reference_no' => 'UPI9988776655',
            'debit' => 0.00,
            'credit' => 1500.00,
            'balance' => 51500.00,
            'reconciliation_status' => 'unmatched',
        ]);

        // Row 2: Own account transfer (must NOT create expense draft)
        $row2 = BankStatementTransaction::create([
            'company_id' => $this->company->id,
            'statement_id' => $statement->id,
            'bank_account_id' => $account1->id,
            'transaction_date' => '2026-03-11',
            'description' => 'TRANSFER TO ICICI 98765432109876 INTERNAL FUND',
            'reference_no' => 'TRF987654',
            'debit' => 5000.00,
            'credit' => 0.00,
            'balance' => 46500.00,
            'reconciliation_status' => 'unmatched',
        ]);

        // Row 3: Missing Utility Expense (Electricity)
        $row3 = BankStatementTransaction::create([
            'company_id' => $this->company->id,
            'statement_id' => $statement->id,
            'bank_account_id' => $account1->id,
            'transaction_date' => '2026-03-12',
            'description' => 'BESCOM ELECTRICITY BILL BANGALORE NORTH OFFICE',
            'reference_no' => 'BESCOM2026',
            'debit' => 3450.00,
            'credit' => 0.00,
            'balance' => 43050.00,
            'reconciliation_status' => 'unmatched',
        ]);

        // Row 4: Unmatched Direct Inflow
        $row4 = BankStatementTransaction::create([
            'company_id' => $this->company->id,
            'statement_id' => $statement->id,
            'bank_account_id' => $account1->id,
            'transaction_date' => '2026-03-13',
            'description' => 'NEFT CR FROM UNKNOWN CLIENT AC7788',
            'reference_no' => 'NEFT778899',
            'debit' => 0.00,
            'credit' => 8200.00,
            'balance' => 51250.00,
            'reconciliation_status' => 'unmatched',
        ]);

        // Execute full statement reconciliation
        $res = $this->actingAsWithPermissions($this->user, $permissions)
            ->postJson("/api/banking/statements/{$statement->id}/process-full-reconciliation", [
                'auto_approve' => true,
            ]);

        $res->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('summary.total_rows', 4)
            ->assertJsonPath('summary.matched_rows', 1)
            ->assertJsonPath('summary.expense_drafts_count', 1)
            ->assertJsonPath('summary.transfer_pending_count', 1)
            ->assertJsonPath('summary.unmatched_income_count', 1);

        // Verify row 1 is matched
        $this->assertEquals('matched', $row1->fresh()->reconciliation_status);

        // Verify row 2 is transfer_pending and NO financial entry was created
        $this->assertEquals('transfer_pending', $row2->fresh()->reconciliation_status);

        // Verify row 3 created an unposted draft FinancialEntry
        $row3Fresh = $row3->fresh();
        $this->assertEquals('expense_draft_created', $row3Fresh->reconciliation_status);
        $this->assertNotNull($row3Fresh->expense_draft_id);

        $draft = FinancialEntry::find($row3Fresh->expense_draft_id);
        $this->assertNotNull($draft);
        $this->assertEquals('draft', $draft->status);
        $this->assertEquals(3450.00, (float) $draft->amount);
        $this->assertEquals('Electricity Expense', $draft->category);

        // Verify row 4 is unmatched_income
        $this->assertEquals('unmatched_income', $row4->fresh()->reconciliation_status);
    }

    public function test_approve_expense_draft_posts_entry_and_learns_rule(): void
    {
        $permissions = ['banking.reconciliation.view', 'banking.reconciliation.manage'];

        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'Main Operating A/C',
            'account_type' => 'bank',
            'opening_balance' => 10000.00,
            'current_balance' => 10000.00,
            'is_active' => true,
        ]);

        $statement = BankStatement::create([
            'company_id' => $this->company->id,
            'bank_account_id' => $account->id,
            'file_name' => 'charges.csv',
            'total_transactions' => 1,
            'status' => 'uploaded',
        ]);

        $draftEntry = FinancialEntry::create([
            'company_id' => $this->company->id,
            'direction' => 'expense',
            'category' => 'Bank Charges',
            'amount' => 118.00,
            'payment_method' => 'bank_transfer',
            'entry_date' => '2026-03-15',
            'status' => 'draft',
            'description' => 'HDFC SMS ALERT CHARGES Q4',
            'counterparty' => 'HDFC Bank',
        ]);

        $statementTxn = BankStatementTransaction::create([
            'company_id' => $this->company->id,
            'statement_id' => $statement->id,
            'bank_account_id' => $account->id,
            'transaction_date' => '2026-03-15',
            'description' => 'CHG: SMS ALERT CHARGES HDFC BANK',
            'reference_no' => 'CHG118',
            'debit' => 118.00,
            'credit' => 0.00,
            'balance' => 9882.00,
            'reconciliation_status' => 'expense_draft_created',
            'expense_draft_id' => $draftEntry->id,
        ]);

        // Approve draft with remember_rule = true
        $res = $this->actingAsWithPermissions($this->user, $permissions)
            ->postJson("/api/banking/reconciliation/expense-drafts/{$statementTxn->id}/approve", [
                'save_learned_rule' => true,
            ]);

        $res->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('entry.status', 'completed');

        // Check statement transaction is now matched
        $this->assertEquals('matched', $statementTxn->fresh()->reconciliation_status);

        // Check bank ledger transaction was generated
        $ledgerTxn = BankAccountTransaction::where('bank_account_id', $account->id)
            ->where('amount', 118.00)
            ->first();
        $this->assertNotNull($ledgerTxn);
        $this->assertEquals('payment_out', $ledgerTxn->transaction_type);

        // Check a learned rule was stored
        $rule = BankReconciliationRule::where('company_id', $this->company->id)
            ->where('category', 'Bank Charges')
            ->first();
        $this->assertNotNull($rule);
        $this->assertEquals('learned', $rule->source);
        $this->assertTrue($rule->times_used >= 1);
    }

    public function test_edit_and_reject_expense_draft(): void
    {
        $permissions = ['banking.reconciliation.view', 'banking.reconciliation.manage'];

        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'Main Operating A/C',
            'account_type' => 'bank',
            'opening_balance' => 10000.00,
            'current_balance' => 10000.00,
            'is_active' => true,
        ]);

        $statement = BankStatement::create([
            'company_id' => $this->company->id,
            'bank_account_id' => $account->id,
            'file_name' => 'draft_test.csv',
            'total_transactions' => 1,
            'status' => 'uploaded',
        ]);

        $draft = FinancialEntry::create([
            'company_id' => $this->company->id,
            'direction' => 'expense',
            'category' => 'General Expense',
            'amount' => 500.00,
            'payment_method' => 'bank_transfer',
            'entry_date' => '2026-03-20',
            'status' => 'draft',
            'description' => 'Draft description',
        ]);

        $stmtTxn = BankStatementTransaction::create([
            'company_id' => $this->company->id,
            'statement_id' => $statement->id,
            'bank_account_id' => $account->id,
            'transaction_date' => '2026-03-20',
            'description' => 'Vendor payment 500',
            'debit' => 500.00,
            'credit' => 0.00,
            'reconciliation_status' => 'expense_draft_created',
            'expense_draft_id' => $draft->id,
        ]);

        // 1. Edit draft details
        $editRes = $this->actingAsWithPermissions($this->user, $permissions)
            ->putJson("/api/banking/reconciliation/expense-drafts/{$stmtTxn->id}", [
                'category' => 'Software & Subscriptions',
                'counterparty' => 'GitHub Inc',
                'amount' => 500.00,
                'description' => 'GitHub Copilot Enterprise Monthly',
            ]);

        $editRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('draft.category', 'Software & Subscriptions')
            ->assertJsonPath('draft.counterparty', 'GitHub Inc');

        // 2. Reject draft
        $rejectRes = $this->actingAsWithPermissions($this->user, $permissions)
            ->postJson("/api/banking/reconciliation/expense-drafts/{$stmtTxn->id}/reject");

        $rejectRes->assertStatus(200)
            ->assertJsonPath('success', true);

        // Row returns to needs_review and draft is cancelled
        $this->assertEquals('needs_review', $stmtTxn->fresh()->reconciliation_status);
        $this->assertNull($stmtTxn->fresh()->expense_draft_id);
        $this->assertEquals('cancelled', FinancialEntry::find($draft->id)->status);
    }

    public function test_ignore_and_unignore_statement_transaction(): void
    {
        $permissions = ['banking.reconciliation.view', 'banking.reconciliation.manage'];

        $account = BankAccount::create([
            'company_id' => $this->company->id,
            'account_name' => 'Main Operating A/C',
            'account_type' => 'bank',
            'opening_balance' => 10000.00,
            'current_balance' => 10000.00,
            'is_active' => true,
        ]);

        $statement = BankStatement::create([
            'company_id' => $this->company->id,
            'bank_account_id' => $account->id,
            'file_name' => 'ignore_test.csv',
            'total_transactions' => 1,
            'status' => 'uploaded',
        ]);

        $txn = BankStatementTransaction::create([
            'company_id' => $this->company->id,
            'statement_id' => $statement->id,
            'bank_account_id' => $account->id,
            'transaction_date' => '2026-03-21',
            'description' => 'OWNER PERSONAL DRAWING ATM WITHDRAWAL',
            'debit' => 2000.00,
            'credit' => 0.00,
            'reconciliation_status' => 'needs_review',
        ]);

        // 1. Ignore
        $ignoreRes = $this->actingAsWithPermissions($this->user, $permissions)
            ->postJson("/api/banking/reconciliation/transactions/{$txn->id}/ignore", [
                'reason' => 'Owner personal draw not accounted as business expense',
            ]);

        $ignoreRes->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertEquals('ignored', $txn->fresh()->reconciliation_status);

        // 2. Unignore
        $unignoreRes = $this->actingAsWithPermissions($this->user, $permissions)
            ->postJson("/api/banking/reconciliation/transactions/{$txn->id}/unignore");

        $unignoreRes->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertEquals('unmatched', $txn->fresh()->reconciliation_status);
    }

    public function test_reconciliation_rules_management_and_tenant_isolation(): void
    {
        $permissions = ['banking.reconciliation.view', 'banking.reconciliation.manage'];

        // 1. Create Rule for Company 1
        $createRes = $this->actingAsWithPermissions($this->user, $permissions)
            ->postJson('/api/banking/rules', [
                'rule_name' => 'AWS Cloud Infrastructure Match',
                'pattern_type' => 'contains',
                'pattern_value' => 'AMAZON WEB SERVICES',
                'action' => 'create_expense_draft',
                'category' => 'Software & Subscriptions',
                'vendor_name' => 'Amazon Web Services India',
                'confidence_score' => 98,
            ]);

        $createRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('rule.rule_name', 'AWS Cloud Infrastructure Match');

        $ruleId = $createRes->json('rule.id');

        // 2. Toggle Rule Status
        $toggleRes = $this->actingAsWithPermissions($this->user, $permissions)
            ->postJson("/api/banking/rules/{$ruleId}/toggle");

        $toggleRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('rule.is_active', false);

        // 3. Multi-Tenant Isolation: User from Company 2 cannot see or delete Company 1's rule
        $company2 = Company::create([
            'name' => 'Competitor Company Pvt Ltd',
            'code' => 'COMP',
            'email' => 'admin@comp.in',
            'phone' => '9111111111',
            'active' => true,
        ]);

        $user2 = User::factory()->create([
            'company_id' => $company2->id,
        ]);

        $comp2Res = $this->actingAsWithPermissions($user2, $permissions)
            ->getJson('/api/banking/rules');

        $comp2Res->assertStatus(200);
        $ids = collect($comp2Res->json('rules.data', []))->pluck('id')->all();
        $this->assertNotContains($ruleId, $ids);

        // Delete attempt by Company 2 user must 404
        $deleteAttempt = $this->actingAsWithPermissions($user2, $permissions)
            ->deleteJson("/api/banking/rules/{$ruleId}");
        $deleteAttempt->assertStatus(404);
    }
}
