<?php

namespace App\Services;

use App\Models\AiProvider;
use GuzzleHttp\Client;

class OpenAiProvider implements AiProviderInterface
{
    protected AiProvider $provider;
    protected Client $http;

    public function __construct(AiProvider $provider)
    {
        $this->provider = $provider;
        $this->http = new Client(['timeout' => 60]);
    }

    public function chat(array $messages, array $options = []): array
    {
        $key = $this->provider->key ?: env('OPENAI_API_KEY');
        if (!$key) {
            throw new \Exception('OpenAI API key not configured for provider ' . $this->provider->name);
        }

        $model = $this->provider->config['model'] ?? ($options['model'] ?? 'gpt-4o-mini');
        $temperature = $this->provider->config['temperature'] ?? ($options['temperature'] ?? 0.2);

        $payload = [
            'model' => $model,
            'messages' => array_map(function ($m) { return ['role' => $m['role'], 'content' => $m['content']]; }, $messages),
            'temperature' => $temperature,
            'max_tokens' => $this->provider->config['max_tokens'] ?? 1500,
        ];

        $res = $this->http->post('https://api.openai.com/v1/chat/completions', [
            'headers' => [
                'Authorization' => 'Bearer ' . $key,
                'Content-Type' => 'application/json',
            ],
            'json' => $payload,
        ]);

        $body = json_decode((string) $res->getBody(), true);
        $reply = '';
        if (!empty($body['choices'][0]['message']['content'])) {
            $reply = $body['choices'][0]['message']['content'];
        }

        return ['reply' => $reply, 'meta' => $body];
    }

    public function info(): array
    {
        return ['name' => $this->provider->name, 'enabled' => (bool)$this->provider->enabled];
    }
}
