<?php

namespace App\Services;

use App\Models\AiProvider;
use Gemini;
use Gemini\Responses\GenerativeModel\GenerateContentResponse;

class GeminiProvider implements AiProviderInterface
{
    protected AiProvider $provider;

    public function __construct(AiProvider $provider)
    {
        $this->provider = $provider;
    }

    protected function buildPrompt(array $messages): string
    {
        $parts = [];
        foreach ($messages as $m) {
            $role = $m['role'] ?? 'user';
            $content = $m['content'] ?? '';
            $parts[] = strtoupper($role) . ":\n" . $content;
        }

        return implode("\n\n", $parts);
    }

    public function chat(array $messages, array $options = []): array
    {
        $key = $this->provider->key ?: env('GEMINI_API_KEY');
        if (!$key) {
            throw new \Exception('Gemini API key not configured for provider ' . $this->provider->name);
        }

        $model = $this->provider->config['model'] ?? ($options['model'] ?? 'gemini-2.0');

        $client = null;
        if (class_exists('\\Gemini\\Factory')) {
            $client = \Gemini::factory()->withApiKey($key)->make();
        } elseif (function_exists('Gemini\client')) {
            $client = \Gemini::client($key);
        } else {
            throw new \Exception('Gemini client library not available');
        }

        $prompt = $this->buildPrompt($messages);

        try {
            $res = $client->generativeModel(model: $model)->generateContent($prompt);
            $text = method_exists($res, 'text') ? $res->text() : (is_string($res) ? (string)$res : '');

            $meta = [];
            if ($res instanceof GenerateContentResponse) {
                $meta = $res->toArray();
            }

            return ['reply' => $text, 'meta' => $meta];
        } catch (\Throwable $e) {
            throw $e;
        }
    }

    public function info(): array
    {
        return ['name' => $this->provider->name, 'enabled' => (bool)$this->provider->enabled];
    }
}
