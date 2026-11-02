/**
 * AIAssistantPage.tsx — Real-time Gemini Live (WebSocket)
 *
 * Architecture:
 *   Mic → AudioWorklet(16k PCM16) → WS  ──► Gemini Live API
 *   Gemini ──► WS(24k PCM16 audio + transcripts) → AudioWorklet(gapless) → Speaker
 *
 * Latency: ~300–800 ms end-to-end. Server handles VAD + barge-in natively.
 * No SpeechRecognition, no per-turn REST, no client-side TTS.
 */
import React, {
  useState, useEffect, useRef, useCallback, type ReactNode,
} from 'react';
import {
  Mic, MicOff, Volume2, VolumeX, PhoneCall, PhoneOff, Radio, Settings,
  Clock, Sparkles, X, CheckCircle2, Headphones, Zap, Globe, Activity,
  Sliders, History, Trash2, RefreshCw, Square, AlertCircle, ShieldCheck,
  Wifi,
} from 'lucide-react';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';

/* =========================================================================
   TYPES
   ========================================================================= */

export type GeminiVoice = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
export type LanguageMode = 'hinglish' | 'hindi' | 'english';

export type CallState =
  | 'idle' | 'connecting' | 'listening' | 'user_speaking'
  | 'thinking' | 'gemini_speaking' | 'interrupted'
  | 'reconnecting' | 'muted' | 'error';

export interface DialogueTurn {
  id: string;
  speaker: 'user' | 'gemini';
  text: string;
  timestamp: string;
}

export interface CallSessionRecord {
  id: string;
  startedAt: string;
  durationSeconds: number;
  voice: GeminiVoice;
  language: LanguageMode;
  turns: DialogueTurn[];
}

interface LiveTokenResponse {
  token: string;
  model?: string;
  expiresAt?: number;
}

/* =========================================================================
   CONSTANTS
   ========================================================================= */

const VOICE_OPTIONS: Array<{ id: GeminiVoice; name: string; desc: string; tag: string }> = [
  { id: 'Zephyr', name: 'Zephyr', desc: 'Natural, crisp executive tone', tag: 'Recommended' },
  { id: 'Kore',   name: 'Kore (Aanya)', desc: 'Warm, expressive Indian female tone', tag: 'Lively' },
  { id: 'Puck',   name: 'Puck', desc: 'Dynamic, bright, enthusiastic cadence', tag: 'Energetic' },
  { id: 'Charon', name: 'Charon', desc: 'Deep, calm, authoritative advisory voice', tag: 'Calm' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'Direct, focused, low-pitch voice', tag: 'Focused' },
];

const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

/** Ephemeral-token WS endpoint (v1alpha). API-key WS uses v1beta + ?key=. */
const WS_ENDPOINT_EPHEMERAL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

const INPUT_SAMPLE_RATE = 16000;   // Gemini requires 16 kHz PCM16 input
const OUTPUT_SAMPLE_RATE = 24000;  // Gemini streams 24 kHz PCM16 output
const STORAGE_KEYS = {
  echoIsolation: 'gemini_live_echo_isolation',
  sessions: 'gemini_live_sessions',
} as const;

const LANG_CODE: Record<LanguageMode, string> = {
  hinglish: 'hi-IN',
  hindi: 'hi-IN',
  english: 'en-US',
};

const SYSTEM_INSTRUCTION: Record<LanguageMode, string> = {
  hinglish:
    'You are a warm, helpful voice assistant. Reply naturally in Hinglish (Hindi + English mix). ' +
    'Keep replies short, conversational, and spoken-friendly. Never use markdown or bullet points.',
  hindi:
    'आप एक सहायक और मिलनसार वॉइस असिस्टेंट हैं। स्वाभाविक हिंदी में छोटे, बोलचाल के जवाब दें। ' +
    'कोई मार्कडाउन या बुलेट पॉइंट्स न दें।',
  english:
    'You are a warm, helpful voice assistant. Reply in short, natural, spoken-friendly English. ' +
    'Never use markdown, bullets, or emojis.',
};

/* =========================================================================
   API RESPONSE NORMALISER
   -----------------------------------------------------------------------
   apiClient.post<T>() in this project returns the payload directly (T),
   but some endpoints wrap it as { data: T }. This helper accepts either
   shape so we don't hard-code a fragile contract assumption.
   ========================================================================= */

function unwrapApi<T>(res: T | { data?: T } | null | undefined): T | null {
  if (res == null) return null;
  const maybeWrapped = res as { data?: T };
  if (maybeWrapped && typeof maybeWrapped === 'object' && 'data' in maybeWrapped) {
    return maybeWrapped.data ?? null;
  }
  return res as T;
}

/* =========================================================================
   AUDIO WORKLETS (inlined → Blob URL, no extra files needed)
   ========================================================================= */

/** Captures mic Float32 @ device rate, downsamples → Int16 PCM16 @ 16 kHz. */
const CAPTURE_WORKLET_SRC = `
class PCM16Capture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    this.targetRate = opts.targetRate || 16000;
    this.ratio = sampleRate / this.targetRate;
    this.buf = [];
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'flush') { this.buf.length = 0; }
      else if (e.data === 'stop') { this.stopped = true; }
    };
  }
  process(inputs) {
    if (this.stopped) return true;
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) this.buf.push(ch[i]);
    const outLen = Math.floor((this.buf.length - 1) / this.ratio);
    if (outLen <= 0) return true;
    const out = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * this.ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const a = this.buf[idx];
      const b = this.buf[idx + 1] !== undefined ? this.buf[idx + 1] : a;
      let s = a * (1 - frac) + b * frac;
      if (s > 1) s = 1; else if (s < -1) s = -1;
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.buf.splice(0, Math.floor(outLen * this.ratio));
    this.port.postMessage(out.buffer, [out.buffer]);
    return true;
  }
}
registerProcessor('pcm16-capture', PCM16Capture);
`;

/** Gapless PCM16 player @ 24 kHz — queue-based, flushes on barge-in. */
const PLAYBACK_WORKLET_SRC = `
class PCM16Playback extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.cur = null;
    this.off = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'audio') this.queue.push(new Int16Array(d.samples));
      else if (d.type === 'flush') { this.queue.length = 0; this.cur = null; this.off = 0; }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    for (let i = 0; i < out.length; i++) {
      if (!this.cur || this.off >= this.cur.length) {
        this.cur = this.queue.length ? this.queue.shift() : null;
        this.off = 0;
      }
      out[i] = this.cur ? this.cur[this.off++] / 0x8000 : 0;
    }
    return true;
  }
}
registerProcessor('pcm16-playback', PCM16Playback);
`;

function workletBlobUrl(source: string): string {
  return URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
}

/* =========================================================================
   BASE64 HELPERS (chunk-safe, avoids call-stack blowups on large buffers)
   ========================================================================= */

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/* =========================================================================
   AUDIO ENGINE — mic capture + gapless playback
   ========================================================================= */

class AudioEngine {
  private inCtx: AudioContext | null = null;
  private outCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private captureNode: AudioWorkletNode | null = null;
  private playbackNode: AudioWorkletNode | null = null;
  private inAnalyser: AnalyserNode | null = null;
  private outAnalyser: AnalyserNode | null = null;
  private inUrl = '';
  private outUrl = '';
  private micMuted = false;

  onChunk: ((b64: string) => void) | null = null;

  async start(): Promise<void> {
    // Playback context must be 24 kHz so the worklet writes native Gemini samples
    this.outCtx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE, latencyHint: 'interactive' });
    if (this.outCtx.sampleRate !== OUTPUT_SAMPLE_RATE) {
      console.warn(`[AudioEngine] Output ctx is ${this.outCtx.sampleRate} Hz (wanted ${OUTPUT_SAMPLE_RATE})`);
    }
    this.outUrl = workletBlobUrl(PLAYBACK_WORKLET_SRC);
    await this.outCtx.audioWorklet.addModule(this.outUrl);
    this.playbackNode = new AudioWorkletNode(this.outCtx, 'pcm16-playback');
    this.outAnalyser = this.outCtx.createAnalyser();
    this.outAnalyser.fftSize = 64;
    this.outAnalyser.smoothingTimeConstant = 0.75;
    this.playbackNode.connect(this.outAnalyser);
    this.outAnalyser.connect(this.outCtx.destination);
    if (this.outCtx.state === 'suspended') await this.outCtx.resume();

    // Capture context at device rate, resampled by worklet → 16 kHz
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.inCtx = new AudioContext({ latencyHint: 'interactive' });
    this.inUrl = workletBlobUrl(CAPTURE_WORKLET_SRC);
    await this.inCtx.audioWorklet.addModule(this.inUrl);

    const src = this.inCtx.createMediaStreamSource(this.stream);
    this.inAnalyser = this.inCtx.createAnalyser();
    this.inAnalyser.fftSize = 64;
    this.inAnalyser.smoothingTimeConstant = 0.75;
    src.connect(this.inAnalyser);

    this.captureNode = new AudioWorkletNode(this.inCtx, 'pcm16-capture', {
      processorOptions: { targetRate: INPUT_SAMPLE_RATE },
    });
    this.captureNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (this.micMuted || !this.onChunk) return;
      this.onChunk(arrayBufferToBase64(e.data));
    };
    src.connect(this.captureNode);
    // Worklet must be pulled by a sink; a zero-gain node keeps the graph alive silently
    const silent = this.inCtx.createGain();
    silent.gain.value = 0;
    this.captureNode.connect(silent).connect(this.inCtx.destination);
  }

  setMicMuted(muted: boolean): void {
    this.micMuted = muted;
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }

  setSpeakerMuted(muted: boolean): void {
    if (!this.playbackNode) return;
    this.playbackNode.port.postMessage(
      muted ? { type: 'flush' } : { type: 'audio', samples: new ArrayBuffer(0) },
    );
  }

  /** Feed a chunk of 24 kHz PCM16 to the gapless player. */
  enqueue(base64Pcm: string): void {
    if (!this.playbackNode || !base64Pcm) return;
    const buf = base64ToArrayBuffer(base64Pcm);
    if (buf.byteLength < 2) return;
    this.playbackNode.port.postMessage({ type: 'audio', samples: buf }, [buf]);
  }

  /** Barge-in: drop everything queued but keep the context alive. */
  flushPlayback(): void {
    this.playbackNode?.port.postMessage({ type: 'flush' });
  }

  getMicAnalyser(): AnalyserNode | null { return this.inAnalyser; }
  getSpeakerAnalyser(): AnalyserNode | null { return this.outAnalyser; }

  async resume(): Promise<void> {
    if (this.outCtx?.state === 'suspended') await this.outCtx.resume().catch(() => {});
    if (this.inCtx?.state === 'suspended') await this.inCtx.resume().catch(() => {});
  }

  async stop(): Promise<void> {
    this.captureNode?.port.postMessage('stop');
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try { this.captureNode?.disconnect(); } catch { /* noop */ }
    try { this.playbackNode?.disconnect(); } catch { /* noop */ }
    try { this.inAnalyser?.disconnect(); } catch { /* noop */ }
    try { this.outAnalyser?.disconnect(); } catch { /* noop */ }
    this.captureNode = null;
    this.playbackNode = null;
    this.inAnalyser = null;
    this.outAnalyser = null;
    if (this.inCtx && this.inCtx.state !== 'closed') await this.inCtx.close().catch(() => {});
    if (this.outCtx && this.outCtx.state !== 'closed') await this.outCtx.close().catch(() => {});
    this.inCtx = null;
    this.outCtx = null;
    if (this.inUrl) URL.revokeObjectURL(this.inUrl);
    if (this.outUrl) URL.revokeObjectURL(this.outUrl);
    this.inUrl = '';
    this.outUrl = '';
  }
}

/* =========================================================================
   GEMINI LIVE CLIENT — WebSocket transport
   ========================================================================= */

interface LiveServerContent {
  modelTurn?: { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> };
  inputTranscription?: { text?: string };
  outputTranscription?: { text?: string };
  interrupted?: boolean;
  turnComplete?: boolean;
  generationComplete?: boolean;
}

interface LiveMessage {
  setupComplete?: Record<string, never>;
  serverContent?: LiveServerContent;
  goAway?: { timeLeft?: string };
  error?: { message?: string; code?: number };
}

interface LiveClientOptions {
  token: string;
  model?: string;
  voice: GeminiVoice;
  language: LanguageMode;
  onOpen?: () => void;
  onSetupComplete?: () => void;
  onAudioChunk?: (b64: string) => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onError?: (msg: string) => void;
  onClose?: (code: number, reason: string) => void;
}

class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private opts: LiveClientOptions;
  private setupSent = false;

  constructor(opts: LiveClientOptions) {
    this.opts = opts;
  }

  connect(): void {
    const { token } = this.opts;
    // Ephemeral token → v1alpha BidiGenerateContentConstrained with access_token query param
    const url = `${WS_ENDPOINT_EPHEMERAL}?access_token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.opts.onOpen?.();
      this.sendSetup(this.opts.model || DEFAULT_MODEL);
    };

    ws.onmessage = (event) => this.handleMessage(event.data);

    ws.onerror = () => {
      this.opts.onError?.('WebSocket connection error.');
    };

    ws.onclose = (ev) => {
      this.opts.onClose?.(ev.code, ev.reason);
    };
  }

  private sendSetup(model: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const setup = {
      setup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ['AUDIO'],  // native audio out
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: this.opts.voice } },
            languageCode: LANG_CODE[this.opts.language],
          },
        },
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION[this.opts.language] }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    };
    this.ws.send(JSON.stringify(setup));
    this.setupSent = true;
  }

  private async handleMessage(data: string | ArrayBuffer | Blob): Promise<void> {
    let text: string;
    if (typeof data === 'string') text = data;
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else text = await data.text();

    let msg: LiveMessage;
    try { msg = JSON.parse(text); }
    catch { return; }

    if (msg.setupComplete) {
      this.opts.onSetupComplete?.();
      return;
    }
    if (msg.goAway) {
      this.opts.onError?.(`Server closing session (${msg.goAway.timeLeft ?? 'soon'})`);
      return;
    }
    if (msg.error) {
      this.opts.onError?.(msg.error.message || `Live API error ${msg.error.code ?? ''}`);
      return;
    }

    const sc = msg.serverContent;
    if (!sc) return;

    // 24 kHz PCM16 audio → player
    const parts = sc.modelTurn?.parts;
    if (parts?.length) {
      for (const p of parts) {
        if (p.inlineData?.data) this.opts.onAudioChunk?.(p.inlineData.data);
      }
    }
    if (sc.inputTranscription?.text) this.opts.onInputTranscript?.(sc.inputTranscription.text);
    if (sc.outputTranscription?.text) this.opts.onOutputTranscript?.(sc.outputTranscription.text);
    if (sc.interrupted) this.opts.onInterrupted?.();  // server-side barge-in
    if (sc.turnComplete) this.opts.onTurnComplete?.();
  }

  /** Stream one base64 PCM16 16 kHz chunk. */
  sendAudioChunk(base64Pcm: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupSent) return;
    this.ws.send(JSON.stringify({
      realtimeInput: {
        audio: { data: base64Pcm, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` },
      },
    }));
  }

  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ realtimeInput: { text } }));
  }

  close(): void {
    try { this.ws?.close(1000, 'client ended'); } catch { /* noop */ }
    this.ws = null;
    this.setupSent = false;
  }
}

/* =========================================================================
   PURE HELPERS
   ========================================================================= */

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* =========================================================================
   SUB-COMPONENTS
   ========================================================================= */

function ModalShell({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      {children}
    </div>
  );
}

function VoicePicker({
  value, onChange, disabled,
}: { value: GeminiVoice; onChange: (v: GeminiVoice) => void; disabled?: boolean }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Select Gemini Voice</label>
      <div className="mt-2.5 grid grid-cols-1 gap-2.5">
        {VOICE_OPTIONS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            disabled={disabled}
            className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition disabled:opacity-50 ${
              value === v.id
                ? 'border-indigo-500 bg-indigo-500/20 text-white'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{v.name}</span>
                <span className="rounded bg-indigo-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">{v.tag}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">{v.desc}</p>
            </div>
            {value === v.id && <CheckCircle2 className="h-5 w-5 shrink-0 text-indigo-400" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function CallStatusBadge({ state, duration, latencyMs }: {
  state: CallState; duration: number; latencyMs: number | null;
}) {
  const dot = (() => {
    switch (state) {
      case 'gemini_speaking': return 'bg-purple-400 shadow-[0_0_12px_#c084fc] animate-pulse';
      case 'user_speaking':   return 'bg-cyan-400 shadow-[0_0_12px_#22d3ee] animate-bounce';
      case 'thinking':        return 'bg-amber-400 shadow-[0_0_12px_#fbbf24] animate-spin';
      case 'interrupted':     return 'bg-rose-500 shadow-[0_0_14px_#f43f5e] animate-ping';
      case 'reconnecting':    return 'bg-blue-400 shadow-[0_0_12px_#60a5fa] animate-pulse';
      case 'error':           return 'bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse';
      case 'muted':           return 'bg-rose-500 shadow-[0_0_10px_#f43f5e]';
      default:                return 'bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse';
    }
  })();

  const label = (() => {
    switch (state) {
      case 'gemini_speaking': return 'Gemini Speaking…';
      case 'user_speaking':   return 'You are Speaking…';
      case 'thinking':        return 'Thinking…';
      case 'interrupted':     return 'Interrupted!';
      case 'reconnecting':    return 'Reconnecting…';
      case 'error':           return 'Connection Error';
      case 'muted':           return 'Mic Muted';
      case 'connecting':      return 'Connecting…';
      default:                return 'Listening…';
    }
  })();

  return (
    <div
      className="flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 shadow-inner backdrop-blur-md"
      aria-live="polite"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className="font-mono text-xs font-semibold tracking-wider text-white">{formatDuration(duration)}</span>
      <span className="text-white/30">•</span>
      <span className="text-xs font-medium text-slate-200">{label}</span>
      {latencyMs !== null && (
        <>
          <span className="text-white/30">•</span>
          <span className={`flex items-center gap-1 text-[10px] font-mono ${
            latencyMs < 900 ? 'text-emerald-300' : latencyMs < 1800 ? 'text-amber-300' : 'text-rose-300'
          }`}>
            <Wifi className="h-3 w-3" />{latencyMs}ms
          </span>
        </>
      )}
    </div>
  );
}

/* =========================================================================
   MAIN COMPONENT
   ========================================================================= */

export function AIAssistantPage() {
  const { showError, showSuccess } = useNotification();

  // ---- Settings ----
  const [selectedVoice, setSelectedVoice] = useState<GeminiVoice>('Zephyr');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('hinglish');
  const [echoIsolationMode, setEchoIsolationMode] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEYS.echoIsolation) !== 'false'; }
    catch { return true; }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // ---- Call lifecycle ----
  const [callState, setCallState] = useState<CallState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // ---- Transcripts ----
  const [currentTurn, setCurrentTurn] = useState<{ speaker: 'user' | 'gemini'; text: string } | null>(null);
  const [dialogueHistory, setDialogueHistory] = useState<DialogueTurn[]>([]);
  const [recentSessions, setRecentSessions] = useState<CallSessionRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.sessions);
      return raw ? (JSON.parse(raw) as CallSessionRecord[]) : [];
    } catch { return []; }
  });

  // ---- Visualizer ----
  const [micVolume, setMicVolume] = useState(0);
  const [geminiVolume, setGeminiVolume] = useState(0);
  const [frequencyBars, setFrequencyBars] = useState<number[]>(() => new Array(24).fill(6));

  // ---- Refs (async-safe current values) ----
  const callStateRef = useRef(callState);
  const isMicMutedRef = useRef(isMicMuted);
  const isSpeakerMutedRef = useRef(isSpeakerMuted);
  const dialogueHistoryRef = useRef(dialogueHistory);
  const selectedVoiceRef = useRef(selectedVoice);
  const languageModeRef = useRef(languageMode);
  const echoIsolationModeRef = useRef(echoIsolationMode);

  callStateRef.current = callState;
  isMicMutedRef.current = isMicMuted;
  isSpeakerMutedRef.current = isSpeakerMuted;
  dialogueHistoryRef.current = dialogueHistory;
  selectedVoiceRef.current = selectedVoice;
  languageModeRef.current = languageMode;
  echoIsolationModeRef.current = echoIsolationMode;

  // ---- Live pipeline refs ----
  const engineRef = useRef<AudioEngine | null>(null);
  const clientRef = useRef<GeminiLiveClient | null>(null);
  const mountedRef = useRef(true);
  const sessionStartRef = useRef(0);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastMicVolRef = useRef(0);
  const lastGeminiVolRef = useRef(0);
  const isBarsRestingRef = useRef(false);

  // ---- Transcript accumulation (Live streams partials) ----
  const pendingInputRef = useRef('');
  const pendingOutputRef = useRef('');
  const lastUserActivityRef = useRef(0);
  const turnStartRef = useRef(0);
  const outputStartedRef = useRef(false);

  const updateCallState = useCallback((next: CallState) => {
    callStateRef.current = next;
    if (mountedRef.current) setCallState(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* -----------------------------------------------------------------------
     Session persistence
     ----------------------------------------------------------------------- */
  const saveSession = useCallback(() => {
    if (dialogueHistoryRef.current.length === 0 || sessionStartRef.current === 0) return;
    const duration = Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 1000));
    const record: CallSessionRecord = {
      id: `call-${Date.now()}`,
      startedAt: new Date(sessionStartRef.current).toLocaleString(),
      durationSeconds: duration,
      voice: selectedVoiceRef.current,
      language: languageModeRef.current,
      turns: dialogueHistoryRef.current,
    };
    if (!mountedRef.current) return;
    setRecentSessions((prev) => {
      const updated = [record, ...prev].slice(0, 20);
      try { localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(updated)); } catch { /* noop */ }
      return updated;
    });
  }, []);

  /* -----------------------------------------------------------------------
     Spectrum visualizer (tap real analysers from AudioEngine)
     ----------------------------------------------------------------------- */
  useEffect(() => {
    const tick = () => {
      if (!mountedRef.current) return;
      let active = 0;
      const bars = new Array(24).fill(6);
      const engine = engineRef.current;

      const micA = engine?.getMicAnalyser();
      if (micA && !isMicMutedRef.current && callStateRef.current !== 'idle') {
        const d = new Uint8Array(micA.frequencyBinCount);
        micA.getByteFrequencyData(d);
        let sum = 0;
        for (let i = 0; i < d.length; i++) sum += d[i];
        const v = sum / (d.length * 255);
        if (v > 0.01 || lastMicVolRef.current > 0.01) {
          lastMicVolRef.current = v;
          setMicVolume(v);
          active = Math.max(active, v);
        }
        for (let i = 0; i < 24; i++) {
          bars[i] = Math.max(6, Math.min(100, Math.round(((d[i % d.length] || 0) / 255) * 85)));
        }
      } else if (lastMicVolRef.current > 0.01) {
        lastMicVolRef.current = 0;
        setMicVolume(0);
      }

      const spkA = engine?.getSpeakerAnalyser();
      if (spkA && callStateRef.current === 'gemini_speaking' && !isSpeakerMutedRef.current) {
        const d = new Uint8Array(spkA.frequencyBinCount);
        spkA.getByteFrequencyData(d);
        let sum = 0;
        for (let i = 0; i < d.length; i++) sum += d[i];
        const v = sum / (d.length * 255);
        if (v > 0.01 || lastGeminiVolRef.current > 0.01) {
          lastGeminiVolRef.current = v;
          setGeminiVolume(v);
          active = Math.max(active, v);
        }
        for (let i = 0; i < 24; i++) {
          bars[i] = Math.max(8, Math.min(100, Math.round(((d[i % d.length] || 0) / 255) * 95)));
        }
      } else if (lastGeminiVolRef.current > 0.01) {
        lastGeminiVolRef.current = 0;
        setGeminiVolume(0);
      }

      if (callStateRef.current === 'idle') {
        if (!isBarsRestingRef.current) {
          isBarsRestingRef.current = true;
          setFrequencyBars(new Array(24).fill(4));
        }
      } else {
        isBarsRestingRef.current = false;
        if (active < 0.05) {
          const t = Date.now() / 400;
          for (let i = 0; i < 24; i++) {
            bars[i] = Math.max(6, Math.round(14 + Math.sin(t + i * 0.4) * 8));
          }
        }
        setFrequencyBars(bars);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  /* -----------------------------------------------------------------------
     Transcript flushing — Live API streams fragments; we coalesce on pause
     ----------------------------------------------------------------------- */
  const flushInputTranscript = useCallback(() => {
    const text = pendingInputRef.current.trim();
    pendingInputRef.current = '';
    if (!text) return;
    const turn: DialogueTurn = {
      id: `u-${Date.now()}`,
      speaker: 'user',
      text,
      timestamp: nowTime(),
    };
    if (mountedRef.current) {
      setDialogueHistory((prev) => [...prev, turn]);
      setCurrentTurn({ speaker: 'user', text });
    }
  }, []);

  const flushOutputTranscript = useCallback(() => {
    const text = pendingOutputRef.current.trim();
    pendingOutputRef.current = '';
    if (!text) return;
    const turn: DialogueTurn = {
      id: `g-${Date.now()}`,
      speaker: 'gemini',
      text,
      timestamp: nowTime(),
    };
    if (mountedRef.current) {
      setDialogueHistory((prev) => [...prev, turn]);
      setCurrentTurn({ speaker: 'gemini', text });
    }
  }, []);

  /* -----------------------------------------------------------------------
     START — connect WS, start audio, stream mic
     ----------------------------------------------------------------------- */
  const startLiveCall = async () => {
    if (callStateRef.current !== 'idle') return;

    try {
      updateCallState('connecting');

      // 1. Ephemeral token from backend (never expose the API key)
      const tokenRes = unwrapApi(
        await apiClient.post<LiveTokenResponse>('/gemini/live-token', {}),
      );
      const token = tokenRes?.token;
      if (!token) throw new Error('Backend did not return a Gemini Live token.');

      // 2. Reset state
      sessionStartRef.current = Date.now();
      setCallDuration(0);
      setDialogueHistory([]);
      setCurrentTurn(null);
      setLatencyMs(null);
      pendingInputRef.current = '';
      pendingOutputRef.current = '';
      outputStartedRef.current = false;
      turnStartRef.current = 0;

      // 3. Audio engine (mic → 16k PCM16, 24k PCM16 → speaker)
      const engine = new AudioEngine();
      engineRef.current = engine;
      await engine.start();
      engine.setMicMuted(isMicMutedRef.current);

      // 4. WebSocket client
      const client = new GeminiLiveClient({
        token,
        model: tokenRes?.model || DEFAULT_MODEL,
        voice: selectedVoiceRef.current,
        language: languageModeRef.current,

        onOpen: () => updateCallState('connecting'),

        onSetupComplete: () => {
          updateCallState('listening');
          // Kick the conversation off with text — instant, no mic round-trip
          client.sendText('Hello! Please greet me briefly and ask how you can help.');
        },

        onAudioChunk: (b64) => {
          // First audio of a turn → measure latency from user's last word
          if (!outputStartedRef.current) {
            outputStartedRef.current = true;
            if (turnStartRef.current > 0) {
              setLatencyMs(Date.now() - turnStartRef.current);
            }
          }
          engine.enqueue(b64);
          updateCallState('gemini_speaking');
        },

        onInputTranscript: (text) => {
          pendingInputRef.current = text;
          lastUserActivityRef.current = Date.now();
          turnStartRef.current = Date.now();
          if (callStateRef.current !== 'gemini_speaking') {
            updateCallState('user_speaking');
          }
          if (mountedRef.current) setCurrentTurn({ speaker: 'user', text });
        },

        onOutputTranscript: (text) => {
          pendingOutputRef.current = text;
          updateCallState('gemini_speaking');
          if (mountedRef.current) setCurrentTurn({ speaker: 'gemini', text });
        },

        onInterrupted: () => {
          // Server detected barge-in — kill local playback immediately
          engine.flushPlayback();
          flushOutputTranscript();
          updateCallState('interrupted');
          setTimeout(() => {
            if (mountedRef.current && callStateRef.current === 'interrupted') {
              updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
            }
          }, 200);
        },

        onTurnComplete: () => {
          flushOutputTranscript();
          flushInputTranscript();
          outputStartedRef.current = false;
          if (!isMicMutedRef.current) updateCallState('listening');
        },

        onError: (msg) => {
          console.error('[GeminiLive]', msg);
          if (mountedRef.current) {
            updateCallState('error');
            showError('Live Session Error', msg);
          }
        },

        onClose: (code, reason) => {
          if (!mountedRef.current) return;
          if (callStateRef.current !== 'idle') {
            console.warn('[GeminiLive] socket closed', code, reason);
            updateCallState('error');
            showError('Connection Lost', 'The live session disconnected. Tap Reconnect.');
          }
        },
      });
      clientRef.current = client;
      engine.onChunk = (b64) => client.sendAudioChunk(b64);
      client.connect();

      // 5. Duration timer
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      callTimerRef.current = setInterval(() => {
        if (mountedRef.current) setCallDuration((d) => d + 1);
      }, 1000);

    } catch (err: any) {
      console.error('Live call start failed:', err);
      updateCallState('error');
      if (mountedRef.current) {
        showError(
          'Could Not Start Live Call',
          err?.message || 'Microphone access or token provisioning failed.',
        );
      }
      await engineRef.current?.stop().catch(() => {});
      engineRef.current = null;
    }
  };

  /* -----------------------------------------------------------------------
     END — tear everything down cleanly
     ----------------------------------------------------------------------- */
  const endLiveCall = useCallback(async () => {
    saveSession();

    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }

    clientRef.current?.close();
    clientRef.current = null;

    await engineRef.current?.stop().catch(() => {});
    engineRef.current = null;

    flushOutputTranscript();
    flushInputTranscript();

    const finalDuration = sessionStartRef.current
      ? Math.round((Date.now() - sessionStartRef.current) / 1000)
      : callDuration;

    updateCallState('idle');
    if (mountedRef.current) {
      setMicVolume(0);
      setGeminiVolume(0);
      setLatencyMs(null);
      showSuccess('Call Ended', `Session duration: ${formatDuration(finalDuration)}`);
    }
  }, [saveSession, flushInputTranscript, flushOutputTranscript, updateCallState, callDuration, showSuccess]);

  useEffect(() => {
    return () => {
      clientRef.current?.close();
      engineRef.current?.stop().catch(() => {});
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, []);

  /* -----------------------------------------------------------------------
     Mute toggles
     ----------------------------------------------------------------------- */
  const toggleMic = useCallback(() => {
    const next = !isMicMutedRef.current;
    setIsMicMuted(next);
    isMicMutedRef.current = next;
    engineRef.current?.setMicMuted(next);
    if (next && (callStateRef.current === 'listening' || callStateRef.current === 'user_speaking')) {
      updateCallState('muted');
    } else if (!next && callStateRef.current === 'muted') {
      updateCallState('listening');
    }
  }, [updateCallState]);

  const toggleSpeaker = useCallback(() => {
    const next = !isSpeakerMutedRef.current;
    setIsSpeakerMuted(next);
    isSpeakerMutedRef.current = next;
    engineRef.current?.setSpeakerMuted(next);
    if (next && callStateRef.current === 'gemini_speaking') {
      engineRef.current?.flushPlayback();
      updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
    }
  }, [updateCallState]);

  /* -----------------------------------------------------------------------
     Reconnect — fresh token + fresh socket, audio engine survives
     ----------------------------------------------------------------------- */
  const reconnectAudio = useCallback(async () => {
    updateCallState('reconnecting');
    try {
      clientRef.current?.close();
      clientRef.current = null;

      const tokenRes = unwrapApi(
        await apiClient.post<LiveTokenResponse>('/gemini/live-token', {}),
      );
      const token = tokenRes?.token;
      if (!token) throw new Error('Token refresh failed.');

      if (!engineRef.current) {
        const e = new AudioEngine();
        await e.start();
        engineRef.current = e;
      }
      await engineRef.current.resume();

      const client = new GeminiLiveClient({
        token,
        model: tokenRes?.model || DEFAULT_MODEL,
        voice: selectedVoiceRef.current,
        language: languageModeRef.current,
        onSetupComplete: () => updateCallState(isMicMutedRef.current ? 'muted' : 'listening'),
        onAudioChunk: (b64) => { engineRef.current?.enqueue(b64); updateCallState('gemini_speaking'); },
        onInputTranscript: (t) => { pendingInputRef.current = t; updateCallState('user_speaking'); },
        onOutputTranscript: (t) => { pendingOutputRef.current = t; updateCallState('gemini_speaking'); },
        onInterrupted: () => { engineRef.current?.flushPlayback(); updateCallState('interrupted'); },
        onTurnComplete: () => updateCallState(isMicMutedRef.current ? 'muted' : 'listening'),
        onError: (m) => { updateCallState('error'); showError('Live Error', m); },
        onClose: () => { if (callStateRef.current !== 'idle') updateCallState('error'); },
      });
      clientRef.current = client;
      engineRef.current.onChunk = (b64) => client.sendAudioChunk(b64);
      client.connect();

      showSuccess('Reconnected', 'Live stream restored.');
    } catch (e: any) {
      updateCallState('error');
      showError('Reconnect Failed', e?.message || 'Could not re-establish the live session.');
    }
  }, [updateCallState, showError, showSuccess]);

  /* -----------------------------------------------------------------------
     Settings helpers
     ----------------------------------------------------------------------- */
  const toggleEchoIsolation = () => {
    const next = !echoIsolationMode;
    setEchoIsolationMode(next);
    try { localStorage.setItem(STORAGE_KEYS.echoIsolation, String(next)); } catch { /* noop */ }
  };

  const cycleLanguage = () => {
    if (isCallActive) return;
    setLanguageMode((prev) =>
      prev === 'hinglish' ? 'hindi' : prev === 'hindi' ? 'english' : 'hinglish',
    );
  };

  const clearSessionHistory = () => {
    setRecentSessions([]);
    try { localStorage.removeItem(STORAGE_KEYS.sessions); } catch { /* noop */ }
    showSuccess('History Cleared', 'All stored call transcripts have been deleted.');
  };

  /* ======================================================================
     DERIVED
     ====================================================================== */
  const isCallActive = callState !== 'idle';
  const activeVolume =
    callState === 'gemini_speaking' && !isSpeakerMuted ? geminiVolume
      : isMicMuted ? 0 : micVolume;
  const orbScale = 1 + activeVolume * 0.45;

  /* ======================================================================
     RENDER
     ====================================================================== */
  return (
    <div className="relative flex h-[calc(100vh-4.5rem)] w-full flex-col overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 font-sans text-slate-100 select-none">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.25),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(168,85,247,0.18),transparent_50%)]" />

      {/* ============================ HEADER ============================ */}
      <header className="relative z-20 flex items-center justify-between border-b border-white/10 bg-black/20 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/25">
            <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
              <Sparkles className="h-4 w-4 animate-pulse text-cyan-300" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wider text-white">GEMINI LIVE</span>
              <span className="flex h-2 w-2 animate-ping rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
            </div>
            <p className="text-[11px] font-medium text-slate-400">
              Bidirectional WebSocket · Native Audio · Real-time Barge-in
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isCallActive ? (
            <CallStatusBadge state={callState} duration={callDuration} latencyMs={latencyMs} />
          ) : (
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs text-slate-400">
              <Radio className="h-3.5 w-3.5 text-slate-500" />
              <span>Ready for Live Call</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {callState === 'error' && (
            <button
              onClick={reconnectAudio}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/30"
            >
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Reconnect</span>
            </button>
          )}

          <div
            className="hidden items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 sm:flex"
            title="Server-side VAD detects speech and auto-interrupts the model"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Server Barge-in</span>
          </div>

          <button
            onClick={() => !isCallActive && setIsSettingsOpen(true)}
            disabled={isCallActive}
            title={isCallActive ? 'Voice settings locked during call' : 'Voice settings'}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Headphones className="h-3.5 w-3.5 text-indigo-400" /><span>{selectedVoice}</span>
          </button>
          <button
            onClick={cycleLanguage}
            disabled={isCallActive}
            title={isCallActive ? 'Language locked during call' : 'Change language'}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold capitalize text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Globe className="h-3.5 w-3.5 text-cyan-400" /><span>{languageMode}</span>
          </button>
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Call history"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            onClick={() => !isCallActive && setIsSettingsOpen(true)}
            disabled={isCallActive}
            title={isCallActive ? 'Settings locked during call' : 'Settings'}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ============================ ORB ============================ */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-6">
        <div className="relative my-auto flex items-center justify-center">
          <div
            style={{ transform: `scale(${orbScale * 1.35})`, opacity: isCallActive ? (callState === 'gemini_speaking' ? 0.35 : 0.2) : 0.08 }}
            className="pointer-events-none absolute h-72 w-72 rounded-full border border-indigo-400/30 bg-gradient-to-tr from-indigo-500/10 via-purple-500/10 to-cyan-500/10 transition-transform duration-100 ease-out sm:h-96 sm:w-96"
          />
          <div
            style={{ transform: `scale(${orbScale * 1.18})`, opacity: isCallActive ? (callState === 'gemini_speaking' ? 0.5 : 0.3) : 0.12 }}
            className="pointer-events-none absolute h-60 w-60 rounded-full border border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 via-indigo-500/20 to-purple-600/15 transition-transform duration-100 ease-out sm:h-80 sm:w-80"
          />
          <div
            style={{ transform: `scale(${orbScale * 1.06})`, opacity: isCallActive ? (callState === 'gemini_speaking' ? 0.75 : 0.45) : 0.18 }}
            className="pointer-events-none absolute h-48 w-48 rounded-full border border-purple-400/60 shadow-[0_0_50px_rgba(168,85,247,0.35)] transition-transform duration-75 ease-out sm:h-64 sm:w-64"
          />
          <div
            style={{ transform: `scale(${orbScale})` }}
            className={`relative flex h-36 w-36 items-center justify-center rounded-full shadow-2xl transition-all duration-75 ease-out sm:h-48 sm:w-48 ${
              isCallActive
                ? callState === 'gemini_speaking' ? 'bg-gradient-to-br from-purple-500 via-indigo-600 to-cyan-400 shadow-[0_0_80px_rgba(168,85,247,0.65)]'
                : callState === 'user_speaking' ? 'animate-pulse bg-gradient-to-br from-cyan-400 via-teal-500 to-blue-600 shadow-[0_0_80px_rgba(34,211,238,0.7)]'
                : callState === 'thinking' ? 'bg-gradient-to-br from-amber-500 via-indigo-600 to-purple-700 shadow-[0_0_80px_rgba(245,158,11,0.55)]'
                : callState === 'interrupted' ? 'bg-gradient-to-br from-rose-500 via-pink-600 to-amber-500 shadow-[0_0_80px_rgba(244,63,94,0.7)]'
                : callState === 'reconnecting' ? 'bg-gradient-to-br from-blue-500 via-indigo-600 to-slate-700 shadow-[0_0_60px_rgba(59,130,246,0.5)]'
                : callState === 'error' ? 'bg-gradient-to-br from-red-600 via-rose-700 to-slate-900 shadow-[0_0_60px_rgba(239,68,68,0.5)]'
                : callState === 'muted' ? 'bg-gradient-to-br from-rose-600 to-slate-800 shadow-[0_0_60px_rgba(244,63,94,0.4)]'
                : 'bg-gradient-to-br from-cyan-400 via-indigo-600 to-blue-700 shadow-[0_0_70px_rgba(34,211,238,0.55)]'
                : 'border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 shadow-[0_0_30px_rgba(0,0,0,0.5)]'
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-1.5 text-white">
              {isCallActive ? (
                callState === 'gemini_speaking' ? <Volume2 className="h-10 w-10 animate-pulse text-purple-200 sm:h-12 sm:w-12" />
                : callState === 'user_speaking' ? <Mic className="h-10 w-10 animate-bounce text-cyan-200 sm:h-12 sm:w-12" />
                : callState === 'thinking' ? <Sparkles className="h-10 w-10 animate-spin text-amber-200 sm:h-12 sm:w-12" />
                : callState === 'interrupted' ? <Zap className="h-10 w-10 animate-pulse text-rose-200 sm:h-12 sm:w-12" />
                : callState === 'reconnecting' ? <RefreshCw className="h-10 w-10 animate-spin text-blue-200 sm:h-12 sm:w-12" />
                : callState === 'error' ? <AlertCircle className="h-10 w-10 animate-pulse text-red-200 sm:h-12 sm:w-12" />
                : callState === 'muted' ? <MicOff className="h-10 w-10 text-rose-200 sm:h-12 sm:w-12" />
                : <Activity className="h-10 w-10 animate-pulse text-emerald-300 sm:h-12 sm:w-12" />
              ) : (
                <PhoneCall className="h-10 w-10 text-slate-400 sm:h-12 sm:w-12" />
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 flex h-14 items-center justify-center gap-1.5">
          {frequencyBars.map((height, idx) => (
            <div
              key={idx}
              style={{ height: `${height}%` }}
              className={`w-1.5 rounded-full transition-all duration-75 ${
                isCallActive
                  ? callState === 'gemini_speaking' ? 'bg-gradient-to-t from-purple-500 to-cyan-300'
                  : callState === 'user_speaking' ? 'bg-gradient-to-t from-cyan-400 to-emerald-300'
                  : 'bg-gradient-to-t from-cyan-500 to-indigo-300'
                  : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        {callState === 'gemini_speaking' && (
          <div className="mt-4 flex items-center justify-center">
            <button
              onClick={() => {
                engineRef.current?.flushPlayback();
                updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
              }}
              className="flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/20 px-4 py-2 text-xs font-bold text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.35)] transition-all hover:scale-105 hover:bg-rose-500/30 active:scale-95"
            >
              <Square className="h-3.5 w-3.5 fill-rose-300" />
              <span>Stop Speaking</span>
            </button>
          </div>
        )}

        <div className="mt-5 w-full max-w-2xl px-4">
          {currentTurn ? (
            <div className="rounded-2xl border border-white/15 bg-black/40 p-5 shadow-2xl backdrop-blur-xl">
              <div className="mb-2 flex items-center gap-2">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${
                  currentTurn.speaker === 'gemini' ? 'text-cyan-400' : 'text-indigo-300'
                }`}>
                  {currentTurn.speaker === 'gemini' ? 'Gemini Live' : 'You'}
                </span>
                <span className="h-1 w-1 rounded-full bg-white/40" />
                <span className="font-mono text-[10px] text-slate-400">Live Sync</span>
              </div>
              <p className="text-base font-medium leading-relaxed text-slate-100 sm:text-lg">
                "{currentTurn.text}"
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-center text-sm text-slate-400">
              {isCallActive
                ? 'Speak naturally — Gemini hears you in real time. Talk over it anytime to interrupt.'
                : 'Start a live call for instant, full-duplex voice conversation with Gemini.'}
            </div>
          )}
        </div>
      </main>

      {/* ============================ FOOTER ============================ */}
      <footer className="relative z-20 flex items-center justify-center border-t border-white/10 bg-black/40 px-6 py-5 backdrop-blur-xl">
        <div className="flex items-center gap-6 sm:gap-8">
          <button
            onClick={toggleMic}
            disabled={!isCallActive}
            className={`flex h-13 w-13 items-center justify-center rounded-full border transition-all shadow-lg ${
              !isCallActive
                ? 'cursor-not-allowed border-white/10 bg-white/5 text-slate-600'
                : isMicMuted
                  ? 'border-rose-500/60 bg-rose-500/20 text-rose-400 shadow-rose-500/20 hover:bg-rose-500/30'
                  : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
            }`}
            title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            aria-pressed={isMicMuted}
          >
            {isMicMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>

          {!isCallActive ? (
            <button
              onClick={startLiveCall}
              className="group relative flex items-center gap-3.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-4 text-base font-bold text-white shadow-[0_0_35px_rgba(16,185,129,0.45)] transition-all duration-200 hover:scale-105 hover:shadow-[0_0_50px_rgba(16,185,129,0.7)] active:scale-95"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                <PhoneCall className="h-4 w-4 text-white transition-transform group-hover:rotate-12" />
              </div>
              <span>Start Live Call</span>
            </button>
          ) : (
            <button
              onClick={endLiveCall}
              className="group relative flex items-center gap-3.5 rounded-full bg-gradient-to-r from-rose-600 to-red-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_35px_rgba(244,63,94,0.55)] transition-all duration-200 hover:scale-105 hover:shadow-[0_0_50px_rgba(244,63,94,0.8)] active:scale-95"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                <PhoneOff className="h-4 w-4 text-white transition-transform group-hover:-rotate-12" />
              </div>
              <span>End Call</span>
            </button>
          )}

          <button
            onClick={toggleSpeaker}
            disabled={!isCallActive}
            className={`flex h-13 w-13 items-center justify-center rounded-full border transition-all shadow-lg ${
              !isCallActive
                ? 'cursor-not-allowed border-white/10 bg-white/5 text-slate-600'
                : isSpeakerMuted
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-400 shadow-amber-500/20 hover:bg-amber-500/30'
                  : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
            }`}
            title={isSpeakerMuted ? 'Unmute Speaker' : 'Mute Speaker'}
            aria-pressed={isSpeakerMuted}
          >
            {isSpeakerMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
          </button>
        </div>
      </footer>

      {/* ============================ SETTINGS ============================ */}
      {isSettingsOpen && (
        <ModalShell onClose={() => setIsSettingsOpen(false)}>
          <div
            className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900 p-6 text-slate-100 shadow-2xl"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Sliders className="h-5 w-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Gemini Live Settings</h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 pt-5">
              <VoicePicker value={selectedVoice} onChange={setSelectedVoice} disabled={isCallActive} />

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Language Mode</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['hinglish', 'hindi', 'english'] as LanguageMode[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLanguageMode(lang)}
                      disabled={isCallActive}
                      className={`rounded-xl border py-2.5 text-xs font-bold capitalize transition disabled:opacity-50 ${
                        languageMode === lang
                          ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <div>
                      <span className="text-xs font-bold text-white">Speaker Echo Guard</span>
                      <p className="text-[11px] text-slate-400">
                        Extra client-side protection against speaker bleed (server VAD always handles barge-in)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={echoIsolationMode}
                    disabled={isCallActive}
                    onClick={toggleEchoIsolation}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${
                      echoIsolationMode ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${
                        echoIsolationMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-indigo-500"
              >
                Done
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ============================ HISTORY ============================ */}
      {isHistoryOpen && (
        <ModalShell onClose={() => setIsHistoryOpen(false)}>
          <div
            className="relative flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900 text-slate-100 shadow-2xl"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <History className="h-5 w-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Call Transcript History</h3>
              </div>
              <div className="flex items-center gap-2">
                {recentSessions.length > 0 && (
                  <button
                    onClick={clearSessionHistory}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-rose-400 transition hover:bg-rose-500/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </button>
                )}
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {recentSessions.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-center text-slate-500">
                  <Headphones className="mb-2 h-10 w-10 text-slate-600" />
                  <p className="text-sm font-semibold">No recorded sessions yet.</p>
                  <p className="mt-1 text-xs">Start a live call to create your first transcript.</p>
                </div>
              ) : (
                recentSessions.map((session) => (
                  <div key={session.id} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-indigo-400" />
                        <span className="text-xs font-semibold text-white">{session.startedAt}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-[10px] text-indigo-300">
                          {formatDuration(session.durationSeconds)}
                        </span>
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">
                          {session.voice}
                        </span>
                      </div>
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                      {session.turns.map((turn, idx) => (
                        <div key={idx} className="text-xs">
                          <span className={`mr-1.5 font-bold ${
                            turn.speaker === 'gemini' ? 'text-cyan-400' : 'text-indigo-300'
                          }`}>
                            {turn.speaker === 'gemini' ? 'Gemini:' : 'You:'}
                          </span>
                          <span className="text-slate-200">{turn.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

export default AIAssistantPage;