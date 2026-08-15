<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('offline_sync_queue', function (Blueprint $table) {
            $table->id();
            $table->foreignId('biometric_device_id')->constrained()->cascadeOnDelete();
            $table->json('payload');                       // full scan data
            $table->unsignedTinyInteger('retry_count')->default(0);
            $table->string('status')->default('pending');  // pending, synced, failed
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('offline_sync_queue');
    }
};