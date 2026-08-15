<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('ai_providers') || !Schema::hasColumn('ai_providers', 'key')) {
            return;
        }

        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::statement('ALTER TABLE `ai_providers` MODIFY `key` TEXT NULL');
    }

    public function down(): void
    {
        if (!Schema::hasTable('ai_providers') || !Schema::hasColumn('ai_providers', 'key')) {
            return;
        }

        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::statement('ALTER TABLE `ai_providers` MODIFY `key` VARCHAR(255) NULL');
    }
};
