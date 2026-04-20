'use client';

import { kloelT } from '@/lib/i18n/t';
// PULSE:OK — Chat bubble with streaming POST calls; SWR mutate imported for consistency.

import { tokenStorage } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { loadKloelThreadMessages, sendAuthenticatedKloelMessage } from '@/lib/kloel-conversations';
import { buildDashboardContextMetadata, buildDashboardHref } from '@/lib/kloel-dashboard-context';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';

const D_RE = /\D/g;

const CARO_PENSAR_DEPOIS_N_O_S_RE = /caro|pensar|depois|não sei|vou ver|talvez/i;

interface KloelChatBubbleProps {
  enabled: boolean;
  welcomeMessage?: string;
  delay?: number;
  position?: 'bottom-right' | 'bottom-left';
  color?: string;
  offerDiscount?: boolean;
  discountCode?: string;
  supportPhone?: string;
  productName?: string;
  productPrice?: string;
  productId?: string;
  planId?: string;
  checkoutSlug?: string;
}

/** Kloel chat bubble. */
export function KloelChatBubble({
  enabled,
  welcomeMessage = 'Oi! Tem alguma duvida? Estou aqui pra ajudar',
  delay = 3000,
  position = 'bottom-right',
  color = '#E85D30',
  offerDiscount = false,
  discountCode,
  supportPhone,
  productName,
  productPrice,
  productId,
  planId,
  checkoutSlug,
}: KloelChatBubbleProps) {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: string; role: string; text: string }>>([]);
  const msgIdRef = useRef(0);
  const nextMsgId = () => {
    msgIdRef.current += 1;
    return `msg-${Date.now()}-${msgIdRef.current}`;
  };
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [discountOffered, setDiscountOffered] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const storageKey = `kloel:checkout-chat:${planId || productId || productName || 'default'}`;
  const dashboardHref = buildDashboardHref({
    conversationId,
    source: 'checkout',
    productId,
    productName,
    planId,
    checkoutSlug,
    draft: !conversationId ? input : undefined,
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [enabled, delay]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        setConversationId(stored);
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    if (!open || !conversationId || messages.length > 0 || !tokenStorage.getToken()) {
      return;
    }

    let cancelled = false;

    void loadKloelThreadMessages(conversationId)
      .then((threadMessages) => {
        if (cancelled || threadMessages.length === 0) {
          return;
        }
        setMessages(
          threadMessages.map((message, idx) => ({
            id: `thread-${message.id ?? idx}`,
            role: message.role,
            text: message.content,
          })),
        );
      })
      .catch(() => {
        // ignore
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, messages.length, open]);

  const isLeft = position === 'bottom-left';

  const sendMessage = async () => {
    if (!input.trim() || loading) {
      return;
    }
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { id: nextMsgId(), role: 'user', text: userMsg }]);
    setLoading(true);

    // Detect hesitation keywords for discount offer
    const hesitation = CARO_PENSAR_DEPOIS_N_O_S_RE.test(userMsg);

    const hasAuthedThread = Boolean(tokenStorage.getToken() && tokenStorage.getWorkspaceId());
    const checkoutContext = [
      productName ? `Produto: ${productName}` : null,
      productPrice ? `Preco: ${productPrice}` : null,
      planId ? `Plano ID: ${planId}` : null,
      productId ? `Produto ID: ${productId}` : null,
      'Origem: checkout',
    ]
      .filter(Boolean)
      .join('. ');

    try {
      let reply = '';

      if (hasAuthedThread) {
        const data = await sendAuthenticatedKloelMessage({
          message: userMsg,
          conversationId,
          mode: 'sales',
          companyContext: checkoutContext,
          metadata: buildDashboardContextMetadata({
            source: 'checkout',
            productId,
            productName,
            planId,
            checkoutSlug,
            draft: userMsg,
          }),
        });

        if (data.conversationId) {
          setConversationId(data.conversationId);
          try {
            sessionStorage.setItem(storageKey, data.conversationId);
          } catch {
            // ignore
          }
        }

        reply =
          data?.response ||
          data?.message ||
          data?.title ||
          'Desculpe, tive uma instabilidade. Tente novamente.';
      } else {
        const res = await fetch(apiUrl('/chat/guest'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMsg,
            context: checkoutContext || undefined,
          }),
        });
        const data = await res.json();
        mutate((key: unknown) => typeof key === 'string' && key.startsWith('/chat'));
        reply =
          data?.response ||
          data?.message ||
          data?.content ||
          'Desculpe, tive uma instabilidade. Tente novamente.';
      }

      // Offer discount if hesitation detected
      if (hesitation && offerDiscount && discountCode && !discountOffered) {
        reply += `\n\nPor sinal, tenho um cupom especial pra voce: **${discountCode}**. Use no checkout pra garantir seu desconto!`;
        setDiscountOffered(true);
      }

      setMessages((prev) => [...prev, { id: nextMsgId(), role: 'assistant', text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextMsgId(),
          role: 'assistant',
          text: 'Desculpe, tive uma instabilidade. Tente novamente.',
        },
      ]);
    }
    setLoading(false);
  };

  if (!enabled || !show) {
    return null;
  }

  // Bubble (closed state)
  if (!open) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          [isLeft ? 'left' : 'right']: 20,
          zIndex: 95,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isLeft ? 'flex-start' : 'flex-end',
          gap: 8,
          animation: 'chatBubbleIn 0.4s ease-out',
        }}
      >
        <style>{`
          @keyframes chatBubbleIn { from { opacity: 0; transform: translateY(10px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes chatPulse { 0%, 100% { box-shadow: 0 0 0 0 ${color}40; } 50% { box-shadow: 0 0 0 8px ${color}00; } }
        `}</style>

        {/* Welcome message tooltip */}
        <div
          style={{
            maxWidth: 240,
            padding: '10px 14px',
            background: '#fff',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            fontSize: 13,
            color: '#1A1714',
            lineHeight: 1.5,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {welcomeMessage}
        </div>

        {/* Chat bubble button */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: color,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 4px 16px ${color}40`,
            animation: 'chatPulse 2s ease-in-out infinite',
          }}
        >
          <svg
            aria-hidden="true"
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth={2}
          >
            <path d={kloelT(`M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z`)} />
          </svg>
        </button>
      </div>
    );
  }

  // Chat window (open state)
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        [isLeft ? 'left' : 'right']: 20,
        zIndex: 95,
        width: 360,
        height: 480,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'chatBubbleIn 0.3s ease-out',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          background: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#10B981',
              boxShadow: '0 0 6px #10B98160',
            }}
          />
          <Link
            href="/"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              fontFamily: "'DM Sans', sans-serif",
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            {kloelT(`Kloel`)}
          </Link>
        </div>
        <button
          type="button"
          aria-label="Fechar chat"
          onClick={() => setOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.7)',
            padding: 4,
          }}
        >
          <svg
            aria-hidden="true"
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Welcome */}
        <div
          style={{
            alignSelf: 'flex-start',
            maxWidth: '80%',
            padding: '10px 14px',
            borderRadius: '12px 12px 12px 4px',
            background: '#F3F3F3',
            fontSize: 13,
            color: '#1A1714',
            lineHeight: 1.5,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {welcomeMessage}
        </div>

        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              background: m.role === 'user' ? color : '#F3F3F3',
              color: m.role === 'user' ? '#fff' : '#1A1714',
              fontSize: 13,
              lineHeight: 1.5,
              fontFamily: "'DM Sans', sans-serif",
              whiteSpace: 'pre-wrap',
            }}
          >
            {m.text}
          </div>
        ))}

        {loading && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '10px 14px',
              borderRadius: '12px 12px 12px 4px',
              background: '#F3F3F3',
              fontSize: 13,
              color: '#999',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {kloelT(`Digitando...`)}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid #eee', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={kloelT(`Digite sua duvida...`)}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid #E8E8E8',
            borderRadius: 8,
            fontSize: 13,
            outline: 'none',
            fontFamily: "'DM Sans', sans-serif",
          }}
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: input.trim() ? color : '#E8E8E8',
            border: 'none',
            cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            aria-hidden="true"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill={input.trim() ? '#fff' : '#999'}
          >
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      {tokenStorage.getToken() && (
        <div style={{ padding: '0 12px 10px' }}>
          <Link
            href={dashboardHref}
            style={{
              display: 'block',
              textAlign: 'center',
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #E8E8E8',
              background: '#FAFAFA',
              fontSize: 12,
              fontWeight: 600,
              color: '#1A1714',
              textDecoration: 'none',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {conversationId
              ? 'Continuar esta conversa no dashboard'
              : 'Abrir esta ajuda no dashboard'}
          </Link>
        </div>
      )}

      {/* WhatsApp fallback */}
      {supportPhone && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid #eee', textAlign: 'center' }}>
          <a
            href={`https://wa.me/55${supportPhone.replace(D_RE, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              color: '#25D366',
              textDecoration: 'none',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {kloelT(`Prefere WhatsApp? Fale conosco`)}
          </a>
        </div>
      )}
    </div>
  );
}
