<?php
// database/migrations/2026_09_13_000000_widen_stock_movements_reference_type.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Convert enum → string so any future reference type works
        // and historical values are preserved.
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->string('reference_type', 50)->change();
        });
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->string('reference_type', 50)->change();
        });
    }
};