<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('loans')) {
            Schema::create('loans', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
                $table->decimal('amount', 12, 2)->default(0);
                $table->decimal('installment_amount', 12, 2)->nullable();
                $table->integer('installments')->nullable();
                $table->string('status')->nullable();
                $table->decimal('balance', 12, 2)->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('loans');
    }
};
