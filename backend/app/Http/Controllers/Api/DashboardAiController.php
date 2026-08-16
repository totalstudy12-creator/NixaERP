<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use App\Services\AiManager;

class DashboardAiController extends Controller
{
    protected AiManager $aiManager;
    protected $contextService;

    public function __construct(AiManager $aiManager)
    {
        $this->aiManager = $aiManager;
        $this->contextService = new \App\Services\AiContextService();
    }

    protected function makeSystemInstruction()
    {
        return "YOU ARE THE ERP CEO AI ASSISTANT.\n\nYou are an AI business analyst for this ERP. You answer questions using only the ERP data and tools provided by the application. Never invent sales, customers, products, employees, inventory, finance values, or business events. If the required data is unavailable, clearly state that it is unavailable. Be concise and business-focused. When recommending an action, explain the actual ERP evidence supporting the recommendation. For financial/business numbers, preserve the values supplied by the backend. You can answer in the user's language when appropriate. You are allowed to analyze ERP data but must not claim to have performed an action unless the backend actually executed that action.";
    }

    protected function callProvider(array $messages, array $options = [])
    {
        $providerModel = $this->aiManager->getPrimaryProvider();
        if (!$providerModel) {
            return [ 'error' => 'No AI provider configured' ];
        }

        try {
            $provider = $this->aiManager->makeProviderInstance($providerModel);
            $resp = $provider->chat($messages, $options);
            return $resp;
        } catch (\Throwable $e) {
            Log::error('Dashboard AI provider call failed: '.$e->getMessage());
            return [ 'error' => 'AI provider error: '.$e->getMessage() ];
        }
    }

    public function ask(Request $request)
    {
        $request->validate(['message' => 'required|string']);
        $message = $request->input('message');

        $context = [
            'sales_summary' => $this->contextService->getSalesSummary(),
            'low_stock' => $this->contextService->getLowStockProducts(10),
            'top_products' => $this->contextService->getTopProducts(10),
            'top_customers' => $this->contextService->getTopCustomers(10),
        ];

        $messages = [
            ['role' => 'system', 'content' => $this->makeSystemInstruction()],
            ['role' => 'user', 'content' => "Context: " . json_encode($context)],
            ['role' => 'user', 'content' => $message],
        ];

        $result = $this->callProvider($messages, ['task' => 'general']);

        if (isset($result['error'])) {
            return response()->json(['success' => false, 'message' => $result['error']], 503);
        }

        $reply = $result['reply'] ?? null;
        if (!$reply) return response()->json(['success' => false, 'message' => 'Empty AI reply'], 502);

        // Try to parse JSON response first
        $decoded = json_decode($reply, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return response()->json(['success' => true, 'data' => $decoded]);
        }

        // If not JSON, return text response but mark as text-only
        return response()->json(['success' => true, 'data' => ['text' => $reply]]);
    }

    public function businessHealth(Request $request)
    {
        // Gather computed dashboard health data
        try {
            $summary = app()->call('\App\Http\Controllers\Api\DashboardController@businessHealth');
        } catch (\Throwable $e) {
            Log::warning('Failed to collect business health: '.$e->getMessage());
            $summary = null;
        }

        $context = ['dashboard' => $summary, 'sales_summary' => $this->contextService->getSalesSummary()];

        $messages = [
            ['role' => 'system', 'content' => $this->makeSystemInstruction()],
            ['role' => 'user', 'content' => 'Analyze the following dashboard health data and return structured JSON with overall and breakdown (label, score, reason): ' . json_encode($context)],
        ];

        $result = $this->callProvider($messages, ['task' => 'business_health']);
        if (isset($result['error'])) return response()->json(['success' => false, 'message' => $result['error']], 503);

        $reply = $result['reply'] ?? null;
        if (!$reply) return response()->json(['success' => false, 'message' => 'Empty AI reply'], 502);

        $decoded = json_decode($reply, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return response()->json(['success' => true, 'data' => $decoded]);
        }

        return response()->json(['success' => false, 'message' => 'AI returned non-JSON response'], 502);
    }

    public function forecast(Request $request)
    {
        // Prepare compact historical series
        try {
            $sales = \App\Models\Invoice::selectRaw('date(created_at) as day, COALESCE(SUM(total_amount),0) as total')->groupByRaw('date(created_at)')->orderBy('day')->limit(120)->get()->toArray();
            $purchases = \App\Models\PurchaseInvoice::selectRaw('date(created_at) as day, COALESCE(SUM(grand_total),0) as total')->groupByRaw('date(created_at)')->orderBy('day')->limit(120)->get()->toArray();
        } catch (\Throwable $e) {
            Log::warning('Forecast context gather failed: '.$e->getMessage());
            return response()->json(['success' => false, 'message' => 'Insufficient data for forecast'], 422);
        }

        $context = ['salesHistory' => $sales, 'purchaseHistory' => $purchases];

        $messages = [
            ['role' => 'system', 'content' => $this->makeSystemInstruction()],
            ['role' => 'user', 'content' => 'Given the following historical series produce a forecast summary for today, 7, 30, and 90 days or return {"insufficient_data": true} if data is insufficient. Context: ' . json_encode($context)],
        ];

        $result = $this->callProvider($messages, ['task' => 'forecast']);
        if (isset($result['error'])) return response()->json(['success' => false, 'message' => $result['error']], 503);
        $reply = $result['reply'] ?? null;
        if (!$reply) return response()->json(['success' => false, 'message' => 'Empty AI reply'], 502);
        $decoded = json_decode($reply, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) return response()->json(['success' => true, 'data' => $decoded]);
        return response()->json(['success' => false, 'message' => 'AI returned non-JSON response'], 502);
    }

    // Risks, anomalies, rankings, recommendations can follow similar pattern — generic endpoint for now
    public function genericAnalysis(Request $request)
    {
        $type = $request->query('type', 'analysis');
        $context = ['sales_summary' => $this->contextService->getSalesSummary(), 'low_stock' => $this->contextService->getLowStockProducts(20)];
        $messages = [
            ['role' => 'system', 'content' => $this->makeSystemInstruction()],
            ['role' => 'user', 'content' => "Perform {$type} using only the provided ERP data and return structured JSON." . json_encode($context)],
        ];
        $result = $this->callProvider($messages, ['task' => $type]);
        if (isset($result['error'])) return response()->json(['success' => false, 'message' => $result['error']], 503);
        $reply = $result['reply'] ?? null;
        if (!$reply) return response()->json(['success' => false, 'message' => 'Empty AI reply'], 502);
        $decoded = json_decode($reply, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) return response()->json(['success' => true, 'data' => $decoded]);
        return response()->json(['success' => false, 'message' => 'AI returned non-JSON response'], 502);
    }
}
