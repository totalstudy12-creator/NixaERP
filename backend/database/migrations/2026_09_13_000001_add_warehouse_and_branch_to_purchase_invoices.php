<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_invoices', function (Blueprint $table) {
            if (!Schema::hasColumn('purchase_invoices', 'warehouse_id')) {
                $table->unsignedBigInteger('warehouse_id')
                    ->nullable()
                    ->after('company_id');

                $table->index('warehouse_id', 'pi_warehouse_id_idx');
            }

            if (!Schema::hasColumn('purchase_invoices', 'branch_id')) {
                $table->unsignedBigInteger('branch_id')
                    ->nullable()
                    ->after('warehouse_id');

                $table->index('branch_id', 'pi_branch_id_idx');
            }
        });
    }

    public function down(): void
    {
        Schema::table('purchase_invoices', function (Blueprint $table) {
            if (Schema::hasColumn('purchase_invoices', 'warehouse_id')) {
                $table->dropIndex('pi_warehouse_id_idx');
                $table->dropColumn('warehouse_id');
            }
            if (Schema::hasColumn('purchase_invoices', 'branch_id')) {
                $table->dropIndex('pi_branch_id_idx');
                $table->dropColumn('branch_id');
            }
        });
    }
};