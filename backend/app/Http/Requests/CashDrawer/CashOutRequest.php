<?php

namespace App\Http\Requests\CashDrawer;

use Illuminate\Foundation\Http\FormRequest;

class CashOutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'amount'                   => 'required|numeric|min:0.01',
            'category'                 => 'required|string|in:shop_expenses,staff_expenses,staff_advance,supplier_payment,purchase_payment,bank_deposit,transfer_out,safe_deposit,shortage_adjustment,excess_adjustment,other_expense,refund',
            'paid_to'                  => 'nullable|string|max:191',
            'reference_no'             => 'nullable|string|max:191',
            'description'              => 'nullable|string|max:1000',
            'notes'                    => 'nullable|string|max:1000',
            'transaction_date'         => 'nullable|date',
            'idempotency_key'          => 'nullable|string|max:191',
        ];
    }
}
