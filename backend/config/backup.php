<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Unique Installation Identifier
    |--------------------------------------------------------------------------
    | Used to verify that backups belong to this exact installation and protect
    | against cross-environment restoration accidents.
    */
    'installation_id' => env('BACKUP_INSTALLATION_ID', 'nixaerp-prod-' . substr(md5(env('APP_KEY', 'nixaerp')), 0, 8)),

    /*
    |--------------------------------------------------------------------------
    | Temporary Storage Directory
    |--------------------------------------------------------------------------
    | Private directory strictly outside the public web root for staging
    | unencrypted dumps and archives before streaming encryption.
    */
    'temp_dir' => env('BACKUP_TEMP_DIR', storage_path('app/private/backup_temp')),

    /*
    |--------------------------------------------------------------------------
    | Encryption Keyring & Versioning
    |--------------------------------------------------------------------------
    | Dedicated backup encryption keys. Must be at least 256-bit (32 bytes hex).
    */
    'encryption_key' => env('BACKUP_ENCRYPTION_KEY'),
    'active_key_version' => env('BACKUP_ACTIVE_KEY_VERSION', 'v1'),
    'keyring' => [
        'v1' => env('BACKUP_ENCRYPTION_KEY'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Database Binaries
    |--------------------------------------------------------------------------
    | Custom paths to mysqldump and mysql binaries if not in system PATH.
    */
    'mysqldump_binary' => env('BACKUP_MYSQLDUMP_BINARY'),
    'mysql_binary' => env('BACKUP_MYSQL_BINARY'),

    /*
    |--------------------------------------------------------------------------
    | Default Schedule & Retention
    |--------------------------------------------------------------------------
    | Asia/Kolkata 02:00 AM IST daily backup by default.
    */
    'timezone' => env('BACKUP_TIMEZONE', 'Asia/Kolkata'),
    'default_time' => env('BACKUP_DEFAULT_TIME', '02:00'),
    'retention' => [
        'daily_days' => (int) env('BACKUP_RETENTION_DAILY', 30),
        'weekly_weeks' => (int) env('BACKUP_RETENTION_WEEKLY', 12),
        'monthly_months' => (int) env('BACKUP_RETENTION_MONTHLY', 12),
    ],

    /*
    |--------------------------------------------------------------------------
    | Upload Chunk Size (Google Drive Resumable Uploads)
    |--------------------------------------------------------------------------
    | Must be a multiple of 256 KiB (262144 bytes). Default is 2 MiB chunks.
    */
    'chunk_size' => (int) env('BACKUP_CHUNK_SIZE', 2 * 1024 * 1024),
];
