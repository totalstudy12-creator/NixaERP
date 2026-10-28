<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AiConversation;
use App\Models\AiMessage;
use App\Services\AiManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Crypt;

class AiController extends Controller
{
    protected $aiManager;
    protected $contextService;

    public function __construct(AiManager $aiManager)
    {
        $this->aiManager = $aiManager;
        $this->contextService = new \App\Services\AiContextService();
    }

    public function insights(Request $request)
    {
        $user = Auth::user();

        try {
            $salesSummary = app()->call('\App\Http\Controllers\Api\SalesController@summary');
        } catch (\Throwable $e) {
            Log::warning('AI insights: failed to fetch sales summary: ' . $e->getMessage());
            $salesSummary = null;
        }

        try {
            $lowStock = \App\Models\Product::whereRaw('stock_quantity <= COALESCE(reorder_level, 10)')
                ->limit(10)
                ->get(['id', 'name', 'stock_quantity']);
        } catch (\Throwable $e) {
            Log::warning('AI insights: failed to fetch low stock: ' . $e->getMessage());
            $lowStock = collect();
        }

        $insights = [
            'summary' => [
                'sales_growth' => $salesSummary['growth'] ?? null,
                'inventory_health' => $lowStock->count() ? 'attention' : 'good',
                'cash_position' => $salesSummary['cash_position'] ?? null,
                'payroll_accuracy' => null,
            ],
            'low_stock' => $lowStock->take(5),
            'recommendations' => [],
        ];

        return response()->json(['success' => true, 'data' => $insights]);
    }

    public function assistantConfig()
    {
        $settings = \App\Models\Setting::whereIn('key', ['ai_gemini_api_key', 'ai_gemini_model'])
            ->pluck('value', 'key');

        $apiKey = null;
        if (!empty($settings['ai_gemini_api_key'])) {
            try { $apiKey = Crypt::decryptString($settings['ai_gemini_api_key']); } catch (\Throwable $e) {}
        }

        if (!$apiKey) {
            $provider = \App\Models\AiProvider::where('enabled', true)->first();
            if ($provider && !empty($provider->key) && !str_starts_with((string)$provider->key, 'eyJpdiI6Ik')) {
                $apiKey = $provider->key;
            }
        }

        $configured = !empty($apiKey) || !empty(env('GEMINI_API_KEY'));
        $model = $settings['ai_gemini_model'] ?? null;
        if (!$model) {
            $provider = \App\Models\AiProvider::where('enabled', true)->first();
            $model = $provider?->config['model'] ?? env('GEMINI_MODEL', 'gemini-3.5-flash');
        }

        $maskedKey = null;
        if ($apiKey) {
            $maskedKey = substr($apiKey, 0, 6) . '...' . substr($apiKey, -4);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'configured' => $configured,
                'model' => $model ?: 'gemini-3.5-flash',
                'masked_key' => $maskedKey,
                'has_db_key' => !empty($apiKey),
            ],
        ]);
    }

    public function saveAssistantConfig(Request $request)
    {
        $validated = $request->validate([
            'api_key' => 'required|string|min:20|max:500',
            'model'   => 'required|string|max:100',
        ]);

        $rawKey = trim($validated['api_key']);
        $model  = trim($validated['model']);

        // 1. Save in settings table
        \App\Models\Setting::updateOrCreate(
            ['key' => 'ai_gemini_api_key'],
            [
                'value'       => Crypt::encryptString($rawKey),
                'group'       => 'ai',
                'description' => 'Encrypted server-side Gemini configuration for AI assistant.',
                'is_public'   => false,
            ]
        );
        \App\Models\Setting::updateOrCreate(
            ['key' => 'ai_gemini_model'],
            [
                'value'       => $model,
                'group'       => 'ai',
                'description' => 'Gemini model selection in Database.',
                'is_public'   => false,
            ]
        );

        // 2. Synchronize to ai_providers table (primary provider)
        $aiProvider = \App\Models\AiProvider::firstOrNew(['id' => 1]);
        $aiProvider->name = 'Google Gemini';
        $aiProvider->key = $rawKey;
        $aiProvider->config = [
            'type'  => 'gemini',
            'model' => $model,
        ];
        $aiProvider->enabled = true;
        $aiProvider->save();

        return response()->json([
            'success' => true,
            'message' => 'AI settings saved directly to database successfully.',
            'data' => [
                'configured' => true,
                'model'      => $model,
                'masked_key' => substr($rawKey, 0, 6) . '...' . substr($rawKey, -4),
            ],
        ]);
    }

    public function testAssistantConfig(Request $request)
    {
        $rawKey = trim((string) $request->input('api_key', ''));
        $model  = trim((string) $request->input('model', 'gemini-3.5-flash'));

        // If key was not typed, load active key from database!
        if (empty($rawKey)) {
            $savedKey = \App\Models\Setting::where('key', 'ai_gemini_api_key')->value('value');
            if ($savedKey) {
                try { $rawKey = Crypt::decryptString($savedKey); } catch (\Throwable $e) {}
            }
            if (empty($rawKey)) {
                $p = \App\Models\AiProvider::where('enabled', true)->first();
                if ($p && !empty($p->key) && !str_starts_with((string)$p->key, 'eyJpdiI6Ik')) {
                    $rawKey = $p->key;
                }
            }
            if (empty($rawKey)) {
                $rawKey = env('GEMINI_API_KEY');
            }
        }

        if (empty($rawKey)) {
            return response()->json([
                'success' => false,
                'message' => 'No Gemini API key provided or saved in database. Please enter a key.',
            ], 422);
        }

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            . rawurlencode($model)
            . ':generateContent';

        $generationConfig = [
            'temperature'     => 0,
            'maxOutputTokens' => 512,
        ];

        try {
            $response = Http::timeout(30)
                ->withHeaders([
                    'Content-Type'   => 'application/json',
                    'x-goog-api-key' => $rawKey,
                ])
                ->post($url, [
                    'contents' => [[
                        'role'  => 'user',
                        'parts' => [['text' => 'Reply with exactly: CONNECTION_OK']],
                    ]],
                    'generationConfig' => $generationConfig,
                ]);

            $status = $response->status();
            $body   = $response->json() ?: [];

            if ($status === 429) {
                $googleMsg = (string) data_get($body, 'error.message', '');
                return response()->json([
                    'success' => false,
                    'message' => 'Gemini Quota Exceeded (429): Free tier limit reached. Please enter a new key in Settings → AI or upgrade billing. ' . $googleMsg,
                    'error_code' => 'QUOTA_EXCEEDED',
                ], 422);
            }

            if (!$response->successful()) {
                $googleMessage = (string) data_get($body, 'error.message', '');
                $message = match ($status) {
                    400 => 'Gemini rejected the request: ' . $googleMessage,
                    401, 403 => 'Gemini rejected this API key: ' . $googleMessage,
                    404 => 'Model ' . $model . ' not found on Google API: ' . $googleMessage,
                    default => 'Gemini connection failed (HTTP ' . $status . '): ' . $googleMessage,
                };

                return response()->json(['success' => false, 'message' => $message], 422);
            }

            return response()->json([
                'success' => true,
                'message' => 'Gemini API key and model (' . $model . ') connected successfully.',
            ]);
        } catch (\Throwable $e) {
            Log::warning('Gemini settings connection check failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Could not reach Google Gemini: ' . $e->getMessage(),
            ], 503);
        }
    }

    public function clearAssistantConfig()
    {
        \App\Models\Setting::whereIn('key', ['ai_gemini_api_key', 'ai_gemini_model'])->delete();
        $provider = \App\Models\AiProvider::find(1);
        if ($provider) {
            $provider->enabled = false;
            $provider->save();
        }
        return response()->json(['success' => true, 'message' => 'AI database configuration cleared.']);
    }

    /**
     * Convert PCM 16-bit 24kHz audio to standard WAV format.
     */
    public static function pcmToWav(string $pcmData, int $sampleRate = 24000, int $channels = 1, int $bitsPerSample = 16): string
    {
        $byteRate = $sampleRate * $channels * ($bitsPerSample / 8);
        $blockAlign = $channels * ($bitsPerSample / 8);
        $dataLength = strlen($pcmData);
        $chunkSize = 36 + $dataLength;

        $header = pack('a4Va4a4VvvVVvva4V',
            'RIFF',
            $chunkSize,
            'WAVE',
            'fmt ',
            16,
            1,
            $channels,
            $sampleRate,
            $byteRate,
            $blockAlign,
            $bitsPerSample,
            'data',
            $dataLength
        );

        return $header . $pcmData;
    }

    /**
     * Generate natural speech using Google Gemini TTS (gemini-2.5-flash-preview-tts).
     * Returns standard base64 WAV audio.
     */
    public static function generateGeminiSpeech(string $text, string $voice = 'Aoede'): ?string
    {
        $rawKey = \App\Models\Setting::where('key', 'ai_gemini_api_key')->value('value') ?? env('GEMINI_API_KEY');
        if (!$rawKey) {
            $provider = \App\Models\AiProvider::find(1);
            $rawKey = $provider?->key;
        }

        if (!$rawKey) {
            return null;
        }

        try {
            $apiKey = \Illuminate\Support\Facades\Crypt::decryptString($rawKey);
        } catch (\Throwable $e) {
            $apiKey = $rawKey;
        }

        $validVoices = ['Aoede', 'Kore', 'Puck', 'Fenrir', 'Charon'];
        $selectedVoice = 'Aoede';
        foreach ($validVoices as $v) {
            if (stripos($voice, $v) !== false) {
                $selectedVoice = $v;
                break;
            }
        }

        $cleanText = substr(trim(preg_replace('/[*#_`>]/', '', $text)), 0, 1500);
        if ($cleanText === '') {
            return null;
        }

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=' . rawurlencode($apiKey);
        $payload = [
            'contents' => [
                [
                    'role' => 'user',
                    'parts' => [
                        ['text' => $cleanText],
                    ],
                ],
            ],
            'generationConfig' => [
                'responseModalities' => ['AUDIO'],
                'speechConfig' => [
                    'voiceConfig' => [
                        'prebuiltVoiceConfig' => [
                            'voiceName' => $selectedVoice,
                        ],
                    ],
                ],
            ],
        ];

        try {
            $response = Http::withoutVerifying()->timeout(15)->post($url, $payload);
            if ($response->successful()) {
                $data = $response->json();
                $rawBase64 = data_get($data, 'candidates.0.content.parts.0.inlineData.data');
                if ($rawBase64) {
                    $rawPcm = base64_decode($rawBase64);
                    $wav = self::pcmToWav($rawPcm, 24000);
                    return base64_encode($wav);
                }
            } else {
                Log::warning('Gemini TTS API error: ' . $response->body());
            }
        } catch (\Throwable $e) {
            Log::warning('Gemini TTS call exception: ' . $e->getMessage());
        }

        return null;
    }

    public function voice(Request $request)
    {
        $request->validate([
            'text'       => 'required|string|max:3000',
            'provider'   => 'nullable|string|in:browser,cloud,auto',
            'language'   => 'nullable|string|max:20',
            'voice_name' => 'nullable|string|max:50',
        ]);

        $text = trim($request->input('text'));
        $preferredProvider = strtolower((string) $request->input('provider', 'auto'));
        $language = $request->input('language', 'en-US');

        $settings = \App\Models\Setting::whereIn('key', [
            'voice_tts_provider',
            'voice_default_language',
            'voice_browser_enabled',
            'voice_paid_enabled',
            'voice_auto_read_enabled',
            'voice_speed',
            'elevenlabs_api_key',
            'elevenlabs_voice_id',
            'elevenlabs_model_id',
        ])->pluck('value', 'key')->toArray();

        $provider = in_array($preferredProvider, ['browser', 'cloud'], true)
            ? $preferredProvider
            : strtolower((string) ($settings['voice_tts_provider'] ?? env('TTS_PROVIDER', env('AI_TTS_PROVIDER', 'auto'))));

        $browserEnabled = filter_var($settings['voice_browser_enabled'] ?? env('VOICE_BROWSER_ENABLED', true), FILTER_VALIDATE_BOOLEAN);
        $paidEnabled    = filter_var($settings['voice_paid_enabled']    ?? env('VOICE_PAID_ENABLED', true),   FILTER_VALIDATE_BOOLEAN);

        $configuredLanguage = trim((string) ($settings['voice_default_language'] ?? $language));
        if ($configuredLanguage !== '') {
            $language = $configuredLanguage;
        }

        $voiceName = (string) $request->input('voice_name', 'Aoede');

        // 1. ElevenLabs TTS if configured
        if (in_array($provider, ['cloud', 'elevenlabs'], true) && $paidEnabled) {
            $apiKey  = trim((string) ($settings['elevenlabs_api_key']  ?? env('ELEVENLABS_API_KEY', '')));
            $voiceId = trim((string) ($settings['elevenlabs_voice_id'] ?? env('ELEVENLABS_VOICE_ID', 'EXAVITQu4vr4xnSDxMaL')));
            $modelId = trim((string) ($settings['elevenlabs_model_id'] ?? env('ELEVENLABS_MODEL_ID', 'eleven_multilingual_v2')));

            if ($apiKey && $voiceId) {
                try {
                    $response = Http::withHeaders([
                        'Accept'       => 'audio/mpeg',
                        'Content-Type' => 'application/json',
                        'xi-api-key'   => $apiKey,
                    ])->timeout(30)->post(
                        'https://api.elevenlabs.io/v1/text-to-speech/' . rawurlencode($voiceId),
                        [
                            'model_id' => $modelId ?: 'eleven_multilingual_v2',
                            'text'     => $text,
                            'voice_settings' => [
                                'stability'        => 0.6,
                                'similarity_boost' => 0.8,
                            ],
                        ]
                    );

                    if ($response->successful()) {
                        return response()->json([
                            'success' => true,
                            'data' => [
                                'source'       => 'cloud',
                                'provider'     => 'elevenlabs',
                                'language'     => $language,
                                'mime_type'    => 'audio/mpeg',
                                'audio_base64' => base64_encode($response->body()),
                            ],
                        ]);
                    }

                    Log::warning('ElevenLabs TTS failed: ' . $response->body());
                } catch (\Throwable $e) {
                    Log::warning('ElevenLabs TTS exception: ' . $e->getMessage());
                }
            }
        }

        // 2. Google Gemini Native TTS (Crystal clear, ultra-low latency, built into Google Gemini Key)
        if (in_array($provider, ['cloud', 'gemini', 'auto'], true)) {
            $wavBase64 = self::generateGeminiSpeech($text, $voiceName);
            if ($wavBase64) {
                return response()->json([
                    'success' => true,
                    'data' => [
                        'source'       => 'cloud',
                        'provider'     => 'gemini-tts',
                        'voice'        => $voiceName,
                        'language'     => $language,
                        'mime_type'    => 'audio/wav',
                        'audio_base64' => $wavBase64,
                    ],
                ]);
            }
        }

        if ($browserEnabled) {
            return response()->json([
                'success' => true,
                'data' => [
                    'source'   => 'browser',
                    'provider' => 'browser',
                    'language' => $language,
                    'fallback' => true,
                    'message'  => 'Using browser speech synthesis fallback.',
                ],
            ]);
        }

        return response()->json([
            'success' => false,
            'message' => 'No active voice provider available. Enable browser TTS or configure a paid provider.',
        ], 503);
    }

    public function chat(Request $request)
    {
        $this->validate($request, [
            'message'          => 'required|string|max:5000',
            'history'          => 'nullable|array|max:20',
            'history.*.role'   => 'required|in:user,assistant',
            'history.*.text'   => 'required|string|max:5000',
        ]);

        $user = Auth::user();
        $message = $request->input('message');

        $conversation = AiConversation::firstOrCreate(
            ['user_id' => $user->id, 'title' => 'Conversation'],
            ['metadata' => null]
        );

        AiMessage::create([
            'conversation_id' => $conversation->id,
            'user_id'         => $user->id,
            'role'            => 'user',
            'content'         => $message,
        ]);

        $context = [];
        $context['sales_summary'] = $this->contextService->getSalesSummary();
        $context['low_stock']     = $this->contextService->getLowStockProducts(10);
        $context['top_products']  = $this->contextService->getTopProducts(5);
        $context['top_customers'] = $this->contextService->getTopCustomers(5);
        $context['profit_loss_report'] = $this->contextService->getFinancialContextForQuery($message, $user?->company_id, $user?->branch_id);

        try {
            $context['inventory_sample'] = \App\Models\Product::limit(15)->get(['id', 'name', 'sku', 'barcode', 'stock_quantity', 'reorder_level', 'sale_price', 'purchase_price'])->toArray();
        } catch (\Throwable $e) {
            $context['inventory_sample'] = [];
        }

        $agentRole = $request->input('agent', 'general_operations');
        $agentPersona = match ($agentRole) {
            'inventory_auditor' => 'You are the Nexa WMS Inventory & Cycle Audit Agent. You specialize in verifying physical stocks, detecting bin discrepancies, tracking shelf variances, and auditing warehouse bays.',
            'reorder_specialist' => 'You are the Nexa WMS Purchasing & Restock Agent. You analyze low-stock items against minimum thresholds, suggest restock quantities, calculate reorder costs, and prepare Purchase Order drafts.',
            'dispatch_coordinator' => 'You are the Nexa WMS Logistics & Dispatch Coordinator. You optimize pick-pack routes, bay staging, shipping thermal labels, and warehouse transfer orders.',
            default => 'You are Anya, an emotionally expressive, warm, and witty conversational AI companion for RaptorERP/NixaERP business operations. Speak exclusively in a natural, lively Hindi tone (conversational Hindi / Hinglish). Speak naturally like a real human with genuine emotions, laughter (Haha!, Hehe!), expressive interjections (Oh!, Ah!, Arrey!, Achaa!), empathy, and playful feistiness or comical anger in Hindi if teased (Arrey yaar, mujhe gussa mat dilao haha!). Keep responses fast, concise, punchy, and conversational.',
        };

        $providerId = $request->input('provider_id');
        if ($providerId) {
            $providerModel = \App\Models\AiProvider::find($providerId);
        } else {
            $providerModel = $this->aiManager->getPrimaryProvider();
        }

        if (!$providerModel) {
            $settings = \App\Models\Setting::whereIn('key', ['ai_gemini_api_key', 'ai_gemini_model'])
                ->pluck('value', 'key');

            $configuredKey = null;
            try {
                $configuredKey = $settings['ai_gemini_api_key']
                    ? Crypt::decryptString($settings['ai_gemini_api_key'])
                    : null;
            } catch (\Throwable $e) {
                Log::warning('AI assistant key could not be decrypted.');
            }

            if ($configuredKey) {
                $providerModel = new \App\Models\AiProvider([
                    'name'    => 'Gemini (Settings)',
                    'key'     => $configuredKey,
                    'config'  => [
                        'type'  => 'gemini',
                        'model' => $settings['ai_gemini_model'] ?: 'gemini-3.5-flash',
                    ],
                    'enabled' => true,
                ]);
            }
        }

        if (!$providerModel) {
            return response()->json([
                'success' => false,
                'message' => 'No AI provider configured. Please configure an AI provider.',
            ], 503);
        }

        try {
            $provider = $this->aiManager->makeProviderInstance($providerModel);

            $messages = [[
                'role' => 'system',
                'content' => $agentPersona . ' '
                    . 'Help with sales, inventory, customers, purchasing, payments, accounting, '
                    . 'payroll and reports. Use only the ERP context provided below for business '
                    . 'facts; say when a fact is unavailable, never invent records or figures, '
                    . 'and do not claim to have changed data. Suggest clear next steps. '
                    . 'Financial figures must always come from Nexa ERP\'s authoritative reporting tools. '
                    . 'When a question asks about profit, P&L, gross profit, net profit, revenue, COGS, '
                    . 'income, or expenses, use the profit_loss_report payload from the canonical ERP service '
                    . 'and explain those exact values without changing them. Never independently estimate, '
                    . 'reconstruct, or recalculate profit figures from partial sales, purchases, or invoice snippets. '
                    . 'ERP context (JSON): '
                    . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]];

            foreach ($request->input('history', []) as $item) {
                $messages[] = [
                    'role'    => $item['role'],
                    'content' => $item['text'],
                ];
            }

            $messages[] = ['role' => 'user', 'content' => $message];

            $result = $provider->chat($messages, ['context' => $context]);

            $reply = $result['reply'] ?? '';

            $assistantMsg = AiMessage::create([
                'conversation_id' => $conversation->id,
                'role'            => 'assistant',
                'content'         => $reply,
            ]);

            return response()->json([
                'success' => true,
                'reply'   => $reply,
                'data' => [
                    'conversation_id' => $conversation->id,
                    'message_id'      => $assistantMsg->id,
                ],
            ]);
        } catch (\Throwable $e) {
            Log::error('AI chat failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'AI provider error: ' . $e->getMessage(),
            ], 500);
        }
    }
}