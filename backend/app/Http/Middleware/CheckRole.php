<?php
// app/Http/Middleware/CheckRole.php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class CheckRole
{
    public function handle(Request $request, Closure $next, string $role)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated. Please login.',
            ], 401);
        }

        $roles = explode('|', $role);

        if (!$user->hasAnyRole($roles)) {
            return response()->json([
                'success' => false,
                'message' => 'Access denied. Required role: ' . implode(' or ', $roles),
                'required_roles' => $roles,
            ], 403);
        }

        return $next($request);
    }
}