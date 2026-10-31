<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    use HasFactory;

    protected $table = 'settings';

    protected $fillable = [
        'key',
        'value',
        'group',
        'scope',
        'scope_id',
        'type',
        'description',
        'is_public',
        'is_secret',
        'updated_by',
    ];

    protected $casts = [
        'is_public' => 'boolean',
        'is_secret' => 'boolean',
        'scope_id'  => 'integer',
        'updated_by'=> 'integer',
    ];

    /**
     * Get masked value if this setting is marked as secret.
     */
    public function getMaskedValueAttribute(): ?string
    {
        if ($this->is_secret || $this->isSecretKey()) {
            return $this->value ? '********' : null;
        }
        return $this->value;
    }

    public function isSecretKey(): bool
    {
        $k = strtolower($this->key);
        return str_contains($k, 'secret')
            || str_contains($k, 'api_key')
            || str_contains($k, 'password')
            || str_contains($k, 'token')
            || str_contains($k, 'private_key');
    }
}
