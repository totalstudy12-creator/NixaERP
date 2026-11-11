<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashDrawer;
use App\Models\CashDrawerSession;
use App\Models\CashDrawerTransaction;
use App\Models\CashDrawerTransfer;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CashDrawerManagementTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

    protected Company $companyA;
    protected Company $companyB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected Branch $branchB1;
    protected User $adminUser;
    protected User $cashierA1;
    protected User $unauthorizedUser;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Setup multi-tenant Companies
        $this->companyA = Company::create([
            'name' => 'Titan Enterprises Ltd',
            'code' => 'TITAN',
            'email' => 'finance@titan.in',
            'phone' => '9876543210',
            'active' => true,
        ]);

        $this->companyB = Company::create([
            'name' => 'Zenith Global Corp',
            'code' => 'ZENITH',
            'email' => 'accounts@zenith.in',
            'phone' => '9123456780',
            'active' => true,
        ]);

        // 2. Setup Branches
        $this->branchA1 = Branch::create([
            'company_id' => $this->companyA->id,
            'name' => 'Mumbai Main Branch',
            'code' => 'B-MUM',
            'active' => true,
        ]);

        $this->branchA2 = Branch::create([
            'company_id' => $this->companyA->id,
            'name' => 'Delhi North Branch',
            'code' => 'B-DEL',
            'active' => true,
        ]);

        $this->branchB1 = Branch::create([
            'company_id' => $this->companyB->id,
            'name' => 'Bengaluru Tech Branch',
            'code' => 'B-BLR',
            'active' => true,
        ]);

        // 3. Setup Users
        $this->adminUser = User::factory()->create([
            'name' => 'Company Admin',
            'company_id' => $this->companyA->id,
            'branch_id' => null, // Company-wide
        ]);

        $this->cashierA1 = User::factory()->create([
            'name' => 'Cashier Mumbai',
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
        ]);

        $this->unauthorizedUser = User::factory()->create([
            'name' => 'Unauthorized Viewer',
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
        ]);
    }

    public function test_authorized_user_can_create_and_open_a_cash_drawer(): void
    {
        $permissions = [
            'finance.cash_drawer.view',
            'finance.cash_drawer.create',
            'finance.cash_drawer.open',
        ];

        // 1. Create Drawer
        $resCreate = $this->actingAsWithPermissions($this->adminUser, $permissions)
            ->postJson('/api/finance/cash-drawers', [
                'company_id' => $this->companyA->id,
                'branch_id' => $this->branchA1->id,
                'name' => 'Counter 1 POS Till',
                'code' => 'CDR-TILL-01',
                'starting_balance' => 5000.00,
                'is_default' => true,
            ]);

        $resCreate->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.code', 'CDR-TILL-01');

        $drawerId = $resCreate->json('data.id');

        // 2. Open Session with denomination breakdown
        $denominations = [
            ['label' => '₹500', 'value' => 500, 'quantity' => 6, 'amount' => 3000],
            ['label' => '₹200', 'value' => 200, 'quantity' => 5, 'amount' => 1000],
            ['label' => '₹100', 'value' => 100, 'quantity' => 10, 'amount' => 1000],
        ];

        $resOpen = $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawerId}/open", [
                'opening_balance' => 5000.00,
                'opening_notes' => 'Morning shift opening float verified',
                'opening_denominations' => $denominations,
            ]);

        $resOpen->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.opening_balance', '5000.00');

        $this->assertDatabaseHas('cash_drawer_sessions', [
            'cash_drawer_id' => $drawerId,
            'status' => 'open',
            'opening_balance' => 5000.00,
        ]);

        $this->assertDatabaseHas('cash_drawer_transactions', [
            'cash_drawer_id' => $drawerId,
            'transaction_type' => 'opening_float',
            'amount' => 5000.00,
            'balance_after' => 5000.00,
        ]);
    }

    public function test_unauthorized_user_cannot_open_cash_drawer(): void
    {
        $drawer = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'name' => 'Protected Till',
            'code' => 'CDR-PROT-01',
            'starting_balance' => 1000.00,
            'current_balance' => 1000.00,
            'status' => 'active',
        ]);

        $res = $this->actingAsWithPermissions($this->unauthorizedUser, ['finance.cash_drawer.view'])
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/open", [
                'opening_balance' => 1000.00,
            ]);

        $res->assertStatus(403);
    }

    public function test_duplicate_active_sessions_on_same_drawer_are_prevented(): void
    {
        $drawer = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'name' => 'Counter 2',
            'code' => 'CDR-DUP-01',
            'starting_balance' => 2000.00,
            'current_balance' => 2000.00,
            'status' => 'active',
        ]);

        $permissions = ['finance.cash_drawer.view', 'finance.cash_drawer.open'];

        // Open first session
        $res1 = $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/open", [
                'opening_balance' => 2000.00,
            ]);
        $res1->assertStatus(201);

        // Attempt opening second session while first is still open
        $res2 = $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/open", [
                'opening_balance' => 2000.00,
            ]);
        $res2->assertStatus(422)
            ->assertJsonValidationErrors(['session']);
    }

    public function test_cash_in_and_cash_out_update_balance_and_session_totals(): void
    {
        $drawer = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'name' => 'Daily Retail Till',
            'code' => 'CDR-TXN-01',
            'starting_balance' => 10000.00,
            'current_balance' => 10000.00,
            'status' => 'active',
        ]);

        $permissions = [
            'finance.cash_drawer.view',
            'finance.cash_drawer.open',
            'finance.cash_drawer.cash_in',
            'finance.cash_drawer.cash_out',
        ];

        // Open session
        $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/open", [
                'opening_balance' => 10000.00,
            ])->assertStatus(201);

        // 1. Cash In: Customer Cash Payment ₹3,500
        $resIn = $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/cash-in", [
                'amount' => 3500.00,
                'category' => 'customer_payment',
                'received_from' => 'Acrobat Logistics',
                'reference_no' => 'RCP-101',
                'description' => 'Invoice cash settlement',
            ]);

        $resIn->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.balance_before', '10000.00')
            ->assertJsonPath('data.balance_after', '13500.00');

        $this->assertEquals(13500.00, (float) $drawer->fresh()->current_balance);

        // 2. Cash Out: Office tea and courier expense ₹600
        $resOut = $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/cash-out", [
                'amount' => 600.00,
                'category' => 'shop_expenses',
                'paid_to' => 'Local Courier Hub',
                'reference_no' => 'EXP-COURIER-01',
                'description' => 'Speed post charges',
            ]);

        $resOut->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.balance_before', '13500.00')
            ->assertJsonPath('data.balance_after', '12900.00');

        $this->assertEquals(12900.00, (float) $drawer->fresh()->current_balance);

        $session = CashDrawerSession::where('cash_drawer_id', $drawer->id)->where('status', 'open')->first();
        $this->assertEquals(3500.00, (float) $session->total_cash_in);
        $this->assertEquals(600.00, (float) $session->total_cash_out);
        $this->assertEquals(12900.00, (float) $session->expected_closing_cash);
    }

    public function test_cash_out_exceeding_drawer_balance_is_rejected(): void
    {
        $drawer = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'name' => 'Low Balance Till',
            'code' => 'CDR-LOW-01',
            'starting_balance' => 500.00,
            'current_balance' => 500.00,
            'allow_overdraft' => false,
            'status' => 'active',
        ]);

        $permissions = [
            'finance.cash_drawer.view',
            'finance.cash_drawer.open',
            'finance.cash_drawer.cash_out',
        ];

        $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/open", [
                'opening_balance' => 500.00,
            ])->assertStatus(201);

        // Attempting to withdraw ₹1,200 when only ₹500 is in the drawer
        $res = $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/cash-out", [
                'amount' => 1200.00,
                'category' => 'staff_advance',
                'paid_to' => 'Rahul Sharma',
            ]);

        $res->assertStatus(422)
            ->assertJsonValidationErrors(['amount']);

        // Balance remains intact
        $this->assertEquals(500.00, (float) $drawer->fresh()->current_balance);
    }

    public function test_closing_reconciliation_calculates_difference_and_requires_reason(): void
    {
        $drawer = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'name' => 'Closing Till',
            'code' => 'CDR-CLOSE-01',
            'starting_balance' => 5000.00,
            'current_balance' => 5000.00,
            'status' => 'active',
        ]);

        $permissions = [
            'finance.cash_drawer.view',
            'finance.cash_drawer.open',
            'finance.cash_drawer.close',
            'finance.cash_drawer.cash_in',
        ];

        // 1. Open with ₹5,000
        $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/open", [
                'opening_balance' => 5000.00,
            ])->assertStatus(201);

        // 2. Cash In ₹2,000 -> Expected = ₹7,000
        $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/cash-in", [
                'amount' => 2000.00,
                'category' => 'cash_sales',
            ])->assertStatus(201);

        // 3. Attempt closing with shortage of ₹300 (physical ₹6,700) WITHOUT reason -> Rejected
        $resNoReason = $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/close", [
                'actual_closing_cash' => 6700.00,
            ]);

        $resNoReason->assertStatus(422)
            ->assertJsonValidationErrors(['discrepancy_reason']);

        // 4. Closing WITH mandatory discrepancy reason -> Succeeds
        $resClose = $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->postJson("/api/finance/cash-drawers/{$drawer->id}/close", [
                'actual_closing_cash' => 6700.00,
                'discrepancy_reason' => 'Coin change discrepancy at end of evening rush',
                'closing_denominations' => [
                    ['label' => '₹500', 'value' => 500, 'quantity' => 13, 'amount' => 6500],
                    ['label' => '₹100', 'value' => 100, 'quantity' => 2, 'amount' => 200],
                ],
            ]);

        $resClose->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'closed')
            ->assertJsonPath('data.expected_closing_cash', '7000.00')
            ->assertJsonPath('data.actual_closing_cash', '6700.00')
            ->assertJsonPath('data.closing_difference', '-300.00')
            ->assertJsonPath('data.discrepancy_status', 'pending_approval');

        $session = CashDrawerSession::where('cash_drawer_id', $drawer->id)->first();
        $this->assertTrue($session->isClosed());
        $this->assertEquals(-300.00, (float) $session->closing_difference);

        // 5. Carry forward: next time drawer is opened, suggested balance is ₹6,700
        $suggested = app(\App\Services\CashDrawerService::class)->getPreviousClosingCash($drawer);
        $this->assertEquals(6700.00, $suggested);
    }

    public function test_manager_can_review_and_approve_closing_discrepancy(): void
    {
        $drawer = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'name' => 'Approval Till',
            'code' => 'CDR-APP-01',
            'starting_balance' => 1000.00,
            'current_balance' => 1000.00,
            'status' => 'active',
        ]);

        $session = CashDrawerSession::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'cash_drawer_id' => $drawer->id,
            'user_id' => $this->cashierA1->id,
            'session_number' => 'CDS-TEST-APP',
            'status' => 'closed',
            'opened_at' => now()->subHours(8),
            'closed_at' => now(),
            'opening_balance' => 1000.00,
            'expected_closing_cash' => 1000.00,
            'actual_closing_cash' => 950.00,
            'closing_difference' => -50.00,
            'discrepancy_reason' => 'Minor rounding off',
            'discrepancy_status' => 'pending_approval',
        ]);

        $res = $this->actingAsWithPermissions($this->adminUser, ['finance.cash_drawer.approve', 'finance.cash_drawer.view'])
            ->postJson("/api/finance/cash-drawer/sessions/{$session->id}/review-discrepancy", [
                'action' => 'approve',
                'notes' => 'Audited and approved as minor rounding variance',
            ]);

        $res->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.discrepancy_status', 'approved');

        $this->assertEquals('approved', $session->fresh()->discrepancy_status);
        $this->assertEquals($this->adminUser->id, $session->fresh()->approved_by);
    }

    public function test_automatic_cash_payment_integration_and_idempotency(): void
    {
        $drawer = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'name' => 'POS Sales Register',
            'code' => 'CDR-POS-01',
            'starting_balance' => 20000.00,
            'current_balance' => 20000.00,
            'is_default' => true,
            'status' => 'active',
        ]);

        // Open session
        CashDrawerSession::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'cash_drawer_id' => $drawer->id,
            'user_id' => $this->cashierA1->id,
            'session_number' => 'CDS-POS-100',
            'status' => 'open',
            'opened_at' => now(),
            'opening_balance' => 20000.00,
            'expected_closing_cash' => 20000.00,
        ]);

        // 1. Post CASH payment through Payment API
        $resPayCash = $this->actingAsWithPermissions($this->cashierA1, ['create payments', 'payments.create', 'view payments', 'banking.transactions.manage'])
            ->postJson('/api/payments', [
                'company_id' => $this->companyA->id,
                'branch_id' => $this->branchA1->id,
                'amount' => 4500.00,
                'payment_method' => 'cash',
                'payment_direction' => 'inward',
                'status' => 'completed',
                'remarks' => 'Cash received from retail walk-in customer',
            ]);

        $resPayCash->assertStatus(201);
        $paymentId = $resPayCash->json('id');

        // Verify Cash Drawer balance incremented
        $this->assertEquals(24500.00, (float) $drawer->fresh()->current_balance);

        // Verify Cash Drawer Transaction created with idempotency key
        $this->assertDatabaseHas('cash_drawer_transactions', [
            'cash_drawer_id' => $drawer->id,
            'transaction_type' => 'cash_in',
            'category' => 'other_receipt',
            'amount' => 4500.00,
            'idempotency_key' => "payment_posted_{$paymentId}",
        ]);

        // 2. Repeated sync test: reprocessing same payment must NEVER duplicate cash
        $payment = Payment::find($paymentId);
        $repeatSync = app(\App\Services\CashDrawerService::class)->syncPayment($payment);

        $this->assertNotNull($repeatSync);
        $this->assertEquals(24500.00, (float) $drawer->fresh()->current_balance);
        $this->assertEquals(
            1,
            CashDrawerTransaction::where('idempotency_key', "payment_posted_{$paymentId}")->count()
        );

        // 3. Post NON-CASH (UPI) payment: must NOT touch physical cash drawer
        $resPayUpi = $this->actingAsWithPermissions($this->cashierA1, ['create payments', 'payments.create', 'view payments', 'banking.transactions.manage'])
            ->postJson('/api/payments', [
                'company_id' => $this->companyA->id,
                'branch_id' => $this->branchA1->id,
                'amount' => 10000.00,
                'payment_method' => 'upi',
                'payment_direction' => 'inward',
                'status' => 'completed',
                'remarks' => 'GooglePay UPI scan settlement',
            ]);

        $resPayUpi->assertStatus(201);
        $this->assertEquals(24500.00, (float) $drawer->fresh()->current_balance); // Remains 24500!
    }

    public function test_cross_branch_transfer_lifecycle_and_rejection_refund(): void
    {
        $drawerMUM = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'name' => 'Mumbai Vault Till',
            'code' => 'CDR-MUM-V1',
            'starting_balance' => 50000.00,
            'current_balance' => 50000.00,
            'status' => 'active',
        ]);

        $drawerDEL = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA2->id,
            'name' => 'Delhi Branch Safe',
            'code' => 'CDR-DEL-S1',
            'starting_balance' => 10000.00,
            'current_balance' => 10000.00,
            'status' => 'active',
        ]);

        // Open Mumbai Session
        CashDrawerSession::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'cash_drawer_id' => $drawerMUM->id,
            'user_id' => $this->adminUser->id,
            'session_number' => 'CDS-MUM-TR1',
            'status' => 'open',
            'opened_at' => now(),
            'opening_balance' => 50000.00,
            'expected_closing_cash' => 50000.00,
        ]);

        // Open Delhi Session
        CashDrawerSession::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA2->id,
            'cash_drawer_id' => $drawerDEL->id,
            'user_id' => $this->adminUser->id,
            'session_number' => 'CDS-DEL-TR1',
            'status' => 'open',
            'opened_at' => now(),
            'opening_balance' => 10000.00,
            'expected_closing_cash' => 10000.00,
        ]);

        $permissions = ['finance.cash_drawer.transfer', 'finance.cash_drawer.view'];

        // 1. Initiate transfer of ₹15,000 from Mumbai to Delhi
        $resInit = $this->actingAsWithPermissions($this->adminUser, $permissions)
            ->postJson('/api/finance/cash-drawer-transfers', [
                'source_drawer_id' => $drawerMUM->id,
                'destination_drawer_id' => $drawerDEL->id,
                'amount' => 15000.00,
                'notes' => 'Branch replenishment via secure courier',
            ]);

        $resInit->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'in_transit');

        $transferId = $resInit->json('data.id');

        // Mumbai balance is immediately debited
        $this->assertEquals(35000.00, (float) $drawerMUM->fresh()->current_balance);
        // Delhi balance is NOT yet credited while in transit!
        $this->assertEquals(10000.00, (float) $drawerDEL->fresh()->current_balance);

        // 2. Reject transfer (e.g. transit discrepancy detected) -> Source is refunded
        $resReject = $this->actingAsWithPermissions($this->adminUser, $permissions)
            ->postJson("/api/finance/cash-drawer-transfers/{$transferId}/reject", [
                'reason' => 'Package seal tampered during transit, cash returned to Mumbai till',
            ]);

        $resReject->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'rejected');

        // Mumbai balance refunded to 50,000
        $this->assertEquals(50000.00, (float) $drawerMUM->fresh()->current_balance);
        $this->assertEquals(10000.00, (float) $drawerDEL->fresh()->current_balance);
    }

    public function test_tenant_and_branch_isolation(): void
    {
        $drawerA = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'name' => 'Company A Mumbai Drawer',
            'code' => 'CDR-A-MUM',
            'starting_balance' => 5000.00,
            'current_balance' => 5000.00,
            'status' => 'active',
        ]);

        $drawerB = CashDrawer::create([
            'company_id' => $this->companyB->id,
            'branch_id' => $this->branchB1->id,
            'name' => 'Company B BLR Drawer',
            'code' => 'CDR-B-BLR',
            'starting_balance' => 9000.00,
            'current_balance' => 9000.00,
            'status' => 'active',
        ]);

        $userCompanyB = User::factory()->create([
            'company_id' => $this->companyB->id,
            'branch_id' => $this->branchB1->id,
        ]);

        $permissions = ['finance.cash_drawer.view', 'view accounting accounts'];

        // User from Company B cannot access Company A's drawer (HTTP 403)
        $resCrossCompany = $this->actingAsWithPermissions($userCompanyB, $permissions)
            ->getJson("/api/finance/cash-drawers/{$drawerA->id}");

        $resCrossCompany->assertStatus(403);

        // Branch-scoped user from Branch A1 cannot access Branch A2's records if attempted
        $drawerA2 = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA2->id,
            'name' => 'Delhi Branch Till',
            'code' => 'CDR-A-DEL',
            'starting_balance' => 3000.00,
            'current_balance' => 3000.00,
            'status' => 'active',
        ]);

        $resCrossBranch = $this->actingAsWithPermissions($this->cashierA1, $permissions)
            ->getJson("/api/finance/cash-drawers/{$drawerA2->id}");

        $resCrossBranch->assertStatus(403);
    }

    public function test_csv_export_includes_formula_injection_defense(): void
    {
        $drawer = CashDrawer::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'name' => 'Audit Export Till',
            'code' => 'CDR-AUD-01',
            'starting_balance' => 1000.00,
            'current_balance' => 1000.00,
            'status' => 'active',
        ]);

        $session = CashDrawerSession::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'cash_drawer_id' => $drawer->id,
            'user_id' => $this->adminUser->id,
            'session_number' => 'CDS-CSV-01',
            'status' => 'open',
            'opened_at' => now(),
            'opening_balance' => 1000.00,
            'expected_closing_cash' => 1000.00,
        ]);

        // Malicious transaction description with formula payload
        CashDrawerTransaction::create([
            'company_id' => $this->companyA->id,
            'branch_id' => $this->branchA1->id,
            'cash_drawer_id' => $drawer->id,
            'cash_drawer_session_id' => $session->id,
            'transaction_number' => 'CDT-FORMULA-01',
            'transaction_type' => 'cash_in',
            'category' => 'other_receipt',
            'amount' => 100.00,
            'balance_before' => 1000.00,
            'balance_after' => 1100.00,
            'transaction_date' => now(),
            'reference_no' => '=1+1', // Formula injection attempt
            'received_from_or_paid_to' => '+CMD|/C calc.exe', // Formula injection attempt
            'description' => '@SUM(1,2)', // Formula injection attempt
        ]);

        $res = $this->actingAsWithPermissions($this->adminUser, ['finance.cash_drawer.report', 'finance.cash_drawer.view'])
            ->get('/api/finance/cash-drawer/export-csv');

        $res->assertOk();
        $content = $res->streamedContent();

        // Formula injection prefixes must be prepended with single quote `'`
        $this->assertStringContainsString("'=1+1", $content);
        $this->assertStringContainsString("'+CMD|/C calc.exe", $content);
        $this->assertStringContainsString("'@SUM(1,2)", $content);
    }
}
