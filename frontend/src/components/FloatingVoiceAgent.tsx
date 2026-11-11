// src/components/FloatingVoiceAgent.tsx
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
} from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  StopCircle,
  AlertCircle,
  Settings2,
  RotateCcw,
  Play,
  Radio,
} from 'lucide-react';
import { apiClient } from '../api';
import { useAuthStore } from '../store/auth';
import {
  speakWithAiAudio,
  stopSpeech,
  primeSpeechEngine,
  isSpeechSynthesisSupported,
} from '../utils/audioSpeech';

/* ------------------------------------------------------------------ */
/* Types & Constants                                                  */
/* ------------------------------------------------------------------ */

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface SpokenTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface AgentPosition {
  right: number;
  bottom: number;
}

const AGENT_POSITION_KEY = 'raptor_voice_agent_position_v3';

const QUICK_VOICE_QUERIES = [
  "What is our today's total sales summary?",
  "Are there any low stock products to reorder?",
  "Show me pending customer orders",
  "What is our net revenue this month?",
];

const VOICE_PERSONAS = [
  { id: 'Aoede', name: 'Aoede', tone: 'Warm & Professional Female' },
  { id: 'Kore', name: 'Kore', tone: 'Clear & Analytical Female' },
  { id: 'Fenrir', name: 'Fenrir', tone: 'Direct & Authoritative Male' },
  { id: 'Puck', name: 'Puck', tone: 'Energetic & Friendly Male' },
];

function clampPosition(
  pos: AgentPosition,
  windowW: number,
  windowH: number,
  panelW = 380,
  panelH = 540
): AgentPosition {
  const margin = 16;
  const maxRight = Math.max(margin, windowW - panelW - margin);
  const maxBottom = Math.max(margin, windowH - panelH - margin);
  return {
    right: Math.max(margin, Math.min(maxRight, pos.right)),
    bottom: Math.max(margin, Math.min(maxBottom, pos.bottom)),
  };
}

/* ------------------------------------------------------------------ */
/* Waveform Visualizer Component                                      */
/* ------------------------------------------------------------------ */

const LiveWaveVisualizer = memo(function LiveWaveVisualizer({
  voiceState,
  isMuted,
}: {
  voiceState: VoiceState;
  isMuted: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let phase = 0;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const numBars = 28;
      const barWidth = 3;
      const gap = (w - numBars * barWidth) / (numBars - 1);
      phase += 0.08;

      for (let i = 0; i < numBars; i++) {
        let heightMultiplier = 0.12;

        if (!isMuted) {
          if (voiceState === 'listening') {
            heightMultiplier = 0.2 + Math.abs(Math.sin(phase * 1.5 + i * 0.45)) * 0.75;
          } else if (voiceState === 'speaking') {
            heightMultiplier = 0.25 + Math.abs(Math.cos(phase * 2.2 + i * 0.35)) * 0.75;
          } else if (voiceState === 'thinking') {
            heightMultiplier = 0.15 + Math.abs(Math.sin(phase * 0.8 + i * 0.2)) * 0.4;
          }
        }

        const barHeight = Math.max(4, h * heightMultiplier);
        const x = i * (barWidth + gap);
        const y = (h - barHeight) / 2;

        // Gradient coloring based on state
        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isMuted) {
          grad.addColorStop(0, '#f59e0b');
          grad.addColorStop(1, '#b45309');
        } else if (voiceState === 'listening') {
          grad.addColorStop(0, '#10b981');
          grad.addColorStop(1, '#059669');
        } else if (voiceState === 'speaking') {
          grad.addColorStop(0, '#38bdf8');
          grad.addColorStop(1, '#6366f1');
        } else if (voiceState === 'thinking') {
          grad.addColorStop(0, '#818cf8');
          grad.addColorStop(1, '#c084fc');
        } else {
          grad.addColorStop(0, '#94a3b8');
          grad.addColorStop(1, '#64748b');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [voiceState, isMuted]);

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={36}
      className="mx-auto block h-9 w-60 opacity-90"
    />
  );
});

/* ------------------------------------------------------------------ */
/* Main Floating Voice Agent Component                                */
/* ------------------------------------------------------------------ */

export function FloatingVoiceAgent() {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loadingUser = useAuthStore((state) => state.loadingUser);

  const [isOpen, setIsOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [handsFree, setHandsFree] = useState(true);
  const [voicePersona, setVoicePersona] = useState('Aoede');
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [lastAgentReply, setLastAgentReply] = useState('');
  const [turns, setTurns] = useState<SpokenTurn[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [position, setPosition] = useState<AgentPosition>(() => {
    try {
      const stored = window.localStorage.getItem(AGENT_POSITION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AgentPosition;
        if (Number.isFinite(parsed.right) && Number.isFinite(parsed.bottom)) return parsed;
      }
    } catch { /* ignore */ }
    return { right: 24, bottom: 24 };
  });

  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const handsFreeRef = useRef(true);
  const silenceTimerRef = useRef<number | null>(null);
  const accumulatedSpeechRef = useRef('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const turnsEndRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    right: number;
    bottom: number;
    moved: boolean;
  } | null>(null);

  const canUseVoice = isAuthenticated && !loadingUser && hasPermission('chat with ai assistant');

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    if (showHistory && turnsEndRef.current) {
      try {
        turnsEndRef.current.scrollIntoView({ behavior: 'smooth' });
      } catch { /* ignore */ }
    }
  }, [turns, showHistory]);

  /* Stop all speech & synthesis */
  const handleStopAll = useCallback(() => {
    stopSpeech();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    isListeningRef.current = false;
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setVoiceState('idle');
  }, []);

  /* Speak agent reply via Cloud TTS (ElevenLabs or Gemini Native TTS) */
  const speakReply = useCallback(
    (textToSpeak: string, onDone?: () => void) => {
      if (!textToSpeak) {
        onDone?.();
        return;
      }

      primeSpeechEngine();
      setVoiceState('speaking');

      void speakWithAiAudio(textToSpeak, {
        apiClient,
        voiceName: voicePersona,
        onStart: () => {
          setVoiceState('speaking');
        },
        onEnd: () => {
          setVoiceState('idle');
          onDone?.();
        },
        onError: () => {
          setVoiceState('idle');
          onDone?.();
        },
      });
    },
    [voicePersona]
  );

  /* Send voice turn to backend Gemini AI */
  const processVoiceTurn = useCallback(
    async (spokenQuery: string) => {
      const clean = spokenQuery.trim();
      if (!clean) return;

      handleStopAll();
      setErrorMessage(null);
      setVoiceState('thinking');
      setCurrentTranscript(clean);

      // Append user turn
      const userTurn: SpokenTurn = {
        id: String(Date.now()),
        role: 'user',
        text: clean,
        timestamp: Date.now(),
      };
      setTurns((prev) => [...prev, userTurn]);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Build history context for natural two-way conversation
        const recentTurns = turns.slice(-6).map((t) => ({
          role: t.role,
          text: t.text,
        }));

        const res: any = await apiClient.geminiChat(clean, recentTurns);

        if (controller.signal.aborted) return;

        const rawReply =
          res?.response ||
          res?.data?.response ||
          res?.reply ||
          res?.message ||
          'I checked your ERP records, but received no response.';

        // Strip markdown internal tags
        const cleanReply = rawReply
          .replace(/FOLLOW_UP:.+/gi, '')
          .replace(/[*#_`>]/g, '')
          .trim();

        setLastAgentReply(cleanReply);

        const assistantTurn: SpokenTurn = {
          id: String(Date.now() + 1),
          role: 'assistant',
          text: cleanReply,
          timestamp: Date.now(),
        };
        setTurns((prev) => [...prev, assistantTurn]);

        // Speak the response through device speakers
        speakReply(cleanReply, () => {
          // If hands-free mode is on and mic is not muted, continue listening!
          if (handsFreeRef.current && !isMuted) {
            window.setTimeout(() => {
              startListeningSession();
            }, 500);
          }
        });
      } catch (err: any) {
        if (controller.signal.aborted) return;
        const msg = err?.response?.data?.message || err?.message || 'Voice connection failed.';
        setErrorMessage(msg);
        setVoiceState('idle');
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [turns, speakReply, isMuted, handleStopAll]
  );

  /* Start microphone listening session */
  const startListeningSession = useCallback(() => {
    if (!canUseVoice || isMuted) return;

    primeSpeechEngine();
    handleStopAll();

    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SR) {
      setErrorMessage('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      accumulatedSpeechRef.current = '';
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      rec.onresult = (event: any) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += (event.results[i][0]?.transcript || '') + ' ';
        }
        const text = fullTranscript.trim();
        if (text) {
          accumulatedSpeechRef.current = text;
          setCurrentTranscript(text);

          // Adaptive silence debounce: 1200ms of silence sends the speech
          if (silenceTimerRef.current) {
            window.clearTimeout(silenceTimerRef.current);
          }
          silenceTimerRef.current = window.setTimeout(() => {
            const query = accumulatedSpeechRef.current.trim();
            if (query) {
              accumulatedSpeechRef.current = '';
              try { rec.stop(); } catch { /* ignore */ }
              isListeningRef.current = false;
              void processVoiceTurn(query);
            }
          }, 1200);
        }
      };

      rec.onerror = (e: any) => {
        if (e?.error === 'not-allowed') {
          setErrorMessage('Microphone blocked. Please grant access in browser permissions.');
        }
        isListeningRef.current = false;
        setVoiceState('idle');
      };

      rec.onend = () => {
        isListeningRef.current = false;
        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        const leftover = accumulatedSpeechRef.current.trim();
        if (leftover) {
          accumulatedSpeechRef.current = '';
          void processVoiceTurn(leftover);
        } else if (voiceState === 'listening') {
          setVoiceState('idle');
        }
      };

      recognitionRef.current = rec;
      rec.start();
      isListeningRef.current = true;
      setVoiceState('listening');
    } catch {
      isListeningRef.current = false;
      setVoiceState('idle');
    }
  }, [canUseVoice, isMuted, handleStopAll, processVoiceTurn, voiceState]);

  /* Open / Close handling */
  const toggleAgent = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        primeSpeechEngine();
        window.setTimeout(() => {
          startListeningSession();
        }, 300);
      } else {
        handleStopAll();
      }
      return next;
    });
  }, [startListeningSession, handleStopAll]);

  if (!canUseVoice) return null;

  return (
    <div
      ref={panelRef}
      style={{ right: position.right, bottom: position.bottom }}
      className="fixed z-50 select-none font-sans"
    >
      {/* ----------------- EXPANDED LIVE VOICE AGENT ----------------- */}
      {isOpen && (
        <section
          role="dialog"
          aria-label="Live Voice Agent"
          className="relative mb-3 flex w-[370px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 text-slate-800 shadow-2xl ring-1 ring-slate-900/5 backdrop-blur-xl sm:w-[390px]"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                    voiceState === 'listening'
                      ? 'bg-emerald-400'
                      : voiceState === 'speaking'
                      ? 'bg-sky-400'
                      : voiceState === 'thinking'
                      ? 'bg-indigo-400'
                      : 'bg-slate-300'
                  }`}
                />
                <span
                  className={`relative inline-flex h-3 w-3 rounded-full ${
                    voiceState === 'listening'
                      ? 'bg-emerald-500'
                      : voiceState === 'speaking'
                      ? 'bg-sky-500'
                      : voiceState === 'thinking'
                      ? 'bg-indigo-500'
                      : 'bg-slate-400'
                  }`}
                />
              </span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Raptor Live Voice Agent
                </h3>
                <p className="text-[10px] text-slate-500 font-medium">
                  {voiceState === 'listening'
                    ? 'Listening to you…'
                    : voiceState === 'speaking'
                    ? 'Agent is speaking…'
                    : voiceState === 'thinking'
                    ? 'Thinking with ERP…'
                    : 'Ready for conversation'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                className={`grid h-8 w-8 place-items-center rounded-xl transition ${
                  showSettings ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                }`}
                title="Voice Persona Settings"
              >
                <Settings2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setShowHistory((h) => !h)}
                className={`grid h-8 w-8 place-items-center rounded-xl transition ${
                  showHistory ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                }`}
                title="Conversation Subtitles History"
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  handleStopAll();
                }}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                title="Minimize Agent"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Settings Drawer */}
          {showSettings && (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  Voice Persona
                </label>
                <select
                  value={voicePersona}
                  onChange={(e) => setVoicePersona(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none shadow-xs"
                >
                  {VOICE_PERSONAS.map((p) => (
                    <option key={p.id} value={p.id} className="bg-white text-slate-800">
                      {p.name} ({p.tone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  Hands-Free Loop
                </span>
                <button
                  type="button"
                  onClick={() => setHandsFree((h) => !h)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                    handsFree ? 'bg-emerald-600 text-white shadow-emerald-500/25 shadow-xs' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {handsFree ? 'Continuous ON' : 'Push-To-Talk'}
                </button>
              </div>
            </div>
          )}

          {/* Subtitles / Spoken History Drawer */}
          {showHistory ? (
            <div className="my-4 max-h-56 space-y-2.5 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Spoken Dialogue History
              </p>
              {turns.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">
                  No spoken turns yet. Speak into the microphone to begin.
                </p>
              ) : (
                turns.map((t) => (
                  <div
                    key={t.id}
                    className={`rounded-xl p-2.5 text-xs ${
                      t.role === 'user'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border border-indigo-200 bg-indigo-50 text-indigo-900'
                    }`}
                  >
                    <span className="block text-[9px] font-bold uppercase tracking-wider opacity-70">
                      {t.role === 'user' ? 'You Spoke' : `Agent (${voicePersona})`}
                    </span>
                    <p className="mt-0.5 leading-relaxed font-medium">{t.text}</p>
                  </div>
                ))
              )}
              <div ref={turnsEndRef} />
            </div>
          ) : (
            /* Live Interactive Voice Orb / Centerpiece */
            <div className="my-5 flex flex-col items-center justify-center">
              {/* Animated Glowing Orb */}
              <div className="relative flex items-center justify-center my-3">
                <span
                  className={`absolute -inset-4 rounded-full blur-xl transition-all duration-500 ${
                    voiceState === 'listening'
                      ? 'bg-emerald-500/20 scale-125'
                      : voiceState === 'speaking'
                      ? 'bg-indigo-500/25 scale-125'
                      : voiceState === 'thinking'
                      ? 'bg-amber-500/20 animate-pulse'
                      : 'bg-indigo-500/10 scale-100'
                  }`}
                />

                <button
                  type="button"
                  onClick={() => {
                    if (voiceState === 'speaking') {
                      handleStopAll();
                    } else if (voiceState === 'listening') {
                      handleStopAll();
                    } else {
                      startListeningSession();
                    }
                  }}
                  className={`relative flex h-28 w-28 items-center justify-center rounded-full border-2 transition-all duration-300 shadow-xl ${
                    isMuted
                      ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100'
                      : voiceState === 'listening'
                      ? 'border-emerald-400 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30 scale-105'
                      : voiceState === 'speaking'
                      ? 'border-indigo-400 bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 shadow-indigo-500/30 animate-pulse'
                      : voiceState === 'thinking'
                      ? 'border-amber-400 bg-gradient-to-br from-amber-500 via-orange-500 to-indigo-600 animate-spin'
                      : 'border-slate-200 bg-gradient-to-br from-white via-indigo-50/50 to-slate-100 hover:border-indigo-300'
                  }`}
                  title={
                    voiceState === 'speaking'
                      ? 'Tap to Interrupt Speech'
                      : voiceState === 'listening'
                      ? 'Tap to Stop Listening'
                      : 'Tap to Talk'
                  }
                >
                  {isMuted ? (
                    <MicOff size={34} className="text-amber-600" />
                  ) : voiceState === 'speaking' ? (
                    <Volume2 size={36} className="text-white animate-bounce" />
                  ) : voiceState === 'thinking' ? (
                    <Sparkles size={34} className="text-white" />
                  ) : (
                    <Mic size={34} className={voiceState === 'listening' ? 'text-white' : 'text-indigo-600'} />
                  )}
                </button>
              </div>

              {/* Dynamic Soundwave Visualizer */}
              <LiveWaveVisualizer voiceState={voiceState} isMuted={isMuted} />

              {/* Live Subtitle Transcript */}
              <div className="mt-3.5 w-full min-h-[58px] rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                {currentTranscript ? (
                  <p className="text-xs font-semibold text-emerald-800">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider mr-1.5">You:</span>
                    "{currentTranscript}"
                  </p>
                ) : lastAgentReply ? (
                  <p className="text-xs font-medium text-slate-800 line-clamp-2">
                    <span className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider mr-1.5">Agent:</span>
                    "{lastAgentReply}"
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Tap the microphone or speak anytime. Continuous hands-free active.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Quick Voice Suggestions */}
          {!showHistory && (
            <div className="mt-1 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Quick Spoken Inquiries
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_VOICE_QUERIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void processVoiceTurn(q)}
                    disabled={voiceState === 'thinking'}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-2 text-left text-[11px] font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
                  >
                    <Play size={10} className="shrink-0 text-indigo-600" />
                    <span className="truncate">{q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
              <AlertCircle size={14} className="shrink-0 text-rose-500" />
              <span className="flex-1">{errorMessage}</span>
            </div>
          )}

          {/* Bottom Action Controls */}
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                isMuted
                  ? 'bg-amber-50 text-amber-700 border border-amber-300'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
              <span>{isMuted ? 'Muted' : 'Mute Mic'}</span>
            </button>

            {voiceState === 'speaking' ? (
              <button
                type="button"
                onClick={handleStopAll}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/20 px-3.5 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/30 transition shadow-lg shadow-rose-500/20"
              >
                <StopCircle size={14} className="text-rose-400" />
                <span>Interrupt Speech</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (voiceState === 'listening') {
                    handleStopAll();
                  } else {
                    startListeningSession();
                  }
                }}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold text-white transition shadow-lg ${
                  voiceState === 'listening'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/30'
                }`}
              >
                {voiceState === 'listening' ? <MicOff size={14} /> : <Radio size={14} />}
                <span>{voiceState === 'listening' ? 'Stop Listening' : 'Live Voice Call'}</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* ----------------- DRAGGABLE FLOATING LAUNCHER BUTTON ----------------- */}
      <button
        type="button"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startRight: position.right,
            startBottom: position.bottom,
            right: position.right,
            bottom: position.bottom,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - drag.startX;
          const deltaY = event.clientY - drag.startY;
          if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
          drag.moved = true;
          const next = clampPosition(
            { right: drag.startRight - deltaX, bottom: drag.startBottom - deltaY },
            window.innerWidth,
            window.innerHeight
          );
          drag.right = next.right;
          drag.bottom = next.bottom;
          setPosition(next);
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          dragRef.current = null;
          if (drag.moved) {
            suppressClickRef.current = true;
            setPosition({ right: drag.right, bottom: drag.bottom });
            try {
              window.localStorage.setItem(
                AGENT_POSITION_KEY,
                JSON.stringify({ right: drag.right, bottom: drag.bottom })
              );
            } catch { /* ignore */ }
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => { dragRef.current = null; }}
        onClick={toggleAgent}
        className={`group relative flex h-14 touch-none cursor-grab items-center gap-2.5 rounded-full px-5 text-sm font-bold text-white shadow-[0_12px_32px_-8px_rgba(16,185,129,0.55)] transition-all duration-300 active:cursor-grabbing hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400 ${
          voiceState === 'listening'
            ? 'bg-gradient-to-r from-emerald-500 to-teal-600 ring-2 ring-emerald-300 shadow-emerald-500/50'
            : voiceState === 'speaking'
            ? 'bg-gradient-to-r from-sky-500 to-indigo-600 ring-2 ring-sky-300 shadow-sky-500/50'
            : voiceState === 'thinking'
            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-indigo-500/50'
            : isOpen
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 ring-1 ring-white/20'
            : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500'
        }`}
        aria-label={isOpen ? 'Minimize Voice Agent' : 'Open Live Voice Agent'}
      >
        {/* Radar animation pulse when listening or speaking */}
        {(voiceState === 'listening' || voiceState === 'speaking') && (
          <span className="absolute -inset-1.5 rounded-full border border-emerald-400/60 animate-ping pointer-events-none" />
        )}

        {isOpen ? (
          <X size={18} />
        ) : voiceState === 'listening' ? (
          <Radio size={18} className="animate-pulse text-emerald-100" />
        ) : voiceState === 'speaking' ? (
          <Volume2 size={18} className="animate-bounce text-sky-100" />
        ) : (
          <Mic size={18} className="text-white" />
        )}

        <span>
          {isOpen
            ? 'Close Voice Agent'
            : voiceState === 'listening'
            ? 'Listening…'
            : voiceState === 'speaking'
            ? 'Speaking…'
            : 'Live Voice Agent'}
        </span>
      </button>
    </div>
  );
}
