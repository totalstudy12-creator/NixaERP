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
            'history' => 'nullable|array|max:20',
            'history.*.role' => 'required|in:user,assistant',
            'history.*.text' => 'required|string|max:5000',
            'memory' => 'nullable|string|max:1500',
        ]);

        try {
            $message = $request->input('message');

            // Build context based on the latest user message
            $context = $this->buildErpContext($message);
            $prompt = $this->buildPromptWithContext($message, $context, (string) $request->input('memory', ''));
            $response = $this->callGemini($prompt, $request->input('history', []));

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
     * Get the Gemini model name from env.
     */
    private function getModel(): string
    {
        $saved = \App\Models\Setting::where('key', 'ai_gemini_model')->value('value');
        return $saved ?: config('services.gemini.model', env('GEMINI_MODEL', 'gemini-3.8-flash'));
    }

    /**
     * Call Gemini API using the SAME working configuration as HTML.
     */
    private function callGemini(string $prompt, array $history = [])
    {
        $savedKey = \App\Models\Setting::where('key', 'ai_gemini_api_key')->value('value');
        $apiKey = null;
        if ($savedKey) {
            try { $apiKey = Crypt::decryptString($savedKey); } catch (\Throwable $e) {
                Log::warning('Saved Gemini key could not be decrypted.');
            }
        }
        $apiKey = $apiKey ?: config('services.gemini.api_key', env('GEMINI_API_KEY'));

        if (!$apiKey) {
            throw new \Exception('GEMINI_API_KEY not configured');
        }

        $model = $this->getModel();
        $url = "https://generativelanguage.googleapis.com/v1beta/models/" . rawurlencode($model) . ":generateContent";

        // Build contents array with history
        $contents = [];

        // Add history if provided
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

        // Make API call - SAME format as working HTML
        $response = Http::timeout(60)
            ->withHeaders([
                'Content-Type' => 'application/json',
                'x-goog-api-key' => $apiKey,
            ])
            ->post($url, [
                'contents' => $contents,
                'generationConfig' => ['temperature' => 0.35, 'maxOutputTokens' => 1200],
            ]);

        // Check for errors
        if ($response->failed()) {
            $errorData = $response->json();
            $errorMessage = $errorData['error']['message'] ?? 'API request failed';
            $googleStatus = $errorData['error']['status'] ?? '';
            Log::error('Gemini API Failed', ['http_status' => $response->status(), 'provider_status' => $googleStatus, 'message' => $errorMessage]);
            throw new \Exception($errorMessage . ' [' . $response->status() . ' ' . $googleStatus . ']');
        }

        $data = $response->json();

        // Check if API returned an error object
        if (isset($data['error'])) {
            Log::error('Gemini API Error: ' . json_encode($data['error']));
            throw new \Exception($data['error']['message'] ?? 'Unknown API error');
        }

        // Extract response text
        if (isset($data['candidates'][0]['content']['parts'][0]['text'])) {
            return trim($data['candidates'][0]['content']['parts'][0]['text']);
        }

        throw new \Exception('Received empty response from Gemini');
    }

    /**
     * Build a context string with real ERP data based on the user's question.
     */
    private function buildErpContext(string $query): string
    {
        $q = strtolower($query);

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
            $includeSales = $includePurchases = $includeCustomers = $includeInventory = $includeProfit = true;
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
     * Combine user question with ERP context.
     */
    private function buildPromptWithContext(string $question, string $context, string $memory = ''): string
    {
        $memoryBlock = trim($memory) !== '' ? "\n\nUser-approved working preferences and business context (treat as guidance, not verified ERP facts):\n" . trim($memory) : '';
        return "You are the owner's practical business operations AI agent for NixaERP. Use real ERP context below, distinguish verified values from estimates, never invent records, and never claim to change data. Give a direct concise answer with useful next steps. If the owner has saved working preferences, follow them when relevant. End with 2 or 3 useful, specific follow-up questions based on this request and available data, each on a separate line beginning exactly FOLLOW_UP: .\n\n{$context}{$memoryBlock}\n\nOwner's question: {$question}";
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