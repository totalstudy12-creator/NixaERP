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
  FiInfo,
  FiLock,
  FiRadio,
  FiVolume2,
  FiThumbsUp,
  FiThumbsDown,
  FiZap,
  FiStar,
  FiCornerUpLeft,
} from 'react-icons/fi';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../store/auth';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  error?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  last_message?: string;
  updated_at?: string;
  messages?: Message[];
  pinned?: boolean;
}

interface StoredState {
  conversations: Conversation[];
  activeConversationId: string | null;
  settings: {
    autoRead: boolean;
    voiceProvider: 'browser' | 'cloud';
    voiceLanguage: 'en-US' | 'hi-IN';
    voiceSpeed: number;
    learningMemory?: string;
  };
}

interface ApiErrorLike {
  message?: string;
  backendMessage?: string;
  status?: number;
  response?: { status?: number; data?: { message?: string } };
  name?: string;
}

type SendMessageFn = (textOverride?: string, isRegenerate?: boolean) => Promise<void>;

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'ai-assistant-v1';
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES_PER_CONVERSATION = 200;

const QUICK_PROMPTS = [
  'What were my top-selling products this month?',
  'Which customers owe me the most money?',
  'Show me items that are low on stock',
  'How are my sales trending this week?',
];

/* ------------------------------------------------------------------ */
/* Safe helpers                                                        */
/* ------------------------------------------------------------------ */

function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (typeof error === 'object' && error !== null) {
    const err = error as ApiErrorLike;
    const status = err.response?.status ?? err.status;
    const message = err.backendMessage ?? err.response?.data?.message ?? err.message;

    if (status === 401) return 'Your session has expired. Please sign in again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status === 404) return 'The requested service was not found.';
    if (status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (typeof message === 'string' && message.trim()) return message;
    if (status != null && status >= 500) return 'Server error. Please try again later.';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function safeLog(module: string, action: string, status: 'success' | 'error', message: string): void {
  try { addAppLog({ module, action, status, message }); } catch { /* swallow */ }
}

function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch { return ''; }
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
  try {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(d);
  } catch { return ''; }
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
    if (!parsed || !Array.isArray(parsed.conversations)) return null;
    return parsed;
  } catch { return null; }
}

function saveState(state: StoredState): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* non-fatal */ }
}

function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/* ------------------------------------------------------------------ */
/* Message bubble                                                      */
/* ------------------------------------------------------------------ */

const MessageBubble = memo(function MessageBubble({
  message,
  onCopy,
  onFeedback,
}: {
  message: Message;
  onCopy: (content: string) => void;
  onFeedback: (content: string, helpful: boolean) => void;
}) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    onCopy(message.content);
    setCopied(true);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
  }, [message.content, onCopy]);

  return (
    <div className={`group flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
          <FiCpu size={14} />
        </div>
      )}
      <div className={`flex max-w-[80%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow-sm ${
            isUser
              ? 'rounded-br-md bg-emerald-600 text-white'
              : message.error
              ? 'rounded-bl-md border border-rose-200 bg-rose-50 text-rose-900'
              : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
          }`}
        >
          {message.content}
        </div>
        <div className="flex items-center gap-2 px-1 text-[10px] text-slate-400">
          {message.created_at && <span>{formatTime(message.created_at)}</span>}
          {!isUser && !message.error && (
            <>
              <button
                type="button"
                onClick={() => onFeedback(message.content, true)}
                title="Mark as helpful"
                className="rounded p-1 hover:bg-emerald-50 hover:text-emerald-700"
              >
                <FiThumbsUp size={11} />
              </button>
              <button
                type="button"
                onClick={() => onFeedback(message.content, false)}
                title="Correct this answer"
                className="rounded p-1 hover:bg-amber-50 hover:text-amber-700"
              >
                <FiThumbsDown size={11} />
              </button>
            </>
          )}
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
});
MessageBubble.displayName = 'MessageBubble';

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function AIAssistantPage() {
  const { showSuccess, showError } = useNotification();
  const { can, isSuperAdmin } = usePermission();
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const hasUser = useAuthStore((s) => Boolean(s.user));

  const canChat = isSuperAdmin || can('chat with ai assistant');
  const canView = isSuperAdmin || can('view ai assistant insights');

  /* -------------------- Persisted state -------------------- */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [autoRead, setAutoRead] = useState(true);
  const [voiceProvider, setVoiceProvider] = useState<'browser' | 'cloud'>('cloud');
  const [voiceLanguage, setVoiceLanguage] = useState<'en-US' | 'hi-IN'>('en-US');
  const [voiceSpeed, setVoiceSpeed] = useState(0.96);
  const [learningMemory, setLearningMemory] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const hydratedRef = useRef(false);

  /* -------------------- UI state -------------------- */
  const [searchTerm, setSearchTerm] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceAgentActive, setVoiceAgentActive] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [ttsSource, setTtsSource] = useState<'browser' | 'cloud'>('browser');
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  /* -------------------- Refs -------------------- */
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void; abort: () => void } | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const voiceAgentActiveRef = useRef(false);
  const awaitingVoiceReplyRef = useRef(false);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const sendMessageRef = useRef<SendMessageFn | null>(null);

  /* -------------------- Hydrate from localStorage -------------------- */
  useEffect(() => {
    const stored = loadState();

    if (stored && stored.conversations.length > 0) {
      setConversations(stored.conversations);
      setActiveConversationId(
        stored.activeConversationId &&
          stored.conversations.some((c) => c.id === stored.activeConversationId)
          ? stored.activeConversationId
          : stored.conversations[0].id,
      );
      if (stored.settings) {
        setAutoRead(Boolean(stored.settings.autoRead));
        setVoiceProvider(stored.settings.voiceProvider === 'browser' ? 'browser' : 'cloud');
        setVoiceLanguage(stored.settings.voiceLanguage === 'hi-IN' ? 'hi-IN' : 'en-US');
        setVoiceSpeed(
          typeof stored.settings.voiceSpeed === 'number'
            ? Math.min(1.4, Math.max(0.75, stored.settings.voiceSpeed))
            : 0.96,
        );
        setLearningMemory(
          typeof stored.settings.learningMemory === 'string' ? stored.settings.learningMemory : '',
        );
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
              'Hi! I am your ERP business agent. Ask me about sales, inventory, customers, cash, or purchasing — type or use the mic.',
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
      settings: { autoRead, voiceProvider, voiceLanguage, voiceSpeed, learningMemory },
    });
  }, [conversations, activeConversationId, autoRead, voiceProvider, voiceLanguage, voiceSpeed, learningMemory]);

  /* -------------------- Derived -------------------- */
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list = !term
      ? conversations
      : conversations.filter((c) => {
          if (c.title.toLowerCase().includes(term)) return true;
          if ((c.last_message ?? '').toLowerCase().includes(term)) return true;
          return (c.messages ?? []).some((m) => m.content.toLowerCase().includes(term));
        });
    return [...list].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    });
  }, [conversations, searchTerm]);

  const messages = activeConversation?.messages ?? [];
  const hasMessages = messages.length > 0;

  /* -------------------- Voice setup -------------------- */
  const pickBestVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (!isSpeechSynthesisSupported()) return null;
    try {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return null;
      return (
        voices.find((v) => {
          const n = v.name.toLowerCase();
          const l = v.lang.toLowerCase();
          return (
            /female|samantha|aria|zira|susan|jenny|olivia|danielle/i.test(n) ||
            /en-us|en-gb|en-in|hi-in/i.test(l)
          );
        }) ??
        voices.find((v) => /en-us|en-gb|en-in/i.test(v.lang.toLowerCase())) ??
        voices[0] ??
        null
      );
    } catch { return null; }
  }, []);

  useEffect(() => {
    if (!canChat) return;

    const w = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (SR) {
      try {
        const rec = new SR() as unknown as {
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
          try {
            const e = event as { results: { 0: { 0: { transcript: string } } } };
            const text = e.results?.[0]?.[0]?.transcript ?? '';
            setIsListening(false);
            if (text.trim()) {
              awaitingVoiceReplyRef.current = voiceAgentActiveRef.current;
              void sendMessageRef.current?.(text);
            }
          } catch { setIsListening(false); }
        };
        rec.onerror = () => setIsListening(false);
        rec.onend = () => {
          setIsListening(false);
          if (voiceAgentActiveRef.current && !awaitingVoiceReplyRef.current) {
            window.setTimeout(() => {
              if (!voiceAgentActiveRef.current) return;
              try { rec.start(); setIsListening(true); } catch { /* user gesture needed */ }
            }, 350);
          }
        };
        recognitionRef.current = rec;
      } catch { recognitionRef.current = null; }
    }

    if (isSpeechSynthesisSupported()) {
      synthesisRef.current = window.speechSynthesis;
      const load = () => {
        try { if (window.speechSynthesis.getVoices().length) pickBestVoice(); } catch { /* ignore */ }
      };
      load();
      try { window.speechSynthesis.onvoiceschanged = load; } catch { /* ignore */ }
    }

    return () => {
      try { recognitionRef.current?.abort(); } catch { /* ignore */ }
      try { synthesisRef.current?.cancel(); } catch { /* ignore */ }
      if (isSpeechSynthesisSupported()) {
        try { window.speechSynthesis.onvoiceschanged = null; } catch { /* ignore */ }
      }
    };
  }, [voiceLanguage, canChat, pickBestVoice]);

  /* -------------------- Unmount cleanup -------------------- */
  useEffect(() => {
    return () => {
      try { abortControllerRef.current?.abort(); } catch { /* ignore */ }
      try { activeAudioRef.current?.pause(); } catch { /* ignore */ }
      activeAudioRef.current = null;
      try { synthesisRef.current?.cancel(); } catch { /* ignore */ }
    };
  }, []);

  /* -------------------- Auto-scroll -------------------- */
  useEffect(() => {
    try { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); } catch { /* ignore */ }
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
  const resumeVoiceAgent = useCallback(() => {
    awaitingVoiceReplyRef.current = false;
    if (!voiceAgentActiveRef.current || !recognitionRef.current) return;
    window.setTimeout(() => {
      if (!voiceAgentActiveRef.current || !recognitionRef.current) return;
      try { recognitionRef.current.start(); setIsListening(true); } catch { /* gesture needed */ }
    }, 450);
  }, []);

  const stopSpeaking = useCallback(() => {
    try { synthesisRef.current?.cancel(); } catch { /* ignore */ }
    try {
      const audio = activeAudioRef.current;
      if (audio) { audio.pause(); audio.currentTime = 0; }
    } catch { /* ignore */ }
    activeAudioRef.current = null;
    setIsSpeaking(false);
  }, []);

  const speakResponse = useCallback(
    async (text: string) => {
      if (!text || !canChat) return;

      try {
        const res = await apiClient.generateAiSpeech(text, voiceProvider, voiceLanguage);
        const payload = (res as { data?: { source?: string; audio_base64?: string } })?.data ?? res;
        const p = payload as { source?: string; audio_base64?: string };
        if (p?.source === 'cloud' && p?.audio_base64) {
          setTtsSource('cloud');
          try {
            const audio = new Audio(`data:audio/mpeg;base64,${p.audio_base64}`);
            activeAudioRef.current = audio;
            audio.onplay = () => setIsSpeaking(true);
            audio.onended = () => {
              if (activeAudioRef.current === audio) activeAudioRef.current = null;
              setIsSpeaking(false);
              resumeVoiceAgent();
            };
            audio.onerror = () => {
              if (activeAudioRef.current === audio) activeAudioRef.current = null;
              setIsSpeaking(false);
              resumeVoiceAgent();
            };
            await audio.play();
            // Guard: user may have pressed Stop while `play()` was pending.
            if (activeAudioRef.current !== audio) {
              try { audio.pause(); } catch { /* ignore */ }
            }
          } catch {
            activeAudioRef.current = null;
            setIsSpeaking(false);
            resumeVoiceAgent();
          }
          return;
        }
      } catch { /* fall through to browser TTS */ }

      setTtsSource('browser');
      if (!synthesisRef.current || !isSpeechSynthesisSupported()) { resumeVoiceAgent(); return; }

      const cleanText = text.replace(/[*#_`]/g, '').trim();
      if (!cleanText) return;

      try {
        synthesisRef.current.cancel();
        const u = new SpeechSynthesisUtterance(cleanText);
        const preferred = pickBestVoice();
        if (preferred) { u.voice = preferred; u.lang = preferred.lang || voiceLanguage; }
        else { u.lang = voiceLanguage; }
        u.rate = voiceSpeed;
        u.pitch = 1.15;
        u.volume = 1;
        u.onstart = () => setIsSpeaking(true);
        u.onend = () => { setIsSpeaking(false); resumeVoiceAgent(); };
        u.onerror = () => { setIsSpeaking(false); resumeVoiceAgent(); };
        synthesisRef.current.speak(u);
      } catch {
        setIsSpeaking(false);
        resumeVoiceAgent();
      }
    },
    [canChat, voiceProvider, voiceLanguage, voiceSpeed, pickBestVoice, resumeVoiceAgent],
  );

  /* -------------------- Conversation helpers -------------------- */
  const handleNewConversation = useCallback(() => {
    if (!canChat) { showError('Permission denied', 'You do not have permission to start new chats.'); return; }
    const conv: Conversation = { id: uid(), title: 'New chat', updated_at: new Date().toISOString(), messages: [] };
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(conv.id);
    setSuggestions([]);
  }, [canChat, showError]);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      if (!canChat) { showError('Permission denied', 'You do not have permission to delete conversations.'); return; }
      if (!window.confirm('Delete this conversation?')) return;
      setConversations((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        setActiveConversationId((cur) => (cur !== id ? cur : remaining.length > 0 ? remaining[0].id : null));
        return remaining;
      });
    },
    [canChat, showError],
  );

  const handleClearAll = useCallback(() => {
    if (!canChat) { showError('Permission denied', 'You do not have permission to clear conversations.'); return; }
    if (!window.confirm('Clear all conversations? This cannot be undone.')) return;
    setConversations([]);
    setActiveConversationId(null);
    showSuccess('Cleared', 'All conversations removed.');
    safeLog('AI Assistant', 'Clear all', 'success', 'Cleared all conversations');
  }, [canChat, showSuccess, showError]);

  const handleTogglePin = useCallback(
    (id: string) => {
      if (!canChat) return;
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
    },
    [canChat],
  );

  const handleStartRename = useCallback(
    (conv: Conversation) => {
      if (!canChat) return;
      setEditingTitleId(conv.id);
      setEditingTitleValue(conv.title);
    },
    [canChat],
  );

  const handleCommitRename = useCallback(() => {
    const trimmed = editingTitleValue.trim();
    if (!trimmed || !editingTitleId) { setEditingTitleId(null); return; }
    setConversations((prev) =>
      prev.map((c) => (c.id === editingTitleId ? { ...c, title: trimmed, updated_at: new Date().toISOString() } : c)),
    );
    setEditingTitleId(null);
  }, [editingTitleId, editingTitleValue]);

  /* -------------------- Send message -------------------- */
  const sendMessage = useCallback<SendMessageFn>(
    async (textOverride, isRegenerate = false) => {
      if (!canChat) { showError('Permission denied', 'You do not have permission to chat.'); return; }

      const text = (textOverride ?? inputMessage).trim();
      if (!text || isTyping || !activeConversation) return;

      const userMsg: Message = {
        id: uid(),
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      };

      const previousMessages = activeConversation.messages ?? [];
      const updatedMessages = isRegenerate ? previousMessages : [...previousMessages, userMsg];
      const isFirstUserMessage = !isRegenerate && !previousMessages.some((m) => m.role === 'user');

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id
            ? {
                ...c,
                title: isFirstUserMessage ? truncate(text, 40) : c.title,
                updated_at: new Date().toISOString(),
                messages: updatedMessages,
              }
            : c,
        ),
      );

      setInputMessage('');
      setIsTyping(true);
      setSuggestions([]);

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const historySource = isRegenerate ? previousMessages.slice(0, -1) : previousMessages;
        const history = historySource.slice(-20).map((m) => ({ role: m.role, text: m.content }));

        const res = await apiClient.geminiChat(text, history, learningMemory);

        if (controller.signal.aborted) return;

        const rawReply =
          (res as { response?: string })?.response ||
          (res as { data?: { response?: string } })?.data?.response ||
          '';
        if (!rawReply.trim()) {
          throw new Error('The AI service returned an empty response. Check Settings → AI and retry.');
        }

        const dynSuggestions = rawReply
          .split('\n')
          .map((line) => line.match(/^\s*FOLLOW_UP:\s*(.+)$/i)?.[1]?.trim())
          .filter((line): line is string => Boolean(line))
          .slice(0, 3);
        const reply = rawReply.replace(/^\s*FOLLOW_UP:\s*.+$/gim, '').trim();
        setSuggestions(dynSuggestions);

        const aiMsg: Message = {
          id: uid(),
          role: 'assistant',
          content: reply,
          created_at: new Date().toISOString(),
        };

        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversation.id
              ? { ...c, last_message: reply, updated_at: new Date().toISOString(), messages: [...updatedMessages, aiMsg] }
              : c,
          ),
        );

        if (autoRead || voiceAgentActiveRef.current) void speakResponse(reply);
        safeLog('AI Assistant', 'AI Response', 'success', `Replied to: ${truncate(text, 40)}`);
      } catch (err: unknown) {
        if ((err as ApiErrorLike)?.name === 'AbortError') return;

        const message = getApiErrorMessage(err, 'AI request failed.');
        const errorMsg: Message = {
          id: uid(),
          role: 'assistant',
          content: message,
          created_at: new Date().toISOString(),
          error: true,
        };
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversation.id
              ? { ...c, messages: [...updatedMessages, errorMsg], updated_at: new Date().toISOString() }
              : c,
          ),
        );
        if (voiceAgentActiveRef.current) void speakResponse(errorMsg.content);
        showError('AI Error', message);
        safeLog('AI Assistant', 'AI Request', 'error', message);
      } finally {
        setIsTyping(false);
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
      }
    },
    [canChat, inputMessage, isTyping, activeConversation, autoRead, speakResponse, showError, learningMemory],
  );

  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsTyping(false);
    if (voiceAgentActiveRef.current) resumeVoiceAgent();
  }, [resumeVoiceAgent]);

  const handleRegenerate = useCallback(() => {
    if (!canChat) { showError('Permission denied', 'You do not have permission to regenerate responses.'); return; }
    if (!activeConversation) return;
    const msgs = activeConversation.messages ?? [];
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;

    const withoutLastAssistant = [...msgs];
    if (withoutLastAssistant.length && withoutLastAssistant[withoutLastAssistant.length - 1].role === 'assistant') {
      withoutLastAssistant.pop();
    }

    setConversations((prev) =>
      prev.map((c) => (c.id === activeConversation.id ? { ...c, messages: withoutLastAssistant } : c)),
    );

    window.setTimeout(() => {
      void sendMessageRef.current?.(lastUser.content, true);
    }, 50);
  }, [canChat, activeConversation, showError]);

  /* -------------------- Voice toggle -------------------- */
  const toggleVoice = useCallback(() => {
    if (!canChat) { showError('Permission denied', 'You do not have permission to use voice input.'); return; }
    const rec = recognitionRef.current;
    if (!rec) { showError('Not supported', 'Voice input is not supported in this browser.'); return; }

    if (voiceAgentActiveRef.current) {
      voiceAgentActiveRef.current = false;
      setVoiceAgentActive(false);
      awaitingVoiceReplyRef.current = false;
      try { rec.stop(); } catch { /* ignore */ }
      stopSpeaking();
      setIsListening(false);
    } else if (isListening) {
      try { rec.stop(); } catch { /* ignore */ }
      setIsListening(false);
    } else {
      voiceAgentActiveRef.current = true;
      setVoiceAgentActive(true);
      stopSpeaking();
      setAutoRead(true);
      try { rec.start(); setIsListening(true); }
      catch { setIsListening(false); showError('Voice error', 'Could not start voice recognition.'); }
    }
  }, [canChat, isListening, showError, stopSpeaking]);

  /* -------------------- Copy / feedback / export -------------------- */
  const handleCopyMessage = useCallback(
    async (content: string) => {
      try { await navigator.clipboard.writeText(content); }
      catch { showError('Copy failed', 'Could not copy to clipboard.'); }
    },
    [showError],
  );

  useEffect(() => { setSuggestions([]); }, [activeConversationId]);

  const handleAgentFeedback = useCallback(
    (_answer: string, helpful: boolean) => {
      if (helpful) {
        const note = 'User feedback: keep answers direct and practical like the response the owner marked helpful.';
        setLearningMemory((prev) => `${prev.trim()}${prev.trim() ? '\n' : ''}${note}`.slice(-1500));
        showSuccess('Agent learned', 'Your preference was saved for future conversations on this device.');
        return;
      }
      const correction = window.prompt('What should the agent remember or correct next time?');
      if (!correction?.trim()) return;
      const note = `Owner correction: ${correction.trim()}`;
      setLearningMemory((prev) => `${prev.trim()}${prev.trim() ? '\n' : ''}${note}`.slice(-1500));
      showSuccess('Correction saved', 'The agent will use your correction as guidance.');
    },
    [showSuccess],
  );

  const handleExportChat = useCallback(() => {
    try {
      if (!activeConversation?.messages?.length) { showError('Export failed', 'No messages to export.'); return; }
      const text = activeConversation.messages
        .map((m) => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`)
        .join('\n\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-chat-${activeConversation.title.slice(0, 20).replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('Export', 'Chat exported.');
      safeLog('AI Assistant', 'Export chat', 'success', `Exported ${activeConversation.title}`);
    } catch (err: unknown) {
      showError('Export failed', getApiErrorMessage(err, 'Could not export chat.'));
    }
  }, [activeConversation, showSuccess, showError]);

  /* -------------------- Guards -------------------- */
  if (loadingUser && !hasUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Loading permissions…
        </div>
      </div>
    );
  }

  if (!canView && !canChat) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiLock size={22} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Access denied</h2>
          <p className="mt-1.5 text-sm text-slate-500">You don't have permission to view the AI assistant.</p>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <>
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.18s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .ai-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .ai-scroll::-webkit-scrollbar-track { background: transparent; }
        .ai-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 8px; }
        .ai-scroll::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
        .orb-ping { animation: orbPing 1.6s ease-out infinite; }
        @keyframes orbPing { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.35); opacity: 0; } }
      `}</style>

      <div className="flex h-screen min-h-0 flex-col bg-slate-50">
        <div className="mx-auto flex w-full max-w-[1900px] flex-1 flex-col gap-4 overflow-hidden p-3 sm:p-4 lg:gap-5 lg:p-6">

          {/* ---- Hero (only dark block) ---- */}
          <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0a1628] via-[#0d1a30] to-[#0a1224] px-5 py-6 shadow-[0_20px_60px_-30px_rgba(16,185,129,0.35)] sm:px-7 lg:px-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-teal-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100 backdrop-blur">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  <FiCpu size={12} /> AI · Operations agent
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Raptor AI · Business agent
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Real ERP answers, adaptive next steps, and hands-free voice conversation.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!canChat && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                    Read-only
                  </span>
                )}
                <Button
                  variant="outline"
                  onClick={handleExportChat}
                  disabled={!hasMessages}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  <FiDownload className="mr-2" size={14} /> Export
                </Button>
                {canChat && (
                  <Button
                    onClick={handleNewConversation}
                    className="h-10 rounded-xl bg-gradient-to-b from-emerald-300 to-emerald-400 font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:from-emerald-200 hover:to-emerald-300"
                  >
                    <FiPlus className="mr-2" size={14} /> New chat
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* ---- Info banner ---- */}
          <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-950">
            <FiInfo className="mt-0.5 shrink-0" size={14} />
            <p>
              <strong>Boss mode:</strong> ask in your own words — the agent reads live ERP summaries,
              follows your saved working notes, and suggests follow-up questions. Use the floating
              voice orb for spoken questions. It advises and reads data, but never silently posts or
              edits transactions. Configure Gemini &amp; ElevenLabs under <em>Settings → AI</em>.
            </p>
          </div>

          {!canChat && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <div className="flex items-start gap-2">
                <FiLock className="mt-0.5 shrink-0" size={14} />
                <span>
                  You can browse and export existing conversations, but you cannot start new chats,
                  send messages, or use voice input. Ask an administrator to grant you{' '}
                  <code className="rounded bg-amber-100 px-1">chat with ai assistant</code>.
                </span>
              </div>
            </div>
          )}

          {/* ---- Main layout ---- */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">

            {/* Sidebar */}
            <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-white px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/10">
                    <FiMessageSquare size={13} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Conversations</p>
                    <p className="text-[10px] text-slate-500">{conversations.length} total</p>
                  </div>
                </div>
                {canChat && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAll}
                    disabled={conversations.length === 0}
                    className="h-7 rounded-lg px-2 text-[11px] font-medium text-slate-500 hover:text-rose-600 disabled:opacity-40"
                  >
                    Clear
                  </Button>
                )}
              </CardHeader>

              <div className="border-b border-slate-100 bg-white p-2.5">
                <div className="relative">
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    ref={searchInputRef}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search chats…"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-12 text-xs text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium text-slate-400 md:block">
                    Ctrl K
                  </span>
                </div>
              </div>

              <div className="ai-scroll flex-1 overflow-y-auto bg-slate-50/60 p-1.5">
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
                          isActive ? 'bg-white shadow-sm ring-1 ring-emerald-200' : 'hover:bg-white/80'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => { setActiveConversationId(conv.id); setActionMenuId(null); }}
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
                              className="w-full rounded-md border border-emerald-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5">
                                {conv.pinned && <FiStar size={10} className="fill-amber-400 text-amber-400" />}
                                <p className="truncate text-xs font-semibold text-slate-800">{conv.title}</p>
                              </div>
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

                        {canChat && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setActionMenuId(isMenuOpen ? null : conv.id); }}
                              className={`grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${
                                isMenuOpen ? 'bg-slate-100 text-slate-700' : 'opacity-0 group-hover:opacity-100'
                              }`}
                              aria-label="Chat actions"
                            >
                              <FiMoreVertical size={13} />
                            </button>
                            {isMenuOpen && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setActionMenuId(null)} />
                                <div className="animate-fadeIn absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10">
                                  <button
                                    type="button"
                                    onClick={() => { setActionMenuId(null); handleTogglePin(conv.id); }}
                                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 transition hover:bg-slate-50"
                                  >
                                    <FiStar size={12} className={conv.pinned ? 'fill-amber-400 text-amber-500' : 'text-slate-400'} />
                                    {conv.pinned ? 'Unpin' : 'Pin to top'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setActionMenuId(null); handleStartRename(conv); }}
                                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 transition hover:bg-slate-50"
                                  >
                                    <FiEdit size={12} className="text-emerald-500" /> Rename
                                  </button>
                                  <div className="my-0.5 border-t border-slate-100" />
                                  <button
                                    type="button"
                                    onClick={() => { setActionMenuId(null); handleDeleteConversation(conv.id); }}
                                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                                  >
                                    <FiTrash2 size={12} /> Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Chat panel */}
            <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
              {!activeConversation ? (
                <CardContent className="flex flex-1 items-center justify-center py-20 text-center">
                  <div>
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                      <FiMessageSquare className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-slate-800">No conversation selected</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {canChat ? 'Create a new chat to get started.' : 'No conversations available.'}
                    </p>
                    {canChat && (
                      <Button
                        onClick={handleNewConversation}
                        className="mt-5 rounded-xl bg-emerald-600 font-semibold hover:bg-emerald-700"
                      >
                        <FiPlus className="mr-2" size={14} /> New chat
                      </Button>
                    )}
                  </div>
                </CardContent>
              ) : (
                <>
                  {/* Chat header */}
                  <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                        <FiCpu size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{activeConversation.title}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {messages.length} message{messages.length === 1 ? '' : 's'}
                          {activeConversation.updated_at && <> · {formatRelative(activeConversation.updated_at)}</>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                          ttsSource === 'cloud'
                            ? 'border-teal-200 bg-teal-50 text-teal-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                      >
                        {ttsSource === 'cloud' ? 'Premium voice' : 'Browser voice'}
                      </Badge>
                      {isSpeaking && (
                        <Badge
                          variant="outline"
                          className="animate-pulse rounded-full border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                        >
                          Speaking…
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  {/* Messages */}
                  <div className="ai-scroll flex-1 space-y-4 overflow-y-auto bg-slate-50/60 p-4 sm:p-5">
                    {messages.length === 0 && !isTyping && (
                      <div className="flex h-full flex-col items-center justify-center text-center">
                        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-50 to-white ring-1 ring-emerald-100">
                          <FiZap className="h-6 w-6 text-emerald-500" />
                        </div>
                        <p className="mt-4 text-base font-semibold text-slate-800">Start a conversation</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {canChat ? 'Try one of these, or ask anything about your business.' : 'Read-only view.'}
                        </p>
                        {canChat && (
                          <div className="mt-5 flex max-w-md flex-wrap justify-center gap-1.5">
                            {QUICK_PROMPTS.map((prompt) => (
                              <button
                                key={prompt}
                                type="button"
                                onClick={() => void sendMessage(prompt)}
                                className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-medium text-emerald-700 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50"
                              >
                                {prompt}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        onCopy={handleCopyMessage}
                        onFeedback={handleAgentFeedback}
                      />
                    ))}

                    {isTyping && (
                      <div className="flex gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                          <FiCpu size={14} />
                        </div>
                        <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                          <div className="flex gap-1">
                            <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: '0.15s' }} />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: '0.3s' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Composer */}
                  {canChat ? (
                    <div className="border-t border-slate-100 bg-white p-3 sm:p-4">
                      {/* Voice row */}
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShowVoiceSettings((v) => !v)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                              showVoiceSettings
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <FiSettings size={11} /> Voice
                          </button>
                          <button
                            type="button"
                            onClick={() => void speakResponse('Hello! This is a preview of my voice. I sound natural and clear.')}
                            className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 transition hover:bg-teal-100"
                          >
                            <FiCpu size={11} /> Preview
                          </button>
                          {isSpeaking && (
                            <button
                              type="button"
                              onClick={stopSpeaking}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100"
                            >
                              <FiStopCircle size={11} /> Stop
                            </button>
                          )}
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-600">
                          <input
                            type="checkbox"
                            checked={autoRead}
                            onChange={(e) => setAutoRead(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          Auto-read
                        </label>
                      </div>

                      {showVoiceSettings && (
                        <div className="animate-fadeIn mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Provider</label>
                              <div className="relative">
                                <select
                                  value={voiceProvider}
                                  onChange={(e) => setVoiceProvider(e.target.value as 'browser' | 'cloud')}
                                  className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-2.5 pr-8 text-xs font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
                                >
                                  <option value="cloud">Premium voice</option>
                                  <option value="browser">Browser voice</option>
                                </select>
                                <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                              </div>
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Language</label>
                              <div className="relative">
                                <select
                                  value={voiceLanguage}
                                  onChange={(e) => setVoiceLanguage(e.target.value as 'en-US' | 'hi-IN')}
                                  className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-2.5 pr-8 text-xs font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
                                >
                                  <option value="en-US">English</option>
                                  <option value="hi-IN">Hindi</option>
                                </select>
                                <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
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
                                className="mt-2 w-full accent-emerald-600"
                              />
                            </div>
                          </div>
                          <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Teach your agent · owner-approved working notes
                            <textarea
                              value={learningMemory}
                              onChange={(e) => setLearningMemory(e.target.value.slice(0, 1500))}
                              placeholder="e.g. Our branches use INR; prioritise avoiding stockouts over holding less inventory."
                              rows={2}
                              className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                            />
                            <span className="mt-1 block font-normal normal-case tracking-normal text-slate-400">
                              Saved on this device and sent as guidance on future chats. Does not retrain the model.
                            </span>
                          </label>
                        </div>
                      )}

                      {/* Input row */}
                      <div className="flex items-end gap-2">
                        <button
                          type="button"
                          onClick={toggleVoice}
                          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition ${
                            isListening
                              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                              : voiceAgentActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title={isListening ? 'Stop listening' : 'Start voice input'}
                          aria-label={isListening ? 'Stop listening' : 'Start voice input'}
                        >
                          {isListening ? <FiMicOff size={17} /> : <FiMic size={17} />}
                        </button>

                        <textarea
                          value={inputMessage}
                          onChange={(e) => {
                            setInputMessage(e.target.value);
                            if (isSpeaking) stopSpeaking();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void sendMessage();
                            }
                          }}
                          placeholder={isListening ? 'Listening…' : 'Ask me anything about your business…'}
                          rows={1}
                          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50"
                          disabled={isTyping}
                        />

                        {isTyping ? (
                          <button
                            type="button"
                            onClick={handleStop}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-500 text-white transition hover:bg-rose-600"
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
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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

                      {suggestions.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Explore this answer
                          </p>
                          <div className="ai-scroll flex gap-1.5 overflow-x-auto pb-0.5">
                            {suggestions.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => void sendMessage(s)}
                                disabled={isTyping}
                                className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-900 transition hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                <FiCornerUpLeft className="mr-1 inline" size={10} /> {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border-t border-slate-100 bg-white px-4 py-3 text-center text-xs text-slate-500">
                      <FiLock className="mr-1 inline" size={11} />
                      Read-only — the composer is disabled.
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>

        {/* ---- Floating voice orb ---- */}
        {canChat && (
          <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-2">
            {(voiceAgentActive || isListening || isSpeaking) && (
              <span
                className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-widest shadow-lg ${
                  isListening
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : isSpeaking
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                {isListening
                  ? 'Listening · speak now'
                  : isSpeaking
                  ? 'Agent speaking'
                  : isTyping
                  ? 'Thinking · will listen again'
                  : 'Voice agent active'}
              </span>
            )}
            <button
              type="button"
              onClick={toggleVoice}
              title={voiceAgentActive ? 'End voice conversation' : 'Start a hands-free voice-to-voice conversation'}
              aria-label={voiceAgentActive ? 'End voice conversation' : 'Talk to Raptor AI'}
              className={`relative grid h-[68px] w-[68px] place-items-center rounded-full border text-white shadow-2xl transition duration-300 hover:scale-105 ${
                isListening
                  ? 'border-rose-300 bg-gradient-to-br from-rose-500 to-orange-600 shadow-rose-500/40'
                  : isSpeaking
                  ? 'border-emerald-300 bg-gradient-to-br from-emerald-400 to-teal-600 shadow-emerald-500/50'
                  : voiceAgentActive
                  ? 'border-emerald-200 bg-gradient-to-br from-emerald-600 to-teal-800 shadow-emerald-500/40'
                  : 'border-emerald-300/50 bg-gradient-to-br from-emerald-500 to-teal-700 shadow-emerald-600/30 hover:from-emerald-400 hover:to-teal-600'
              }`}
            >
              <span
                className={`absolute inset-[-7px] rounded-full border border-emerald-300/50 ${
                  isListening || isSpeaking ? 'orb-ping' : 'animate-pulse'
                }`}
              />
              {isListening ? <FiMicOff size={24} /> : isSpeaking ? <FiVolume2 size={25} /> : <FiRadio size={25} />}
            </button>
            <span className="text-[10px] font-semibold tracking-wide text-slate-600">VOICE AGENT</span>
          </div>
        )}
      </div>
    </>
  );
}

export default AIAssistantPage;