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
        // 1. Align backup_connections table
        if (Schema::hasTable('backup_connections')) {
            Schema::table('backup_connections', function (Blueprint $table) {
                if (!Schema::hasColumn('backup_connections', 'status')) {
                    $table->string('status', 32)->default('disconnected')->after('token_expires_at');
                }
            });
        }

        // 2. Align backup_runs table
        if (Schema::hasTable('backup_runs')) {
            Schema::table('backup_runs', function (Blueprint $table) {
                if (!Schema::hasColumn('backup_runs', 'backup_connection_id')) {
                    $table->unsignedBigInteger('backup_connection_id')->nullable()->after('id');
                }
            });
        }

        // 3. Align backup_artifacts table
        if (Schema::hasTable('backup_artifacts')) {
            Schema::table('backup_artifacts', function (Blueprint $table) {
                if (!Schema::hasColumn('backup_artifacts', 'type')) {
                    $table->string('type', 32)->nullable()->after('backup_run_id');
                }
                if (!Schema::hasColumn('backup_artifacts', 'raw_size_bytes')) {
                    $table->unsignedBigInteger('raw_size_bytes')->default(0)->after('file_name');
                }
                if (!Schema::hasColumn('backup_artifacts', 'encrypted_size_bytes')) {
                    $table->unsignedBigInteger('encrypted_size_bytes')->default(0)->after('raw_size_bytes');
                }
                if (!Schema::hasColumn('backup_artifacts', 'raw_sha256')) {
                    $table->string('raw_sha256', 64)->nullable()->after('encrypted_size_bytes');
                }
                if (!Schema::hasColumn('backup_artifacts', 'encrypted_sha256')) {
                    $table->string('encrypted_sha256', 64)->nullable()->after('raw_sha256');
                }
                if (!Schema::hasColumn('backup_artifacts', 'drive_file_id')) {
                    $table->string('drive_file_id')->nullable()->after('google_drive_file_id');
                }
                if (!Schema::hasColumn('backup_artifacts', 'drive_folder_id')) {
                    $table->string('drive_folder_id')->nullable()->after('drive_file_id');
                }
                if (!Schema::hasColumn('backup_artifacts', 'is_uploaded')) {
                    $table->boolean('is_uploaded')->default(false)->after('upload_status');
                }
                if (!Schema::hasColumn('backup_artifacts', 'is_verified')) {
                    $table->boolean('is_verified')->default(false)->after('is_uploaded');
                }
                if (!Schema::hasColumn('backup_artifacts', 'uploaded_at')) {
                    $table->timestamp('uploaded_at')->nullable()->after('is_verified');
                }
                if (!Schema::hasColumn('backup_artifacts', 'verified_at')) {
                    $table->timestamp('verified_at')->nullable()->after('uploaded_at');
                }
                if (!Schema::hasColumn('backup_artifacts', 'verification_notes')) {
                    $table->text('verification_notes')->nullable()->after('verified_at');
                }
                if (!Schema::hasColumn('backup_artifacts', 'encryption_algorithm')) {
                    $table->string('encryption_algorithm', 32)->default('aes-256-gcm')->after('verification_notes');
                }
                if (!Schema::hasColumn('backup_artifacts', 'key_version')) {
                    $table->string('key_version', 20)->default('v1')->after('encryption_algorithm');
                }
                if (!Schema::hasColumn('backup_artifacts', 'metadata')) {
                    $table->json('metadata')->nullable()->after('key_version');
                }
            });
        }

        // 4. Align backup_audit_logs table
        if (Schema::hasTable('backup_audit_logs')) {
            Schema::table('backup_audit_logs', function (Blueprint $table) {
                if (!Schema::hasColumn('backup_audit_logs', 'backup_connection_id')) {
                    $table->unsignedBigInteger('backup_connection_id')->nullable()->after('backup_run_id');
                }
                if (!Schema::hasColumn('backup_audit_logs', 'status')) {
                    $table->string('status', 20)->default('success')->after('action');
                }
                if (!Schema::hasColumn('backup_audit_logs', 'error_message')) {
                    $table->text('error_message')->nullable()->after('details');
                }
                if (!Schema::hasColumn('backup_audit_logs', 'updated_at')) {
                    $table->timestamp('updated_at')->nullable()->after('created_at');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Safe no-op or column drops if needed
    }
};
