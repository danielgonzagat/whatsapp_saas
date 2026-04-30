'use client';

import { kloelT, kloelError } from '@/lib/i18n/t';
// Legacy home shell kept aligned with the persisted Kloel thread model.

import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { tokenStorage } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { readStreamSequential } from '@/lib/async-sequence';
import { colors } from '@/lib/design-tokens';
import { loadKloelThreadMessages, sendAuthenticatedKloelMessage } from '@/lib/kloel-conversations';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';
import { parseKloelChatStreamLine, typingSimulationDelay } from './HomeScreen.helpers';
import { secureRandomFloat } from '@/lib/secure-random';

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
      <path
        d={kloelT(
          `M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48`,
        )}
      />
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
        <strong key={key} style={{ color: colors.ember.primary, fontWeight: 600 }}>
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

      timeoutRef.current = setTimeout(typeNext, typingSimulationDelay(char));
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
