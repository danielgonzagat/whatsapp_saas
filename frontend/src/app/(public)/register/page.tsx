"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "password" | "whatsapp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Email form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // LGPD Consent
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // WhatsApp form
  const [phone, setPhone] = useState("");
  const [whatsappCode, setWhatsappCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const handleOAuthRegister = async (provider: string) => {
    setLoading(true);
    await signIn(provider, { callbackUrl: "/onboarding" });
  };

  const handleContinueWithEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Digite um email válido");
      return;
    }
    setError("");
    setStep("password");
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres");
      return;
    }
    if (!acceptedTerms) {
      setError("Você precisa aceitar os termos para continuar");
      return;
    }
    setLoading(true);
    setError("");

    try {
      // Criar conta no backend
      const localPart = email.split("@")[0] || "user";
      const cleaned = localPart.replace(/[\W_]+/g, " ").trim();
      const displayName = (cleaned || "User").charAt(0).toUpperCase() + (cleaned || "User").slice(1);
      const workspaceName = `${displayName}'s Workspace`;
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: displayName,
          email,
          password,
          workspaceName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erro ao criar conta");
      }

      // Fazer login automaticamente
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Erro ao fazer login após registro");
      } else {
        router.push("/onboarding");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  const handleSendWhatsAppCode = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/whatsapp/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      if (!response.ok) {
        throw new Error("Erro ao enviar código");
      }

      setCodeSent(true);
    } catch (err: any) {
      setError(err.message || "Erro ao enviar código");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyWhatsAppCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/whatsapp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: whatsappCode }),
      });

      if (!response.ok) {
        throw new Error("Código inválido");
      }

      router.push("/onboarding");
    } catch (err: any) {
      setError(err.message || "Erro ao verificar código");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: "52px",
    border: "1px solid rgba(86, 88, 105, 0.5)",
    borderRadius: "6px",
    paddingLeft: "16px",
    paddingRight: "16px",
    fontSize: "16px",
    backgroundColor: "transparent",
    color: "#ECECF1",
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "inherit",
  };

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    height: "52px",
    borderRadius: "6px",
    fontSize: "16px",
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    transition: "background-color 150ms",
    fontFamily: "inherit",
    border: "none",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "#FAFAFA",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        boxSizing: "border-box",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: "400px",
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              backgroundColor: "#4ADE80",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1A1A1A"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#ECECF1",
              letterSpacing: "-0.5px",
            }}
          >
            KLOEL
          </span>
        </div>

        {/* Step 1: Email */}
        {step === "email" && (
          <>
            <h1
              style={{
                fontSize: "32px",
                fontWeight: 600,
                color: "#ECECF1",
                textAlign: "center",
                margin: 0,
                marginBottom: "32px",
              }}
            >
              Criar sua conta
            </h1>

            {/* Email input */}
            <form onSubmit={handleContinueWithEmail} style={{ width: "100%" }}>
              <div style={{ marginBottom: "16px" }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  placeholder="Email"
                  autoFocus
                  style={{
                    ...inputStyle,
                    borderColor: error ? "#EF4444" : "rgba(86, 88, 105, 0.5)",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#4ADE80";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = error
                      ? "#EF4444"
                      : "rgba(86, 88, 105, 0.5)";
                  }}
                />
              </div>

              {error && (
                <p
                  style={{
                    fontSize: "14px",
                    color: "#EF4444",
                    margin: 0,
                    marginBottom: "16px",
                  }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!email || loading}
                style={{
                  ...buttonStyle,
                  backgroundColor: email ? "#4ADE80" : "rgba(74, 222, 128, 0.3)",
                  color: email ? "#1A1A1A" : "rgba(26, 26, 26, 0.5)",
                  cursor: email ? "pointer" : "not-allowed",
                }}
              >
                Continuar
              </button>
            </form>

            {/* Divider */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                margin: "24px 0",
                width: "100%",
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  backgroundColor: "rgba(86, 88, 105, 0.5)",
                }}
              />
              <span style={{ fontSize: "12px", color: "#8E8EA0" }}>OU</span>
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  backgroundColor: "rgba(86, 88, 105, 0.5)",
                }}
              />
            </div>

            {/* OAuth buttons */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                width: "100%",
              }}
            >
              {/* Google */}
              <button
                onClick={() => handleOAuthRegister("google")}
                disabled={loading}
                style={{
                  ...buttonStyle,
                  backgroundColor: "transparent",
                  color: "#ECECF1",
                  border: "1px solid rgba(86, 88, 105, 0.5)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continuar com Google
              </button>

              {/* Apple */}
              <button
                onClick={() => handleOAuthRegister("apple")}
                disabled={loading}
                style={{
                  ...buttonStyle,
                  backgroundColor: "transparent",
                  color: "#ECECF1",
                  border: "1px solid rgba(86, 88, 105, 0.5)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#ECECF1">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Continuar com Apple
              </button>

              {/* WhatsApp */}
              <button
                onClick={() => setStep("whatsapp")}
                disabled={loading}
                style={{
                  ...buttonStyle,
                  backgroundColor: "transparent",
                  color: "#ECECF1",
                  border: "1px solid rgba(86, 88, 105, 0.5)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Continuar com WhatsApp
              </button>
            </div>

            {/* Login link */}
            <p
              style={{
                fontSize: "14px",
                color: "#8E8EA0",
                textAlign: "center",
                marginTop: "24px",
                marginBottom: 0,
              }}
            >
              Já tem uma conta?{" "}
              <a
                href="/login"
                style={{
                  color: "#4ADE80",
                  textDecoration: "none",
                }}
              >
                Entrar
              </a>
            </p>
          </>
        )}

        {/* Step 2: Password */}
        {step === "password" && (
          <>
            <h1
              style={{
                fontSize: "32px",
                fontWeight: 600,
                color: "#ECECF1",
                textAlign: "center",
                margin: 0,
                marginBottom: "12px",
              }}
            >
              Criar sua conta
            </h1>

            <p
              style={{
                fontSize: "14px",
                color: "#8E8EA0",
                textAlign: "center",
                margin: 0,
                marginBottom: "32px",
              }}
            >
              {email}
            </p>

            <form onSubmit={handleEmailRegister} style={{ width: "100%" }}>
              <div style={{ marginBottom: "16px" }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Senha"
                  autoFocus
                  style={{
                    ...inputStyle,
                    borderColor: error ? "#EF4444" : "rgba(86, 88, 105, 0.5)",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#4ADE80";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = error
                      ? "#EF4444"
                      : "rgba(86, 88, 105, 0.5)";
                  }}
                />
                <p
                  style={{
                    fontSize: "12px",
                    color: "#8E8EA0",
                    margin: 0,
                    marginTop: "8px",
                  }}
                >
                  A senha deve ter no mínimo 8 caracteres
                </p>
              </div>

              {error && (
                <p
                  style={{
                    fontSize: "14px",
                    color: "#EF4444",
                    margin: 0,
                    marginBottom: "16px",
                  }}
                >
                  {error}
                </p>
              )}

              {/* LGPD Consent Checkbox */}
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  marginBottom: "20px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => {
                    setAcceptedTerms(e.target.checked);
                    if (error === "Você precisa aceitar os termos para continuar") {
                      setError("");
                    }
                  }}
                  style={{
                    width: "18px",
                    height: "18px",
                    marginTop: "2px",
                    accentColor: "#4ADE80",
                    cursor: "pointer",
                  }}
                />
                <span
                  style={{
                    fontSize: "13px",
                    color: "#8E8EA0",
                    lineHeight: "18px",
                  }}
                >
                  Li e concordo com os{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    style={{ color: "#4ADE80", textDecoration: "underline" }}
                  >
                    Termos de Uso
                  </a>{" "}
                  e a{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    style={{ color: "#4ADE80", textDecoration: "underline" }}
                  >
                    Política de Privacidade
                  </a>
                  , incluindo o tratamento de dados conforme a LGPD.
                </span>
              </label>

              <button
                type="submit"
                disabled={password.length < 8 || !acceptedTerms || loading}
                style={{
                  ...buttonStyle,
                  backgroundColor:
                    password.length >= 8 && acceptedTerms
                      ? "#4ADE80"
                      : "rgba(74, 222, 128, 0.3)",
                  color:
                    password.length >= 8 && acceptedTerms ? "#1A1A1A" : "rgba(26, 26, 26, 0.5)",
                  cursor: password.length >= 8 && acceptedTerms ? "pointer" : "not-allowed",
                }}
              >
                {loading ? "Criando conta..." : "Criar conta"}
              </button>
            </form>

            {/* Back link */}
            <button
              onClick={() => {
                setStep("email");
                setPassword("");
                setError("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#8E8EA0",
                cursor: "pointer",
                fontSize: "14px",
                fontFamily: "inherit",
                marginTop: "24px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Voltar
            </button>
          </>
        )}

        {/* WhatsApp Step */}
        {step === "whatsapp" && (
          <>
            <h1
              style={{
                fontSize: "32px",
                fontWeight: 600,
                color: "#ECECF1",
                textAlign: "center",
                margin: 0,
                marginBottom: "12px",
              }}
            >
              {codeSent ? "Digite o código" : "Seu WhatsApp"}
            </h1>

            <p
              style={{
                fontSize: "14px",
                color: "#8E8EA0",
                textAlign: "center",
                margin: 0,
                marginBottom: "32px",
              }}
            >
              {codeSent
                ? `Enviamos um código para ${phone}`
                : "Digite seu número de WhatsApp"}
            </p>

            {!codeSent ? (
              <div style={{ width: "100%" }}>
                <div style={{ marginBottom: "16px" }}>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setError("");
                    }}
                    placeholder="+55 11 99999-9999"
                    autoFocus
                    style={inputStyle}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#4ADE80";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(86, 88, 105, 0.5)";
                    }}
                  />
                </div>

                {error && (
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#EF4444",
                      margin: 0,
                      marginBottom: "16px",
                    }}
                  >
                    {error}
                  </p>
                )}

                <button
                  onClick={handleSendWhatsAppCode}
                  disabled={!phone || loading}
                  style={{
                    ...buttonStyle,
                    backgroundColor: phone
                      ? "#25D366"
                      : "rgba(37, 211, 102, 0.3)",
                    color: phone ? "#FFFFFF" : "rgba(255, 255, 255, 0.5)",
                    cursor: phone ? "pointer" : "not-allowed",
                  }}
                >
                  {loading ? "Enviando..." : "Enviar código"}
                </button>
              </div>
            ) : (
              <form onSubmit={handleVerifyWhatsAppCode} style={{ width: "100%" }}>
                <div style={{ marginBottom: "16px" }}>
                  <input
                    type="text"
                    value={whatsappCode}
                    onChange={(e) => {
                      setWhatsappCode(e.target.value.replace(/\D/g, ""));
                      setError("");
                    }}
                    placeholder="000000"
                    autoFocus
                    maxLength={6}
                    style={{
                      ...inputStyle,
                      textAlign: "center",
                      letterSpacing: "12px",
                      fontSize: "28px",
                      fontWeight: 600,
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#4ADE80";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(86, 88, 105, 0.5)";
                    }}
                  />
                </div>

                {error && (
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#EF4444",
                      margin: 0,
                      marginBottom: "16px",
                    }}
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={whatsappCode.length < 6 || loading}
                  style={{
                    ...buttonStyle,
                    backgroundColor:
                      whatsappCode.length >= 6
                        ? "#25D366"
                        : "rgba(37, 211, 102, 0.3)",
                    color:
                      whatsappCode.length >= 6
                        ? "#FFFFFF"
                        : "rgba(255, 255, 255, 0.5)",
                    cursor:
                      whatsappCode.length >= 6 ? "pointer" : "not-allowed",
                  }}
                >
                  {loading ? "Verificando..." : "Verificar"}
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsAppCode}
                  disabled={loading}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#8E8EA0",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    marginTop: "16px",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  Reenviar código
                </button>
              </form>
            )}

            {/* Back link */}
            <button
              onClick={() => {
                setStep("email");
                setPhone("");
                setWhatsappCode("");
                setCodeSent(false);
                setError("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#8E8EA0",
                cursor: "pointer",
                fontSize: "14px",
                fontFamily: "inherit",
                marginTop: "24px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Voltar
            </button>
          </>
        )}

        {/* Terms */}
        <p
          style={{
            fontSize: "12px",
            color: "#6B6B7B",
            textAlign: "center",
            marginTop: "32px",
            lineHeight: "18px",
          }}
        >
          Ao continuar, você concorda com nossos{" "}
          <a href="/terms" style={{ color: "#8E8EA0", textDecoration: "underline" }}>
            Termos de Uso
          </a>{" "}
          e{" "}
          <a href="/privacy" style={{ color: "#8E8EA0", textDecoration: "underline" }}>
            Política de Privacidade
          </a>
        </p>
      </div>
    </div>
  );
}
