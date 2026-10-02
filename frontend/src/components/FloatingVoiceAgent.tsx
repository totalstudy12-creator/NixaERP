// src/components/FloatingVoiceAgent.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  Fragment,
} from 'react';
import type { ReactNode } from 'react';
import {
  MessageCircle,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  X,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Sparkles,
  StopCircle,
  AlertCircle,
  CornerUpLeft,
  Settings2,
  ChevronDown,
  Headphones,
} from 'lucide-react';
import { apiClient } from '../api';
import { useAuthStore } from '../store/auth';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
  createdAt?: number;
  /** FOLLOW_UP suggestions attached to this assistant message. */
  suggestions?: string[];
}

type VoiceProvider = 'browser' | 'cloud';
type VoiceLanguage = 'en-US' | 'hi-IN';

interface RecognitionAlternative { transcript: string; }
interface RecognitionEvent { results: ArrayLike<ArrayLike<RecognitionAlternative>>; }
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const browser = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

/* ------------------------------------------------------------------ */
/* Safe markdown renderer (all React-escaped, no innerHTML)           */
/* ------------------------------------------------------------------ */

function renderInline(text: string, keyPrefix = ''): ReactNode {
  if (!text) return null;
  const regex = /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>()]+)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const s = m[0];
    const k = `${keyPrefix}-i${key++}`;

    if (s.startsWith('**') && s.endsWith('**')) {
      nodes.push(<strong key={k} className="font-bold text-slate-900">{s.slice(2, -2)}</strong>);
    } else if (s.startsWith('__') && s.endsWith('__')) {
      nodes.push(<u key={k} className="underline underline-offset-2 decoration-emerald-500/60">{s.slice(2, -2)}</u>);
    } else if (s.startsWith('~~') && s.endsWith('~~')) {
      nodes.push(<s key={k} className="line-through opacity-70">{s.slice(2, -2)}</s>);
    } else if (s.startsWith('`') && s.endsWith('`')) {
      nodes.push(
        <code key={k} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-rose-600 ring-1 ring-slate-200">
          {s.slice(1, -1)}
        </code>,
      );
    } else if (s.startsWith('[')) {
      const lm = s.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm) {
        nodes.push(
          <a
            key={k}
            href={lm[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-700"
          >
            {lm[1]}
          </a>,
        );
      } else {
        nodes.push(s);
      }
    } else if (/^https?:\/\//.test(s)) {
      nodes.push(
        <a
          key={k}
          href={s}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-700 break-all"
        >
          {s}
        </a>,
      );
    } else if (s.startsWith('*') && s.endsWith('*')) {
      nodes.push(<em key={k} className="italic">{s.slice(1, -1)}</em>);
    } else if (s.startsWith('_') && s.endsWith('_')) {
      nodes.push(<em key={k} className="italic">{s.slice(1, -1)}</em>);
    } else {
      nodes.push(s);
    }
    last = m.index + s.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : text;
}

type MdBlock =
  | { type: 'code'; content: string }
  | { type: 'heading'; level: number; content: string }
  | { type: 'hr' }
  | { type: 'quote'; content: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'p'; content: string };

function parseMarkdownBlocks(input: string): MdBlock[] {
  if (!input) return [];
  const blocks: MdBlock[] = [];
  const parts = input.split(/```/);

  for (let i = 0; i < parts.length; i++) {
    const isCode = i % 2 === 1;
    const part = parts[i];

    if (isCode) {
      const cleaned = part.replace(/^[a-zA-Z0-9_+-]*\n/, '').replace(/\n$/, '');
      blocks.push({ type: 'code', content: cleaned });
      continue;
    }

    const paras = part.split(/\n{2,}/);
    for (const para of paras) {
      const trimmed = para.replace(/\n+$/, '').replace(/^\n+/, '');
      if (!trimmed) continue;
      blocks.push(...classifyParagraph(trimmed));
    }
  }
  return blocks;
}

function classifyParagraph(text: string): MdBlock[] {
  const lines = text.split('\n');

  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(text.trim())) return [{ type: 'hr' }];

  const hm = text.match(/^(#{1,6})\s+(.+)$/);
  if (hm && lines.length === 1) {
    return [{ type: 'heading', level: hm[1].length, content: hm[2].trim() }];
  }

  if (lines.length > 0 && lines.every((l) => /^\s*>\s?/.test(l))) {
    return [{ type: 'quote', content: lines.map((l) => l.replace(/^\s*>\s?/, '')).join('\n') }];
  }

  if (lines.length > 0 && lines.every((l) => /^\s*[-*•+]\s+/.test(l))) {
    return [{ type: 'ul', items: lines.map((l) => l.replace(/^\s*[-*•+]\s+/, '')) }];
  }

  if (lines.length > 0 && lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
    return [{ type: 'ol', items: lines.map((l) => l.replace(/^\s*\d+[.)]\s+/, '')) }];
  }

  return [{ type: 'p', content: text }];
}

function renderBlock(block: MdBlock, key: string): ReactNode {
  switch (block.type) {
    case 'code':
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[12px] leading-relaxed text-slate-100 shadow-sm"
        >
          <code className="font-mono whitespace-pre">{block.content}</code>
        </pre>
      );

    case 'heading': {
      const lvl = Math.min(6, Math.max(1, block.level));
      const cls = [
        'text-base font-bold',
        'text-sm font-bold',
        'text-sm font-semibold',
        'text-xs font-semibold',
        'text-xs font-semibold',
        'text-xs font-semibold',
      ][lvl - 1];
      const H = (`h${lvl}`) as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return <H key={key} className={`${cls} mt-1 text-slate-900`}>{renderInline(block.content, key)}</H>;
    }

    case 'hr':
      return <hr key={key} className="my-2 border-slate-200" />;

    case 'quote':
      return (
        <blockquote
          key={key}
          className="rounded-r-md border-l-4 border-emerald-400 bg-emerald-50/60 px-3 py-2 text-sm italic text-slate-700"
        >
          {renderInline(block.content, key)}
        </blockquote>
      );

    case 'ul':
      return (
        <ul key={key} className="ml-1 space-y-1 pl-4">
          {block.items.map((it, i) => (
            <li key={i} className="relative pl-3">
              <span className="absolute left-0 top-[0.55em] h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {renderInline(it, `${key}-${i}`)}
            </li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol key={key} className="ml-1 space-y-1 pl-4">
          {block.items.map((it, i) => (
            <li key={i} className="relative pl-5">
              <span className="absolute left-0 top-0 text-[11px] font-semibold text-emerald-600">
                {i + 1}.
              </span>
              {renderInline(it, `${key}-${i}`)}
            </li>
          ))}
        </ol>
      );

    case 'p':
    default: {
      const lines = block.content.split('\n');
      return (
        <p key={key} className="leading-relaxed">
          {lines.map((l, i) => (
            <Fragment key={i}>
              {renderInline(l, `${key}-${i}`)}
              {i < lines.length - 1 && <br />}
            </Fragment>
          ))}
        </p>
      );
    }
  }
}

const FormattedMessage = memo(({ text }: { text: string }) => {
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => renderBlock(b, `b${i}`))}
    </div>
  );
});
FormattedMessage.displayName = 'FormattedMessage';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const QUICK_PROMPTS = [
  'Summarize today\'s revenue',
  'Which items are low on stock?',
  'Who are my top customers?',
  'What were sales this month?',
];

interface AgentPosition {
  right: number;
  bottom: number;
}

const AGENT_POSITION_KEY = 'floating-ai-agent-position';

function clampAgentPosition(
  position: AgentPosition,
  viewportWidth: number,
  viewportHeight: number,
  elementWidth: number,
  elementHeight: number,
): AgentPosition {
  return {
    right: Math.min(Math.max(12, position.right), Math.max(12, viewportWidth - elementWidth - 12)),
    bottom: Math.min(Math.max(12, position.bottom), Math.max(12, viewportHeight - elementHeight - 12)),
  };
}

const sameDay = (a?: number, b?: number): boolean => {
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
};

const formatTime = (ts?: number): string => {
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  } catch {
    return '';
  }
};

const formatDateLabel = (ts?: number): string => {
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(ts));
  } catch {
    return '';
  }
};

/**
 * Strip markdown syntax so TTS reads clean prose, not asterisks/backticks.
 * Also strips any FOLLOW_UP lines that slipped through.
 */
const cleanForTts = (text: string): string =>
  text
    .replace(/^\s*FOLLOW_UP:\s*.+$/gim, '')
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*•+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Parse a raw assistant reply:
 *  - Extract `FOLLOW_UP: <text>` lines into `suggestions`
 *  - Return the message body with those lines removed
 *
 * Matches how AIAssistantPage handles the same protocol.
 */
function parseFollowUps(raw: string): { body: string; suggestions: string[] } {
  const suggestions = raw
    .split('\n')
    .map((line) => line.match(/^\s*FOLLOW_UP:\s*(.+)$/i)?.[1]?.trim())
    .filter((line): line is string => Boolean(line))
    .slice(0, 3);
  const body = raw.replace(/^\s*FOLLOW_UP:\s*.+$/gim, '').trim();
  return { body, suggestions };
}

/* ------------------------------------------------------------------ */
/* Main component                                                     */
/* ------------------------------------------------------------------ */

export function FloatingVoiceAgent() {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loadingUser = useAuthStore((state) => state.loadingUser);

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [position, setPosition] = useState<AgentPosition>(() => {
    try {
      const stored = window.localStorage.getItem(AGENT_POSITION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AgentPosition;
        if (Number.isFinite(parsed.right) && Number.isFinite(parsed.bottom)) return parsed;
      }
    } catch { /* use the default position */ }
    return { right: 20, bottom: 20 };
  });

  /* Voice settings */
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>('cloud');
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>('en-US');
  const [voiceSpeed, setVoiceSpeed] = useState(0.96);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [ttsSource, setTtsSource] = useState<'browser' | 'cloud'>('browser');

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const nextMessageId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const agentContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    right: number;
    bottom: number;
    moved: boolean;
  } | null>(null);
  const suppressLauncherClickRef = useRef(false);

  const canChat = isAuthenticated && !loadingUser && hasPermission('chat with ai assistant');

  /* ---- Speech synthesis bootstrap ---- */
  useEffect(() => {
    if ('speechSynthesis' in window) {
      synthesisRef.current = window.speechSynthesis;
    }
  }, []);

  useEffect(() => {
    const keepInViewport = () => {
      const container = agentContainerRef.current;
      if (!container) return;
      const next = clampAgentPosition(
        position,
        window.innerWidth,
        window.innerHeight,
        container.offsetWidth,
        container.offsetHeight,
      );
      if (next.right !== position.right || next.bottom !== position.bottom) {
        setPosition(next);
        try { window.localStorage.setItem(AGENT_POSITION_KEY, JSON.stringify(next)); } catch { /* non-fatal */ }
      }
    };

    keepInViewport();
    window.addEventListener('resize', keepInViewport);
    return () => window.removeEventListener('resize', keepInViewport);
  }, [isOpen, position]);

  /* ---- Auto-scroll ---- */
  useEffect(() => {
    try { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch { /* ignore */ }
  }, [messages, isSending, isSpeaking]);

  /* ---- Unmount cleanup ---- */
  useEffect(() => () => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    try { synthesisRef.current?.cancel(); } catch { /* ignore */ }
    try { activeAudioRef.current?.pause(); } catch { /* ignore */ }
    activeAudioRef.current = null;
  }, []);

  /* ---- Stop speaking (covers both cloud + browser) ---- */
  const stopSpeaking = useCallback(() => {
    try { synthesisRef.current?.cancel(); } catch { /* ignore */ }
    try {
      const audio = activeAudioRef.current;
      if (audio) { audio.pause(); audio.currentTime = 0; }
    } catch { /* ignore */ }
    activeAudioRef.current = null;
    setIsSpeaking(false);
  }, []);

  /* ---- Pick best browser voice ---- */
  const pickBestVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (!('speechSynthesis' in window)) return null;
    try {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return null;
      return (
        voices.find((v) => {
          const name = v.name.toLowerCase();
          const lang = v.lang.toLowerCase();
          return (
            /female|samantha|aria|zira|susan|jenny|olivia|danielle/i.test(name) ||
            (/en-us|en-gb|en-in|hi-in/i.test(lang))
          );
        }) ??
        voices.find((v) => /en-us|en-gb|en-in/i.test(v.lang.toLowerCase())) ??
        voices[0] ??
        null
      );
    } catch {
      return null;
    }
  }, []);

  /* ---- Speak a reply (premium first, browser fallback) ---- */
  const speakResponse = useCallback(async (text: string, onDone?: () => void) => {
    const finished = () => { onDone?.(); };
    if (!text || !speakReplies) { finished(); return; }

    /* ---- Try cloud / premium provider ---- */
    if (voiceProvider === 'cloud') {
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
              finished();
            };
            audio.onerror = () => {
              if (activeAudioRef.current === audio) activeAudioRef.current = null;
              setIsSpeaking(false);
              finished();
            };
            await audio.play();
            /* Guard: user pressed Stop while play() was pending. */
            if (activeAudioRef.current !== audio) {
              try { audio.pause(); } catch { /* ignore */ }
            }
            return;
          } catch {
            activeAudioRef.current = null;
            setIsSpeaking(false);
            /* fall through to browser */
          }
        }
      } catch { /* fall through to browser */ }
    }

    /* ---- Browser fallback ---- */
    setTtsSource('browser');
    if (!synthesisRef.current || !('speechSynthesis' in window)) { finished(); return; }
    const cleanText = cleanForTts(text);
    if (!cleanText) { finished(); return; }

    try {
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
      utterance.onend = () => { setIsSpeaking(false); finished(); };
      utterance.onerror = () => { setIsSpeaking(false); finished(); };
      synthesisRef.current.speak(utterance);
    } catch {
      setIsSpeaking(false);
      finished();
    }
  }, [speakReplies, voiceProvider, voiceLanguage, voiceSpeed, pickBestVoice]);

  /* ---- Send message ---- */
  const sendMessage = useCallback(async (textValue = draft) => {
    const text = textValue.trim();
    if (!text || isSending || !canChat) return;

    const previousMessages = messages;
    const userMsg: AgentMessage = {
      id: ++nextMessageId.current,
      role: 'user',
      text,
      createdAt: Date.now(),
    };
    setMessages((previous) => [...previous, userMsg]);
    setDraft('');
    setError(null);
    setIsSending(true);

    /* Interrupt any ongoing speech so the new reply isn't drowned out. */
    stopSpeaking();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = previousMessages.slice(-12).map((message) => ({
        role: message.role,
        text: message.text,
      }));
      const response = await apiClient.geminiChat(text, history);

      if (controller.signal.aborted) return;

      const payload = response as { response?: unknown; data?: { response?: unknown } };
      const replyValue = payload.response ?? payload.data?.response;
      const rawReply = typeof replyValue === 'string' ? replyValue.trim() : '';
      if (!rawReply) throw new Error('The assistant returned an empty response.');

      /* ---- FOLLOW_UP parsing ---- */
      const { body, suggestions } = parseFollowUps(rawReply);

      const aiMsg: AgentMessage = {
        id: ++nextMessageId.current,
        role: 'assistant',
        text: body,
        suggestions: suggestions.length ? suggestions : undefined,
        createdAt: Date.now(),
      };
      setMessages((previous) => [...previous, aiMsg]);

      /* Auto-speak when auto-read is on */
      if (speakReplies) {
        void speakResponse(body);
      }
    } catch (requestError) {
      if ((requestError as { name?: string })?.name === 'AbortError') return;
      const candidate = requestError as { backendMessage?: string; message?: string };
      const message = candidate.backendMessage || candidate.message || 'Unable to reach the assistant.';
      setError(message);
      setMessages((previous) => [
        ...previous,
        {
          id: ++nextMessageId.current,
          role: 'assistant',
          text: message,
          createdAt: Date.now(),
          error: true,
        },
      ]);
    } finally {
      setIsSending(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [canChat, draft, isSending, messages, speakReplies, stopSpeaking, speakResponse]);

  /* ---- Speech recognition ---- */
  const startListening = useCallback(() => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setError('Voice input is not supported in this browser. You can still type a message.');
      return;
    }

    try { recognitionRef.current?.stop(); } catch { /* ignore */ }

    const recognition = new Recognition();
    recognition.lang = voiceLanguage === 'hi-IN' ? 'hi-IN' : 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      setIsListening(false);
      if (transcript) void sendMessage(transcript);
    };
    recognition.onerror = () => {
      setIsListening(false);
      setError('Could not recognize speech. Please try again or type your message.');
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;

    try {
      recognition.start();
      setError(null);
      setIsListening(true);
      stopSpeaking();
    } catch {
      setIsListening(false);
      setError('Could not start voice input. Check microphone permission.');
    }
  }, [sendMessage, stopSpeaking, voiceLanguage]);

  /* ---- Retry last user message ---- */
  const handleRetry = useCallback((errorMsgId: number) => {
    const idx = messages.findIndex((m) => m.id === errorMsgId);
    if (idx < 0) return;
    let lastUser: string | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUser = messages[i].text; break; }
    }
    if (!lastUser) return;
    setMessages((prev) => prev.slice(0, idx));
    window.setTimeout(() => void sendMessage(lastUser!), 40);
  }, [messages, sendMessage]);

  /* ---- Copy message ---- */
  const handleCopy = useCallback(async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1400);
    } catch { /* ignore */ }
  }, []);

  /* ---- Clear conversation ---- */
  const handleClear = useCallback(() => {
    if (!messages.length) return;
    if (!window.confirm('Clear this conversation?')) return;
    setMessages([]);
    setError(null);
    stopSpeaking();
  }, [messages.length, stopSpeaking]);

  /* ---- Voice status label ---- */
  const voiceStatus = isListening
    ? 'Listening · speak now'
    : isSending
    ? 'Thinking…'
    : isSpeaking
    ? (ttsSource === 'cloud' ? 'Agent speaking · premium' : 'Agent speaking')
    : null;

  if (!canChat) return null;

  return (
    <div
      ref={agentContainerRef}
      className="fixed z-[80] flex flex-col items-end gap-3"
      style={{ right: position.right, bottom: position.bottom }}
    >

      {/* ---------- Chat panel ---------- */}
      {isOpen && (
        <section
          aria-label="ERP voice agent"
          className="flex h-[min(660px,calc(100dvh-7rem))] w-[min(430px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)]"
        >
          {/* Header */}
          <header className="relative overflow-hidden bg-gradient-to-br from-[#0a1628] via-[#0d1a30] to-[#0a1224] px-4 py-3 text-white">
            <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-emerald-500/20 blur-3xl" />

            <div className="relative flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30">
                  <MessageCircle size={17} />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold tracking-tight">ERP Voice Agent</h2>
                  <p className="flex items-center gap-1.5 truncate text-[11px] text-slate-300">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isListening
                          ? 'animate-pulse bg-rose-400'
                          : isSending
                          ? 'animate-pulse bg-amber-400'
                          : isSpeaking
                          ? 'animate-pulse bg-emerald-400'
                          : 'bg-emerald-400/70'
                      }`}
                    />
                    {voiceStatus ?? (voiceProvider === 'cloud' ? 'Ready · premium voice' : 'Ready · browser voice')}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setShowVoiceSettings((v) => !v)}
                  className={`grid size-8 place-items-center rounded-md transition ${
                    showVoiceSettings
                      ? 'bg-white/15 text-white'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                  title="Voice settings"
                  aria-label="Voice settings"
                >
                  <Settings2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={!messages.length}
                  className="grid size-8 place-items-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
                  title="Clear conversation"
                  aria-label="Clear conversation"
                >
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpeakReplies((value) => {
                      const next = !value;
                      if (!next) stopSpeaking();
                      return next;
                    });
                  }}
                  className="grid size-8 place-items-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white"
                  title={speakReplies ? 'Mute spoken replies' : 'Enable spoken replies'}
                  aria-label={speakReplies ? 'Mute spoken replies' : 'Enable spoken replies'}
                >
                  {speakReplies ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    stopSpeaking();
                  }}
                  className="grid size-8 place-items-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white"
                  title="Close agent"
                  aria-label="Close agent"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Voice settings panel */}
            {showVoiceSettings && (
              <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                      Provider
                    </label>
                    <div className="relative">
                      <select
                        value={voiceProvider}
                        onChange={(e) => setVoiceProvider(e.target.value as VoiceProvider)}
                        className="h-8 w-full appearance-none rounded-lg border border-white/10 bg-white/10 px-2 pr-6 text-[11px] font-medium text-white outline-none"
                      >
                        <option value="cloud" className="text-slate-900">Premium (ElevenLabs)</option>
                        <option value="browser" className="text-slate-900">Browser voice</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-300" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                      Language
                    </label>
                    <div className="relative">
                      <select
                        value={voiceLanguage}
                        onChange={(e) => setVoiceLanguage(e.target.value as VoiceLanguage)}
                        className="h-8 w-full appearance-none rounded-lg border border-white/10 bg-white/10 px-2 pr-6 text-[11px] font-medium text-white outline-none"
                      >
                        <option value="en-US" className="text-slate-900">English</option>
                        <option value="hi-IN" className="text-slate-900">Hindi</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-300" />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                      <span>Speed</span>
                      <span className="text-white">{voiceSpeed.toFixed(2)}×</span>
                    </div>
                    <input
                      type="range"
                      min="0.75"
                      max="1.4"
                      step="0.05"
                      value={voiceSpeed}
                      onChange={(e) => setVoiceSpeed(Number(e.target.value))}
                      className="mt-2 w-full accent-emerald-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-300">
                    <Headphones size={11} />
                    Source: <span className="font-semibold text-white">{ttsSource === 'cloud' ? 'Premium' : 'Browser'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void speakResponse('Hello! This is a preview of my voice.')}
                    className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
                  >
                    Preview voice
                  </button>
                </div>
              </div>
            )}
          </header>

          {/* Body */}
          <div
            ref={scrollContainerRef}
            className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 px-3.5 py-4"
            aria-live="polite"
          >
            {messages.length === 0 && !isSending && (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 ring-1 ring-emerald-100">
                  <Sparkles className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-800">How can I help?</p>
                <p className="mt-1 text-xs text-slate-500">
                  Ask by voice or text — I use your live ERP data.
                </p>

                <div className="mt-5 flex w-full max-w-sm flex-wrap justify-center gap-1.5">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-medium text-emerald-700 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50"
                    >
                      <CornerUpLeft size={10} /> {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, i) => {
              const prev = i > 0 ? messages[i - 1] : undefined;
              const showDay = !prev || !sameDay(prev.createdAt, message.createdAt);
              const isUser = message.role === 'user';
              const isError = message.error;
              const isLast = i === messages.length - 1;

              return (
                <div key={message.id} className="space-y-3">
                  {showDay && message.createdAt && (
                    <div className="flex items-center gap-2 py-1">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        {formatDateLabel(message.createdAt)}
                      </span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                  )}

                  <div className={`group flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                        <Sparkles size={12} />
                      </div>
                    )}

                    <div className={`flex max-w-[85%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`text-sm shadow-sm ${
                          isUser
                            ? 'whitespace-pre-wrap rounded-2xl rounded-tr-md bg-emerald-600 px-3.5 py-2.5 text-white'
                            : isError
                            ? 'rounded-2xl rounded-tl-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-rose-900'
                            : 'rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3.5 py-2.5 text-slate-800'
                        }`}
                      >
                        {isUser ? message.text : <FormattedMessage text={message.text} />}
                      </div>

                      {/* FOLLOW_UP chips */}
                      {!isUser && !isError && message.suggestions && message.suggestions.length > 0 && (
                        <div className="mt-2 flex w-full flex-wrap gap-1.5">
                          {message.suggestions.map((s, si) => (
                            <button
                              key={`${message.id}-s${si}`}
                              type="button"
                              onClick={() => void sendMessage(s)}
                              disabled={isSending}
                              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <CornerUpLeft size={9} /> {s}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className={`flex items-center gap-1 px-1 text-[10px] text-slate-400 ${isUser ? 'flex-row-reverse' : ''}`}>
                        {message.createdAt && <span>{formatTime(message.createdAt)}</span>}

                        {!isUser && !isError && (
                          <button
                            type="button"
                            onClick={() => void speakResponse(message.text)}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
                            aria-label="Speak message"
                          >
                            <Volume2 size={10} /> Speak
                          </button>
                        )}

                        {!isUser && isError && isLast && (
                          <button
                            type="button"
                            onClick={() => handleRetry(message.id)}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-rose-600 transition hover:bg-rose-50"
                          >
                            <RefreshCw size={10} /> Retry
                          </button>
                        )}

                        {!isError && (
                          <button
                            type="button"
                            onClick={() => void handleCopy(message.id, message.text)}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
                            aria-label="Copy message"
                          >
                            {copiedId === message.id ? <Check size={10} /> : <Copy size={10} />}
                            {copiedId === message.id ? 'Copied' : 'Copy'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex gap-2.5">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                  <Sparkles size={12} />
                </div>
                <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: '0.15s' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              </div>
            )}

            {isSpeaking && (
              <div className="sticky bottom-0 mx-auto flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-emerald-700 shadow-lg backdrop-blur">
                <Volume2 size={12} className="animate-pulse" />
                Speaking…{ttsSource === 'cloud' ? ' (Premium)' : ''}
                <button
                  type="button"
                  onClick={stopSpeaking}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <StopCircle size={10} /> Stop
                </button>
              </div>
            )}

            {error && !messages.some((m) => m.error) && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
                <AlertCircle className="mr-1 inline" size={11} /> {error}
              </p>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <form
            className="border-t border-slate-200 bg-white p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={isListening ? () => recognitionRef.current?.stop() : startListening}
                disabled={isSending}
                className={`grid size-10 shrink-0 place-items-center rounded-xl transition ${
                  isListening
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                } disabled:opacity-50`}
                title={isListening ? 'Stop listening' : 'Speak to the agent'}
                aria-label={isListening ? 'Stop listening' : 'Speak to the agent'}
              >
                {isListening ? <MicOff size={17} /> : <Mic size={17} />}
              </button>

              <textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (isSpeaking) stopSpeaking();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder={isListening ? 'Listening…' : 'Ask anything about your business…'}
                aria-label="Message the voice agent"
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50"
              />

              <button
                type="submit"
                disabled={!draft.trim() || isSending}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                title="Send message"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ---------- Floating launcher ---------- */}
      <button
        type="button"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragStateRef.current = {
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
          const drag = dragStateRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - drag.startX;
          const deltaY = event.clientY - drag.startY;
          if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
          drag.moved = true;
          const container = agentContainerRef.current;
          if (!container) return;
          const next = clampAgentPosition(
            { right: drag.startRight - deltaX, bottom: drag.startBottom - deltaY },
            window.innerWidth,
            window.innerHeight,
            container.offsetWidth,
            container.offsetHeight,
          );
          drag.right = next.right;
          drag.bottom = next.bottom;
          setPosition(next);
        }}
        onPointerUp={(event) => {
          const drag = dragStateRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          dragStateRef.current = null;
          if (drag.moved) {
            suppressLauncherClickRef.current = true;
            setPosition({ right: drag.right, bottom: drag.bottom });
            try {
              window.localStorage.setItem(AGENT_POSITION_KEY, JSON.stringify({ right: drag.right, bottom: drag.bottom }));
            } catch { /* non-fatal */ }
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => { dragStateRef.current = null; }}
        onClick={() => {
          if (suppressLauncherClickRef.current) {
            suppressLauncherClickRef.current = false;
            return;
          }
          setIsOpen((open) => !open);
        }}
        className={`group relative flex h-14 touch-none cursor-grab items-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-[0_12px_28px_-12px_rgba(16,185,129,0.55)] transition-all duration-200 active:cursor-grabbing hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${
          isListening
            ? 'bg-gradient-to-br from-rose-500 to-orange-600 shadow-rose-500/40'
            : isSpeaking
            ? 'bg-gradient-to-br from-emerald-400 to-teal-600 shadow-emerald-500/50'
            : isOpen
            ? 'bg-gradient-to-br from-slate-900 via-indigo-900 to-cyan-800'
            : 'bg-gradient-to-br from-emerald-500 to-teal-700 hover:from-emerald-400 hover:to-teal-600'
        }`}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close ERP voice agent' : 'Open ERP voice agent'}
        title="Drag to move · click to open"
      >
        {(isListening || isSpeaking) && (
          <span className="absolute inset-[-6px] rounded-full border border-emerald-300/60 animate-ping" />
        )}

        {isOpen ? <X size={17} /> : <Mic size={17} />}
        <span>{isOpen ? 'Close agent' : 'Voice agent'}</span>

        {!isOpen && (isListening || isSpeaking) && (
          <span
            className={`ml-1 h-2 w-2 rounded-full ${
              isListening ? 'animate-pulse bg-rose-200' : 'animate-pulse bg-white/90'
            }`}
          />
        )}
      </button>
    </div>
  );
}

export default FloatingVoiceAgent;