<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\FinancialEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IncomeExpenseReportsTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithPermissions;

    public function test_income_and_expense_reports_return_real_direction_filtered_entries_and_totals(): void
    {
        $company = Company::factory()->create();
        FinancialEntry::create([
            'company_id' => $company->id,
            'direction' => 'income',
            'category' => 'Consulting',
            'counterparty' => 'Northwind',
            'amount' => 1450.50,
            'entry_date' => '2026-09-10',
            'payment_method' => 'bank_transfer',
            'reference_no' => 'INC-1001',
            'description' => 'Monthly consulting retainer',
            'status' => 'completed',
        ]);
        FinancialEntry::create([
            'company_id' => $company->id,
            'direction' => 'expense',
            'category' => 'Utilities',
            'counterparty' => 'City Power',
            'amount' => 225.25,
            'entry_date' => '2026-09-12',
            'payment_method' => 'upi',
            'reference_no' => 'EXP-2001',
            'description' => 'September electricity bill',
            'status' => 'completed',
        ]);

        $user = User::factory()->create();
        $this->actingAsWithPermissions($user, ['income_expenses.view_reports']);

        $income = $this->getJson('/api/reports/income-summary?from=2026-09-01&to=2026-09-30&company_id=' . $company->id);
        $income->assertOk()
            ->assertJsonPath('summary.count', 1)
            ->assertJsonPath('summary.total', 1450.5)
            ->assertJsonPath('data.0.direction', 'income')
            ->assertJsonPath('data.0.category', 'Consulting')
            ->assertJsonPath('data.0.counterparty', 'Northwind');

        $expenses = $this->getJson('/api/reports/expense-summary?from=2026-09-01&to=2026-09-30&company_id=' . $company->id);
        $expenses->assertOk()
            ->assertJsonPath('summary.count', 1)
            ->assertJsonPath('summary.total', 225.25)
            ->assertJsonPath('data.0.direction', 'expense')
            ->assertJsonPath('data.0.category', 'Utilities')
            ->assertJsonPath('data.0.reference_no', 'EXP-2001');
    }

    public function test_report_dashboard_net_profit_includes_recorded_income_and_expenses(): void
    {
        $company = Company::factory()->create();
        foreach ([['income', 500], ['expense', 100]] as [$direction, $amount]) {
            FinancialEntry::create([
                'company_id' => $company->id,
                'direction' => $direction,
                'category' => 'Test',
                'amount' => $amount,
                'entry_date' => '2026-09-15',
                'payment_method' => 'cash',
                'status' => 'completed',
            ]);
        }

        $user = User::factory()->create();
        $this->actingAsWithPermissions($user, ['view dashboard analytics']);

        $this->getJson('/api/reports/summary?from=2026-09-01&to=2026-09-30&company_id=' . $company->id)
            ->assertOk()
            ->assertJsonPath('data.other_income', 500)
            ->assertJsonPath('data.operating_expenses', 100)
            ->assertJsonPath('data.net_profit', 400);
    }
}