<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Schema::table('biometric_devices', function (Blueprint $table) {
        //     $table->unsignedInteger('restart_count')->default(0)->after('settings');
        //     $table->string('last_restart_reason')->nullable()->after('restart_count');
        // });
    }

    public function down(): void
    {
        // Schema::table('biometric_devices', function (Blueprint $table) {
        //     $table->dropColumn(['restart_count', 'last_restart_reason']);
        // });
    }
};
