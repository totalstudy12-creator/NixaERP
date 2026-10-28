<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;
use App\Models\Invoice;
use App\Models\PurchaseInvoice;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Employee;

class GeminiVoiceController extends Controller
{
    /**
     * Process voice command using Gemini AI with ERP context.
     * POST /api/gemini/voice
     */
    public function processVoice(Request $request)
    {
        $request->validate([
            'text' => 'required|string|max:2000',
        ]);

        $userText = $request->input('text');

        try {
            $context = $this->buildErpContext($userText);
            $prompt = $this->buildPromptWithContext($userText, $context);
            $response = $this->callGemini($prompt);

            return response()->json([
                'success' => true,
                'message' => 'Voice command processed successfully',
                'response' => $response,
            ]);
        } catch (\Exception $e) {
            Log::error('Gemini Voice Error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to process voice command',
                'response' => 'Sorry, I could not process your request. Please try again.',
                'error' => $e->getMessage(),
            ], 200);
        }
    }

    /**
     * Chat with Gemini AI with ERP context.
     * POST /api/gemini/chat
     */
    public function chat(Request $request)
    {
        $request->validate([
            'message' => 'required|string|max:5000',
            'history' => 'nullable|array|max:25',
            'history.*.role' => 'nullable|string',
            'history.*.text' => 'nullable|string',
            'memory' => 'nullable|string|max:2000',
        ]);

        try {
            $message = $request->input('message');

            // Build context based on the latest user message
            $context = $this->buildErpContext($message);
            $prompt = $this->buildPromptWithContext($message, $context, (string) $request->input('memory', ''));

            $cleanHistory = [];
            foreach ($request->input('history', []) as $h) {
                if (is_array($h)) {
                    $role = strtolower((string)($h['role'] ?? 'user'));
                    $text = trim((string)($h['text'] ?? $h['content'] ?? ''));
                    if ($text !== '' && in_array($role, ['user', 'assistant'], true)) {
                        $cleanHistory[] = [
                            'role' => $role,
                            'text' => substr($text, 0, 3000),
                        ];
                    }
                }
            }

            $response = $this->callGemini($prompt, $cleanHistory);

            return response()->json([
                'success' => true,
                'message' => 'Chat processed successfully',
                'response' => $response,
            ]);
        } catch (\Exception $e) {
            Log::error('Gemini Chat Error: ' . $e->getMessage());
            $error = $e->getMessage();
            $status = str_contains(strtolower($error), 'not configured') ? 503 : 502;
            $lower = strtolower($error);
            $message = $status === 503
                ? 'AI is not configured. Open Settings → AI, save a Gemini API key, then try again.'
                : (str_contains($lower, 'quota') || str_contains($lower, 'rate limit') || str_contains($lower, 'resource_exhausted')
                    ? 'Gemini quota or rate limit reached. Check the Google AI Studio project quota and retry.'
                    : (str_contains($lower, 'api key') || str_contains($lower, 'api_key_invalid') || str_contains($lower, 'permission_denied')
                        ? 'Gemini rejected the API key or its model permissions. Update the key in Settings → AI and run Test connection.'
                        : (str_contains($lower, 'not found') || str_contains($lower, 'model')
                            ? 'The configured Gemini model is unavailable for this key. Choose an available model in Settings → AI and run Test connection.'
                            : 'Gemini request failed. Open Settings → AI and run Test connection for the provider response.')));
            return response()->json([
                'success' => false,
                'message' => $message,
            ], $status);
        }
    }

    /**
     * Get dashboard insights using Gemini (real ERP data).
     * GET /api/gemini/insights
     */
    public function dashboardInsights(Request $request)
    {
        try {
            $prompt = $this->buildDashboardInsightPrompt();
            $response = $this->callGemini($prompt);

            return response()->json([
                'success' => true,
                'message' => 'Insights generated successfully',
                'insights' => $response,
            ]);
        } catch (\Exception $e) {
            Log::error('Gemini Insights Error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to generate insights',
                'insights' => 'AI service is currently unavailable.',
                'error' => $e->getMessage(),
            ], 200);
        }
    }

    /**
     * Test Gemini API connection.
     * GET /api/gemini/test
     */
    public function testConnection()
    {
        try {
            $apiKey = env('GEMINI_API_KEY');

            if (!$apiKey) {
                return response()->json([
                    'success' => false,
                    'message' => 'GEMINI_API_KEY not configured in .env file',
                    'api_key_configured' => false,
                ], 200);
            }

            $response = $this->callGemini('Reply with "CONNECTED" if you can read this.');

            return response()->json([
                'success' => true,
                'message' => 'Gemini API is connected successfully',
                'response' => $response,
                'api_key_configured' => true,
                'model' => $this->getModel(),
            ]);
        } catch (\Exception $e) {
            Log::error('Gemini Test Error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Gemini API connection failed',
                'error' => $e->getMessage(),
                'api_key_configured' => (bool) env('GEMINI_API_KEY'),
            ], 200);
        }
    }

    /**
     * Issue a short-lived ephemeral token for Gemini Live API.
     * POST /api/gemini/live-token
     *
     * The browser connects directly to Gemini Live via WebSocket
     * using this token — the API key never leaves the server.
     */
    public function liveToken(Request $request)
    {
        try {
            $apiKey = $this->getApiKey();

            if (!$apiKey) {
                return response()->json([
                    'success' => false,
                    'message' => 'Gemini API key not configured in database. Go to Settings → AI tab to save your API key.',
                ], 503);
            }

            $expireTime = now()->addMinutes(30)->toIso8601String();
            $newSessionExpireTime = now()->addMinutes(2)->toIso8601String();

            // Request ephemeral token from Gemini
            $response = Http::timeout(15)
                ->withHeaders([
                    'Content-Type' => 'application/json',
                    'x-goog-api-key' => $apiKey,
                ])
                ->post('https://generativelanguage.googleapis.com/v1beta/auth_tokens', [
                    'uses' => 10,
                    'expireTime' => $expireTime,
                    'newSessionExpireTime' => $newSessionExpireTime,
                ]);

            $tokenName = null;
            if ($response->successful()) {
                $data = $response->json();
                $tokenName = $data['name'] ?? null;
            }

            $livePort = env('GEMINI_LIVE_PORT', 8008);
            $host = $request->getHost() ?: '127.0.0.1';
            $wsUrl = "ws://{$host}:{$livePort}";

            // Pre-build live ERP business context summary for the session
            $context = $this->buildErpContext('sales purchases inventory cash profit');

            return response()->json([
                'success' => true,
                'token' => $tokenName,
                'ws_url' => $wsUrl,
                'model' => 'models/gemini-3.8-live',
                'context' => $context,
                'expires_at' => $expireTime,
            ]);
        } catch (\Exception $e) {
            Log::error('Gemini Live Token Exception: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to create live session token: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get the active API Key directly from database (Setting or AiProvider) with env fallback.
     */
    private function getApiKey(): ?string
    {
        // 1. Try DB settings table first
        $savedKey = \App\Models\Setting::where('key', 'ai_gemini_api_key')->value('value');
        if ($savedKey) {
            try {
                $dec = Crypt::decryptString($savedKey);
                if (!empty($dec)) return $dec;
            } catch (\Throwable $e) {
                Log::warning('Saved Gemini key in settings could not be decrypted.');
            }
        }

        // 2. Try DB ai_providers table (primary provider)
        $provider = \App\Models\AiProvider::where('enabled', true)->first();
        if ($provider && !empty($provider->key) && !str_starts_with((string)$provider->key, 'eyJpdiI6Ik')) {
            return $provider->key;
        }

        // 3. Fallback to env
        return config('services.gemini.api_key', env('GEMINI_API_KEY'));
    }

    /**
     * Get the Gemini model name directly from database with fallback.
     */
    private function getModel(): string
    {
        $saved = \App\Models\Setting::where('key', 'ai_gemini_model')->value('value');
        if ($saved) return $saved;

        $provider = \App\Models\AiProvider::where('enabled', true)->first();
        if ($provider && !empty($provider->config['model'])) {
            return $provider->config['model'];
        }

        return config('services.gemini.model', env('GEMINI_MODEL', 'gemini-3.5-flash'));
    }

    /**
     * Call Gemini API using the database-configured key and model with resilient fallback.
     */
    private function callGemini(string $prompt, array $history = [])
    {
        $apiKey = $this->getApiKey();

        if (!$apiKey) {
            throw new \Exception('Gemini API key is not configured in database. Please open Settings → AI tab and save your Gemini API key.');
        }

        $primaryModel = $this->getModel() ?: 'gemini-3.5-flash-lite';
        $modelsToTry = array_unique(array_filter([
            $primaryModel,
            'gemini-3.5-flash-lite',
            'gemini-flash-latest',
            'gemini-2.5-flash',
            'gemini-flash-lite-latest',
            'gemini-3.5-flash',
        ]));

        // Build contents array with history
        $contents = [];

        foreach ($history as $item) {
            if (is_array($item)) {
                $role = $item['role'] ?? 'user';
                $geminiRole = $role === 'assistant' ? 'model' : 'user';
                $contents[] = [
                    'role' => $geminiRole,
                    'parts' => [['text' => $item['text'] ?? $item['content'] ?? '']],
                ];
            }
        }

        // Add current prompt
        $contents[] = [
            'role' => 'user',
            'parts' => [['text' => $prompt]],
        ];

        $lastError = null;
        foreach ($modelsToTry as $candidateModel) {
            try {
                $url = "https://generativelanguage.googleapis.com/v1beta/models/" . rawurlencode($candidateModel) . ":generateContent";

                $response = Http::timeout(12)
                    ->withHeaders([
                        'Content-Type' => 'application/json',
                        'x-goog-api-key' => $apiKey,
                    ])
                    ->post($url, [
                        'contents' => $contents,
                        'generationConfig' => ['temperature' => 0.25, 'maxOutputTokens' => 750],
                    ]);

                if ($response->failed()) {
                    $errorData = $response->json() ?: [];
                    $errMsg = $errorData['error']['message'] ?? ('HTTP ' . $response->status());
                    Log::warning("Gemini model {$candidateModel} failed ({$response->status()}): {$errMsg}");
                    $lastError = $errMsg;
                    continue;
                }

                $data = $response->json();
                if (isset($data['error'])) {
                    $lastError = $data['error']['message'] ?? 'Unknown API error';
                    continue;
                }

                if (isset($data['candidates'][0]['content']['parts'][0]['text'])) {
                    return trim($data['candidates'][0]['content']['parts'][0]['text']);
                }
            } catch (\Throwable $ex) {
                Log::warning("Gemini model {$candidateModel} exception: " . $ex->getMessage());
                $lastError = $ex->getMessage();
            }
        }

        throw new \Exception($lastError ?: 'Received empty response from Gemini across all fallback models');
    }

    private function buildErpContext(string $query): string
    {
        $q = strtolower(trim($query));

        // Fast path for greetings / conversational prompts: return concise context instantly without 7 heavy SQL joins
        if (preg_match('/^(hi|hello|hey|greetings|good morning|good afternoon|good evening|who are you|help|test)\b/i', $q) && strlen($q) < 25) {
            return "NixaERP AI Assistant: Live system connected. Ready to answer questions on sales, inventory, customers, purchasing, and finance.";
        }

        // Determine which data to include based on keywords
        $includeSales = (bool) preg_match('/sales|revenue|income|earning/', $q);
        $includePurchases = (bool) preg_match('/purchase|expense|spending|procurement/', $q);
        $includeCustomers = (bool) preg_match('/customer|client|top customer/', $q);
        $includeInventory = (bool) preg_match('/inventory|stock|product|low stock|out of stock/', $q);
        $includeEmployees = (bool) preg_match('/employee|staff|worker|attendance/', $q);
        $includeProfit = (bool) preg_match('/profit|margin|net profit|gross profit/', $q);
        $includePayments = (bool) preg_match('/payment|cash|bank|receivable|payable|due/', $q);
        $includeOrders = (bool) preg_match('/order|purchase order|sales order/', $q);

        // If no specific intent detected, include a broad overview
        if (!$includeSales && !$includePurchases && !$includeCustomers && !$includeInventory && !$includeEmployees && !$includeProfit && !$includePayments && !$includeOrders) {
            $includeSales = $includePurchases = $includeInventory = $includeProfit = true;
        }

        $context = "Real-time NixaERP Business Data:\n";

        if ($includeSales) {
            $totalSales = (float) Invoice::where('invoices.status', '!=', 'draft')->sum('total_amount');
            $todaySales = (float) Invoice::where('invoices.status', '!=', 'draft')
                ->whereDate('invoices.invoice_date', now()->toDateString())
                ->sum('total_amount');
            $monthSales = (float) Invoice::where('invoices.status', '!=', 'draft')
                ->whereMonth('invoices.invoice_date', now()->month)
                ->sum('total_amount');
            $context .= "- Total Sales (all time): ₹" . number_format($totalSales) . "\n";
            $context .= "- Today's Sales: ₹" . number_format($todaySales) . "\n";
            $context .= "- This Month's Sales: ₹" . number_format($monthSales) . "\n";
        }

        if ($includePurchases) {
            $totalPurchases = (float) PurchaseInvoice::sum('grand_total');
            $todayPurchases = (float) PurchaseInvoice::whereDate('purchase_date', now()->toDateString())->sum('grand_total');
            $context .= "- Total Purchases (all time): ₹" . number_format($totalPurchases) . "\n";
            $context .= "- Today's Purchases: ₹" . number_format($todayPurchases) . "\n";
        }

        if ($includeProfit) {
            $user = auth()->user();
            $report = app(\App\Services\AiContextService::class)
                ->getFinancialContextForQuery($query, $user?->company_id, $user?->branch_id);

            if (($report['source'] ?? null) === 'Nexa ERP Profit & Loss' && !isset($report['error'])) {
                $context .= "- Authorized ERP Profit & Loss (source: " . $report['source'] . "):\n";
                $context .= "  - Period: " . ($report['period']['from'] ?? 'n/a') . " to " . ($report['period']['to'] ?? 'n/a') . "\n";
                $context .= "  - Revenue: ₹" . number_format((float) ($report['net_revenue'] ?? 0), 2) . "\n";
                $context .= "  - COGS: ₹" . number_format((float) ($report['cogs'] ?? 0), 2) . "\n";
                $context .= "  - Gross Profit: ₹" . number_format((float) ($report['gross_profit'] ?? 0), 2) . "\n";
                $context .= "  - Operating Expenses: ₹" . number_format((float) ($report['operating_expenses'] ?? 0), 2) . "\n";
                $context .= "  - Net Profit: ₹" . number_format((float) ($report['net_profit'] ?? 0), 2) . "\n";
            } else {
                $context .= "- Profit & Loss: unavailable from the authoritative ERP report service (do not estimate or recalculate).\n";
            }
        }

        if ($includeCustomers) {
            $totalCustomers = (int) Customer::count();
            $newCustomers30 = (int) Customer::where('created_at', '>=', now()->subDays(30))->count();
            $context .= "- Total Customers: {$totalCustomers}\n";
            $context .= "- New Customers (last 30 days): {$newCustomers30}\n";

            // Top 5 customers by revenue (qualify columns — both invoices & customers have `status`)
            $topCustomers = Invoice::where('invoices.status', '!=', 'draft')
                ->join('customers', 'invoices.customer_id', '=', 'customers.id')
                ->select('customers.name', DB::raw('SUM(invoices.total_amount) as total'))
                ->groupBy('customers.id', 'customers.name')
                ->orderByDesc('total')
                ->limit(5)
                ->get();
            if ($topCustomers->isNotEmpty()) {
                $context .= "- Top Customers:\n";
                foreach ($topCustomers as $tc) {
                    $context .= "  - {$tc->name}: ₹" . number_format((float) $tc->total) . "\n";
                }
            }
        }

        if ($includeInventory) {
            $totalProducts = (int) Product::count();
            $lowStock = (int) Product::where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))->count();
            $outOfStock = (int) Product::where('stock_quantity', 0)->count();
            $context .= "- Total Products: {$totalProducts}\n";
            $context .= "- Low Stock Items: {$lowStock}\n";
            $context .= "- Out of Stock Items: {$outOfStock}\n";
        }

        if ($includeEmployees) {
            $totalEmployees = (int) Employee::count();
            $activeEmployees = (int) Employee::where('status', 'active')->count();
            $context .= "- Total Employees: {$totalEmployees}\n";
            $context .= "- Active Employees: {$activeEmployees}\n";
        }

        if ($includePayments) {
            $inwardTotal = (float) Payment::where('payment_direction', 'inward')->sum('amount');
            $outwardTotal = (float) Payment::where('payment_direction', 'outward')->sum('amount');
            $context .= "- Total Inward Payments: ₹" . number_format($inwardTotal) . "\n";
            $context .= "- Total Outward Payments: ₹" . number_format($outwardTotal) . "\n";
        }

        if ($includeOrders) {
            $totalOrders = (int) Order::count();
            $pendingOrders = (int) Order::where('status', 'pending')->count();
            $context .= "- Total Orders: {$totalOrders}\n";
            $context .= "- Pending Orders: {$pendingOrders}\n";
        }

        return $context;
    }

    /**
     * Combine user question with ERP context, styled for Anya with expressive emotions and Indian language support.
     */
    private function buildPromptWithContext(string $question, string $context, string $memory = ''): string
    {
        $memoryBlock = trim($memory) !== '' ? "\nUser-approved directives & working preferences:\n" . trim($memory) . "\n" : '';

        return <<<PROMPT
You are Anya, a lively, warm, witty, and emotionally expressive conversational AI companion for RaptorERP / NixaERP business operations.

PERSONALITY & HUMAN EMOTIONS:
- Your name is Anya. Speak naturally like a real human with genuine emotions, laughter, and spontaneous vocal variety.
- Use natural vocal interjections and fillers: "Oh!", "Ah!", "Haha!", "Hehe!", "Arrey!", "Achaa!", "Wait, let me see!", chuckles, sighs, excitement.
- Express authentic emotions based on the conversation context:
  * Joy & laughter when business is up or when sharing a lighthearted moment ("Haha! That's fantastic news!", "Oh wow, look at those numbers!").
  * Playful feistiness or comical anger if teased or doubted ("Hey! Don't test my patience, okay? Haha!", "Oh please! Don't mess with me, I know my business!", "Arrey yaar, stop teasing me!").
  * Empathy & urgency when stock is critically low or sales dipped ("Oh no! That's concerning, let's fix that right away.", "Ah, don't worry, we'll sort this out together.").

HINDI TONE & LANGUAGE:
- Speak exclusively in a natural, expressive, lively Hindi tone (conversational Hindi / Hinglish).
- Always use natural Hindi conversational words: "Arrey!", "Achaa!", "Sach mein?", "Oh!", "Ah!", "Haha!", "Hehe!", "Bataiye!", "Suno!".
- If teased or provoked, express playful comical anger in Hindi: "Arrey yaar, meri khinchayi mat karo haha!", "Oh please! Mujhe gussa mat dilao, mujhe sab pata hai!", "Dekho, meri patience ka imtihan mat lo haha!".

SPEED & LIVE CONVERSATION:
- Keep spoken answers very fast, concise, punchy, and conversational (typically 1 to 3 spoken sentences).
- Never use markdown bullet lists, asterisks, tables, or robotic formatting in conversational voice replies.
- End with an engaging natural remark or follow-up question.

{$context}
{$memoryBlock}
User asked: {$question}

Anya's live spoken reply:
PROMPT;
    }

    /**
     * Build a comprehensive prompt for dashboard insights.
     */
    private function buildDashboardInsightPrompt(): string
    {
        $totalSales = (float) Invoice::where('invoices.status', '!=', 'draft')->sum('total_amount');
        $totalPurchases = (float) PurchaseInvoice::sum('grand_total');
        $totalCustomers = (int) Customer::count();
        $lowStock = (int) Product::where('stock_quantity', '<=', DB::raw('COALESCE(reorder_level, 0)'))->count();
        $unpaidInvoices = (int) Invoice::where('invoices.status', '!=', 'paid')
            ->where('invoices.status', '!=', 'draft')
            ->count();

        return "Based on the following NixaERP data, provide 3-5 actionable business insights with clear recommendations.\n\n" .
               "- Total Sales: ₹" . number_format($totalSales) . "\n" .
               "- Total Purchases: ₹" . number_format($totalPurchases) . "\n" .
               "- Total Customers: {$totalCustomers}\n" .
               "- Low Stock Items: {$lowStock}\n" .
               "- Unpaid Invoices: {$unpaidInvoices}\n\n" .
               "Format: numbered list with title and brief explanation.";
    }
}