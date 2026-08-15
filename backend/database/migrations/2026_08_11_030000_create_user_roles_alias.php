<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('user_roles')) {
            Schema::create('user_roles', function (Blueprint $table) {
                $table->unsignedBigInteger('user_id');
                $table->unsignedBigInteger('role_id');
                $table->index('user_id');
                $table->index('role_id');
            });

            // attempt to add foreign keys if role_user exists
            try {
                Schema::table('user_roles', function (Blueprint $table) {
                    $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
                    $table->foreign('role_id')->references('id')->on('roles')->onDelete('cascade');
                });
            } catch (\Throwable $e) {
                // ignore if foreign keys cannot be applied in this environment
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('user_roles')) {
            Schema::dropIfExists('user_roles');
        }
    }
};
