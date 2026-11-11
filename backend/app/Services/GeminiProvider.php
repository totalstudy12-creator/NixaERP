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
        $model = $requestedModel ?: ($this->provider->config['model'] ?? config('services.gemini.model', env('GEMINI_MODEL', 'gemini-3.5-flash')));

        return $model ?: 'gemini-3.5-flash';
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

        $modelsToTry = array_unique([$model, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.5-flash']);
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

    // New: Generate voice response (text + TTS audio)
    public function generateVoiceResponse(array $payload): array
    {
        // Expected $payload keys: message, audioBase64, audioMime, voice, persona, chatHistory
        $message = $payload['message'] ?? null;
        $audioBase64 = $payload['audioBase64'] ?? null;
        $audioMime = $payload['audioMime'] ?? 'audio/webm';
        $voice = $payload['voice'] ?? 'Zephyr';
        $persona = $payload['persona'] ?? 'executive';
        $chatHistory = $payload['chatHistory'] ?? [];

        // Build base messages for Gemini chat
        $messages = [];
        if (!empty($chatHistory) && is_array($chatHistory)) {
            foreach ($chatHistory as $h) {
                $messages[] = ['role' => $h['role'] ?? 'user', 'content' => $h['content'] ?? ''];
            }
        }
        if ($message) {
            $messages[] = ['role' => 'user', 'content' => $message];
        }

        // Obtain text response via chat()
        $chatResult = $this->chat($messages);
        $replyText = $chatResult['reply'] ?? '';

        // Clean for TTS
        $speechCleanedText = preg_replace('/[*#_`>]/', '', $replyText);
        $speechCleanedText = preg_replace('/\[([^\]]+)\]\([^)]*\)/', '$1', $speechCleanedText);
        $speechCleanedText = trim($speechCleanedText);

        // Prepare Gemini TTS request
        $validVoice = in_array($voice, ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir']) ? $voice : 'Zephyr';
        $ttsPayload = [
            'model' => 'gemini-3.8-flash-lite-tts',
            'contents' => [
                [
                    'role' => 'user',
                    'parts' => [[
                        'text' => $speechCleanedText,
                        'speechMetadata' => [
                            'style' => $persona === 'aanya_hindi' || $validVoice === 'Kore'
                                ? 'Lively, expressive Indian female speaker with emotional warmth, joyful laughter, and natural conversational cadence'
                                : 'Articulate, confident, natural speaking cadence',
                        ],
                    ]],
                ],
            ],
            'config' => [
                'responseModalities' => ['AUDIO'],
                'speechConfig' => [
                    'voiceConfig' => [
                        'prebuiltVoiceConfig' => ['voiceName' => $validVoice],
                    ],
                ],
            ],
        ];

        // Send TTS request
        $key = $this->provider->key ?: config('services.gemini.key', env('GEMINI_API_KEY'));
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode('gemini-3.8-flash-lite-tts') . ':generateContent';
        $http = Http::timeout(30)->withHeaders([
            'Content-Type' => 'application/json',
            'x-goog-api-key' => $key,
        ]);
        $ttsResp = $http->post($url, $ttsPayload);
        $audioWavBase64 = null;
        if ($ttsResp->successful()) {
            $ttsData = $ttsResp->json();
            $audioWavBase64 = data_get($ttsData, 'candidates.0.content.parts.0.inlineData.data');
        }

        return [
            'transcript' => $message ?? $replyText,
            'replyText' => $replyText,
            'audioWavBase64' => $audioWavBase64,
            'voice' => $validVoice,
        ];
    }

    // New: Simple transcription wrapper
    public function transcribeAudio(string $base64, string $mime = 'audio/webm'): string
    {
        $key = $this->provider->key ?: config('services.gemini.key', env('GEMINI_API_KEY'));
        $payload = [
            'model' => 'gemini-3.5-transcribe',
            'contents' => [
                [
                    'parts' => [
                        [
                            'inlineData' => [
                                'mimeType' => $mime,
                                'data' => $base64,
                            ],
                        ],
                        [
                            'text' => 'Transcribe this spoken speech accurately. Do not add commentary.',
                        ],
                    ],
                ],
            ],
        ];
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode('gemini-3.5-transcribe') . ':generateContent';
        $http = Http::timeout(30)->withHeaders([
            'Content-Type' => 'application/json',
            'x-goog-api-key' => $key,
        ]);
        $resp = $http->post($url, $payload);
        if ($resp->successful()) {
            $data = $resp->json();
            return trim(data_get($data, 'candidates.0.content.parts.0.text', ''));
        }
        throw new \Exception('Transcription failed');
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
