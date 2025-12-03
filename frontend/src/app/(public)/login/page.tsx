"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "password">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleOAuthLogin = async (provider: string) => {
    setLoading(true);
    await signIn(provider, { callbackUrl: "/dashboard" });
  };

  const handleContinueWithEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Digite um email válido");
      return;
    }
    setError("");
    setStep("password");
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
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
        setError("Email ou senha inválidos");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError("Erro ao fazer login");
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
        backgroundColor: "#0A0A0F",
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
              Bem-vindo de volta
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
                  color: email ? "#0A0A0F" : "rgba(10, 10, 15, 0.5)",
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
                onClick={() => handleOAuthLogin("google")}
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
                onClick={() => handleOAuthLogin("apple")}
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
            </div>

            {/* Register link */}
            <p
              style={{
                fontSize: "14px",
                color: "#8E8EA0",
                textAlign: "center",
                marginTop: "24px",
                marginBottom: 0,
              }}
            >
              Não tem uma conta?{" "}
              <a
                href="/register"
                style={{
                  color: "#4ADE80",
                  textDecoration: "none",
                }}
              >
                Criar conta
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
              Digite sua senha
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

            <form onSubmit={handleEmailLogin} style={{ width: "100%" }}>
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
                disabled={!password || loading}
                style={{
                  ...buttonStyle,
                  backgroundColor: password
                    ? "#4ADE80"
                    : "rgba(74, 222, 128, 0.3)",
                  color: password ? "#0A0A0F" : "rgba(10, 10, 15, 0.5)",
                  cursor: password ? "pointer" : "not-allowed",
                }}
              >
                {loading ? "Entrando..." : "Continuar"}
              </button>
            </form>

            {/* Forgot password */}
            <a
              href="/forgot-password"
              style={{
                fontSize: "14px",
                color: "#8E8EA0",
                textDecoration: "none",
                marginTop: "16px",
              }}
            >
              Esqueceu sua senha?
            </a>

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
                marginTop: "16px",
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
      </div>
    </div>
  );
}
