<?php

namespace App\Services;

use App\Models\BackupRun;
use App\Models\BackupSetting;
use Carbon\Carbon;
use Exception;
use Illuminate\Support\Facades\Log;

class BackupRetentionService
{
    public function __construct(
        protected GoogleDriveService $driveService,
        protected BackupAuditService $auditService
    ) {}

    /**
     * Apply retention policy to existing backup runs.
     * Evaluates daily, weekly, and monthly rules and prunes expired runs.
     * Enforces the absolute invariant: NEVER prune the newest or only recovery point.
     */
    public function applyRetention(): array
    {
        $dailyDays = (int) BackupSetting::get('retention_daily_days', 30);
        $weeklyWeeks = (int) BackupSetting::get('retention_weekly_weeks', 12);
        $monthlyMonths = (int) BackupSetting::get('retention_monthly_months', 12);
        $minKeep = (int) BackupSetting::get('retention_min_keep', 2);

        // Fetch all completed runs ordered newest to oldest
        $allRuns = BackupRun::whereIn('status', ['completed', 'verified'])
            ->orderByDesc('completed_at')
            ->get();

        if ($allRuns->count() <= $minKeep) {
            return [
                'pruned_count' => 0,
                'retained_count' => $allRuns->count(),
                'message' => "Total backups ({$allRuns->count()}) is at or below minimum retention threshold ({$minKeep}). No backups pruned.",
                'pruned_runs' => [],
            ];
        }

        // Always protect the absolute newest run
        $newestRun = $allRuns->first();

        $prunedRuns = [];
        $retainedRuns = [];

        $now = now();
        $dailyCutoff = $now->copy()->subDays($dailyDays);
        $weeklyCutoff = $now->copy()->subWeeks($weeklyWeeks);
        $monthlyCutoff = $now->copy()->subMonths($monthlyMonths);

        // Track weekly and monthly retained slots
        $retainedWeeks = [];
        $retainedMonths = [];

        foreach ($allRuns as $run) {
            // Absolute invariant: Protect newest run always
            if ($run->id === $newestRun->id) {
                $retainedRuns[] = $run;
                continue;
            }

            $runDate = $run->completed_at ? Carbon::parse($run->completed_at) : Carbon::parse($run->created_at);
            $weekKey = $runDate->format('o-W'); // Year-Week
            $monthKey = $runDate->format('Y-m'); // Year-Month

            $shouldRetain = false;

            // 1. Daily retention: within dailyCutoff
            if ($runDate->greaterThanOrEqualTo($dailyCutoff)) {
                $shouldRetain = true;
            }

            // 2. Weekly retention: keep 1 run per week within weeklyCutoff
            if (!$shouldRetain && $runDate->greaterThanOrEqualTo($weeklyCutoff)) {
                if (!isset($retainedWeeks[$weekKey])) {
                    $retainedWeeks[$weekKey] = $run->id;
                    $shouldRetain = true;
                }
            }

            // 3. Monthly retention: keep 1 run per month within monthlyCutoff
            if (!$shouldRetain && $runDate->greaterThanOrEqualTo($monthlyCutoff)) {
                if (!isset($retainedMonths[$monthKey])) {
                    $retainedMonths[$monthKey] = $run->id;
                    $shouldRetain = true;
                }
            }

            if ($shouldRetain) {
                $retainedRuns[] = $run;
            } else {
                // Check if pruning this would leave less than minKeep
                if ((count($allRuns) - count($prunedRuns) - 1) < $minKeep) {
                    $retainedRuns[] = $run;
                } else {
                    $prunedRuns[] = $run;
                }
            }
        }

        // Prune the identified runs
        $prunedDetails = [];
        foreach ($prunedRuns as $pruneCandidate) {
            try {
                $this->pruneSingleRun($pruneCandidate);
                $prunedDetails[] = [
                    'id' => $pruneCandidate->id,
                    'run_code' => $pruneCandidate->run_code,
                    'created_at' => $pruneCandidate->created_at->toIso8601String(),
                ];
            } catch (Exception $e) {
                Log::error("Failed to prune backup run {$pruneCandidate->run_code}: " . $e->getMessage());
            }
        }

        $this->auditService->log(
            'prune_backups',
            'success',
            [
                'pruned_count' => count($prunedDetails),
                'retained_count' => count($retainedRuns),
                'pruned' => $prunedDetails,
            ]
        );

        return [
            'pruned_count' => count($prunedDetails),
            'retained_count' => count($retainedRuns),
            'pruned_runs' => $prunedDetails,
            'message' => "Retention applied successfully. Pruned " . count($prunedDetails) . " backups, retained " . count($retainedRuns) . ".",
        ];
    }

    /**
     * Delete artifacts from Google Drive and remove/mark the backup run.
     */
    public function pruneSingleRun(BackupRun $run): void
    {
        $connection = $run->connection;

        foreach ($run->artifacts as $artifact) {
            if ($artifact->drive_file_id && $connection) {
                try {
                    $this->driveService->deleteFile($connection, $artifact->drive_file_id);
                } catch (Exception $e) {
                    Log::warning("BackupRetentionService: Drive delete failed for artifact {$artifact->id}: " . $e->getMessage());
                }
            }
            $artifact->delete();
        }

        $run->update([
            'status' => 'pruned',
            'verification_notes' => 'Pruned by automated retention policy on ' . now()->toIso8601String(),
        ]);
    }
}
