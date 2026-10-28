/**
 * RaptorERP - Gemini Live WebSocket Gateway Server
 * Real-time bidirectional voice & text streaming using Gemini Live API (models/gemini-3.8-live)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read GEMINI_API_KEY from .env
function getApiKey() {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('GEMINI_API_KEY=')) {
        return trimmed.substring('GEMINI_API_KEY='.length).replace(/["']/g, '').trim();
      }
    }
  }
  return process.env.GEMINI_API_KEY || null;
}

const PORT = parseInt(process.env.GEMINI_LIVE_PORT || '8008', 10);
const GEMINI_LIVE_MODEL = 'models/gemini-3.8-live';

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/') {
    const apiKey = getApiKey();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'Gemini Live Gateway',
      model: GEMINI_LIVE_MODEL,
      api_key_configured: Boolean(apiKey),
      port: PORT,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (clientWs, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[GeminiLiveGateway] New client connection from ${clientIp}`);

  const apiKey = getApiKey();
  if (!apiKey) {
    clientWs.send(JSON.stringify({
      type: 'error',
      message: 'GEMINI_API_KEY is not configured on the server. Please check Settings → AI.'
    }));
    clientWs.close(1008, 'API Key Missing');
    return;
  }

  let googleWs = null;
  let isGoogleReady = false;
  let clientVoice = 'Aoede';
  let clientSystemPrompt = 'You are the intelligent business operations voice agent for NixaERP. Answer directly, concisely and helpfully in natural conversational speech.';

  function connectToGoogle(voiceName, customPrompt) {
    if (googleWs) {
      try { googleWs.close(); } catch (e) {}
    }

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    googleWs = new WebSocket(wsUrl);

    googleWs.on('open', () => {
      console.log(`[GeminiLiveGateway] Connected to Google Gemini Live (${GEMINI_LIVE_MODEL})`);
      const setupMessage = {
        setup: {
          model: GEMINI_LIVE_MODEL,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceName || clientVoice
                }
              }
            }
          },
          systemInstruction: {
            parts: [{ text: customPrompt || clientSystemPrompt }]
          }
        }
      };
      googleWs.send(JSON.stringify(setupMessage));
    });

    googleWs.on('message', (data) => {
      try {
        const text = data.toString('utf8');
        const json = JSON.parse(text);

        if (json.setupComplete) {
          isGoogleReady = true;
          console.log('[GeminiLiveGateway] Setup complete acknowledged by Gemini Live');
          clientWs.send(JSON.stringify({
            type: 'ready',
            model: GEMINI_LIVE_MODEL,
            voice: voiceName || clientVoice
          }));
          return;
        }

        if (json.serverContent) {
          const sc = json.serverContent;

          // Audio parts
          if (sc.modelTurn?.parts) {
            for (const part of sc.modelTurn.parts) {
              if (part.inlineData && part.inlineData.data) {
                clientWs.send(JSON.stringify({
                  type: 'audio',
                  mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                  data: part.inlineData.data
                }));
              }
              if (part.text) {
                clientWs.send(JSON.stringify({
                  type: 'transcript',
                  role: 'assistant',
                  text: part.text
                }));
              }
            }
          }

          // User input transcription if available
          if (sc.inputTranscription?.text) {
            clientWs.send(JSON.stringify({
              type: 'transcript',
              role: 'user',
              text: sc.inputTranscription.text
            }));
          }

          // Interruption signal from server
          if (sc.interrupted) {
            console.log('[GeminiLiveGateway] Server detected user interruption');
            clientWs.send(JSON.stringify({ type: 'interrupted' }));
          }

          // Turn complete
          if (sc.turnComplete) {
            clientWs.send(JSON.stringify({ type: 'turn_complete' }));
          }
        }
      } catch (err) {
        console.error('[GeminiLiveGateway] Error processing Google message:', err);
      }
    });

    googleWs.on('error', (err) => {
      console.error('[GeminiLiveGateway] Google WS Error:', err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'error',
          message: `Gemini Live error: ${err.message}`
        }));
      }
    });

    googleWs.on('close', (code, reason) => {
      console.log(`[GeminiLiveGateway] Google WS closed: code ${code}, reason: ${reason}`);
      isGoogleReady = false;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'status',
          connected: false,
          code,
          reason: reason ? reason.toString() : 'Session closed'
        }));
      }
    });
  }

  clientWs.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString('utf8'));

      // Setup / Config
      if (msg.type === 'init' || msg.type === 'setup') {
        clientVoice = msg.voice || 'Aoede';
        if (msg.systemPrompt) {
          clientSystemPrompt = msg.systemPrompt;
        }
        connectToGoogle(clientVoice, clientSystemPrompt);
        return;
      }

      // Stream user PCM audio chunk
      if (msg.type === 'audio' && msg.data) {
        if (googleWs && googleWs.readyState === WebSocket.OPEN && isGoogleReady) {
          const payload = {
            realtimeInput: {
              mediaChunks: [
                {
                  mimeType: msg.mimeType || 'audio/pcm;rate=16000',
                  data: msg.data
                }
              ]
            }
          };
          googleWs.send(JSON.stringify(payload));
        }
        return;
      }

      // Send text message
      if (msg.type === 'text' && msg.text) {
        if (googleWs && googleWs.readyState === WebSocket.OPEN && isGoogleReady) {
          const payload = {
            clientContent: {
              turns: [
                {
                  role: 'user',
                  parts: [{ text: msg.text }]
                }
              ],
              turnComplete: true
            }
          };
          googleWs.send(JSON.stringify(payload));
        }
        return;
      }

      // Client interruption signal (user pressed interrupt or started speaking)
      if (msg.type === 'interrupt') {
        if (googleWs && googleWs.readyState === WebSocket.OPEN) {
          // Send an empty turn to stop current playback if needed
          googleWs.send(JSON.stringify({
            clientContent: {
              turns: [],
              turnComplete: true
            }
          }));
        }
        return;
      }

      // Ping
      if (msg.type === 'ping') {
        clientWs.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        return;
      }
    } catch (err) {
      console.error('[GeminiLiveGateway] Error handling client message:', err);
    }
  });

  clientWs.on('close', () => {
    console.log('[GeminiLiveGateway] Client disconnected');
    if (googleWs) {
      try { googleWs.close(); } catch (e) {}
    }
  });

  clientWs.on('error', (err) => {
    console.error('[GeminiLiveGateway] Client WS error:', err);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`[GeminiLiveGateway] Running on ws://127.0.0.1:${PORT}`);
  console.log(`[GeminiLiveGateway] Target Model: ${GEMINI_LIVE_MODEL}`);
  console.log(`[GeminiLiveGateway] Health Check: http://127.0.0.1:${PORT}/health`);
  console.log(`=======================================================`);
});
