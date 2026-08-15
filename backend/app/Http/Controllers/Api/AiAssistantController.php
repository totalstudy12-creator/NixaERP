<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AiAssistantController extends Controller
{
    /**
     * ERP AI Insights
     */
    public function insights(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'summary' => [
                'sales_growth'     => '8.4%',
                'inventory_health' => '92%',
                'payroll_accuracy' => '99.1%',
                'cash_position'    => 'Healthy',
            ],

            'recommendations' => [
                'Increase reorder for high-velocity SKUs.',
                'Send payment reminders for 7 overdue invoices.',
                'Approve pending payroll adjustments before cutoff.',
            ],
        ]);
    }

    /**
     * ERP Automation Workflows
     */
    public function workflows(): JsonResponse
    {
        return response()->json([
            'success' => true,

            'automation' => [
                'journal_posting'  => 'Enabled',
                'gst_calculation'  => 'Enabled',
                'payment_matching' => 'Enabled',
            ],
        ]);
    }

    /**
     * AI Chat
     */
    public function chat(Request $request): JsonResponse
    {
        /*
        |--------------------------------------------------------------------------
        | Validate request
        |--------------------------------------------------------------------------
        */

        $validated = $request->validate([
            'message' => [
                'required',
                'string',
                'max:5000',
            ],
        ]);

        $message = trim($validated['message']);

        /*
        |--------------------------------------------------------------------------
        | Gemini configuration
        |--------------------------------------------------------------------------
        */

        $apiKey = env('GEMINI_API_KEY');

        $model = env(
            'GEMINI_MODEL',
            'gemini-2.5-flash'
        );

        /*
        |--------------------------------------------------------------------------
        | Check API key
        |--------------------------------------------------------------------------
        */

        if (empty($apiKey)) {

            Log::error('Gemini API key is missing.');

            return response()->json([
                'success' => false,
                'reply' => 'AI service is not configured. Please configure GEMINI_API_KEY.',
                'mode' => 'error',
            ], 500);
        }

        /*
        |--------------------------------------------------------------------------
        | Gemini API URL
        |--------------------------------------------------------------------------
        */

        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent";

        /*
        |--------------------------------------------------------------------------
        | ERP System Instruction
        |--------------------------------------------------------------------------
        */

        $systemInstruction = <<<'PROMPT'
You are an expert ERP business assistant.

You assist users with:

- Sales
- Purchase
- Sales invoices
- Purchase invoices
- Customers
- Suppliers
- Products
- Inventory
- Stock
- GST
- Accounting
- Payments
- Receivables
- Payables
- Expenses
- Payroll
- HR
- Business reports
- Business insights

Rules:

1. Give concise and practical answers.
2. Use simple professional language.
3. When explaining ERP operations, give clear steps.
4. Do not invent database records, transactions, invoices, employees, customers or financial figures.
5. If required information is unavailable, clearly say that the information is not available.
6. For calculations, show the calculation when useful.
7. For GST questions, explain the calculation clearly.
8. For inventory questions, explain stock impact clearly.
9. For accounting questions, explain debit and credit when relevant.
10. Do not claim that you actually changed ERP data unless the application provides a real action/API for doing so.
11. If the user asks for a report, summarize it in a clean business format.
12. Keep normal answers short unless the user asks for details.

You are an ERP assistant, not a general conversational chatbot.
PROMPT;

        /*
        |--------------------------------------------------------------------------
        | User prompt
        |--------------------------------------------------------------------------
        */

        $prompt = $systemInstruction
            . "\n\nUser's ERP question:\n"
            . $message;

        /*
        |--------------------------------------------------------------------------
        | Gemini request payload
        |--------------------------------------------------------------------------
        */

        $payload = [
            'contents' => [
                [
                    'role' => 'user',

                    'parts' => [
                        [
                            'text' => $prompt,
                        ],
                    ],
                ],
            ],

            'generationConfig' => [
                'temperature' => 0.3,
                'maxOutputTokens' => 1000,
            ],
        ];

        /*
        |--------------------------------------------------------------------------
        | Call Gemini
        |--------------------------------------------------------------------------
        */

        try {

            $response = Http::timeout(30)
                ->connectTimeout(10)
                ->withHeaders([
                    'x-goog-api-key' => $apiKey,
                    'Content-Type' => 'application/json',
                ])
                ->post($url, $payload);

        } catch (\Throwable $e) {

            Log::error('Gemini connection exception', [
                'message' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'reply' => 'Unable to connect to the AI service. Please try again later.',
                'mode' => 'error',
            ], 503);
        }

        /*
        |--------------------------------------------------------------------------
        | Gemini API error
        |--------------------------------------------------------------------------
        */

        if (!$response->successful()) {

            $errorData = $response->json();

            Log::error('Gemini API request failed', [
                'status' => $response->status(),
                'model' => $model,
                'response' => $errorData ?: $response->body(),
            ]);

            $googleMessage =
                data_get($errorData, 'error.message')
                ?? 'Unknown Gemini API error.';

            /*
            |--------------------------------------------------------------------------
            | User-friendly messages
            |--------------------------------------------------------------------------
            */

            $userMessage = match ($response->status()) {

                400 =>
                    'The AI request was invalid. Please try a different question.',

                401, 403 =>
                    'The AI API key is invalid or does not have permission.',

                404 =>
                    "The configured Gemini model '{$model}' was not found.",

                429 =>
                    'The AI service rate limit or quota has been reached. Please try again later.',

                500, 502, 503 =>
                    'The AI service is temporarily unavailable. Please try again later.',

                default =>
                    'The AI service returned an error. Please try again later.',
            };

            return response()->json([
                'success' => false,
                'reply' => $userMessage,
                'mode' => 'error',

                /*
                |--------------------------------------------------------------------------
                | Debug information
                |--------------------------------------------------------------------------
                |
                | Useful during development.
                |
                */

                'error' => [
                    'status' => $response->status(),
                    'message' => $googleMessage,
                ],
            ], 502);
        }

        /*
        |--------------------------------------------------------------------------
        | Decode Gemini response
        |--------------------------------------------------------------------------
        */

        $data = $response->json();

        /*
        |--------------------------------------------------------------------------
        | Get generated text
        |--------------------------------------------------------------------------
        */

        $reply = data_get(
            $data,
            'candidates.0.content.parts.0.text'
        );

        /*
        |--------------------------------------------------------------------------
        | Empty response
        |--------------------------------------------------------------------------
        */

        if (empty($reply)) {

            Log::warning('Gemini returned an empty response', [
                'response' => $data,
            ]);

            return response()->json([
                'success' => false,
                'reply' => 'The AI returned an empty response. Please try again.',
                'mode' => 'error',
            ], 502);
        }

        /*
        |--------------------------------------------------------------------------
        | Successful response
        |--------------------------------------------------------------------------
        */

        return response()->json([
            'success' => true,
            'reply' => trim($reply),
            'mode' => 'assistant',

            'meta' => [
                'model' => $model,
            ],
        ]);
    }
}