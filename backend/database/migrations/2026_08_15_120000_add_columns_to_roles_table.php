<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('roles')) {
            Schema::table('roles', function (Blueprint $table) {
                if (!Schema::hasColumn('roles', 'group')) {
                    $table->string('group')->nullable()->after('name');
                }
                if (!Schema::hasColumn('roles', 'description')) {
                    $table->string('description')->nullable()->after('group');
                }
                if (!Schema::hasColumn('roles', 'active')) {
                    $table->boolean('active')->default(true)->after('description');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('roles')) {
            Schema::table('roles', function (Blueprint $table) {
                if (Schema::hasColumn('roles', 'group')) {
                    $table->dropColumn('group');
                }
                if (Schema::hasColumn('roles', 'description')) {
                    $table->dropColumn('description');
                }
                if (Schema::hasColumn('roles', 'active')) {
                    $table->dropColumn('active');
                }
            });
        }
    }
};
