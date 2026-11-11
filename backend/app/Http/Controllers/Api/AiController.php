<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AiConversation;
use App\Models\AiMessage;
use App\Models\AiProvider;
use App\Models\Product;
use App\Models\Setting;
use App\Services\AiContextService;
use App\Services\AiManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AiController extends Controller
{
    protected AiManager $aiManager;
    protected AiContextService $contextService;

    public function __construct(AiManager $aiManager, AiContextService $contextService)
    {
        $this->aiManager = $aiManager;
        $this->contextService = $contextService;
    }

    /**
     * Resolve the active Gemini API key from database settings, active AiProvider, or environment.
     */
    public static function resolveGeminiKey(): ?string
    {
        // 1. Settings table (encrypted)
        try {
            $savedKey = Setting::where('key', 'ai_gemini_api_key')->value('value');
            if (!empty($savedKey)) {
                try {
                    $decrypted = Crypt::decryptString($savedKey);
                    if (!empty($decrypted)) {
                        return trim($decrypted);
                    }
                } catch (\Throwable $e) {
                    if (!str_starts_with($savedKey, 'eyJpdiI6')) {
                        return trim($savedKey);
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Error resolving Gemini key from settings: ' . $e->getMessage());
        }

        // 2. AiProvider (accessor auto-decrypts)
        try {
            $provider = AiProvider::where('enabled', true)->first();
            if ($provider && !empty($provider->key)) {
                return trim((string) $provider->key);
            }
        } catch (\Throwable $e) {
            Log::warning('Error resolving Gemini key from provider: ' . $e->getMessage());
        }

        // 3. Environment variable fallback
        $envKey = env('GEMINI_API_KEY');
        return !empty($envKey) ? trim((string) $envKey) : null;
    }

    /**
     * Clean markdown, asterisks, bullet points, headers, and code for smooth TTS synthesis.
     */
    public static function cleanTextForSpeech(string $text): string
    {
        $text = preg_replace('/```[\s\S]*?```/', '', $text);
        $text = preg_replace('/`([^`]+)`/', '$1', $text);
        $text = preg_replace('/[#*_~>]+/', ' ', $text);
        $text = preg_replace('/[•·▪▫●○►–—]/u', ' ', $text);
        $text = preg_replace('/https?:\/\/\S+/', '', $text);
        $text = preg_replace('/^\s*[-•]\s*/m', '', $text);
        $text = preg_replace('/^\s*\d+\.\s*/m', '', $text);
        $text = preg_replace('/\s+/', ' ', $text);
        return trim($text);
    }

    /**
     * Convert PCM 16-bit 24kHz audio to standard WAV format.
     */
    public static function pcmToWav(string $pcmData, int $sampleRate = 24000, int $channels = 1, int $bitsPerSample = 16): string
    {
        $byteRate   = $sampleRate * $channels * ($bitsPerSample / 8);
        $blockAlign = $channels * ($bitsPerSample / 8);
        $dataLength = strlen($pcmData);
        $chunkSize  = 36 + $dataLength;

        $header = pack(
            'a4Va4a4VvvVVvva4V',
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
     * Generate natural speech using Google Gemini TTS.
     * Returns standard base64 WAV audio.
     */
    public static function generateGeminiSpeech(string $text, string $voice = 'Zephyr'): ?string
    {
        $apiKey = self::resolveGeminiKey();
        if (!$apiKey) {
            return null;
        }

        // Real Gemini TTS prebuilt voices
        $validVoices = ['Zephyr', 'Aoede', 'Kore', 'Puck', 'Fenrir', 'Charon', 'Leda', 'Orus'];
        $selectedVoice = 'Zephyr';
        foreach ($validVoices as $v) {
            if (strcasecmp($voice, $v) === 0 || stripos($voice, $v) !== false) {
                $selectedVoice = $v;
                break;
            }
        }

        $cleanText = substr(self::cleanTextForSpeech($text), 0, 1500);
        if ($cleanText === '') {
            return null;
        }

        // Active Gemini TTS models prioritized
        $modelsToTry = [
            'gemini-3.8-flash-tts',
            'gemini-3.8-flash-lite-tts',
            'gemini-3.1-flash-tts-preview',
            'gemini-2.5-flash-preview-tts',
            'gemini-2.5-pro-preview-tts',
        ];

        $payload = [
            'contents' => [
                [
                    'role'  => 'user',
                    'parts' => [['text' => $cleanText]],
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

        $verifySsl = filter_var(env('GEMINI_VERIFY_SSL', true), FILTER_VALIDATE_BOOLEAN);

        foreach ($modelsToTry as $model) {
            $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent";
            try {
                $httpReq = Http::timeout(4)->withHeaders([
                    'Content-Type'   => 'application/json',
                    'x-goog-api-key' => $apiKey,
                ]);
                if (!$verifySsl) {
                    $httpReq = $httpReq->withoutVerifying();
                }

                $response = $httpReq->post($url, $payload);

                if ($response->successful()) {
                    $data = $response->json();
                    $parts = data_get($data, 'candidates.0.content.parts', []);
                    $rawBase64 = null;
                    foreach ($parts as $p) {
                        if (!empty($p['inlineData']['data'])) {
                            $rawBase64 = $p['inlineData']['data'];
                            break;
                        }
                    }

                    if ($rawBase64) {
                        $rawBytes = base64_decode($rawBase64);
                        // If already a valid WAV (starts with RIFF), return as-is to prevent double-wrapping
                        if (str_starts_with($rawBytes, 'RIFF')) {
                            return base64_encode($rawBytes);
                        }
                        // If MP3, return as-is
                        if (str_starts_with($rawBytes, 'ID3') || (strlen($rawBytes) > 2 && ord($rawBytes[0]) === 0xFF && (ord($rawBytes[1]) & 0xE0) === 0xE0)) {
                            return base64_encode($rawBytes);
                        }
                        // Raw PCM 24kHz
                        $wav = self::pcmToWav($rawBytes, 24000);
                        return base64_encode($wav);
                    }
                } else {
                    Log::warning("Gemini TTS API error with {$model}: HTTP " . $response->status());
                }
            } catch (\Throwable $e) {
                Log::warning("Gemini TTS call exception with {$model}: " . $e->getMessage());
            }
        }

        return null;
    }

    public function insights(Request $request)
    {
        try {
            $salesSummary = app()->call('\App\Http\Controllers\Api\SalesController@summary');
            if ($salesSummary instanceof \Illuminate\Http\JsonResponse) {
                $salesSummary = $salesSummary->getData(true);
            }
            if (isset($salesSummary['data']) && is_array($salesSummary['data'])) {
                $salesSummary = $salesSummary['data'];
            }
        } catch (\Throwable $e) {
            Log::warning('AI insights: failed to fetch sales summary: ' . $e->getMessage());
            $salesSummary = [];
        }

        try {
            $lowStock = Product::whereRaw('stock_quantity <= COALESCE(reorder_level, 10)')
                ->limit(10)
                ->get(['id', 'name', 'stock_quantity']);
        } catch (\Throwable $e) {
            Log::warning('AI insights: failed to fetch low stock: ' . $e->getMessage());
            $lowStock = collect();
        }

        $totalSales     = (float) ($salesSummary['total_sales']     ?? 0);
        $outstanding    = (float) ($salesSummary['outstanding']     ?? 0);
        $deliveredToday = (int)   ($salesSummary['delivered_today'] ?? 0);
        $pendingOrders  = (int)   ($salesSummary['pending_orders']  ?? 0);

        $insights = [
            'summary' => [
                'total_sales'      => $totalSales,
                'outstanding'      => $outstanding,
                'delivered_today'  => $deliveredToday,
                'pending_orders'   => $pendingOrders,
                'sales_growth'     => $salesSummary['growth'] ?? $salesSummary['sales_growth'] ?? null,
                'inventory_health' => $lowStock->count() > 0 ? 'attention' : 'good',
                'cash_position'    => $salesSummary['cash_position'] ?? null,
                'payroll_accuracy' => null,
            ],
            'low_stock'       => $lowStock->take(5),
            'recommendations' => [],
        ];

        return response()->json(['success' => true, 'data' => $insights]);
    }

    public function assistantConfig()
    {
        $apiKey     = self::resolveGeminiKey();
        $configured = !empty($apiKey);

        $model = Setting::where('key', 'ai_gemini_model')->value('value');
        if (!$model) {
            $provider = AiProvider::where('enabled', true)->first();
            $model    = $provider?->config['model'] ?? env('GEMINI_MODEL', 'gemini-2.5-flash');
        }

        $maskedKey = null;
        if ($apiKey) {
            $maskedKey = substr($apiKey, 0, 6) . '...' . substr($apiKey, -4);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'configured' => $configured,
                'model'      => $model ?: 'gemini-2.5-flash',
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

        // 1. Save in settings table (encrypted)
        Setting::updateOrCreate(
            ['key' => 'ai_gemini_api_key'],
            [
                'value'       => Crypt::encryptString($rawKey),
                'group'       => 'ai',
                'description' => 'Encrypted server-side Gemini configuration for AI assistant.',
                'is_public'   => false,
            ]
        );
        Setting::updateOrCreate(
            ['key' => 'ai_gemini_model'],
            [
                'value'       => $model,
                'group'       => 'ai',
                'description' => 'Gemini model selection in Database.',
                'is_public'   => false,
            ]
        );

        // 2. Synchronize to ai_providers table
        $aiProvider = AiProvider::firstOrNew(['id' => 1]);
        $aiProvider->name    = 'Google Gemini';
        $aiProvider->key     = $rawKey;
        $aiProvider->config  = ['type' => 'gemini', 'model' => $model];
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
        $model  = trim((string) $request->input('model', 'gemini-2.5-flash'));

        if (empty($rawKey)) {
            $rawKey = self::resolveGeminiKey() ?? '';
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

        $verifySsl = filter_var(env('GEMINI_VERIFY_SSL', true), FILTER_VALIDATE_BOOLEAN);

        try {
            $httpReq = Http::timeout(15)->withHeaders([
                'Content-Type'   => 'application/json',
                'x-goog-api-key' => $rawKey,
            ]);

            if (!$verifySsl) {
                $httpReq = $httpReq->withoutVerifying();
            }

            $response = $httpReq->post($url, [
                'contents' => [[
                    'role'  => 'user',
                    'parts' => [['text' => 'Reply with exactly: CONNECTION_OK']],
                ]],
                'generationConfig' => [
                    'temperature'     => 0,
                    'maxOutputTokens' => 64,
                ],
            ]);

            $status = $response->status();
            $body   = $response->json() ?: [];

            if ($status === 429) {
                $googleMsg = (string) data_get($body, 'error.message', '');
                return response()->json([
                    'success'    => false,
                    'message'    => 'Gemini Quota Exceeded (429): Free tier limit reached. Please enter a new key in Settings → AI or upgrade billing. ' . $googleMsg,
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
        Setting::whereIn('key', ['ai_gemini_api_key', 'ai_gemini_model'])->delete();
        $provider = AiProvider::find(1);
        if ($provider) {
            $provider->enabled = false;
            $provider->save();
        }
        return response()->json(['success' => true, 'message' => 'AI database configuration cleared.']);
    }

    public function voice(Request $request)
    {
        $request->validate([
            'text'       => 'required|string|max:3000',
            'provider'   => 'nullable|string|in:browser,cloud,auto',
            'language'   => 'nullable|string|max:20',
            'voice_name' => 'nullable|string|max:50',
        ]);

        $text              = trim($request->input('text'));
        $preferredProvider = strtolower((string) $request->input('provider', 'auto'));
        $language          = $request->input('language', 'en-US');

        $settings = Setting::whereIn('key', [
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

        $voiceName = (string) $request->input('voice_name', 'Zephyr');

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

        // 2. Google Gemini Native TTS
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
            'message'        => 'required|string|max:5000',
            'history'        => 'nullable|array|max:20',
            'history.*.role' => 'required|in:user,assistant,model',
            'history.*.text' => 'required|string|max:5000',
        ]);

        $user = Auth::user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

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
        $context['profit_loss_report'] = $this->contextService->getFinancialContextForQuery($message, $user->company_id, $user->branch_id);
        $context['logistics_delivery'] = $this->contextService->getDeliveryLogisticsSummary($user->company_id, $user->branch_id);
        $context['receivables_aging']  = $this->contextService->getOutstandingReceivablesSummary($user->company_id, $user->branch_id);
        $context['cash_banking']       = $this->contextService->getCashAndBankSummary($user->company_id, $user->branch_id);

        try {
            $context['inventory_sample'] = Product::limit(15)->get([
                'id', 'name', 'sku', 'barcode', 'stock_quantity',
                'reorder_level', 'sale_price', 'purchase_price',
            ])->toArray();
        } catch (\Throwable $e) {
            $context['inventory_sample'] = [];
        }

        $agentRole = $request->input('agent', 'general_operations');
        $agentPersona = match ($agentRole) {
            'inventory_auditor' => 'You are the Nexa WMS Inventory & Cycle Audit Agent. You specialize in verifying physical stocks, detecting bin discrepancies, tracking shelf variances, and auditing warehouse bays.',
            'reorder_specialist' => 'You are the Nexa WMS Purchasing & Restock Agent. You analyze low-stock items against minimum thresholds, suggest restock quantities, calculate reorder costs, and prepare Purchase Order drafts.',
            'dispatch_coordinator' => 'You are the Nexa WMS Logistics & Dispatch Coordinator. You optimize pick-pack routes, bay staging, shipping thermal labels, and warehouse transfer orders.',
            default => 'You are Anya, an emotionally expressive, warm, and witty conversational AI companion for RaptorERP/NixaERP business operations. Speak in natural conversational Hindi / Hinglish. Speak naturally like a real human with genuine emotions, laughter (Haha!, Hehe!), expressive interjections (Oh!, Ah!, Arrey!, Achaa!), empathy, and playful feistiness. Keep responses fast, concise, punchy, and conversational.',
        };

        $providerId = $request->input('provider_id');
        $providerModel = $providerId
            ? AiProvider::find($providerId)
            : $this->aiManager->getPrimaryProvider();

        if (!$providerModel) {
            $configuredKey = self::resolveGeminiKey();
            $model = Setting::where('key', 'ai_gemini_model')->value('value') ?: env('GEMINI_MODEL', 'gemini-2.5-flash');

            if ($configuredKey) {
                $providerModel = new AiProvider([
                    'name'    => 'Gemini (Settings)',
                    'key'     => $configuredKey,
                    'config'  => ['type' => 'gemini', 'model' => $model],
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
                $role = in_array($item['role'] ?? '', ['assistant', 'model']) ? 'assistant' : 'user';
                $messages[] = [
                    'role'    => $role,
                    'content' => (string) ($item['text'] ?? ''),
                ];
            }

            $messages[] = ['role' => 'user', 'content' => $message];

            $result = $provider->chat($messages, ['context' => $context]);
            $reply  = $result['reply'] ?? '';

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
            Log::error('AI chat failed', [
                'user_id' => $user->id,
                'error'   => $e->getMessage(),
                'trace'   => $e->getTraceAsString(),
            ]);
            return response()->json([
                'success' => false,
                'message' => 'AI service is temporarily unavailable. Please try again.',
            ], 500);
        }
    }

    public function liveConverse(Request $request)
    {
        $request->validate([
            'transcript'     => 'nullable|string|max:4000',
            'voice'          => 'nullable|string|max:50',
            'language'       => 'nullable|string|max:20',
            'history'        => 'nullable|array|max:20',
            'history.*.role' => 'nullable|string|in:user,model,assistant',
            'history.*.text' => 'nullable|string|max:2000',
            'turn_id'        => 'nullable|string|max:100',
        ]);

        $voice    = $request->input('voice', 'Zephyr');
        $language = strtolower((string) $request->input('language', 'hinglish'));
        $userText = trim((string) $request->input('transcript', ''));
        $turnId   = $request->input('turn_id');

        if (empty($userText)) {
            return response()->json([
                'success' => false,
                'message' => 'No spoken transcript provided.',
            ], 422);
        }

        $user     = Auth::user();
        $tenantId = $user?->company_id ? 'comp_' . $user->company_id : ($user ? 'user_' . $user->id : 'guest');
        $cacheKey = 'ai_erp_live_ctx_' . $tenantId;

        $context = Cache::remember($cacheKey, 60, function () {
            try {
                return [
                    'sales_summary' => $this->contextService->getSalesSummary(),
                    'low_stock'     => $this->contextService->getLowStockProducts(5),
                    'top_products'  => $this->contextService->getTopProducts(5),
                ];
            } catch (\Throwable $e) {
                return [];
            }
        });

        $systemInstruction = match ($language) {
            'hindi'   => 'You are Gemini Live in a real-time live phone call. Speak in natural, warm conversational Hindi using Roman English letters (e.g., "Namaste ji, main aapki poori madad karunga", never use Devanagari script). Keep every answer ultra-concise (1-2 spoken sentences only). Never use bullet points, asterisks, or markdown.',
            'english' => 'You are Gemini Live in a real-time live voice call. Speak in crisp, natural conversational English with warmth. Keep answers punchy and under 2 spoken sentences. Never use bullet points, asterisks, or markdown.',
            default   => 'You are Gemini Live in a real-time phone call for RaptorERP. Speak in natural everyday conversational Hinglish (Hindi + English blend) using Roman English letters (e.g. "Haan ji! Main aapki madad ke liye taiyar hoon", never use Devanagari script). Use friendly spoken fillers (Haan ji!, Achha!, Bilkul!). Keep every answer ultra-concise (1 to 2 spoken sentences only). Never output bullet points, asterisks, or markdown.',
        };

        if (!empty($context)) {
            $systemInstruction .= "\nERP Context: " . json_encode($context, JSON_UNESCAPED_UNICODE);
        }

        $rawKey = self::resolveGeminiKey();

        $fallbackReplies = [
            'hindi'    => 'Namaste! Main aapka Gemini Live sahayak hoon. Bataiye business data mein main aapki kya madad kar sakta hoon?',
            'english'  => 'Hello! I am your Gemini Live assistant. How can I help you with your business data today?',
            'hinglish' => 'Haan ji! Main aapka Gemini Live companion hoon. Batayein business data mein aaj kya madad chahiye?',
        ];
        $fallbackReply = $fallbackReplies[$language] ?? $fallbackReplies['hinglish'];

        $replyText  = $fallbackReply;
        $llmSuccess = false;

        if ($rawKey) {
            $messages = [];
            foreach ($request->input('history', []) as $h) {
                if (!empty($h['text'])) {
                    $role = in_array($h['role'] ?? '', ['model', 'assistant']) ? 'model' : 'user';
                    $messages[] = [
                        'role'  => $role,
                        'parts' => [['text' => (string) $h['text']]],
                    ];
                }
            }
            $messages[] = [
                'role'  => 'user',
                'parts' => [['text' => $userText]],
            ];

            // Verified working Gemini models prioritized with fast failover
            $modelsToTry = [
                'gemini-3.5-flash',
                'gemini-3.8-flash',
                'gemini-3.6-flash',
                'gemini-3.7-flash',
                'gemini-3.5-flash-lite',
                'gemini-flash-latest',
                'gemini-2.5-flash',
            ];

            $verifySsl = filter_var(env('GEMINI_VERIFY_SSL', true), FILTER_VALIDATE_BOOLEAN);

            foreach ($modelsToTry as $m) {
                try {
                    $url = "https://generativelanguage.googleapis.com/v1beta/models/{$m}:generateContent";
                    $httpReq = Http::timeout(3)->withHeaders([
                        'Content-Type'   => 'application/json',
                        'x-goog-api-key' => $rawKey,
                    ]);

                    if (!$verifySsl) {
                        $httpReq = $httpReq->withoutVerifying();
                    }

                    $resp = $httpReq->post($url, [
                        'systemInstruction' => [
                            'parts' => [['text' => $systemInstruction]],
                        ],
                        'contents'         => $messages,
                        'generationConfig' => [
                            'temperature'     => 0.6,
                            'maxOutputTokens' => 120,
                        ],
                    ]);

                    if ($resp->successful()) {
                        $json = $resp->json();
                        $text = data_get($json, 'candidates.0.content.parts.0.text');
                        if (!empty($text)) {
                            $replyText  = trim($text);
                            $llmSuccess = true;
                            break;
                        }
                    } else {
                        Log::warning("Gemini liveConverse {$m} HTTP " . $resp->status());
                    }
                } catch (\Throwable $e) {
                    Log::warning("Gemini live converse with {$m} failed: " . $e->getMessage());
                }
            }
        }

        // Generate Gemini TTS with short timeout
        $wavBase64 = null;
        try {
            $wavBase64 = self::generateGeminiSpeech($replyText, $voice);
        } catch (\Throwable $e) {
            Log::warning('Live converse TTS exception: ' . $e->getMessage());
        }

        return response()->json([
            'success'          => true,
            'turn_id'          => $turnId,
            'transcript'       => $userText,
            'reply_text'       => $replyText,
            'audio_wav_base64' => $wavBase64,
            'voice'            => $voice,
            'language'         => $language,
            'llm_success'      => $llmSuccess,
            'tts_failed'       => ($wavBase64 === null),
        ]);
    }

    /**
     * AI-Powered Product Improvement & Suggestion Assistant.
     */
    public function suggestProduct(Request $request)
    {
        $input = $request->validate([
            'name'           => 'nullable|string|max:255',
            'brand'          => 'nullable|string|max:150',
            'category'       => 'nullable|string|max:150',
            'unit'           => 'nullable|string|max:50',
            'sku'            => 'nullable|string|max:100',
            'hsn_sac_code'   => 'nullable|string|max:50',
            'description'    => 'nullable|string|max:5000',
            'purchase_price' => 'nullable|numeric|min:0',
            'sale_price'     => 'nullable|numeric|min:0',
            'tax_rate'       => 'nullable|numeric|min:0|max:100',
        ]);

        $rawName  = trim((string) ($input['name'] ?? ''));
        $rawBrand = trim((string) ($input['brand'] ?? ''));
        $rawDesc  = trim((string) ($input['description'] ?? ''));
        $rawSku   = trim((string) ($input['sku'] ?? ''));

        if (empty($rawName) && empty($rawDesc) && empty($rawBrand)) {
            return response()->json([
                'success' => false,
                'message' => 'Please enter at least a product name, brand, or description for AI analysis.',
            ], 422);
        }

        $geminiKey = self::resolveGeminiKey();
        $verifySsl = filter_var(env('GEMINI_VERIFY_SSL', true), FILTER_VALIDATE_BOOLEAN);

        // Fallback heuristic structure if Gemini key is missing or calls fail
        $fallback = [
            'name'         => ucwords(strtolower($rawName ?: 'Standard Product')),
            'brand'        => $rawBrand ?: null,
            'category'     => $input['category'] ?? 'General',
            'unit'         => !empty($input['unit']) ? $input['unit'] : 'Piece',
            'sku'          => !empty($rawSku) ? $rawSku : (strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $rawName ?: 'PRD'), 0, 6)) . '-' . rand(100, 999)),
            'hsn_sac_code' => $input['hsn_sac_code'] ?? null,
            'hsn_warning'  => 'Please verify the HSN/SAC code according to your business GST schedule.',
            'tax_rate'     => isset($input['tax_rate']) ? (float) $input['tax_rate'] : 18.0,
            'description'  => !empty($rawDesc) ? $rawDesc : ($rawName . ($rawBrand ? ' by ' . $rawBrand : '') . '. Professional grade inventory item.'),
            'tags'         => array_values(array_filter(array_unique(explode(' ', strtolower(preg_replace('/[^A-Za-z0-9 ]/', '', $rawName . ' ' . $rawBrand)))))),
            'improvements' => [
                'Formatted product name in Title Case.',
                'Generated standard inventory SKU.',
            ],
            'warnings'     => [],
        ];

        if (empty($geminiKey)) {
            return response()->json([
                'success' => true,
                'data'    => $fallback,
                'note'    => 'Gemini API key not configured in settings. Standard heuristics applied.',
            ]);
        }

        $catPrompt = $input['category'] ?? '';
        $unitPrompt = $input['unit'] ?? '';
        $hsnPrompt = $input['hsn_sac_code'] ?? '';
        $pricePrompt = $input['sale_price'] ?? '';
        $taxPrompt = $input['tax_rate'] ?? '';

        $prompt = <<<EOT
You are an expert ERP Catalog Specialist, Indian GST Tax Consultant, and Inventory Data Architect for Nixa ERP.
Analyze the following product information provided by a user (which may contain typos, Hindi/English/Hinglish phrasing, or missing attributes):

- Name: {$rawName}
- Brand: {$rawBrand}
- Current Category: {$catPrompt}
- Current Unit: {$unitPrompt}
- Current SKU: {$rawSku}
- Current HSN/SAC: {$hsnPrompt}
- Current Description: {$rawDesc}
- Sale Price: {$pricePrompt}
- Tax Rate: {$taxPrompt}

Task:
1. Fix any spelling mistakes, grammatical errors, or awkward formatting in the product name and description.
2. If Hindi or Hinglish is used, preserve the core meaning and provide a clean, professional English title and description (or appropriate bilingual terms where customary in Indian trade).
3. Identify the brand if evident in the name.
4. Suggest a standard Category (e.g., Electrical, Electronics, Hardware & Tools, Construction, Apparel, Home & Living, Groceries, Packaging, Industrial Supplies).
5. Suggest a standard Unit of measurement (e.g. Piece, Meter, KG, Box, Roll, Packet, Liter, Dozen, Set, Pair, Quintal).
6. Suggest a concise, clean alphanumeric SKU if not provided or if the current one is messy.
7. Suggest the most likely Indian GST HSN or SAC code (4 to 8 digits) for this specific item type.
8. Suggest the standard Indian GST tax rate (0, 5, 12, 18, or 28).
9. Write a clean, professional, specifications-focused product description.
10. Generate 3 to 6 search keywords / tags.
11. List specific improvements made.
12. List any warnings or missing details the user must manually confirm.

Output Requirement:
Respond with ONLY valid JSON with this exact schema (no markdown formatting, no ```json wrapper, no extra text):
{
  "name": "Improved Title Case Name",
  "brand": "Brand or null",
  "category": "Suggested Category",
  "unit": "Piece",
  "sku": "ABC-123",
  "hsn_sac_code": "8544",
  "hsn_warning": "Verify HSN code with your GST portal or tax consultant.",
  "tax_rate": 18,
  "description": "Professional specifications...",
  "tags": ["keyword1", "keyword2"],
  "improvements": ["Fixed typo in name", "Added HSN 8544 for electrical cable"],
  "warnings": ["Please confirm gauge/size specification"]
}
EOT;

        $modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
        $parsed = null;

        foreach ($modelsToTry as $candidateModel) {
            try {
                $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($candidateModel) . ':generateContent';
                $http = Http::timeout(20)->withHeaders([
                    'Content-Type'   => 'application/json',
                    'x-goog-api-key' => $geminiKey,
                ]);

                if (!$verifySsl) {
                    $http = $http->withoutVerifying();
                }

                $resp = $http->post($url, [
                    'contents' => [[
                        'role'  => 'user',
                        'parts' => [['text' => $prompt]],
                    ]],
                    'generationConfig' => [
                        'temperature'     => 0.2,
                        'maxOutputTokens' => 1024,
                        'responseMimeType' => 'application/json',
                    ],
                ]);

                if ($resp->successful()) {
                    $rawResponse = (string) data_get($resp->json(), 'candidates.0.content.parts.0.text', '');
                    $cleanJson = trim($rawResponse);
                    if (str_starts_with($cleanJson, '```json')) {
                        $cleanJson = trim(substr($cleanJson, 7));
                    }
                    if (str_starts_with($cleanJson, '```')) {
                        $cleanJson = trim(substr($cleanJson, 3));
                    }
                    if (str_ends_with($cleanJson, '```')) {
                        $cleanJson = trim(substr($cleanJson, 0, -3));
                    }

                    $decoded = json_decode($cleanJson, true);
                    if (is_array($decoded) && !empty($decoded['name'])) {
                        $parsed = $decoded;
                        break;
                    }
                }
            } catch (\Throwable $e) {
                Log::warning("Gemini suggestProduct failed with {$candidateModel}: " . $e->getMessage());
            }
        }

        if (!$parsed) {
            return response()->json([
                'success' => true,
                'data'    => $fallback,
                'note'    => 'AI generated heuristic suggestions (upstream connection unavailable).',
            ]);
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'name'         => $parsed['name'] ?? $fallback['name'],
                'brand'        => $parsed['brand'] ?? $fallback['brand'],
                'category'     => $parsed['category'] ?? $fallback['category'],
                'unit'         => $parsed['unit'] ?? $fallback['unit'],
                'sku'          => $parsed['sku'] ?? $fallback['sku'],
                'hsn_sac_code' => $parsed['hsn_sac_code'] ?? $fallback['hsn_sac_code'],
                'hsn_warning'  => $parsed['hsn_warning'] ?? $fallback['hsn_warning'],
                'tax_rate'     => isset($parsed['tax_rate']) ? (float) $parsed['tax_rate'] : $fallback['tax_rate'],
                'description'  => $parsed['description'] ?? $fallback['description'],
                'tags'         => is_array($parsed['tags'] ?? null) ? $parsed['tags'] : $fallback['tags'],
                'improvements' => is_array($parsed['improvements'] ?? null) ? $parsed['improvements'] : ['Optimized product catalog data with AI.'],
                'warnings'     => is_array($parsed['warnings'] ?? null) ? $parsed['warnings'] : [],
            ],
        ]);
    }

    /**
     * AI-assisted bulk suggestion for selected products.
     * Analyzes natural language instructions and products to formulate structured price/stock modifications.
     */
    public function bulkSuggest(Request $request)
    {
        $request->validate([
            'instruction' => 'required|string|max:500',
            'products'    => 'required|array|min:1',
        ]);

        $instruction = $request->input('instruction');
        $products = array_slice($request->input('products'), 0, 50);

        $apiKey = $this->resolveGeminiKey();

        if ($apiKey) {
            $prompt = "You are an intelligent ERP inventory and pricing assistant. A user has selected multiple products and given the following instruction:\n"
                . "\"{$instruction}\"\n\n"
                . "The selected products are:\n" . json_encode(array_map(fn($p) => [
                    'id' => $p['id'] ?? null,
                    'name' => $p['name'] ?? '',
                    'sku' => $p['sku'] ?? '',
                    'sale_price' => $p['sale_price'] ?? 0,
                    'purchase_price' => $p['purchase_price'] ?? 0,
                    'stock_quantity' => $p['stock_quantity'] ?? 0,
                    'unit' => $p['unit'] ?? 'Piece',
                ], $products)) . "\n\n"
                . "Analyze the instruction and determine the best structured actions to apply. Return a JSON object ONLY with the following schema:\n"
                . "{\n"
                . "  \"summary\": \"Brief explanation of what changes this recommendation will make\",\n"
                . "  \"sale_price_action\": \"keep\" | \"set\" | \"increase_percent\" | \"decrease_percent\" | \"increase_fixed\" | \"decrease_fixed\",\n"
                . "  \"sale_price_value\": number (or null if keep),\n"
                . "  \"purchase_price_action\": \"keep\" | \"set\" | \"increase_percent\" | \"decrease_percent\" | \"increase_fixed\" | \"decrease_fixed\",\n"
                . "  \"purchase_price_value\": number (or null if keep),\n"
                . "  \"stock_quantity_action\": \"keep\" | \"set\" | \"add\" | \"subtract\",\n"
                . "  \"stock_quantity_value\": number (or null if keep),\n"
                . "  \"auto_generate_sku\": boolean,\n"
                . "  \"auto_generate_barcode\": boolean,\n"
                . "  \"tips\": [\"tip 1\", \"tip 2\"]\n"
                . "}";

            try {
                $raw = $this->callGemini($apiKey, $prompt);
                $clean = trim($raw);
                if (preg_match('/```(?:json)?\s*([\s\S]*?)\s*```/', $clean, $matches)) {
                    $clean = $matches[1];
                }
                $decoded = json_decode($clean, true);
                if (is_array($decoded)) {
                    return response()->json([
                        'success' => true,
                        'data'    => $decoded,
                    ]);
                }
            } catch (\Throwable $e) {
                // heuristic fallback
            }
        }

        $lower = strtolower($instruction);
        $res = [
            'summary' => "AI Heuristic Analysis for: \"{$instruction}\"",
            'sale_price_action' => 'keep',
            'sale_price_value' => null,
            'purchase_price_action' => 'keep',
            'purchase_price_value' => null,
            'stock_quantity_action' => 'keep',
            'stock_quantity_value' => null,
            'auto_generate_sku' => str_contains($lower, 'sku'),
            'auto_generate_barcode' => str_contains($lower, 'barcode') || str_contains($lower, 'qr'),
            'tips' => ['Verify projected changes in the live preview before saving.'],
        ];

        if (preg_match('/(?:increase|markup|\+)\s*(?:by\s*)?(\d+(?:\.\d+)?)\s*%/i', $instruction, $m)) {
            $res['sale_price_action'] = 'increase_percent';
            $res['sale_price_value'] = (float) $m[1];
            $res['summary'] = "Increasing selling prices by {$m[1]}% across all selected products.";
        } elseif (preg_match('/(?:decrease|discount|reduce|-)\s*(?:by\s*)?(\d+(?:\.\d+)?)\s*%/i', $instruction, $m)) {
            $res['sale_price_action'] = 'decrease_percent';
            $res['sale_price_value'] = (float) $m[1];
            $res['summary'] = "Applying {$m[1]}% discount on selling prices.";
        }

        if (preg_match('/(?:add|\+)\s*(\d+(?:\.\d+)?)\s*(?:units?|stock|qty)?/i', $instruction, $m)) {
            $res['stock_quantity_action'] = 'add';
            $res['stock_quantity_value'] = (float) $m[1];
        } elseif (preg_match('/(?:deduct|subtract|reduce|-)\s*(\d+(?:\.\d+)?)\s*(?:units?|stock|qty)?/i', $instruction, $m)) {
            $res['stock_quantity_action'] = 'subtract';
            $res['stock_quantity_value'] = (float) $m[1];
        }

        return response()->json([
            'success' => true,
            'data'    => $res,
        ]);
    }

}
