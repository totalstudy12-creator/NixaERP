/**
 * AIAssistantPage.tsx — Production-Ready RaptorERP AI Intelligence Assistant
 *
 * Capabilities:
 *  1. Dual Mode: High-speed Executive Chat Workspace (Text + Audio) & Live Voice Call (Full Duplex).
 *  2. Clean White Theme: Conforms strictly to RaptorERP executive white theme (slate-50 canvas, crisp white cards, slate-900 typography, subtle indigo accents).
 *  3. Deep ERP Context: Sales, inventory, customers, pending deliveries, receivables, P&L.
 *  4. Real-time Gemini Live WebSocket with auto REST streaming fallback (zero crashes).
 *  5. Audio Engine: Gapless 24kHz PCM16 playback + 16kHz capture + Gemini TTS speech playback.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneCall,
  PhoneOff,
  Radio,
  Settings,
  Clock,
  Sparkles,
  X,
  Check,
  CheckCircle2,
  Headphones,
  Zap,
  Globe,
  Activity,
  Sliders,
  History,
  Trash2,
  RefreshCw,
  Square,
  AlertCircle,
  ShieldCheck,
  Wifi,
  Send,
  MessageSquare,
  Copy,
  Bot,
  User,
  TrendingUp,
  Package,
  Truck,
  DollarSign,
  ChevronRight,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import {
  speakWithAiAudio,
  stopSpeech,
  primeSpeechEngine,
  isSpeechSynthesisSupported,
} from '../utils/audioSpeech';

/* =========================================================================
   TYPES
   ========================================================================= */

export type GeminiVoice = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
export type LanguageMode = 'hinglish' | 'hindi' | 'english';
export type AssistantTab = 'chat' | 'live_call';

export type CallState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'thinking'
  | 'gemini_speaking'
  | 'interrupted'
  | 'reconnecting'
  | 'muted'
  | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  agentRole?: string;
  isPlaying?: boolean;
}

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
  auth_type?: 'ephemeral' | 'key';
  model?: string;
  expires_at?: string;
}

/* =========================================================================
   CONSTANTS & CONFIG
   ========================================================================= */

const VOICE_OPTIONS: Array<{ id: GeminiVoice; name: string; desc: string; tag: string }> = [
  { id: 'Zephyr', name: 'Zephyr', desc: 'Crisp, articulate executive tone', tag: 'Recommended' },
  { id: 'Kore',   name: 'Kore (Aanya)', desc: 'Warm, expressive conversational Indian female', tag: 'Lively' },
  { id: 'Puck',   name: 'Puck', desc: 'Bright, energetic & agile conversationalist', tag: 'Energetic' },
  { id: 'Charon', name: 'Charon', desc: 'Calm, authoritative enterprise tone', tag: 'Calm' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'Focused, direct, low-pitch executive voice', tag: 'Focused' },
];

const DEFAULT_MODEL = 'gemini-3.8-live';

const WS_ENDPOINT_EPHEMERAL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

const STORAGE_KEYS = {
  echoIsolation: 'raptor_ai_echo_isolation',
  sessions: 'raptor_ai_live_sessions_v2',
  chatHistory: 'raptor_ai_chat_history_v2',
  selectedVoice: 'raptor_ai_selected_voice',
  languageMode: 'raptor_ai_language_mode',
} as const;

const LANG_CODE: Record<LanguageMode, string> = {
  hinglish: 'hi-IN',
  hindi: 'hi-IN',
  english: 'en-US',
};

const SYSTEM_INSTRUCTION: Record<LanguageMode, string> = {
  hinglish:
    'You are Anya, the intelligent ERP companion for RaptorERP / NixaERP operations. ' +
    'Reply naturally in conversational Hinglish (Hindi + English blend). Speak naturally, friendly, and concisely. ' +
    'Help with sales, inventory, low stock, customer orders, pending deliveries, receivables, and profit facts. ' +
    'Never use raw markdown formatting, code blocks, or asterisks during spoken dialogue.',
  hindi:
    'आप RaptorERP के एआई वॉइस और डेटा सहायक हैं। स्वाभाविक हिंदी में स्पष्ट और छोटे जवाब दें। ' +
    'बिक्री, स्टॉक, डिलीवरी, और बकाया हिसाब की सही जानकारी दें। बोलचाल में मार्कडाउन या बुलेट पॉइंट्स का इस्तेमाल न करें।',
  english:
    'You are the intelligent ERP operations assistant for RaptorERP. ' +
    'Reply in natural, crisp, conversational English. Help with sales summaries, inventory health, deliveries, ' +
    'receivables, and profit figures. Keep spoken replies short, direct, and under 2 sentences without markdown.',
};

const QUICK_PROMPTS = [
  { icon: TrendingUp, label: "Today's Sales & Cash", query: "What is our today's total sales, invoices count, and cash collection summary?" },
  { icon: Package, label: "Low Stock Alert", query: "Which products are currently at or below their reorder level? List top critical items." },
  { icon: Truck, label: "Pending Deliveries", query: "Show me pending delivery orders, route allocations, and active vehicle dispatch status." },
  { icon: DollarSign, label: "Receivables & Dues", query: "What are our total outstanding customer receivables and overdue invoices right now?" },
  { icon: Activity, label: "Net Revenue & Profit", query: "What is our current financial revenue, gross profit, and operating margin summary?" },
];

/* =========================================================================
   AUDIO WORKLETS (Inlined Blob URLs for Zero-Latency Gapless I/O)
   ========================================================================= */

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
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
   AUDIO ENGINE
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
    this.outCtx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE, latencyHint: 'interactive' });
    this.outUrl = workletBlobUrl(PLAYBACK_WORKLET_SRC);
    await this.outCtx.audioWorklet.addModule(this.outUrl);
    this.playbackNode = new AudioWorkletNode(this.outCtx, 'pcm16-playback');
    this.outAnalyser = this.outCtx.createAnalyser();
    this.outAnalyser.fftSize = 64;
    this.outAnalyser.smoothingTimeConstant = 0.75;
    this.playbackNode.connect(this.outAnalyser);
    this.outAnalyser.connect(this.outCtx.destination);
    if (this.outCtx.state === 'suspended') await this.outCtx.resume();

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
      muted ? { type: 'flush' } : { type: 'audio', samples: new ArrayBuffer(0) }
    );
  }

  enqueue(base64Pcm: string): void {
    if (!this.playbackNode || !base64Pcm) return;
    const buf = base64ToArrayBuffer(base64Pcm);
    if (buf.byteLength < 2) return;
    this.playbackNode.port.postMessage({ type: 'audio', samples: buf }, [buf]);
  }

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
   GEMINI LIVE CLIENT
   ========================================================================= */

interface LiveMessage {
  setupComplete?: Record<string, never>;
  serverContent?: {
    modelTurn?: { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    interrupted?: boolean;
    turnComplete?: boolean;
    generationComplete?: boolean;
  };
  goAway?: { timeLeft?: string };
  error?: { message?: string; code?: number };
}

interface LiveClientOptions {
  token: string;
  authType?: 'ephemeral' | 'key';
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
    const { token, authType } = this.opts;
    const paramName = authType === 'key' ? 'key' : 'access_token';
    const url = `${WS_ENDPOINT_EPHEMERAL}?${paramName}=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => {
        this.opts.onOpen?.();
        this.sendSetup(this.opts.model || DEFAULT_MODEL);
      };

      ws.onmessage = (event) => this.handleMessage(event.data);
      ws.onerror = () => {
        this.opts.onError?.('WebSocket connection error. Switching to resilient speech pipeline.');
      };
      ws.onclose = (ev) => {
        this.opts.onClose?.(ev.code, ev.reason);
      };
    } catch (e: any) {
      this.opts.onError?.(e?.message || 'Failed to initialize WebSocket client.');
    }
  }

  private sendSetup(model: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const cleanModel = model.replace(/^models\//, '');
    const setup = {
      setup: {
        model: `models/${cleanModel}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
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

    const parts = sc.modelTurn?.parts;
    if (parts?.length) {
      for (const p of parts) {
        if (p.inlineData?.data) this.opts.onAudioChunk?.(p.inlineData.data);
      }
    }
    if (sc.inputTranscription?.text) this.opts.onInputTranscript?.(sc.inputTranscription.text);
    if (sc.outputTranscription?.text) this.opts.onOutputTranscript?.(sc.outputTranscription.text);
    if (sc.interrupted) this.opts.onInterrupted?.();
    if (sc.turnComplete) this.opts.onTurnComplete?.();
  }

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
   HELPERS & FORMATTERS
   ========================================================================= */

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function unwrapApi<T>(res: any): T | null {
  if (res == null) return null;
  if (typeof res === 'object' && 'data' in res && res.data !== undefined) {
    return res.data;
  }
  return res as T;
}

/** Clean lightweight text renderer that preserves bold, lists, and tables cleanly */
function FormattedMessageText({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed select-text font-normal text-slate-800">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }
        // Bold header line
        if (trimmed.startsWith('###') || trimmed.startsWith('##')) {
          return (
            <p key={idx} className="font-bold text-slate-900 pt-1 text-sm sm:text-base border-b border-slate-100 pb-0.5">
              {trimmed.replace(/^#+\s*/, '')}
            </p>
          );
        }
        // Bullet item
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
          const itemText = trimmed.replace(/^[-*•]\s*/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1.5">
              <span className="text-indigo-500 font-bold text-base leading-none">•</span>
              <span className="flex-1">{parseInlineFormatting(itemText)}</span>
            </div>
          );
        }
        // Numbered list item
        const matchNum = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (matchNum) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1.5">
              <span className="text-indigo-600 font-semibold font-mono text-xs pt-0.5">{matchNum[1]}.</span>
              <span className="flex-1">{parseInlineFormatting(matchNum[2])}</span>
            </div>
          );
        }
        return <p key={idx}>{parseInlineFormatting(line)}</p>;
      })}
    </div>
  );
}

function parseInlineFormatting(text: string): ReactNode[] {
  // Simple bold and code parser
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.substring(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-bold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={match.index} className="bg-slate-100 border border-slate-200/80 rounded px-1.5 py-0.5 font-mono text-xs text-indigo-700">
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) {
    parts.push(text.substring(lastIdx));
  }
  return parts.length > 0 ? parts : [text];
}

/* =========================================================================
   MODAL SHELL (Clean White Theme)
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
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-150"
    >
      {children}
    </div>
  );
}

/* =========================================================================
   MAIN COMPONENT — AIAssistantPage
   ========================================================================= */

export function AIAssistantPage() {
  const { showError, showSuccess } = useNotification();

  // Active Workspace Mode
  const [activeTab, setActiveTab] = useState<AssistantTab>('chat');

  // Settings
  const [selectedVoice, setSelectedVoice] = useState<GeminiVoice>(() => {
    try { return (localStorage.getItem(STORAGE_KEYS.selectedVoice) as GeminiVoice) || 'Zephyr'; }
    catch { return 'Zephyr'; }
  });
  const [languageMode, setLanguageMode] = useState<LanguageMode>(() => {
    try { return (localStorage.getItem(STORAGE_KEYS.languageMode) as LanguageMode) || 'hinglish'; }
    catch { return 'hinglish'; }
  });
  const [agentRole, setAgentRole] = useState<string>('general_operations');
  const [echoIsolationMode, setEchoIsolationMode] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEYS.echoIsolation) !== 'false'; }
    catch { return true; }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.chatHistory);
      if (saved) return JSON.parse(saved);
    } catch { /* noop */ }
    return [];
  });
  const [inputText, setInputText] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Live Call State
  const [callState, setCallState] = useState<CallState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [currentTurn, setCurrentTurn] = useState<{ speaker: 'user' | 'gemini'; text: string } | null>(null);
  const [dialogueHistory, setDialogueHistory] = useState<DialogueTurn[]>([]);
  const [recentSessions, setRecentSessions] = useState<CallSessionRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.sessions);
      return raw ? (JSON.parse(raw) as CallSessionRecord[]) : [];
    } catch { return []; }
  });

  // Spectrum visualizer bars
  const [micVolume, setMicVolume] = useState(0);
  const [geminiVolume, setGeminiVolume] = useState(0);
  const [frequencyBars, setFrequencyBars] = useState<number[]>(() => new Array(24).fill(8));

  // Refs for async-safe access
  const callStateRef = useRef(callState);
  const isMicMutedRef = useRef(isMicMuted);
  const isSpeakerMutedRef = useRef(isSpeakerMuted);
  const dialogueHistoryRef = useRef(dialogueHistory);
  const selectedVoiceRef = useRef(selectedVoice);
  const languageModeRef = useRef(languageMode);
  const engineRef = useRef<AudioEngine | null>(null);
  const clientRef = useRef<GeminiLiveClient | null>(null);
  const mountedRef = useRef(true);
  const sessionStartRef = useRef(0);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const pendingInputRef = useRef('');
  const pendingOutputRef = useRef('');
  const outputStartedRef = useRef(false);
  const turnStartRef = useRef(0);

  callStateRef.current = callState;
  isMicMutedRef.current = isMicMuted;
  isSpeakerMutedRef.current = isSpeakerMuted;
  dialogueHistoryRef.current = dialogueHistory;
  selectedVoiceRef.current = selectedVoice;
  languageModeRef.current = languageMode;

  const updateCallState = useCallback((next: CallState) => {
    callStateRef.current = next;
    if (mountedRef.current) setCallState(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopSpeech();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      clientRef.current?.close();
      engineRef.current?.stop().catch(() => {});
    };
  }, []);

  // Persist chat messages
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.chatHistory, JSON.stringify(chatMessages.slice(-50)));
    } catch { /* noop */ }
  }, [chatMessages]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (activeTab === 'chat' && chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [chatMessages, activeTab, isChatSending]);

  /* -----------------------------------------------------------------------
     Frequency spectrum visualizer for Call Mode
     ----------------------------------------------------------------------- */
  useEffect(() => {
    const tick = () => {
      if (!mountedRef.current) return;
      let active = 0;
      const bars = new Array(24).fill(8);
      const engine = engineRef.current;

      const micA = engine?.getMicAnalyser();
      if (micA && !isMicMutedRef.current && callStateRef.current !== 'idle') {
        const d = new Uint8Array(micA.frequencyBinCount);
        micA.getByteFrequencyData(d);
        let sum = 0;
        for (let i = 0; i < d.length; i++) sum += d[i];
        const v = sum / (d.length * 255);
        setMicVolume(v);
        active = Math.max(active, v);
        for (let i = 0; i < 24; i++) {
          const bin = Math.min(d.length - 1, Math.floor((i / 24) * d.length));
          bars[i] = Math.max(bars[i], Math.round((d[bin] / 255) * 100));
        }
      }

      const spkA = engine?.getSpeakerAnalyser();
      if (spkA && !isSpeakerMutedRef.current && callStateRef.current === 'gemini_speaking') {
        const d = new Uint8Array(spkA.frequencyBinCount);
        spkA.getByteFrequencyData(d);
        let sum = 0;
        for (let i = 0; i < d.length; i++) sum += d[i];
        const v = sum / (d.length * 255);
        setGeminiVolume(v);
        active = Math.max(active, v);
        for (let i = 0; i < 24; i++) {
          const bin = Math.min(d.length - 1, Math.floor((i / 24) * d.length));
          bars[i] = Math.max(bars[i], Math.round((d[bin] / 255) * 100));
        }
      }

      if (active > 0.02 || callStateRef.current !== 'idle') {
        setFrequencyBars(bars);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  /* -----------------------------------------------------------------------
     Live Call Session Saving
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
      const updated = [record, ...prev].slice(0, 30);
      try { localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(updated)); } catch { /* noop */ }
      return updated;
    });
  }, []);

  /* -----------------------------------------------------------------------
     Transcript Accumulation
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
     LIVE CALL START & END
     ----------------------------------------------------------------------- */
  const startLiveCall = async () => {
    if (callStateRef.current !== 'idle') return;
    primeSpeechEngine();

    try {
      updateCallState('connecting');

      // 1. Ephemeral token or API Key from backend
      const rawRes = await apiClient.post<any>('/gemini/live-token', {}).catch(() => null);
      const tokenRes = unwrapApi<LiveTokenResponse>(rawRes) || rawRes;
      const token = tokenRes?.token;

      if (!token) {
        throw new Error('Gemini API key is not configured in ERP settings. Please save your key in Settings → AI.');
      }

      // 2. State reset
      sessionStartRef.current = Date.now();
      setCallDuration(0);
      setDialogueHistory([]);
      setCurrentTurn(null);
      setLatencyMs(null);
      pendingInputRef.current = '';
      pendingOutputRef.current = '';
      outputStartedRef.current = false;
      turnStartRef.current = 0;

      // 3. Audio engine start
      const engine = new AudioEngine();
      engineRef.current = engine;
      await engine.start();
      engine.setMicMuted(isMicMutedRef.current);

      // 4. WebSocket Live Client
      const client = new GeminiLiveClient({
        token,
        authType: tokenRes?.auth_type || 'key',
        model: tokenRes?.model || DEFAULT_MODEL,
        voice: selectedVoiceRef.current,
        language: languageModeRef.current,

        onOpen: () => updateCallState('connecting'),

        onSetupComplete: () => {
          updateCallState('listening');
          client.sendText('Hello! Greet me briefly in one natural sentence and tell me you are ready to help with RaptorERP.');
        },

        onAudioChunk: (b64) => {
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
          console.warn('[Gemini Live Notice]:', msg);
        },

        onClose: (code, reason) => {
          if (!mountedRef.current) return;
          if (callStateRef.current !== 'idle') {
            console.info('[GeminiLive] session closed', code, reason);
          }
        },
      });

      clientRef.current = client;
      engine.onChunk = (b64) => client.sendAudioChunk(b64);
      client.connect();

      // 5. Timer
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      callTimerRef.current = setInterval(() => {
        if (mountedRef.current) setCallDuration((d) => d + 1);
      }, 1000);

    } catch (err: any) {
      console.error('Live call start error:', err);
      updateCallState('error');
      if (mountedRef.current) {
        showError('Live Call Notice', err?.message || 'Microphone access or token provisioning failed.');
      }
      await engineRef.current?.stop().catch(() => {});
      engineRef.current = null;
    }
  };

  const endLiveCall = useCallback(async () => {
    saveSession();
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    clientRef.current?.close();
    clientRef.current = null;
    await engineRef.current?.stop().catch(() => {});
    engineRef.current = null;
    pendingInputRef.current = '';
    pendingOutputRef.current = '';
    updateCallState('idle');
  }, [saveSession, updateCallState]);

  const toggleMic = useCallback(() => {
    const next = !isMicMutedRef.current;
    setIsMicMuted(next);
    engineRef.current?.setMicMuted(next);
    if (callStateRef.current === 'listening' && next) updateCallState('muted');
    else if (callStateRef.current === 'muted' && !next) updateCallState('listening');
  }, [updateCallState]);

  const toggleSpeaker = useCallback(() => {
    const next = !isSpeakerMutedRef.current;
    setIsSpeakerMuted(next);
    engineRef.current?.setSpeakerMuted(next);
  }, []);

  /* -----------------------------------------------------------------------
     CHAT WORKSPACE ACTIONS
     ----------------------------------------------------------------------- */
  const handleSendChat = async (messageToSend?: string) => {
    const query = (messageToSend ?? inputText).trim();
    if (!query || isChatSending) return;

    primeSpeechEngine();
    setInputText('');

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: nowTime(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setIsChatSending(true);

    try {
      // Build conversation history for context
      const history = chatMessages.slice(-8).map((m) => ({
        role: m.role,
        text: m.content,
      }));

      // Call high-speed backend AI with deep ERP context
      const response = await apiClient.request<any>('POST', '/ai/assistant/chat', {
        message: query,
        agent: agentRole,
        history,
      }).catch(async () => {
        // Fallback to Gemini direct chat endpoint
        return apiClient.request<any>('POST', '/gemini/chat', {
          message: query,
          history,
        });
      });

      const replyText =
        response?.reply ||
        response?.response ||
        response?.data?.reply ||
        response?.message ||
        "I have processed your request. Please check the ERP records or verify the query details.";

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: String(replyText).trim(),
        timestamp: nowTime(),
        agentRole,
      };

      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Chat error:', err);
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Could not complete request: ${err?.message || 'AI service temporarily unavailable. Please verify API key in Settings.'}`,
        timestamp: nowTime(),
      };
      setChatMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsChatSending(false);
    }
  };

  // Dictation Speech Recognition for Chat
  const toggleDictation = () => {
    if (isDictating) {
      recognitionRef.current?.stop();
      setIsDictating(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showError('Speech Recognition', 'Speech recognition is not supported in this browser. Please type your query.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = languageMode === 'english' ? 'en-US' : 'hi-IN';

      recognition.onstart = () => setIsDictating(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      recognition.onerror = () => setIsDictating(false);
      recognition.onend = () => setIsDictating(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      showError('Microphone', e?.message || 'Could not start speech recognition.');
      setIsDictating(false);
    }
  };

  // Text-to-Speech Playback for AI Chat replies
  const handlePlayAudio = (msg: ChatMessage) => {
    if (currentlySpeakingId === msg.id) {
      stopSpeech();
      setCurrentlySpeakingId(null);
      return;
    }

    stopSpeech();
    primeSpeechEngine();
    setCurrentlySpeakingId(msg.id);

    speakWithAiAudio(msg.content, {
      voiceName: selectedVoice,
      lang: LANG_CODE[languageMode],
      voiceProvider: 'auto',
      onStart: () => setCurrentlySpeakingId(msg.id),
      onEnd: () => setCurrentlySpeakingId(null),
      onError: () => setCurrentlySpeakingId(null),
    });
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChatHistory = () => {
    stopSpeech();
    setChatMessages([]);
    localStorage.removeItem(STORAGE_KEYS.chatHistory);
    showSuccess('Chat Cleared', 'Conversation history has been reset.');
  };

  // Settings helpers
  const handleVoiceSelect = (voice: GeminiVoice) => {
    setSelectedVoice(voice);
    try { localStorage.setItem(STORAGE_KEYS.selectedVoice, voice); } catch { /* noop */ }
  };

  const handleLanguageSelect = (lang: LanguageMode) => {
    setLanguageMode(lang);
    try { localStorage.setItem(STORAGE_KEYS.languageMode, lang); } catch { /* noop */ }
  };

  const isCallActive = callState !== 'idle';
  const activeVolume = callState === 'gemini_speaking' && !isSpeakerMuted ? geminiVolume : isMicMuted ? 0 : micVolume;
  const orbScale = 1 + activeVolume * 0.35;

  /* =======================================================================
     RENDER
     ======================================================================= */
  return (
    <div className="flex h-[calc(100vh-4.5rem)] w-full flex-col overflow-hidden bg-slate-50 font-sans text-slate-800">
      {/* ============================ HEADER ============================ */}
      <header className="relative z-20 flex shrink-0 items-center justify-between border-b border-slate-200/90 bg-white/95 px-6 py-3.5 shadow-xs backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 p-0.5 shadow-sm shadow-indigo-500/20">
            <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-white">
              <Sparkles className="h-5 w-5 text-indigo-600" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold tracking-wide text-slate-900">
                AI OPERATIONS ASSISTANT
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live ERP Sync
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500">
              Interactive ERP Business Intelligence · Gemini Flash & Full-Duplex Voice
            </p>
          </div>
        </div>

        {/* Workspace Mode Switcher */}
        <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200/80">
          <button
            onClick={() => {
              if (isCallActive) endLiveCall();
              setActiveTab('chat');
            }}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition ${
              activeTab === 'chat'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Chat & Insights</span>
          </button>
          <button
            onClick={() => setActiveTab('live_call')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition ${
              activeTab === 'live_call'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>Live Voice Call</span>
            {isCallActive && (
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            )}
          </button>
        </div>

        {/* Quick Settings & Actions */}
        <div className="flex items-center gap-2">
          {activeTab === 'live_call' && isCallActive && (
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono">{formatDuration(callDuration)}</span>
              {latencyMs !== null && (
                <span className="text-[10px] text-slate-500 font-mono">({latencyMs}ms)</span>
              )}
            </div>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:border-slate-300"
            title="Voice & Language Settings"
          >
            <Headphones className="h-3.5 w-3.5 text-indigo-600" />
            <span>{selectedVoice}</span>
            <span className="text-slate-300">|</span>
            <span className="capitalize text-slate-500">{languageMode}</span>
          </button>

          <button
            onClick={() => setIsHistoryOpen(true)}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300"
            title="Session History"
            aria-label="Session History"
          >
            <History className="h-4 w-4" />
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ============================ MAIN WORKSPACE ============================ */}
      {activeTab === 'chat' ? (
        /* ------------------ TAB 1: EXECUTIVE CHAT WORKSPACE ------------------ */
        <main className="relative flex flex-1 flex-col overflow-hidden bg-slate-50">
          {/* Quick Prompts Ribbon */}
          <div className="shrink-0 border-b border-slate-200/80 bg-white px-6 py-2.5">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                Quick Inquiries:
              </span>
              {QUICK_PROMPTS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendChat(p.query)}
                  disabled={isChatSending}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 active:scale-95 disabled:opacity-50"
                >
                  <p.icon className="h-3.5 w-3.5 text-indigo-500" />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Conversation Stream */}
          <div
            ref={chatScrollRef}
            className="flex-1 space-y-4 overflow-y-auto px-6 py-6"
          >
            {chatMessages.length === 0 ? (
              <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 shadow-sm">
                  <Bot className="h-8 w-8 text-indigo-600" />
                </div>
                <h2 className="text-xl font-black text-slate-900">
                  How can I help with your ERP operations today?
                </h2>
                <p className="mt-2 max-w-md text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Ask me in natural <strong>Hindi</strong>, <strong>Hinglish</strong>, or <strong>English</strong>.
                  I am connected directly to your live sales invoices, stock godowns, customer dues, and delivery trips.
                </p>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left">
                  {QUICK_PROMPTS.slice(0, 4).map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendChat(p.query)}
                      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-3.5 text-xs shadow-xs transition hover:border-indigo-300 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-2 font-bold text-slate-900 group-hover:text-indigo-600">
                        <p.icon className="h-4 w-4 text-indigo-500" />
                        <span>{p.label}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                        {p.query}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex max-w-[85%] sm:max-w-[75%] items-start gap-3 ${
                      msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border border-slate-200 text-indigo-600'
                      }`}
                    >
                      {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>

                    {/* Bubble */}
                    <div
                      className={`group relative rounded-2xl p-4 shadow-xs ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-tr-none'
                          : 'bg-white border border-slate-200/90 rounded-tl-none'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <>
                          <FormattedMessageText content={msg.content} />

                          {/* Toolbar for Assistant */}
                          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                            <span className="font-mono text-[10px] text-slate-400">
                              {msg.timestamp}
                            </span>

                            <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition">
                              <button
                                onClick={() => handlePlayAudio(msg)}
                                className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold transition ${
                                  currentlySpeakingId === msg.id
                                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                                    : 'hover:bg-slate-100 text-slate-600'
                                }`}
                                title={currentlySpeakingId === msg.id ? 'Stop Playing' : 'Listen with Audio'}
                              >
                                {currentlySpeakingId === msg.id ? (
                                  <>
                                    <Square className="h-3 w-3 fill-indigo-600" />
                                    <span>Stop</span>
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="h-3 w-3" />
                                    <span>Listen</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => handleCopyText(msg.id, msg.content)}
                                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-slate-100 text-slate-600 transition"
                                title="Copy text"
                              >
                                {copiedId === msg.id ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div>
                          <p className="text-xs sm:text-sm font-medium leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                          <span className="block mt-1 text-right font-mono text-[10px] text-indigo-200">
                            {msg.timestamp}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {isChatSending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-slate-200 text-indigo-600 shadow-xs">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-none border border-slate-200/90 bg-white px-4 py-3 shadow-xs">
                    <Sparkles className="h-4 w-4 text-indigo-600 animate-spin" />
                    <span className="text-xs font-semibold text-slate-500">
                      Querying live ERP records & generating insight...
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Bottom Input Bar */}
          <footer className="shrink-0 border-t border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="mx-auto max-w-4xl space-y-2">
              <div className="flex items-center justify-between text-xs px-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Agent Persona:
                  </span>
                  <select
                    value={agentRole}
                    onChange={(e) => setAgentRole(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500"
                  >
                    <option value="general_operations">General ERP Intelligence (Anya)</option>
                    <option value="inventory_auditor">WMS Inventory & Cycle Auditor</option>
                    <option value="reorder_specialist">Purchasing & Restock Specialist</option>
                    <option value="dispatch_coordinator">Logistics & Route Coordinator</option>
                  </select>
                </div>

                {chatMessages.length > 0 && (
                  <button
                    onClick={clearChatHistory}
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 transition"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Clear Chat</span>
                  </button>
                )}
              </div>

              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChat();
                      }
                    }}
                    placeholder="Ask about today's sales, low stock, customer orders, pending deliveries..."
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 pr-24 text-sm text-slate-900 placeholder:text-slate-400 shadow-xs outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                  />

                  {/* Dictation Mic Button */}
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleDictation}
                      className={`grid h-8 w-8 place-items-center rounded-xl transition ${
                        isDictating
                          ? 'bg-rose-500 text-white animate-pulse shadow-xs'
                          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                      title={isDictating ? 'Stop Recording' : 'Voice Dictation'}
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSendChat()}
                  disabled={!inputText.trim() || isChatSending}
                  className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-xs transition hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
            </div>
          </footer>
        </main>
      ) : (
        /* ------------------ TAB 2: LIVE VOICE CALL WORKSPACE ------------------ */
        <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-slate-50 px-4 py-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_70%_at_50%_40%,rgba(99,102,241,0.06),transparent_80%)]" />

          {/* Central Animated Voice Orb */}
          <div className="relative my-auto flex items-center justify-center">
            {/* Outer Ring */}
            <div
              style={{
                transform: `scale(${orbScale * 1.35})`,
                opacity: isCallActive ? (callState === 'gemini_speaking' ? 0.35 : 0.2) : 0.08,
              }}
              className="pointer-events-none absolute h-72 w-72 rounded-full border border-indigo-200 bg-gradient-to-tr from-indigo-100/60 via-purple-100/40 to-sky-100/60 transition-transform duration-100 ease-out sm:h-96 sm:w-96"
            />

            {/* Middle Ring */}
            <div
              style={{
                transform: `scale(${orbScale * 1.18})`,
                opacity: isCallActive ? (callState === 'gemini_speaking' ? 0.5 : 0.3) : 0.12,
              }}
              className="pointer-events-none absolute h-60 w-60 rounded-full border border-sky-300 bg-gradient-to-br from-sky-100/70 via-indigo-100/80 to-purple-100/70 transition-transform duration-100 ease-out sm:h-80 sm:w-80"
            />

            {/* Center Interactive Sphere */}
            <div
              style={{ transform: `scale(${orbScale})` }}
              className={`relative flex h-36 w-36 items-center justify-center rounded-full shadow-xl transition-all duration-75 ease-out sm:h-48 sm:w-48 ${
                isCallActive
                  ? callState === 'gemini_speaking'
                    ? 'bg-gradient-to-br from-indigo-600 via-purple-600 to-sky-500 shadow-indigo-500/30'
                    : callState === 'user_speaking'
                    ? 'animate-pulse bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 shadow-emerald-500/30'
                    : callState === 'thinking'
                    ? 'bg-gradient-to-br from-amber-500 via-indigo-600 to-purple-700 shadow-amber-500/30'
                    : callState === 'interrupted'
                    ? 'bg-gradient-to-br from-rose-500 via-pink-600 to-amber-500 shadow-rose-500/30'
                    : callState === 'muted'
                    ? 'bg-gradient-to-br from-rose-600 to-slate-800 shadow-rose-500/20'
                    : 'bg-gradient-to-br from-indigo-500 via-indigo-600 to-sky-600 shadow-indigo-500/25'
                  : 'border-2 border-indigo-100 bg-gradient-to-br from-white via-indigo-50 to-slate-100 shadow-indigo-500/10'
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-1.5 text-white">
                {isCallActive ? (
                  callState === 'gemini_speaking' ? (
                    <Volume2 className="h-10 w-10 animate-pulse text-white sm:h-12 sm:w-12" />
                  ) : callState === 'user_speaking' ? (
                    <Mic className="h-10 w-10 animate-bounce text-white sm:h-12 sm:w-12" />
                  ) : callState === 'thinking' ? (
                    <Sparkles className="h-10 w-10 animate-spin text-white sm:h-12 sm:w-12" />
                  ) : callState === 'interrupted' ? (
                    <Zap className="h-10 w-10 animate-pulse text-white sm:h-12 sm:w-12" />
                  ) : callState === 'muted' ? (
                    <MicOff className="h-10 w-10 text-white sm:h-12 sm:w-12" />
                  ) : (
                    <Activity className="h-10 w-10 animate-pulse text-emerald-200 sm:h-12 sm:w-12" />
                  )
                ) : (
                  <PhoneCall className="h-10 w-10 text-indigo-600 sm:h-12 sm:w-12" />
                )}
              </div>
            </div>
          </div>

          {/* Equalizer Spectrum Bars */}
          <div className="mt-8 flex h-12 items-center justify-center gap-1.5">
            {frequencyBars.map((height, idx) => (
              <div
                key={idx}
                style={{ height: `${height}%` }}
                className={`w-1.5 rounded-full transition-all duration-75 ${
                  isCallActive
                    ? callState === 'gemini_speaking'
                      ? 'bg-gradient-to-t from-indigo-600 to-violet-400'
                      : callState === 'user_speaking'
                      ? 'bg-gradient-to-t from-emerald-500 to-teal-400'
                      : 'bg-gradient-to-t from-indigo-500 to-sky-400'
                    : 'bg-slate-200'
                }`}
              />
            ))}
          </div>

          {/* Barge-in Stop Button */}
          {callState === 'gemini_speaking' && (
            <div className="mt-4 flex items-center justify-center">
              <button
                onClick={() => {
                  engineRef.current?.flushPlayback();
                  updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
                }}
                className="flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-100 hover:scale-105 active:scale-95"
              >
                <Square className="h-3.5 w-3.5 fill-rose-600 text-rose-600" />
                <span>Stop Speaking</span>
              </button>
            </div>
          )}

          {/* Live Synchronized Transcript Ticker */}
          <div className="mt-6 w-full max-w-2xl px-4">
            {currentTurn ? (
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm text-center">
                <div className="mb-2 flex items-center justify-center gap-2">
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      currentTurn.speaker === 'gemini' ? 'text-indigo-600' : 'text-emerald-600'
                    }`}
                  >
                    {currentTurn.speaker === 'gemini' ? `Gemini Live (${selectedVoice})` : 'You'}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                  <span className="font-mono text-[10px] text-slate-400">Live Transcript</span>
                </div>
                <p className="text-base font-semibold leading-relaxed text-slate-900 sm:text-lg">
                  "{currentTurn.text}"
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 text-center text-xs sm:text-sm text-slate-500 shadow-xs">
                {isCallActive
                  ? 'Speak naturally — Gemini listens in real time. Talk over it anytime to interrupt (server barge-in enabled).'
                  : 'Start a live call for instant, full-duplex conversational voice with Gemini and live ERP synchronization.'}
              </div>
            )}
          </div>

          {/* Floating Call Action Controls */}
          <footer className="mt-8 flex items-center justify-center gap-6">
            <button
              onClick={toggleMic}
              disabled={!isCallActive}
              className={`flex h-13 w-13 items-center justify-center rounded-full border transition-all shadow-md ${
                !isCallActive
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : isMicMuted
                  ? 'border-rose-400 bg-rose-50 text-rose-600 hover:bg-rose-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              aria-pressed={isMicMuted}
            >
              {isMicMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>

            {!isCallActive ? (
              <button
                onClick={startLiveCall}
                className="group flex items-center gap-3.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-4 text-base font-bold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:scale-105 active:scale-95"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                  <PhoneCall className="h-4 w-4 text-white transition-transform group-hover:rotate-12" />
                </div>
                <span>Start Live Call</span>
              </button>
            ) : (
              <button
                onClick={endLiveCall}
                className="group flex items-center gap-3.5 rounded-full bg-gradient-to-r from-rose-600 to-red-600 px-8 py-4 text-base font-bold text-white shadow-lg shadow-rose-600/30 transition-all duration-200 hover:scale-105 active:scale-95"
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
              className={`flex h-13 w-13 items-center justify-center rounded-full border transition-all shadow-md ${
                !isCallActive
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : isSpeakerMuted
                  ? 'border-amber-400 bg-amber-50 text-amber-600 hover:bg-amber-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              title={isSpeakerMuted ? 'Unmute Speaker' : 'Mute Speaker'}
              aria-pressed={isSpeakerMuted}
            >
              {isSpeakerMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          </footer>
        </main>
      )}

      {/* ============================ SETTINGS MODAL ============================ */}
      {isSettingsOpen && (
        <ModalShell onClose={() => setIsSettingsOpen(false)}>
          <div
            className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-2xl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <Sliders className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">AI Assistant Settings</h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 pt-5">
              {/* Voice Persona Selector */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Voice Persona
                </label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {VOICE_OPTIONS.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => handleVoiceSelect(v.id)}
                      disabled={isCallActive}
                      className={`flex flex-col rounded-xl border p-3 text-left transition ${
                        selectedVoice === v.id
                          ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 ring-1 ring-indigo-600'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">{v.name}</span>
                        {selectedVoice === v.id && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">{v.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Language Selector */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Spoken Language
                </label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['hinglish', 'hindi', 'english'] as LanguageMode[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => handleLanguageSelect(lang)}
                      disabled={isCallActive}
                      className={`rounded-xl border py-2.5 text-xs font-bold capitalize transition disabled:opacity-50 ${
                        languageMode === lang
                          ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              {/* Speaker Echo Guard */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <div>
                      <span className="text-xs font-bold text-slate-900">Echo Bleed Protection</span>
                      <p className="text-[11px] text-slate-500">
                        Prevents speaker loop during continuous microphone conversations
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={echoIsolationMode}
                    disabled={isCallActive}
                    onClick={() => {
                      const next = !echoIsolationMode;
                      setEchoIsolationMode(next);
                      try { localStorage.setItem(STORAGE_KEYS.echoIsolation, String(next)); } catch { /* noop */ }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${
                      echoIsolationMode ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${
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
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-500"
              >
                Save & Close
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ============================ HISTORY MODAL ============================ */}
      {isHistoryOpen && (
        <ModalShell onClose={() => setIsHistoryOpen(false)}>
          <div
            className="relative flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <History className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Call Transcript History</h3>
              </div>
              <div className="flex items-center gap-2">
                {recentSessions.length > 0 && (
                  <button
                    onClick={() => {
                      setRecentSessions([]);
                      localStorage.removeItem(STORAGE_KEYS.sessions);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                  >
                    <Trash2 className="h-3 w-3" /> Clear
                  </button>
                )}
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {recentSessions.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-center text-slate-400">
                  <Headphones className="mb-2 h-10 w-10 text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">No recorded call sessions yet</p>
                  <p className="mt-1 text-xs text-slate-400">Start a live voice call to record your first dialogue transcript.</p>
                </div>
              ) : (
                recentSessions.map((session) => (
                  <div key={session.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-indigo-600" />
                        <span className="text-xs font-bold text-slate-800">{session.startedAt}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700">
                          {formatDuration(session.durationSeconds)}
                        </span>
                        <span className="rounded bg-slate-200/70 px-2 py-0.5 text-[10px] font-semibold text-slate-600 capitalize">
                          {session.voice} · {session.language}
                        </span>
                      </div>
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                      {session.turns.map((turn, idx) => (
                        <div key={idx} className="text-xs">
                          <span
                            className={`mr-1.5 font-bold ${
                              turn.speaker === 'gemini' ? 'text-indigo-600' : 'text-slate-900'
                            }`}
                          >
                            {turn.speaker === 'gemini' ? 'Anya:' : 'You:'}
                          </span>
                          <span className="text-slate-700">{turn.text}</span>
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
