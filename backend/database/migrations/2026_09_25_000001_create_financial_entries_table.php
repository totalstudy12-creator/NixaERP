<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('financial_entries')) return;
        Schema::create('financial_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->restrictOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('direction', ['income', 'expense']);
            $table->string('category', 100);
            $table->string('counterparty', 190)->nullable();
            $table->decimal('amount', 15, 2);
            $table->decimal('tax_amount', 15, 2)->nullable()->default(0);
            $table->decimal('total_amount', 15, 2)->nullable();
            $table->unsignedBigInteger('account_id')->nullable();
            $table->unsignedBigInteger('project_id')->nullable();
            $table->date('entry_date');
            $table->string('payment_method', 40);
            $table->string('reference_no', 100)->nullable();
            $table->text('description')->nullable();
            $table->text('notes')->nullable();
            $table->string('status', 20)->default('completed');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['company_id', 'direction', 'entry_date'], 'financial_entries_company_direction_date_idx');
            $table->index(['branch_id', 'direction', 'entry_date'], 'financial_entries_branch_direction_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_entries');
    }
};
