<?php

namespace App\Services;

use App\Models\AiProvider;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeminiProvider implements AiProviderInterface
{
    protected AiProvider $provider;

    public function __construct(AiProvider $provider)
    {
        $this->provider = $provider;
    }

    /**
     * Map configured or environment model to a validated, active Gemini model.
     */
    protected function resolveModel(?string $requestedModel): string
    {
        $model = $requestedModel ?: ($this->provider->config['model'] ?? config('services.gemini.model', env('GEMINI_MODEL', 'gemini-2.5-flash')));

        return $model ?: 'gemini-2.5-flash';
    }

    public function chat(array $messages, array $options = []): array
    {
        $key = $this->provider->key ?: config('services.gemini.key', env('GEMINI_API_KEY'));
        if (!$key) {
            throw new \Exception('Gemini API key not configured for provider ' . $this->provider->name);
        }

        $model = $this->resolveModel($options['model'] ?? null);

        // Separate system messages from conversation turns
        $systemInstruction = null;
        $contents = [];

        foreach ($messages as $m) {
            $role = strtolower($m['role'] ?? 'user');
            $text = trim($m['content'] ?? '');

            if ($role === 'system') {
                $systemInstruction = [
                    'parts' => [['text' => $text]],
                ];
            } else {
                $contents[] = [
                    'role' => $role === 'assistant' ? 'model' : 'user',
                    'parts' => [['text' => $text]],
                ];
            }
        }

        // Ensure at least one user content part exists
        if (empty($contents)) {
            $contents[] = [
                'role' => 'user',
                'parts' => [['text' => 'Hello']],
            ];
        }

        $payload = [
            'contents' => $contents,
            'generationConfig' => [
                'temperature' => 0.4,
                'maxOutputTokens' => 1024,
            ],
        ];

        if ($systemInstruction) {
            $payload['systemInstruction'] = $systemInstruction;
        }

        $modelsToTry = array_unique([$model, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']);
        $lastError = null;

        // Verify TLS certificate in production; allow dev override only if explicitly configured
        $verifySsl = filter_var(env('GEMINI_VERIFY_SSL', true), FILTER_VALIDATE_BOOLEAN);

        foreach ($modelsToTry as $candidateModel) {
            try {
                $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
                    . rawurlencode($candidateModel)
                    . ':generateContent';

                $httpRequest = Http::timeout(25)
                    ->withHeaders([
                        'Content-Type' => 'application/json',
                        'x-goog-api-key' => $key,
                    ]);

                if (!$verifySsl) {
                    $httpRequest = $httpRequest->withoutVerifying();
                }

                $response = $httpRequest->post($url, $payload);

                if (!$response->successful()) {
                    $body = $response->json() ?: [];
                    $errMsg = data_get($body, 'error.message', 'HTTP ' . $response->status());
                    Log::warning("Gemini model {$candidateModel} failed: {$errMsg}");
                    $lastError = $errMsg;
                    continue;
                }

                $data = $response->json();
                $candidates = data_get($data, 'candidates', []);
                if (empty($candidates)) {
                    continue;
                }

                $parts = data_get($candidates[0], 'content.parts', []);
                $replyText = '';
                foreach ($parts as $part) {
                    if (!is_array($part) || !empty($part['thought'])) {
                        continue;
                    }
                    if (isset($part['text']) && is_string($part['text'])) {
                        $replyText .= $part['text'];
                    }
                }

                $replyText = trim($replyText);
                if ($replyText !== '') {
                    return [
                        'reply' => $replyText,
                        'meta' => [
                            'model' => $candidateModel,
                            'finishReason' => data_get($candidates[0], 'finishReason'),
                        ],
                    ];
                }
            } catch (\Throwable $e) {
                Log::warning("Gemini connection exception for {$candidateModel}: " . $e->getMessage());
                $lastError = $e->getMessage();
            }
        }

        throw new \Exception('Gemini generation failed: ' . ($lastError ?: 'No response returned'));
    }

    public function info(): array
    {
        return [
            'name' => $this->provider->name,
            'enabled' => (bool)$this->provider->enabled,
            'model' => $this->resolveModel(null),
        ];
    }
}
