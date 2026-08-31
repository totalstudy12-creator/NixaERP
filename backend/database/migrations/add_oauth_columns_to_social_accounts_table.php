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
        Schema::table('social_accounts', function (Blueprint $table) {
            if (!Schema::hasColumn('social_accounts', 'access_token')) {
                $table->string('access_token')->nullable();
            }
            if (!Schema::hasColumn('social_accounts', 'refresh_token')) {
                $table->string('refresh_token')->nullable();
            }
            if (!Schema::hasColumn('social_accounts', 'token_expires_at')) {
                $table->timestamp('token_expires_at')->nullable();
            }
            if (!Schema::hasColumn('social_accounts', 'platform_user_id')) {
                $table->string('platform_user_id')->nullable();
            }
            if (!Schema::hasColumn('social_accounts', 'platform_username')) {
                $table->string('platform_username')->nullable();
            }
            if (!Schema::hasColumn('social_accounts', 'scopes')) {
                $table->text('scopes')->nullable();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            $columnsToDrop = [
                'access_token',
                'refresh_token',
                'token_expires_at',
                'platform_user_id',
                'platform_username',
                'scopes'
            ];
            foreach ($columnsToDrop as $column) {
                if (Schema::hasColumn('social_accounts', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};