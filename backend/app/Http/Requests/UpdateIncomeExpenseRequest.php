<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateIncomeExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['sometimes', 'required', 'integer', 'exists:companies,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'direction' => ['sometimes', 'required', Rule::in(['income', 'expense'])],
            'category' => ['sometimes', 'required', 'string', 'max:150'],
            'counterparty' => ['nullable', 'string', 'max:191'],
            'amount' => ['sometimes', 'required', 'numeric', 'gt:0'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'total_amount' => ['nullable', 'numeric', 'gt:0'],
            'entry_date' => ['sometimes', 'required', 'date'],
            'payment_method' => ['sometimes', 'required', Rule::in(['cash', 'bank_transfer', 'card', 'upi', 'cheque', 'credit', 'other'])],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:2000'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'status' => ['nullable', Rule::in(['draft', 'pending', 'approved', 'rejected', 'completed', 'cancelled', 'reversed'])],
            'account_id' => ['nullable', 'integer', 'exists:accounting_accounts,id'],
            'project_id' => ['nullable', 'integer'],
        ];
    }
}
