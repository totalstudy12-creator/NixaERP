<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('backup_runs') && !Schema::hasColumn('backup_runs', 'run_code')) {
            Schema::table('backup_runs', function (Blueprint $table) {
                $table->string('run_code', 64)->nullable()->index()->after('installation_id');
            });
        }

        // Backfill existing rows that have empty run_code
        if (Schema::hasTable('backup_runs') && Schema::hasColumn('backup_runs', 'run_code')) {
            $runs = DB::table('backup_runs')
                ->whereNull('run_code')
                ->orWhere('run_code', '')
                ->get(['id', 'uuid', 'created_at']);

            foreach ($runs as $run) {
                $dateStr = !empty($run->created_at) ? date('Ymd', strtotime($run->created_at)) : date('Ymd');
                $shortId = strtoupper(substr(str_replace('-', '', !empty($run->uuid) ? $run->uuid : (string) $run->id), 0, 8));
                DB::table('backup_runs')
                    ->where('id', $run->id)
                    ->update([
                        'run_code' => "BKP-{$dateStr}-{$shortId}",
                    ]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('backup_runs') && Schema::hasColumn('backup_runs', 'run_code')) {
            Schema::table('backup_runs', function (Blueprint $table) {
                $table->dropColumn('run_code');
            });
        }
    }
};
