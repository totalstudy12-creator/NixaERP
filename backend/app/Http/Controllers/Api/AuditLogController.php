<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'limit' => ['sometimes', 'integer', 'min:1', 'max:1000'],
            'module' => ['sometimes', 'string', 'max:100'],
            'status' => ['sometimes', 'in:success,error,info,warning'],
            'user_id' => ['sometimes', 'integer', 'min:1'],
            'from' => ['sometimes', 'date'],
            'to' => ['sometimes', 'date', 'after_or_equal:from'],
        ]);

        $actor = $request->user();
        $canViewAll = $actor->roles()
            ->whereIn('name', ['Admin', 'Super Admin'])
            ->exists();

        $logs = AuditLog::query()
            ->when(! $canViewAll, fn ($query) => $query->where('user_id', $actor->id))
            ->when(isset($filters['module']), fn ($query) => $query->where('module', $filters['module']))
            ->when(isset($filters['status']), fn ($query) => $query->where('status', $filters['status']))
            ->when($canViewAll && isset($filters['user_id']), fn ($query) => $query->where('user_id', $filters['user_id']))
            ->when(isset($filters['from']), fn ($query) => $query->whereDate('created_at', '>=', $filters['from']))
            ->when(isset($filters['to']), fn ($query) => $query->whereDate('created_at', '<=', $filters['to']))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($filters['limit'] ?? 1000)
            ->get();

        return response()->json($logs->map(fn (AuditLog $log) => $this->serialize($log))->values());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'module' => ['required', 'string', 'max:100'],
            'action' => ['required', 'string', 'max:160'],
            'status' => ['required', 'in:success,error,info,warning'],
            'message' => ['required', 'string', 'max:10000'],
        ]);
        $actor = $request->user();

        $log = AuditLog::create([
            ...$validated,
            'user_id' => $actor->id,
            'user_name' => $actor->name,
            'user_email' => $actor->email,
            'ip_address' => $request->ip(),
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 1000),
        ]);

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

    private function serialize(AuditLog $log): array
    {
        return [
            'id' => (string) $log->id,
            'timestamp' => $log->created_at?->toISOString(),
            'module' => $log->module,
            'action' => $log->action,
            'status' => $log->status,
            'message' => $log->message,
            'user' => $log->user_id === null && $log->user_name === null ? null : [
                'id' => $log->user_id,
                'name' => $log->user_name,
                'email' => $log->user_email,
            ],
            'user_id' => $log->user_id,
            'user_name' => $log->user_name,
            'user_email' => $log->user_email,
            'ip_address' => $log->ip_address,
            'user_agent' => $log->user_agent,
        ];
    }
}