'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Shield, Database, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import type { ChatMessage } from '@/types';

/** Extends ChatMessage with which data sources backed the reply. */
interface AdvisorMessage extends ChatMessage {
  grounded?: boolean;
  zonesMatched?: string[];
}

const SUGGESTIONS = [
  'Is Paharganj safe at night?',
  "What's the risk score for Connaught Place?",
  'Nearest police station to Dwarka?',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<AdvisorMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "👋 Hi! I'm your SafeZone Safety Advisor. Ask me about any area we monitor and I'll answer from our recorded risk data — including the risk score, trend and nearest police station.\n\nIf I have no data for a place, I'll tell you rather than guess.",
      created_at: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMessage: AdvisorMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.sendChatMessage(trimmed, 'advisor', sessionId || undefined);

      if (response.session_id) setSessionId(response.session_id);

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.message,
          created_at: new Date().toISOString(),
          grounded: response.metadata?.grounded,
          zonesMatched: response.metadata?.zones_matched,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            "⚠️ I'm having trouble connecting. For emergencies, call 112 (Police) or 181 (Women Helpline).",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col min-h-[60vh]">
      {/* Header — sticks just below the fixed navbar */}
      <div className="sticky top-16 z-30 bg-white/95 backdrop-blur border-b px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-gray-900 truncate">Safety Advisor</h1>
            <p className="text-xs sm:text-sm text-gray-500 truncate">
              Answers from recorded zone risk data
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 px-3 sm:px-4 py-4 space-y-4 chat-scroll">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 sm:gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-indigo-600" />
              </div>
            )}
            <div className="max-w-[85%] sm:max-w-[80%]">
              <div
                className={`rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-md'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              </div>

              {/* Show when a reply was backed by real zone rows */}
              {msg.role === 'assistant' && msg.grounded && msg.zonesMatched?.length ? (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
                  <Database className="h-3 w-3 shrink-0" aria-hidden />
                  Based on recorded data for {msg.zonesMatched.join(', ')}
                </p>
              ) : null}
              {msg.role === 'assistant' && msg.grounded === false ? (
                <p className="mt-1 text-[11px] text-gray-400">
                  No recorded data for that area — general guidance only
                </p>
              ) : null}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2 sm:gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1" role="status" aria-label="Advisor is typing">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Starter prompts, only before the first question */}
        {messages.length === 1 && !isLoading && (
          <div className="pt-1">
            <p className="text-xs text-gray-400 mb-2">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="px-3 py-2 min-h-[40px] text-xs text-left bg-white border border-gray-200 rounded-full text-gray-700 hover:border-indigo-400 hover:text-indigo-700 active:bg-indigo-50 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Composer — sits above the mobile tab bar */}
      <div className="sticky-above-nav bg-white/95 backdrop-blur border-t px-3 sm:px-4 py-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 items-end"
        >
          <label htmlFor="chat-input" className="sr-only">
            Ask about area safety
          </label>
          <input
            id="chat-input"
            name="message"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about area safety..."
            autoComplete="off"
            // 16px font stops iOS Safari zooming the viewport on focus.
            className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
            className="shrink-0 w-12 h-12 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 active:scale-95 transition"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </form>
        <p className="mt-1.5 text-[10px] text-gray-400 text-center">
          Statistical guidance, not a guarantee. In an emergency call 112.
        </p>
      </div>
    </div>
  );
}
