import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import {
  FiPlus, FiTrash2, FiEdit, FiDownload,
  FiSearch, FiSend, FiMessageSquare, FiZap, FiSettings,
  FiUser, FiMic, FiMicOff
} from 'react-icons/fi';
import clsx from 'clsx';

const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

// ── Stable API Cache ──
function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300_000) {
  const cache = useRef(new Map<string, { data: T; timestamp: number }>()).current;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; });
  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) { setData(entry.data); setLoading(false); return; }
    }
    setLoading(true); setError(null);
    try {
      const res = await fetcherRef.current();
      const result = Array.isArray(res) ? res : (res as any).data ?? [];
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [key, ttlMs]);
  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error, refresh: () => fetchData(true) };
}

// ── Types ──
interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}
interface Conversation {
  id: number;
  title: string;
  last_message?: string;
  updated_at?: string;
  messages?: Message[];
}

// ── Skeletons ──
const ConversationListSkeleton = () => (
  <div className="space-y-2 p-4">
    {[...Array(8)].map((_, i) => (
      <div key={i} className="h-12 bg-slate-200 rounded-xl animate-pulse" />
    ))}
  </div>
);
const ChatAreaSkeleton = () => (
  <div className="flex-1 p-6 space-y-4 animate-pulse">
    <div className="h-6 w-48 bg-slate-200 rounded" />
    <div className="h-24 w-3/4 bg-slate-200 rounded-xl" />
    <div className="h-16 w-1/2 bg-slate-200 rounded-xl" />
    <div className="h-20 w-5/6 bg-slate-200 rounded-xl" />
  </div>
);

// ── Main Component ──
export function AIAssistantPage() {
  const { showSuccess, showError } = useNotification();
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [autoRead, setAutoRead] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Settings offcanvas
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingConversation, setEditingConversation] = useState<Conversation | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // ── API data ──
  const fetchInsights = useCallback(() => apiClient.getAIAssistantInsights(), []);
  const { data: insights, loading: insightsLoading } = useApiCache<any>('ai-insights', fetchInsights);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.getAiProviders();
        if (res && res.data) setProviders(res.data);
        if (res && res.data && res.data.length > 0) setSelectedProviderId(res.data[0].id);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // Seed initial conversation from real insights (only once)
  const seeded = useRef(false);
  useEffect(() => {
    if (!insightsLoading && insights && !seeded.current) {
      seeded.current = true;
      const summaryLines = [
        `Sales Growth: ${insights.summary?.sales_growth || 'N/A'}`,
        `Inventory Health: ${insights.summary?.inventory_health || 'N/A'}`,
        `Payroll Accuracy: ${insights.summary?.payroll_accuracy || 'N/A'}`,
        `Cash Position: ${insights.summary?.cash_position || 'N/A'}`,
      ];
      const recommendations = insights.recommendations?.length
        ? `\n\nRecommendations:\n${insights.recommendations.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}`
        : '';
      const welcomeMsg = `Here's your ERP snapshot:\n${summaryLines.join('\n')}${recommendations}`;
      const initialConv: Conversation = {
        id: Date.now(),
        title: 'ERP Insights',
        last_message: welcomeMsg,
        updated_at: new Date().toISOString(),
        messages: [
          { id: 100, conversation_id: 1, role: 'assistant', content: welcomeMsg, created_at: new Date().toISOString() },
        ],
      };
      setConversations([initialConv]);
      setActiveConversationId(initialConv.id);
      setMessages(initialConv.messages!);
    }
  }, [insights, insightsLoading]);

  // Load messages for active conversation
  useEffect(() => {
    if (activeConversationId) {
      const conv = conversations.find(c => c.id === activeConversationId);
      setMessages(conv?.messages || []);
    }
  }, [activeConversationId, conversations]);

  // Auto‑scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (!searchTerm.trim()) return conversations;
    const term = searchTerm.toLowerCase();
    return conversations.filter(c =>
      c.title.toLowerCase().includes(term) ||
      (c.last_message || '').toLowerCase().includes(term)
    );
  }, [conversations, searchTerm]);

  const summary = useMemo(() => ({
    total: conversations.length,
    today: conversations.filter(c => {
      const d = new Date(c.updated_at || '');
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length,
  }), [conversations]);

  // ── Voice input setup ──
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputMessage(prev => prev + ' ' + transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      showError('Not Supported', 'Voice input is not supported in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch { /* already started */ }
    }
  };

  // ── Conversation management ──
  const handleNewConversation = () => {
    const newConv: Conversation = {
      id: Date.now(),
      title: 'New Chat',
      last_message: '',
      updated_at: new Date().toISOString(),
      messages: [],
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setMessages([]);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isTyping || !activeConversationId) return;
    const userMsg: Message = {
      id: Date.now(),
      conversation_id: activeConversationId,
      role: 'user',
      content: inputMessage.trim(),
      created_at: new Date().toISOString(),
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputMessage('');
    setIsTyping(true);

    try {
      const response = await apiClient.sendAIAssistantChat(userMsg.content, selectedProviderId ?? undefined);
      const reply = response.reply || 'I can help with accounting, payroll, inventory, and sales insights.';
      const aiMsg: Message = {
        id: Date.now() + 1,
        conversation_id: activeConversationId,
        role: 'assistant',
        content: reply,
        created_at: new Date().toISOString(),
      };
      // Text-to-speech if enabled
      if (autoRead && 'speechSynthesis' in window) {
        try {
          const utter = new SpeechSynthesisUtterance(reply);
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
        } catch (e) { /* ignore */ }
      }
      setMessages(prev => [...prev, aiMsg]);
      setConversations(prev =>
        prev.map(c =>
          c.id === activeConversationId
            ? { ...c, last_message: reply, updated_at: new Date().toISOString(), messages: [...updatedMessages, aiMsg] }
            : c
        )
      );
      addAppLog({ module: 'AI Assistant', action: 'AI Response', status: 'success', message: `Replied to: ${userMsg.content.slice(0, 40)}` });
    } catch (err: any) {
      showError('AI Error', err.message || 'Failed to get response from AI.');
      // No fake message – user can retry.
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDeleteConversation = (id: number) => {
    if (confirm('Delete this conversation?')) {
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversationId === id) {
        const remaining = conversations.filter(c => c.id !== id);
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
    }
  };

  const openConversationSettings = (conv: Conversation) => {
    setEditingConversation(conv);
    setEditTitle(conv.title);
    setIsSettingsOpen(true);
  };

  const saveConversationSettings = () => {
    if (!editingConversation) return;
    setConversations(prev =>
      prev.map(c =>
        c.id === editingConversation.id ? { ...c, title: editTitle || c.title } : c
      )
    );
    setIsSettingsOpen(false);
  };

  const handleExportChat = () => {
    if (messages.length === 0) {
      showError('Export failed', 'No messages to export.');
      return;
    }
    const text = messages.map(m => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Chat exported.');
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString();
  };

  // ── Render ──
  return (
    <div className="min-h-screen bg-[#f5f7fb] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 p-4 md:p-7 rounded-b-3xl bg-slate-950 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> AI Assistant
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiZap className="text-cyan-300" /> AI Assistant
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Powered by Gemini</span>
          </h1>
          <p className="text-sm text-slate-300">Get instant business insights and recommendations</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <select value={selectedProviderId ?? ''} onChange={(e) => setSelectedProviderId(e.target.value ? Number(e.target.value) : null)} className="rounded-xl bg-white/8 px-3 py-2 text-sm text-slate-800">
              {providers.length === 0 && <option value="">No provider</option>}
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.enabled ? '' : ' (disabled)'}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm text-slate-200">
              <input type="checkbox" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} /> Auto Read
            </label>
            <button onClick={async () => {
              const name = prompt('Provider name (e.g. OpenAI)');
              if (!name) return;
              const key = prompt('Provider key (will be stored securely) — enter blank to skip');
              const model = prompt('Model (e.g. gpt-4o-mini) — optional');
              try {
                await apiClient.createAiProvider({ name, key, config: { model } });
                const res = await apiClient.getAiProviders();
                if (res && res.data) setProviders(res.data);
                alert('Provider created');
              } catch (e: any) { alert('Failed: ' + (e.message || e)); }
            }} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20">Manage Providers</button>
          </div>
          <button onClick={handleExportChat} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20">
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button onClick={handleNewConversation} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-cyan-300 shadow-md">
            <FiPlus className="inline mr-1" size={14} /> New Chat
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 md:px-7 mt-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-xs text-slate-500 font-medium">Total Conversations</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{summary.total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-xs text-slate-500 font-medium">Today's Chats</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{summary.today}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-xs text-slate-500 font-medium">AI Model</p>
          <p className="text-sm font-semibold text-emerald-600 mt-1">Google Gemini</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-xs text-slate-500 font-medium">Suggestions</p>
          <p className="text-sm text-slate-600 mt-1">Type or use voice to ask about your ERP.</p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 overflow-hidden mt-6 px-4 md:px-7 pb-6 gap-4">
        {/* Left Sidebar – Conversation List */}
        <div className="w-72 lg:w-80 flex-shrink-0 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {insightsLoading ? (
              <ConversationListSkeleton />
            ) : filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <FiMessageSquare size={32} className="mx-auto mb-2" />
                <p>No conversations yet</p>
              </div>
            ) : (
              filteredConversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={clsx(
                    'p-3 mx-2 my-1 rounded-xl cursor-pointer transition-all hover:bg-slate-50 group',
                    activeConversationId === conv.id ? 'bg-blue-50 border border-blue-200' : 'border border-transparent'
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{conv.title}</p>
                      <p className="text-xs text-slate-400 truncate mt-1">{conv.last_message || 'No messages'}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={(e) => { e.stopPropagation(); openConversationSettings(conv); }} className="p-1 text-slate-400 hover:text-blue-600" title="Rename"><FiEdit size={14} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }} className="p-1 text-slate-400 hover:text-rose-600" title="Delete"><FiTrash2 size={14} /></button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 text-right">{formatTime(conv.updated_at)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Chat Area */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          {activeConversationId ? (
            <>
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">
                  {conversations.find(c => c.id === activeConversationId)?.title || 'Chat'}
                </h2>
                <button
                  onClick={() => {
                    const conv = conversations.find(c => c.id === activeConversationId);
                    if (conv) openConversationSettings(conv);
                  }}
                  className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-50"
                >
                  <FiSettings size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.length === 0 && !isTyping && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <FiZap size={40} className="mb-3" />
                    <p className="text-lg font-medium">Start a conversation</p>
                    <p className="text-sm">Ask about sales, inventory, customers, or trends.</p>
                  </div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={clsx('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">AI</div>
                    )}
                    <div className={clsx(
                      'max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm',
                      msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'
                    )}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.created_at && (
                        <span className={clsx('text-xs mt-1 block', msg.role === 'user' ? 'text-blue-200' : 'text-slate-400')}>
                          {formatTime(msg.created_at)}
                        </span>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0"><FiUser /></div>
                    )}
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">AI</div>
                    <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              {/* Input + Voice */}
              <div className="p-4 border-t border-slate-100 bg-slate-50">
                <div className="flex gap-2 items-center">
                  <button
                    onClick={toggleListening}
                    className={clsx(
                      'p-3 rounded-xl transition',
                      isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    )}
                    title={isListening ? 'Stop listening' : 'Start voice input'}
                  >
                    {isListening ? <FiMicOff size={18} /> : <FiMic size={18} />}
                  </button>
                  <textarea
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything about your business..."
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition"
                    disabled={isTyping}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() || isTyping}
                    className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FiSend size={18} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <FiMessageSquare size={48} className="mx-auto mb-3" />
                <p className="text-lg font-medium">Select a conversation or start a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Offcanvas */}
      {isSettingsOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={isSettingsOpen}
            title="Conversation Settings"
            onClose={() => setIsSettingsOpen(false)}
            footer={
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsSettingsOpen(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={saveConversationSettings} className="btn btn-primary">Save</button>
              </div>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="Conversation title"
                />
              </div>
              <p className="text-sm text-slate-500">More settings coming soon.</p>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}