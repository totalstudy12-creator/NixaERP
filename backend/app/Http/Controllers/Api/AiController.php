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
            $lowStock = \App\Models\Product::whereRaw('stock_quantity <= minimum_stock')
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

        return response()->json([
            'success' => true,
            'data' => [
                'configured' => !empty($settings['ai_gemini_api_key']),
                'model' => $settings['ai_gemini_model'] ?: 'gemini-2.5-flash',
            ],
        ]);
    }

    public function saveAssistantConfig(Request $request)
    {
        $validated = $request->validate([
            'api_key' => 'required|string|min:20|max:500',
            'model'   => 'required|string|max:100',
        ]);

        foreach ([
            'ai_gemini_api_key' => Crypt::encryptString(trim($validated['api_key'])),
            'ai_gemini_model'   => $validated['model'],
        ] as $key => $value) {
            \App\Models\Setting::updateOrCreate(
                ['key' => $key],
                [
                    'value'       => $value,
                    'group'       => 'ai',
                    'description' => 'Encrypted server-side Gemini configuration for AI assistant.',
                    'is_public'   => false,
                ]
            );
        }

        return response()->json([
            'success' => true,
            'data' => ['configured' => true, 'model' => $validated['model']],
        ]);
    }

    /**
     * Test a Gemini key + model combination.
     *
     * Handles all the ways Gemini can return HTTP 200 while producing no visible
     * text (thinking budget exhaustion, safety blocks, recitation, empty parts).
     */
    public function testAssistantConfig(Request $request)
    {
        $validated = $request->validate([
            'api_key' => 'required|string|min:20|max:500',
            'model'   => 'required|string|max:100|regex:/^[a-zA-Z0-9._-]+$/',
        ]);

        $apiKey = trim($validated['api_key']);
        $model  = trim($validated['model']);

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            . rawurlencode($model)
            . ':generateContent';

        // Baseline config — plenty of headroom so thinking passes cannot starve
        // the visible answer.
        $generationConfig = [
            'temperature'     => 0,
            'maxOutputTokens' => 512,
        ];

        // Gemini 2.5+ supports an explicit thinking budget. Turn it off for this
        // connectivity probe so every token goes to visible output.
        if (preg_match('/2\.5|2\.0|3\./', $model)) {
            $generationConfig['thinkingConfig'] = ['thinkingBudget' => 0];
        }

        try {
            $response = Http::timeout(30)
                ->withHeaders([
                    'Content-Type'   => 'application/json',
                    'x-goog-api-key' => $apiKey,
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

            // ---- Non-2xx: translate provider status codes -------------------
            if (!$response->successful()) {
                $googleMessage = (string) data_get($body, 'error.message', '');

                $message = match ($status) {
                    400 => 'Gemini rejected the request. Check the selected model name and model access. ' . $googleMessage,
                    401, 403 => 'Gemini rejected this API key or the key lacks permission for this model. Check the key and Google AI Studio project access. ' . $googleMessage,
                    404 => 'The selected Gemini model was not found or is unavailable to this project. Select a model listed for your API key. ' . $googleMessage,
                    429 => 'Gemini provider quota or rate limit reached. Check quota and billing for the Google AI Studio project, then retry.',
                    default => 'Gemini connection failed (HTTP ' . $status . '). ' . $googleMessage,
                };

                return response()->json(['success' => false, 'message' => $message], 422);
            }

            // ---- 2xx but provider returned an error object ------------------
            if (isset($body['error'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Gemini error: '
                        . (string) data_get($body, 'error.message', 'Unknown error'),
                ], 422);
            }

            // ---- Prompt-level blocking (safety, recitation, etc.) -----------
            $blockReason = (string) data_get($body, 'promptFeedback.blockReason', '');
            if ($blockReason !== '') {
                return response()->json([
                    'success' => false,
                    'message' => "Gemini blocked this request ({$blockReason}). Adjust the prompt or safety settings.",
                ], 422);
            }

            // ---- Walk every part and skip thought-only parts ----------------
            $candidate    = data_get($body, 'candidates.0');
            $finishReason = (string) data_get($candidate, 'finishReason', '');
            $parts        = (array) data_get($candidate, 'content.parts', []);

            $text = '';
            foreach ($parts as $part) {
                if (!is_array($part)) {
                    continue;
                }
                // Thinking models can emit a `thought: true` part with the hidden
                // reasoning trace. Ignore it — we only want user-visible text.
                if (!empty($part['thought'])) {
                    continue;
                }
                if (isset($part['text']) && is_string($part['text'])) {
                    $text .= $part['text'];
                }
            }
            $text = trim($text);

            if ($text !== '') {
                return response()->json([
                    'success' => true,
                    'message' => 'Gemini key and selected model can generate a response.',
                    'sample'  => $text,
                ]);
            }

            // ---- HTTP 200 but no visible text — explain precisely -----------
            $message = match ($finishReason) {
                'SAFETY'      => 'Gemini blocked the reply due to its safety filters. Try a different prompt or model.',
                'RECITATION'  => 'Gemini declined to answer (recitation). Try a different prompt.',
                'MAX_TOKENS'  => 'Gemini used all output tokens before producing visible text. This usually happens with thinking models — increase maxOutputTokens or pick a non-thinking model such as gemini-1.5-flash.',
                'OTHER'       => 'Gemini stopped for an unspecified reason before producing text.',
                ''            => 'Gemini returned an empty response. The model may be a thinking variant that consumed its budget on reasoning. Try gemini-2.5-flash with thinking disabled, or gemini-1.5-flash.',
                default       => "Gemini returned an empty response (finishReason: {$finishReason}).",
            };

            return response()->json(['success' => false, 'message' => $message], 422);
        } catch (\Throwable $e) {
            Log::warning('Gemini settings connection check failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Could not reach Google Gemini. Check the server network connection and retry.',
            ], 503);
        }
    }

    public function clearAssistantConfig()
    {
        \App\Models\Setting::whereIn('key', ['ai_gemini_api_key', 'ai_gemini_model'])->delete();
        return response()->json(['success' => true]);
    }

    public function voice(Request $request)
    {
        $request->validate([
            'text'     => 'required|string|max:3000',
            'provider' => 'nullable|string|in:browser,cloud,auto',
            'language' => 'nullable|string|max:20',
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

        if (in_array($provider, ['cloud', 'elevenlabs', 'auto'], true) && $paidEnabled) {
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
                        'model' => $settings['ai_gemini_model'] ?: 'gemini-2.5-flash',
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
                'content' => 'You are a practical business operations agent for this ERP. '
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