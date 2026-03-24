'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { Heartbeat } from '@/components/kloel/landing/Heartbeat';
import { ScrollReveal } from '@/components/kloel/landing/ScrollReveal';
import { FloatingChat } from '@/components/kloel/landing/FloatingChat';

/*
  ████████████████████████████████████████████████████████████
  KLOEL — A Pagina que Assassina a Hotmart

  "O Marketing morreu Digital e ressuscitou Artificial."

  A primeira e unica inteligencia comercial autonoma do mundo.
  Voce pensa. A IA age.
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
    "Hotmart", "Braip", "ClickFunnels", "ActiveCampaign", "Mailchimp",
    "ManyChat", "Elementor", "Lovable", "Manus", "Vercel",
    "RD Station", "LeadLovers", "Kiwify", "Eduzz", "Guru",
  ];

  const CAPABILITIES = [
    { cat: "VENDA", items: ["Checkout inteligente", "Gestao de assinaturas", "Order bump", "Upsell automatico", "Recuperacao de carrinho", "Pagamento global (22 moedas)"] },
    { cat: "MARKETING IA", items: ["WhatsApp autonomo", "Instagram autonomo", "Email marketing IA", "SMS automatico", "TikTok automation", "Facebook Messenger"] },
    { cat: "CONSTRUA", items: ["Site builder com IA", "Editor visual (Elementor)", "Landing pages", "Funis completos", "Dominio + hospedagem", "SSL automatico"] },
    { cat: "GERENCIE", items: ["CRM inteligente", "Afiliados", "Area de membros", "Relatorios tempo real", "Financeiro completo", "Multi-workspace"] },
  ];

  const FAQS = [
    { q: "O que e o Kloel?", a: "A primeira inteligencia comercial autonoma do mundo. Uma plataforma all-in-one que substitui Hotmart, ClickFunnels, ActiveCampaign, ManyChat, Elementor e dezenas de outras ferramentas. Voce pensa, a IA age." },
    { q: "Como funciona o agente de IA?", a: "Voce conecta seu WhatsApp via QR Code e a IA assume. Ela responde mensagens, qualifica leads, envia follow-ups e fecha vendas — tudo autonomamente, 24/7. O mesmo agente funciona no Instagram, Email, SMS e todas as redes sociais." },
    { q: "Preciso saber programar?", a: "Nao. O Kloel foi construido para empreendedores, nao programadores. A IA cria seu site, suas paginas de venda, seus emails, seus funis. Voce so precisa pensar na estrategia." },
    { q: "Quanto custa?", a: "O Kloel oferece planos acessiveis com teste gratuito. O objetivo e custar menos do que a soma de ferramentas que voce ja paga hoje (Hotmart + ActiveCampaign + ManyChat + Elementor + hospedagem)." },
    { q: "Posso migrar meus produtos da Hotmart?", a: "Sim. O Kloel tem ferramentas de importacao que facilitam a migracao completa — produtos, clientes, assinantes e historico de vendas." },
    { q: "O agente de IA realmente vende sozinho?", a: "Sim. O agente analisa o contexto da conversa, identifica intencao de compra, apresenta o produto certo, lida com objecoes e fecha a venda. Voce acompanha tudo em tempo real." },
    { q: "E seguro?", a: "O Kloel usa criptografia ponta a ponta, servidores isolados por workspace, e conformidade total com LGPD. Seus dados e os dados dos seus clientes estao protegidos." },
  ];

  return (
    <div style={{ background: "#0A0A0C", color: "#E0DDD8", fontFamily: sora, overflowX: "hidden", minHeight: "100vh" }}>

      {/* ═══════════════════════════════════════
          HEADER
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
          HERO — O Manifesto
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

          {/* Hero Input — Email for unauthenticated, Chat for authenticated */}
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
          CEMITERIO — O que morreu
      ═══════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid #19191C", borderBottom: "1px solid #19191C" }}>
        <Sec style={{ padding: "80px 24px", textAlign: "center" }}>
          <ScrollReveal>
            <p style={{ fontFamily: jetbrains, fontSize: 10, color: "#E85D30", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 20 }}>OBITUARIO</p>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: "#E0DDD8", letterSpacing: "-0.02em", marginBottom: 48, fontFamily: sora }}>
              Ferramentas que voce nao precisa mais.
            </h2>
          </ScrollReveal>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            {KILLED.map((name, i) => (
              <ScrollReveal key={name} delay={i * 60}>
                <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: "12px 24px", position: "relative" }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#3A3A3F", textDecoration: "line-through", textDecorationColor: "#E85D30", textDecorationThickness: 2, fontFamily: sora }}>{name}</span>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <ScrollReveal delay={900}>
            <p style={{ marginTop: 40, fontSize: 15, color: "#6E6E73", maxWidth: 500, margin: "40px auto 0", fontFamily: sora }}>
              Voce pagava por 5, 10, 15 ferramentas separadas.<br />
              Agora paga por <span style={{ color: "#E85D30", fontWeight: 600 }}>uma</span>. E ela faz mais que todas juntas.
            </p>
          </ScrollReveal>
        </Sec>
      </div>

      {/* ═══════════════════════════════════════
          VOCE PENSA. A IA AGE.
      ═══════════════════════════════════════ */}
      <Sec>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          <ScrollReveal>
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
          </ScrollReveal>
          <ScrollReveal delay={200}>
            <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 32, textAlign: "center" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {[
                  { n: "24/7", l: "Autonomo" }, { n: "< 3s", l: "Tempo de resposta" },
                  { n: "100%", l: "Das conversas" }, { n: "0", l: "Leads perdidos" },
                ].map(s => (
                  <div key={s.l} style={{ padding: 16 }}>
                    <div style={{ fontFamily: jetbrains, fontSize: 28, fontWeight: 700, color: "#E85D30", marginBottom: 4 }}>{s.n}</div>
                    <div style={{ fontSize: 12, color: "#6E6E73", fontFamily: sora }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </Sec>

      {/* ═══════════════════════════════════════
          AGENTE IA — WhatsApp + Tudo
      ═══════════════════════════════════════ */}
      <div style={{ background: "#111113", borderTop: "1px solid #19191C", borderBottom: "1px solid #19191C" }}>
        <Sec>
          <ScrollReveal>
            <div style={{ textAlign: "center", marginBottom: 60 }}>
              <p style={{ fontFamily: jetbrains, fontSize: 10, color: "#E85D30", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 16 }}>O AGENTE</p>
              <h2 style={{ fontSize: 32, fontWeight: 700, color: "#E0DDD8", letterSpacing: "-0.02em", marginBottom: 16, fontFamily: sora }}>
                Escaneia o QR Code. A IA assume.
              </h2>
              <p style={{ fontSize: 16, color: "#6E6E73", maxWidth: 560, margin: "0 auto", fontFamily: sora }}>
                Conecte seu WhatsApp e veja a inteligencia artificial respondendo, vendendo e fechando negocio em tempo real. Depois ative no Instagram, Email, SMS, TikTok, Messenger — todas as redes, um agente.
              </p>
            </div>
          </ScrollReveal>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { t: "WhatsApp", d: "Responde, qualifica e vende automaticamente. Voce ve tudo acontecendo ao vivo." },
              { t: "Instagram & TikTok", d: "DMs respondidas em segundos. Stories com links. Vendas no automatico." },
              { t: "Email & SMS", d: "Sequencias inteligentes que se adaptam ao comportamento do lead." },
              { t: "Site Builder", d: "A IA cria seu site. Voce edita visualmente como Elementor. Dominio e hospedagem incluidos." },
              { t: "Checkout", d: "Pagamento em 22 moedas. Recuperacao automatica. Order bump. Upsell. Sem integracao externa." },
              { t: "Funis & Automacao", d: "Da captura ao pos-venda. Tudo automatizado. Tudo mensuravel. Tudo num lugar." },
            ].map((item, i) => (
              <ScrollReveal key={item.t} delay={i * 100}>
                <div style={{ background: "#0A0A0C", border: "1px solid #222226", borderRadius: 6, padding: 24, height: "100%" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "#E0DDD8", marginBottom: 8, fontFamily: sora }}>{item.t}</h3>
                  <p style={{ fontSize: 13, color: "#6E6E73", lineHeight: 1.6, fontFamily: sora }}>{item.d}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </Sec>
      </div>

      {/* ═══════════════════════════════════════
          TUDO. UM LUGAR. — Capability Grid
      ═══════════════════════════════════════ */}
      <Sec>
        <ScrollReveal>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <p style={{ fontFamily: jetbrains, fontSize: 10, color: "#E85D30", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 16 }}>ALL-IN-ONE</p>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: "#E0DDD8", letterSpacing: "-0.02em", marginBottom: 16, fontFamily: sora }}>
              Tudo que existe. Num lugar so.
            </h2>
            <p style={{ fontSize: 16, color: "#6E6E73", maxWidth: 520, margin: "0 auto", fontFamily: sora }}>
              Do dominio ao pos-venda. Da copy ao criativo. Do checkout a logistica. Nada fica de fora.
            </p>
          </div>
        </ScrollReveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {CAPABILITIES.map((cat, ci) => (
            <ScrollReveal key={cat.cat} delay={ci * 150}>
              <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 24 }}>
                <p style={{ fontFamily: jetbrains, fontSize: 10, color: "#E85D30", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>{cat.cat}</p>
                {cat.items.map(item => (
                  <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #19191C" }}>
                    <div style={{ width: 4, height: 4, background: "#E85D30", borderRadius: 1, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "#E0DDD8", fontFamily: sora }}>{item}</span>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Sec>

      {/* ═══════════════════════════════════════
          NUMEROS
      ═══════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid #19191C", borderBottom: "1px solid #19191C" }}>
        <Sec style={{ padding: "80px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, textAlign: "center" }}>
            {[
              { n: "1", l: "Plataforma", s: "Substitui +15 ferramentas" },
              { n: "0", l: "Codigo", s: "Nenhuma linha necessaria" },
              { n: "30s", l: "Para comecar", s: "Do cadastro ao primeiro uso" },
              { n: "\u221E", l: "Canais", s: "WhatsApp, Insta, Email, SMS..." },
            ].map((s, i) => (
              <ScrollReveal key={s.l} delay={i * 120}>
                <div>
                  <div style={{ fontFamily: jetbrains, fontSize: 48, fontWeight: 700, color: "#E85D30", marginBottom: 4, letterSpacing: "-0.03em" }}>{s.n}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#E0DDD8", marginBottom: 4, fontFamily: sora }}>{s.l}</div>
                  <div style={{ fontSize: 12, color: "#3A3A3F", fontFamily: sora }}>{s.s}</div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </Sec>
      </div>

      {/* ═══════════════════════════════════════
          MANIFESTO FINAL
      ═══════════════════════════════════════ */}
      <Sec style={{ textAlign: "center", padding: "140px 24px" }}>
        <ScrollReveal>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "#E0DDD8", lineHeight: 1.2, letterSpacing: "-0.02em", maxWidth: 700, margin: "0 auto 24px", fontFamily: sora }}>
            A Hotmart criou o mercado digital brasileiro.
            <br />
            <span style={{ color: "#E85D30" }}>O Kloel vai recria-lo.</span>
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={200}>
          <p style={{ fontSize: 17, color: "#6E6E73", lineHeight: 1.7, maxWidth: 520, margin: "0 auto 48px", fontFamily: sora }}>
            A era das ferramentas separadas acabou. A era de fazer tudo manualmente acabou. A era de pagar por 15 assinaturas acabou. Bem-vindo a era onde voce pensa e a maquina executa.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={400}>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", maxWidth: 480, margin: "0 auto" }}>
            <input placeholder="Seu melhor e-mail" style={{ flex: 1, background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: "16px 20px", color: "#E0DDD8", fontSize: 15, fontFamily: sora, outline: "none" }} />
            <button
              onClick={() => router.push('/register')}
              style={{ background: "#E0DDD8", color: "#0A0A0C", border: "none", borderRadius: 6, padding: "16px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: sora }}>
              Comecar gratis
            </button>
          </div>
          <p style={{ marginTop: 12, fontSize: 11, color: "#3A3A3F", fontFamily: sora }}>Sem cartao. Sem compromisso.</p>
        </ScrollReveal>
      </Sec>

      {/* ═══════════════════════════════════════
          FAQ
      ═══════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid #19191C" }}>
        <Sec>
          <ScrollReveal>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: "#E0DDD8", letterSpacing: "-0.02em", marginBottom: 48, textAlign: "center", fontFamily: sora }}>
              Perguntas frequentes
            </h2>
          </ScrollReveal>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {FAQS.map((item, i) => (
              <ScrollReveal key={i} delay={i * 80}>
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
              </ScrollReveal>
            ))}
          </div>
        </Sec>
      </div>

      {/* ═══════════════════════════════════════
          FOOTER
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
