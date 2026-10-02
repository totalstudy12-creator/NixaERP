<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    /**
     * ANY-of (default) or ALL-of via pipe syntax.
     *
     *   ->middleware('permission:view users')                          // single
     *   ->middleware('permission:view users,edit users')               // ANY-of
     *   ->middleware('permission:view users|edit users')               // ALL-of
     *
     * Admin / Super Admin bypasses every check via User::hasAnyPermission()
     * → User::permissions() which returns every active permission for those roles.
     */
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (empty($permissions)) {
            return $next($request);
        }

        // ALL-of groups (pipe-delimited).
        foreach ($permissions as $entry) {
            if (! str_contains($entry, '|')) {
                continue;
            }
            $required = array_values(array_filter(array_map('trim', explode('|', $entry))));
            if (! empty($required) && ! $user->hasAllPermissions($required)) {
                return $this->forbidden($request, $required);
            }
        }

        // ANY-of for the non-pipe entries.
        $anyOf = array_values(array_filter(
            $permissions,
            fn (string $p) => ! str_contains($p, '|')
        ));

        if (! empty($anyOf) && ! $user->hasAnyPermission($anyOf)) {
            return $this->forbidden($request, $anyOf);
        }

        return $next($request);
    }

    /**
     * @param  array<int, string>  $required
     */
    private function forbidden(Request $request, array $required): Response
    {
        $routeParameters = $request->route()?->parameters() ?? [];
        $resourceId = collect($routeParameters)->first(
            fn ($value) => is_scalar($value) && is_numeric($value)
        );

        Log::warning('RBAC permission denied', [
            'user_id' => $request->user()?->id,
            'roles' => $request->user()?->roles->pluck('name')->all() ?? [],
            'action' => $request->method(),
            'module' => explode('/', $request->path())[1] ?? null,
            'permissions' => $required,
            'resource_id' => $resourceId,
            'company_id' => $request->input('company_id', $request->query('company_id')),
            'branch_id' => $request->input('branch_id', $request->query('branch_id')),
            'route' => $request->route()?->getName(),
            'result' => 'denied',
        ]);

        $notificationRoute = str_contains($request->path(), '/notifications') || str_contains($request->path(), '/daily-summary');

        return response()->json([
            'message' => "You don't have permission to perform this action.",
            'code' => $notificationRoute ? 'NOTIFICATION_PERMISSION_DENIED' : 'PERMISSION_DENIED',
        ], Response::HTTP_FORBIDDEN);
    }
}