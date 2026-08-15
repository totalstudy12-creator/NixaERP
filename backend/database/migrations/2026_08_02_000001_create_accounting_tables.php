<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounting_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code')->unique();
            $table->string('type');
            $table->string('normal_balance')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('accounting_journals', function (Blueprint $table) {
            $table->id();
            $table->string('reference');
            $table->text('description')->nullable();
            $table->decimal('amount', 12, 2)->default(0);
            $table->string('entry_type')->default('general');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounting_journals');
        Schema::dropIfExists('accounting_accounts');
    }
};
