// src/pages/AIAssistantPage.tsx
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  memo,
} from 'react';
import {
  FiSend,
  FiMic,
  FiMicOff,
  FiCpu,
  FiCopy,
  FiCheck,
  FiStopCircle,
  FiVolume2,
  FiVolumeX,
  FiZap,
  FiActivity,
  FiRefreshCw,
  FiBookmark,
  FiPlus,
  FiSmile,
} from 'react-icons/fi';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import { useAuthStore } from '../store/auth';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  stopSpeech,
  primeSpeechEngine,
  isSpeechSynthesisSupported,
  getAvailableVoices,
  speakWithAiAudio,
} from '../utils/audioSpeech';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type AiState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';
export type AnyaEmotion = 'cheerful' | 'laughing' | 'expressive' | 'feisty' | 'thoughtful';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  error?: boolean;
  emotion?: AnyaEmotion;
}

interface StoredState {
  messages: Message[];
  settings: {
    handsFreeMode: boolean;
    autoRead: boolean;
    voiceName: string;
    learningMemory: string;
  };
}

interface ApiErrorLike {
  message?: string;
  backendMessage?: string;
  status?: number;
  response?: { status?: number; data?: { message?: string } };
  name?: string;
}

/* ------------------------------------------------------------------ */
/* Constants & Hindi Prompts                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'raptor_ai_anya_hindi_live_v2';
const HINDI_LOCALE = 'hi-IN';

export const EMOTION_TRIGGERS = [
  { label: '😂 Anya ko Hansao', prompt: 'Anya, koi mazedaar operational joke ya funny baat sunao haha!', mood: 'laughing' },
  { label: '😮 Oh / Ah Reactions', prompt: 'Oh wow! Kya tumne aaj ki top sales aur numbers dekhe?', mood: 'expressive' },
  { label: '😤 Anya ko Chhedo (Angry)', prompt: 'Anya, tum sach mein smart ho ya bas andaza laga rahi ho? Gussa mat hona haha!', mood: 'feisty' },
  { label: '📊 Aaj ki Sales', prompt: 'Anya, aaj ka total sales aur revenue ka hisab batao.', mood: 'business' },
  { label: '⚠️ Low Stock Alert', prompt: 'Anya, kaunse products ka stock critically low hai aur reorder chahiye?', mood: 'urgent' },
  { label: '💰 Net Profit', prompt: 'Anya, is mahine ka net profit aur margin kaisa chal raha hai?', mood: 'profit' },
];

export const VOICE_PERSONAS = [
  { id: 'Aoede', name: 'Anya Hindi (Default)', gender: 'Female', tone: 'Expressive Hindi Tone (Aoede / Hindi Engine)' },
  { id: 'Kore', name: 'Anya Soft Hindi', gender: 'Female', tone: 'Gentle, Warm Hindi Tone (Kore)' },
  { id: 'Puck', name: 'Anya Fast Hindi', gender: 'Female', tone: 'Rapid Turn-Around (Puck)' },
];

export const PRESET_DIRECTIVES = [
  'Currency: Hamesha monetary amounts ko INR ₹ symbol ke sath format karo.',
  'Debtors: Agar kisi customer ka bill > 15 days se pending hai toh alert do.',
  'Inventory: Reorder threshold safety stock minimum 10 units rakhein.',
  'Tone: Anya hamesha natural, lively Hindi / Hinglish tone mein bolti hai with emotions.',
];

/* ------------------------------------------------------------------ */
/* Safe Helpers                                                       */
/* ------------------------------------------------------------------ */

function uid(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function getApiErrorMessage(error: unknown, fallback = 'Kuch galat hua. Kripya dubara koshish karein.'): string {
  if (typeof error === 'object' && error !== null) {
    const err = error as ApiErrorLike;
    const status = err.response?.status ?? err.status;
    const message = err.backendMessage ?? err.response?.data?.message ?? err.message;

    if (typeof message === 'string' && message.trim()) return message;
    if (status === 401) return 'Session samapt ho gaya hai. Dobara login karein.';
    if (status === 403) return 'Permission denied. Kripya credentials verify karein.';
    if (status === 404) return 'AI service nahi mili.';
    if (status === 429) return 'Gemini quota reached. Settings → AI mein jakar key check karein.';
    if (status != null && status >= 500) return 'Server error. Kuch der baad koshish karein.';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function detectAnyaEmotion(text: string): AnyaEmotion {
  const lower = text.toLowerCase();
  if (/haha|hehe|lol|laugh|funny|kamaal|joke|hans/i.test(lower)) return 'laughing';
  if (/oh!|ah!|arrey|achaa|wow|really|omg|bapre|sach/i.test(lower)) return 'expressive';
  if (/patience|mess|anger|teas|angry|how dare|gussa|chhedo|himmat/i.test(lower)) return 'feisty';
  if (/check|analyz|calculate|socho|dekhne do|let me see/i.test(lower)) return 'thoughtful';
  return 'cheerful';
}

function loadStoredState(): StoredState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredState(state: StoredState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal
  }
}

/* ------------------------------------------------------------------ */
/* Subcomponent: Live Audio Waveform Canvas                           */
/* ------------------------------------------------------------------ */

interface AudioWaveformProps {
  aiState: AiState;
  isMuted: boolean;
  emotion: AnyaEmotion;
}

const AudioWaveform = memo(function AudioWaveform({ aiState, isMuted, emotion }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const barCount = 38;

    const render = () => {
      animId = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;
      const now = Date.now();

      ctx.clearRect(0, 0, width, height);
      const barWidth = width / barCount - 2.5;

      for (let i = 0; i < barCount; i++) {
        let normalized = 0.08;

        if (!isMuted) {
          if (aiState === 'speaking') {
            const freq = emotion === 'laughing' ? 90 : emotion === 'feisty' ? 70 : 120;
            normalized = Math.abs(Math.sin(now / freq + i * 0.45)) * 0.85 + 0.15;
          } else if (aiState === 'listening') {
            normalized = Math.abs(Math.sin(now / 160 + i * 0.35)) * 0.6 + 0.15;
          } else if (aiState === 'thinking') {
            normalized = Math.abs(Math.sin(now / 220 + i * 0.2)) * 0.4 + 0.12;
          } else if (aiState === 'interrupted') {
            normalized = 0.05;
          } else {
            normalized = Math.sin(now / 600 + i * 0.25) * 0.08 + 0.12;
          }
        }

        const barHeight = Math.max(4, normalized * (height - 8));
        const x = i * (barWidth + 2.5);
        const y = (height - barHeight) / 2;

        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isMuted) {
          grad.addColorStop(0, '#f59e0b');
          grad.addColorStop(1, '#d97706');
        } else if (aiState === 'listening') {
          grad.addColorStop(0, '#06b6d4');
          grad.addColorStop(1, '#0284c7');
        } else if (aiState === 'speaking') {
          if (emotion === 'laughing') {
            grad.addColorStop(0, '#fbbf24');
            grad.addColorStop(1, '#f59e0b');
          } else if (emotion === 'feisty') {
            grad.addColorStop(0, '#f43f5e');
            grad.addColorStop(1, '#e11d48');
          } else {
            grad.addColorStop(0, '#10b981');
            grad.addColorStop(1, '#059669');
          }
        } else if (aiState === 'thinking') {
          grad.addColorStop(0, '#a855f7');
          grad.addColorStop(1, '#6366f1');
        } else if (aiState === 'interrupted') {
          grad.addColorStop(0, '#f43f5e');
          grad.addColorStop(1, '#e11d48');
        } else {
          grad.addColorStop(0, '#94a3b8');
          grad.addColorStop(1, '#64748b');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [aiState, isMuted, emotion]);

  return (
    <canvas
      ref={canvasRef}
      width={380}
      height={42}
      className="h-10 w-full max-w-[380px] rounded-xl"
    />
  );
});

/* ------------------------------------------------------------------ */
/* Subcomponent: Animated Anya Avatar / Visualizer Orb                */
/* ------------------------------------------------------------------ */

interface AnyaOrbProps {
  aiState: AiState;
  isMuted: boolean;
  emotion: AnyaEmotion;
  onClick?: () => void;
}

const AnyaOrb = memo(function AnyaOrb({
  aiState,
  isMuted,
  emotion,
  onClick,
}: AnyaOrbProps) {
  const getOrbColors = () => {
    if (isMuted) {
      return {
        outer: 'border-amber-400 bg-amber-500/10 shadow-amber-500/30',
        ring: 'border-amber-400/40',
        core: 'from-amber-400 to-orange-500',
        glow: 'rgba(245, 158, 11, 0.45)',
      };
    }
    if (aiState === 'speaking') {
      if (emotion === 'laughing') {
        return {
          outer: 'border-amber-400 bg-amber-500/25 shadow-amber-500/50',
          ring: 'border-amber-300/80',
          core: 'from-amber-400 via-rose-400 to-pink-500',
          glow: 'rgba(251, 191, 36, 0.75)',
        };
      }
      if (emotion === 'feisty') {
        return {
          outer: 'border-rose-400 bg-rose-500/30 shadow-rose-500/60',
          ring: 'border-rose-400/80',
          core: 'from-rose-500 via-red-500 to-orange-600',
          glow: 'rgba(244, 63, 94, 0.8)',
        };
      }
      return {
        outer: 'border-emerald-400 bg-emerald-500/25 shadow-emerald-500/50',
        ring: 'border-emerald-300/80',
        core: 'from-emerald-400 to-teal-600',
        glow: 'rgba(16, 185, 129, 0.75)',
      };
    }
    switch (aiState) {
      case 'listening':
        return {
          outer: 'border-cyan-400 bg-cyan-500/20 shadow-cyan-500/40',
          ring: 'border-cyan-300/70',
          core: 'from-cyan-400 to-blue-600',
          glow: 'rgba(6, 182, 212, 0.65)',
        };
      case 'thinking':
        return {
          outer: 'border-purple-400 bg-purple-500/20 shadow-purple-500/40',
          ring: 'border-purple-300/60',
          core: 'from-purple-500 to-indigo-600',
          glow: 'rgba(168, 85, 247, 0.65)',
        };
      case 'interrupted':
        return {
          outer: 'border-rose-400 bg-rose-500/20 shadow-rose-500/40',
          ring: 'border-rose-300/60',
          core: 'from-rose-500 to-red-600',
          glow: 'rgba(244, 63, 94, 0.5)',
        };
      default:
        return {
          outer: 'border-pink-400/50 bg-pink-500/10 shadow-pink-500/20',
          ring: 'border-pink-400/30',
          core: 'from-pink-500 via-rose-500 to-indigo-600',
          glow: 'rgba(236, 72, 153, 0.4)',
        };
    }
  };

  const colors = getOrbColors();

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={`Anya: ${aiState.toUpperCase()} (${emotion})`}
      className="group relative flex h-36 w-36 cursor-pointer items-center justify-center transition sm:h-44 sm:w-44"
    >
      <div
        className="absolute -inset-4 rounded-full opacity-60 blur-2xl transition-all duration-500 group-hover:opacity-90"
        style={{
          backgroundColor: colors.glow,
          boxShadow: `0 0 60px ${colors.glow}`,
          transform: aiState === 'speaking' || aiState === 'listening' ? 'scale(1.2)' : 'scale(1)',
        }}
      />

      <div
        className={`absolute inset-2 rounded-full border-2 border-dashed ${colors.ring} ${
          aiState === 'thinking' ? 'animate-spin' : aiState === 'speaking' ? 'animate-pulse' : ''
        }`}
        style={{ animationDuration: aiState === 'thinking' ? '4s' : '2s' }}
      />

      <div
        className={`relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br ${colors.core} text-white shadow-2xl transition-all duration-300 group-hover:scale-105 sm:h-32 sm:w-32`}
      >
        {isMuted ? (
          <FiMicOff className="text-3xl text-amber-100" />
        ) : aiState === 'speaking' ? (
          <div className="flex flex-col items-center">
            <FiVolume2 className="animate-bounce text-3xl text-white" />
            <span className="mt-1 text-[10px] font-bold tracking-wider uppercase text-pink-100">
              {emotion === 'laughing' ? 'Haha!' : emotion === 'feisty' ? 'Arrey!' : 'Anya'}
            </span>
          </div>
        ) : aiState === 'thinking' ? (
          <FiCpu className="text-3xl text-white animate-spin" />
        ) : (
          <div className="flex flex-col items-center">
            <FiMic className={`text-3xl ${aiState === 'listening' ? 'text-white' : 'text-pink-100'}`} />
            <span className="mt-1 text-[10px] font-bold tracking-wider uppercase text-pink-100">
              {aiState === 'listening' ? 'Suno...' : 'Anya se Baat Karein'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Main Component: AIAssistantPage                                    */
/* ------------------------------------------------------------------ */

export function AIAssistantPage() {
  const { showSuccess, showError } = useNotification();
  const user = useAuthStore((s) => s.user);

  /* Live State */
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiState, setAiState] = useState<AiState>('idle');
  const [currentEmotion, setCurrentEmotion] = useState<AnyaEmotion>('cheerful');
  const [isTyping, setIsTyping] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [handsFreeMode, setHandsFreeMode] = useState(true);
  const [autoRead, setAutoRead] = useState(true);
  const [voiceName, setVoiceName] = useState('Aoede');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [chatError, setChatError] = useState<{ message: string; isQuota?: boolean } | null>(null);

  /* Learning Memory State */
  const [learningMemory, setLearningMemory] = useState(
    'Currency: Default ₹ INR. Stock: Reorder alert on low quantity. Tone: Natural, lively Hindi/Hinglish tone with emotions & laughter.'
  );
  const [teachInput, setTeachInput] = useState('');
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);

  /* Refs */
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const accumulatedSpeechRef = useRef('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const handsFreeLoopRef = useRef(true);
  const sendMessageRef = useRef<(text?: string) => Promise<void>>(async () => {});

  /* Warm up voice engines */
  useEffect(() => {
    if (isSpeechSynthesisSupported()) {
      getAvailableVoices();
      const onVoices = () => getAvailableVoices();
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
    }
  }, []);

  /* Hydrate state from localStorage */
  useEffect(() => {
    const saved = loadStoredState();
    if (saved) {
      if (saved.messages) setMessages(saved.messages);
      if (saved.settings) {
        setHandsFreeMode(saved.settings.handsFreeMode ?? true);
        setAutoRead(saved.settings.autoRead ?? true);
        setVoiceName(saved.settings.voiceName || 'Aoede');
        if (saved.settings.learningMemory) setLearningMemory(saved.settings.learningMemory);
      }
    }
  }, []);

  /* Persist state */
  useEffect(() => {
    saveStoredState({
      messages: messages.slice(-50),
      settings: {
        handsFreeMode,
        autoRead,
        voiceName,
        learningMemory,
      },
    });
  }, [messages, handsFreeMode, autoRead, voiceName, learningMemory]);

  useEffect(() => {
    handsFreeLoopRef.current = handsFreeMode;
  }, [handsFreeMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, aiState]);

  /* Stop all speech & synthesis */
  const handleStopAll = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    stopSpeech();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    isListeningRef.current = false;
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setIsTyping(false);
    setSpeakingText(null);
    setAiState('interrupted');
    window.setTimeout(() => setAiState('idle'), 400);
  }, []);

  /* Voice Output: Real Audio via Cloud TTS (ElevenLabs or Gemini Native TTS) */
  const speakText = useCallback(
    (textToSpeak: string, onEndCallback?: () => void) => {
      if (!textToSpeak) {
        onEndCallback?.();
        return;
      }

      primeSpeechEngine();
      setSpeakingText(textToSpeak);
      setLiveTranscript(textToSpeak);

      // Detect emotion for Anya
      const emotion = detectAnyaEmotion(textToSpeak);
      setCurrentEmotion(emotion);

      void speakWithAiAudio(textToSpeak, {
        apiClient,
        voiceName,
        lang: HINDI_LOCALE,
        genderPreference: 'female',
        onStart: () => {
          setAiState('speaking');
        },
        onEnd: () => {
          setSpeakingText(null);
          setAiState('idle');
          onEndCallback?.();
        },
        onError: () => {
          setSpeakingText(null);
          setAiState('idle');
          onEndCallback?.();
        },
      });
    },
    [voiceName]
  );

  /* Send conversation turn to Gemini with Learning Memory context */
  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? inputMessage).trim();
      if (!text || isTyping) return;

      primeSpeechEngine();
      setInputMessage('');
      setIsTyping(true);
      setAiState('thinking');
      setChatError(null);

      const userMsg: Message = {
        id: uid(),
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const history = messages
          .filter((m) => !m.error && m.content.trim())
          .slice(-8)
          .map((m) => ({
            role: m.role,
            text: m.content.trim().slice(0, 2000),
          }));

        // Exclusively Hindi tone directive for Anya
        const hindiDirective = `Persona instruction: Your name is Anya. Speak EXCLUSIVELY in a natural, lively, and warm Hindi / Hinglish tone. Use spontaneous human emotions, laughter (Haha!, Hehe!), expressive interjections (Oh!, Ah!, Arrey!, Achaa!, Sach mein?), and playful comical anger if teased (Arrey yaar, mujhe gussa mat dilao haha!). Keep response short (1 to 3 spoken sentences in Hindi) for fast live voice conversation. Never use robotic English formatting.`;
        const activeMemory = [hindiDirective, learningMemory].filter(Boolean).join('\n');

        const res: any = await apiClient.geminiChat(
          text,
          history,
          activeMemory.slice(0, 1800)
        );

        if (controller.signal.aborted) return;

        if (res && res.success === false) {
          throw new Error(res.message || 'Gemini AI ne error diya.');
        }

        const rawReply =
          res?.response ||
          res?.data?.response ||
          res?.reply ||
          res?.message ||
          'Maine ERP records check kiye, lekin koi jawab nahi mila.';

        const cleanReply = rawReply.replace(/FOLLOW_UP:.+/gi, '').trim();
        const emotion = detectAnyaEmotion(cleanReply);
        setCurrentEmotion(emotion);

        const aiMsg: Message = {
          id: uid(),
          role: 'assistant',
          content: cleanReply,
          created_at: new Date().toISOString(),
          emotion,
        };

        setMessages((prev) => [...prev, aiMsg]);
        addAppLog({ module: 'AI Assistant', action: 'Anya Hindi Response', status: 'success', message: cleanReply.slice(0, 60) });

        // Play real voice audio response
        if (autoRead) {
          speakText(cleanReply, () => {
            if (handsFreeLoopRef.current && !isMuted) {
              window.setTimeout(() => startListening(), 400);
            }
          });
        } else {
          setAiState('idle');
        }
      } catch (err: unknown) {
        if ((err as ApiErrorLike)?.name === 'AbortError') return;
        const msg = getApiErrorMessage(err, 'Anya se sampark nahi ho saka.');
        const isQuota = msg.toLowerCase().includes('quota') || msg.includes('429');
        setChatError({ message: msg, isQuota });

        const errorMsg: Message = {
          id: uid(),
          role: 'assistant',
          content: msg,
          created_at: new Date().toISOString(),
          error: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
        setAiState('idle');
      } finally {
        setIsTyping(false);
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
      }
    },
    [inputMessage, isTyping, messages, learningMemory, autoRead, isMuted, speakText]
  );

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  /* Speech Recognition Engine - Dedicated Hindi (hi-IN) */
  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    if (aiState === 'listening') {
      setAiState('idle');
    }
  }, [aiState]);

  const startListening = useCallback(() => {
    if (isMuted) return;

    primeSpeechEngine();
    handleStopAll();
    accumulatedSpeechRef.current = '';

    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SR) {
      showError('Browser Not Supported', 'Voice recognition requires Chrome, Edge or Safari.');
      return;
    }

    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = HINDI_LOCALE;

      rec.onresult = (event: any) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += (event.results[i][0]?.transcript || '') + ' ';
        }
        const text = fullTranscript.trim();
        if (text) {
          accumulatedSpeechRef.current = text;
          setLiveTranscript(text);

          // Fast 900ms silence debounce triggers immediate send to Anya
          if (silenceTimerRef.current) {
            window.clearTimeout(silenceTimerRef.current);
          }
          silenceTimerRef.current = window.setTimeout(() => {
            const query = accumulatedSpeechRef.current.trim();
            if (query) {
              accumulatedSpeechRef.current = '';
              try { rec.stop(); } catch { /* ignore */ }
              isListeningRef.current = false;
              void sendMessageRef.current?.(query);
            }
          }, 900);
        }
      };

      rec.onerror = (e: any) => {
        if (e?.error === 'not-allowed') {
          showError('Microphone Blocked', 'Please grant microphone access in browser settings.');
        }
        isListeningRef.current = false;
        setAiState('idle');
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
          void sendMessageRef.current?.(leftover);
        } else if (aiState === 'listening') {
          setAiState('idle');
        }
      };

      recognitionRef.current = rec;
      rec.start();
      isListeningRef.current = true;
      setAiState('listening');
    } catch {
      isListeningRef.current = false;
      setAiState('idle');
    }
  }, [isMuted, handleStopAll, aiState, showError]);

  const toggleMic = useCallback(() => {
    if (aiState === 'listening') {
      stopListening();
    } else {
      startListening();
    }
  }, [aiState, startListening, stopListening]);

  /* Test Anya Voice - Pure Hindi Greeting */
  const handleTestAnyaVoice = useCallback(() => {
    const greeting = 'Namaste! Main Anya hoon! Haha, kaisa chal raha hai aapka business? Oh, mujhe bataiye aaj main aapki kya madad karoon!';
    speakText(greeting);
  }, [speakText]);

  /* Teach AI new memory directive */
  const handleTeachAi = useCallback(() => {
    const directive = teachInput.trim();
    if (!directive) return;

    setLearningMemory((prev) => {
      const updated = prev.trim() ? `${prev.trim()}\n• ${directive}` : `• ${directive}`;
      return updated.slice(0, 1500);
    });

    setTeachInput('');
    showSuccess('Knowledge Learned', 'Anya ne yeh directive yaad kar li hai.');
  }, [teachInput, showSuccess]);

  const handleClearMemory = useCallback(() => {
    if (!window.confirm('Kya aap Anya ki memory reset karna chahte hain?')) return;
    setLearningMemory('');
    showSuccess('Memory Cleared', 'Anya ki memory reset ho gayi hai.');
  }, [showSuccess]);

  const handleClearConversation = useCallback(() => {
    handleStopAll();
    setMessages([]);
    setLiveTranscript('');
    showSuccess('Conversation Reset', 'Anya ke sath naye sire se baat cheet shuru karein.');
  }, [handleStopAll, showSuccess]);

  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col gap-4 font-sans lg:h-[calc(100vh-6rem)]">
      {/* -------------------- EXECUTIVE ANYA HINDI HEADER -------------------- */}
      <section className="relative overflow-hidden rounded-3xl border border-pink-900/40 bg-gradient-to-r from-slate-950 via-purple-950 to-pink-950 p-5 text-white shadow-xl">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-500/20 px-3 py-0.5 text-[11px] font-bold text-pink-300 ring-1 ring-pink-400/40">
                <span className="h-2 w-2 rounded-full bg-pink-400 animate-pulse" />
                Anya Live Voice AI (Gemini Live)
              </span>
              <Badge variant="outline" className="border-pink-400/30 bg-pink-500/10 text-[10px] text-pink-200">
                🇮🇳 Pure Hindi Tone (हिन्दी / Hinglish)
              </Badge>
              <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-[10px] text-emerald-200">
                Mood: {currentEmotion.toUpperCase()}
              </Badge>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl flex items-center gap-2">
              Anya <span className="text-pink-400 text-lg font-medium">— Live Hindi Voice Conversation</span>
            </h1>
            <p className="text-xs text-slate-300">
              Ultra-fast Hindi voice conversations with laughter, human emotions, and instant operational answers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTestAnyaVoice}
              className="flex items-center gap-1.5 rounded-2xl border border-pink-500/40 bg-pink-600/30 px-3.5 py-2 text-xs font-bold text-pink-100 transition hover:bg-pink-600 hover:text-white shadow-md shadow-pink-900/20"
              title="Test Anya's voice speaking out loud in Hindi"
            >
              <FiVolume2 size={14} className="animate-pulse" />
              <span>Test Anya's Voice</span>
            </button>

            <button
              type="button"
              onClick={() => setShowMemoryPanel((p) => !p)}
              className={`flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-bold transition ${
                showMemoryPanel
                  ? 'border-indigo-400 bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              title="Toggle Anya Learning Memory & Directives"
            >
              <FiBookmark size={14} />
              <span>Learning Memory</span>
            </button>

            <button
              type="button"
              onClick={handleClearConversation}
              className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
              title="Reset conversation"
            >
              <FiRefreshCw size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </section>

      {/* -------------------- MAIN LIVE WORKSPACE -------------------- */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        {/* Left Column: Anya Live Conversational Hub */}
        <Card className="flex min-h-0 flex-col overflow-hidden rounded-3xl border-slate-200 bg-gradient-to-b from-white via-slate-50 to-slate-100 shadow-sm">
          {/* Top Live State Header */}
          <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    aiState === 'listening'
                      ? 'animate-ping bg-cyan-400'
                      : aiState === 'speaking'
                      ? 'animate-ping bg-pink-400'
                      : aiState === 'thinking'
                      ? 'animate-ping bg-purple-400'
                      : 'bg-slate-300'
                  }`}
                />
                <span
                  className={`relative inline-flex h-3 w-3 rounded-full ${
                    aiState === 'listening'
                      ? 'bg-cyan-500'
                      : aiState === 'speaking'
                      ? 'bg-pink-500'
                      : aiState === 'thinking'
                      ? 'bg-purple-500'
                      : 'bg-slate-400'
                  }`}
                />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {aiState === 'listening'
                  ? 'Anya sun rahi hai… boliye'
                  : aiState === 'speaking'
                  ? 'Anya Hindi mein bol rahi hai…'
                  : aiState === 'thinking'
                  ? 'Anya soch rahi hai…'
                  : aiState === 'interrupted'
                  ? 'Ruk gayi'
                  : 'Anya baat karne ke liye taiyar hai'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHandsFreeMode((h) => !h)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition ${
                  handsFreeMode
                    ? 'border border-emerald-300 bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
                title="Continuous hands-free conversation loop"
              >
                <FiActivity size={12} />
                <span>{handsFreeMode ? 'Hands-Free ON' : 'Push-To-Talk'}</span>
              </button>
            </div>
          </div>

          {/* Central Live Anya Cyber Orb & Waveform */}
          <div className="flex flex-col items-center justify-center border-b border-slate-200/60 bg-gradient-to-b from-white to-slate-50/80 px-6 py-5 text-center">
            <AnyaOrb aiState={aiState} isMuted={isMuted} emotion={currentEmotion} onClick={toggleMic} />
            <div className="mt-2">
              <AudioWaveform aiState={aiState} isMuted={isMuted} emotion={currentEmotion} />
            </div>

            {/* Live Subtitle Transcript */}
            <div className="mt-3 w-full max-w-xl rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Live Subtitles &amp; Captions (Hindi)
              </p>
              <p className="mt-0.5 min-h-[36px] text-xs font-semibold text-slate-800">
                {liveTranscript || (
                  <span className="font-normal italic text-slate-400">
                    {aiState === 'listening'
                      ? 'Suno… Hindi ya Hinglish mein kuch bhi puchiye.'
                      : aiState === 'speaking'
                      ? 'Anya bol rahi hai…'
                      : 'Orb ya microphone dabayein aur Anya se Hindi mein baat karein.'}
                  </span>
                )}
              </p>
            </div>

            {/* Control Buttons */}
            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2.5">
              <Button
                onClick={toggleMic}
                className={`h-11 rounded-xl px-5 text-xs font-bold shadow-md transition ${
                  aiState === 'listening'
                    ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-500/30'
                    : 'bg-gradient-to-r from-pink-600 to-rose-600 text-white hover:from-pink-500 hover:to-rose-500 shadow-pink-500/25'
                }`}
              >
                {aiState === 'listening' ? (
                  <>
                    <FiStopCircle className="mr-1.5" size={16} /> Stop Listening
                  </>
                ) : (
                  <>
                    <FiMic className="mr-1.5" size={16} /> Anya se Baat Karein
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={() => setIsMuted((m) => !m)}
                className={`h-11 rounded-xl border-slate-200 px-4 text-xs font-semibold ${
                  isMuted ? 'border-amber-300 bg-amber-50 text-amber-800' : 'bg-white text-slate-700'
                }`}
              >
                {isMuted ? (
                  <>
                    <FiMicOff className="mr-1.5 text-amber-600" size={15} /> Unmute Mic
                  </>
                ) : (
                  <>
                    <FiMic className="mr-1.5 text-slate-500" size={15} /> Mute Mic
                  </>
                )}
              </Button>

              {(aiState === 'speaking' || isTyping) && (
                <Button
                  variant="outline"
                  onClick={handleStopAll}
                  className="h-11 rounded-xl border-rose-200 bg-rose-50 px-4 text-xs font-bold text-rose-700 hover:bg-rose-100"
                >
                  <FiVolumeX className="mr-1.5" size={15} /> Anya ko Roko
                </Button>
              )}
            </div>

            {/* Hindi Emotion Prompts Chips */}
            <div className="mt-4 flex flex-wrap justify-center gap-1.5 max-w-2xl">
              {EMOTION_TRIGGERS.map((et) => (
                <button
                  key={et.label}
                  type="button"
                  onClick={() => void sendMessage(et.prompt)}
                  className="rounded-full border border-pink-100 bg-pink-50/70 px-3 py-1 text-[11px] font-semibold text-pink-900 transition hover:bg-pink-100 hover:border-pink-300 shadow-sm"
                >
                  {et.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation Stream Scroll Area */}
          <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
            {messages.length === 0 && (
              <div className="py-8 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-pink-50 text-pink-600">
                  <FiZap size={22} />
                </div>
                <h4 className="mt-3 text-sm font-bold text-slate-800">
                  Anya ke Sath Hindi mein Baat Cheet Karein
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  Sales, profit, stock ya business ki koi bhi baat puchiye. Anya natural Hindi tone mein jawab deti hai.
                </p>
              </div>
            )}

            {messages.map((m) => {
              const isUser = m.role === 'user';
              const isCurrentPlaying = speakingText === m.content;

              return (
                <div
                  key={m.id}
                  className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-sm">
                      <FiSmile size={15} />
                    </div>
                  )}

                  <div
                    className={`group relative max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-gradient-to-br from-pink-600 to-rose-600 text-white shadow-md shadow-pink-600/20'
                        : m.error
                        ? 'border border-rose-200 bg-rose-50 text-rose-800'
                        : 'border border-slate-200 bg-white text-slate-800 shadow-sm'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>

                    {!isUser && !m.error && (
                      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (isCurrentPlaying) {
                                stopSpeech();
                                setSpeakingText(null);
                                setAiState('idle');
                              } else {
                                speakText(m.content);
                              }
                            }}
                            className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold transition ${
                              isCurrentPlaying
                                ? 'bg-pink-100 text-pink-800'
                                : 'hover:bg-slate-100 hover:text-slate-700'
                            }`}
                          >
                            <FiVolume2 size={11} />
                            <span>{isCurrentPlaying ? 'Stop' : 'Replay Voice'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(m.content);
                              showSuccess('Copied', 'Sandesh copy ho gaya.');
                            }}
                            className="flex items-center gap-1 rounded-md px-2 py-0.5 transition hover:bg-slate-100 hover:text-slate-700"
                          >
                            <FiCopy size={11} />
                            <span>Copy</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Composer */}
          <div className="border-t border-slate-200 bg-white p-3.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={toggleMic}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
                  aiState === 'listening'
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
                title="Anya se Hindi mein bole"
              >
                {aiState === 'listening' ? <FiStopCircle size={18} /> : <FiMic size={18} />}
              </button>

              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Anya se Hindi ya Hinglish mein puchiye..."
                disabled={isTyping}
                className="h-10 flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-500/10"
              />

              <Button
                type="submit"
                disabled={!inputMessage.trim() || isTyping}
                className="h-10 rounded-xl bg-pink-600 px-4 text-xs font-bold text-white shadow-md hover:bg-pink-700 disabled:opacity-40"
              >
                <FiSend size={14} className="mr-1.5" /> Bhejo
              </Button>
            </form>
          </div>
        </Card>

        {/* Right Column: AI Learning Capability & Memory Directives */}
        <Card className="flex min-h-0 flex-col overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-purple-50 text-purple-600">
                  <FiBookmark size={15} />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Anya Learning Memory
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Business rules jo Anya hamesha yaad rakhti hai
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {/* Teach Anya New Directive */}
            <div className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/60 to-pink-50/40 p-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-purple-900">
                Anya ko Naya Rule ya Fact Sikhao
              </label>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  type="text"
                  value={teachInput}
                  onChange={(e) => setTeachInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTeachAi();
                    }
                  }}
                  placeholder="jaise: BlueDart hamara preferred courier hai…"
                  className="h-8 flex-1 rounded-lg border border-purple-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-purple-500"
                />
                <Button
                  size="sm"
                  onClick={handleTeachAi}
                  disabled={!teachInput.trim()}
                  className="h-8 rounded-lg bg-purple-600 px-3 text-xs font-bold text-white hover:bg-purple-700"
                >
                  <FiPlus size={12} className="mr-1" /> Sikhao
                </Button>
              </div>
            </div>

            {/* Active Learned Directives Textarea */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                <span>Active Directives ({learningMemory.length}/1500)</span>
                <button
                  type="button"
                  onClick={handleClearMemory}
                  className="text-rose-600 hover:underline"
                >
                  Clear Memory
                </button>
              </div>
              <textarea
                value={learningMemory}
                onChange={(e) => setLearningMemory(e.target.value.slice(0, 1500))}
                rows={5}
                placeholder="Rules, business preferences, currency formats, priority guidelines…"
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium leading-relaxed text-slate-700 outline-none focus:border-purple-400 focus:bg-white focus:ring-2 focus:ring-purple-100"
              />
              <p className="mt-1 text-[10px] text-slate-400 italic">
                Yeh directives har Gemini request ke sath jude rehte hain taaki Anya aapke niyam yaad rakhe.
              </p>
            </div>

            {/* Preset Directives */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Quick Preset Directives
              </p>
              <div className="space-y-1.5">
                {PRESET_DIRECTIVES.map((directive) => (
                  <button
                    key={directive}
                    type="button"
                    onClick={() => {
                      if (!learningMemory.includes(directive)) {
                        setLearningMemory((prev) => {
                          const updated = prev.trim() ? `${prev.trim()}\n• ${directive}` : `• ${directive}`;
                          return updated.slice(0, 1500);
                        });
                        showSuccess('Added to Memory', 'Directive memory mein jod diya gaya.');
                      }
                    }}
                    className="w-full rounded-xl border border-slate-100 bg-slate-50/80 p-2 text-left text-[11px] font-medium text-slate-700 transition hover:border-purple-200 hover:bg-purple-50/60"
                  >
                    <FiBookmark size={10} className="mr-1.5 inline text-purple-500" />
                    {directive}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Tuning */}
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3 space-y-2 mt-auto">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Anya Voice Tone &amp; Playback
              </p>
              <div className="grid grid-cols-1 gap-2">
                {VOICE_PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setVoiceName(p.id);
                      speakText('Namaste! Main Anya hoon! Kaisa chal raha hai business?');
                    }}
                    className={`rounded-xl border p-2 text-left transition ${
                      voiceName === p.id
                        ? 'border-pink-400 bg-pink-50 text-pink-900 font-bold'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span>{p.name}</span>
                      {voiceName === p.id && <FiCheck size={12} className="text-pink-600" />}
                    </div>
                    <span className="block text-[9px] text-slate-400 font-normal truncate mt-0.5">
                      {p.tone}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoRead}
                    onChange={(e) => setAutoRead(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-pink-600 focus:ring-pink-500"
                  />
                  <span>Anya ke jawab bolkar sunao (Auto-speak)</span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
