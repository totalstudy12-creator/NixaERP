<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            $table->text('access_token')->nullable()->change();
            $table->text('refresh_token')->nullable()->change();
            $table->text('scopes')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            $table->string('access_token', 255)->nullable()->change();
            $table->string('refresh_token', 255)->nullable()->change();
            $table->string('scopes', 255)->nullable()->change();
        });
    }
};