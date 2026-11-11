<?php

namespace App\Console\Commands;

use App\Models\BackupRun;
use App\Services\BackupVerificationService;
use Exception;
use Illuminate\Console\Command;

class VerifyBackupsCommand extends Command
{
    protected $signature = 'backup:verify 
                            {--run-id= : Specific Backup Run ID to verify}
                            {--deep : Download artifacts and perform deep cryptographic & schema verification}';

    protected $description = 'Verify remote integrity and cryptographic validity of backup artifacts on Google Drive';

    public function handle(BackupVerificationService $verifier): int
    {
        $runId = $this->option('run-id');
        $deep = (bool) $this->option('deep');

        $query = BackupRun::whereIn('status', ['completed', 'verified']);
        if ($runId) {
            $query->where('id', $runId);
        } else {
            $query->orderByDesc('completed_at')->limit(5);
        }

        $runs = $query->get();
        if ($runs->isEmpty()) {
            $this->warn('No eligible completed backups found to verify.');
            return Command::SUCCESS;
        }

        $allOk = true;
        foreach ($runs as $run) {
            $this->info("Verifying run {$run->run_code} (deep check: " . ($deep ? 'yes' : 'no') . ")...");
            try {
                $result = $verifier->verifyRun($run, $deep);
                if ($result['success']) {
                    $this->info("  ✅ Verified successfully.");
                } else {
                    $this->error("  ❌ Verification failed: " . ($result['notes'] ?? 'Unknown error'));
                    $allOk = false;
                }
            } catch (Exception $e) {
                $this->error("  ❌ Verification threw exception: " . $e->getMessage());
                $allOk = false;
            }
        }

        return $allOk ? Command::SUCCESS : Command::FAILURE;
    }
}
