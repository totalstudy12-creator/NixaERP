<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashDrawerTransfer extends Model
{
    use HasFactory;

    protected $table = 'cash_drawer_transfers';

    protected $fillable = [
        'company_id',
        'transfer_number',
        'source_drawer_id',
        'source_branch_id',
        'source_session_id',
        'destination_drawer_id',
        'destination_branch_id',
        'destination_session_id',
        'amount',
        'status',
        'initiated_by',
        'initiated_at',
        'received_by',
        'received_at',
        'rejected_by',
        'rejected_at',
        'source_transaction_id',
        'destination_transaction_id',
        'notes',
        'rejection_reason',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'initiated_at' => 'datetime',
        'received_at' => 'datetime',
        'rejected_at' => 'datetime',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function sourceDrawer(): BelongsTo
    {
        return $this->belongsTo(CashDrawer::class, 'source_drawer_id');
    }

    public function sourceBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'source_branch_id');
    }

    public function destinationDrawer(): BelongsTo
    {
        return $this->belongsTo(CashDrawer::class, 'destination_drawer_id');
    }

    public function destinationBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'destination_branch_id');
    }

    public function initiator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiated_by');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function rejector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    public function sourceTransaction(): BelongsTo
    {
        return $this->belongsTo(CashDrawerTransaction::class, 'source_transaction_id');
    }

    public function destinationTransaction(): BelongsTo
    {
        return $this->belongsTo(CashDrawerTransaction::class, 'destination_transaction_id');
    }
}
