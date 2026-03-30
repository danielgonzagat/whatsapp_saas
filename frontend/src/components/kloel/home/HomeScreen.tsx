'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { Heartbeat } from '@/components/kloel/landing/Heartbeat';
import { apiUrl } from '@/lib/http';
import { tokenStorage, apiFetch } from '@/lib/api';
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

const DEV_FALLBACK_MESSAGE = 'Desculpe, nao consegui processar sua mensagem. Tente novamente em alguns instantes.';

const ERROR_MESSAGE = 'Nao foi possivel conectar ao servidor. Tente novamente.';

// ════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════

function genTitle(text: string): string {
  const t = text.trim();
  if (t.length < 3) return 'Nova conversa';

  // Remove leading greetings / filler words
  const cleaned = t
    .replace(/^(oi|ola|olá|hey|bom dia|boa tarde|boa noite|e ai|eai)[,!.\s]*/i, '')
    .replace(/^(eu |me |quero |preciso |gostaria de |pode |como |o que )/i, '')
    .trim() || t;

  // Topic-based titles
  const l = cleaned.toLowerCase();
  if (l.includes('produto') || l.includes('criar produto')) return 'Criar produto';
  if (l.includes('campanha') || l.includes('metrica') || l.includes('métrica')) return 'Analise de campanhas';
  if (l.includes('copy') || l.includes('anuncio') || l.includes('anúncio')) return 'Criacao de copy';
  if (l.includes('lead') || l.includes('funil')) return 'Otimizacao de funil';
  if (l.includes('whatsapp')) return 'WhatsApp';
  if (l.includes('instagram') || l.includes('direct')) return 'Instagram';
  if (l.includes('email') || l.includes('e-mail')) return 'Email marketing';
  if (l.includes('site') || l.includes('landing') || l.includes('pagina')) return 'Construcao de site';
  if (l.includes('preco') || l.includes('preço') || l.includes('plano') || l.includes('assinatura')) return 'Precos e planos';
  if (l.includes('venda') || l.includes('checkout')) return 'Vendas';
  if (l.includes('ajuda') || l.includes('como funciona') || l.includes('tutorial')) return 'Ajuda';

  // Extract first meaningful words (up to 5 words, max 35 chars)
  const words = cleaned.split(/\s+/).slice(0, 5);
  let title = words.join(' ');
  if (title.length > 35) title = title.slice(0, 33) + '...';

  // Capitalize first letter
  return title.charAt(0).toUpperCase() + title.slice(1);
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
  const { addConversation, updateConversationTitle, setActiveConversation } = useConversationHistory();

  // ─── Phase management ───
  const [phase, setPhase] = useState<Phase>('home');
  const [homeInput, setHomeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [thinkingText, setThinkingText] = useState('Analisando...');
  const [chatTitle, setChatTitle] = useState('Nova conversa');
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);


  // ─── Typing simulation ───
  const { displayedText, isTyping, isDone, startTyping, cancel: cancelTyping } = useTypingSimulation();
  const typingMessageIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── Auto-scroll during typing ───
  useEffect(() => {
    if (isTyping && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayedText, isTyping]);

  // ─── Update message with displayed text ───
  useEffect(() => {
    if (!typingMessageIdRef.current) return;
    if (isTyping || isDone) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === typingMessageIdRef.current
            ? { ...msg, displayedContent: displayedText, isTyping: isTyping && !isDone, isThinking: false }
            : msg
        )
      );
    }
  }, [displayedText, isTyping, isDone]);

  // ─── Generate AI title after first response ───
  const titleGeneratedRef = useRef(false);
  const generateAITitle = useCallback(async (userMessage: string, convNumericId: number | string) => {
    if (titleGeneratedRef.current) return;
    titleGeneratedRef.current = true;
    try {
      const token = tokenStorage.getToken();
      const endpoint = token ? '/kloel/think/sync' : '/chat/guest/sync';
      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: `Gere um titulo curto (maximo 5 palavras) para uma conversa que comecou com esta mensagem: "${userMessage}". Responda SOMENTE o titulo, sem aspas, sem explicacao, sem pontuacao final.`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = (data.response || data.reply || data.message || data.answer || '').trim();
        const title = raw.replace(/^["']|["']$/g, '').slice(0, 40);
        if (title && title.length > 2) {
          setChatTitle(title);
          updateConversationTitle(String(convNumericId), title);
        }
      }
    } catch {
      // Keep the genTitle fallback
    }
  }, [updateConversationTitle]);

  // ─── When typing finishes ───
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const activeConvIdRef = useRef(activeConversationId);
  activeConvIdRef.current = activeConversationId;

  useEffect(() => {
    if (isDone) {
      setIsWaitingForResponse(false);

      // Generate AI title from first user message
      const msgs = messagesRef.current;
      const convId = activeConvIdRef.current;
      const firstUserMsg = msgs.find(m => m.role === 'user');
      const userMsgCount = msgs.filter(m => m.role === 'user').length;
      if (firstUserMsg && userMsgCount === 1 && convId) {
        generateAITitle(firstUserMsg.content, convId);
      }

      typingMessageIdRef.current = null;
    }
  }, [isDone, generateAITitle]);

  // ─── Generate unique ID ───
  const generateId = useCallback(() => {
    return `msg_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
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
      abortControllerRef.current?.abort();
      const ac = new AbortController();
      abortControllerRef.current = ac;
      const response = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: messageText, conversationId: activeConversationId || undefined }),
        signal: ac.signal,
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

      // Persist messages to backend thread
      if (activeConversationId) {
        apiFetch(`/kloel/threads/${activeConversationId}/messages`, { method: 'POST', body: { role: 'user', content: messageText } }).catch(() => {});
        apiFetch(`/kloel/threads/${activeConversationId}/messages`, { method: 'POST', body: { role: 'assistant', content: fullContent } }).catch(() => {});
      }

    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        // User stopped the response, do nothing
        return;
      }
      if (IS_DEV) {
        // In development, fall back to demo responses for easier testing
        const fallbackText = DEV_FALLBACK_MESSAGE;

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
      addConversation(title).then(convId => {
        if (convId) setActiveConversation(convId);
      });

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
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    cancelTyping();
    titleGeneratedRef.current = false;
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

  // ─── Stop response ───
  const handleStopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    cancelTyping();
    setIsWaitingForResponse(false);
    if (typingMessageIdRef.current) {
      setMessages(prev => prev.map(msg =>
        msg.id === typingMessageIdRef.current
          ? { ...msg, isThinking: false, isTyping: false, displayedContent: msg.content || msg.displayedContent || '' }
          : msg
      ));
    }
    typingMessageIdRef.current = null;
  }, [cancelTyping]);

  // ─── Copy message to clipboard ───
  const handleCopyMessage = useCallback((msgId: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(prev => prev === msgId ? null : prev), 2000);
    });
  }, []);

  // ─── Edit message: pre-fill chat input ───
  const handleEditMessage = useCallback((content: string) => {
    setChatInput(content);
    setTimeout(() => chatInputRef.current?.focus(), 50);
  }, []);

  // ─── Listen for global new-chat event (from sidebar) ───
  useEffect(() => {
    const handler = () => handleNewChat();
    window.addEventListener('kloel:new-chat', handler);
    return () => window.removeEventListener('kloel:new-chat', handler);
  }, [handleNewChat]);

  // ─── Listen for load-chat event (from CommandPalette search) ───
  useEffect(() => {
    const handler = async (e: Event) => {
      const convId = (e as CustomEvent).detail?.conversationId;
      if (convId != null) {
        setActiveConversation(convId);
        setActiveConversationId(convId);
        setPhase('chat');
        // Load messages from backend
        try {
          const res: any = await apiFetch(`/kloel/threads/${convId}/messages`);
          if (Array.isArray(res) && res.length > 0) {
            setMessages(res.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              displayedContent: m.content,
              isThinking: false,
              isTyping: false,
              timestamp: new Date(m.createdAt),
            })));
          }
        } catch { /* offline fallback */ }
      }
    };
    window.addEventListener('kloel:load-chat', handler);
    return () => window.removeEventListener('kloel:load-chat', handler);
  }, [setActiveConversation]);

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
            <div style={{ animation: 'fadeIn 1s ease forwards' }}>
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
            <div style={{ animation: 'fadeIn 1s ease 400ms forwards' }}>
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
        animation: 'chatEnter 500ms ease-out forwards',
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
              const isUserCopied = copiedId === msg.id;
              return (
                <div
                  key={msg.id}
                  className="kloel-msg-user"
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'flex-end',
                    gap: 6,
                    animation: 'fadeIn 0.4s ease-out forwards',
                  }}
                >
                  {/* Copy + Edit buttons — visible on hover via CSS */}
                  <div
                    className="kloel-msg-actions"
                    style={{
                      display: 'flex',
                      gap: 2,
                      opacity: 0,
                      transition: 'opacity 150ms ease',
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#3A3A3F',
                        fontSize: 11,
                        fontFamily: "'Sora', sans-serif",
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 6px',
                        borderRadius: 4,
                        transition: 'color 150ms ease',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#6E6E73'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#3A3A3F'; }}
                    >
                      {isUserCopied ? (
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      )}
                      {isUserCopied ? 'Copiado' : 'Copiar'}
                    </button>
                    <button
                      onClick={() => handleEditMessage(msg.content)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#3A3A3F',
                        fontSize: 11,
                        fontFamily: "'Sora', sans-serif",
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 6px',
                        borderRadius: 4,
                        transition: 'color 150ms ease',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#6E6E73'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#3A3A3F'; }}
                    >
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Editar
                    </button>
                  </div>
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
            const isAssistantCopied = copiedId === msg.id;
            return (
              <div
                key={msg.id}
                className="kloel-msg-assistant"
                style={{
                  maxWidth: '85%',
                  animation: 'fadeIn 0.4s ease-out forwards',
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

                {/* Copy button — visible on hover via CSS */}
                {!msg.isThinking && !msg.isTyping && msg.content && msg.content !== ERROR_MESSAGE && (
                  <div
                    className="kloel-msg-actions"
                    style={{
                      opacity: 0,
                      transition: 'opacity 150ms ease',
                      marginTop: 6,
                    }}
                  >
                    <button
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#3A3A3F',
                        fontSize: 11,
                        fontFamily: "'Sora', sans-serif",
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 6px',
                        borderRadius: 4,
                        transition: 'color 150ms ease',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#6E6E73'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#3A3A3F'; }}
                    >
                      {isAssistantCopied ? (
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      )}
                      {isAssistantCopied ? 'Copiado' : 'Copiar'}
                    </button>
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

            {/* Stop or Send button */}
            {isWaitingForResponse ? (
              <button
                onClick={handleStopResponse}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'rgba(232, 93, 48, 0.08)',
                  border: '1px solid rgba(232, 93, 48, 0.3)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#E85D30',
                  transition: 'all 150ms ease',
                  flexShrink: 0,
                }}
                title="Parar resposta"
              >
                <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
              </button>
            ) : (
              <button
                onClick={handleChatSubmit}
                disabled={!chatInput.trim()}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: chatInput.trim() ? '#E85D30' : 'transparent',
                  border: chatInput.trim() ? 'none' : '1px solid #222226',
                  cursor: chatInput.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: chatInput.trim() ? '#0A0A0C' : '#3A3A3F',
                  transition: 'all 150ms ease',
                  flexShrink: 0,
                }}
              >
                <SendIcon size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
