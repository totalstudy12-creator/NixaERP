// src/services/geminiLive.ts
// Browser-side Gemini Live API transport. The long-lived Gemini API key stays on the server;
// this client receives only a short-lived token from POST /api/gemini/live-token.

export type GeminiLiveCallbacks = {
  onStatus?: (status: 'connecting' | 'connected' | 'listening' | 'speaking' | 'disconnected' | 'error') => void;
  onUserTranscript?: (text: string) => void;
  onAssistantTranscript?: (text: string) => void;
  onError?: (message: string) => void;
};

type LiveTokenResponse = { success?: boolean; token?: string; message?: string };

const LIVE_MODEL = 'gemini-3.8-live';
const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const stride = 0x8000;
  for (let i = 0; i < bytes.length; i += stride) {
    binary += String.fromCharCode(...bytes.subarray(i, i + stride));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function floatToPcm16(input: Float32Array, sourceRate: number, targetRate = 16000): Uint8Array {
  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const pcm = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < Math.max(start + 1, end); j++) sum += input[Math.min(j, input.length - 1)] || 0;
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
  }
  return new Uint8Array(pcm.buffer);
}

export class GeminiLiveSession {
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private outputContext: AudioContext | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private callbacks: GeminiLiveCallbacks;
  private closed = false;
  private ready = false;
  private nextPlayTime = 0;
  private inputTranscript = '';
  private outputTranscript = '';

  constructor(callbacks: GeminiLiveCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async connect(language: 'en-US' | 'hi-IN' = 'en-US'): Promise<void> {
    this.closed = false;
    this.callbacks.onStatus?.('connecting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is not supported in this browser.');
      const tokenResponse = await fetch('/api/gemini/live-token', {
        method: 'POST',
        credentials: 'include',
        headers: this.authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({}),
      });
      const tokenData = (await tokenResponse.json().catch(() => ({}))) as LiveTokenResponse;
      if (!tokenResponse.ok || !tokenData.token) {
        throw new Error(tokenData.message || `Could not create a secure Live session (HTTP ${tokenResponse.status}). Check login, permission, and Settings → AI.`);
      }

      const ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(tokenData.token)}`);
      this.socket = ws;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Timed out connecting to Gemini Live.')), 15000);
        ws.onopen = () => {
          window.clearTimeout(timeout);
          ws.send(JSON.stringify({
            setup: {
              model: `models/${LIVE_MODEL}`,
              generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: language } },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: {
                parts: [{ text: 'You are the practical, concise business operations AI assistant inside NexaERP. Speak naturally. Use only verified information supplied in the conversation; do not claim to change ERP records. Respond in the language the user speaks, especially Hindi or English.' }],
              },
            },
          }));
          resolve();
        };
        ws.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error('Gemini Live WebSocket connection failed. Check network, token endpoint, and model access.'));
        };
        ws.onclose = (event) => {
          window.clearTimeout(timeout);
          if (!this.closed && event.code !== 1000) this.callbacks.onError?.(`Live session closed (${event.code}). Please reconnect.`);
          if (!this.closed) this.callbacks.onStatus?.('disconnected');
        };
      });

      ws.onmessage = (event: MessageEvent<string>) => {
        try { this.handleServerMessage(JSON.parse(event.data)); }
        catch { /* Ignore malformed protocol frames, never crash the UI. */ }
      };

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.audioContext = new AudioContext();
      this.outputContext = new AudioContext();
      await this.audioContext.resume();
      await this.outputContext.resume();
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
      this.processor.onaudioprocess = (event) => {
        if (!this.ready || this.closed || this.socket?.readyState !== WebSocket.OPEN) return;
        const pcm = floatToPcm16(event.inputBuffer.getChannelData(0), this.audioContext?.sampleRate || 44100);
        this.socket.send(JSON.stringify({
          realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: bytesToBase64(pcm) }] },
        }));
      };
      this.source.connect(this.processor);
      // Keep the processor alive without routing microphone audio to speakers.
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      this.processor.connect(silentGain);
      silentGain.connect(this.audioContext.destination);
    } catch (error) {
      this.callbacks.onStatus?.('error');
      await this.disconnect();
      const message = error instanceof Error ? error.message : 'Unable to start Gemini Live.';
      this.callbacks.onError?.(message);
      throw error;
    }
  }

  private authHeaders(base: Record<string, string>): Record<string, string> {
    // Most NexaERP deployments use a same-origin Sanctum cookie. If the frontend uses
    // a bearer token, forward a token found in common persisted auth records as well.
    try {
      const keys = ['token', 'access_token', 'auth_token', 'nexa-auth', 'auth-storage', 'auth'];
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        let token = raw;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const candidate = parsed.token ?? parsed.access_token ?? parsed.authToken;
          if (typeof candidate === 'string') token = candidate;
          else if (parsed.state && typeof parsed.state === 'object') {
            const state = parsed.state as Record<string, unknown>;
            const nested = state.token ?? state.access_token ?? state.authToken;
            if (typeof nested === 'string') token = nested;
          }
        } catch { /* raw token */ }
        if (token && token !== raw || /^[A-Za-z0-9._~-]{20,}$/.test(token)) {
          base.Authorization = `Bearer ${token}`;
          break;
        }
      }
    } catch { /* localStorage may be disabled; cookie auth may still work. */ }
    return base;
  }

  private handleServerMessage(message: any): void {
    if (message.setupComplete) {
      this.ready = true;
      this.callbacks.onStatus?.('listening');
      return;
    }
    const serverContent = message.serverContent;
    if (!serverContent) return;

    if (serverContent.interrupted) {
      this.stopPlayback();
      this.callbacks.onStatus?.('listening');
    }
    const inputText = serverContent.inputTranscription?.text;
    if (typeof inputText === 'string' && inputText) {
      this.inputTranscript += inputText;
      this.callbacks.onUserTranscript?.(this.inputTranscript);
    }
    const outputText = serverContent.outputTranscription?.text;
    if (typeof outputText === 'string' && outputText) {
      this.outputTranscript += outputText;
      this.callbacks.onAssistantTranscript?.(this.outputTranscript);
    }
    const parts = serverContent.modelTurn?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData ?? part.inline_data;
      const data = inline?.data;
      const mime = inline?.mimeType ?? inline?.mime_type ?? '';
      if (typeof data === 'string' && mime.includes('audio/pcm')) this.playPcm(data, mime);
      if (typeof part.text === 'string' && part.text) {
        this.outputTranscript += part.text;
        this.callbacks.onAssistantTranscript?.(this.outputTranscript);
      }
    }
    if (serverContent.turnComplete) {
      this.inputTranscript = '';
      this.outputTranscript = '';
      this.callbacks.onStatus?.('listening');
    } else if (parts.some((p: any) => Boolean(p.inlineData ?? p.inline_data))) {
      this.callbacks.onStatus?.('speaking');
    }
  }

  private playPcm(base64: string, mime: string): void {
    const context = this.outputContext;
    if (!context) return;
    const bytes = base64ToBytes(base64);
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const rateMatch = mime.match(/rate=(\d+)/i);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const buffer = context.createBuffer(1, pcm.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => this.activeSources.delete(source);
    this.activeSources.add(source);
    const startAt = Math.max(context.currentTime + 0.02, this.nextPlayTime);
    source.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
  }

  sendText(text: string): void {
    const clean = text.trim();
    if (!clean || this.socket?.readyState !== WebSocket.OPEN || !this.ready) return;
    this.inputTranscript = '';
    this.outputTranscript = '';
    this.socket.send(JSON.stringify({
      clientContent: { turns: [{ role: 'user', parts: [{ text: clean }] }], turnComplete: true },
    }));
  }

  mute(muted: boolean): void {
    if (this.stream) this.stream.getAudioTracks().forEach((track) => { track.enabled = !muted; });
  }

  private stopPlayback(): void {
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.activeSources.clear();
    this.nextPlayTime = 0;
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    this.ready = false;
    try { this.processor?.disconnect(); } catch { /* ignore */ }
    try { this.source?.disconnect(); } catch { /* ignore */ }
    this.processor = null;
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    await this.audioContext?.close().catch(() => undefined);
    await this.outputContext?.close().catch(() => undefined);
    this.audioContext = null;
    this.outputContext = null;
    this.stopPlayback();
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close(1000, 'User disconnected');
    this.socket = null;
    this.callbacks.onStatus?.('disconnected');
  }
}
