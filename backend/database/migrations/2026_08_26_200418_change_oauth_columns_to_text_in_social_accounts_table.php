<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            if (!Schema::hasColumn('social_accounts', 'access_token')) {
                $table->text('access_token')->nullable();
            }

            if (!Schema::hasColumn('social_accounts', 'refresh_token')) {
                $table->text('refresh_token')->nullable();
            }

            if (!Schema::hasColumn('social_accounts', 'scopes')) {
                $table->text('scopes')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            if (Schema::hasColumn('social_accounts', 'access_token')) {
                $table->dropColumn('access_token');
            }

            if (Schema::hasColumn('social_accounts', 'refresh_token')) {
                $table->dropColumn('refresh_token');
            }

            if (Schema::hasColumn('social_accounts', 'scopes')) {
                $table->dropColumn('scopes');
            }
        });
    }
};