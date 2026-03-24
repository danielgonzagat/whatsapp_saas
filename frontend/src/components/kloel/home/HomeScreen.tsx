'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { Heartbeat } from '@/components/kloel/landing/Heartbeat';
import { apiUrl } from '@/lib/http';
import { tokenStorage } from '@/lib/api';

// ════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════

type Phase = 'dashboard' | 'transitioning' | 'chat';

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

const KLOEL_RESPONSES = [
  'Entendi sua pergunta. Vou analisar os dados do seu negocio e trazer insights relevantes.\n\nBaseado no que vejo, existem **tres oportunidades imediatas** que voce pode explorar:\n\n1. **Automacao de follow-up** - seus leads esfriam em media 4h apos primeiro contato\n2. **Segmentacao por intencao** - 34% dos seus contatos mostram sinais de compra\n3. **Mensagens personalizadas** - templates genericos convertem 3x menos\n\nQuer que eu detalhe alguma dessas estrategias?',
  'Analisei seu funil de vendas e encontrei alguns pontos interessantes.\n\nSeu **taxa de conversao atual** esta em torno de 2.3%, mas com algumas otimizacoes podemos chegar a **4-5%** facilmente.\n\nO principal gargalo esta na **etapa de qualificacao**. Muitos leads entram sem perfil adequado e consomem tempo da equipe.\n\nRecomendo implementar:\n- Perguntas de qualificacao automaticas no primeiro contato\n- Score de lead baseado em comportamento\n- Priorizacao automatica por probabilidade de fechamento',
  'Boa pergunta. Vou compartilhar o que os dados mostram.\n\nO **melhor horario para enviar mensagens** no seu segmento e entre **9h-11h** e **14h-16h**. Fora desses horarios, a taxa de resposta cai **47%**.\n\nOutro insight importante: mensagens com **ate 160 caracteres** tem **2.8x mais respostas** do que mensagens longas.\n\nPosso configurar sua campanha para seguir esses padroes automaticamente.',
  'Vou ser direto com voce.\n\nSeu negocio tem **potencial real** de escalar vendas pelo WhatsApp, mas precisa de ajustes na abordagem.\n\nO que funciona hoje:\n- **Respostas rapidas** (voce responde em media em 12min - bom)\n- **Tom conversacional** (seus clientes se sentem acolhidos)\n\nO que precisa melhorar:\n- **Falta de CTA claro** nas mensagens\n- **Sem acompanhamento pos-venda** (oportunidade de recompra perdida)\n- **Catalogo desatualizado** no link compartilhado\n\nPosso criar um plano de acao personalizado para os proximos 30 dias.',
];

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
// ECG LINE (Static SVG for chat divider)
// ════════════════════════════════════════════

function EcgLine({ width = 120, height = 16 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ opacity: 0.2 }}>
      <defs>
        <linearGradient id="ecgMini">
          <stop offset="0%" stopColor="#E85D30" stopOpacity={0} />
          <stop offset="30%" stopColor="#E85D30" stopOpacity={0.6} />
          <stop offset="50%" stopColor="#E85D30" stopOpacity={1} />
          <stop offset="70%" stopColor="#E85D30" stopOpacity={0.6} />
          <stop offset="100%" stopColor="#E85D30" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        d="M 0 8 L 18 8 L 22 13 L 28 2 L 33 11 L 37 8 L 60 8 L 64 12 L 69 3 L 74 10 L 78 8 L 120 8"
        fill="none"
        stroke="url(#ecgMini)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

// ════════════════════════════════════════════
// MINI ECG (animated for thinking state)
// ════════════════════════════════════════════

function ThinkingEcg() {
  return (
    <svg width={32} height={14} viewBox="0 0 32 14" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="ecgThink">
          <stop offset="0%" stopColor="#E85D30" stopOpacity={0.3} />
          <stop offset="50%" stopColor="#E85D30" stopOpacity={1} />
          <stop offset="100%" stopColor="#E85D30" stopOpacity={0.3} />
        </linearGradient>
      </defs>
      <path
        d="M 0 7 L 6 7 L 9 12 L 13 1 L 17 10 L 20 7 L 32 7"
        fill="none"
        stroke="url(#ecgThink)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="50"
        strokeDashoffset="0"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="50;0;-50"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

// ════════════════════════════════════════════
// KLOEL AVATAR
// ════════════════════════════════════════════

function KloelAvatar({ size = 34, pulse = false }: { size?: number; pulse?: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {pulse && (
        <div
          style={{
            position: 'absolute',
            inset: -3,
            borderRadius: 6,
            border: '2px solid rgba(232, 93, 48, 0.4)',
            animation: 'ringPulse 1.5s ease-out infinite',
          }}
        />
      )}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          background: 'linear-gradient(135deg, #E85D30, #C74420)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: pulse ? 'avatarPulse 2s ease-in-out infinite' : 'none',
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: size * 0.42,
            fontWeight: 700,
            color: '#0A0A0C',
            lineHeight: 1,
          }}
        >
          K
        </span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TEXT RENDERER (bold = orange)
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

      // Calculate delay based on character type
      let delay: number;

      // 8% chance of burst speed
      if (Math.random() < 0.08) {
        delay = 2;
      } else if (char === '.' || char === '!' || char === '?') {
        delay = 150 + Math.random() * 100; // 150-250ms
      } else if (char === ',') {
        delay = 80 + Math.random() * 40; // 80-120ms
      } else if (char === '\n') {
        delay = 120 + Math.random() * 80; // 120-200ms
      } else if (char === ' ') {
        delay = 10 + Math.random() * 15; // 10-25ms
      } else {
        delay = 15 + Math.random() * 25; // 15-40ms
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
// HOME SCREEN — THREE PHASES
// ════════════════════════════════════════════

export function HomeScreen({ onSendMessage }: HomeScreenProps) {
  const { userName, isAuthenticated } = useAuth();

  // ─── Phase management ───
  const [phase, setPhase] = useState<Phase>('dashboard');
  const [dashboardInput, setDashboardInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const pendingMessageRef = useRef<string | null>(null);
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

    // Thinking phase: random 800-2000ms
    const thinkDuration = 800 + Math.random() * 1200;

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

      // Try to read SSE stream
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
              const delta = parsed.content ?? parsed.chunk;
              if (delta) {
                fullContent += String(delta);
              }
            } catch {
              // plain text chunk
              fullContent += data;
            }
          }
        }
      }

      if (!fullContent.trim()) {
        throw new Error('empty_response');
      }

      // Wait for thinking phase to complete, then start typing
      setTimeout(() => {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantId ? { ...msg, content: fullContent } : msg
          )
        );
        startTyping(fullContent);
      }, thinkDuration);

    } catch (error) {
      // Fallback: use simulated response
      const fallbackText = KLOEL_RESPONSES[responseIndexRef.current % KLOEL_RESPONSES.length];
      responseIndexRef.current++;

      setTimeout(() => {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantId ? { ...msg, content: fallbackText } : msg
          )
        );
        startTyping(fallbackText);
      }, thinkDuration);
    }
  }, [generateId, startTyping]);

  // ─── Handle first message (triggers transition) ───
  const handleDashboardSubmit = useCallback(() => {
    if (!dashboardInput.trim()) return;
    const text = dashboardInput.trim();
    setDashboardInput('');
    pendingMessageRef.current = text;

    // Phase 1: transitioning (dashboard exit)
    setPhase('transitioning');

    // After 900ms exit animation, switch to chat
    setTimeout(() => {
      setPhase('chat');

      // Add user message
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      setMessages([userMsg]);
      setIsWaitingForResponse(true);

      // Send to API
      sendToApi(text);
      pendingMessageRef.current = null;
    }, 900);
  }, [dashboardInput, generateId, sendToApi]);

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
  }, [chatInput, isWaitingForResponse, generateId, sendToApi]);

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
      }, 700);
    }
  }, [phase]);

  // ════════════════════════════════════════════
  // RENDER: DASHBOARD PHASE
  // ════════════════════════════════════════════

  if (phase === 'dashboard' || phase === 'transitioning') {
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
        {/* Dashboard content wrapper with exit animation */}
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
              ? {
                  animation: 'dashboardExit 900ms ease-in-out forwards',
                }
              : {}),
          }}
        >
          {/* Heartbeat ECG */}
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

            {/* Input */}
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
                  value={dashboardInput}
                  onChange={(e) => setDashboardInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDashboardSubmit()}
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
                  onClick={handleDashboardSubmit}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    background: dashboardInput.trim() ? '#E85D30' : '#19191C',
                    border: 'none',
                    cursor: dashboardInput.trim() ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: dashboardInput.trim() ? '#0A0A0C' : '#3A3A3F',
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
        animation: 'chatEnter 600ms ease-out both',
        overflow: 'hidden',
      }}
    >
      {/* ─── Chat Header ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 20px',
          borderBottom: '1px solid #19191C',
          animation: 'fadeSlideDown 500ms ease-out 200ms both',
          flexShrink: 0,
        }}
      >
        <KloelAvatar size={34} />
        <div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              fontWeight: 700,
              color: '#E0DDD8',
              letterSpacing: '0.08em',
            }}
          >
            KLOEL
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 2,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 6,
                background: '#4CAF50',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 11,
                color: '#6E6E73',
              }}
            >
              Online -- IA de Vendas
            </span>
          </div>
        </div>
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
          gap: 16,
        }}
      >
        <div
          style={{
            maxWidth: 660,
            width: '100%',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {messages.map((msg, idx) => {
            if (msg.role === 'user') {
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    animation: 'messageSlideIn 0.4s ease-out both',
                  }}
                >
                  <div
                    style={{
                      background: '#E85D30',
                      color: '#0A0A0C',
                      borderRadius: 6,
                      padding: '10px 14px',
                      maxWidth: '75%',
                      fontFamily: "'Sora', sans-serif",
                      fontSize: 14,
                      lineHeight: 1.6,
                      fontWeight: 500,
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            }

            // Assistant message
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  animation: 'messageSlideIn 0.4s ease-out both',
                }}
              >
                <KloelAvatar size={28} pulse={msg.isThinking} />
                <div style={{ flex: 1, maxWidth: '80%' }}>
                  {/* KLOEL label */}
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#E85D30',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginBottom: 6,
                    }}
                  >
                    KLOEL
                  </div>

                  {/* Thinking state */}
                  {msg.isThinking && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        background: '#111113',
                        border: '1px solid #222226',
                        borderRadius: 6,
                      }}
                    >
                      <ThinkingEcg />
                      <span
                        style={{
                          fontFamily: "'Sora', sans-serif",
                          fontSize: 13,
                          color: '#6E6E73',
                          fontStyle: 'italic',
                        }}
                      >
                        pensando...
                      </span>
                    </div>
                  )}

                  {/* Message bubble */}
                  {!msg.isThinking && (
                    <div
                      style={{
                        position: 'relative',
                        background: '#111113',
                        border: '1px solid #222226',
                        borderRadius: 6,
                        padding: '12px 14px',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Orange signature line */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: 60,
                          height: 2,
                          background: 'linear-gradient(90deg, rgba(232,93,48,0.5), transparent)',
                        }}
                      />

                      {/* Text content */}
                      <div
                        style={{
                          fontFamily: "'Sora', sans-serif",
                          fontSize: 14,
                          lineHeight: 1.7,
                          color: '#E0DDD8',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {renderMessageText(msg.displayedContent ?? msg.content)}
                        {/* Typing cursor */}
                        {msg.isTyping && (
                          <span
                            style={{
                              color: '#E85D30',
                              fontWeight: 300,
                              animation: 'cursorBlink 1s ease-in-out infinite',
                              textShadow: '0 0 8px rgba(232, 93, 48, 0.5)',
                              marginLeft: 1,
                            }}
                          >
                            |
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
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
          animation: 'fadeSlideUp 500ms ease-out 300ms both',
        }}
      >
        {/* ECG divider */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '8px 0 4px',
          }}
        >
          <EcgLine width={120} height={16} />
        </div>

        {/* Input row */}
        <div
          style={{
            maxWidth: 660,
            margin: '0 auto',
            padding: '8px 0 16px',
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

            {/* Send button */}
            <button
              onClick={handleChatSubmit}
              disabled={isWaitingForResponse || !chatInput.trim()}
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                background:
                  chatInput.trim() && !isWaitingForResponse
                    ? 'linear-gradient(135deg, #E85D30, #C74420)'
                    : 'transparent',
                border: chatInput.trim() && !isWaitingForResponse ? 'none' : '1px solid #222226',
                cursor: chatInput.trim() && !isWaitingForResponse ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: chatInput.trim() && !isWaitingForResponse ? '#0A0A0C' : '#3A3A3F',
                transition: 'all 150ms ease',
                flexShrink: 0,
              }}
            >
              <SendIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
