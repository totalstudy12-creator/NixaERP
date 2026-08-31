<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->nullable()->constrained('social_accounts')->nullOnDelete();
            $table->string('channel'); // 'email', 'whatsapp', 'facebook', 'instagram', etc.
            $table->string('external_id')->nullable(); // ID from the platform (e.g., email message ID, WhatsApp SID)
            $table->string('sender'); // email address or phone number
            $table->text('body');
            $table->timestamp('received_at');
            $table->boolean('is_read')->default(false);
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }
    public function down(): void {
        Schema::dropIfExists('messages');
    }
};
