<?php

namespace App\Http\Requests\CashDrawer;

use Illuminate\Foundation\Http\FormRequest;

class CashInRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'amount'                   => 'required|numeric|min:0.01',
            'category'                 => 'required|string|in:customer_payment,cash_sales,opening_float,owner_contribution,transfer_in,bank_withdrawal,other_receipt',
            'received_from'            => 'nullable|string|max:191',
            'reference_no'             => 'nullable|string|max:191',
            'description'              => 'nullable|string|max:1000',
            'notes'                    => 'nullable|string|max:1000',
            'transaction_date'         => 'nullable|date',
            'idempotency_key'          => 'nullable|string|max:191',
        ];
    }
}
