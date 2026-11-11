<?php

namespace App\Http\Requests\CashDrawer;

use Illuminate\Foundation\Http\FormRequest;

class CloseSessionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'closed_at'               => 'nullable|date',
            'actual_closing_cash'     => 'required|numeric|min:0',
            'closing_notes'           => 'nullable|string|max:1000',
            'discrepancy_reason'      => 'nullable|string|max:1000',
            'closing_denominations'   => 'nullable|array',
            'closing_denominations.*.label'    => 'required_with:closing_denominations|string',
            'closing_denominations.*.value'    => 'required_with:closing_denominations|numeric',
            'closing_denominations.*.quantity' => 'required_with:closing_denominations|integer|min:0',
            'closing_denominations.*.amount'   => 'required_with:closing_denominations|numeric|min:0',
        ];
    }
}
