'use client';

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import { OrbitalLoader } from './cosmos/OrbitalLoader';

interface TestAILearningModalProps {
  open: boolean;
  onClose: () => void;
  urlDescription?: string;
}

export function TestAILearningModal({ open, onClose, urlDescription }: TestAILearningModalProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!open) return null;

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);

    // Simulate AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `Baseado no conteúdo aprendido de "${urlDescription || 'esta URL'}", posso dizer que esta é uma pergunta relevante. A IA está processando informações para gerar uma resposta personalizada.`,
        },
      ]);
      setLoading(false);
    }, 1500);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(6, 6, 12, 0.8)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          width: 360,
          height: 480,
          background: colors.background.space,
          border: `1px solid ${colors.border.space}`,
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.7)',
          animation: 'fadeSlideUp .3s cubic-bezier(.25,.46,.45,.94) both',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${colors.border.void}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: colors.text.starlight,
            }}
          >
            Testar Aprendizado IA
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: colors.text.dust,
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {messages.length === 0 && (
            <p
              style={{
                textAlign: 'center',
                fontSize: 13,
                color: colors.text.dust,
                marginTop: 40,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Pergunte algo para testar o que a IA aprendeu desta URL
            </p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                background: msg.role === 'user' ? colors.accent.webb : colors.background.nebula,
                border: msg.role === 'ai' ? `1px solid ${colors.border.void}` : 'none',
                color: msg.role === 'user' ? '#fff' : colors.text.starlight,
                fontSize: 13,
                lineHeight: 1.5,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {msg.text}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start', padding: '10px 14px' }}>
              <OrbitalLoader size={20} />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: `1px solid ${colors.border.void}`,
            display: 'flex',
            gap: 8,
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pergunte algo..."
            style={{
              flex: 1,
              background: colors.background.nebula,
              border: `1px solid ${colors.border.space}`,
              borderRadius: 8,
              padding: '8px 12px',
              color: colors.text.starlight,
              fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
              outline: 'none',
            }}
          />
          <button
            onClick={handleSend}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: input.trim() ? colors.accent.webb : colors.background.stellar,
              border: 'none',
              color: input.trim() ? '#fff' : colors.text.void,
              cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
            }}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
