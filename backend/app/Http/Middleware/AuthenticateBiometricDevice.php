<?php

namespace App\Http\Middleware;

use App\Models\BiometricDevice;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateBiometricDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if (! $token) {
            return response()->json(['message' => 'Unauthenticated device.'], Response::HTTP_UNAUTHORIZED);
        }

        $device = BiometricDevice::query()
            ->where('api_token_hash', hash('sha256', $token))
            ->first();

        if (! $device) {
            return response()->json(['message' => 'Unauthenticated device.'], Response::HTTP_UNAUTHORIZED);
        }

        $requestedUid = $request->input('device_uid');
        $routeDevice = $request->route('device');
        $requestedDeviceId = $routeDevice instanceof BiometricDevice
            ? (int) $routeDevice->getKey()
            : (is_numeric($routeDevice) ? (int) $routeDevice : null);

        if (($requestedUid !== null && ! hash_equals($device->device_uid, (string) $requestedUid))
            || ($requestedDeviceId !== null && $requestedDeviceId !== (int) $device->id)) {
            return response()->json(['message' => 'You do not have access to this device.'], Response::HTTP_FORBIDDEN);
        }

        $request->attributes->set('biometric_device', $device);

        return $next($request);
    }
}