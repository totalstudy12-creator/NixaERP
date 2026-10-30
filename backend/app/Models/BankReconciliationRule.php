<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class BankReconciliationRule extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'bank_reconciliation_rules';

    protected $fillable = [
        'company_id',
        'branch_id',
        'rule_name',
        'pattern_type',
        'pattern_value',
        'action',
        'category',
        'vendor_name',
        'vendor_id',
        'confidence_score',
        'times_used',
        'last_matched_at',
        'is_active',
        'source',
        'learned_from_transaction_id',
        'notes',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'confidence_score' => 'integer',
        'times_used' => 'integer',
        'is_active' => 'boolean',
        'last_matched_at' => 'datetime',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function learnedFromTransaction()
    {
        return $this->belongsTo(BankStatementTransaction::class, 'learned_from_transaction_id');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeForCompany($query, int $companyId)
    {
        return $query->where('company_id', $companyId);
    }

    /**
     * Test whether this rule matches a statement transaction narration/reference.
     */
    public function matches(string $narration, ?string $reference = null): bool
    {
        $text = strtolower(trim($narration . ' ' . ($reference ?? '')));
        $pattern = strtolower(trim($this->pattern_value));

        if (empty($pattern)) {
            return false;
        }

        switch ($this->pattern_type) {
            case 'regex':
                return (bool) @preg_match('/' . $this->pattern_value . '/i', $narration);

            case 'exact':
                return $text === $pattern || strtolower(trim($narration)) === $pattern;

            case 'starts_with':
                return str_starts_with(strtolower(trim($narration)), $pattern);

            case 'upi_vpa':
                return str_contains($text, $pattern) || (bool) preg_match('/' . preg_quote($pattern, '/') . '(@[a-z0-9]+)?/i', $text);

            case 'contains':
            default:
                return str_contains($text, $pattern);
        }
    }
}
