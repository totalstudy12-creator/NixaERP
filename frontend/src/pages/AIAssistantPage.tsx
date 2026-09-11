// src/pages/AIAssistantPage.tsx
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  memo,
} from 'react';
import {
  FiPlus,
  FiTrash2,
  FiEdit,
  FiDownload,
  FiSearch,
  FiSend,
  FiMessageSquare,
  FiUser,
  FiMic,
  FiMicOff,
  FiCpu,
  FiCopy,
  FiRefreshCw,
  FiCheck,
  FiChevronDown,
  FiMoreVertical,
  FiStopCircle,
  FiSettings,
} from 'react-icons/fi';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface Conversation {
  id: string;
  title: string;
  last_message?: string;
  updated_at?: string;
  messages?: Message[];
}

interface StoredState {
  conversations: Conversation[];
  activeConversationId: string | null;
  settings: {
    autoRead: boolean;
    voiceProvider: 'browser' | 'cloud';
    voiceLanguage: 'en-US' | 'hi-IN';
    voiceSpeed: number;
  };
}

interface ApiErrorLike {
  message?: string;
  status?: number;
  response?: { status?: number; data?: { message?: string } };
  name?: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'ai-assistant-v1';
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES_PER_CONVERSATION = 200;

const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  { label: 'Revenue summary', prompt: "Summarize today's revenue." },
  { label: 'Low stock', prompt: 'Which products have low stock?' },
  { label: 'Top customers', prompt: 'Who are our top customers?' },
  { label: 'Net profit', prompt: 'What is my net profit this month?' },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  const err = error as ApiErrorLike;
  const status = err?.response?.status ?? err?.status;
  const message = err?.response?.data?.message ?? err?.message;

  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested service was not found.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status != null && status >= 500) return 'Server error. Please try again later.';

  return message || fallback;
}

function safeLog(module: string, action: string, status: 'success' | 'error', message: string) {
  try {
    addAppLog({ module, action, status, message });
  } catch {
    /* no-op */
  }
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatRelative(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
  }).format(d);
}

function truncate(text: string, max = 40): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function loadState(): StoredState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (!Array.isArray(parsed.conversations)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state: StoredState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage may be full or disabled; ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Message bubble                                                      */
/* ------------------------------------------------------------------ */

const MessageBubble = memo(
  ({
    message,
    onCopy,
  }: {
    message: Message;
    onCopy: (content: string) => void;
  }) => {
    const isUser = message.role === 'user';
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
      onCopy(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };

    return (
      <div className={`group flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <FiCpu size={14} />
          </div>
        )}
        <div className={`flex max-w-[78%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
          <div
            className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow-sm ${
              isUser
                ? 'rounded-br-md bg-indigo-600 text-white'
                : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
            }`}
          >
            {message.content}
          </div>
          <div className="flex items-center gap-2 px-1 text-[10px] text-slate-400">
            {message.created_at && <span>{formatTime(message.created_at)}</span>}
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
              aria-label="Copy message"
            >
              {copied ? <FiCheck size={11} /> : <FiCopy size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        {isUser && (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-sm">
            <FiUser size={14} />
          </div>
        )}
      </div>
    );
  }
);
MessageBubble.displayName = 'MessageBubble';

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function AIAssistantPage() {
  const { showSuccess, showError } = useNotification();

  /* -------------------- Persisted state -------------------- */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [autoRead, setAutoRead] = useState(true);
  const [voiceProvider, setVoiceProvider] = useState<'browser' | 'cloud'>('cloud');
  const [voiceLanguage, setVoiceLanguage] = useState<'en-US' | 'hi-IN'>('en-US');
  const [voiceSpeed, setVoiceSpeed] = useState(0.96);
  const hydratedRef = useRef(false);

  /* -------------------- UI state -------------------- */
  const [searchTerm, setSearchTerm] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [ttsSource, setTtsSource] = useState<'browser' | 'cloud'>('browser');
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<unknown>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);

  /* -------------------- Hydrate from localStorage -------------------- */
  useEffect(() => {
    const stored = loadState();

    if (stored && stored.conversations.length > 0) {
      setConversations(stored.conversations);
      setActiveConversationId(
        stored.activeConversationId && stored.conversations.some((c) => c.id === stored.activeConversationId)
          ? stored.activeConversationId
          : stored.conversations[0].id
      );
      if (stored.settings) {
        setAutoRead(stored.settings.autoRead);
        setVoiceProvider(stored.settings.voiceProvider);
        setVoiceLanguage(stored.settings.voiceLanguage);
        setVoiceSpeed(stored.settings.voiceSpeed);
      }
    } else {
      const welcome: Conversation = {
        id: uid(),
        title: 'Welcome',
        updated_at: new Date().toISOString(),
        messages: [
          {
            id: uid(),
            role: 'assistant',
            content:
              'Hello! I am your AI assistant. Ask me about your business data, sales, inventory, or customers. You can type or use the microphone for voice input.',
            created_at: new Date().toISOString(),
          },
        ],
      };
      setConversations([welcome]);
      setActiveConversationId(welcome.id);
    }

    hydratedRef.current = true;
  }, []);

  /* -------------------- Persist to localStorage -------------------- */
  useEffect(() => {
    if (!hydratedRef.current) return;
    const trimmed = conversations.slice(0, MAX_CONVERSATIONS).map((c) => ({
      ...c,
      messages: (c.messages ?? []).slice(-MAX_MESSAGES_PER_CONVERSATION),
    }));
    saveState({
      conversations: trimmed,
      activeConversationId,
      settings: { autoRead, voiceProvider, voiceLanguage, voiceSpeed },
    });
  }, [conversations, activeConversationId, autoRead, voiceProvider, voiceLanguage, voiceSpeed]);

  /* -------------------- Derived -------------------- */
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((c) => {
      if (c.title.toLowerCase().includes(term)) return true;
      if ((c.last_message ?? '').toLowerCase().includes(term)) return true;
      return (c.messages ?? []).some((m) => m.content.toLowerCase().includes(term));
    });
  }, [conversations, searchTerm]);

  /* -------------------- Voice setup -------------------- */
  const pickBestVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;

    const preferred =
      voices.find((voice) => {
        const name = voice.name.toLowerCase();
        const lang = voice.lang.toLowerCase();
        return (
          /female|samantha|aria|zira|susan|jenny|olivia|danielle/i.test(name) ||
          /en-us|en-gb|en-in|hi-in/i.test(lang)
        );
      }) ??
      voices.find((voice) => /en-us|en-gb|en-in/i.test(voice.lang.toLowerCase())) ??
      voices[0] ??
      null;

    return preferred;
  }, []);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition() as {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((e: unknown) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
        abort: () => void;
      };
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = voiceLanguage;
      rec.onresult = (event: unknown) => {
        const e = event as { results: { 0: { 0: { transcript: string } } } };
        const text = e.results[0][0].transcript;
        setIsListening(false);
        void sendMessage(text);
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
    }

    if ('speechSynthesis' in window) {
      synthesisRef.current = window.speechSynthesis;
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) pickBestVoice();
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      const rec = recognitionRef.current as { abort?: () => void } | null;
      rec?.abort?.();
      synthesisRef.current?.cancel();
      if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceLanguage]);

  /* -------------------- Auto-scroll -------------------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages, isTyping]);

  /* -------------------- Keyboard shortcuts -------------------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setActionMenuId(null);
        setEditingTitleId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* -------------------- TTS -------------------- */
  const speakResponse = useCallback(
    async (text: string) => {
      if (!text) return;
      try {
        const res = await apiClient.generateAiSpeech(text, voiceProvider, voiceLanguage);
        const payload = (res as { data?: { source?: string; audio_base64?: string } })?.data ?? res;
        const p = payload as { source?: string; audio_base64?: string };
        if (p?.source === 'cloud' && p?.audio_base64) {
          setTtsSource('cloud');
          const audio = new Audio(`data:audio/mpeg;base64,${p.audio_base64}`);
          audio.onplay = () => setIsSpeaking(true);
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => setIsSpeaking(false);
          void audio.play();
          return;
        }
      } catch {
        /* fall through to browser TTS */
      }

      setTtsSource('browser');
      if (!synthesisRef.current || !('speechSynthesis' in window)) return;

      const cleanText = text.replace(/[*#_`]/g, '').trim();
      if (!cleanText) return;

      synthesisRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const preferred = pickBestVoice();
      if (preferred) {
        utterance.voice = preferred;
        utterance.lang = preferred.lang || voiceLanguage;
      } else {
        utterance.lang = voiceLanguage;
      }
      utterance.rate = voiceSpeed;
      utterance.pitch = 1.15;
      utterance.volume = 1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      synthesisRef.current.speak(utterance);
    },
    [voiceProvider, voiceLanguage, voiceSpeed, pickBestVoice]
  );

  /* -------------------- Conversation helpers -------------------- */

  const handleNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: uid(),
      title: 'New chat',
      updated_at: new Date().toISOString(),
      messages: [],
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    if (!window.confirm('Delete this conversation?')) return;
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      setActiveConversationId((currentActive) => {
        if (currentActive !== id) return currentActive;
        return remaining.length > 0 ? remaining[0].id : null;
      });
      return remaining;
    });
  }, []);

  const handleClearAll = useCallback(() => {
    if (!window.confirm('Clear all conversations? This cannot be undone.')) return;
    setConversations([]);
    setActiveConversationId(null);
    showSuccess('Cleared', 'All conversations removed.');
  }, [showSuccess]);

  const handleStartRename = useCallback((conv: Conversation) => {
    setEditingTitleId(conv.id);
    setEditingTitleValue(conv.title);
  }, []);

  const handleCommitRename = useCallback(() => {
    const trimmed = editingTitleValue.trim();
    if (!trimmed || !editingTitleId) {
      setEditingTitleId(null);
      return;
    }
    setConversations((prev) =>
      prev.map((c) =>
        c.id === editingTitleId ? { ...c, title: trimmed, updated_at: new Date().toISOString() } : c
      )
    );
    setEditingTitleId(null);
  }, [editingTitleId, editingTitleValue]);

  /* -------------------- Send message -------------------- */

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? inputMessage).trim();
      if (!text || isTyping || !activeConversation) return;

      const userMsg: Message = {
        id: uid(),
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      };

      const previousMessages = activeConversation.messages ?? [];
      const updatedMessages = [...previousMessages, userMsg];

      const isFirstUserMessage = !previousMessages.some((m) => m.role === 'user');

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id
            ? {
                ...c,
                title: isFirstUserMessage ? truncate(text, 40) : c.title,
                updated_at: new Date().toISOString(),
                messages: updatedMessages,
              }
            : c
        )
      );

      setInputMessage('');
      setIsTyping(true);

      const controller = new AbortController();
      setAbortController(controller);

      try {
        const history = previousMessages.map((m) => ({ role: m.role, text: m.content }));
        const res = await apiClient.geminiChat(text, history);
        const reply =
          (res as { response?: string })?.response ||
          (res as { data?: { response?: string } })?.data?.response ||
          'I processed your request.';

        const aiMsg: Message = {
          id: uid(),
          role: 'assistant',
          content: reply,
          created_at: new Date().toISOString(),
        };

        const finalMessages = [...updatedMessages, aiMsg];
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversation.id
              ? {
                  ...c,
                  last_message: reply,
                  updated_at: new Date().toISOString(),
                  messages: finalMessages,
                }
              : c
          )
        );

        if (autoRead) void speakResponse(reply);

        safeLog('AI Assistant', 'AI Response', 'success', `Replied to: ${truncate(text, 40)}`);
      } catch (err: unknown) {
        if ((err as ApiErrorLike).name === 'AbortError') return;
        const errorMsg: Message = {
          id: uid(),
          role: 'assistant',
          content:
            'Sorry, I could not connect to the AI service. Please check your connection and try again.',
          created_at: new Date().toISOString(),
        };
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversation.id
              ? { ...c, messages: [...updatedMessages, errorMsg], updated_at: new Date().toISOString() }
              : c
          )
        );
        showError('AI Error', getApiErrorMessage(err, 'Failed to get response.'));
      } finally {
        setIsTyping(false);
        setAbortController(null);
      }
    },
    [inputMessage, isTyping, activeConversation, autoRead, speakResponse, showError]
  );

  const handleStop = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsTyping(false);
  }, [abortController]);

  const handleRegenerate = useCallback(() => {
    if (!activeConversation) return;
    const msgs = activeConversation.messages ?? [];
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const withoutLastAssistant = (() => {
      const copy = [...msgs];
      if (copy.length && copy[copy.length - 1].role === 'assistant') copy.pop();
      return copy;
    })();
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConversation.id ? { ...c, messages: withoutLastAssistant } : c))
    );
    window.setTimeout(() => void sendMessage(lastUser.content), 50);
  }, [activeConversation, sendMessage]);

  /* -------------------- Voice toggle -------------------- */

  const toggleVoice = () => {
    const rec = recognitionRef.current as { start: () => void; stop: () => void } | null;
    if (!rec) {
      showError('Not supported', 'Voice input is not supported in this browser.');
      return;
    }
    if (isListening) {
      rec.stop();
      setIsListening(false);
    } else {
      synthesisRef.current?.cancel();
      setIsSpeaking(false);
      try {
        rec.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  /* -------------------- Copy -------------------- */

  const handleCopyMessage = useCallback(
    async (content: string) => {
      try {
        await navigator.clipboard.writeText(content);
      } catch {
        showError('Copy failed', 'Could not copy to clipboard.');
      }
    },
    [showError]
  );

  /* -------------------- Export -------------------- */

  const handleExportChat = useCallback(() => {
    if (!activeConversation?.messages?.length) {
      showError('Export failed', 'No messages to export.');
      return;
    }
    const text = activeConversation.messages
      .map((m) => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`)
      .join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-chat-${activeConversation.title.slice(0, 20).replace(/\s+/g, '-')}-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'Chat exported.');
  }, [activeConversation, showSuccess, showError]);

  /* -------------------- Render -------------------- */

  const messages = activeConversation?.messages ?? [];
  const hasMessages = messages.length > 0;

  return (
    <>
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

        .ai-scroll::-webkit-scrollbar { width: 8px; }
        .ai-scroll::-webkit-scrollbar-track { background: transparent; }
        .ai-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 8px; }
        .ai-scroll::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
      `}</style>

      <div className="flex h-screen min-h-0 flex-col bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto flex w-full max-w-[1900px] flex-1 flex-col gap-5 overflow-hidden p-3 sm:p-4 lg:gap-6 lg:p-6">
          {/* Hero */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 lg:px-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiCpu size={12} />
                  AI · Assistant
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  AI assistant
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Chat and voice-powered business insights — with persistent memory.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleExportChat}
                  disabled={!hasMessages}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <FiDownload className="mr-2" size={14} />
                  Export
                </Button>
                <Button
                  onClick={handleNewConversation}
                  className="h-10 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
                >
                  <FiPlus className="mr-2" size={14} />
                  New chat
                </Button>
              </div>
            </div>
          </section>

          {/* Main layout */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* Sidebar */}
            <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                    <FiMessageSquare size={13} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Conversations</p>
                    <p className="text-[10px] text-slate-500">{conversations.length} total</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  disabled={conversations.length === 0}
                  className="h-7 rounded-lg px-2 text-[11px] font-medium text-slate-500 hover:text-red-600"
                >
                  Clear
                </Button>
              </CardHeader>

              <div className="border-b border-slate-100 bg-white p-2.5">
                <div className="relative">
                  <FiSearch
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={14}
                  />
                  <input
                    ref={searchInputRef}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search chats…"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-12 text-xs text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium text-slate-400 md:block">
                    ⌘K
                  </span>
                </div>
              </div>

              <div className="ai-scroll flex-1 overflow-y-auto bg-slate-50/40 p-1.5">
                {filteredConversations.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white ring-1 ring-slate-200/70">
                      <FiMessageSquare className="h-5 w-5 text-slate-400" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-800">
                      {searchTerm ? 'No matches' : 'No conversations yet'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {searchTerm ? 'Try a different search term.' : 'Start a new chat to begin.'}
                    </p>
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const isActive = activeConversationId === conv.id;
                    const isEditing = editingTitleId === conv.id;
                    const isMenuOpen = actionMenuId === conv.id;

                    return (
                      <div
                        key={conv.id}
                        className={`group relative flex items-center gap-2 rounded-xl px-2.5 py-2 transition ${
                          isActive
                            ? 'bg-white shadow-sm ring-1 ring-indigo-200'
                            : 'hover:bg-white/80'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveConversationId(conv.id);
                            setActionMenuId(null);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          {isEditing ? (
                            <input
                              value={editingTitleValue}
                              onChange={(e) => setEditingTitleValue(e.target.value)}
                              onBlur={handleCommitRename}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCommitRename();
                                if (e.key === 'Escape') setEditingTitleId(null);
                              }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-md border border-indigo-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                          ) : (
                            <>
                              <p className="truncate text-xs font-semibold text-slate-800">
                                {conv.title}
                              </p>
                              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                                {conv.last_message || 'No messages yet'}
                              </p>
                              {conv.updated_at && (
                                <p className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400">
                                  {formatRelative(conv.updated_at)}
                                </p>
                              )}
                            </>
                          )}
                        </button>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionMenuId(isMenuOpen ? null : conv.id);
                            }}
                            className={`grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${
                              isMenuOpen ? 'bg-slate-100 text-slate-700' : 'opacity-0 group-hover:opacity-100'
                            }`}
                            aria-label="Chat actions"
                          >
                            <FiMoreVertical size={13} />
                          </button>
                          {isMenuOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionMenuId(null)}
                              />
                              <div className="animate-fadeIn absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionMenuId(null);
                                    handleStartRename(conv);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 transition hover:bg-slate-50"
                                >
                                  <FiEdit size={12} className="text-indigo-500" /> Rename
                                </button>
                                <div className="my-0.5 border-t border-slate-100" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionMenuId(null);
                                    handleDeleteConversation(conv.id);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-red-600 transition hover:bg-red-50"
                                >
                                  <FiTrash2 size={12} /> Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Chat panel */}
            <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              {!activeConversation ? (
                <CardContent className="flex flex-1 items-center justify-center py-20 text-center">
                  <div>
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                      <FiMessageSquare className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-slate-800">
                      No conversation selected
                    </p>
                    <p className="mt-1 text-sm text-slate-500">Create a new chat to get started.</p>
                    <Button
                      onClick={handleNewConversation}
                      className="mt-5 rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700"
                    >
                      <FiPlus className="mr-2" size={14} /> New chat
                    </Button>
                  </div>
                </CardContent>
              ) : (
                <>
                  {/* Chat header */}
                  <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                        <FiCpu size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {activeConversation.title}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {messages.length} message{messages.length === 1 ? '' : 's'}
                          {activeConversation.updated_at && (
                            <> · {formatRelative(activeConversation.updated_at)}</>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                          ttsSource === 'cloud'
                            ? 'border-violet-200/70 bg-violet-50 text-violet-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                      >
                        {ttsSource === 'cloud' ? 'Premium voice' : 'Browser voice'}
                      </Badge>
                      {isSpeaking && (
                        <Badge
                          variant="outline"
                          className="animate-pulse rounded-full border-emerald-200/70 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                        >
                          Speaking…
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  {/* Messages */}
                  <div className="ai-scroll flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-4 sm:p-5">
                    {messages.length === 0 && !isTyping && (
                      <div className="flex h-full flex-col items-center justify-center text-center">
                        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-white ring-1 ring-indigo-100">
                          <FiCpu className="h-6 w-6 text-indigo-500" />
                        </div>
                        <p className="mt-4 text-base font-semibold text-slate-800">
                          Start a conversation
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Ask about sales, inventory, customers, or trends.
                        </p>
                      </div>
                    )}

                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} onCopy={handleCopyMessage} />
                    ))}

                    {isTyping && (
                      <div className="flex gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                          <FiCpu size={14} />
                        </div>
                        <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                          <div className="flex gap-1">
                            <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" />
                            <span
                              className="h-2 w-2 animate-bounce rounded-full bg-indigo-400"
                              style={{ animationDelay: '0.15s' }}
                            />
                            <span
                              className="h-2 w-2 animate-bounce rounded-full bg-indigo-400"
                              style={{ animationDelay: '0.3s' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Composer */}
                  <div className="border-t border-slate-100 bg-white p-3 sm:p-4">
                    {/* Voice row */}
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowVoiceSettings((v) => !v)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          <FiSettings size={11} /> Voice
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void speakResponse(
                              'Hello! This is a preview of my voice. I sound natural and clear.'
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 transition hover:bg-violet-100"
                        >
                          <FiCpu size={11} /> Preview
                        </button>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-600">
                        <input
                          type="checkbox"
                          checked={autoRead}
                          onChange={(e) => setAutoRead(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Auto-read
                      </label>
                    </div>

                    {showVoiceSettings && (
                      <div className="animate-fadeIn mb-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Provider
                            </label>
                            <div className="relative">
                              <select
                                value={voiceProvider}
                                onChange={(e) =>
                                  setVoiceProvider(e.target.value as 'browser' | 'cloud')
                                }
                                className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-2.5 pr-8 text-xs font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                              >
                                <option value="cloud">Premium voice</option>
                                <option value="browser">Browser voice</option>
                              </select>
                              <FiChevronDown
                                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                                size={12}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Language
                            </label>
                            <div className="relative">
                              <select
                                value={voiceLanguage}
                                onChange={(e) =>
                                  setVoiceLanguage(e.target.value as 'en-US' | 'hi-IN')
                                }
                                className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-2.5 pr-8 text-xs font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                              >
                                <option value="en-US">English</option>
                                <option value="hi-IN">Hindi</option>
                              </select>
                              <FiChevronDown
                                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                                size={12}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              <span>Speed</span>
                              <span className="text-slate-700">{voiceSpeed.toFixed(2)}×</span>
                            </div>
                            <input
                              type="range"
                              min="0.75"
                              max="1.4"
                              step="0.05"
                              value={voiceSpeed}
                              onChange={(e) => setVoiceSpeed(Number(e.target.value))}
                              className="mt-2 w-full accent-indigo-600"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Input row */}
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={toggleVoice}
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition ${
                          isListening
                            ? 'bg-red-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title={isListening ? 'Stop listening' : 'Start voice input'}
                        aria-label={isListening ? 'Stop listening' : 'Start voice input'}
                      >
                        {isListening ? <FiMicOff size={17} /> : <FiMic size={17} />}
                      </button>

                      <textarea
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void sendMessage();
                          }
                        }}
                        placeholder={
                          isListening ? 'Listening…' : 'Ask me anything about your business…'
                        }
                        rows={1}
                        className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:bg-slate-50"
                        disabled={isTyping}
                      />

                      {isTyping ? (
                        <button
                          type="button"
                          onClick={handleStop}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-500 text-white transition hover:bg-red-600"
                          title="Stop generating"
                          aria-label="Stop generating"
                        >
                          <FiStopCircle size={17} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void sendMessage()}
                          disabled={!inputMessage.trim()}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Send message"
                          aria-label="Send message"
                        >
                          <FiSend size={17} />
                        </button>
                      )}

                      {!isTyping && hasMessages && (
                        <button
                          type="button"
                          onClick={handleRegenerate}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                          title="Regenerate last response"
                          aria-label="Regenerate last response"
                        >
                          <FiRefreshCw size={17} />
                        </button>
                      )}
                    </div>

                    {/* Quick prompts */}
                    <div className="ai-scroll mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                      {QUICK_PROMPTS.map((qp) => (
                        <button
                          key={qp.label}
                          type="button"
                          onClick={() => void sendMessage(qp.prompt)}
                          disabled={isTyping}
                          className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-700 disabled:opacity-50"
                        >
                          {qp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

export default AIAssistantPage;