'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { Heartbeat } from '@/components/kloel/landing/Heartbeat';
import { FloatingChat } from '@/components/kloel/landing/FloatingChat';

/*
  ████████████████████████████████████████████████████████████
  KLOEL — Landing Page — COMPLETE REWRITE

  "O Marketing morreu Digital e ressuscitou Artificial."

  Sections:
  1.  Header (fixed, blur backdrop)
  2.  Hero (manifesto + ECG + email input)
  3.  Obituário (generic tool names)
  4.  Você pensa. A IA age. + WhatsAppDemo
  5.  Stats grid (24/7, <3s, 100%, 0)
  6.  Todos os canais. Um agente. + MultiChannelDemo
  7.  Controle total + LiveDashboard
  8.  Capability Grid
  9.  Numbers
  10. Manifesto Final + NerveCenter
  11. FAQ
  12. Footer
  ████████████████████████████████████████████████████████████
*/

/* === SECTION WRAPPER === */
function Sec({ children, style, id }: { children: React.ReactNode; style?: React.CSSProperties; id?: string }) {
  return (
    <section id={id} style={{ padding: "120px 24px", maxWidth: 1100, margin: "0 auto", ...style }}>
      {children}
    </section>
  );
}

/* === LAZY SECTION — only renders children when scrolled into view === */
function LazySection({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); ob.disconnect(); }
    }, { rootMargin: '200px' });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  return <div ref={ref}>{visible ? children : <div style={{ minHeight: 400 }} />}</div>;
}

/* ═══════════════════════════════════════════════════════════
   WhatsAppDemo — Full WhatsApp Web simulation
   Browser chrome, sidebar, animated cursor, messages,
   typing dots, AI responses, sale notification
   ═══════════════════════════════════════════════════════════ */
function WhatsAppDemo() {
  const [phase, setPhase] = useState(0);
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 50 });
  const [activeChat, setActiveChat] = useState(0);
  const [messages, setMessages] = useState<{ from: string; text: string; ai?: boolean }[]>([]);
  const [typing, setTyping] = useState(false);
  const [saleNotif, setSaleNotif] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const cycleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chats = [
    { name: "Marina Costa", preview: "Oi, quero saber mais...", avatar: "MC", unread: 3 },
    { name: "Pedro Almeida", preview: "Quanto custa?", avatar: "PA", unread: 1 },
    { name: "Julia Santos", preview: "Voce tem parcelamento?", avatar: "JS", unread: 2 },
    { name: "Rafael Lima", preview: "Quero comprar agora", avatar: "RL", unread: 0 },
    { name: "Ana Oliveira", preview: "Obrigada!", avatar: "AO", unread: 0 },
    { name: "Carlos Dias", preview: "Me envia o link", avatar: "CD", unread: 1 },
  ];

  const conversation = [
    { from: "Marina Costa", text: "Oi! Vi o anuncio do curso de marketing digital. Quanto custa?" },
    { from: "KLOEL IA", text: "Ola Marina! 😊 O curso completo de Marketing Digital esta por R$497 a vista ou 12x de R$49,70. Ele inclui +40h de conteudo, certificado e acesso vitalicio. Quer que eu te envie o link de inscricao?", ai: true },
    { from: "Marina Costa", text: "Tem desconto?" },
    { from: "KLOEL IA", text: "Para voce Marina, tenho uma condicao especial! 🔥 Se fechar agora consigo liberar por R$397 a vista ou 12x de R$39,70. E ainda incluo o bonus de mentorias ao vivo. Essa oferta expira em 15 minutos. Quer aproveitar?", ai: true },
    { from: "Marina Costa", text: "Quero sim!! Me envia o link" },
    { from: "KLOEL IA", text: "Perfeito! 🎉 Aqui esta o link seguro do checkout: kloel.com/checkout/mkt-digital?cupom=MARINA397 — O pagamento e 100% seguro e voce recebe acesso imediato. Qualquer duvida, estou aqui!", ai: true },
  ];

  useEffect(() => {
    let cancelled = false;

    function wait(ms: number) {
      return new Promise(r => setTimeout(r, ms));
    }

    async function runCycle() {
      if (cancelled) return;

      // Reset
      setMessages([]);
      setTyping(false);
      setSaleNotif(false);
      setActiveChat(0);
      setPhase(0);

      // Phase 0: cursor moves to first chat
      await wait(600);
      if (cancelled) return;
      setCursorPos({ x: 15, y: 30 });
      await wait(800);
      if (cancelled) return;
      setPhase(1);

      // Phase 1: click on chat, messages appear
      for (let i = 0; i < conversation.length; i++) {
        if (cancelled) return;
        const msg = conversation[i];
        if (msg.ai) {
          setTyping(true);
          await wait(1200);
          if (cancelled) return;
          setTyping(false);
        } else {
          await wait(700);
        }
        if (cancelled) return;
        setMessages(prev => [...prev, msg]);
        await wait(500);
      }

      // Phase 2: sale notification
      if (cancelled) return;
      await wait(800);
      setSaleNotif(true);
      setPhase(2);

      // Wait then restart
      await wait(4000);
      if (!cancelled) runCycle();
    }

    runCycle();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#0D1117", border: "1px solid #222226", maxWidth: 600, margin: "0 auto" }}>
      {/* Browser Chrome */}
      <div style={{ background: "#161B22", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #222226" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
        </div>
        <div style={{ flex: 1, textAlign: "center", fontSize: 11, color: "#6E6E73", fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>web.whatsapp.com</div>
      </div>

      <div style={{ display: "flex", height: 360 }}>
        {/* Sidebar */}
        <div className="wa-sidebar" style={{ width: 180, borderRight: "1px solid #222226", background: "#111113", overflowY: "auto", flexShrink: 0 }}>
          {chats.map((c, i) => (
            <div key={i} style={{
              padding: "10px 12px",
              borderBottom: "1px solid #19191C",
              background: activeChat === i ? "#19191C" : "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "background .15s",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: i === 0 ? "#E85D30" : "#222226",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600, color: i === 0 ? "#0A0A0C" : "#6E6E73",
                fontFamily: "var(--font-sora), 'Sora', sans-serif", flexShrink: 0,
              }}>{c.avatar}</div>
              <div style={{ overflow: "hidden", flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#E0DDD8", fontFamily: "var(--font-sora), 'Sora', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                <div style={{ fontSize: 10, color: "#3A3A3F", fontFamily: "var(--font-sora), 'Sora', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.preview}</div>
              </div>
              {c.unread > 0 && (
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{c.unread}</div>
              )}
            </div>
          ))}
        </div>

        {/* Chat Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0A0A0C" }}>
          {/* Chat header */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #19191C", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", background: "#E85D30",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 600, color: "#0A0A0C", fontFamily: "var(--font-sora), 'Sora', sans-serif",
            }}>MC</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#E0DDD8", fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>Marina Costa</div>
              <div style={{ fontSize: 9, color: "#25D366", fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>online</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.ai ? "flex-start" : "flex-end",
                maxWidth: "80%",
                animation: "msgAppear .3s ease both",
              }}>
                {msg.ai && (
                  <div style={{ fontSize: 8, color: "#E85D30", fontWeight: 700, marginBottom: 2, fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace", letterSpacing: "0.1em" }}>KLOEL IA</div>
                )}
                <div style={{
                  background: msg.ai ? "#111113" : "#005C4B",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#E0DDD8",
                  lineHeight: 1.5,
                  fontFamily: "var(--font-sora), 'Sora', sans-serif",
                  border: msg.ai ? "1px solid #222226" : "none",
                }}>{msg.text}</div>
              </div>
            ))}

            {/* Typing indicator */}
            {typing && (
              <div style={{ alignSelf: "flex-start", maxWidth: "80%", animation: "msgAppear .3s ease both" }}>
                <div style={{ fontSize: 8, color: "#E85D30", fontWeight: 700, marginBottom: 2, fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace", letterSpacing: "0.1em" }}>KLOEL IA</div>
                <div style={{ background: "#111113", padding: "10px 16px", borderRadius: 6, border: "1px solid #222226", display: "flex", gap: 4 }}>
                  {[0, 1, 2].map(d => (
                    <div key={d} style={{
                      width: 6, height: 6, borderRadius: "50%", background: "#6E6E73",
                      animation: `typingBounce .6s ease infinite`,
                      animationDelay: `${d * 0.15}s`,
                    }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid #19191C", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, background: "#111113", borderRadius: 6, padding: "8px 12px", fontSize: 11, color: "#3A3A3F", fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>
              Digite uma mensagem
            </div>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#3A3A3F" strokeWidth={2}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          </div>
        </div>
      </div>

      {/* Animated cursor */}
      <div style={{
        position: "absolute",
        left: `${cursorPos.x}%`,
        top: `${cursorPos.y}%`,
        width: 16,
        height: 16,
        transition: "left .8s cubic-bezier(.4,0,.2,1), top .8s cubic-bezier(.4,0,.2,1)",
        pointerEvents: "none",
        zIndex: 10,
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,.5))",
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M1 1l5.5 14L8 9l6-1.5L1 1z" fill="#E0DDD8" stroke="#0A0A0C" strokeWidth="1" />
        </svg>
      </div>

      {/* Sale notification */}
      {saleNotif && (
        <div style={{
          position: "absolute",
          top: 50,
          right: 16,
          background: "#0D6E3A",
          border: "1px solid #28A745",
          borderRadius: 6,
          padding: "12px 16px",
          animation: "saleSlide .4s ease both",
          zIndex: 20,
          maxWidth: 240,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14 }}>🎉</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#28A745", fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace", letterSpacing: "0.05em" }}>VENDA CONFIRMADA</span>
          </div>
          <div style={{ fontSize: 11, color: "#E0DDD8", fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>
            Marina Costa — R$397,00
          </div>
          <div style={{ fontSize: 9, color: "#6E6E73", fontFamily: "var(--font-sora), 'Sora', sans-serif", marginTop: 2 }}>
            via Kloel Checkout • agora
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MultiChannelDemo — 3 panels: Instagram, Email, SMS
   ═══════════════════════════════════════════════════════════ */
function MultiChannelDemo() {
  const [activePanel, setActivePanel] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActivePanel(p => (p + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const channels = [
    {
      name: "Instagram DM",
      icon: "📸",
      color: "#E1306C",
      messages: [
        { from: "user", text: "Vi seu post sobre o curso! Como funciona?" },
        { from: "ai", text: "Ola! 💜 O curso tem 40h de conteudo, acesso vitalicio e certificado. Quer ver a pagina completa?" },
        { from: "user", text: "Quero!" },
        { from: "ai", text: "Aqui esta! 🔗 E tenho um cupom de 20% OFF so pra seguidores do Insta. Posso aplicar?" },
      ],
    },
    {
      name: "Email",
      icon: "📧",
      color: "#E85D30",
      messages: [
        { from: "subject", text: "Assunto: Sua vaga esta reservada, mas por pouco tempo ⏰" },
        { from: "ai", text: "Oi [Nome], percebi que voce visitou a pagina do curso 3x essa semana mas ainda nao se inscreveu. Separei uma condicao especial: 30% OFF se fechar nas proximas 24h..." },
      ],
    },
    {
      name: "SMS",
      icon: "💬",
      color: "#25D366",
      messages: [
        { from: "ai", text: "[Kloel] Oi Marina! Seu carrinho ainda esta aberto com R$200 de desconto. Link: kloel.com/c/xyz — Expira em 2h!" },
      ],
    },
  ];

  const ch = channels[activePanel];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 800, margin: "0 auto" }} className="grid3">
      {channels.map((c, i) => (
        <div key={i} style={{
          background: activePanel === i ? "#111113" : "#0A0A0C",
          border: `1px solid ${activePanel === i ? c.color + '44' : '#222226'}`,
          borderRadius: 6,
          padding: 16,
          transition: "all .3s ease",
          opacity: activePanel === i ? 1 : 0.5,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 16 }}>{c.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: activePanel === i ? c.color : "#6E6E73", fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>{c.name}</span>
          </div>
          {activePanel === i && c.messages.map((msg, j) => (
            <div key={j} style={{
              padding: "6px 10px",
              marginBottom: 6,
              borderRadius: 4,
              background: msg.from === "ai" ? "#19191C" : (msg.from === "subject" ? "#19191C" : "transparent"),
              fontSize: 10,
              color: msg.from === "ai" ? "#E0DDD8" : (msg.from === "subject" ? "#E85D30" : "#6E6E73"),
              lineHeight: 1.5,
              fontFamily: "var(--font-sora), 'Sora', sans-serif",
              animation: `msgAppear .3s ease both`,
              animationDelay: `${j * 0.15}s`,
              border: msg.from === "ai" ? "1px solid #222226" : "none",
            }}>
              {msg.from === "ai" && <span style={{ fontSize: 7, color: "#E85D30", fontWeight: 700, fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace", display: "block", marginBottom: 2 }}>KLOEL IA</span>}
              {msg.text}
            </div>
          ))}
          {activePanel !== i && (
            <div style={{ fontSize: 10, color: "#3A3A3F", fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>
              {c.messages.length} mensagens...
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   LiveDashboard — Numbers climbing, activity feed
   ═══════════════════════════════════════════════════════════ */
function LiveDashboard() {
  const [revenue, setRevenue] = useState(0);
  const [leads, setLeads] = useState(0);
  const [convRate, setConvRate] = useState(0);
  const [active, setActive] = useState(0);
  const [feed, setFeed] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !visible) {
        setVisible(true);
      }
    }, { threshold: 0.3 });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const targetRevenue = 47832;
    const targetLeads = 1247;
    const targetConv = 34;
    const targetActive = 89;
    const steps = 60;
    let step = 0;

    const feedItems = [
      "🟢 Nova venda: R$497 — Pedro A.",
      "📩 Lead qualificado: Julia S.",
      "🤖 IA respondeu 3 mensagens",
      "💳 Carrinho recuperado: R$297",
      "🟢 Nova venda: R$397 — Marina C.",
      "📊 Campanha email: 42% abertura",
      "🤖 IA fechou venda: R$997",
      "📩 Lead via Instagram DM",
    ];

    intervalRef.current = setInterval(() => {
      step++;
      const p = Math.min(step / steps, 1);
      const eased = 1 - Math.pow(1 - p, 3);

      setRevenue(Math.round(targetRevenue * eased));
      setLeads(Math.round(targetLeads * eased));
      setConvRate(Math.round(targetConv * eased));
      setActive(Math.round(targetActive * eased));

      if (step % 8 === 0 && feed.length < feedItems.length) {
        setFeed(prev => [...prev, feedItems[prev.length]]);
      }

      if (step >= steps) {
        clearInterval(intervalRef.current!);
      }
    }, 50);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visible]);

  return (
    <div ref={containerRef} style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, overflow: "hidden", maxWidth: 700, margin: "0 auto" }}>
      {/* Top bar */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #19191C", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#25D366", animation: "pulse 2s ease infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#E0DDD8", fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>Dashboard ao Vivo</span>
        </div>
        <span style={{ fontSize: 9, color: "#6E6E73", fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace" }}>TEMPO REAL</span>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "#19191C" }} className="dash-grid">
        {[
          { label: "Receita", value: `R$${revenue.toLocaleString("pt-BR")}`, color: "#E85D30" },
          { label: "Leads", value: leads.toLocaleString("pt-BR"), color: "#E0DDD8" },
          { label: "Conversao", value: `${convRate}%`, color: "#25D366" },
          { label: "Agentes Ativos", value: String(active), color: "#E0DDD8" },
        ].map((s, i) => (
          <div key={i} style={{ background: "#111113", padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#6E6E73", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace" }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Activity feed */}
      <div style={{ padding: 16, maxHeight: 160, overflowY: "auto" }}>
        <div style={{ fontSize: 9, color: "#6E6E73", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace" }}>Atividade Recente</div>
        {feed.map((item, i) => (
          <div key={i} style={{
            padding: "6px 0",
            borderBottom: "1px solid #19191C",
            fontSize: 11,
            color: "#E0DDD8",
            fontFamily: "var(--font-sora), 'Sora', sans-serif",
            animation: "msgAppear .3s ease both",
          }}>{item}</div>
        ))}
        {feed.length === 0 && (
          <div style={{ fontSize: 11, color: "#3A3A3F", fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>Aguardando dados...</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   NerveCenter — Terminal typing, 6 channel panels,
   revenue climbing, sale toasts, final flash
   ═══════════════════════════════════════════════════════════ */
function NerveCenter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [typingLine, setTypingLine] = useState("");
  const [panels, setPanels] = useState<number[]>([]);
  const [panelLines, setPanelLines] = useState<Record<number, string[]>>({});
  const [revenue, setRevenue] = useState(0);
  const [toasts, setToasts] = useState<{ text: string; id: number }[]>([]);
  const [flash, setFlash] = useState(false);
  const toastIdRef = useRef(0);

  const channelPanels = [
    { name: "WhatsApp", icon: "💬", color: "#25D366", lines: ["348 conversas ativas", "12 vendas/hora", "Tempo medio: 2.4s", "97% satisfacao"] },
    { name: "Instagram", icon: "📸", color: "#E1306C", lines: ["89 DMs respondidas", "23 stories c/ link", "4 vendas via DM", "CTR: 8.4%"] },
    { name: "Email", icon: "📧", color: "#E85D30", lines: ["2.847 emails enviados", "42% taxa abertura", "12% click-through", "R$4.200 em vendas"] },
    { name: "Checkout", icon: "💳", color: "#FFD700", lines: ["147 checkouts abertos", "89 pagamentos ok", "R$32.400 processado", "3 carrinhos recuperados"] },
    { name: "Trafego", icon: "📊", color: "#6E6E73", lines: ["12.400 visitas hoje", "3.2% conversao", "CPA: R$4,80", "ROAS: 8.2x"] },
    { name: "Resultado", icon: "🎯", color: "#E0DDD8", lines: ["Meta: R$50.000", "Atual: R$47.832", "Faltam: R$2.168", "ETA: 1h 20min"] },
  ];

  const terminalCommands = [
    "$ kloel deploy --all-channels",
    "> Inicializando agente IA...",
    "> WhatsApp: conectado ✓",
    "> Instagram: conectado ✓",
    "> Email: configurado ✓",
    "> Checkout: ativo ✓",
    "> Trafego: monitorando ✓",
    "> Sistema operacional. Modo autonomo ativado.",
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !visible) {
        setVisible(true);
      }
    }, { threshold: 0.2 });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    async function run() {
      // Phase 1: Terminal typing
      for (const cmd of terminalCommands) {
        if (cancelled) return;
        // Type character by character
        for (let c = 0; c <= cmd.length; c++) {
          if (cancelled) return;
          setTypingLine(cmd.slice(0, c));
          await wait(30);
        }
        setTerminalLines(prev => [...prev, cmd]);
        setTypingLine("");
        await wait(300);
      }

      // Phase 2: Panels materialize
      for (let i = 0; i < channelPanels.length; i++) {
        if (cancelled) return;
        setPanels(prev => [...prev, i]);
        await wait(400);

        // Lines appear one by one
        for (let j = 0; j < channelPanels[i].lines.length; j++) {
          if (cancelled) return;
          setPanelLines(prev => ({
            ...prev,
            [i]: [...(prev[i] || []), channelPanels[i].lines[j]],
          }));
          await wait(200);
        }
      }

      // Phase 3: Revenue climbing + sale toasts
      if (cancelled) return;
      const targetRevenue = 50000;
      const steps = 80;
      for (let s = 0; s <= steps; s++) {
        if (cancelled) return;
        const p = s / steps;
        const eased = 1 - Math.pow(1 - p, 3);
        setRevenue(Math.round(targetRevenue * eased));

        // Toasts at certain points
        if (s === 20 || s === 40 || s === 55 || s === 70) {
          const names = ["Pedro A.", "Julia S.", "Carlos D.", "Ana O."];
          const amounts = ["R$497", "R$997", "R$297", "R$397"];
          const idx = [20, 40, 55, 70].indexOf(s);
          toastIdRef.current++;
          const id = toastIdRef.current;
          setToasts(prev => [...prev, { text: `🟢 ${names[idx]} — ${amounts[idx]}`, id }]);
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
          }, 2500);
        }

        await wait(60);
      }

      // Phase 4: Flash when goal reached
      if (cancelled) return;
      setFlash(true);
      await wait(600);
      setFlash(false);
    }

    run();
    return () => { cancelled = true; };
  }, [visible]);

  function wait(ms: number) {
    return new Promise(r => setTimeout(r, ms));
  }

  return (
    <div ref={containerRef} style={{ position: "relative", maxWidth: 900, margin: "0 auto" }}>
      {/* Flash overlay */}
      {flash && (
        <div style={{
          position: "absolute", inset: -20, background: "rgba(232,93,48,0.08)", borderRadius: 12,
          animation: "ncFadeIn .3s ease both", zIndex: 30, pointerEvents: "none",
        }} />
      )}

      {/* Terminal */}
      <div style={{ background: "#0A0A0C", border: "1px solid #222226", borderRadius: 6, padding: 16, marginBottom: 20, fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF5F57" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FEBC2E" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#28C840" }} />
          <span style={{ marginLeft: 8, fontSize: 9, color: "#3A3A3F" }}>kloel-nerve-center</span>
        </div>
        {terminalLines.map((line, i) => (
          <div key={i} style={{
            fontSize: 11, color: line.startsWith("$") ? "#E85D30" : (line.includes("✓") ? "#25D366" : "#6E6E73"),
            padding: "2px 0",
            animation: "ncLineIn .2s ease both",
          }}>{line}</div>
        ))}
        {typingLine && (
          <div style={{ fontSize: 11, color: typingLine.startsWith("$") ? "#E85D30" : "#6E6E73", padding: "2px 0" }}>
            {typingLine}<span style={{ animation: "termBlink 1s ease infinite" }}>█</span>
          </div>
        )}
      </div>

      {/* Channel panels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }} className="grid3">
        {panels.map(i => {
          const ch = channelPanels[i];
          return (
            <div key={i} style={{
              background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 14,
              animation: "ncPanelIn .3s ease both",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 14 }}>{ch.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: ch.color, fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>{ch.name}</span>
              </div>
              {(panelLines[i] || []).map((line, j) => (
                <div key={j} style={{
                  fontSize: 10, color: "#6E6E73", padding: "3px 0", borderBottom: "1px solid #19191C",
                  fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
                  animation: "ncLineIn .2s ease both",
                  animationDelay: `${j * 0.1}s`,
                }}>{line}</div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Revenue counter */}
      {revenue > 0 && (
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 9, color: "#6E6E73", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 4, fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace" }}>Receita Acumulada</div>
          <div style={{
            fontSize: 48, fontWeight: 800, color: revenue >= 50000 ? "#25D366" : "#E85D30",
            fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
            letterSpacing: "-0.03em",
            transition: "color .3s ease",
          }}>
            R${revenue.toLocaleString("pt-BR")}
          </div>
          {revenue >= 50000 && (
            <div style={{ fontSize: 12, color: "#25D366", fontWeight: 600, fontFamily: "var(--font-sora), 'Sora', sans-serif", marginTop: 4, animation: "ncFadeIn .3s ease both" }}>
              ✓ Meta atingida — 100% autonomo
            </div>
          )}
        </div>
      )}

      {/* Sale toasts */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 40, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: "#0D6E3A",
            border: "1px solid #28A745",
            borderRadius: 6,
            padding: "10px 16px",
            fontSize: 12,
            color: "#E0DDD8",
            fontFamily: "var(--font-sora), 'Sora', sans-serif",
            animation: "saleSlide .3s ease both",
            whiteSpace: "nowrap",
          }}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ScrollReveal — inline lightweight version
   ═══════════════════════════════════════════════════════════ */
function SR({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.15 });

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(20px)",
      transition: `opacity .6s ease ${delay}ms, transform .6s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

/* === MAIN === */
export default function KloelLanding() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  const [email, setEmail] = useState("");
  const [faq, setFaq] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialMsg, setChatInitialMsg] = useState<string | undefined>(undefined);

  const sora = "var(--font-sora), 'Sora', sans-serif";
  const jetbrains = "var(--font-jetbrains), 'JetBrains Mono', monospace";

  const handleHeroChatSend = useCallback(() => {
    if (!chatInput.trim()) return;
    setChatInitialMsg(chatInput.trim());
    setChatOpen(true);
    setChatInput("");
  }, [chatInput]);

  const KILLED = [
    "Plataforma de cursos",
    "Construtor de funis",
    "Automacao de email",
    "Chatbot manual",
    "Construtor de sites",
    "Agente generico",
    "CRM separado",
    "Automacao de marketing",
    "Plataforma de afiliados",
    "Gateway de pagamento",
    "Ferramenta de SMS",
    "Editor de landing page",
    "Gestor de membros",
    "Ferramenta de analytics",
    "Hospedagem separada",
  ];

  const CAPABILITIES = [
    { cat: "VENDA", items: ["Checkout inteligente", "Gestao de assinaturas", "Order bump", "Upsell automatico", "Recuperacao de carrinho", "Pagamento global (22 moedas)"] },
    { cat: "MARKETING IA", items: ["WhatsApp autonomo", "Instagram autonomo", "Email marketing IA", "SMS automatico", "TikTok automation", "Facebook Messenger"] },
    { cat: "CONSTRUA", items: ["Site builder com IA", "Editor visual", "Landing pages", "Funis completos", "Dominio + hospedagem", "SSL automatico"] },
    { cat: "GERENCIE", items: ["CRM inteligente", "Afiliados", "Area de membros", "Relatorios tempo real", "Financeiro completo", "Multi-workspace"] },
  ];

  const FAQS = [
    { q: "O que e o Kloel?", a: "A primeira inteligencia comercial autonoma do mundo. Uma plataforma all-in-one que substitui dezenas de ferramentas separadas. Voce pensa, a IA age." },
    { q: "Como funciona o agente de IA?", a: "Voce conecta seu WhatsApp via QR Code e a IA assume. Ela responde mensagens, qualifica leads, envia follow-ups e fecha vendas — tudo autonomamente, 24/7. O mesmo agente funciona no Instagram, Email, SMS e todas as redes sociais." },
    { q: "Preciso saber programar?", a: "Nao. O Kloel foi construido para empreendedores, nao programadores. A IA cria seu site, suas paginas de venda, seus emails, seus funis. Voce so precisa pensar na estrategia." },
    { q: "Quanto custa?", a: "O Kloel oferece planos acessiveis com teste gratuito. O objetivo e custar menos do que a soma de ferramentas que voce ja paga hoje." },
    { q: "Posso migrar meus produtos?", a: "Sim. O Kloel tem ferramentas de importacao que facilitam a migracao completa — produtos, clientes, assinantes e historico de vendas." },
    { q: "O agente de IA realmente vende sozinho?", a: "Sim. O agente analisa o contexto da conversa, identifica intencao de compra, apresenta o produto certo, lida com objecoes e fecha a venda. Voce acompanha tudo em tempo real." },
    { q: "E seguro?", a: "O Kloel usa criptografia ponta a ponta, servidores isolados por workspace, e conformidade total com LGPD. Seus dados e os dados dos seus clientes estao protegidos." },
  ];

  return (
    <div style={{ background: "#0A0A0C", color: "#E0DDD8", fontFamily: sora, overflowX: "hidden", minHeight: "100vh" }}>

      {/* ═══════════════════════════════════════
          1. HEADER
      ═══════════════════════════════════════ */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(10,10,12,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #19191C" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", height: 56, alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#E0DDD8", letterSpacing: "-0.02em", fontFamily: sora }}>Kloel</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a href="/login" style={{ fontSize: 13, color: "#6E6E73", textDecoration: "none", padding: "8px 14px", borderRadius: 6, transition: "color .15s", fontFamily: sora }}>Entrar</a>
            <a href="/register" style={{ fontSize: 13, fontWeight: 600, color: "#0A0A0C", background: "#E0DDD8", padding: "8px 18px", borderRadius: 6, textDecoration: "none", transition: "opacity .15s", fontFamily: sora }}>Comecar gratis</a>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════
          2. HERO — O Manifesto
      ═══════════════════════════════════════ */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", padding: "0 24px" }}>
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: 720, animation: "fadeIn 1.2s ease both" }}>
          <p style={{ fontFamily: jetbrains, fontSize: 11, color: "#E85D30", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 32 }}>
            A PRIMEIRA INTELIGENCIA COMERCIAL AUTONOMA DO MUNDO
          </p>
          <h1 style={{ fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 800, color: "#E0DDD8", lineHeight: 1.15, margin: "0 0 28px", letterSpacing: "-0.03em", fontFamily: sora }}>
            O Marketing morreu{" "}<span style={{ color: "#E85D30" }}>Digital</span>
            <br />
            e ressuscitou{" "}<span style={{ color: "#E85D30" }}>Artificial.</span>
          </h1>
          <p style={{ fontSize: 17, color: "#6E6E73", lineHeight: 1.6, maxWidth: 520, margin: "0 auto 40px", fontFamily: sora }}>
            Tudo que voce precisa pra vender na internet. Num lugar so. Com uma IA que age por voce.
          </p>

          {!isAuthenticated ? (
            <>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", maxWidth: 480, margin: "0 auto 16px" }}>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Seu melhor e-mail"
                  style={{ flex: 1, background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: "14px 18px", color: "#E0DDD8", fontSize: 14, fontFamily: sora, outline: "none" }} />
                <button
                  onClick={() => router.push(`/register${email ? `?email=${encodeURIComponent(email)}` : ''}`)}
                  style={{ background: "#E0DDD8", color: "#0A0A0C", border: "none", borderRadius: 6, padding: "14px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: sora }}>
                  Comecar gratis
                </button>
              </div>
              <p style={{ fontSize: 11, color: "#3A3A3F", fontFamily: sora }}>Sem cartao. Sem compromisso. Comece em 30 segundos.</p>
            </>
          ) : (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", maxWidth: 480, margin: "0 auto 16px" }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleHeroChatSend()}
                placeholder="Pergunte qualquer coisa..."
                style={{ flex: 1, background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: "14px 18px", color: "#E0DDD8", fontSize: 14, fontFamily: sora, outline: "none" }}
              />
              <button
                onClick={handleHeroChatSend}
                style={{ background: "#E85D30", color: "#0A0A0C", border: "none", borderRadius: 6, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* ECG */}
        <div style={{ position: "absolute", bottom: "8%", left: 0, width: "100%", zIndex: 1 }}>
          <Heartbeat />
        </div>

        {/* Scroll indicator */}
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", animation: "pulse 2s ease infinite" }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#3A3A3F" strokeWidth={2}><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          3. OBITUARIO — O modelo antigo esta quebrado
      ═══════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid #19191C", borderBottom: "1px solid #19191C" }}>
        <Sec style={{ padding: "80px 24px", textAlign: "center" }}>
          <SR>
            <p style={{ fontFamily: jetbrains, fontSize: 10, color: "#E85D30", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 20 }}>OBITUARIO</p>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: "#E0DDD8", letterSpacing: "-0.02em", marginBottom: 16, fontFamily: sora }}>
              O modelo antigo esta quebrado.
            </h2>
            <p style={{ fontSize: 15, color: "#6E6E73", maxWidth: 520, margin: "0 auto 48px", fontFamily: sora }}>
              Ferramentas que voce nao precisa mais.
            </p>
          </SR>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            {KILLED.map((name, i) => (
              <SR key={name} delay={i * 60}>
                <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: "12px 24px", position: "relative" }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#3A3A3F", textDecoration: "line-through", textDecorationColor: "#E85D30", textDecorationThickness: 2, fontFamily: sora }}>{name}</span>
                </div>
              </SR>
            ))}
          </div>
          <SR delay={900}>
            <p style={{ marginTop: 40, fontSize: 15, color: "#6E6E73", maxWidth: 500, margin: "40px auto 0", fontFamily: sora }}>
              Voce pagava por 5, 10, 15 ferramentas separadas.<br />
              Agora paga por <span style={{ color: "#E85D30", fontWeight: 600 }}>uma</span>. E ela faz mais que todas juntas.
            </p>
          </SR>
        </Sec>
      </div>

      {/* ═══════════════════════════════════════
          4. VOCE PENSA. A IA AGE. + WhatsAppDemo
      ═══════════════════════════════════════ */}
      <Sec>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }} className="grid2">
          <SR>
            <div>
              <p style={{ fontFamily: jetbrains, fontSize: 10, color: "#E85D30", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 16 }}>O CONCEITO</p>
              <h2 style={{ fontSize: 36, fontWeight: 700, color: "#E0DDD8", lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: 20, fontFamily: sora }}>
                Voce pensa.<br /><span style={{ color: "#E85D30" }}>A IA age.</span>
              </h2>
              <p style={{ fontSize: 16, color: "#6E6E73", lineHeight: 1.7, marginBottom: 24, fontFamily: sora }}>
                Seu trabalho e pensar na estrategia. A inteligencia artificial do Kloel executa tudo: responde clientes no WhatsApp, cria seu site, dispara emails, fecha vendas, recupera carrinhos abandonados e gerencia seu negocio inteiro.
              </p>
              <p style={{ fontSize: 16, color: "#6E6E73", lineHeight: 1.7, fontFamily: sora }}>
                24 horas por dia. 7 dias por semana. Sem ferias. Sem erro humano. Sem fadiga.
              </p>
            </div>
          </SR>
          <SR delay={200}>
            <LazySection><WhatsAppDemo /></LazySection>
          </SR>
        </div>
      </Sec>

      {/* ═══════════════════════════════════════
          5. STATS GRID
      ═══════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid #19191C", borderBottom: "1px solid #19191C" }}>
        <Sec style={{ padding: "80px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, textAlign: "center" }} className="grid4">
            {[
              { n: "24/7", l: "Autonomo", s: "Nunca para. Nunca dorme." },
              { n: "< 3s", l: "Tempo de resposta", s: "Mais rapido que qualquer humano" },
              { n: "100%", l: "Das conversas", s: "Nenhum lead ignorado" },
              { n: "0", l: "Leads perdidos", s: "Zero oportunidades desperdicadas" },
            ].map((s, i) => (
              <SR key={s.l} delay={i * 120}>
                <div>
                  <div style={{ fontFamily: jetbrains, fontSize: 48, fontWeight: 700, color: "#E85D30", marginBottom: 4, letterSpacing: "-0.03em" }}>{s.n}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#E0DDD8", marginBottom: 4, fontFamily: sora }}>{s.l}</div>
                  <div style={{ fontSize: 12, color: "#3A3A3F", fontFamily: sora }}>{s.s}</div>
                </div>
              </SR>
            ))}
          </div>
        </Sec>
      </div>

      {/* ═══════════════════════════════════════
          6. TODOS OS CANAIS. UM AGENTE. + MultiChannelDemo
      ═══════════════════════════════════════ */}
      <Sec>
        <SR>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <p style={{ fontFamily: jetbrains, fontSize: 10, color: "#E85D30", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 16 }}>MULTICANAL</p>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: "#E0DDD8", letterSpacing: "-0.02em", marginBottom: 16, fontFamily: sora }}>
              Todos os canais. <span style={{ color: "#E85D30" }}>Um agente.</span>
            </h2>
            <p style={{ fontSize: 16, color: "#6E6E73", maxWidth: 560, margin: "0 auto", fontFamily: sora }}>
              WhatsApp, Instagram, Email, SMS, TikTok, Messenger — a mesma inteligencia artificial, adaptada a cada canal. Um unico cerebro que vende em todos os lugares ao mesmo tempo.
            </p>
          </div>
        </SR>
        <SR delay={200}>
          <LazySection><MultiChannelDemo /></LazySection>
        </SR>
      </Sec>

      {/* ═══════════════════════════════════════
          7. CONTROLE TOTAL + LiveDashboard
      ═══════════════════════════════════════ */}
      <div style={{ background: "#111113", borderTop: "1px solid #19191C", borderBottom: "1px solid #19191C" }}>
        <Sec>
          <SR>
            <div style={{ textAlign: "center", marginBottom: 60 }}>
              <p style={{ fontFamily: jetbrains, fontSize: 10, color: "#E85D30", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 16 }}>DASHBOARD</p>
              <h2 style={{ fontSize: 32, fontWeight: 700, color: "#E0DDD8", letterSpacing: "-0.02em", marginBottom: 16, fontFamily: sora }}>
                Controle total. <span style={{ color: "#E85D30" }}>Tempo real.</span>
              </h2>
              <p style={{ fontSize: 16, color: "#6E6E73", maxWidth: 560, margin: "0 auto", fontFamily: sora }}>
                Acompanhe cada venda, cada lead, cada conversa. Veja a IA trabalhando por voce enquanto voce foca no que importa: a estrategia.
              </p>
            </div>
          </SR>
          <SR delay={200}>
            <LazySection><LiveDashboard /></LazySection>
          </SR>
        </Sec>
      </div>

      {/* ═══════════════════════════════════════
          8. CAPABILITY GRID
      ═══════════════════════════════════════ */}
      <Sec>
        <SR>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <p style={{ fontFamily: jetbrains, fontSize: 10, color: "#E85D30", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 16 }}>ALL-IN-ONE</p>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: "#E0DDD8", letterSpacing: "-0.02em", marginBottom: 16, fontFamily: sora }}>
              Tudo que existe. Num lugar so.
            </h2>
            <p style={{ fontSize: 16, color: "#6E6E73", maxWidth: 520, margin: "0 auto", fontFamily: sora }}>
              Do dominio ao pos-venda. Da copy ao criativo. Do checkout a logistica. Nada fica de fora.
            </p>
          </div>
        </SR>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }} className="grid4">
          {CAPABILITIES.map((cat, ci) => (
            <SR key={cat.cat} delay={ci * 150}>
              <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 24 }}>
                <p style={{ fontFamily: jetbrains, fontSize: 10, color: "#E85D30", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>{cat.cat}</p>
                {cat.items.map(item => (
                  <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #19191C" }}>
                    <div style={{ width: 4, height: 4, background: "#E85D30", borderRadius: 1, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "#E0DDD8", fontFamily: sora }}>{item}</span>
                  </div>
                ))}
              </div>
            </SR>
          ))}
        </div>
      </Sec>

      {/* ═══════════════════════════════════════
          9. NUMBERS
      ═══════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid #19191C", borderBottom: "1px solid #19191C" }}>
        <Sec style={{ padding: "80px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, textAlign: "center" }} className="grid4">
            {[
              { n: "1", l: "Plataforma", s: "Substitui +15 ferramentas" },
              { n: "0", l: "Codigo", s: "Nenhuma linha necessaria" },
              { n: "30s", l: "Para comecar", s: "Do cadastro ao primeiro uso" },
              { n: "\u221E", l: "Canais", s: "WhatsApp, Insta, Email, SMS..." },
            ].map((s, i) => (
              <SR key={s.l} delay={i * 120}>
                <div>
                  <div style={{ fontFamily: jetbrains, fontSize: 48, fontWeight: 700, color: "#E85D30", marginBottom: 4, letterSpacing: "-0.03em" }}>{s.n}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#E0DDD8", marginBottom: 4, fontFamily: sora }}>{s.l}</div>
                  <div style={{ fontSize: 12, color: "#3A3A3F", fontFamily: sora }}>{s.s}</div>
                </div>
              </SR>
            ))}
          </div>
        </Sec>
      </div>

      {/* ═══════════════════════════════════════
          10. MANIFESTO FINAL + NerveCenter
      ═══════════════════════════════════════ */}
      <Sec style={{ textAlign: "center", padding: "140px 24px" }}>
        <SR>
          <p style={{ fontFamily: jetbrains, fontSize: 10, color: "#E85D30", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 20 }}>NERVE CENTER</p>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "#E0DDD8", lineHeight: 1.2, letterSpacing: "-0.02em", maxWidth: 700, margin: "0 auto 24px", fontFamily: sora }}>
            Veja a maquina funcionando.
            <br />
            <span style={{ color: "#E85D30" }}>Em tempo real.</span>
          </h2>
          <p style={{ fontSize: 17, color: "#6E6E73", lineHeight: 1.7, maxWidth: 520, margin: "0 auto 60px", fontFamily: sora }}>
            O Kloel conecta todos os canais, executa todas as acoes e atinge a meta — enquanto voce assiste.
          </p>
        </SR>
        <LazySection><NerveCenter /></LazySection>
      </Sec>

      {/* ═══════════════════════════════════════
          CTA — Before FAQ
      ═══════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid #19191C", borderBottom: "1px solid #19191C" }}>
        <Sec style={{ textAlign: "center", padding: "100px 24px" }}>
          <SR>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "#E0DDD8", lineHeight: 1.2, letterSpacing: "-0.02em", maxWidth: 700, margin: "0 auto 24px", fontFamily: sora }}>
              A era das ferramentas separadas acabou.
              <br />
              <span style={{ color: "#E85D30" }}>Bem-vindo ao Kloel.</span>
            </h2>
          </SR>
          <SR delay={200}>
            <p style={{ fontSize: 17, color: "#6E6E73", lineHeight: 1.7, maxWidth: 520, margin: "0 auto 48px", fontFamily: sora }}>
              A era de fazer tudo manualmente acabou. A era de pagar por 15 assinaturas acabou. Bem-vindo a era onde voce pensa e a maquina executa.
            </p>
          </SR>
          <SR delay={400}>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", maxWidth: 480, margin: "0 auto" }}>
              <input placeholder="Seu melhor e-mail" style={{ flex: 1, background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: "16px 20px", color: "#E0DDD8", fontSize: 15, fontFamily: sora, outline: "none" }} />
              <button
                onClick={() => router.push('/register')}
                style={{ background: "#E0DDD8", color: "#0A0A0C", border: "none", borderRadius: 6, padding: "16px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: sora }}>
                Comecar gratis
              </button>
            </div>
            <p style={{ marginTop: 12, fontSize: 11, color: "#3A3A3F", fontFamily: sora }}>Sem cartao. Sem compromisso.</p>
          </SR>
        </Sec>
      </div>

      {/* ═══════════════════════════════════════
          11. FAQ
      ═══════════════════════════════════════ */}
      <Sec>
        <SR>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: "#E0DDD8", letterSpacing: "-0.02em", marginBottom: 48, textAlign: "center", fontFamily: sora }}>
            Perguntas frequentes
          </h2>
        </SR>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          {FAQS.map((item, i) => (
            <SR key={i} delay={i * 80}>
              <div style={{ borderBottom: "1px solid #19191C" }}>
                <button
                  onClick={() => setFaq(faq === i ? null : i)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
                    <span style={{ fontFamily: jetbrains, fontSize: 14, color: "#E85D30", fontWeight: 600 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 500, color: "#E0DDD8", fontFamily: sora }}>{item.q}</span>
                  </div>
                  <span style={{ color: "#3A3A3F", fontSize: 20, transform: faq === i ? "rotate(45deg)" : "none", transition: "transform .15s", flexShrink: 0, marginLeft: 16 }}>+</span>
                </button>
                {faq === i && (
                  <div style={{ padding: "0 0 20px 38px", animation: "fadeIn .3s ease both" }}>
                    <p style={{ fontSize: 14, color: "#6E6E73", lineHeight: 1.7, fontFamily: sora }}>{item.a}</p>
                  </div>
                )}
              </div>
            </SR>
          ))}
        </div>
      </Sec>

      {/* ═══════════════════════════════════════
          12. FOOTER
      ═══════════════════════════════════════ */}
      <footer style={{ borderTop: "1px solid #19191C", padding: "48px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#E0DDD8", fontFamily: sora }}>Kloel</span>
            <span style={{ fontSize: 12, color: "#3A3A3F", marginLeft: 12, fontFamily: sora }}>Marketing Artificial</span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <a href="/terms" style={{ fontSize: 12, color: "#3A3A3F", textDecoration: "none", fontFamily: sora }}>Termos de Uso</a>
            <a href="/privacy" style={{ fontSize: 12, color: "#3A3A3F", textDecoration: "none", fontFamily: sora }}>Privacidade</a>
            <a href="#" style={{ fontSize: 12, color: "#3A3A3F", textDecoration: "none", fontFamily: sora }}>Contato</a>
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: "24px auto 0", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "#222226", fontFamily: sora }}>O Marketing morreu Digital e ressuscitou Artificial.</p>
        </div>
      </footer>

      {/* Floating Chat Widget */}
      <FloatingChat
        isOpen={chatOpen}
        onToggle={setChatOpen}
        initialMessage={chatInitialMsg}
        onInitialMessageConsumed={() => setChatInitialMsg(undefined)}
      />
    </div>
  );
}
