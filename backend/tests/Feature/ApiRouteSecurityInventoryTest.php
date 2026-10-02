<?php

namespace Tests\Feature;

use App\Http\Middleware\AuthenticateBiometricDevice;
use App\Http\Middleware\CheckPermission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class ApiRouteSecurityInventoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_routes_have_authentication_or_an_explicit_protocol_guard(): void
    {
        $publicProtocolRoutes = [
            'api/login',
            'api/auth/login',
            'api/auth/2fa/verify',
            'api/auth/{provider}/callback',
            'api/marketing/gbp-locations',
            'api/status',
            'api/webhooks/whatsapp',
            'api/webhooks/twilio/notification-status',
        ];
        $apiRoutes = 0;

        foreach (Route::getRoutes() as $route) {
            $uri = $route->uri();
            if (! str_starts_with($uri, 'api/')) {
                continue;
            }

            $apiRoutes++;
            $middleware = implode('|', $route->gatherMiddleware());
            $hasSanctum = str_contains($middleware, 'auth:sanctum')
                || str_contains($middleware, 'Authenticate:sanctum');
            $hasDeviceCredential = str_contains($middleware, AuthenticateBiometricDevice::class)
                || str_contains($middleware, 'biometric.device');
            $hasExplicitPublicProtocol = in_array($uri, $publicProtocolRoutes, true);

            $this->assertTrue(
                $hasSanctum || $hasDeviceCredential || $hasExplicitPublicProtocol,
                'API route lacks an authentication protocol: ' . implode('|', $route->methods()) . ' ' . $uri
            );
        }

        $this->assertGreaterThan(300, $apiRoutes, 'Route inventory unexpectedly omitted API routes.');
    }

    public function test_sensitive_authenticated_routes_have_permission_middleware_or_self_scope(): void
    {
        $selfScopedRoutes = [
            'POST api/logout',
            'POST api/auth/logout',
            'GET api/me',
            'GET api/profile',
            'GET api/auth/me',
            'GET api/auth/profile',
            'GET api/auth/2fa/status',
            'POST api/auth/2fa/enable',
            'POST api/auth/2fa/confirm',
            'POST api/auth/2fa/disable',
            'POST api/auth/2fa/recovery-codes',
            'GET api/permissions/me',
            'GET api/audit-logs',
            'POST api/audit-logs',
            'DELETE api/audit-logs',
            'POST api/notifications/push-subscriptions',
            'DELETE api/notifications/push-subscriptions',
            'GET api/mcp/status',
            'GET api/mcp/context',
            'GET api/mcp/context/{section}',
            'GET api/auth/{provider}/redirect-url',
            'GET api/auth/{provider}/redirect',
            'POST api/auth/{provider}/disconnect',
        ];

        foreach (Route::getRoutes() as $route) {
            $uri = $route->uri();
            if (! str_starts_with($uri, 'api/')) {
                continue;
            }

            $middleware = implode('|', $route->gatherMiddleware());
            $hasSanctum = str_contains($middleware, 'auth:sanctum')
                || str_contains($middleware, 'Authenticate:sanctum');
            if (! $hasSanctum) {
                continue;
            }

            $method = collect($route->methods())->first(fn ($value) => $value !== 'HEAD');
            if (in_array($method . ' ' . $uri, $selfScopedRoutes, true)) {
                continue;
            }

            $hasPermission = str_contains($middleware, CheckPermission::class)
                || str_contains($middleware, 'permission:');
            $hasDeviceCredential = str_contains($middleware, AuthenticateBiometricDevice::class)
                || str_contains($middleware, 'biometric.device');

            $this->assertTrue(
                $hasPermission || $hasDeviceCredential,
                'Sensitive API route lacks permission middleware: ' . $method . ' ' . $uri
            );
        }
    }
}