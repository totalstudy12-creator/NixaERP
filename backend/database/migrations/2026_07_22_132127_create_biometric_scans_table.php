<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('biometric_scans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('biometric_device_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('scan_time');
            $table->string('scan_type');                    // fingerprint, face, rfid
            $table->unsignedSmallInteger('finger_index')->nullable();
            $table->string('result')->default('success');   // success, failed, unknown
            $table->float('confidence')->nullable();        // match score
            $table->text('raw_data')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('biometric_scans');
    }
};