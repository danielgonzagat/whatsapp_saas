'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Sparkles, Send, ArrowRight } from 'lucide-react';
import { apiUrl } from '@/lib/http';
import { colors } from '@/lib/design-tokens';

// -------------- DESIGN TOKENS (Apple Light Theme) --------------
const COLORS = {
  bg: colors.background.base,           // #FAFAFA
  surface: colors.background.surface1,   // #FFFFFF
  accent: colors.brand.primary,          // #1A1A1A
  textPrimary: colors.text.primary,      // #1A1A1A
  textSecondary: colors.text.secondary,  // #525252
  border: colors.stroke,                 // #E5E5E5
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface GuestChatProps {
  onAuthRequired?: () => void;
  className?: string;
}

/**
 * 🌐 GuestChat - Chat público para visitantes sem conta
 * 
 * Este componente permite que visitantes conversem com o KLOEL
 * antes de criar uma conta. A IA atua como vendedor, convertendo
 * visitantes em usuários cadastrados.
 */
export function GuestChat({ onAuthRequired, className = '' }: GuestChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize session ID from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('kloel_guest_session');
    if (stored) {
      setSessionId(stored);
    } else {
      const newSession = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('kloel_guest_session', newSession);
      setSessionId(newSession);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
    };

    const assistantMessageId = generateId();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/chat/guest'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'X-Session-Id': sessionId || '',
        },
        body: JSON.stringify({ 
          message: content.trim(),
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                );
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        }
      }

      // Mark as complete
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
    } catch (error) {
      console.error('Guest chat error:', error);
      
      // Fallback to sync endpoint
      try {
        const syncResponse = await fetch(apiUrl('/chat/guest/sync'), {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Session-Id': sessionId || '',
          },
          body: JSON.stringify({ message: content.trim(), sessionId }),
        });

        if (syncResponse.ok) {
          const data = await syncResponse.json();
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: data.reply || 'Sem resposta', isStreaming: false }
                : msg
            )
          );
        } else {
          throw new Error('Sync also failed');
        }
      } catch {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantMessageId
              ? { 
                  ...msg, 
                  content: 'Desculpe, estou com dificuldades no momento. Tente novamente em alguns segundos.', 
                  isStreaming: false 
                }
              : msg
          )
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input);
    }
  };

  return (
    <div className={`flex flex-col ${className}`} style={{ backgroundColor: COLORS.bg }}>
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: `${COLORS.accent}10` }}
            >
              <Sparkles className="w-8 h-8" style={{ color: COLORS.accent }} />
            </div>
            <h3 
              className="text-lg font-semibold mb-2"
              style={{ color: COLORS.textPrimary }}
            >
              Olá! Eu sou a KLOEL 👋
            </h3>
            <p 
              className="text-sm max-w-sm mb-6"
              style={{ color: COLORS.textSecondary }}
            >
              Sua IA especialista em vendas pelo WhatsApp. 
              Me conte sobre seu negócio!
            </p>
            
            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                'Como você pode me ajudar?',
                'Quero vender mais',
                'O que você faz?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  className="px-3 py-2 rounded-full text-sm transition-all hover:scale-105"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.textSecondary,
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                  msg.role === 'user'
                    ? 'rounded-br-md'
                    : 'rounded-bl-md'
                }`}
                style={{
                  backgroundColor: msg.role === 'user' ? COLORS.accent : COLORS.surface,
                  color: msg.role === 'user' ? '#FFFFFF' : COLORS.textPrimary,
                  border: msg.role === 'assistant' ? `1px solid ${COLORS.border}` : 'none',
                }}
              >
                <p className="text-sm whitespace-pre-wrap">
                  {msg.content || (msg.isStreaming ? '...' : '')}
                  {msg.isStreaming && (
                    <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse rounded-full" />
                  )}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div 
        className="border-t p-4"
        style={{ borderColor: COLORS.border, backgroundColor: COLORS.surface }}
      >
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua mensagem..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-full text-sm outline-none transition-all"
            style={{
              backgroundColor: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.textPrimary,
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-all disabled:opacity-50"
            style={{
              backgroundColor: COLORS.accent,
              color: '#FFFFFF',
            }}
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
        
        {/* CTA to register */}
        {messages.length >= 2 && (
          <div className="mt-3 flex justify-center">
            <button
              onClick={onAuthRequired}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-105"
              style={{
                backgroundColor: `${COLORS.accent}10`,
                color: COLORS.accent,
              }}
            >
              Criar conta grátis para recursos completos
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
