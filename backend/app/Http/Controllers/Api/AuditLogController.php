<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'limit'         => ['sometimes', 'integer', 'min:1', 'max:1000'],
            'page'          => ['sometimes', 'integer', 'min:1'],
            'module'        => ['sometimes', 'string', 'max:100'],
            'action'        => ['sometimes', 'string', 'max:160'],
            'status'        => ['sometimes', 'in:success,error,info,warning'],
            'user_id'       => ['sometimes', 'integer', 'min:1'],
            'company_id'    => ['sometimes', 'integer'],
            'branch_id'     => ['sometimes', 'integer'],
            'resource_type' => ['sometimes', 'string', 'max:100'],
            'resource_id'   => ['sometimes', 'string', 'max:100'],
            'search'        => ['sometimes', 'string', 'max:255'],
            'ip_address'    => ['sometimes', 'string', 'max:45'],
            'from'          => ['sometimes', 'date'],
            'to'            => ['sometimes', 'date', 'after_or_equal:from'],
        ]);

        $actor = $request->user();
        $canViewAll = $actor->roles()
            ->whereIn('name', ['Admin', 'Super Admin'])
            ->exists();

        $query = AuditLog::query()
            ->when(! $canViewAll, fn ($q) => $q->where('user_id', $actor->id))
            ->when(isset($filters['module']), fn ($q) => $q->where('module', $filters['module']))
            ->when(isset($filters['action']), fn ($q) => $q->where('action', 'like', "%{$filters['action']}%"))
            ->when(isset($filters['status']), fn ($q) => $q->where('status', $filters['status']))
            ->when($canViewAll && isset($filters['user_id']), fn ($q) => $q->where('user_id', $filters['user_id']))
            ->when(isset($filters['company_id']), fn ($q) => $q->where('company_id', $filters['company_id']))
            ->when(isset($filters['branch_id']), fn ($q) => $q->where('branch_id', $filters['branch_id']))
            ->when(isset($filters['resource_type']), fn ($q) => $q->where('resource_type', $filters['resource_type']))
            ->when(isset($filters['resource_id']), fn ($q) => $q->where('resource_id', $filters['resource_id']))
            ->when(isset($filters['ip_address']), fn ($q) => $q->where('ip_address', 'like', "%{$filters['ip_address']}%"))
            ->when(isset($filters['from']), fn ($q) => $q->whereDate('created_at', '>=', $filters['from']))
            ->when(isset($filters['to']), fn ($q) => $q->whereDate('created_at', '<=', $filters['to']));

        if (!empty($filters['search'])) {
            $search = $filters['search'];
            $query->where(function ($q) use ($search) {
                $q->where('message', 'like', "%{$search}%")
                  ->orWhere('action', 'like', "%{$search}%")
                  ->orWhere('user_name', 'like', "%{$search}%")
                  ->orWhere('user_email', 'like', "%{$search}%")
                  ->orWhere('ip_address', 'like', "%{$search}%")
                  ->orWhere('resource_id', 'like', "%{$search}%");
            });
        }

        $logs = $query->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($filters['limit'] ?? 1000)
            ->get();

        return response()->json($logs->map(fn (AuditLog $log) => $this->serialize($log))->values());
    }

    public function show(int $id): JsonResponse
    {
        $log = AuditLog::findOrFail($id);
        return response()->json([
            'success' => true,
            'data'    => $this->serialize($log),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'module'  => ['required', 'string', 'max:100'],
            'action'  => ['required', 'string', 'max:160'],
            'status'  => ['required', 'in:success,error,info,warning'],
            'message' => ['required', 'string', 'max:10000'],
        ]);

        $log = AuditLogger::log(
            $validated['module'],
            $validated['action'],
            $validated['status'],
            $validated['message'],
            $request->input('resource_type'),
            $request->input('resource_id'),
            $request->input('previous_values'),
            $request->input('changed_values'),
            $request->input('reason'),
            $request->user(),
            $request
        );

        return response()->json($this->serialize($log), 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $isSystemAdmin = $request->user()->roles()
            ->whereIn('name', ['Admin', 'Super Admin'])
            ->exists();

        if (! $isSystemAdmin) {
            return response()->json([
                'message' => 'You do not have permission to clear the audit trail.',
            ], 403);
        }

        DB::table('audit_logs')->delete();

        return response()->json(['message' => 'Audit logs cleared.']);
    }

    /**
     * Export Audit Trail to CSV with formula injection defense.
     */
    public function exportCsv(Request $request): StreamedResponse
    {
        $isAuthorized = $request->user()->roles()
            ->whereIn('name', ['Admin', 'Super Admin'])
            ->exists() || $request->user()->hasPermission('audit.export');

        if (! $isAuthorized) {
            abort(403, 'Unauthorized to export audit trails.');
        }

        $filename = 'audit_logs_' . date('Y-m-d_His') . '.csv';

        $headers = [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            'Pragma'              => 'no-cache',
            'Cache-Control'       => 'must-revalidate, post-check=0, pre-check=0',
            'Expires'             => '0',
        ];

        return response()->stream(function () {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, [
                'Event ID', 'Timestamp', 'Module', 'Action', 'Status', 'User Name',
                'User Email', 'IP Address', 'Resource Type', 'Resource ID', 'Message',
            ]);

            AuditLog::query()
                ->orderByDesc('created_at')
                ->chunk(500, function ($logs) use ($handle) {
                    foreach ($logs as $log) {
                        fputcsv($handle, [
                            $log->event_id ?: (string) $log->id,
                            $log->created_at?->toISOString(),
                            $this->sanitizeCell($log->module),
                            $this->sanitizeCell($log->action),
                            $log->status,
                            $this->sanitizeCell($log->user_name),
                            $this->sanitizeCell($log->user_email),
                            $log->ip_address,
                            $this->sanitizeCell($log->resource_type),
                            $this->sanitizeCell($log->resource_id),
                            $this->sanitizeCell($log->message),
                        ]);
                    }
                });

            fclose($handle);
        }, 200, $headers);
    }

    /**
     * Formula Injection Defense: Prepend single quote if cell starts with =, +, -, or @
     */
    private function sanitizeCell(?string $value): string
    {
        if ($value === null) return '';
        $trimmed = trim($value);
        if (preg_match('/^[=+\-@]/', $trimmed)) {
            return "'" . $trimmed;
        }
        return $trimmed;
    }

    private function serialize(AuditLog $log): array
    {
        return [
            'id'              => (string) $log->id,
            'event_id'        => $log->event_id ?: (string) $log->id,
            'timestamp'       => $log->created_at?->toISOString(),
            'module'          => $log->module,
            'action'          => $log->action,
            'status'          => $log->status,
            'message'         => $log->message,
            'resource_type'   => $log->resource_type,
            'resource_id'     => $log->resource_id,
            'previous_values' => $log->previous_values,
            'changed_values'  => $log->changed_values,
            'company_id'      => $log->company_id,
            'branch_id'       => $log->branch_id,
            'user'            => $log->user_id === null && $log->user_name === null ? null : [
                'id'    => $log->user_id,
                'name'  => $log->user_name,
                'email' => $log->user_email,
            ],
            'user_id'         => $log->user_id,
            'user_name'       => $log->user_name,
            'user_email'      => $log->user_email,
            'ip_address'      => $log->ip_address,
            'user_agent'      => $log->user_agent,
            'request_id'      => $log->request_id,
            'reason'          => $log->reason,
        ];
    }
}