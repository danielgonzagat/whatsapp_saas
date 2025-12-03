"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [inputFocused, setInputFocused] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Auth modal state
  const [authStep, setAuthStep] = useState<"email" | "password" | "register">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);

  const handleInteraction = () => {
    setShowAuthModal(true);
    setAuthStep("email");
    setEmail("");
    setPassword("");
    setName("");
    setError("");
    setIsNewUser(false);
  };

  const closeModal = () => {
    setShowAuthModal(false);
    setAuthStep("email");
    setEmail("");
    setPassword("");
    setName("");
    setError("");
    setIsNewUser(false);
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
      // Verificar se o email já existe
      const response = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      
      const data = await response.json();
      setIsNewUser(!data.exists);
      setAuthStep(data.exists ? "password" : "register");
    } catch (err) {
      // Se der erro, assume que é novo usuário
      setIsNewUser(true);
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
    } catch (err) {
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

      // Login automático após registro
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Conta criada! Faça login.");
        setAuthStep("password");
        setIsNewUser(false);
      } else {
        router.push("/onboarding");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: "52px",
    border: "1px solid rgba(86, 88, 105, 0.5)",
    borderRadius: "10px",
    paddingLeft: "16px",
    paddingRight: "16px",
    fontSize: "16px",
    backgroundColor: "transparent",
    color: "#F5F5F5",
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "#0A0A0F",
        display: "flex",
        flexDirection: "column",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
          borderBottom: "1px solid rgba(42, 42, 51, 0.15)",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: "rgba(10, 10, 15, 0.85)",
          backdropFilter: "blur(12px)",
          zIndex: 100,
        }}
      >
        {/* Logo KLOEL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {/* Ícone do logo */}
          <div
            style={{
              width: "32px",
              height: "32px",
              backgroundColor: "#4ADE80",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0A0A0F"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "#F5F5F5",
              letterSpacing: "-0.5px",
            }}
          >
            KLOEL
          </span>
        </div>

        {/* Menu central */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "32px",
          }}
        >
          {["Sobre", "Como funciona", "Casos", "Preços"].map((item) => (
            <a
              key={item}
              href="#"
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: "#A6A6B0",
                textDecoration: "none",
                transition: "color 150ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F5F5")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#A6A6B0")}
            >
              {item}
            </a>
          ))}
        </nav>

        {/* Ações da direita */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <a
            href="/login"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "#A6A6B0",
              textDecoration: "none",
              transition: "color 150ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F5F5")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#A6A6B0")}
          >
            Entrar
          </a>
          <a
            href="/register"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "#0A0A0F",
              backgroundColor: "#F5F5F5",
              padding: "10px 20px",
              borderRadius: "9999px",
              textDecoration: "none",
              transition: "all 150ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#FFFFFF";
              e.currentTarget.style.transform = "scale(1.02)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#F5F5F5";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            Cadastre-se gratuitamente
          </a>
        </div>
      </header>

      {/* ========== HERO CENTRAL ========== */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "64px", // altura do header
          paddingBottom: "80px",
          paddingLeft: "24px",
          paddingRight: "24px",
          boxSizing: "border-box",
        }}
      >
        {/* Título */}
        <h1
          style={{
            fontSize: "32px",
            fontWeight: 600,
            color: "#F5F5F5",
            textAlign: "center",
            margin: 0,
            marginBottom: "12px",
            letterSpacing: "-0.5px",
          }}
        >
          Como posso ajudar o seu negócio hoje?
        </h1>

        {/* Subtítulo */}
        <p
          style={{
            fontSize: "14px",
            color: "#A6A6B0",
            textAlign: "center",
            margin: 0,
            marginBottom: "48px",
            maxWidth: "500px",
            lineHeight: "22px",
          }}
        >
          Sou o Kloel, seu vendedor pessoal.
        </p>

        {/* ========== BARRA DE CONVERSA (estilo ChatGPT) ========== */}
        <div
          onClick={handleInteraction}
          style={{
            width: "100%",
            maxWidth: "760px",
            backgroundColor: "#111118",
            border: inputFocused
              ? "1px solid rgba(74, 222, 128, 0.4)"
              : "1px solid rgba(42, 42, 51, 0.4)",
            borderRadius: "24px",
            padding: "16px 20px",
            boxSizing: "border-box",
            cursor: "text",
            transition: "border-color 150ms, box-shadow 150ms",
            boxShadow: inputFocused
              ? "0 0 0 2px rgba(74, 222, 128, 0.1)"
              : "0 4px 24px rgba(0, 0, 0, 0.2)",
          }}
          onMouseEnter={() => setInputFocused(true)}
          onMouseLeave={() => setInputFocused(false)}
        >
          {/* Área do input */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "14px",
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: "15px",
                color: "#7C7C88",
                userSelect: "none",
              }}
            >
              Pergunte qualquer coisa sobre vendas, marketing ou WhatsApp…
            </div>

            {/* Botão de enviar */}
            <div
              style={{
                width: "36px",
                height: "36px",
                backgroundColor: "#2D2D3A",
                borderRadius: "9999px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "background-color 150ms",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "#3D3D4A")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "#2D2D3A")
              }
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#A6A6B0"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </div>
          </div>

          {/* Chips de ação */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {[
              { icon: "📎", text: "Anexar PDF" },
              { icon: "📚", text: "Ensinar sobre meus produtos" },
              { icon: "💬", text: "Conectar WhatsApp" },
            ].map((chip) => (
              <div
                key={chip.text}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "#15151F",
                  border: "1px solid rgba(42, 42, 51, 0.6)",
                  borderRadius: "9999px",
                  padding: "8px 14px",
                  fontSize: "13px",
                  color: "#A6A6B0",
                  cursor: "pointer",
                  transition: "all 150ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#1D1D28";
                  e.currentTarget.style.borderColor = "rgba(42, 42, 51, 0.9)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#15151F";
                  e.currentTarget.style.borderColor = "rgba(42, 42, 51, 0.6)";
                }}
              >
                <span>{chip.icon}</span>
                <span>{chip.text}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ========== FOOTER ========== */}
      <footer
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px 24px",
          textAlign: "center",
          backgroundColor: "rgba(10, 10, 15, 0.85)",
          backdropFilter: "blur(8px)",
        }}
      >
        <p
          style={{
            fontSize: "11px",
            color: "#7C7C88",
            margin: 0,
            lineHeight: "18px",
          }}
        >
          Ao usar a KLOEL, você concorda com nossos{" "}
          <a
            href="#"
            style={{
              color: "#A6A6B0",
              textDecoration: "underline",
            }}
          >
            Termos de Uso
          </a>{" "}
          e{" "}
          <a
            href="#"
            style={{
              color: "#A6A6B0",
              textDecoration: "underline",
            }}
          >
            Política de Privacidade
          </a>
          .
        </p>
      </footer>

      {/* ========== MODAL DE AUTENTICAÇÃO ========== */}
      {showAuthModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            backdropFilter: "blur(8px)",
          }}
          onClick={closeModal}
        >
          <div
            style={{
              width: "400px",
              maxWidth: "90%",
              backgroundColor: "#111118",
              border: "1px solid rgba(42, 42, 51, 0.5)",
              borderRadius: "16px",
              padding: "40px",
              boxSizing: "border-box",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botão Fechar */}
            <button
              onClick={closeModal}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                color: "#7C7C88",
                cursor: "pointer",
                padding: "4px",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Logo */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    backgroundColor: "#4ADE80",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A0A0F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <span style={{ fontSize: "22px", fontWeight: 700, color: "#F5F5F5", letterSpacing: "-0.5px" }}>KLOEL</span>
              </div>
            </div>

            {/* ===== STEP: EMAIL ===== */}
            {authStep === "email" && (
              <>
                <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#F5F5F5", textAlign: "center", margin: 0, marginBottom: "8px" }}>
                  Bem-vindo de volta
                </h2>
                <p style={{ fontSize: "14px", color: "#A6A6B0", textAlign: "center", margin: 0, marginBottom: "24px" }}>
                  Entre ou crie sua conta para continuar
                </p>

                {/* Botões OAuth */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                  <button
                    onClick={() => handleOAuthLogin("google")}
                    disabled={loading}
                    style={{
                      width: "100%",
                      height: "48px",
                      backgroundColor: "#FFFFFF",
                      color: "#1A1A1A",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "15px",
                      fontWeight: 500,
                      cursor: loading ? "wait" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      fontFamily: "inherit",
                      opacity: loading ? 0.7 : 1,
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

                  <button
                    onClick={() => handleOAuthLogin("apple")}
                    disabled={loading}
                    style={{
                      width: "100%",
                      height: "48px",
                      backgroundColor: "#000000",
                      color: "#FFFFFF",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      fontSize: "15px",
                      fontWeight: 500,
                      cursor: loading ? "wait" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      fontFamily: "inherit",
                      opacity: loading ? 0.7 : 1,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                    </svg>
                    Continuar com Apple
                  </button>
                </div>

                {/* Divider */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                  <div style={{ flex: 1, height: "1px", backgroundColor: "rgba(86, 88, 105, 0.4)" }} />
                  <span style={{ fontSize: "13px", color: "#7C7C88" }}>ou</span>
                  <div style={{ flex: 1, height: "1px", backgroundColor: "rgba(86, 88, 105, 0.4)" }} />
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
                      height: "48px",
                      backgroundColor: "#4ADE80",
                      color: "#0A0A0F",
                      border: "none",
                      borderRadius: "8px",
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

            {/* ===== STEP: PASSWORD (Login) ===== */}
            {authStep === "password" && (
              <>
                <button
                  onClick={() => setAuthStep("email")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#A6A6B0",
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

                <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#F5F5F5", textAlign: "center", margin: 0, marginBottom: "8px" }}>
                  Digite sua senha
                </h2>
                <p style={{ fontSize: "14px", color: "#A6A6B0", textAlign: "center", margin: 0, marginBottom: "24px" }}>
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
                      height: "48px",
                      backgroundColor: "#4ADE80",
                      color: "#0A0A0F",
                      border: "none",
                      borderRadius: "8px",
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
                    color: "#A6A6B0",
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
                    color: "#A6A6B0",
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

                <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#F5F5F5", textAlign: "center", margin: 0, marginBottom: "8px" }}>
                  Criar sua conta
                </h2>
                <p style={{ fontSize: "14px", color: "#A6A6B0", textAlign: "center", margin: 0, marginBottom: "24px" }}>
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
                      height: "48px",
                      backgroundColor: "#4ADE80",
                      color: "#0A0A0F",
                      border: "none",
                      borderRadius: "8px",
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

                <p style={{ fontSize: "12px", color: "#7C7C88", textAlign: "center", marginTop: "16px", lineHeight: "18px" }}>
                  Ao criar uma conta, você concorda com nossos{" "}
                  <a href="#" style={{ color: "#A6A6B0", textDecoration: "underline" }}>Termos</a>
                  {" "}e{" "}
                  <a href="#" style={{ color: "#A6A6B0", textDecoration: "underline" }}>Política de Privacidade</a>.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}