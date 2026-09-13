<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_invoices', function (Blueprint $table) {
            if (!Schema::hasColumn('purchase_invoices', 'tcs_percent')) {
                $table->decimal('tcs_percent', 8, 2)
                    ->default(0)
                    ->after('round_off');
            }
        });
    }

    public function down(): void
    {
        Schema::table('purchase_invoices', function (Blueprint $table) {
            if (Schema::hasColumn('purchase_invoices', 'tcs_percent')) {
                $table->dropColumn('tcs_percent');
            }
        });
    }
};