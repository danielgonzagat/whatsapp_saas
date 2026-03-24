'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { Heartbeat } from '@/components/kloel/landing/Heartbeat';

// ════════════════════════════════════════════
// SEND ICON
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

// ════════════════════════════════════════════
// HOME SCREEN
// ════════════════════════════════════════════

interface HomeScreenProps {
  onSendMessage?: (text: string) => void;
}

export function HomeScreen({ onSendMessage }: HomeScreenProps) {
  const { userName } = useAuth();
  const [input, setInput] = useState('');
  const router = useRouter();

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    if (onSendMessage) {
      onSendMessage(input.trim());
    }
    setInput('');
    router.push(`/chat?q=${encodeURIComponent(input.trim())}`);
  }, [input, onSendMessage, router]);

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
      }}
    >
      {/* Heartbeat ECG — the soul */}
      <div style={{ position: 'absolute', bottom: '15%', left: 0, width: '100%', pointerEvents: 'none', zIndex: 1 }}>
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
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
              onClick={handleSubmit}
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                background: input.trim() ? '#E85D30' : '#19191C',
                border: 'none',
                cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: input.trim() ? '#0A0A0C' : '#3A3A3F',
                transition: 'all 150ms ease',
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
