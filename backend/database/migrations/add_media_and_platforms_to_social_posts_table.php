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
        Schema::table('social_posts', function (Blueprint $table) {
            // Check and add columns only if they do not exist
            if (!Schema::hasColumn('social_posts', 'platforms')) {
                $table->json('platforms')->nullable();
            }
            if (!Schema::hasColumn('social_posts', 'media_path')) {
                $table->string('media_path')->nullable();
            }
            if (!Schema::hasColumn('social_posts', 'media_type')) {
                $table->string('media_type')->nullable();
            }
            if (!Schema::hasColumn('social_posts', 'external_post_ids')) {
                $table->json('external_post_ids')->nullable();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('social_posts', function (Blueprint $table) {
            $columnsToDrop = ['platforms', 'media_path', 'media_type', 'external_post_ids'];
            foreach ($columnsToDrop as $column) {
                if (Schema::hasColumn('social_posts', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};