<?php

namespace App\Http\Requests\CashDrawer;

use Illuminate\Foundation\Http\FormRequest;

class OpenSessionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'opened_at'                 => 'nullable|date',
            'opening_balance'           => 'required|numeric|min:0',
            'opening_difference_reason' => 'nullable|string|max:500',
            'opening_notes'             => 'nullable|string|max:1000',
            'opening_denominations'     => 'nullable|array',
            'opening_denominations.*.label'    => 'required_with:opening_denominations|string',
            'opening_denominations.*.value'    => 'required_with:opening_denominations|numeric',
            'opening_denominations.*.quantity' => 'required_with:opening_denominations|integer|min:0',
            'opening_denominations.*.amount'   => 'required_with:opening_denominations|numeric|min:0',
        ];
    }
}
