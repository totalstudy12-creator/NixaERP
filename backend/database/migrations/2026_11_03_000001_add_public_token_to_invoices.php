<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('invoices')) {
            Schema::table('invoices', function (Blueprint $table) {
                if (!Schema::hasColumn('invoices', 'public_token')) {
                    $table->string('public_token', 64)->nullable()->unique()->after('invoice_no');
                }
            });

            // Fast raw backfill
            try {
                if (DB::getDriverName() === 'sqlite') {
                    DB::statement("UPDATE invoices SET public_token = hex(randomblob(16)) WHERE public_token IS NULL OR public_token = ''");
                } else {
                    DB::statement("UPDATE invoices SET public_token = MD5(CONCAT(id, invoice_no, RAND(), NOW())) WHERE public_token IS NULL OR public_token = ''");
                }
            } catch (\Throwable $e) {
                // Ignore if empty
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('invoices') && Schema::hasColumn('invoices', 'public_token')) {
            Schema::table('invoices', function (Blueprint $table) {
                $table->dropColumn('public_token');
            });
        }
    }
};
