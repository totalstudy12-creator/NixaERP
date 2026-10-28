<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class ConnectedApp extends Model
{
    use HasFactory;

    protected $table = 'connected_apps';

    protected $fillable = [
        'name',
        'app_identifier',
        'description',
        'category',
        'platform',
        'current_version',
        'min_supported_version',
        'force_update',
        'apk_download_url',
        'release_notes',
        'is_active',
        'maintenance_mode',
        'maintenance_message',
        'api_key',
        'allowed_roles',
        'settings',
        'last_sync_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'force_update' => 'boolean',
        'maintenance_mode' => 'boolean',
        'allowed_roles' => 'array',
        'settings' => 'array',
        'last_sync_at' => 'datetime',
    ];

    /**
     * Generate a new unique 64-character API key for this application.
     */
    public static function generateApiKey(string $prefix = 'app'): string
    {
        return $prefix . '_' . Str::random(48);
    }

    /**
     * Compare incoming client version against minimum supported version.
     */
    public function checkVersion(string $clientVersion): array
    {
        $needsForceUpdate = $this->force_update && version_compare($clientVersion, $this->current_version, '<');
        $isBelowMinSupported = version_compare($clientVersion, $this->min_supported_version, '<');
        $isUpdateAvailable = version_compare($clientVersion, $this->current_version, '<');

        return [
            'is_update_available' => $isUpdateAvailable,
            'is_force_update' => $needsForceUpdate || $isBelowMinSupported,
            'current_version' => $this->current_version,
            'min_supported_version' => $this->min_supported_version,
            'apk_download_url' => $this->apk_download_url,
            'release_notes' => $this->release_notes,
        ];
    }
}
