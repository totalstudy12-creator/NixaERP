<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('two_factor_recovery_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('code_hash', 64);
            $table->timestamp('used_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'code_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('two_factor_recovery_codes');
    }
};