<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fingerprint_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('finger_index');   // 0–9 (thumb right, etc.)
            $table->binary('template_data');                // encrypted template
            $table->string('template_format')->default('raw');
            $table->unsignedInteger('size_bytes')->default(0);
            $table->timestamps();

            $table->unique(['employee_id', 'finger_index']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fingerprint_templates');
    }
};