<?php

namespace App\Http\Requests\CashDrawer;

use Illuminate\Foundation\Http\FormRequest;

class TransferRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'source_drawer_id'      => 'required|integer|exists:cash_drawers,id',
            'destination_drawer_id' => 'required|integer|exists:cash_drawers,id|different:source_drawer_id',
            'amount'                => 'required|numeric|min:0.01',
            'notes'                 => 'nullable|string|max:1000',
        ];
    }
}
