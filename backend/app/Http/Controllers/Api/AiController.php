<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AiConversation;
use App\Models\AiMessage;
use App\Services\AiManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

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

        // Gather small, safe pieces of ERP data using existing controllers/services
        try {
            $salesSummary = app()->call('\App\Http\Controllers\Api\SalesController@summary');
        } catch (\Throwable $e) {
            Log::warning('AI insights: failed to fetch sales summary: '.$e->getMessage());
            $salesSummary = null;
        }

        // Low stock: use product model
        try {
            $lowStock = \App\Models\Product::whereRaw('stock_quantity <= minimum_stock')->limit(10)->get(['id','name','stock_quantity']);
        } catch (\Throwable $e) {
            Log::warning('AI insights: failed to fetch low stock: '.$e->getMessage());
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

    public function chat(Request $request)
    {
        $this->validate($request, ['message' => 'required|string']);
        $user = Auth::user();

        $message = $request->input('message');

        // Persist conversation / message
        $conversation = AiConversation::firstOrCreate([
            'user_id' => $user->id,
            'title' => 'Conversation',
        ], [ 'metadata' => null ]);

        $aiMessage = AiMessage::create([
            'conversation_id' => $conversation->id,
            'user_id' => $user->id,
            'role' => 'user',
            'content' => $message,
        ]);

        // Build context using AiContextService - only necessary limited facts
        $context = [];
        $context['sales_summary'] = $this->contextService->getSalesSummary();
        $context['low_stock'] = $this->contextService->getLowStockProducts(10);
        $context['top_products'] = $this->contextService->getTopProducts(5);
        $context['top_customers'] = $this->contextService->getTopCustomers(5);

        // Select provider - allow overriding via request.provider_id
        $providerId = $request->input('provider_id');
        if ($providerId) {
            $providerModel = \App\Models\AiProvider::find($providerId);
        } else {
            $providerModel = $this->aiManager->getPrimaryProvider();
        }

        if (!$providerModel) {
            return response()->json(['success' => false, 'message' => 'No AI provider configured. Please configure an AI provider.'], 503);
        }

        try {
            $provider = $this->aiManager->makeProviderInstance($providerModel);
            $messages = [
                ['role' => 'system', 'content' => 'You are an ERP assistant. Use only provided ERP data when answering business queries. Do not invent values.'],
                ['role' => 'user', 'content' => $message],
            ];
            $result = $provider->chat($messages, ['context' => $context]);

            $reply = $result['reply'] ?? '';
            $assistantMsg = AiMessage::create([
                'conversation_id' => $conversation->id,
                'role' => 'assistant',
                'content' => $reply,
            ]);

            return response()->json(['success' => true, 'reply' => $reply, 'data' => ['conversation_id' => $conversation->id, 'message_id' => $assistantMsg->id]]);
        } catch (\Throwable $e) {
            Log::error('AI chat failed: '.$e->getMessage());
            return response()->json(['success' => false, 'message' => 'AI provider error: '.$e->getMessage()], 500);
        }
    }
}
