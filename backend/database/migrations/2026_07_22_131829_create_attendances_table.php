<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('status')->default('present');
            $table->time('check_in')->nullable();
            $table->time('check_out')->nullable();
            $table->string('shift')->default('General Shift (09:00 - 18:00)');
            $table->unsignedInteger('overtime')->default(0); // minutes
            $table->text('notes')->nullable();
            $table->string('device')->nullable();          // e.g., 'ESP32-001'
            $table->string('location')->nullable();
            $table->timestamps();

            $table->unique(['employee_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendances');
    }
};