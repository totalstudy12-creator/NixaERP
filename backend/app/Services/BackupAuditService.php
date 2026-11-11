<?php

namespace App\Services;

use App\Models\BackupAuditLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

class BackupAuditService
{
    /**
     * Record an audit event in backup_audit_logs.
     */
    public function log(
        string $action,
        string $status = 'success',
        ?array $details = null,
        ?string $errorMessage = null,
        ?int $backupRunId = null,
        ?int $backupConnectionId = null,
        ?int $userId = null
    ): BackupAuditLog {
        $actorId = $userId !== null ? $userId : Auth::id();

        return BackupAuditLog::create([
            'backup_run_id' => $backupRunId,
            'backup_connection_id' => $backupConnectionId,
            'user_id' => $actorId,
            'action' => $action,
            'status' => $status,
            'details' => $details ?: [],
            'error_message' => $errorMessage,
            'ip_address' => Request::ip() ?? '127.0.0.1',
            'user_agent' => Request::userAgent() ?? 'System / Artisan CLI',
        ]);
    }
}
