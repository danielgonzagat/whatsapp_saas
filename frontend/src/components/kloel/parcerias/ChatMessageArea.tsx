'use client';

import { useEffect, useRef } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { usePartnerMessages, sendPartnerMessage } from '@/hooks/usePartnerships';
import type { PartnerContact, PartnerMessage } from './partnershipTypes';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

export default function ChatMessageArea({
  selectedChat,
  chatInput,
  setChatInput,
  messages,
  setMessages,
}: {
  selectedChat: PartnerContact | null;
  chatInput: string;
  setChatInput: (s: string) => void;
  messages: PartnerMessage[];
  setMessages: (m: PartnerMessage[]) => void;
}) {
  const { messages: realMsgs, mutate: mutateMsgs } = usePartnerMessages(selectedChat?.id || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const displayMessages: PartnerMessage[] =
    (realMsgs as PartnerMessage[]).length > 0 ? (realMsgs as PartnerMessage[]) : messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length]);

  const handleSend = async () => {
    if (!chatInput.trim() || !selectedChat) return;
    const content = chatInput.trim();
    setChatInput('');
    try {
      await sendPartnerMessage(selectedChat.id, content);
      mutateMsgs();
    } catch (e) {
      console.error('Failed to send message', e);
    }
    const newMsg = {
      id: `local-${Date.now()}`,
      sender: 'Voce',
      content,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
    };
    setMessages([...messages, newMsg]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!selectedChat) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.card, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: C.muted }}>{IC.chat(28)}</span>
          </div>
          <h3 style={{ fontFamily: FONT.sans, fontSize: 16, fontWeight: 600, color: C.secondary, margin: 0 }}>{kloelT(`Selecione uma conversa`)}</h3>
          <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted, margin: 0, maxWidth: 300, textAlign: 'center' as const }}>{kloelT(`Escolha um parceiro na lista ao lado para iniciar ou continuar uma conversa`)}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${C.divider}`, background: C.card }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: selectedChat.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.elevated, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: selectedChat.type === 'producer' ? '#8B5CF6' : C.text }}>
          {(selectedChat.name || '?')[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text }}>{selectedChat.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: FONT.sans, color: selectedChat.type === 'producer' ? '#8B5CF6' : C.ember, background: selectedChat.type === 'producer' ? 'rgba(139,92,246,0.15)' : C.emberStrong, letterSpacing: '0.02em', textTransform: 'uppercase' as const }}>
              {selectedChat.type === 'producer' ? 'Produtor' : 'Afiliado'}
            </span>
            {selectedChat.online && <span style={{ fontFamily: FONT.sans, fontSize: 11, color: '#10B981' }}>online</span>}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {displayMessages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ color: C.muted }}>{IC.chat(24)}</span>
            <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted, margin: 0 }}>{kloelT(`Nenhuma mensagem ainda`)}</p>
          </div>
        )}
        {displayMessages.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.isMe ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '70%', padding: '10px 14px', borderRadius: 6, background: msg.isMe ? C.ember : C.card, border: msg.isMe ? 'none' : `1px solid ${C.border}` }}>
              {!msg.isMe && <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: C.ember, marginBottom: 4 }}>{msg.sender}</div>}
              <div style={{ fontFamily: FONT.sans, fontSize: 13, color: msg.isMe ? '#fff' : C.text, lineHeight: 1.5 }}>{msg.content}</div>
              <div style={{ fontFamily: FONT.sans, fontSize: 10, color: msg.isMe ? 'rgba(255,255,255,0.6)' : C.muted, textAlign: 'right' as const, marginTop: 4 }}>{msg.time}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderTop: `1px solid ${C.divider}`, background: C.card }}>
        <input aria-label="Mensagem" type="text" placeholder={kloelT(`Digite sua mensagem...`)} value={chatInput}
          onChange={(e) => setChatInput(e.target.value)} onKeyDown={handleKeyDown}
          style={{ flex: 1, padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT.sans, fontSize: 13, outline: 'none' }} />
        <button type="button" onClick={handleSend} disabled={!chatInput.trim()}
          style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: chatInput.trim() ? C.ember : C.elevated, border: 'none', borderRadius: 6, cursor: chatInput.trim() ? 'pointer' : 'default', transition: 'background 150ms ease', flexShrink: 0 }}>
          <span style={{ color: chatInput.trim() ? '#fff' : C.muted }}>{IC.send(16)}</span>
        </button>
      </div>
    </div>
  );
}
