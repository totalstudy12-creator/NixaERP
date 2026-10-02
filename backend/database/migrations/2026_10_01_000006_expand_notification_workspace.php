<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'company_id')) $table->unsignedBigInteger('company_id')->nullable()->index();
            if (! Schema::hasColumn('users', 'branch_id')) $table->unsignedBigInteger('branch_id')->nullable()->index();
        });

        Schema::table('notifications', function (Blueprint $table) {
            if (! Schema::hasColumn('notifications', 'company_id')) $table->unsignedBigInteger('company_id')->nullable()->index();
            if (! Schema::hasColumn('notifications', 'branch_id')) $table->unsignedBigInteger('branch_id')->nullable()->index();
            if (! Schema::hasColumn('notifications', 'event')) $table->string('event')->nullable()->index();
            if (! Schema::hasColumn('notifications', 'category')) $table->string('category')->nullable()->index();
            if (! Schema::hasColumn('notifications', 'priority')) $table->string('priority')->default('normal')->index();
            if (! Schema::hasColumn('notifications', 'channel')) $table->string('channel')->default('in_app')->index();
            if (! Schema::hasColumn('notifications', 'resource_type')) $table->string('resource_type')->nullable();
            if (! Schema::hasColumn('notifications', 'resource_id')) $table->unsignedBigInteger('resource_id')->nullable();
            if (! Schema::hasColumn('notifications', 'archived_at')) $table->timestamp('archived_at')->nullable()->index();
            if (! Schema::hasColumn('notifications', 'dedupe_key')) $table->string('dedupe_key')->nullable()->unique();
        });

        Schema::table('notification_logs', function (Blueprint $table) {
            if (! Schema::hasColumn('notification_logs', 'created_by')) $table->unsignedBigInteger('created_by')->nullable()->index();
            if (! Schema::hasColumn('notification_logs', 'company_id')) $table->unsignedBigInteger('company_id')->nullable()->index();
            if (! Schema::hasColumn('notification_logs', 'branch_id')) $table->unsignedBigInteger('branch_id')->nullable()->index();
            if (! Schema::hasColumn('notification_logs', 'event')) $table->string('event')->nullable()->index();
            if (! Schema::hasColumn('notification_logs', 'delivered_at')) $table->timestamp('delivered_at')->nullable();
            if (! Schema::hasColumn('notification_logs', 'failed_at')) $table->timestamp('failed_at')->nullable();
            if (! Schema::hasColumn('notification_logs', 'idempotency_key')) $table->string('idempotency_key')->nullable()->unique();
            if (! Schema::hasColumn('notification_logs', 'fallback_from_delivery_id')) $table->unsignedBigInteger('fallback_from_delivery_id')->nullable()->index();
        });

        Schema::table('notification_templates', function (Blueprint $table) {
            if (! Schema::hasColumn('notification_templates', 'company_id')) $table->unsignedBigInteger('company_id')->nullable()->index();
            if (! Schema::hasColumn('notification_templates', 'branch_id')) $table->unsignedBigInteger('branch_id')->nullable()->index();
        });

        if (! Schema::hasTable('notification_user_settings')) {
            Schema::create('notification_user_settings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
                $table->boolean('quiet_hours')->default(false);
                $table->time('quiet_from')->default('22:00:00');
                $table->time('quiet_to')->default('07:00:00');
                $table->boolean('critical_override')->default(true);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('notification_automation_rules')) {
            Schema::create('notification_automation_rules', function (Blueprint $table) {
                $table->id();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->string('event')->index();
                $table->string('label')->nullable();
                $table->json('channels');
                $table->json('recipients')->nullable();
                $table->string('priority')->default('normal');
                $table->foreignId('template_id')->nullable()->constrained('notification_templates')->nullOnDelete();
                $table->boolean('enabled')->default(true)->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('scheduled_notifications')) {
            Schema::create('scheduled_notifications', function (Blueprint $table) {
                $table->id();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->string('title');
                $table->text('message');
                $table->string('channel');
                $table->string('priority')->default('normal');
                $table->json('recipients')->nullable();
                $table->string('schedule_type')->default('once');
                $table->dateTime('run_at');
                $table->string('timezone')->default('Asia/Kolkata');
                $table->boolean('enabled')->default(true)->index();
                $table->dateTime('last_run_at')->nullable();
                $table->dateTime('next_run_at')->nullable()->index();
                $table->string('idempotency_key')->nullable()->unique();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('notification_fallback_settings')) {
            Schema::create('notification_fallback_settings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
                $table->boolean('enabled')->default(false);
                $table->json('channel_order');
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('notification_audit_logs')) {
            Schema::create('notification_audit_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
                $table->unsignedBigInteger('notification_id')->nullable()->index();
                $table->string('action')->index();
                $table->json('context')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_audit_logs');
        Schema::dropIfExists('notification_fallback_settings');
        Schema::dropIfExists('scheduled_notifications');
        Schema::dropIfExists('notification_automation_rules');
        Schema::dropIfExists('notification_user_settings');

        foreach ([
            'users' => ['company_id', 'branch_id'],
            'notification_templates' => ['company_id', 'branch_id'],
            'notification_logs' => ['created_by', 'company_id', 'branch_id', 'event', 'delivered_at', 'failed_at', 'idempotency_key', 'fallback_from_delivery_id'],
            'notifications' => ['company_id', 'branch_id', 'event', 'category', 'priority', 'channel', 'resource_type', 'resource_id', 'archived_at', 'dedupe_key'],
        ] as $tableName => $columns) {
            if (! Schema::hasTable($tableName)) continue;
            Schema::table($tableName, function (Blueprint $table) use ($tableName, $columns) {
                foreach ($columns as $column) {
                    if (Schema::hasColumn($tableName, $column)) $table->dropColumn($column);
                }
            });
        }
    }
};