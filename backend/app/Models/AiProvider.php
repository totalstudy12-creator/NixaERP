<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class AiProvider extends Model
{
    use HasFactory;

    protected $table = 'ai_providers';

    protected $fillable = ['name', 'key', 'config', 'enabled'];

    protected $casts = [
        'enabled' => 'boolean',
        'config' => 'array',
    ];

    protected $hidden = ['key'];
    protected $appends = ['masked_key'];

    public function getMaskedKeyAttribute()
    {
        $k = $this->getAttribute('key');
        if (!$k) return null;
        // show only first 4 and last 4 chars if long
        $len = strlen($k);
        if ($len <= 8) return str_repeat('*', $len);
        return substr($k, 0, 4) . str_repeat('*', max(4, $len - 8)) . substr($k, -4);
    }

    // Encrypt key when saving, decrypt when accessing
    public function setKeyAttribute($value)
    {
        if (is_null($value)) {
            $this->attributes['key'] = null;
            return;
        }
        // If value looks already encrypted (starts with AQ.), avoid double-encrypt
        try {
            $this->attributes['key'] = Crypt::encryptString($value);
        } catch (\Throwable $e) {
            // fallback: store raw
            $this->attributes['key'] = $value;
        }
    }

    public function getKeyAttribute($value)
    {
        if (is_null($value)) {
            return null;
        }
        try {
            return Crypt::decryptString($value);
        } catch (\Throwable $e) {
            return $value;
        }
    }
}
