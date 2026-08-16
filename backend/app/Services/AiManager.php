<?php

namespace App\Services;

use App\Models\AiProvider;

class AiManager
{
    public function getEnabledProviders(): array
    {
        return AiProvider::where('enabled', true)->get()->map(function ($p) {
            return $p;
        })->toArray();
    }

    public function getPrimaryProvider(): ?AiProvider
    {
        $provider = AiProvider::where('enabled', true)->first();

        if (!$provider && env('OPENAI_API_KEY')) {
            $provider = new AiProvider([
                'name' => 'OpenAI (env)',
                'key' => env('OPENAI_API_KEY'),
                'config' => [
                    'type' => 'openai',
                    'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
                ],
                'enabled' => true,
            ]);
        }

        return $provider;
    }

    public function makeProviderInstance(?AiProvider $provider): AiProviderInterface
    {
        if (!$provider) {
            throw new \Exception('No AI provider configured.');
        }

        $name = strtolower($provider->name ?? '');
        $type = strtolower($provider->config['type'] ?? '');
        // Choose adapter by provider name or config
        if (str_contains($name, 'gemini') || $type === 'gemini') {
            return new GeminiProvider($provider);
        }

        if (str_contains($name, 'openai') || str_contains($name, 'gpt') || $type === 'openai' || $type === 'gpt') {
            return new OpenAiProvider($provider);
        }

        // Fallback to local stub that throws
        return new LocalAiProvider($provider);
    }
}
