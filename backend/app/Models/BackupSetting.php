<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BackupSetting extends Model
{
    use HasFactory;

    protected $table = 'backup_settings';

    protected $fillable = [
        'installation_id',
        'is_schedule_enabled',
        'schedule_frequency',
        'schedule_time',
        'schedule_timezone',
        'retention_daily_days',
        'retention_weekly_weeks',
        'retention_monthly_months',
        'auto_verify',
        'notify_email',
        'notify_whatsapp',
        'active_key_version',
        'encryption_enabled',
        'storage_provider',
    ];

    protected $casts = [
        'is_schedule_enabled' => 'boolean',
        'auto_verify' => 'boolean',
        'encryption_enabled' => 'boolean',
        'retention_daily_days' => 'integer',
        'retention_weekly_weeks' => 'integer',
        'retention_monthly_months' => 'integer',
    ];

    /**
     * Singleton accessor for system backup settings.
     */
    public static function instance(): self
    {
        $setting = self::first();
        if (!$setting) {
            $installationId = config('backup.installation_id', 'nixaerp-prod-' . substr(md5(config('app.key') ?: 'nixaerp'), 0, 8));
            $setting = self::create([
                'installation_id' => $installationId,
                'is_schedule_enabled' => true,
                'schedule_frequency' => 'daily',
                'schedule_time' => '02:00',
                'schedule_timezone' => 'Asia/Kolkata',
                'retention_daily_days' => 30,
                'retention_weekly_weeks' => 12,
                'retention_monthly_months' => 12,
                'auto_verify' => true,
                'active_key_version' => 'v1',
                'encryption_enabled' => true,
                'storage_provider' => 'google_drive',
            ]);
        }
        return $setting;
    }

    /**
     * Retrieve a setting value with fallback.
     */
    public static function get(string $key, mixed $default = null): mixed
    {
        $instance = self::instance();
        return $instance->{$key} ?? $default;
    }

    /**
     * Set a setting value.
     */
    public static function set(string $key, mixed $value): void
    {
        $instance = self::instance();
        $instance->{$key} = $value;
        $instance->save();
    }
}
