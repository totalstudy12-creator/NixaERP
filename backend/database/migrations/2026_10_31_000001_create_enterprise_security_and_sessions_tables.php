<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add account control and lockout columns to users table
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'status')) {
                $table->string('status', 32)->default('active')->index()->after('remember_token');
            }
            if (!Schema::hasColumn('users', 'banned_at')) {
                $table->timestamp('banned_at')->nullable()->after('status');
            }
            if (!Schema::hasColumn('users', 'banned_until')) {
                $table->timestamp('banned_until')->nullable()->after('banned_at');
            }
            if (!Schema::hasColumn('users', 'banned_reason')) {
                $table->text('banned_reason')->nullable()->after('banned_until');
            }
            if (!Schema::hasColumn('users', 'banned_by_user_id')) {
                $table->unsignedBigInteger('banned_by_user_id')->nullable()->after('banned_reason');
            }
            if (!Schema::hasColumn('users', 'failed_login_count')) {
                $table->unsignedInteger('failed_login_count')->default(0)->after('banned_by_user_id');
            }
            if (!Schema::hasColumn('users', 'last_failed_login_at')) {
                $table->timestamp('last_failed_login_at')->nullable()->after('failed_login_count');
            }
            if (!Schema::hasColumn('users', 'lockout_until')) {
                $table->timestamp('lockout_until')->nullable()->after('last_failed_login_at');
            }
            if (!Schema::hasColumn('users', 'last_login_at')) {
                $table->timestamp('last_login_at')->nullable()->after('lockout_until');
            }
            if (!Schema::hasColumn('users', 'last_login_ip')) {
                $table->string('last_login_ip', 45)->nullable()->after('last_login_at');
            }
        });

        // 2. Login attempts tracking
        if (!Schema::hasTable('login_attempts')) {
            Schema::create('login_attempts', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->string('email', 255)->index();
                $table->string('ip_address', 45)->index();
                $table->text('user_agent')->nullable();
                $table->string('device_type', 50)->nullable();
                $table->string('browser', 50)->nullable();
                $table->string('platform', 50)->nullable();
                $table->string('location', 150)->nullable();
                $table->string('status', 32)->index(); // success, failed, blocked, locked_out
                $table->string('failure_reason', 255)->nullable();
                $table->unsignedBigInteger('company_id')->nullable();
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->timestamps();

                $table->index(['email', 'created_at']);
                $table->index(['ip_address', 'created_at']);
            });
        }

        // 3. User active sessions tracking
        if (!Schema::hasTable('user_sessions')) {
            Schema::create('user_sessions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->index();
                $table->unsignedBigInteger('sanctum_token_id')->nullable()->index();
                $table->string('session_id', 64)->nullable()->unique();
                $table->string('ip_address', 45);
                $table->text('user_agent')->nullable();
                $table->string('device_name', 100)->nullable();
                $table->string('device_type', 50)->nullable();
                $table->string('browser', 50)->nullable();
                $table->string('platform', 50)->nullable();
                $table->string('location', 150)->nullable();
                $table->timestamp('last_activity_at')->useCurrent();
                $table->timestamp('expires_at')->nullable();
                $table->boolean('is_active')->default(true)->index();
                $table->timestamp('revoked_at')->nullable();
                $table->string('revocation_reason', 255)->nullable();
                $table->timestamps();

                $table->index(['user_id', 'is_active']);
            });
        }

        // 4. IP firewall / access control rules
        if (!Schema::hasTable('ip_access_rules')) {
            Schema::create('ip_access_rules', function (Blueprint $table) {
                $table->id();
                $table->string('ip_address', 64)->index(); // single IP or CIDR (IPv4/IPv6)
                $table->string('type', 20)->default('block')->index(); // block, allow
                $table->string('reason', 255)->nullable();
                $table->text('notes')->nullable();
                $table->unsignedBigInteger('created_by')->nullable()->index();
                $table->boolean('is_active')->default(true)->index();
                $table->timestamp('expires_at')->nullable()->index(); // null = permanent
                $table->timestamps();
            });
        }

        // 5. User ban history audit
        if (!Schema::hasTable('user_ban_histories')) {
            Schema::create('user_ban_histories', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->index();
                $table->string('action', 40); // ban, suspend, unban, reactivate, force_logout
                $table->text('reason')->nullable();
                $table->unsignedInteger('duration_days')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->unsignedBigInteger('performed_by')->nullable()->index();
                $table->timestamps();
            });
        }

        // 6. Extended columns on audit_logs table
        if (Schema::hasTable('audit_logs')) {
            Schema::table('audit_logs', function (Blueprint $table) {
                if (!Schema::hasColumn('audit_logs', 'event_id')) {
                    $table->string('event_id', 64)->nullable()->index()->after('id');
                }
                if (!Schema::hasColumn('audit_logs', 'company_id')) {
                    $table->unsignedBigInteger('company_id')->nullable()->index()->after('user_email');
                }
                if (!Schema::hasColumn('audit_logs', 'branch_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->index()->after('company_id');
                }
                if (!Schema::hasColumn('audit_logs', 'resource_type')) {
                    $table->string('resource_type', 100)->nullable()->index()->after('action');
                }
                if (!Schema::hasColumn('audit_logs', 'resource_id')) {
                    $table->string('resource_id', 100)->nullable()->index()->after('resource_type');
                }
                if (!Schema::hasColumn('audit_logs', 'previous_values')) {
                    $table->json('previous_values')->nullable()->after('message');
                }
                if (!Schema::hasColumn('audit_logs', 'changed_values')) {
                    $table->json('changed_values')->nullable()->after('previous_values');
                }
                if (!Schema::hasColumn('audit_logs', 'request_id')) {
                    $table->string('request_id', 64)->nullable()->index()->after('user_agent');
                }
                if (!Schema::hasColumn('audit_logs', 'reason')) {
                    $table->string('reason', 255)->nullable()->after('request_id');
                }
            });
        }

        // 7. Scoped settings extensions
        if (Schema::hasTable('settings')) {
            Schema::table('settings', function (Blueprint $table) {
                if (!Schema::hasColumn('settings', 'scope')) {
                    $table->string('scope', 32)->default('global')->index()->after('group');
                }
                if (!Schema::hasColumn('settings', 'scope_id')) {
                    $table->unsignedBigInteger('scope_id')->nullable()->index()->after('scope');
                }
                if (!Schema::hasColumn('settings', 'type')) {
                    $table->string('type', 32)->default('string')->after('scope_id');
                }
                if (!Schema::hasColumn('settings', 'is_secret')) {
                    $table->boolean('is_secret')->default(false)->after('is_public');
                }
                if (!Schema::hasColumn('settings', 'updated_by')) {
                    $table->unsignedBigInteger('updated_by')->nullable()->after('is_secret');
                }
            });
        }
    }

    public function down(): void
    {
        // Preserved for safe rollbacks without dropping historical data
    }
};
