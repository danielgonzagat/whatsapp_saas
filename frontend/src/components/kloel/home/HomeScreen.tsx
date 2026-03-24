'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { StarField } from '../cosmos/StarField';
import { OrbitalInput } from '../cosmos/OrbitalInput';
import { colors } from '@/lib/design-tokens';

interface HomeScreenProps {
  userName?: string;
  onSendMessage?: (text: string) => void;
}

export function HomeScreen({ userName = 'Daniel', onSendMessage }: HomeScreenProps) {
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
        minHeight: '100%',
      }}
    >
      <StarField density={140} />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
        }}
      >
        {/* Greeting */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: 28,
            animation: 'fadeSlideUp .6s cubic-bezier(.25,.46,.45,.94) both',
          }}
        >
          <h1
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 32,
              fontWeight: 600,
              color: colors.text.starlight,
              letterSpacing: '0.02em',
              marginBottom: 8,
              margin: 0,
            }}
          >
            De volta ao trabalho, {userName}?
          </h1>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 15,
              color: colors.text.moonlight,
              margin: '8px 0 0',
            }}
          >
            Descubra o Marketing Artificial
          </p>
        </div>

        {/* Orbital Input */}
        <div
          style={{
            animation: 'fadeSlideUp .6s cubic-bezier(.25,.46,.45,.94) 150ms both',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <OrbitalInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onSubmit={handleSubmit}
            placeholder="Pergunte qualquer coisa..."
          />
        </div>
      </div>
    </div>
  );
}
