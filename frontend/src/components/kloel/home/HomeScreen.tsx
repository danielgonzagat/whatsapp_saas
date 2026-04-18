'use client';

// Legacy home shell kept aligned with the persisted Kloel thread model.

import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { tokenStorage } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { loadKloelThreadMessages, sendAuthenticatedKloelMessage } from '@/lib/kloel-conversations';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';

const PATTERN_RE = /(\*\*[^*]+\*\*)/g;

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

const DEV_FALLBACK_MESSAGE =
  'Desculpe, nao consegui processar sua mensagem. Tente novamente em alguns instantes.';

const ERROR_MESSAGE = 'Nao foi possivel conectar ao servidor. Tente novamente.';

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
      aria-hidden="true"
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
      aria-hidden="true"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

// ════════════════════════════════════════════
// TEXT RENDERER (bold = Ember)
// ════════════════════════════════════════════

function renderMessageText(text: string) {
  const parts = text.split(PATTERN_RE);
  // Build stable keys by aggregating preceding parts — collisions only occur when the
  // same part appears with the exact same prior context, which cannot happen in a split().
  let cumulative = '';
  return parts.map((part) => {
    cumulative += `|${part}`;
    const key = cumulative;
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} style={{ color: '#E85D30', fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={key}>{part}</span>;
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
  const { conversations, setActiveConversation, upsertConversation, refreshConversations } =
    useConversationHistory();

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
  const {
    displayedText,
    isTyping,
    isDone,
    startTyping,
    cancel: cancelTyping,
  } = useTypingSimulation();
  const typingMessageIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── Auto-scroll during typing ───
  // biome-ignore lint/correctness/useExhaustiveDependencies: displayedText change is the intentional trigger to scroll each new character into view; ref is read imperatively
  useEffect(() => {
    if (isTyping && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayedText, isTyping]);

  // ─── Update message with displayed text ───
  useEffect(() => {
    if (!typingMessageIdRef.current) return;
    if (isTyping || isDone) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === typingMessageIdRef.current
            ? {
                ...msg,
                displayedContent: displayedText,
                isTyping: isTyping && !isDone,
                isThinking: false,
              }
            : msg,
        ),
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

  const conversationTitleMap = useMemo(() => {
    return new Map(conversations.map((conversation) => [conversation.id, conversation.title]));
  }, [conversations]);

  // ─── Generate unique ID ───
  const generateId = useCallback(() => {
    return `msg_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
  }, []);

  // ─── Send message to API ───
  const sendToApi = useCallback(
    async (messageText: string) => {
      const token = tokenStorage.getToken();
      const workspaceId = tokenStorage.getWorkspaceId();
      const isGuest = !token || !workspaceId;

      const assistantId = generateId();
      typingMessageIdRef.current = assistantId;

      // Add assistant message in thinking state
      setMessages((prev) => [
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
        let fullContent = '';
        let nextConversationId = activeConversationId;
        let nextTitle = chatTitle;

        if (isGuest) {
          const response = await fetch(apiUrl('/chat/guest'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
            },
            body: JSON.stringify({ message: messageText }),
            signal: ac.signal,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          mutate((key: unknown) => typeof key === 'string' && key.startsWith('/chat'));

          const reader = response.body?.getReader();
          if (!reader) throw new Error('No reader');

          const decoder = new TextDecoder();

          // biome-ignore lint/performance/noAwaitInLoops: sequential processing required
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.error) {
                  fullContent =
                    parsed.content ??
                    parsed.message ??
                    'Desculpe, tive uma instabilidade. Tente novamente.';
                  break;
                }
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
        } else {
          const response = await sendAuthenticatedKloelMessage({
            message: messageText,
            conversationId: activeConversationId,
            mode: 'chat',
          });
          fullContent = String(response.response || '').trim();
          nextConversationId = response.conversationId || activeConversationId;
          nextTitle =
            response.title || conversationTitleMap.get(nextConversationId || '') || chatTitle;
        }

        if (!fullContent.trim()) {
          throw new Error('empty_response');
        }

        setTimeout(() => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content: fullContent } : msg)),
          );
          startTyping(fullContent);
        }, thinkDuration);

        if (!isGuest && nextConversationId) {
          setActiveConversationId(nextConversationId);
          setActiveConversation(nextConversationId);
          setChatTitle(nextTitle || 'Nova conversa');
          upsertConversation({
            id: nextConversationId,
            title: nextTitle || 'Nova conversa',
            updatedAt: new Date().toISOString(),
          });
          void refreshConversations();
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
            setMessages((prev) =>
              prev.map((msg) => (msg.id === assistantId ? { ...msg, content: fallbackText } : msg)),
            );
            startTyping(fallbackText);
          }, thinkDuration);
        } else {
          // In production, show error message
          setTimeout(() => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: ERROR_MESSAGE,
                      isThinking: false,
                      isTyping: false,
                      displayedContent: ERROR_MESSAGE,
                    }
                  : msg,
              ),
            );
            setIsWaitingForResponse(false);
            typingMessageIdRef.current = null;
          }, thinkDuration);
        }
      }
    },
    [
      activeConversationId,
      chatTitle,
      conversationTitleMap,
      generateId,
      refreshConversations,
      setActiveConversation,
      startTyping,
      upsertConversation,
    ],
  );

  // ─── Handle first message (triggers transition) ───
  const handleHomeSubmit = useCallback(() => {
    if (!homeInput.trim()) return;
    const text = homeInput.trim();
    setHomeInput('');

    setChatTitle('Nova conversa');
    setActiveConversationId(null);

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

      // Send to API
      sendToApi(text);
      onSendMessage?.(text);
    }, 800);
  }, [homeInput, generateId, sendToApi, onSendMessage]);

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

    setMessages((prev) => [...prev, userMsg]);
    setIsWaitingForResponse(true);
    sendToApi(text);
    onSendMessage?.(text);
  }, [chatInput, isWaitingForResponse, generateId, sendToApi, onSendMessage]);

  // ─── New chat: return to home ───
  const handleNewChat = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
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

  // ─── Stop response ───
  const handleStopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    cancelTyping();
    setIsWaitingForResponse(false);
    if (typingMessageIdRef.current) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === typingMessageIdRef.current
            ? {
                ...msg,
                isThinking: false,
                isTyping: false,
                displayedContent: msg.content || msg.displayedContent || '',
              }
            : msg,
        ),
      );
    }
    typingMessageIdRef.current = null;
  }, [cancelTyping]);

  // ─── Copy message to clipboard ───
  const handleCopyMessage = useCallback((msgId: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId((prev) => (prev === msgId ? null : prev)), 2000);
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
          const res = await loadKloelThreadMessages(String(convId));
          if (res.length > 0) {
            setMessages(
              res.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                displayedContent: m.content,
                isThinking: false,
                isTyping: false,
                timestamp: new Date(m.createdAt),
              })),
            );
          }
          setChatTitle(conversationTitleMap.get(String(convId)) || 'Nova conversa');
        } catch {
          /* offline fallback */
        }
      }
    };
    window.addEventListener('kloel:load-chat', handler);
    return () => window.removeEventListener('kloel:load-chat', handler);
  }, [conversationTitleMap, setActiveConversation]);

  // ─── Auto-scroll on new messages ───
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages.length change is the intentional trigger to auto-scroll; ref is read imperatively
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
          background: 'var(--app-bg-primary)',
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
                  color: 'var(--app-text-primary)',
                  lineHeight: 1.3,
                  margin: '0 0 48px',
                  letterSpacing: '-0.02em',
                }}
              >
                O Marketing morreu <span style={{ color: '#E85D30' }}>Digital</span>
                <br />e ressuscitou <span style={{ color: '#E85D30' }}>Artificial.</span>
              </h1>
            </div>

            {/* Input bar */}
            <div style={{ animation: 'fadeIn 1s ease 400ms forwards' }}>
              <div
                style={{
                  background: 'var(--app-bg-card)',
                  border: '1px solid var(--app-border-primary)',
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
                    color: 'var(--app-text-primary)',
                    fontSize: 14,
                    fontFamily: "'Sora', sans-serif",
                  }}
                />
                <button
                  type="button"
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
        background: 'var(--app-bg-primary)',
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
          borderBottom: '1px solid var(--app-border-subtle)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
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
                      type="button"
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--app-text-tertiary)',
                        fontSize: 11,
                        fontFamily: "'Sora', sans-serif",
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 6px',
                        borderRadius: 4,
                        transition: 'color 150ms ease',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = '#6E6E73';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = '#3A3A3F';
                      }}
                    >
                      {isUserCopied ? (
                        <svg
                          width={12}
                          height={12}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg
                          width={12}
                          height={12}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                      {isUserCopied ? 'Copiado' : 'Copiar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditMessage(msg.content)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--app-text-tertiary)',
                        fontSize: 11,
                        fontFamily: "'Sora', sans-serif",
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 6px',
                        borderRadius: 4,
                        transition: 'color 150ms ease',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = '#6E6E73';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = '#3A3A3F';
                      }}
                    >
                      <svg
                        width={12}
                        height={12}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Editar
                    </button>
                  </div>
                  <div
                    style={{
                      background: '#1A1A1E',
                      color: 'var(--app-text-primary)',
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
                {/* Thinking state: breathing mushroom */}
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
                        color: 'var(--app-text-tertiary)',
                        opacity: 0.6,
                        fontFamily: "'Sora', sans-serif",
                        fontStyle: 'italic',
                      }}
                    >
                      {thinkingText}
                    </span>
                    <KloelMushroomVisual
                      size={28}
                      traceColor="#FFFFFF"
                      animated
                      spores="animated"
                      ariaHidden
                    />
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
                {!msg.isThinking &&
                  !msg.isTyping &&
                  msg.content &&
                  msg.content !== ERROR_MESSAGE && (
                    <div
                      className="kloel-msg-actions"
                      style={{
                        opacity: 0,
                        transition: 'opacity 150ms ease',
                        marginTop: 6,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--app-text-tertiary)',
                          fontSize: 11,
                          fontFamily: "'Sora', sans-serif",
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '2px 6px',
                          borderRadius: 4,
                          transition: 'color 150ms ease',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.color = '#6E6E73';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.color = '#3A3A3F';
                        }}
                      >
                        {isAssistantCopied ? (
                          <svg
                            width={12}
                            height={12}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg
                            width={12}
                            height={12}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
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
          borderTop: '1px solid var(--app-border-subtle)',
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
          {/* biome-ignore lint/a11y/useSemanticElements: a native <search> element lacks broad support; role="search" is the recommended fallback for a custom composite search bar */}
          <div
            role="search"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--app-border-primary)',
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
              type="button"
              style={{
                background: 'none',
                border: 'none',
                padding: 4,
                cursor: 'pointer',
                color: 'var(--app-text-tertiary)',
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
                color: 'var(--app-text-primary)',
                fontSize: 14,
                fontFamily: "'Sora', sans-serif",
                opacity: isWaitingForResponse ? 0.5 : 1,
              }}
            />

            {/* Stop or Send button */}
            {isWaitingForResponse ? (
              <button
                type="button"
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
                <svg
                  aria-hidden="true"
                  width={10}
                  height={10}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
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
