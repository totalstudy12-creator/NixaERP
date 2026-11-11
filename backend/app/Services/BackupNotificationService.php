<?php

namespace App\Services;

use App\Models\BackupRun;
use App\Models\BackupSetting;
use App\Models\User;
use Exception;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class BackupNotificationService
{
    /**
     * Dispatch notification for a completed backup run.
     */
    public function notifyBackupSuccess(BackupRun $run): void
    {
        $settings = $this->getSettings();
        if (!$settings['notifications_enabled'] || !$settings['notify_on_success']) {
            return;
        }

        $title = "✅ NixaERP Backup Succeeded [{$run->run_code}]";
        $body = "Automated backup run {$run->run_code} ({$run->type}) completed successfully.\n"
            . "Destination: Google Drive\n"
            . "Total Size: " . $this->formatBytes($run->total_size_bytes) . "\n"
            . "Artifacts: " . $run->artifacts()->count() . "\n"
            . "Verification: " . ($run->is_verified ? 'Verified' : 'Pending') . "\n"
            . "Completed At: " . ($run->completed_at ? $run->completed_at->toDateTimeString() : now()->toDateTimeString());

        $this->deliver($title, $body, 'system.backup.success', $run->id, $settings['notification_emails']);
    }

    /**
     * Dispatch notification for a failed backup run.
     */
    public function notifyBackupFailure(BackupRun $run, string $errorMessage): void
    {
        $settings = $this->getSettings();
        if (!$settings['notifications_enabled'] || !$settings['notify_on_failure']) {
            return;
        }

        $title = "🚨 CRITICAL: NixaERP Backup Failed [{$run->run_code}]";
        $body = "Backup run {$run->run_code} ({$run->type}) FAILED.\n"
            . "Error Diagnostic: {$errorMessage}\n"
            . "Status: {$run->status}\n"
            . "Failed At: " . now()->toDateTimeString() . "\n\n"
            . "Action Required: Please inspect Backup Center and verify Google Drive connection, storage quota, and server logs.";

        $this->deliver($title, $body, 'system.backup.failed', $run->id, $settings['notification_emails']);
    }

    /**
     * Dispatch notification for a disaster recovery restoration.
     */
    public function notifyRestoreCompleted(BackupRun $run, bool $success, ?string $errorMessage = null): void
    {
        $settings = $this->getSettings();
        if (!$settings['notifications_enabled']) {
            return;
        }

        if ($success) {
            $title = "🔄 NixaERP Disaster Recovery Restore Completed [{$run->run_code}]";
            $body = "Backup restore operation for {$run->run_code} has successfully finished.\n"
                . "Restored Database & Uploaded Assets.\n"
                . "Time: " . now()->toDateTimeString();
        } else {
            $title = "🚨 DANGER: NixaERP Restore Failed & Rolled Back [{$run->run_code}]";
            $body = "Restore operation failed. System was safely reverted to pre-restore snapshot.\n"
                . "Reason: {$errorMessage}\n"
                . "Time: " . now()->toDateTimeString();
        }

        $this->deliver($title, $body, 'system.backup.restore', $run->id, $settings['notification_emails']);
    }

    /**
     * Read configured settings.
     */
    protected function getSettings(): array
    {
        $notifEnabled = BackupSetting::get('notifications_enabled', '1') === '1';
        $notifySuccess = BackupSetting::get('notify_on_success', '1') === '1';
        $notifyFailure = BackupSetting::get('notify_on_failure', '1') === '1';
        $emailsRaw = BackupSetting::get('notification_emails', '');

        $emails = array_filter(array_map('trim', explode(',', $emailsRaw)));

        return [
            'notifications_enabled' => $notifEnabled,
            'notify_on_success' => $notifySuccess,
            'notify_on_failure' => $notifyFailure,
            'notification_emails' => $emails,
        ];
    }

    /**
     * Send email and in-app notifications.
     */
    protected function deliver(string $title, string $body, string $event, ?int $runId, array $emails): void
    {
        // 1. Log to system logs
        Log::info("BackupNotificationService [{$event}]: {$title}\n{$body}");

        // 2. Send emails
        foreach ($emails as $email) {
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
                try {
                    Mail::raw($body, function ($message) use ($email, $title) {
                        $message->to($email)->subject($title);
                    });
                } catch (Exception $e) {
                    Log::warning("BackupNotificationService: Mail send failed to {$email}: " . $e->getMessage());
                }
            }
        }

        // 3. Deliver to in-app database notifications table if present
        try {
            if (DB::getSchemaBuilder()->hasTable('notifications')) {
                // Find system admins or first active super admin
                $admins = User::whereHas('roles', function ($q) {
                    $q->whereIn('name', ['admin', 'super_admin', 'super-admin', 'Super Admin']);
                })->limit(5)->get();

                if ($admins->isEmpty()) {
                    $admins = User::limit(1)->get();
                }

                foreach ($admins as $admin) {
                    DB::table('notifications')->insert([
                        'id' => (string) Str::uuid(),
                        'type' => 'App\\Notifications\\BackupSystemAlert',
                        'notifiable_type' => 'App\\Models\\User',
                        'notifiable_id' => $admin->id,
                        'data' => json_encode([
                            'title' => $title,
                            'message' => $body,
                            'event' => $event,
                            'backup_run_id' => $runId,
                            'timestamp' => now()->toIso8601String(),
                        ]),
                        'read_at' => null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        } catch (Exception $e) {
            Log::debug("BackupNotificationService: in-app notification insertion skipped: " . $e->getMessage());
        }
    }

    /**
     * Helper to format bytes into readable string.
     */
    protected function formatBytes(int $bytes): string
    {
        if ($bytes >= 1073741824) {
            return number_format($bytes / 1073741824, 2) . ' GB';
        }
        if ($bytes >= 1048576) {
            return number_format($bytes / 1048576, 2) . ' MB';
        }
        if ($bytes >= 1024) {
            return number_format($bytes / 1024, 2) . ' KB';
        }
        return $bytes . ' B';
    }
}
