<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Backup Settings
        if (!Schema::hasTable('backup_settings')) {
            Schema::create('backup_settings', function (Blueprint $table) {
                $table->id();
                $table->string('installation_id', 64)->unique();
                $table->boolean('is_schedule_enabled')->default(true);
                $table->string('schedule_frequency', 20)->default('daily');
                $table->string('schedule_time', 10)->default('02:00');
                $table->string('schedule_timezone', 50)->default('Asia/Kolkata');
                $table->unsignedInteger('retention_daily_days')->default(30);
                $table->unsignedInteger('retention_weekly_weeks')->default(12);
                $table->unsignedInteger('retention_monthly_months')->default(12);
                $table->boolean('auto_verify')->default(true);
                $table->string('notify_email')->nullable();
                $table->string('notify_whatsapp')->nullable();
                $table->string('active_key_version', 20)->default('v1');
                $table->boolean('encryption_enabled')->default(true);
                $table->string('storage_provider', 32)->default('google_drive');
                $table->timestamps();
            });
        }

        // 2. Backup Connections (Google Drive OAuth)
        if (!Schema::hasTable('backup_connections')) {
            Schema::create('backup_connections', function (Blueprint $table) {
                $table->id();
                $table->string('provider', 32)->default('google_drive');
                $table->string('account_email')->nullable();
                $table->string('account_name')->nullable();
                $table->string('folder_id')->nullable();
                $table->string('folder_name')->nullable();
                $table->text('access_token')->nullable(); // Encrypted at rest
                $table->text('refresh_token')->nullable(); // Encrypted at rest
                $table->timestamp('token_expires_at')->nullable();
                $table->boolean('is_active')->default(false);
                $table->timestamp('last_authorized_at')->nullable();
                $table->text('last_error')->nullable();
                $table->json('scopes')->nullable();
                $table->timestamps();
            });
        }

        // 3. Backup Runs (Lifecycle & Restore Points)
        if (!Schema::hasTable('backup_runs')) {
            Schema::create('backup_runs', function (Blueprint $table) {
                $table->id();
                $table->uuid('uuid')->unique();
                $table->string('installation_id', 64)->index();
                $table->string('type', 32)->default('manual'); // manual, daily, weekly, monthly, pre_restore_safety
                $table->string('status', 32)->default('queued')->index();
                $table->string('current_step', 64)->nullable();
                $table->unsignedTinyInteger('progress_percent')->default(0);
                $table->timestamp('started_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->unsignedInteger('duration_seconds')->default(0);
                $table->unsignedBigInteger('database_size_bytes')->default(0);
                $table->unsignedBigInteger('files_size_bytes')->default(0);
                $table->unsignedBigInteger('total_size_bytes')->default(0);
                $table->unsignedInteger('database_records_count')->default(0);
                $table->unsignedInteger('files_count')->default(0);
                $table->string('checksum_sha256', 64)->nullable();
                $table->string('encryption_algo', 32)->default('AES-256-GCM');
                $table->string('encryption_key_version', 20)->default('v1');
                $table->boolean('is_verified')->default(false)->index();
                $table->timestamp('verified_at')->nullable();
                $table->text('verification_notes')->nullable();
                $table->boolean('is_protected')->default(false)->index(); // Legal hold / protected from pruning
                $table->longText('manifest_data')->nullable(); // Encrypted manifest JSON
                $table->text('error_message')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }

        // 4. Backup Artifacts (Database, Uploads, Manifests)
        if (!Schema::hasTable('backup_artifacts')) {
            Schema::create('backup_artifacts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('backup_run_id')->constrained('backup_runs')->cascadeOnDelete();
                $table->string('artifact_type', 32); // database, files, manifest, safety_backup
                $table->string('file_name');
                $table->unsignedBigInteger('file_size_bytes')->default(0);
                $table->string('mime_type', 64)->default('application/octet-stream');
                $table->string('sha256_checksum', 64);
                $table->string('google_drive_file_id')->nullable()->index();
                $table->string('google_drive_md5', 64)->nullable();
                $table->string('encryption_iv', 64)->nullable();
                $table->string('encryption_tag', 64)->nullable();
                $table->string('local_temp_path')->nullable();
                $table->string('upload_status', 32)->default('pending'); // pending, uploading, uploaded, failed
                $table->text('resumable_session_url')->nullable();
                $table->unsignedBigInteger('bytes_uploaded')->default(0);
                $table->timestamps();
            });
        }

        // 5. Backup Schedules
        if (!Schema::hasTable('backup_schedules')) {
            Schema::create('backup_schedules', function (Blueprint $table) {
                $table->id();
                $table->string('frequency', 20)->default('daily'); // daily, weekly, monthly
                $table->string('time_of_day', 10)->default('02:00');
                $table->unsignedTinyInteger('day_of_week')->nullable(); // 0-6 (Sunday-Saturday)
                $table->unsignedTinyInteger('day_of_month')->nullable(); // 1-31
                $table->string('timezone', 50)->default('Asia/Kolkata');
                $table->boolean('is_active')->default(true);
                $table->timestamp('last_run_at')->nullable();
                $table->timestamp('next_run_at')->nullable();
                $table->timestamps();
            });
        }

        // 6. Backup Audit Logs
        if (!Schema::hasTable('backup_audit_logs')) {
            Schema::create('backup_audit_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('backup_run_id')->nullable()->constrained('backup_runs')->nullOnDelete();
                $table->string('action', 64)->index();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->string('result', 20)->default('success'); // success, failure, warning
                $table->json('details')->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('backup_audit_logs');
        Schema::dropIfExists('backup_schedules');
        Schema::dropIfExists('backup_artifacts');
        Schema::dropIfExists('backup_runs');
        Schema::dropIfExists('backup_connections');
        Schema::dropIfExists('backup_settings');
    }
};
