<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('biometric_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->string('device_uid')->unique();          // ESP32 MAC or custom ID
            $table->string('name');                          // e.g., 'Reception'
            $table->integer('cpu')->default(0);
            $table->integer('memory')->default(0);
            $table->integer('flash')->default(0);
            $table->decimal('temperature', 5, 1)->default(0);
            $table->string('uptime')->nullable();
            $table->integer('signal')->default(0);
            $table->string('power')->default('External');
            $table->string('wifi')->default('Disconnected');
            $table->string('enrollment_status')->nullable();
            $table->unsignedBigInteger('enrollment_employee_id')->nullable();
            $table->integer('restart_count')->default(0);
            $table->string('last_restart_reason')->nullable();
            $table->string('ip_address')->nullable();
            $table->string('firmware_version')->nullable();
            $table->string('status')->default('online');     // online, offline, syncing
            $table->timestamp('last_sync_at')->nullable();
            $table->json('settings')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('biometric_devices');
    }
};