'use client';

import { useCallback, useRef, useState } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { radius } from '@/lib/design-tokens';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { useMindNarrate } from '@/hooks/useMind';
import { postChat, type MindChatMessage } from '@/lib/mind-client';
import { BrainCircuit, Send, AlertTriangle } from 'lucide-react';

const FONT_SANS = "'Sora', sans-serif";
const CHAT_ENDPOINT_AVAILABLE = false;

interface ChatThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  confidence?: number;
}

export function MindChat() {
  const wsId = useWorkspaceId();
  const { narrate } = useMindNarrate();
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !wsId || !CHAT_ENDPOINT_AVAILABLE) return;

    setIsSending(true);
    setSendError(null);

    const userMessage: ChatThreadMessage = {
      id: crypto.randomUUID?.() ?? `msg_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    try {
      const chatMessages: MindChatMessage[] = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: trimmed },
      ];

      const response = await postChat(wsId, { messages: chatMessages });

      const assistantMessage: ChatThreadMessage = {
        id: crypto.randomUUID?.() ?? `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: response.message.content,
        timestamp: Date.now(),
        confidence: response.confidence,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'chat_failed';
      setSendError(msg);
    } finally {
      setIsSending(false);
    }
  }, [input, wsId, messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  return (
    <section style={{ maxWidth: 1240, margin: '0 auto 40px', padding: '0 24px' }}>
      <div
        style={{
          borderRadius: 6,
          border: `1px solid ${KLOEL_THEME.borderPrimary}`,
          background: KLOEL_THEME.bgCard,
          boxShadow: KLOEL_THEME.shadowSm,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: FONT_SANS,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 18px',
            borderBottom: `1px solid ${KLOEL_THEME.borderPrimary}`,
            background: KLOEL_THEME.bgSecondary,
          }}
        >
          <BrainCircuit size={18} strokeWidth={1.8} color={KLOEL_THEME.accent} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: KLOEL_THEME.textTertiary,
              }}
            >
              {kloelT('MIND Chat')}
            </div>
            <div style={{ fontSize: 12, color: KLOEL_THEME.textSecondary }}>
              {kloelT('Converse com o motor de crencas do KLOEL')}
            </div>
          </div>
        </div>

        {!CHAT_ENDPOINT_AVAILABLE ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              padding: '40px 24px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: radius.full,
                border: `1px solid ${KLOEL_THEME.warning}`,
                background: KLOEL_THEME.warningBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={22} strokeWidth={1.8} color={KLOEL_THEME.warning} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: KLOEL_THEME.textPrimary,
                  marginBottom: 6,
                }}
              >
                {kloelT('Endpoint MIND Chat necessario')}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: KLOEL_THEME.textSecondary,
                  maxWidth: 420,
                  lineHeight: 1.5,
                }}
              >
                {kloelT(
                  'O backend ainda nao expoe POST /mind/:workspaceId/chat. O cliente tipado e os componentes estao prontos. Quando o endpoint for implementado, o chat sera ativado automaticamente.',
                )}
              </div>
            </div>
            {narrate?.briefing ? (
              <div
                style={{
                  maxWidth: 520,
                  padding: '12px 16px',
                  borderRadius: 4,
                  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                  background: KLOEL_THEME.bgSecondary,
                  fontSize: 12,
                  color: KLOEL_THEME.textSecondary,
                  lineHeight: 1.5,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: KLOEL_THEME.textTertiary,
                    marginBottom: 6,
                    letterSpacing: '.08em',
                  }}
                >
                  {kloelT('Contexto atual do MIND')}
                </div>
                {narrate.briefing}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div
              style={{
                flex: 1,
                minHeight: 240,
                maxHeight: 400,
                overflowY: 'auto',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {messages.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    color: KLOEL_THEME.textSecondary,
                    fontSize: 13,
                  }}
                >
                  {kloelT('Envie uma mensagem para conversar com o MIND.')}
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '85%',
                        borderRadius: 4,
                        padding: '10px 14px',
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: KLOEL_THEME.textPrimary,
                        background:
                          msg.role === 'user' ? KLOEL_THEME.accentLight : KLOEL_THEME.bgSecondary,
                        border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                      }}
                    >
                      {msg.content}
                    </div>
                    {msg.confidence !== undefined && msg.role === 'assistant' ? (
                      <span style={{ fontSize: 10, color: KLOEL_THEME.textTertiary }}>
                        {kloelT('Confianca')}: {(msg.confidence * 100).toFixed(0)}%
                      </span>
                    ) : null}
                  </div>
                ))
              )}
              {sendError ? (
                <div
                  style={{
                    borderRadius: 4,
                    border: `1px solid ${KLOEL_THEME.error}`,
                    background: KLOEL_THEME.errorBg,
                    padding: '8px 14px',
                    fontSize: 12,
                    color: KLOEL_THEME.error,
                  }}
                >
                  {sendError}
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
                padding: '12px 18px',
                borderTop: `1px solid ${KLOEL_THEME.borderPrimary}`,
                background: KLOEL_THEME.bgSecondary,
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                placeholder={kloelT('Pergunte ao MIND sobre crencas, decisoes e metricas...')}
                rows={1}
                style={{
                  flex: 1,
                  borderRadius: 4,
                  border: `1px solid ${KLOEL_THEME.borderInput}`,
                  background: KLOEL_THEME.bgInput,
                  color: KLOEL_THEME.textPrimary,
                  fontSize: 13,
                  padding: '10px 14px',
                  resize: 'none',
                  fontFamily: FONT_SANS,
                  outline: 'none',
                  lineHeight: 1.5,
                  minHeight: 38,
                }}
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isSending || !input.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 38,
                  height: 38,
                  borderRadius: 4,
                  border: 'none',
                  background:
                    isSending || !input.trim() ? KLOEL_THEME.bgTertiary : KLOEL_THEME.accent,
                  color:
                    isSending || !input.trim()
                      ? KLOEL_THEME.textTertiary
                      : KLOEL_THEME.textOnAccent,
                  cursor: isSending || !input.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSending ? 0.6 : 1,
                  flexShrink: 0,
                }}
                aria-label={kloelT('Enviar')}
              >
                <Send size={16} strokeWidth={1.8} />
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
