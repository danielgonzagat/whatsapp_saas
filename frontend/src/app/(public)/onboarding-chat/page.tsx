'use client';

import { colors, typography, motion as dtMotion } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';

import {
  KloelBrandLockup,
  KloelLoadingState,
  KloelMushroomVisual,
} from '@/components/kloel/KloelBrand';
import { ErrorBoundary } from '@/components/kloel/ErrorBoundary';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { tokenStorage } from '@/lib/api';
import { onboardingApi } from '@/lib/api/onboarding';
import { apiUrl } from '@/lib/http';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Bot, CheckCircle2, MessageSquare, Send, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { OnboardingChatHero } from './OnboardingChatHero';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const ROLE_LABELS: Record<string, string> = {
  subscriber: 'cliente assinante',
  producer: 'produtor',
  affiliate: 'afiliado',
};

function normalizeOnboardingRole(role: string | null): string | null {
  if (!role) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(ROLE_LABELS, role) ? role : null;
}

/** SSR-safe UUID generation. */
function safeRandomUUID(): string {
  if (typeof window !== 'undefined' && typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

function OnboardingChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading, workspace, userName, userEmail } = useAuth();
  const queryRole = normalizeOnboardingRole(searchParams.get('role'));
  const [storedRole, setStoredRole] = useState<string | null>(null);
  const selectedRole = queryRole || storedRole;

  // Usa workspaceId da sessão
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const startedRef = useRef(false);
  const roleSeededRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setStoredRole(normalizeOnboardingRole(window.localStorage.getItem('kloel_onboarding_role')));
  }, []);

  useEffect(() => {
    if (isAuthenticated && workspace?.id) {
      setWorkspaceId(workspace.id);
    }
  }, [isAuthenticated, workspace]);

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
    const el = messagesEndRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth' });
    }
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
        id: safeRandomUUID(),
        role,
        content,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const startOnboarding = useCallback(async () => {
    if (!workspaceId || startedRef.current) {
      return;
    }
    startedRef.current = true;
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
      const data: { message?: string } = await res.json();
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/onboarding'));

      if (data.message) {
        addMessage('assistant', data.message);
      }

      if (selectedRole && !roleSeededRef.current) {
        roleSeededRef.current = true;
        const roleLabel = ROLE_LABELS[selectedRole] || selectedRole;
        addMessage('user', `Meu perfil inicial no Kloel é: ${roleLabel}.`);
        const roleRes = await fetch(apiUrl(`/kloel/onboarding/${workspaceId}/chat`), {
          method: 'POST',
          headers,
          body: JSON.stringify({ message: `Meu perfil inicial no Kloel é: ${roleLabel}.` }),
        });
        const roleData: { message?: string } = await roleRes.json();
        mutate((key: unknown) => typeof key === 'string' && key.startsWith('/onboarding'));
        if (roleData.message) {
          addMessage('assistant', roleData.message);
        }
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
  }, [addMessage, selectedRole, workspaceId]);

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

      // Verificar se o onboarding foi concluído (via onboardingApi)
      const statusResult = await onboardingApi.getOnboardingStatus(workspaceId);
      if (statusResult.data) {
        setStatus(statusResult.data);
        if (statusResult.data.completed) {
          addMessage(
            'assistant',
            'Perfeito. Agora vamos conectar seu WhatsApp — vou abrir o QR Code na próxima tela.',
          );
          setCompleted(true);
        }
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      addMessage('assistant', 'Desculpe, tive um problema. Pode repetir?');
    }

    setLoading(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const goToDashboard = () => {
    router.push('/whatsapp');
  };

  // Show loading while checking auth status
  if (authLoading) {
    return <OnboardingLoading />;
  }

  // Unauthenticated landing — render hero instead of redirecting
  if (!isAuthenticated) {
    const callbackEncoded = encodeURIComponent(
      queryRole
        ? `/onboarding-chat?role=${encodeURIComponent(queryRole)}`
        : '/onboarding-chat',
    );
    return <OnboardingChatHero loginUrl={`/login?callbackUrl=${callbackEncoded}`} />;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '16px',
          borderBottom: `1px solid ${colors.border.void}`,
        }}
      >
        <div
          style={{
            maxWidth: '1024px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div>
            <Link href="/" style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}>
              <KloelBrandLockup markSize={22} fontSize={18} fontWeight={600} />
            </Link>
            <p
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.bodySmall[0],
                color: colors.text.muted,
                lineHeight: typography.fontSize.bodySmall[1].lineHeight,
              }}
            >
              {kloelT(`Configuração Inteligente`)}
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            {(status?.messagesCount ?? 0) > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.bodySmall[0],
                  color: colors.text.muted,
                }}
              >
                <MessageSquare style={{ width: 16, height: 16 }} aria-hidden="true" />
                {status?.messagesCount} mensagens
              </div>
            )}
            {userName || userEmail ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.bodySmall[0],
                  color: colors.ember.primary,
                }}
              >
                <CheckCircle2 style={{ width: 16, height: 16 }} aria-hidden="true" />
                <span>{userName || userEmail}</span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ maxWidth: '1024px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  display: 'flex',
                  gap: 12,
                  flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background:
                      message.role === 'assistant'
                        ? colors.ember.primary
                        : colors.background.elevated,
                  }}
                >
                  {message.role === 'assistant' ? (
                    <Bot
                      style={{ width: 20, height: 20, color: colors.text.inverted }}
                      aria-hidden="true"
                    />
                  ) : (
                    <User
                      style={{ width: 20, height: 20, color: colors.text.silver }}
                      aria-hidden="true"
                    />
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  style={{
                    maxWidth: '80%',
                    borderRadius: 12,
                    padding: '12px 16px',
                    background:
                      message.role === 'assistant'
                        ? colors.background.surface
                        : colors.ember.primary,
                    border:
                      message.role === 'assistant'
                        ? `1px solid ${colors.border.space}`
                        : 'none',
                  }}
                >
                  <p
                    style={{
                      fontFamily: typography.fontFamily.sans,
                      fontSize: typography.fontSize.body[0],
                      color: colors.text.silver,
                      lineHeight: typography.fontSize.body[1].lineHeight,
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                    }}
                  >
                    {message.content}
                  </p>
                  <p
                    style={{
                      fontFamily: typography.fontFamily.mono,
                      fontSize: typography.fontSize.caption[0],
                      opacity: 0.5,
                      marginTop: 4,
                      marginBottom: 0,
                      color: colors.text.silver,
                    }}
                  >
                    {message.timestamp.toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Loading indicator */}
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex' }}>
              <div
                style={{
                  background: colors.background.surface,
                  borderRadius: 12,
                  padding: '16px',
                  border: `1px solid ${colors.border.space}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <KloelMushroomVisual
                    size={28}
                    traceColor={colors.text.silver}
                    animated
                    spores="animated"
                  />
                  <span
                    style={{
                      fontFamily: typography.fontFamily.sans,
                      fontSize: typography.fontSize.body[0],
                      color: colors.text.silver,
                    }}
                  >
                    {kloelT(`kloel está pensando...`)}
                  </span>
                </div>
                <p
                  style={{
                    fontFamily: typography.fontFamily.sans,
                    fontSize: typography.fontSize.bodySmall[0],
                    color: colors.text.muted,
                    marginTop: 8,
                    marginBottom: 0,
                  }}
                >
                  {kloelT(`A IA esta configurando sua conta automaticamente`)}
                </p>
              </div>
            </motion.div>
          )}

          {/* Completion message */}
          {completed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                background: colors.ember.bg,
                border: `1px solid ${colors.ember.glow10}`,
                borderRadius: 12,
                padding: 24,
                textAlign: 'center',
              }}
            >
              <CheckCircle2
                style={{
                  width: 48,
                  height: 48,
                  color: colors.ember.primary,
                  margin: '0 auto 16px',
                }}
                aria-hidden="true"
              />
              <h2
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.h3[0],
                  fontWeight: typography.fontSize.h3[1].fontWeight,
                  color: colors.text.silver,
                  marginBottom: 8,
                  marginTop: 0,
                }}
              >
                {kloelT(`Configuracao Concluida!`)}
              </h2>
              <p
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.body[0],
                  color: colors.text.muted,
                  lineHeight: typography.fontSize.body[1].lineHeight,
                  marginBottom: 24,
                  marginTop: 0,
                }}
              >
                {kloelT(
                  `Sua conta está pronta. Agora você pode conectar seu WhatsApp e começar a vender!`,
                )}
              </p>
              <button
                type="button"
                onClick={goToDashboard}
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.body[0],
                  fontWeight: typography.fontWeight.medium,
                  background: colors.ember.primary,
                  color: colors.text.silver,
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 24px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: `opacity ${dtMotion.duration.fast} ${dtMotion.easing.default}`,
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.opacity = '1';
                }}
              >
                {kloelT(`Ir para o Dashboard`)}
                <ArrowRight style={{ width: 20, height: 20 }} aria-hidden="true" />
              </button>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      {!completed && (
        <div
          style={{
            borderTop: `1px solid ${colors.border.void}`,
            padding: '16px',
          }}
        >
          <div style={{ maxWidth: '1024px', margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={kloelT(`Digite sua mensagem...`)}
                disabled={loading}
                style={{
                  flex: 1,
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.body[0],
                  background: colors.background.surface,
                  border: `1px solid ${colors.border.space}`,
                  borderRadius: 12,
                  padding: '12px 16px',
                  color: colors.text.silver,
                  outline: 'none',
                  transition: `box-shadow ${dtMotion.duration.fast} ${dtMotion.easing.default}`,
                  opacity: loading ? 0.5 : 1,
                }}
                onFocus={(e) => {
                  e.target.style.boxShadow = `0 0 0 2px ${colors.ember.primary}`;
                }}
                onBlur={(e) => {
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.body[0],
                  fontWeight: typography.fontWeight.medium,
                  background: colors.ember.primary,
                  color: colors.text.silver,
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 24px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: `opacity ${dtMotion.duration.fast} ${dtMotion.easing.default}`,
                  opacity: loading || !input.trim() ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!loading && input.trim()) {
                    (e.target as HTMLButtonElement).style.opacity = '0.9';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.opacity = loading || !input.trim() ? '0.5' : '1';
                }}
              >
                {loading ? (
                  <KloelMushroomVisual
                    size={22}
                    title="Enviando"
                    traceColor={colors.text.silver}
                    fit="icon"
                  />
                ) : (
                  <Send style={{ width: 20, height: 20 }} aria-hidden="true" />
                )}
              </button>
            </div>
            <p
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.bodySmall[0],
                color: colors.text.muted,
                marginTop: 8,
                marginBottom: 0,
                textAlign: 'center',
              }}
            >
              {kloelT(
                `Converse naturalmente com a Kloel. Ela vai configurar sua conta automaticamente.`,
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function OnboardingLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
      }}
    >
      <KloelLoadingState
        size={96}
        traceColor={colors.text.silver}
        label={kloelT(`Kloel`)}
        hint={kloelT(`iniciando a configuracao`)}
        minHeight={320}
      />
    </div>
  );
}

/** Conversational onboarding page. */
export default function ConversationalOnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <ErrorBoundary>
        <OnboardingChatContent />
      </ErrorBoundary>
    </Suspense>
  );
}
