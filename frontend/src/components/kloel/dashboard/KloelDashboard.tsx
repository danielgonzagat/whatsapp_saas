'use client';

import { useState, useEffect, useRef } from 'react';

const F = "'Sora',sans-serif";
const M = "'JetBrains Mono',monospace";
const E = '#E85D30';
const V = '#0A0A0C';

/* ═══════════════════════════════════════════════════════════
   KLOEL LOGO ICON — The Kloel mushroom
   Clean mushroom mark, replaces previous ECG animation.
═══════════════════════════════════════════════════════════ */
function PulseIcon({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/kloel-logo.svg"
      alt="Kloel"
      width={size}
      height={size}
      style={{ display: 'block' }}
    />
  );
}

/* ═══ INPUT BAR COMPONENT — FAT, like Claude's ═══ */
function InputBar({
  input,
  setInput,
  onSend,
  isThinking,
  placeholder,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  isThinking: boolean;
  placeholder: string;
  inputRef: React.RefObject<HTMLInputElement | null> | null;
}) {
  return (
    <div
      style={{
        background: '#111113',
        border: 'none',
        borderRadius: 16,
        padding: '0',
        overflow: 'hidden',
      }}
    >
      {/* Text area top */}
      <div style={{ padding: '18px 20px 12px' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          placeholder={placeholder}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#E0DDD8',
            fontSize: 17,
            fontFamily: F,
          }}
        />
      </div>
      {/* Controls bottom row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px 12px',
        }}
      >
        <button
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6E6E73',
            fontSize: 22,
            fontWeight: 300,
            fontFamily: F,
            borderRadius: 6,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#E0DDD8';
            e.currentTarget.style.background = '#19191C';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#6E6E73';
            e.currentTarget.style.background = 'none';
          }}
        >
          +
        </button>
        <button
          onClick={onSend}
          disabled={!input.trim() || isThinking}
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: input.trim() ? E : '#19191C',
            border: 'none',
            borderRadius: 6,
            cursor: input.trim() ? 'pointer' : 'default',
            color: input.trim() ? V : '#6E6E73',
            transition: 'all .15s',
          }}
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   GREETING — Time-based, with PulseIcon
═══════════════════════════════════════════════════════════ */
function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  if (h >= 18 && h < 24) return 'Boa noite';
  return 'Boa madrugada';
}

/* ═══════════════════════════════════════════════════════════
   CHAT MESSAGE — Reinvented animation
   Messages don't just fade in. They MATERIALIZE.
   Characters resolve from noise to text, left to right.
═══════════════════════════════════════════════════════════ */
function AIMessage({ text, onDone }: { text: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let i = 0;
    const speed = Math.max(12, Math.min(30, 1200 / text.length));
    const iv = setInterval(() => {
      if (!mounted.current) return;
      i++;
      if (i >= text.length) {
        setDisplayed(text);
        setDone(true);
        clearInterval(iv);
        onDone?.();
      } else {
        // Resolved chars + 2-3 scrambled chars at the frontier
        const resolved = text.slice(0, i);
        const frontier = Array.from(
          { length: Math.min(3, text.length - i) },
          () =>
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
              Math.floor(Math.random() * 62)
            ],
        ).join('');
        setDisplayed(resolved + frontier);
      }
    }, speed);
    return () => {
      mounted.current = false;
      clearInterval(iv);
    };
  }, [text]);

  return (
    <div style={{ animation: 'msgIn .3s ease both' }}>
      <div style={{ fontSize: 16, color: '#E0DDD8', lineHeight: 1.75, fontFamily: F }}>
        {displayed}
        {!done && (
          <span style={{ color: E, animation: 'blink 1s ease infinite', marginLeft: 1 }}>|</span>
        )}
      </div>
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div style={{ animation: 'msgIn .25s ease both' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            background: '#19191C',
            border: '1px solid #222226',
            borderRadius: 6,
            padding: '14px 18px',
            maxWidth: '75%',
            fontSize: 16,
            color: '#E0DDD8',
            lineHeight: 1.7,
            fontFamily: F,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN DASHBOARD
═══════════════════════════════════════════════════════════ */
export default function KloelDashboard() {
  const userName = 'Daniel';
  const greeting = getGreeting();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setIsThinking(true);

    setTimeout(
      () => {
        const responses = [
          'Analisei seus dados e identifiquei 3 oportunidades de otimização no funil de vendas. O checkout tem uma taxa de abandono de 34% — posso criar uma sequência de recuperação automática via WhatsApp?',
          'Seu produto mais vendido gerou R$12.400 essa semana. O canal com melhor conversão foi WhatsApp (38%), seguido de Instagram DM (22%). Quer que eu aumente o investimento nesses canais?',
          'Detectei que 47 leads não receberam follow-up nas últimas 24 horas. Posso ativar uma sequência automática agora? Baseado no histórico, isso recupera em média 12% dos leads inativos.',
          'O relatório semanal está pronto. Receita total: R$47.832. Crescimento de 23% vs semana anterior. O agente de IA fechou 89 vendas sem intervenção humana. Quer ver os detalhes?',
        ];
        const response = responses[Math.floor(Math.random() * responses.length)];
        setMessages((prev) => [...prev, { role: 'ai', text: response }]);
        setIsThinking(false);
      },
      3000 + Math.random() * 2000,
    );
  };

  const hasMessages = messages.length > 0;

  return (
    <div
      style={{
        background: V,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: F,
        color: '#E0DDD8',
      }}
    >
      <style>{`
        @keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes thinkPulse { 0%,100% { opacity: .4; } 50% { opacity: 1; } }
        input::placeholder { color: #6E6E73 !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #222226; border-radius: 2px; }
      `}</style>

      {/* ═══ CONTENT AREA ═══ */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 760,
          width: '100%',
          margin: '0 auto',
          padding: '0 24px',
        }}
      >
        {/* ═══ EMPTY STATE — greeting + input centered ═══ */}
        {!hasMessages && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'fadeIn .8s ease both',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 48 }}>
              <PulseIcon size={36} />
              <h1
                style={{
                  fontSize: 'clamp(28px, 5vw, 40px)',
                  fontWeight: 700,
                  letterSpacing: '-0.025em',
                  margin: 0,
                  color: '#E0DDD8',
                }}
              >
                {greeting}, {userName}.
              </h1>
            </div>

            {/* FAT input bar — centered */}
            <div style={{ width: '100%', maxWidth: 680 }}>
              <InputBar
                input={input}
                setInput={setInput}
                onSend={handleSend}
                isThinking={isThinking}
                placeholder="Como posso ajudar você hoje?"
                inputRef={inputRef}
              />
            </div>
          </div>
        )}

        {/* ═══ CHAT STATE — messages + input at bottom ═══ */}
        {hasMessages && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', paddingTop: 40, paddingBottom: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {messages.map((msg, i) =>
                  msg.role === 'user' ? (
                    <UserMessage key={i} text={msg.text} />
                  ) : (
                    <AIMessage key={i} text={msg.text} />
                  ),
                )}
                {isThinking && (
                  <div style={{ animation: 'msgIn .3s ease both', padding: '8px 0' }}>
                    <PulseIcon size={120} />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input at bottom when chatting */}
            <div style={{ paddingBottom: 28, paddingTop: 12, flexShrink: 0 }}>
              <InputBar
                input={input}
                setInput={setInput}
                onSend={handleSend}
                isThinking={isThinking}
                placeholder="Responder..."
                inputRef={null}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
