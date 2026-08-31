// src/pages/AIAssistantPage.tsx
import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense, memo } from 'react';
import {
  FiPlus, FiTrash2, FiEdit, FiDownload,
  FiSearch, FiSend, FiMessageSquare, FiZap, FiSettings,
  FiUser, FiMic, FiMicOff, FiCpu, FiX
} from 'react-icons/fi';
import clsx from 'clsx';

const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

// ── Types ──
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

// ─── Skeletons ───
const ConversationListSkeleton = () => (
  <div className="space-y-2 p-4">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="h-12 bg-slate-200 rounded-xl animate-pulse" />
    ))}
  </div>
);

// ─── Gemini AI Chat Panel ───
const GeminiChatPanel = memo(({ conversation, onUpdateConversation }: {
  conversation: Conversation | null;
  onUpdateConversation: (conv: Conversation) => void;
}) => {
  const [messages, setMessages] = useState<Message[]>(conversation?.messages || []);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const { showError } = useNotification();

  // Update messages when conversation changes
  useEffect(() => {
    setMessages(conversation?.messages || []);
  }, [conversation?.id]);

  // Speech Recognition setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setIsListening(false);
        handleSendMessage(text);
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
    if ('speechSynthesis' in window) {
      synthesisRef.current = window.speechSynthesis;
    }
    return () => {
      recognitionRef.current?.abort();
      synthesisRef.current?.cancel();
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const speakResponse = (text: string) => {
    if (!synthesisRef.current) return;
    synthesisRef.current.cancel();
    const cleanText = text.replace(/[*#_`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synthesisRef.current.speak(utterance);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage.trim();
    if (!text || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputMessage('');
    setIsTyping(true);

    try {
      // Call Gemini API
      const history = messages.map(m => ({ role: m.role, text: m.content }));
      const res = await apiClient.geminiChat(text, history);
      const reply = res?.response || 'I processed your request.';

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        created_at: new Date().toISOString(),
      };

      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);
      speakResponse(reply);

      // Update conversation
      if (conversation) {
        onUpdateConversation({
          ...conversation,
          last_message: reply,
          updated_at: new Date().toISOString(),
          messages: finalMessages,
        });
      }

      addAppLog({ module: 'AI Assistant', action: 'AI Response', status: 'success', message: `Replied to: ${text.slice(0, 40)}` });
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I could not connect to the AI service. Please try again.',
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
      showError('AI Error', err?.message || 'Failed to get response');
    } finally {
      setIsTyping(false);
    }
  };

  const toggleVoice = () => {
    if (!recognitionRef.current) {
      showError('Not Supported', 'Voice input is not supported in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      synthesisRef.current?.cancel();
      setIsSpeaking(false);
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="text-center">
          <FiMessageSquare size={48} className="mx-auto mb-3" />
          <p className="text-lg font-medium">Select a conversation or start a new one</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && !isTyping && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FiCpu size={40} className="mb-3" />
            <p className="text-lg font-medium">Start a conversation</p>
            <p className="text-sm">Ask about sales, inventory, customers, or trends.</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                <FiCpu size={14} />
              </div>
            )}
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
              msg.role === 'user' ? 'bg-violet-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.created_at && (
                <span className={`text-xs mt-1 block ${msg.role === 'user' ? 'text-violet-200' : 'text-slate-400'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                <FiUser size={14} />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              <FiCpu size={14} />
            </div>
            <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-100 bg-slate-50">
        <div className="flex gap-2 items-center">
          <button
            onClick={toggleVoice}
            className={`p-3 rounded-xl transition ${
              isListening ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            }`}
            title={isListening ? 'Stop listening' : 'Start voice input'}
          >
            {isListening ? <FiMicOff size={18} /> : <FiMic size={18} />}
          </button>
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={isListening ? 'Listening...' : 'Ask me anything about your business...'}
            rows={2}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition"
            disabled={isTyping}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim() || isTyping}
            className="p-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiSend size={18} />
          </button>
        </div>
        {/* Quick Prompts */}
        <div className="flex gap-2 mt-2 overflow-x-auto custom-scrollbar">
          <button onClick={() => handleSendMessage("Summarize today's revenue.")} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 whitespace-nowrap">Revenue summary</button>
          <button onClick={() => handleSendMessage("Which products have low stock?")} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 whitespace-nowrap">Low stock</button>
          <button onClick={() => handleSendMessage("Who are our top customers?")} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 whitespace-nowrap">Top customers</button>
          <button onClick={() => handleSendMessage("What is my net profit this month?")} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 whitespace-nowrap">Net profit</button>
        </div>
      </div>
    </>
  );
});

// ─── Main Component ───
export function AIAssistantPage() {
  const { showSuccess, showError } = useNotification();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRead, setAutoRead] = useState(true);

  // Initialize with a default conversation
  useEffect(() => {
    const initialConv: Conversation = {
      id: Date.now().toString(),
      title: 'New Chat',
      updated_at: new Date().toISOString(),
      messages: [{
        id: 'welcome',
        role: 'assistant',
        content: 'Hello! I am your Gemini AI assistant. Ask me about your business data, sales, inventory, or customers. You can type or use voice input.',
        created_at: new Date().toISOString(),
      }],
    };
    setConversations([initialConv]);
    setActiveConversationId(initialConv.id);
  }, []);

  const activeConversation = useMemo(() =>
    conversations.find(c => c.id === activeConversationId) || null
  , [conversations, activeConversationId]);

  const filteredConversations = useMemo(() => {
    if (!searchTerm.trim()) return conversations;
    const term = searchTerm.toLowerCase();
    return conversations.filter(c =>
      c.title.toLowerCase().includes(term) ||
      (c.last_message || '').toLowerCase().includes(term)
    );
  }, [conversations, searchTerm]);

  const handleNewConversation = () => {
    const newConv: Conversation = {
      id: Date.now().toString(),
      title: 'New Chat',
      updated_at: new Date().toISOString(),
      messages: [],
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
  };

  const handleDeleteConversation = (id: string) => {
    if (confirm('Delete this conversation?')) {
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversationId === id) {
        const remaining = conversations.filter(c => c.id !== id);
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
    }
  };

  const handleUpdateConversation = (updated: Conversation) => {
    setConversations(prev =>
      prev.map(c => c.id === updated.id ? updated : c)
    );
  };

  const handleExportChat = () => {
    if (!activeConversation?.messages?.length) {
      showError('Export failed', 'No messages to export.');
      return;
    }
    const text = activeConversation.messages
      .map(m => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`)
      .join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Chat exported.');
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 p-4 md:p-7 bg-slate-950 shadow-xl">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> AI Assistant
          </div>
          <h1 className="text-2xl font-bold text-white md:text-3xl flex items-center gap-3">
            <FiCpu className="text-cyan-300" /> Gemini AI Assistant
          </h1>
          <p className="text-sm text-slate-300">Chat and voice-powered business insights</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-slate-200">
            <input type="checkbox" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} />
            Auto Read
          </label>
          <button onClick={handleExportChat} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20">
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button onClick={handleNewConversation} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-cyan-300">
            <FiPlus className="inline mr-1" size={14} /> New Chat
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 overflow-hidden mt-4 px-4 md:px-7 pb-6 gap-4" style={{ height: 'calc(100vh - 120px)' }}>
        {/* Left Sidebar */}
        <div className="w-72 lg:w-80 flex-shrink-0 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <FiMessageSquare size={32} className="mx-auto mb-2" />
                <p>No conversations</p>
              </div>
            ) : (
              filteredConversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`p-3 mx-2 my-1 rounded-xl cursor-pointer transition-all hover:bg-slate-50 group ${
                    activeConversationId === conv.id ? 'bg-violet-50 border border-violet-200' : 'border border-transparent'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{conv.title}</p>
                      <p className="text-xs text-slate-400 truncate mt-1">{conv.last_message || 'No messages'}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                      className="p-1 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Chat Area */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <GeminiChatPanel
            conversation={activeConversation}
            onUpdateConversation={handleUpdateConversation}
          />
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
}