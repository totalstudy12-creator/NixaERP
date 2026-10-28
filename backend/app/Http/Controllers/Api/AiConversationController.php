<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\GeminiProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class AiConversationController extends Controller
{
    protected $gemini;

    public function __construct(GeminiProvider $gemini)
    {
        $this->gemini = $gemini;
    }

    /**
     * POST /api/voice-converse
     * Returns text response and base64 WAV audio.
     */
    public function voiceConverse(Request $request)
    {
        $payload = $request->only([
            'message',
            'audioBase64',
            'audioMime',
            'voice',
            'persona',
            'chatHistory',
        ]);
        $payload = array_merge([
            'voice' => 'Zephyr',
            'persona' => 'executive',
            'chatHistory' => [],
        ], $payload);

        try {
            $result = $this->gemini->generateVoiceResponse($payload);
            return response()->json($result);
        } catch (\Exception $e) {
            Log::error('voiceConverse error', ['msg' => $e->getMessage()]);
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/transcribe
     */
    public function transcribe(Request $request)
    {
        $validated = $request->validate([
            'audioBase64' => 'required|string',
            'mimeType' => 'sometimes|string',
        ]);
        $mime = $validated['mimeType'] ?? 'audio/webm';
        try {
            $transcript = $this->gemini->transcribeAudio($validated['audioBase64'], $mime);
            return response()->json(['transcript' => $transcript]);
        } catch (\Exception $e) {
            Log::error('transcribe error', ['msg' => $e->getMessage()]);
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
?>