<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckRole
{
    /**
     * Usage: ->middleware('role:Admin,Manager')
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (empty($roles)) {
            return $next($request);
        }

        if (! $user->hasAnyRole($roles)) {
            return response()->json([
                'message'       => 'You do not have the required role.',
                'required_any'  => $roles,
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}