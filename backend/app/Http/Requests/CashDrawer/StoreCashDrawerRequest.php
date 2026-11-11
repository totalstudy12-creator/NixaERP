<?php

namespace App\Http\Requests\CashDrawer;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCashDrawerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $drawerId = $this->route('id') ?? $this->route('cash_drawer');
        $companyId = $this->input('company_id', $this->user()?->company_id ?: 1);

        return [
            'company_id'       => 'nullable|integer|exists:companies,id',
            'branch_id'        => 'required|integer|exists:branches,id',
            'name'             => 'required|string|max:191',
            'code'             => [
                'required',
                'string',
                'max:50',
                Rule::unique('cash_drawers', 'code')
                    ->where('company_id', $companyId)
                    ->ignore($drawerId),
            ],
            'status'           => 'nullable|string|in:active,inactive,maintenance',
            'is_default'       => 'nullable|boolean',
            'starting_balance' => 'nullable|numeric|min:0',
            'allow_overdraft'  => 'nullable|boolean',
            'overdraft_limit'  => 'nullable|numeric|min:0',
            'account_id'       => 'nullable|integer|exists:bank_accounts,id',
            'notes'            => 'nullable|string',
        ];
    }
}
