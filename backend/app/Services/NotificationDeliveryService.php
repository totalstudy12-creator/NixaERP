<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Twilio\Rest\Client;
use RuntimeException;

class NotificationDeliveryService
{
    public function channelStatus(User $user): array
    {
        $mailer = (string) config('mail.default');
        $mailReady = ! in_array($mailer, ['log', 'array'], true)
            && filled(config('mail.from.address'))
            && ! str_ends_with((string) config('mail.from.address'), '@example.com');
        $twilioReady = filled(config('services.twilio.sid')) && filled(config('services.twilio.auth_token'));
        $vapidReady = filled(config('services.webpush.public_key')) && filled(config('services.webpush.private_key'));
        $whatsappConfigured = (bool) config('services.whatsapp_web_js.enabled', true)
            && filled(config('services.whatsapp_web_js.service_url'))
            && filled(config('services.whatsapp_web_js.service_token'));
        $whatsappStatus = $this->whatsAppWorkerStatus();
        $whatsappReady = $whatsappConfigured && ($whatsappStatus['ready'] ?? false);
        $pushCount = DB::table('push_subscriptions')->where('user_id', $user->id)->count();

        return [
            'in_app' => ['configured' => true, 'ready' => true, 'detail' => 'Delivered to the ERP inbox.'],
            'email' => [
                'configured' => $mailReady,
                'ready' => $mailReady && filled($user->email),
                'detail' => $mailReady ? ($user->email ? 'SMTP mailer is configured.' : 'Add an email address to your profile.') : 'Configure a non-log MAIL_MAILER and MAIL_FROM_ADDRESS.',
            ],
            'sms' => [
                'configured' => $twilioReady && filled(config('services.twilio.sms_from')),
                'ready' => $twilioReady && filled(config('services.twilio.sms_from')) && filled($user->phone),
                'detail' => ! $twilioReady || ! filled(config('services.twilio.sms_from')) ? 'Configure Twilio account credentials and TWILIO_SMS_FROM.' : ($user->phone ? 'Twilio SMS is configured.' : 'Add a phone number to your profile.'),
            ],
            'whatsapp' => [
                'configured' => $whatsappConfigured,
                'ready' => $whatsappReady,
                'provider' => 'whatsapp_web_js',
                'status' => $whatsappStatus['status'] ?? 'not_configured',
                'connected' => $whatsappStatus['connected'] ?? false,
                'authenticated' => $whatsappStatus['authenticated'] ?? false,
                'last_error' => $whatsappStatus['last_error'] ?? null,
                'detail' => ! $whatsappConfigured ? 'Configure WHATSAPP_SERVICE_URL and WHATSAPP_SERVICE_TOKEN for the ERP WhatsApp worker.' : match ($whatsappStatus['status'] ?? 'unknown') {
                    'qr_required' => 'Scan the QR code to connect WhatsApp.',
                    'authenticating' => 'Authenticating with WhatsApp…',
                    'ready' => 'WhatsApp Web.js connected and ready.',
                    'disconnected' => 'WhatsApp is disconnected. Reconnect to resume notifications.',
                    'auth_failure' => 'WhatsApp authentication failed. Please reconnect.',
                    'error' => $whatsappStatus['last_error'] ?? 'WhatsApp worker failed to start. Check its logs and Chromium dependencies.',
                    'service_unavailable' => 'WhatsApp notification service is unavailable.',
                    default => 'WhatsApp Web.js is configured and waiting for connection.',
                },
            ],
            'push' => [
                'configured' => $vapidReady,
                'ready' => $vapidReady && $pushCount > 0,
                'public_key' => $vapidReady ? config('services.webpush.public_key') : null,
                'subscriptions' => $pushCount,
                'detail' => ! $vapidReady ? 'Configure the Web Push VAPID key pair.' : ($pushCount > 0 ? 'This browser is subscribed.' : 'Enable browser notifications on this device.'),
            ],
        ];
    }

    public function deliver(int $logId): void
    {
        $log = DB::table('notification_logs')->where('id', $logId)->first();
        if (! $log) {
            throw new RuntimeException('Notification delivery record was not found.');
        }

        $notification = DB::table('notifications')->where('id', $log->notification_id)->first();
        if (! $notification) {
            throw new RuntimeException('Notification content was not found.');
        }

        $data = json_decode((string) $notification->data, true) ?: [];
        $providerMessageId = match ($log->channel) {
            'email' => $this->sendEmail($log->recipient, $data),
            'sms' => $this->sendTwilio($log->recipient, $data, 'sms'),
            'whatsapp' => $this->sendWhatsAppWebJs($log->recipient, [
                'message' => (string) ($data['message'] ?? ''),
                'title' => (string) ($data['title'] ?? 'ERP notification'),
                'notification_id' => (int) ($log->notification_id ?? 0),
                'event' => (string) ($log->event ?? 'system.alert'),
            ]),
            'push' => $this->sendPush((int) $log->user_id, $data),
            default => throw new RuntimeException('Unsupported notification channel.'),
        };

        DB::table('notification_logs')->where('id', $logId)->update([
            'status' => 'sent',
            'provider_message_id' => $providerMessageId,
            'error_message' => null,
            'sent_at' => now(),
            'failed_at' => null,
            'updated_at' => now(),
        ]);
    }

    private function sendEmail(string $recipient, array $data): ?string
    {
        $body = (string) ($data['message'] ?? '');
        Mail::html($body, function ($message) use ($recipient, $data, $body) {
            $message->to($recipient)->subject((string) ($data['subject'] ?? $data['title'] ?? 'ERP notification'));
            $message->text(strip_tags($body));
            $attachment = $data['attachment'] ?? null;
            if (is_string($attachment) && preg_match('#^notifications/attachments/\d+/[A-Za-z0-9_-]+\.(pdf|png|jpe?g|docx?|xlsx?)$#i', $attachment) && Storage::disk('local')->exists($attachment)) {
                $message->attach(Storage::disk('local')->path($attachment));
            }
        });

        return null;
    }

    private function sendTwilio(string $recipient, array $data, string $channel): string
    {
        $client = new Client(
            (string) config('services.twilio.sid'),
            (string) config('services.twilio.auth_token'),
        );
        $from = (string) config($channel === 'sms' ? 'services.twilio.sms_from' : 'services.twilio.whatsapp_from');
        $to = $recipient;

        if ($channel === 'whatsapp') {
            $from = str_starts_with($from, 'whatsapp:') ? $from : 'whatsapp:' . $from;
            $to = str_starts_with($to, 'whatsapp:') ? $to : 'whatsapp:' . $to;
        }

        $options = [
            'from' => $from,
            'body' => (string) ($data['message'] ?? ''),
        ];
        if (filled(config('services.twilio.status_callback_url'))) {
            $options['statusCallback'] = config('services.twilio.status_callback_url');
        }
        $message = $client->messages->create($to, $options);

        return (string) $message->sid;
    }

    private function sendWhatsAppWebJs(string $recipient, array $data): string
    {
        $serviceUrl = trim((string) config('services.whatsapp_web_js.service_url'));
        $serviceToken = trim((string) config('services.whatsapp_web_js.service_token'));
        if ($serviceUrl === '' || $serviceToken === '') {
            throw new RuntimeException('WhatsApp Web.js service is not configured.');
        }

        $response = Http::withHeaders([
            'X-WhatsApp-Service-Token' => $serviceToken,
            'Accept' => 'application/json',
        ])->timeout(25)->post(rtrim($serviceUrl, '/') . '/internal/whatsapp/send', [
            'to' => $recipient,
            'message' => (string) ($data['message'] ?? ''),
            'notification_id' => $data['notification_id'] ?? null,
            'event' => $data['event'] ?? 'system.alert',
        ]);

        if ($response->failed()) {
            $payload = $response->json() ?? [];
            throw new RuntimeException($payload['error'] ?? 'WhatsApp service rejected the message.' );
        }

        $payload = $response->json() ?? [];
        if (! ($payload['success'] ?? false)) {
            throw new RuntimeException($payload['error'] ?? 'WhatsApp Web.js failed to send the notification.');
        }

        return (string) ($payload['message_id'] ?? 'whatsapp-web-js:' . now()->timestamp);
    }

    private function whatsAppWorkerStatus(): array
    {
        $serviceUrl = trim((string) config('services.whatsapp_web_js.service_url'));
        $serviceToken = trim((string) config('services.whatsapp_web_js.service_token'));
        if ($serviceUrl === '' || $serviceToken === '') {
            return ['status' => 'not_configured', 'ready' => false, 'connected' => false, 'authenticated' => false];
        }

        try {
            $response = Http::withHeaders([
                'X-WhatsApp-Service-Token' => $serviceToken,
                'Accept' => 'application/json',
            ])->timeout(10)->get(rtrim($serviceUrl, '/') . '/status');

            if ($response->failed()) {
                return ['status' => 'service_unavailable', 'ready' => false, 'connected' => false, 'authenticated' => false, 'last_error' => 'WhatsApp worker is unavailable'];
            }

            $payload = $response->json('data', $response->json() ?? []);
            if (! is_array($payload)) {
                return ['status' => 'unknown', 'ready' => false, 'connected' => false, 'authenticated' => false];
            }

            return [
                'status' => (string) ($payload['status'] ?? 'unknown'),
                'ready' => (bool) ($payload['ready'] ?? false),
                'connected' => (bool) ($payload['connected'] ?? false),
                'authenticated' => (bool) ($payload['authenticated'] ?? false),
                'last_error' => $payload['last_error'] ?? null,
            ];
        } catch (\Throwable $throwable) {
            return ['status' => 'service_unavailable', 'ready' => false, 'connected' => false, 'authenticated' => false, 'last_error' => $throwable->getMessage()];
        }
    }

    private function sendPush(int $userId, array $data): string
    {
        $subscriptions = DB::table('push_subscriptions')->where('user_id', $userId)->get();
        if ($subscriptions->isEmpty()) {
            throw new RuntimeException('No browser push subscription is registered for this user.');
        }

        $webPush = new WebPush([
            'VAPID' => [
                'subject' => config('services.webpush.subject'),
                'publicKey' => config('services.webpush.public_key'),
                'privateKey' => config('services.webpush.private_key'),
            ],
        ]);
        $payload = json_encode([
            'title' => $data['title'] ?? 'ERP notification',
            'body' => $data['message'] ?? '',
            'url' => '/notifications',
        ], JSON_THROW_ON_ERROR);

        foreach ($subscriptions as $subscription) {
            $webPush->queueNotification(Subscription::create([
                'endpoint' => $subscription->endpoint,
                'keys' => [
                    'p256dh' => $subscription->public_key,
                    'auth' => $subscription->auth_token,
                ],
                'contentEncoding' => $subscription->content_encoding,
            ]), $payload);
        }

        $delivered = 0;
        foreach ($webPush->flush() as $report) {
            if ($report->isSuccess()) {
                $delivered++;
                continue;
            }

            $statusCode = $report->getResponse()?->getStatusCode();
            if (in_array($statusCode, [404, 410], true)) {
                DB::table('push_subscriptions')->where('endpoint', $report->getEndpoint())->delete();
            }
        }

        if ($delivered === 0) {
            throw new RuntimeException('Push provider rejected delivery to all registered browsers.');
        }

        return 'webpush:' . $delivered;
    }
}