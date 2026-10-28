<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Create table to store AI conversation sessions.
 *
 * The table is idempotent – if it already exists the migration does nothing.
 */
return new class extends Migration {
    public function up()
    {
        if (!Schema::hasTable('ai_conversations')) {
            Schema::create('ai_conversations', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->enum('type', ['voice', 'text']);
                $table->string('title');
                $table->string('preview')->nullable();
                $table->timestamp('timestamp')->useCurrent();
                $table->integer('duration_seconds')->nullable();
                $table->json('messages');
                $table->timestamps();
            });
        }
    }

    public function down()
    {
        Schema::dropIfExists('ai_conversations');
    }
};
?>