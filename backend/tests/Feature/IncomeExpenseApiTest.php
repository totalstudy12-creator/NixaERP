<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Company;
use App\Models\FinancialEntry;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IncomeExpenseApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_income_expense_dashboard_returns_real_aggregates(): void
    {
        $company = Company::create([
            'name' => 'Test Co',
            'code' => 'TEST',
            'email' => 'hello@example.com',
            'phone' => '9876543210',
            'address' => 'Test address',
            'active' => true,
        ]);

        $branch = Branch::create([
            'company_id' => $company->id,
            'name' => 'Main Branch',
            'code' => 'MBR',
            'address' => 'Branch address',
            'phone' => '9876543211',
            'email' => 'branch@example.com',
            'active' => true,
        ]);

        FinancialEntry::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'direction' => 'income',
            'category' => 'Sales',
            'counterparty' => 'Customer A',
            'amount' => 2500,
            'entry_date' => '2026-10-01',
            'payment_method' => 'bank_transfer',
            'reference_no' => 'INC-001',
            'description' => 'Income example',
            'status' => 'completed',
        ]);

        FinancialEntry::create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'direction' => 'expense',
            'category' => 'Rent',
            'counterparty' => 'Landlord',
            'amount' => 800,
            'entry_date' => '2026-10-02',
            'payment_method' => 'bank_transfer',
            'reference_no' => 'EXP-001',
            'description' => 'Expense example',
            'status' => 'approved',
        ]);

        $user = User::create([
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'password' => bcrypt('password123'),
        ]);

        $adminRole = Role::create([
            'name' => 'Admin',
            'group' => 'System',
            'description' => 'Administrator',
            'active' => true,
        ]);
        $user->roles()->attach($adminRole->id);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/income-expenses/dashboard');

        $response->assertOk()
            ->assertJsonPath('kpis.total_income', 2500)
            ->assertJsonPath('kpis.total_expenses', 800)
            ->assertJsonPath('kpis.net_cash_flow', 1700)
            ->assertJsonFragment(['direction' => 'income']);
    }
}
