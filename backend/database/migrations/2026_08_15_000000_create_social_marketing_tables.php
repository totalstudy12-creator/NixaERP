<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('social_accounts')) {
            Schema::create('social_accounts', function (Blueprint $table) {
                $table->id();
                $table->string('platform');
                $table->string('account_name')->nullable();
                $table->string('username')->nullable();
                $table->string('external_account_id')->nullable();
                $table->string('status')->default('disconnected');
                $table->string('access_token_ref')->nullable();
                $table->timestamp('token_expires_at')->nullable();
                $table->timestamp('connected_at')->nullable();
                $table->timestamp('last_sync_at')->nullable();
                $table->json('metadata')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('social_posts')) {
            Schema::create('social_posts', function (Blueprint $table) {
                $table->id();
                $table->longText('content');
                $table->string('status')->default('draft');
                $table->timestamp('scheduled_at')->nullable();
                $table->timestamp('published_at')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->string('media_path')->nullable();
                $table->string('media_type')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('social_post_accounts')) {
            Schema::create('social_post_accounts', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('post_id');
                $table->unsignedBigInteger('account_id')->nullable();
                $table->string('platform');
                $table->string('external_post_id')->nullable();
                $table->string('status')->default('pending');
                $table->text('error')->nullable();
                $table->timestamp('published_at')->nullable();
                $table->timestamps();

                $table->foreign('post_id')->references('id')->on('social_posts')->cascadeOnDelete();
                $table->foreign('account_id')->references('id')->on('social_accounts')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('social_post_accounts');
        Schema::dropIfExists('social_posts');
        Schema::dropIfExists('social_accounts');
    }
};
