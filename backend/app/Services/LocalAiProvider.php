<?php

namespace App\Services;

use App\Models\AiProvider;

class LocalAiProvider implements AiProviderInterface
{
    protected $provider;

    public function __construct(AiProvider $provider)
    {
        $this->provider = $provider;
    }

    public function chat(array $messages, array $options = []): array
    {
        // Local provider not implemented — return error to caller
        throw new \Exception('No AI provider configured. Please configure an AI provider in settings.');
    }

    public function info(): array
    {
        return ['name' => $this->provider->name ?? 'local', 'enabled' => (bool) $this->provider->enabled];
    }
}
