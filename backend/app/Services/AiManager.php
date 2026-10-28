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

        // 1. If provider in DB has an empty or un-decryptable key, recover from database Setting first
        if ($provider && (empty($provider->key) || str_starts_with((string)$provider->key, 'eyJpdiI6Ik'))) {
            $savedEnc = \App\Models\Setting::where('key', 'ai_gemini_api_key')->value('value');
            if ($savedEnc) {
                try {
                    $dec = \Illuminate\Support\Facades\Crypt::decryptString($savedEnc);
                    if (!empty($dec)) {
                        $provider->key = $dec;
                        $cfg = $provider->config ?? [];
                        $cfg['type'] = 'gemini';
                        $cfg['model'] = \App\Models\Setting::where('key', 'ai_gemini_model')->value('value') ?: ($cfg['model'] ?? 'gemini-3.5-flash');
                        $provider->config = $cfg;
                    }
                } catch (\Throwable $e) {}
            }
            if (empty($provider->key) || str_starts_with((string)$provider->key, 'eyJpdiI6Ik')) {
                if (env('GEMINI_API_KEY')) {
                    $provider->key = env('GEMINI_API_KEY');
                    $cfg = $provider->config ?? [];
                    $cfg['type'] = 'gemini';
                    $cfg['model'] = $cfg['model'] ?? env('GEMINI_MODEL', 'gemini-3.5-flash');
                    $provider->config = $cfg;
                }
            }
        }

        // 2. If no AiProvider record in DB, check database Setting table
        if (!$provider) {
            $savedEnc = \App\Models\Setting::where('key', 'ai_gemini_api_key')->value('value');
            if ($savedEnc) {
                try {
                    $dec = \Illuminate\Support\Facades\Crypt::decryptString($savedEnc);
                    if (!empty($dec)) {
                        $provider = new AiProvider([
                            'name' => 'Google Gemini (Database)',
                            'key' => $dec,
                            'config' => [
                                'type' => 'gemini',
                                'model' => \App\Models\Setting::where('key', 'ai_gemini_model')->value('value') ?: 'gemini-3.5-flash',
                            ],
                            'enabled' => true,
                        ]);
                    }
                } catch (\Throwable $e) {}
            }
        }

        // 3. Fallback to environment variables if database has neither
        if (!$provider && env('GEMINI_API_KEY')) {
            $provider = new AiProvider([
                'name' => 'Google Gemini (Production)',
                'key' => env('GEMINI_API_KEY'),
                'config' => [
                    'type' => 'gemini',
                    'model' => env('GEMINI_MODEL', 'gemini-3.5-flash'),
                ],
                'enabled' => true,
            ]);
        } elseif (!$provider && env('OPENAI_API_KEY')) {
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

        // Fallback to Gemini if configured in environment
        if (env('GEMINI_API_KEY')) {
            return new GeminiProvider($provider);
        }

        // Fallback to local stub that throws
        return new LocalAiProvider($provider);
    }
}
