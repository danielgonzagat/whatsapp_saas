"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { Heartbeat } from "../landing/Heartbeat";

/* ─── types ─── */
interface KloelAuthScreenProps {
  initialMode?: "login" | "register";
}

type Mode = "login" | "register";

/* ─── constants ─── */
const sora = "var(--font-sora), 'Sora', sans-serif";
const jetbrains = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/* ────────────────────────────────────────────────────────────
   GOOGLE SIGN-IN HOOK
   Loads the GIS SDK once and exposes a trigger function.
   ──────────────────────────────────────────────────────────── */
function useGoogleSignIn(
  onCredential: (credential: string) => Promise<void>,
) {
  const clientId =
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()
      : "") || "";
  const sdkReady = useRef(false);
  const desktopInitDone = useRef(false);
  const mobileInitDone = useRef(false);
  const cbRef = useRef(onCredential);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  useEffect(() => { cbRef.current = onCredential; });

  /* detect mobile */
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /* load SDK */
  useEffect(() => {
    if (!clientId) return;
    if ((window as any).google?.accounts?.id) {
      sdkReady.current = true;
      setSdkLoaded(true);
      return;
    }

    const SCRIPT_ID = "google-identity-services";
    const existing = document.getElementById(SCRIPT_ID);
    const onLoad = () => {
      sdkReady.current = true;
      setSdkLoaded(true);
    };

    if (existing) {
      existing.addEventListener("load", onLoad);
      if ((window as any).google?.accounts?.id) { sdkReady.current = true; setSdkLoaded(true); }
      return () => existing.removeEventListener("load", onLoad);
    }

    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.addEventListener("load", onLoad);
    document.head.appendChild(s);
    return () => s.removeEventListener("load", onLoad);
  }, [clientId]);

  /* mobile: render official Google button */
  useEffect(() => {
    if (!isMobile || !sdkLoaded || !clientId || !googleButtonRef.current) return;
    const g = (window as any).google;
    if (!g?.accounts?.id) return;

    // Mobile uses separate init to avoid conflicting with desktop prompt()
    g.accounts.id.initialize({
      client_id: clientId,
      ux_mode: "popup",
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: async (response: any) => {
        const cred = response.credential?.trim();
        if (cred) await cbRef.current(cred);
      },
    });
    mobileInitDone.current = true;

    googleButtonRef.current.innerHTML = "";
    g.accounts.id.renderButton(googleButtonRef.current, {
      theme: "filled_black",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      width: googleButtonRef.current.offsetWidth || 280,
    });
  }, [isMobile, sdkLoaded, clientId]);

  /* desktop: trigger One Tap prompt on click */
  const trigger = useCallback(() => {
    if (isMobile) return;
    if (!clientId) {
      alert("Login com Google nao configurado.");
      return;
    }
    const g = (window as any).google;
    if (!g?.accounts?.id) {
      alert("Google SDK nao carregado. Tente novamente.");
      return;
    }

    // Always re-initialize for desktop to ensure callback is fresh
    g.accounts.id.initialize({
      client_id: clientId,
      ux_mode: "popup",
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: async (response: any) => {
        const cred = response.credential?.trim();
        if (cred) await cbRef.current(cred);
      },
    });
    desktopInitDone.current = true;

    g.accounts.id.prompt();
  }, [clientId, isMobile]);

  return { trigger, available: !!clientId, isMobile, googleButtonRef };
}

/* ────────────────────────────────────────────────────────────
   SVG ICONS
   ──────────────────────────────────────────────────────────── */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#E0DDD8">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3A3A3F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3A3A3F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   RIGHT PANEL — "The Machine"
   ──────────────────────────────────────────────────────────── */
function TheMachine() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#0A0A0C",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: "48px 40px",
      }}
    >
      {/* grid lines */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* horizontal */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={`h${i}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${((i + 1) / 13) * 100}%`,
              height: 1,
              background: "#E0DDD8",
              opacity: 0.03,
            }}
          />
        ))}
        {/* vertical */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`v${i}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${((i + 1) / 9) * 100}%`,
              width: 1,
              background: "#E0DDD8",
              opacity: 0.03,
            }}
          />
        ))}
      </div>

      {/* corner marks */}
      {[
        { top: 24, left: 24, rotate: "0deg" },
        { top: 24, right: 24, rotate: "90deg" },
        { bottom: 24, right: 24, rotate: "180deg" },
        { bottom: 24, left: 24, rotate: "270deg" },
      ].map((pos, i) => (
        <svg
          key={i}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            position: "absolute",
            ...pos,
            transform: `rotate(${pos.rotate})`,
          }}
        >
          <path d="M0 16V0h1v15h15v1H0z" fill="#222226" />
        </svg>
      ))}

      {/* content */}
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 440 }}>
        {/* eyebrow */}
        <p
          style={{
            fontFamily: jetbrains,
            fontSize: 10,
            fontWeight: 500,
            color: "#E85D30",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          MARKETING ARTIFICIAL
        </p>

        {/* manifesto */}
        <h2
          style={{
            fontFamily: sora,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.4,
            color: "#E0DDD8",
            marginBottom: 12,
          }}
        >
          O Marketing morreu{" "}
          <span style={{ color: "#E85D30" }}>Digital</span> e ressuscitou{" "}
          <span style={{ color: "#E85D30" }}>Artificial</span>.
        </h2>

        {/* subtitle */}
        <p
          style={{
            fontFamily: sora,
            fontSize: 13,
            color: "#6E6E73",
            lineHeight: 1.6,
            marginBottom: 40,
          }}
        >
          A primeira e unica inteligencia comercial autonoma do mundo.
          Voce pensa. A IA age.
        </p>

        {/* heartbeat */}
        <div style={{ marginBottom: 40 }}>
          <Heartbeat />
        </div>

        {/* stats strip */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 48,
            marginBottom: 48,
          }}
        >
          {[
            { value: "1", label: "plataforma" },
            { value: "0", label: "codigo" },
            { value: "\u221E", label: "canais" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <p
                style={{
                  fontFamily: jetbrains,
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#E85D30",
                  lineHeight: 1,
                  marginBottom: 6,
                }}
              >
                {stat.value}
              </p>
              <p
                style={{
                  fontFamily: jetbrains,
                  fontSize: 10,
                  color: "#6E6E73",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* version tag */}
        <p
          style={{
            fontFamily: jetbrains,
            fontSize: 10,
            color: "#3A3A3F",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          KLOEL v1.0 &mdash; SISTEMA ATIVO
        </p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   MAIN EXPORT
   ──────────────────────────────────────────────────────────── */
export function KloelAuthScreen({ initialMode = "login" }: KloelAuthScreenProps) {
  const router = useRouter();
  const { signIn, signUp, signInWithGoogle, isAuthenticated } = useAuth();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  /* redirect if already authed */
  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  /* switch mode (client-side only) */
  const switchMode = (m: Mode) => {
    setMode(m);
    setName("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setError("");
  };

  /* ── handlers ── */
  const handleSubmit = async () => {
    setError("");
    if (mode === "register" && !name.trim()) {
      setError("Nome e obrigatorio.");
      return;
    }
    if (!email.trim()) {
      setError("E-mail e obrigatorio.");
      return;
    }
    if (password.length < 1) {
      setError("Senha e obrigatoria.");
      return;
    }

    setIsLoading(true);

    let result: { success: boolean; error?: string };

    if (mode === "register") {
      result = await signUp(email, name, password);
    } else {
      result = await signIn(email, password);
    }

    if (!result.success) {
      setError(result.error || "Erro inesperado. Tente novamente.");
      setIsLoading(false);
      return;
    }

    router.push("/dashboard");
  };

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setError("");
      setIsLoading(true);
      const result = await signInWithGoogle(credential);
      if (!result.success) {
        setError(result.error || "Falha ao autenticar com Google.");
        setIsLoading(false);
        return;
      }
      router.push("/dashboard");
    },
    [signInWithGoogle, router],
  );

  const google = useGoogleSignIn(handleGoogleCredential);

  const handleApple = () => {
    alert("Em breve");
  };

  /* ── shared input style ── */
  const inputBase: React.CSSProperties = {
    width: "100%",
    height: 44,
    background: "#111113",
    border: "1px solid #222226",
    borderRadius: 6,
    padding: "0 14px",
    fontSize: 14,
    fontFamily: sora,
    color: "#E0DDD8",
    outline: "none",
    transition: "border-color 150ms ease",
    boxSizing: "border-box",
  };

  const inputFocusHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#333338";
  };
  const inputBlurHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#222226";
  };

  /* ── render ── */
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#0A0A0C",
        fontFamily: sora,
      }}
    >
      {/* ═══════════════════════════════════════
          LEFT — FORM
      ═══════════════════════════════════════ */}
      <div
        className="kloel-auth-form"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "32px 40px",
          minHeight: "100vh",
          maxWidth: 560,
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        {/* top bar: logo + ajuda */}
        <div
          className="kloel-auth-topbar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 56,
          }}
        >
          <span
            style={{
              fontFamily: sora,
              fontSize: 16,
              fontWeight: 700,
              color: "#E0DDD8",
              letterSpacing: "-0.02em",
            }}
          >
            Kloel
          </span>
          <button
            style={{
              fontFamily: sora,
              fontSize: 12,
              color: "#6E6E73",
              background: "transparent",
              border: "1px solid #222226",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              transition: "border-color 150ms ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#333338")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#222226")}
          >
            Ajuda
          </button>
        </div>

        {/* form area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {/* title */}
          <h1
            style={{
              fontFamily: sora,
              fontSize: 28,
              fontWeight: 700,
              color: "#E0DDD8",
              marginBottom: 8,
            }}
          >
            {mode === "login" ? "Entrar" : "Criar conta"}
          </h1>

          {/* subtitle */}
          <p
            style={{
              fontFamily: sora,
              fontSize: 14,
              color: "#6E6E73",
              marginBottom: 32,
              lineHeight: 1.5,
            }}
          >
            {mode === "login"
              ? "Acesse sua conta e continue construindo."
              : "Crie sua conta e comece a usar a inteligencia comercial autonoma."}
          </p>

          {/* social buttons */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 24,
            }}
          >
            {google.isMobile ? (
              /* Mobile: Google renders its own official button (redirect-based OAuth) */
              <div
                ref={google.googleButtonRef}
                style={{
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  borderRadius: 6,
                }}
              />
            ) : (
              /* Desktop: custom button triggers One Tap prompt */
              <button
                onClick={google.trigger}
                disabled={isLoading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  height: 44,
                  background: "#111113",
                  border: "1px solid #222226",
                  borderRadius: 6,
                  color: "#E0DDD8",
                  fontSize: 13,
                  fontFamily: sora,
                  cursor: "pointer",
                  transition: "border-color 150ms ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#333338")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#222226")}
              >
                <GoogleIcon />
                Google
              </button>
            )}

            <button
              onClick={handleApple}
              disabled={isLoading}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                height: 44,
                background: "#111113",
                border: "1px solid #222226",
                borderRadius: 6,
                color: "#E0DDD8",
                fontSize: 13,
                fontFamily: sora,
                cursor: "pointer",
                transition: "border-color 150ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#333338")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#222226")}
            >
              <AppleIcon />
              Apple
            </button>
          </div>

          {/* divider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div style={{ flex: 1, height: 1, background: "#222226" }} />
            <span
              style={{
                fontFamily: sora,
                fontSize: 12,
                color: "#3A3A3F",
                textTransform: "lowercase",
              }}
            >
              ou
            </span>
            <div style={{ flex: 1, height: 1, background: "#222226" }} />
          </div>

          {/* form fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* name — register only */}
            {mode === "register" && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontFamily: sora,
                    fontSize: 12,
                    color: "#6E6E73",
                    marginBottom: 6,
                  }}
                >
                  Nome
                </label>
                <input
                  type="text"
                  placeholder="Seu nome completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputBase}
                  onFocus={inputFocusHandler}
                  onBlur={inputBlurHandler}
                />
              </div>
            )}

            {/* email */}
            <div>
              <label
                style={{
                  display: "block",
                  fontFamily: sora,
                  fontSize: 12,
                  color: "#6E6E73",
                  marginBottom: 6,
                }}
              >
                E-mail
              </label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputBase}
                onFocus={inputFocusHandler}
                onBlur={inputBlurHandler}
              />
            </div>

            {/* password */}
            <div>
              <label
                style={{
                  display: "block",
                  fontFamily: sora,
                  fontSize: 12,
                  color: "#6E6E73",
                  marginBottom: 6,
                }}
              >
                Senha
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "login" ? "Digite sua senha" : "Crie uma senha"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  style={{ ...inputBase, paddingRight: 42 }}
                  onFocus={inputFocusHandler}
                  onBlur={inputBlurHandler}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
          </div>

          {/* forgot password — login only */}
          {mode === "login" && (
            <button
              style={{
                fontFamily: sora,
                fontSize: 12,
                color: "#E85D30",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                padding: 0,
                marginTop: 12,
                transition: "opacity 150ms ease",
              }}
            >
              Esqueci minha senha
            </button>
          )}

          {/* error */}
          {error && (
            <p
              style={{
                fontFamily: sora,
                fontSize: 12,
                color: "#E85D30",
                marginTop: 12,
              }}
            >
              {error}
            </p>
          )}

          {/* submit */}
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            style={{
              width: "100%",
              height: 44,
              marginTop: 20,
              background: "#E85D30",
              color: "#0A0A0C",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: sora,
              cursor: isLoading ? "default" : "pointer",
              opacity: isLoading ? 0.7 : 1,
              transition: "opacity 150ms ease",
            }}
          >
            {isLoading
              ? mode === "login"
                ? "Entrando..."
                : "Criando conta..."
              : mode === "login"
                ? "Entrar"
                : "Criar conta"}
          </button>

          {/* toggle */}
          <p
            style={{
              fontFamily: sora,
              fontSize: 13,
              color: "#6E6E73",
              textAlign: "center",
              marginTop: 24,
            }}
          >
            {mode === "login" ? (
              <>
                Nao tem conta?{" "}
                <button
                  onClick={() => switchMode("register")}
                  style={{
                    fontFamily: sora,
                    fontSize: 13,
                    color: "#E85D30",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    fontWeight: 600,
                    transition: "opacity 150ms ease",
                  }}
                >
                  Criar conta
                </button>
              </>
            ) : (
              <>
                Ja tem conta?{" "}
                <button
                  onClick={() => switchMode("login")}
                  style={{
                    fontFamily: sora,
                    fontSize: 13,
                    color: "#E85D30",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    fontWeight: 600,
                    transition: "opacity 150ms ease",
                  }}
                >
                  Entrar
                </button>
              </>
            )}
          </p>

          {/* legal — register only */}
          {mode === "register" && (
            <p
              style={{
                fontFamily: sora,
                fontSize: 11,
                color: "#3A3A3F",
                textAlign: "center",
                marginTop: 16,
                lineHeight: 1.6,
              }}
            >
              Ao criar sua conta, voce concorda com os{" "}
              <a href="#" style={{ color: "#6E6E73", textDecoration: "underline" }}>
                Termos de Uso
              </a>{" "}
              e a{" "}
              <a href="#" style={{ color: "#6E6E73", textDecoration: "underline" }}>
                Politica de Privacidade
              </a>
              .
            </p>
          )}
        </div>

        {/* footer links */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 24,
            paddingTop: 32,
            paddingBottom: 8,
          }}
        >
          {["Suporte", "Termos de Uso", "Privacidade"].map((label) => (
            <a
              key={label}
              href="#"
              style={{
                fontFamily: sora,
                fontSize: 11,
                color: "#3A3A3F",
                textDecoration: "none",
                transition: "color 150ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#6E6E73")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#3A3A3F")}
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          RIGHT — THE MACHINE
          Hidden on < 900px (md breakpoint ~ 768px but we use
          className for the responsive hide)
      ═══════════════════════════════════════ */}
      <div
        className="hidden md:flex"
        style={{
          flex: 1,
          borderLeft: "1px solid #19191C",
        }}
      >
        <TheMachine />
      </div>
    </div>
  );
}
