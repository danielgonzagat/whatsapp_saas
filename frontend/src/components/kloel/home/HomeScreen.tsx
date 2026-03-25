'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { Heartbeat } from '@/components/kloel/landing/Heartbeat';
import { apiUrl } from '@/lib/http';
import { tokenStorage } from '@/lib/api';
import { useConversationHistory } from '@/hooks/useConversationHistory';

// ════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════

type Phase = 'home' | 'transitioning' | 'chat';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  displayedContent?: string;
  isTyping?: boolean;
  isThinking?: boolean;
  timestamp: Date;
}

// ════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════

const IS_DEV = process.env.NODE_ENV === 'development';

/** Demo/development only -- never shown in production */
const DEV_DEMO_RESPONSES = [
  'Entendi sua pergunta. Vou analisar os dados do seu negocio e trazer insights relevantes.\n\nBaseado no que vejo, existem **tres oportunidades imediatas** que voce pode explorar:\n\n1. **Automacao de follow-up** - seus leads esfriam em media 4h apos primeiro contato\n2. **Segmentacao por intencao** - 34% dos seus contatos mostram sinais de compra\n3. **Mensagens personalizadas** - templates genericos convertem 3x menos\n\nQuer que eu detalhe alguma dessas estrategias?',
  'Analisei seu funil de vendas e encontrei alguns pontos interessantes.\n\nSeu **taxa de conversao atual** esta em torno de 2.3%, mas com algumas otimizacoes podemos chegar a **4-5%** facilmente.\n\nO principal gargalo esta na **etapa de qualificacao**. Muitos leads entram sem perfil adequado e consomem tempo da equipe.\n\nRecomendo implementar:\n- Perguntas de qualificacao automaticas no primeiro contato\n- Score de lead baseado em comportamento\n- Priorizacao automatica por probabilidade de fechamento',
  'Boa pergunta. Vou compartilhar o que os dados mostram.\n\nO **melhor horario para enviar mensagens** no seu segmento e entre **9h-11h** e **14h-16h**. Fora desses horarios, a taxa de resposta cai **47%**.\n\nOutro insight importante: mensagens com **ate 160 caracteres** tem **2.8x mais respostas** do que mensagens longas.\n\nPosso configurar sua campanha para seguir esses padroes automaticamente.',
  'Vou ser direto com voce.\n\nSeu negocio tem **potencial real** de escalar vendas pelo WhatsApp, mas precisa de ajustes na abordagem.\n\nO que funciona hoje:\n- **Respostas rapidas** (voce responde em media em 12min - bom)\n- **Tom conversacional** (seus clientes se sentem acolhidos)\n\nO que precisa melhorar:\n- **Falta de CTA claro** nas mensagens\n- **Sem acompanhamento pos-venda** (oportunidade de recompra perdida)\n- **Catalogo desatualizado** no link compartilhado\n\nPosso criar um plano de acao personalizado para os proximos 30 dias.',
];

const ERROR_MESSAGE = 'Nao foi possivel conectar ao servidor. Tente novamente.';

// ════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════

function genTitle(text: string): string {
  const l = text.trim().toLowerCase();
  if (l.length < 5) return 'Nova conversa';
  if (l.includes('métrica') || l.includes('metrica') || l.includes('campanha')) return 'Análise de campanhas';
  if (l.includes('copy') || l.includes('anuncio')) return 'Criação de copy';
  if (l.includes('lead') || l.includes('funil')) return 'Otimização de funil';
  if (text.length > 32) return text.slice(0, 30) + '...';
  return text;
}

// ════════════════════════════════════════════
// ICONS
// ════════════════════════════════════════════

function SendIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function PaperclipIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

// ════════════════════════════════════════════
// TEXT RENDERER (bold = Ember)
// ════════════════════════════════════════════

function renderMessageText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} style={{ color: '#E85D30', fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ════════════════════════════════════════════
// TYPING SIMULATION HOOK
// ════════════════════════════════════════════

function useTypingSimulation() {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const cancelRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTyping = useCallback((fullText: string, onComplete?: () => void) => {
    cancelRef.current = false;
    setDisplayedText('');
    setIsTyping(true);
    setIsDone(false);

    let index = 0;

    function typeNext() {
      if (cancelRef.current || index >= fullText.length) {
        setDisplayedText(fullText);
        setIsTyping(false);
        setIsDone(true);
        onComplete?.();
        return;
      }

      const char = fullText[index];
      index++;
      setDisplayedText(fullText.slice(0, index));

      let delay: number;

      if (Math.random() < 0.08) {
        delay = 2;
      } else if (char === '.' || char === '!' || char === '?') {
        delay = 150 + Math.random() * 100;
      } else if (char === ',') {
        delay = 80 + Math.random() * 40;
      } else if (char === '\n') {
        delay = 120 + Math.random() * 80;
      } else if (char === ' ') {
        delay = 10 + Math.random() * 15;
      } else {
        delay = 15 + Math.random() * 25;
      }

      timeoutRef.current = setTimeout(typeNext, delay);
    }

    typeNext();
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { displayedText, isTyping, isDone, startTyping, cancel };
}

// ════════════════════════════════════════════
// HOME SCREEN PROPS
// ════════════════════════════════════════════

interface HomeScreenProps {
  onSendMessage?: (text: string) => void;
}

// ════════════════════════════════════════════
// HOME SCREEN v2 — home / transitioning / chat
// ════════════════════════════════════════════

export function HomeScreen({ onSendMessage }: HomeScreenProps) {
  const { userName } = useAuth();
  const { addConversation, setActiveConversation } = useConversationHistory();

  // ─── Phase management ───
  const [phase, setPhase] = useState<Phase>('home');
  const [homeInput, setHomeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [thinkingText, setThinkingText] = useState('Analisando...');
  const [chatTitle, setChatTitle] = useState('Nova conversa');
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const responseIndexRef = useRef(0);

  // ─── Typing simulation ───
  const { displayedText, isTyping, isDone, startTyping, cancel: cancelTyping } = useTypingSimulation();
  const typingMessageIdRef = useRef<string | null>(null);

  // ─── Auto-scroll during typing ───
  useEffect(() => {
    if (isTyping && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayedText, isTyping]);

  // ─── Update message with displayed text ───
  useEffect(() => {
    if (typingMessageIdRef.current && (isTyping || isDone)) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === typingMessageIdRef.current
            ? { ...msg, displayedContent: displayedText, isTyping, isThinking: false }
            : msg
        )
      );
    }
  }, [displayedText, isTyping, isDone]);

  // ─── When typing finishes ───
  useEffect(() => {
    if (isDone) {
      setIsWaitingForResponse(false);
      typingMessageIdRef.current = null;
    }
  }, [isDone]);

  // ─── Generate unique ID ───
  const generateId = useCallback(() => {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // ─── Send message to API ───
  const sendToApi = useCallback(async (messageText: string) => {
    const token = tokenStorage.getToken();
    const workspaceId = tokenStorage.getWorkspaceId();
    const isGuest = !token || !workspaceId;
    const endpoint = isGuest ? '/chat/guest' : '/kloel/think';

    const assistantId = generateId();
    typingMessageIdRef.current = assistantId;

    // Add assistant message in thinking state
    setMessages(prev => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        displayedContent: '',
        isThinking: true,
        isTyping: false,
        timestamp: new Date(),
      },
    ]);

    const thinkDuration = 800 + Math.random() * 1200;
    setThinkingText('Analisando...');

    try {
      const abortController = new AbortController();
      const response = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: messageText }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

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
              if (parsed.error) {
                fullContent = parsed.content ?? parsed.message ?? 'Desculpe, tive uma instabilidade. Tente novamente.';
                break;
              }
              // Detect tool_call events and update thinking text
              if (parsed.type === 'tool_call' || parsed.tool_call) {
                const toolName = parsed.tool_call?.name ?? parsed.name ?? parsed.tool ?? '';
                if (toolName) {
                  setThinkingText(`Usando ${toolName}...`);
                }
              }
              const delta = parsed.content ?? parsed.chunk;
              if (delta) {
                fullContent += String(delta);
              }
            } catch {
              fullContent += data;
            }
          }
        }
      }

      if (!fullContent.trim()) {
        throw new Error('empty_response');
      }

      setTimeout(() => {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantId ? { ...msg, content: fullContent } : msg
          )
        );
        startTyping(fullContent);
      }, thinkDuration);

    } catch {
      if (IS_DEV) {
        // In development, fall back to demo responses for easier testing
        const fallbackText = DEV_DEMO_RESPONSES[responseIndexRef.current % DEV_DEMO_RESPONSES.length];
        responseIndexRef.current++;

        setTimeout(() => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantId ? { ...msg, content: fallbackText } : msg
            )
          );
          startTyping(fallbackText);
        }, thinkDuration);
      } else {
        // In production, show error message
        setTimeout(() => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantId
                ? { ...msg, content: ERROR_MESSAGE, isThinking: false, isTyping: false, displayedContent: ERROR_MESSAGE }
                : msg
            )
          );
          setIsWaitingForResponse(false);
          typingMessageIdRef.current = null;
        }, thinkDuration);
      }
    }
  }, [generateId, startTyping]);

  // ─── Handle first message (triggers transition) ───
  const handleHomeSubmit = useCallback(() => {
    if (!homeInput.trim()) return;
    const text = homeInput.trim();
    setHomeInput('');

    const title = genTitle(text);
    setChatTitle(title);

    const convId = generateId();
    setActiveConversationId(convId);

    // Phase 1: transitioning (home exit)
    setPhase('transitioning');

    // After 800ms homeExit animation, switch to chat
    setTimeout(() => {
      setPhase('chat');

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      setMessages([userMsg]);
      setIsWaitingForResponse(true);

      // Save conversation to shared context (sidebar picks this up)
      const numericId = Date.now();
      addConversation(numericId, title);
      setActiveConversation(numericId);

      // Send to API
      sendToApi(text);
      onSendMessage?.(text);
    }, 800);
  }, [homeInput, generateId, sendToApi, onSendMessage, addConversation, setActiveConversation]);

  // ─── Handle subsequent messages ───
  const handleChatSubmit = useCallback(() => {
    if (!chatInput.trim() || isWaitingForResponse) return;
    const text = chatInput.trim();
    setChatInput('');

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsWaitingForResponse(true);
    sendToApi(text);
    onSendMessage?.(text);
  }, [chatInput, isWaitingForResponse, generateId, sendToApi, onSendMessage]);

  // ─── New chat: return to home ───
  const handleNewChat = useCallback(() => {
    cancelTyping();
    setPhase('home');
    setMessages([]);
    setChatInput('');
    setHomeInput('');
    setChatTitle('Nova conversa');
    setActiveConversationId(null);
    setActiveConversation(null);
    setIsWaitingForResponse(false);
    typingMessageIdRef.current = null;
  }, [cancelTyping, setActiveConversation]);

  // ─── Auto-scroll on new messages ───
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // ─── Focus chat input when entering chat phase ───
  useEffect(() => {
    if (phase === 'chat') {
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 600);
    }
  }, [phase]);

  // ════════════════════════════════════════════
  // RENDER: HOME PHASE (+ transitioning)
  // ════════════════════════════════════════════

  if (phase === 'home' || phase === 'transitioning') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          position: 'relative',
          background: '#0A0A0C',
          overflow: 'hidden',
        }}
      >
        {/* Content wrapper with homeExit animation */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            width: '100%',
            position: 'relative',
            ...(phase === 'transitioning'
              ? { animation: 'homeExit 800ms ease-in-out forwards' }
              : {}),
          }}
        >
          {/* Heartbeat ECG — full size, absolute bottom 15% */}
          <div
            style={{
              position: 'absolute',
              bottom: '15%',
              left: 0,
              width: '100%',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <Heartbeat />
          </div>

          {/* Content */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              textAlign: 'center',
              maxWidth: 620,
              padding: '0 24px',
            }}
          >
            {/* KLOEL eyebrow */}
            <div style={{ animation: 'fadeIn 1s ease both' }}>
              <p
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: '#E85D30',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  marginBottom: 28,
                }}
              >
                KLOEL
              </p>

              {/* Manifesto */}
              <h1
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontSize: 36,
                  fontWeight: 700,
                  color: '#E0DDD8',
                  lineHeight: 1.3,
                  margin: '0 0 48px',
                  letterSpacing: '-0.02em',
                }}
              >
                O Marketing morreu{' '}
                <span style={{ color: '#E85D30' }}>Digital</span>
                <br />
                e ressuscitou{' '}
                <span style={{ color: '#E85D30' }}>Artificial.</span>
              </h1>
            </div>

            {/* Input bar */}
            <div style={{ animation: 'fadeIn 1s ease 400ms both' }}>
              <div
                style={{
                  background: '#111113',
                  border: '1px solid #222226',
                  borderRadius: 6,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <input
                  value={homeInput}
                  onChange={(e) => setHomeInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleHomeSubmit()}
                  placeholder="Pergunte qualquer coisa..."
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    color: '#E0DDD8',
                    fontSize: 14,
                    fontFamily: "'Sora', sans-serif",
                  }}
                />
                <button
                  onClick={handleHomeSubmit}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    background: homeInput.trim() ? '#E85D30' : '#19191C',
                    border: 'none',
                    cursor: homeInput.trim() ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: homeInput.trim() ? '#0A0A0C' : '#3A3A3F',
                    transition: 'all 150ms ease',
                  }}
                >
                  <SendIcon size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════
  // RENDER: CHAT PHASE
  // ════════════════════════════════════════════

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        background: '#0A0A0C',
        animation: 'chatEnter 500ms ease-out both',
        overflow: 'hidden',
      }}
    >
      {/* ─── Title Bar ─── */}
      <div
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          borderBottom: '1px solid #19191C',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: '#E0DDD8',
            letterSpacing: '-0.01em',
          }}
        >
          {chatTitle}
        </span>
      </div>

      {/* ─── Messages Area ─── */}
      <div
        ref={chatContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            maxWidth: 660,
            width: '100%',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {messages.map((msg) => {
            if (msg.role === 'user') {
              // ─── User message: bg #1A1A1E, radius 20px ───
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    animation: 'fadeIn 0.4s ease-out both',
                  }}
                >
                  <div
                    style={{
                      background: '#1A1A1E',
                      color: '#E0DDD8',
                      borderRadius: 20,
                      padding: '12px 18px',
                      maxWidth: '75%',
                      fontFamily: "'Sora', sans-serif",
                      fontSize: 14,
                      lineHeight: 1.6,
                      fontWeight: 400,
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            }

            // ─── Assistant message: NO bubble, text directly on page ───
            return (
              <div
                key={msg.id}
                style={{
                  maxWidth: '85%',
                  animation: 'fadeIn 0.4s ease-out both',
                }}
              >
                {/* Thinking state: thinking text + mini Heartbeat with thinkPulse */}
                {msg.isThinking && (
                  <div
                    style={{
                      animation: 'thinkPulse 2s ease-in-out infinite',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: '#3A3A3F',
                        opacity: 0.6,
                        fontFamily: "'Sora', sans-serif",
                        fontStyle: 'italic',
                      }}
                    >
                      {thinkingText}
                    </span>
                    <Heartbeat mini={true} />
                  </div>
                )}

                {/* Message text — no bubble, no background, no border */}
                {!msg.isThinking && (
                  <div
                    style={{
                      fontFamily: "'Sora', sans-serif",
                      fontSize: 14,
                      lineHeight: 1.8,
                      color: msg.content === ERROR_MESSAGE ? '#3A3A3F' : '#E0DDD8',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {renderMessageText(msg.displayedContent ?? msg.content)}
                    {/* Typing cursor: orange bar with blink + glow */}
                    {msg.isTyping && (
                      <span
                        style={{
                          color: '#E85D30',
                          fontWeight: 400,
                          animation: 'blink 1s ease-in-out infinite',
                          textShadow: '0 0 8px rgba(232, 93, 48, 0.5)',
                          marginLeft: 1,
                        }}
                      >
                        |
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ─── Input Area ─── */}
      <div
        style={{
          borderTop: '1px solid #19191C',
          padding: '0 20px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            maxWidth: 660,
            margin: '0 auto',
            padding: '12px 0 16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid #222226',
              borderRadius: 6,
              padding: '10px 12px',
              transition: 'border-color 150ms ease, box-shadow 150ms ease',
            }}
            onFocus={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = 'rgba(232, 93, 48, 0.4)';
              el.style.boxShadow = '0 0 0 2px rgba(232, 93, 48, 0.08)';
            }}
            onBlur={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = '#222226';
              el.style.boxShadow = 'none';
            }}
          >
            {/* Paperclip */}
            <button
              style={{
                background: 'none',
                border: 'none',
                padding: 4,
                cursor: 'pointer',
                color: '#3A3A3F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 150ms ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = '#6E6E73';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = '#3A3A3F';
              }}
            >
              <PaperclipIcon size={16} />
            </button>

            {/* Input */}
            <input
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit()}
              placeholder="Escreva sua mensagem..."
              disabled={isWaitingForResponse}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#E0DDD8',
                fontSize: 14,
                fontFamily: "'Sora', sans-serif",
                opacity: isWaitingForResponse ? 0.5 : 1,
              }}
            />

            {/* Send button 28x28 */}
            <button
              onClick={handleChatSubmit}
              disabled={isWaitingForResponse || !chatInput.trim()}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background:
                  chatInput.trim() && !isWaitingForResponse
                    ? '#E85D30'
                    : 'transparent',
                border:
                  chatInput.trim() && !isWaitingForResponse
                    ? 'none'
                    : '1px solid #222226',
                cursor:
                  chatInput.trim() && !isWaitingForResponse
                    ? 'pointer'
                    : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color:
                  chatInput.trim() && !isWaitingForResponse
                    ? '#0A0A0C'
                    : '#3A3A3F',
                transition: 'all 150ms ease',
                flexShrink: 0,
              }}
            >
              <SendIcon size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
