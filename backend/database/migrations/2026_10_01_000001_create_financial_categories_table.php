<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('financial_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('financial_categories')->nullOnDelete();
            $table->string('name', 150);
            $table->string('code', 50)->nullable();
            $table->enum('type', ['income', 'expense', 'both'])->default('expense');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['company_id', 'type', 'is_active'], 'financial_categories_company_type_active_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_categories');
    }
};
