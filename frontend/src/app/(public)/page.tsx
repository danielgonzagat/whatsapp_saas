"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Sparkles, Send, ArrowRight } from "lucide-react";
import { apiUrl } from "@/lib/http";
import { colors } from "@/lib/design-tokens";

// -------------- DESIGN TOKENS (Apple Light Theme) --------------
const COLORS = {
  bg: colors.background.base,           // #FAFAFA
  surface: colors.background.surface1,   // #FFFFFF
  accent: colors.brand.primary,          // #1A1A1A
  textPrimary: colors.text.primary,      // #1A1A1A
  textSecondary: colors.text.secondary,  // #525252
  border: colors.stroke,                 // #E5E5E5
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export default function HomePage() {
  const router = useRouter();
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatStarted, setChatStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authStep, setAuthStep] = useState<"email" | "password" | "register">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Initialize session ID from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('kloel_guest_session');
    if (stored) {
      setSessionId(stored);
    } else {
      const newSession = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('kloel_guest_session', newSession);
      setSessionId(newSession);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    setChatStarted(true);
    
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
    };

    const assistantMessageId = generateId();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/chat/guest'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'X-Session-Id': sessionId || '',
        },
        body: JSON.stringify({ 
          message: content.trim(),
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                );
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        }
      }

      // Mark as complete
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
    } catch (error) {
      console.error('Guest chat error:', error);
      
      // Fallback to sync endpoint
      try {
        const syncResponse = await fetch(apiUrl('/chat/guest/sync'), {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Session-Id': sessionId || '',
          },
          body: JSON.stringify({ message: content.trim(), sessionId }),
        });

        if (syncResponse.ok) {
          const data = await syncResponse.json();
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: data.reply || 'Sem resposta', isStreaming: false }
                : msg
            )
          );
        } else {
          throw new Error('Sync also failed');
        }
      } catch {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantMessageId
              ? { 
                  ...msg, 
                  content: 'Desculpe, estou com dificuldades no momento. Tente novamente em alguns segundos.', 
                  isStreaming: false 
                }
              : msg
          )
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input);
    }
  };

  // Auth handlers
  const openAuthModal = () => {
    setShowAuthModal(true);
    setAuthStep("email");
    setEmail("");
    setPassword("");
    setName("");
    setError("");
  };

  const closeModal = () => {
    setShowAuthModal(false);
    setAuthStep("email");
    setEmail("");
    setPassword("");
    setName("");
    setError("");
  };

  const handleOAuthLogin = async (provider: string) => {
    setLoading(true);
    await signIn(provider, { callbackUrl: "/dashboard" });
  };

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);
    setError("");
    
    try {
      const response = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      
      const data = await response.json();
      setAuthStep(data.exists ? "password" : "register");
    } catch {
      setAuthStep("register");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Email ou senha incorretos");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erro ao criar conta");
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Conta criada! Faça login.");
        setAuthStep("password");
      } else {
        router.push("/onboarding");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao criar conta";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Apple-like Input Style
  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: "52px",
    border: "1px solid #E5E5E5",
    borderRadius: "12px",
    paddingLeft: "16px",
    paddingRight: "16px",
    fontSize: "16px",
    backgroundColor: "#FFFFFF",
    color: "#1A1A1A",
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: COLORS.bg,
        display: "flex",
        flexDirection: "column",
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* ========== HEADER ========== */}
      <header
        style={{
          height: "64px",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: "32px",
          paddingRight: "32px",
          boxSizing: "border-box",
          borderBottom: "1px solid #F0F0F0",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: "rgba(250, 250, 250, 0.9)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          zIndex: 100,
        }}
      >
        {/* Logo KLOEL */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              backgroundColor: "#1A1A1A",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span style={{ fontSize: "20px", fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.5px" }}>
            KLOEL
          </span>
        </div>

        {/* Ações da direita */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            onClick={() => router.push("/login")}
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "#525252",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Entrar
          </button>
          <button
            onClick={openAuthModal}
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "#FFFFFF",
              backgroundColor: "#1A1A1A",
              padding: "10px 20px",
              borderRadius: "9999px",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            Começar grátis
          </button>
        </div>
      </header>

      {/* ========== MAIN CONTENT ========== */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "80px",
          paddingBottom: "20px",
          paddingLeft: "24px",
          paddingRight: "24px",
          boxSizing: "border-box",
          maxWidth: "800px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Chat Area */}
        {!chatStarted ? (
          // Welcome screen
          <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
            <div 
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                backgroundColor: `${COLORS.accent}10`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "24px",
              }}
            >
              <Sparkles style={{ width: "40px", height: "40px", color: COLORS.accent }} />
            </div>
            
            <h1
              style={{
                fontSize: "42px",
                fontWeight: 600,
                color: COLORS.textPrimary,
                textAlign: "center",
                margin: 0,
                marginBottom: "16px",
                letterSpacing: "-1px",
                lineHeight: 1.1,
              }}
            >
              Como posso ajudar o<br />seu negócio hoje?
            </h1>

            <p
              style={{
                fontSize: "18px",
                color: COLORS.textSecondary,
                textAlign: "center",
                margin: 0,
                marginBottom: "32px",
                maxWidth: "500px",
                lineHeight: "28px",
              }}
            >
              Sou a KLOEL, sua IA especialista em vendas pelo WhatsApp. 
              Converse comigo - sem precisar criar conta!
            </p>

            {/* Quick suggestions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "center", marginBottom: "32px" }}>
              {[
                '💬 Como você pode me ajudar?',
                '📈 Quero vender mais no WhatsApp',
                '🤖 O que é automação de vendas?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  style={{
                    padding: "12px 20px",
                    borderRadius: "9999px",
                    fontSize: "14px",
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.textSecondary,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Chat messages
          <div style={{ flex: 1, width: "100%", overflowY: "auto", paddingBottom: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: "80%",
                      padding: "14px 18px",
                      borderRadius: msg.role === 'user' ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
                      backgroundColor: msg.role === 'user' ? COLORS.accent : COLORS.surface,
                      color: msg.role === 'user' ? '#FFFFFF' : COLORS.textPrimary,
                      border: msg.role === 'assistant' ? `1px solid ${COLORS.border}` : 'none',
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "15px", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>
                      {msg.content || (msg.isStreaming ? '...' : '')}
                      {msg.isStreaming && (
                        <span 
                          style={{
                            display: "inline-block",
                            width: "6px",
                            height: "16px",
                            marginLeft: "4px",
                            backgroundColor: "currentColor",
                            borderRadius: "2px",
                            animation: "pulse 1s infinite",
                          }}
                        />
                      )}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Input Area */}
        <div
          style={{
            width: "100%",
            maxWidth: "680px",
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: "24px",
            padding: "16px 20px",
            boxSizing: "border-box",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.06)",
            marginTop: "auto",
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte qualquer coisa sobre vendas, marketing ou WhatsApp…"
              disabled={isLoading}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: "16px",
                backgroundColor: "transparent",
                color: COLORS.textPrimary,
                fontFamily: "inherit",
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              style={{
                width: "44px",
                height: "44px",
                backgroundColor: input.trim() ? COLORS.accent : "#E5E5E5",
                borderRadius: "12px",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                transition: "all 0.15s",
              }}
            >
              <Send style={{ width: "18px", height: "18px", color: "#FFFFFF" }} />
            </button>
          </form>
          
          {/* CTA to register after conversation starts */}
          {messages.length >= 2 && (
            <div style={{ marginTop: "12px", display: "flex", justifyContent: "center" }}>
              <button
                onClick={openAuthModal}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  borderRadius: "9999px",
                  fontSize: "13px",
                  fontWeight: 500,
                  backgroundColor: `${COLORS.accent}08`,
                  color: COLORS.accent,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                Criar conta grátis para recursos completos
                <ArrowRight style={{ width: "14px", height: "14px" }} />
              </button>
            </div>
          )}
        </div>

        {/* Footer note */}
        <p style={{ 
          fontSize: "12px", 
          color: "#A3A3A3", 
          textAlign: "center", 
          marginTop: "16px",
          lineHeight: "18px" 
        }}>
          Ao usar a KLOEL, você concorda com nossos{" "}
          <a href="/terms" style={{ color: "#525252", textDecoration: "underline" }}>Termos</a>
          {" "}e{" "}
          <a href="/privacy" style={{ color: "#525252", textDecoration: "underline" }}>Privacidade</a>.
        </p>
      </main>

      {/* ========== AUTH MODAL ========== */}
      {showAuthModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={closeModal}
        >
          <div
            style={{
              width: "420px",
              maxWidth: "90%",
              backgroundColor: "#FFFFFF",
              borderRadius: "20px",
              padding: "40px",
              boxSizing: "border-box",
              position: "relative",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={closeModal}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "#F5F5F5",
                border: "none",
                color: "#525252",
                cursor: "pointer",
                padding: "8px",
                borderRadius: "9999px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Logo */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    backgroundColor: "#1A1A1A",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <span style={{ fontSize: "24px", fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.5px" }}>
                  KLOEL
                </span>
              </div>
            </div>

            {/* ===== STEP: EMAIL ===== */}
            {authStep === "email" && (
              <>
                <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#1A1A1A", textAlign: "center", margin: 0, marginBottom: "8px" }}>
                  Bem-vindo
                </h2>
                <p style={{ fontSize: "15px", color: "#525252", textAlign: "center", margin: 0, marginBottom: "28px" }}>
                  Entre ou crie sua conta para continuar
                </p>

                {/* OAuth buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                  <button
                    onClick={() => handleOAuthLogin("google")}
                    disabled={loading}
                    style={{
                      width: "100%",
                      height: "52px",
                      backgroundColor: "#FFFFFF",
                      color: "#1A1A1A",
                      border: "1px solid #E5E5E5",
                      borderRadius: "12px",
                      fontSize: "15px",
                      fontWeight: 500,
                      cursor: loading ? "wait" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      fontFamily: "inherit",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continuar com Google
                  </button>
                </div>

                {/* Divider */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                  <div style={{ flex: 1, height: "1px", backgroundColor: "#E5E5E5" }} />
                  <span style={{ fontSize: "13px", color: "#A3A3A3" }}>ou</span>
                  <div style={{ flex: 1, height: "1px", backgroundColor: "#E5E5E5" }} />
                </div>

                {/* Email Input */}
                <form onSubmit={handleEmailContinue}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Endereço de e-mail"
                    required
                    autoFocus
                    style={inputStyle}
                  />
                  <button
                    type="submit"
                    disabled={loading || !email}
                    style={{
                      width: "100%",
                      height: "52px",
                      backgroundColor: "#1A1A1A",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "12px",
                      fontSize: "15px",
                      fontWeight: 600,
                      cursor: loading || !email ? "not-allowed" : "pointer",
                      marginTop: "12px",
                      fontFamily: "inherit",
                      opacity: loading || !email ? 0.5 : 1,
                    }}
                  >
                    {loading ? "Verificando..." : "Continuar"}
                  </button>
                </form>
              </>
            )}

            {/* ===== STEP: PASSWORD ===== */}
            {authStep === "password" && (
              <>
                <button
                  onClick={() => setAuthStep("email")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#525252",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginBottom: "16px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    padding: 0,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Voltar
                </button>

                <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#1A1A1A", textAlign: "center", margin: 0, marginBottom: "8px" }}>
                  Digite sua senha
                </h2>
                <p style={{ fontSize: "14px", color: "#525252", textAlign: "center", margin: 0, marginBottom: "24px" }}>
                  {email}
                </p>

                <form onSubmit={handleLogin}>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    required
                    autoFocus
                    style={inputStyle}
                  />

                  {error && (
                    <p style={{ fontSize: "14px", color: "#EF4444", margin: "12px 0 0 0", textAlign: "center" }}>
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !password}
                    style={{
                      width: "100%",
                      height: "52px",
                      backgroundColor: "#1A1A1A",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "12px",
                      fontSize: "15px",
                      fontWeight: 600,
                      cursor: loading || !password ? "not-allowed" : "pointer",
                      marginTop: "16px",
                      fontFamily: "inherit",
                      opacity: loading || !password ? 0.5 : 1,
                    }}
                  >
                    {loading ? "Entrando..." : "Continuar"}
                  </button>
                </form>

                <button
                  onClick={() => router.push("/forgot-password")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#525252",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    marginTop: "16px",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  Esqueceu a senha?
                </button>
              </>
            )}

            {/* ===== STEP: REGISTER ===== */}
            {authStep === "register" && (
              <>
                <button
                  onClick={() => setAuthStep("email")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#525252",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginBottom: "16px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    padding: 0,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Voltar
                </button>

                <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#1A1A1A", textAlign: "center", margin: 0, marginBottom: "8px" }}>
                  Criar sua conta
                </h2>
                <p style={{ fontSize: "14px", color: "#525252", textAlign: "center", margin: 0, marginBottom: "24px" }}>
                  {email}
                </p>

                <form onSubmit={handleRegister}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nome completo"
                      required
                      autoFocus
                      style={inputStyle}
                    />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Criar senha (mínimo 8 caracteres)"
                      required
                      minLength={8}
                      style={inputStyle}
                    />
                  </div>

                  {error && (
                    <p style={{ fontSize: "14px", color: "#EF4444", margin: "12px 0 0 0", textAlign: "center" }}>
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !name || !password || password.length < 8}
                    style={{
                      width: "100%",
                      height: "52px",
                      backgroundColor: "#1A1A1A",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "12px",
                      fontSize: "15px",
                      fontWeight: 600,
                      cursor: loading || !name || !password ? "not-allowed" : "pointer",
                      marginTop: "16px",
                      fontFamily: "inherit",
                      opacity: loading || !name || !password || password.length < 8 ? 0.5 : 1,
                    }}
                  >
                    {loading ? "Criando conta..." : "Criar conta"}
                  </button>
                </form>

                <p style={{ fontSize: "12px", color: "#A3A3A3", textAlign: "center", marginTop: "16px", lineHeight: "18px" }}>
                  Ao criar uma conta, você concorda com nossos{" "}
                  <a href="/terms" style={{ color: "#525252", textDecoration: "underline" }}>Termos</a>
                  {" "}e{" "}
                  <a href="/privacy" style={{ color: "#525252", textDecoration: "underline" }}>Política de Privacidade</a>.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Pulse animation for streaming cursor */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
