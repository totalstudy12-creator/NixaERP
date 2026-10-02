<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class WhatsAppService
{
    public function status(): array
    {
        if (! $this->isConfigured()) {
            return $this->emptyStatus('not_configured');
        }

        try {
            $response = Http::withHeaders($this->headers())
                ->timeout(10)
                ->get($this->baseUrl() . '/status');

            if ($response->failed()) {
                return $this->emptyStatus('service_unavailable', 'WhatsApp Web.js service is unreachable.');
            }

            $data = is_array($response->json()) ? $response->json() : [];
            $payload = $data['data'] ?? $data;
            $status = (string) ($payload['status'] ?? 'unknown');
            return [
                'provider' => 'whatsapp_web_js',
                'status' => $status,
                'configured' => true,
                'connected' => (bool) ($payload['connected'] ?? false),
                'ready' => (bool) ($payload['ready'] ?? false),
                'authenticated' => (bool) ($payload['authenticated'] ?? false),
                'qr_available' => (bool) ($payload['qr_available'] ?? false),
                'last_connected_at' => $payload['last_connected_at'] ?? null,
                'last_error' => $payload['last_error'] ?? null,
            ];
        } catch (\Throwable $throwable) {
            return $this->emptyStatus('service_unavailable', $throwable->getMessage());
        }
    }

    public function qr(): ?string
    {
        if (! $this->isConfigured()) {
            return null;
        }

        try {
            $response = Http::withHeaders($this->headers())
                ->timeout(10)
                ->get($this->baseUrl() . '/qr');

            if ($response->failed()) {
                return null;
            }

            $data = $response->json('data', []);
            if (! is_array($data)) {
                return null;
            }

            return (string) ($data['qr'] ?? '');
        } catch (\Throwable $throwable) {
            throw new RuntimeException('Unable to retrieve WhatsApp QR code: ' . $throwable->getMessage(), 0, $throwable);
        }
    }

    public function connect(): array
    {
        if (! $this->isConfigured()) {
            return $this->emptyStatus('not_configured');
        }

        try {
            $response = Http::withHeaders($this->headers())
                ->timeout(20)
                ->post($this->baseUrl() . '/connect');

            $data = $response->json('data', $response->json() ?? []);
            if ($response->failed()) {
                return $this->emptyStatus('service_unavailable', 'The WhatsApp service rejected the connect request.');
            }

            return [
                'provider' => 'whatsapp_web_js',
                'status' => (string) ($data['status'] ?? 'starting'),
                'configured' => true,
                'connected' => (bool) ($data['connected'] ?? false),
                'ready' => (bool) ($data['ready'] ?? false),
                'authenticated' => (bool) ($data['authenticated'] ?? false),
                'qr_available' => (bool) ($data['qr_available'] ?? false),
                'last_connected_at' => $data['last_connected_at'] ?? null,
                'last_error' => $data['last_error'] ?? null,
            ];
        } catch (\Throwable $throwable) {
            return $this->emptyStatus('service_unavailable', $throwable->getMessage());
        }
    }

    public function logout(): array
    {
        if (! $this->isConfigured()) {
            return $this->emptyStatus('not_configured');
        }

        try {
            $response = Http::withHeaders($this->headers())
                ->timeout(20)
                ->post($this->baseUrl() . '/logout');

            $payload = $response->json('data', $response->json() ?? []);
            if ($response->failed()) {
                return $this->emptyStatus('service_unavailable', 'The WhatsApp service rejected the logout request.');
            }

            return [
                'provider' => 'whatsapp_web_js',
                'status' => (string) ($payload['status'] ?? 'disconnected'),
                'configured' => true,
                'connected' => false,
                'ready' => false,
                'authenticated' => false,
                'qr_available' => false,
                'last_connected_at' => $payload['last_connected_at'] ?? null,
                'last_error' => $payload['last_error'] ?? null,
            ];
        } catch (\Throwable $throwable) {
            return $this->emptyStatus('service_unavailable', $throwable->getMessage());
        }
    }

    public function test(string $to, string $message): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'status' => 'failed', 'error' => 'WhatsApp Web.js service is not configured.'];
        }

        try {
            $response = Http::withHeaders($this->headers())
                ->timeout(25)
                ->post($this->baseUrl() . '/test', [
                    'to' => $to,
                    'message' => $message,
                ]);

            if ($response->failed()) {
                $payload = $response->json() ?? [];

                return [
                    'success' => false,
                    'status' => 'failed',
                    'error' => $payload['error'] ?? $payload['message'] ?? 'WhatsApp Web.js service rejected the test message.',
                ];
            }

            $payload = $response->json() ?? [];
            return [
                'success' => (bool) ($payload['success'] ?? false),
                'status' => (string) ($payload['status'] ?? 'failed'),
                'message_id' => $payload['message_id'] ?? null,
                'error' => $payload['error'] ?? null,
            ];
        } catch (\Throwable $throwable) {
            return ['success' => false, 'status' => 'failed', 'error' => $throwable->getMessage()];
        }
    }

    public function send(string $to, string $message, ?int $notificationId = null, ?string $event = null): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'status' => 'failed', 'error' => 'WhatsApp Web.js service is not configured.'];
        }

        try {
            $response = Http::withHeaders($this->headers())
                ->timeout(25)
                ->post($this->baseUrl() . '/internal/whatsapp/send', [
                    'to' => $to,
                    'message' => $message,
                    'notification_id' => $notificationId,
                    'event' => $event ?? 'system.alert',
                ]);

            if ($response->failed()) {
                $body = $response->json() ?? [];
                return ['success' => false, 'status' => 'failed', 'error' => $body['error'] ?? 'The WhatsApp Web.js service was unavailable.'];
            }

            $payload = $response->json() ?? [];
            return [
                'success' => (bool) ($payload['success'] ?? false),
                'status' => (string) ($payload['status'] ?? 'failed'),
                'message_id' => $payload['message_id'] ?? null,
                'error' => $payload['error'] ?? null,
            ];
        } catch (\Throwable $throwable) {
            return ['success' => false, 'status' => 'failed', 'error' => $throwable->getMessage()];
        }
    }

    public function health(): array
    {
        if (! $this->isConfigured()) {
            return [
                'service' => 'whatsapp_web_js',
                'status' => 'not_configured',
                'whatsapp_status' => 'not_configured',
                'uptime' => 0,
                'last_error' => null,
            ];
        }

        try {
            $response = Http::withHeaders($this->headers())
                ->timeout(10)
                ->get($this->baseUrl() . '/health');

            if ($response->failed()) {
                return [
                    'service' => 'whatsapp_web_js',
                    'status' => 'unavailable',
                    'whatsapp_status' => 'service_unavailable',
                    'uptime' => 0,
                    'last_error' => 'WhatsApp service health check failed.',
                ];
            }

            $payload = $response->json() ?? [];
            return [
                'service' => 'whatsapp_web_js',
                'status' => $payload['status'] ?? 'healthy',
                'whatsapp_status' => $payload['whatsapp_status'] ?? 'unknown',
                'uptime' => (int) ($payload['uptime'] ?? 0),
                'last_error' => $payload['last_error'] ?? null,
            ];
        } catch (\Throwable $throwable) {
            return [
                'service' => 'whatsapp_web_js',
                'status' => 'unavailable',
                'whatsapp_status' => 'service_unavailable',
                'uptime' => 0,
                'last_error' => $throwable->getMessage(),
            ];
        }
    }

    private function isConfigured(): bool
    {
        $serviceUrl = trim((string) config('services.whatsapp_web_js.service_url'));
        $serviceToken = trim((string) config('services.whatsapp_web_js.service_token'));

        return $serviceUrl !== '' && $serviceToken !== '' && (bool) config('services.whatsapp_web_js.enabled', true);
    }

    private function baseUrl(): string
    {
        return rtrim((string) config('services.whatsapp_web_js.service_url'), '/');
    }

    private function headers(): array
    {
        return [
            'X-WhatsApp-Service-Token' => (string) config('services.whatsapp_web_js.service_token'),
            'Accept' => 'application/json',
        ];
    }

    private function emptyStatus(string $status, ?string $lastError = null): array
    {
        return [
            'provider' => 'whatsapp_web_js',
            'status' => $status,
            'configured' => false,
            'connected' => false,
            'ready' => false,
            'authenticated' => false,
            'qr_available' => false,
            'last_connected_at' => null,
            'last_error' => $lastError,
        ];
    }
}
