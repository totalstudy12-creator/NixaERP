<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('advances', function (Blueprint $table) {

            $table->id();

            // Employee
            $table->foreignId('employee_id')
                ->constrained()
                ->cascadeOnDelete();

            // Advance Information
            $table->string('advance_no', 30)->unique();
            $table->decimal('amount', 12, 2);

            // Dates
            $table->date('request_date');
            $table->date('payment_date')->nullable();

            // Payment
            $table->enum('payment_method', [
                'cash',
                'bank_transfer',
                'upi',
                'cheque',
                'other'
            ])->nullable();

            $table->string('transaction_reference')->nullable();

            // Status
            $table->enum('status', [
                'draft',
                'pending',
                'approved',
                'paid',
                'completed',
                'cancelled',
                'rejected'
            ])->default('pending');

            // Approval
            $table->foreignId('approved_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            // Description
            $table->text('reason')->nullable();
            $table->text('remarks')->nullable();

            // Supporting Document
            $table->string('attachment')->nullable();

            // Audit
            $table->foreignId('created_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->foreignId('updated_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->softDeletes();
            $table->timestamps();

            // Indexes
            $table->index('employee_id');
            $table->index('advance_no');
            $table->index('status');
            $table->index('request_date');
            $table->index('payment_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('advances');
    }
};