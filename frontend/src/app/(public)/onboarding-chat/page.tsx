'use client';

// PULSE:OK — Onboarding chat uses one-shot POST calls (start, stream). No SWR reads to invalidate on this page.

import {
  KloelBrandLockup,
  KloelLoadingState,
  KloelMushroomVisual,
} from '@/components/kloel/KloelBrand';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { tokenStorage } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Loader2,
  LogIn,
  MessageSquare,
  Send,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function OnboardingChatContent() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, workspace, userName, userEmail } = useAuth();

  // Usa workspaceId da sessão; sem sessão, força login
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && workspace?.id) {
      setWorkspaceId(workspace.id);
      return;
    }

    if (!isAuthenticated) {
      router.push('/login?callbackUrl=/');
    }
  }, [isAuthenticated, workspace, router]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [status, setStatus] = useState<{
    messagesCount?: number;
    completed?: boolean;
    [key: string]: unknown;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Redirecionar para conexão do WhatsApp ao concluir onboarding
  useEffect(() => {
    if (completed) {
      router.push('/whatsapp?from=onboarding&autoConnect=1');
    }
  }, [completed, router]);

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const startOnboarding = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setLoading(true);
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      const accessToken = tokenStorage.getToken();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      // Usa endpoint correto com workspaceId
      const res = await fetch(apiUrl(`/kloel/onboarding/${workspaceId}/start`), {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/onboarding'));

      if (data.message) {
        addMessage('assistant', data.message);
      }
    } catch (error) {
      console.error('Erro ao iniciar onboarding:', error);
      addMessage(
        'assistant',
        'Olá! Eu sou a Kloel, sua inteligência artificial de vendas. Vamos configurar sua conta? Me conte sobre seu negócio!',
      );
    }
    setLoading(false);
    inputRef.current?.focus();
  }, [addMessage, workspaceId]);

  // Iniciar onboarding automaticamente quando o workspaceId estiver definido
  useEffect(() => {
    if (workspaceId) {
      startOnboarding();
    }
  }, [workspaceId, startOnboarding]);

  const sendMessage = async () => {
    if (!input.trim() || loading) {
      return;
    }
    if (!workspaceId) {
      return;
    }

    const userMessage = input.trim();
    setInput('');
    addMessage('user', userMessage);
    setLoading(true);

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      const accessToken = tokenStorage.getToken();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      // Usa endpoint SSE para streaming
      const res = await fetch(apiUrl(`/kloel/onboarding/${workspaceId}/chat/stream`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: userMessage }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Processar SSE response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      if (reader) {
        const readStream = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  assistantMessage = data.content;
                }
              } catch {
                // Ignorar linhas malformadas
              }
            }
          }
          await readStream();
        };

        await readStream();
      }

      if (assistantMessage) {
        addMessage('assistant', assistantMessage);
      }

      // Verificar se o onboarding foi concluído
      const statusHeaders: HeadersInit = {};
      if (accessToken) {
        statusHeaders.Authorization = `Bearer ${accessToken}`;
      }
      const statusRes = await fetch(apiUrl(`/kloel/onboarding/${workspaceId}/status`), {
        headers: statusHeaders,
      });
      const statusData = await statusRes.json();
      setStatus(statusData);

      if (statusData.completed) {
        addMessage(
          'assistant',
          'Perfeito. Agora vamos conectar seu WhatsApp — vou abrir o QR Code na próxima tela.',
        );
        setCompleted(true);
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      addMessage('assistant', 'Desculpe, tive um problema. Pode repetir?');
    }

    setLoading(false);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const goToDashboard = () => {
    if (!workspaceId) {
      return;
    }
    router.push('/whatsapp');
  };

  const goToLogin = () => {
    router.push('/login');
  };

  // Show loading while checking auth status
  if (authLoading) {
    return <OnboardingLoading />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-teal-900 to-gray-900 flex flex-col">
      {/* Header */}
      <header className="p-4 border-b border-white/10">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div>
            <Link href="/" style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}>
              <KloelBrandLockup markSize={22} fontSize={18} fontWeight={600} />
            </Link>
            <p className="text-base text-gray-400">Configuração Inteligente</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {(status?.messagesCount ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-base text-gray-400">
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
                {status?.messagesCount} mensagens
              </div>
            )}
            {!isAuthenticated && (
              <button
                type="button"
                onClick={goToLogin}
                className="flex items-center gap-2 text-base text-gray-400 hover:text-white transition px-3 py-1.5 rounded-lg border border-white/20 hover:border-white/40"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                <span>Entrar</span>
              </button>
            )}
            {isAuthenticated && (userName || userEmail) && (
              <div className="flex items-center gap-2 text-base text-green-400">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>{userName || userEmail}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    message.role === 'assistant'
                      ? 'bg-gradient-to-br from-teal-500 to-emerald-500'
                      : 'bg-blue-500'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <Bot className="w-5 h-5 text-white" aria-hidden="true" />
                  ) : (
                    <User className="w-5 h-5 text-white" aria-hidden="true" />
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === 'assistant'
                      ? 'bg-white/10 text-white'
                      : 'bg-blue-500 text-white'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p className="text-base opacity-50 mt-1">
                    {message.timestamp.toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Loading indicator - Enhanced with different states */}
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex">
              <div className="bg-white/10 rounded-2xl px-4 py-4 border border-white/10">
                <div className="flex items-center gap-3">
                  <KloelMushroomVisual size={28} traceColor="#FFFFFF" animated spores="animated" />
                  <span className="text-gray-300">kloel está pensando...</span>
                </div>
                <p className="text-base text-gray-500 mt-2">
                  A IA esta configurando sua conta automaticamente
                </p>
              </div>
            </motion.div>
          )}

          {/* Completion message */}
          {completed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-2xl p-6 text-center"
            >
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" aria-hidden="true" />
              <h2 className="text-xl font-bold text-white mb-2">Configuracao Concluida!</h2>
              <p className="text-gray-300 mb-6">
                Sua conta está pronta. Agora você pode conectar seu WhatsApp e começar a vender!
              </p>
              <button
                type="button"
                onClick={goToDashboard}
                className="bg-gradient-to-r from-teal-500 to-emerald-500 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 mx-auto hover:opacity-90 transition"
              >
                Ir para o Dashboard
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </button>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      {!completed && (
        <div className="border-t border-white/10 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Digite sua mensagem..."
                disabled={loading}
                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="bg-gradient-to-r from-teal-500 to-emerald-500 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="w-5 h-5" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="text-base text-gray-500 mt-2 text-center">
              Converse naturalmente com a Kloel. Ela vai configurar sua conta automaticamente.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function OnboardingLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-teal-900 to-gray-900 flex items-center justify-center px-4">
      <KloelLoadingState
        size={96}
        traceColor="#FFFFFF"
        label="Kloel"
        hint="iniciando a configuracao"
        minHeight={320}
      />
    </div>
  );
}

export default function ConversationalOnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <OnboardingChatContent />
    </Suspense>
  );
}
