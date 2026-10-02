<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreFinancialCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['required', 'integer', 'exists:companies,id'],
            'parent_id' => ['nullable', 'integer', 'exists:financial_categories,id'],
            'name' => ['required', 'string', 'max:150'],
            'code' => ['nullable', 'string', 'max:50'],
            'type' => ['required', Rule::in(['income', 'expense', 'both'])],
            'description' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['boolean'],
        ];
    }
}
