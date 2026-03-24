'use client';

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
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

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `Baseado no conteudo aprendido de "${urlDescription || 'esta URL'}", posso dizer que esta e uma pergunta relevante. A IA esta processando informacoes para gerar uma resposta personalizada.`,
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
        style={{ position: 'absolute', inset: 0, background: 'rgba(10, 10, 12, 0.8)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          width: 360,
          height: 480,
          background: '#111113',
          border: '1px solid #222226',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'none',
          animation: 'fadeIn .15s ease both',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid #19191C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: '#E0DDD8',
            }}
          >
            Testar Aprendizado IA
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#3A3A3F',
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
                color: '#3A3A3F',
                marginTop: 40,
                fontFamily: "'Sora', sans-serif",
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
                borderRadius: 6,
                background: msg.role === 'user' ? '#E85D30' : '#111113',
                border: msg.role === 'ai' ? '1px solid #222226' : 'none',
                color: msg.role === 'user' ? '#0A0A0C' : '#E0DDD8',
                fontSize: 13,
                lineHeight: 1.5,
                fontFamily: "'Sora', sans-serif",
              }}
            >
              {msg.role === 'ai' && (
                <span style={{ display: 'block', fontSize: 10, color: '#E85D30', fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>KLOEL</span>
              )}
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
            borderTop: '1px solid #19191C',
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
              background: '#111113',
              border: '1px solid #222226',
              borderRadius: 6,
              padding: '8px 12px',
              color: '#E0DDD8',
              fontSize: 13,
              fontFamily: "'Sora', sans-serif",
              outline: 'none',
            }}
          />
          <button
            onClick={handleSend}
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: input.trim() ? '#E85D30' : '#19191C',
              border: 'none',
              color: input.trim() ? '#0A0A0C' : '#3A3A3F',
              cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              transition: 'all 150ms ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
