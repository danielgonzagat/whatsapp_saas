'use client';

import { kloelT } from '@/lib/i18n/t';
import { authApi } from '@/lib/api';
import { buildAppUrl, sanitizeNextPath } from '@/lib/subdomains';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from './auth-provider';
import { TheMachine } from './kloel-auth-screen.machine';
import { useGoogleSignIn, useFacebookSignIn } from './kloel-auth-screen.hooks';
import { SocialButtons } from './kloel-auth-screen.social-buttons';
import { AuthFormFields } from './kloel-auth-screen.form-fields';

/* ─── types ─── */
interface KloelAuthScreenProps {
  initialMode?: 'login' | 'register';
}

type Mode = 'login' | 'register';

/* ─── constants ─── */
const sora = "var(--font-sora), 'Sora', sans-serif";
const jetbrains = "var(--font-jetbrains), 'JetBrains Mono', monospace";

function navigateCurrentWindow(url: string) {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function resolveOAuthErrorMessage(errorCode: string, reason: string): string {
  if (errorCode === 'apple_auth_failed') {
    if (reason === 'missing_identity_token')
      return 'A Apple nao retornou o token de autenticacao. Tente novamente.';
    if (reason === 'timeout') return 'A autenticacao com Apple expirou. Tente novamente.';
    return 'Falha ao autenticar com Apple.';
  }
  if (errorCode === 'tiktok_auth_failed') {
    if (reason === 'missing_code')
      return 'O TikTok nao retornou o codigo de autorizacao. Tente novamente.';
    if (reason === 'state_mismatch')
      return 'A sessao de login com TikTok expirou ou ficou invalida. Tente novamente.';
    if (reason === 'access_denied') return 'O login com TikTok foi cancelado ou negado.';
    if (reason === 'timeout') return 'O TikTok demorou para responder. Tente novamente.';
    if (
      reason === 'client_key_missing' ||
      reason === 'client_secret_missing' ||
      reason === 'backend_not_configured'
    ) {
      return 'Login com TikTok indisponivel no momento.';
    }
    if (reason === 'token_exchange_failed')
      return 'Nao foi possivel validar o login com TikTok. Tente novamente.';
    return 'Falha ao autenticar com TikTok.';
  }
  return 'Nao foi possivel concluir a autenticacao social.';
}

/* ────────────────────────────────────────────────────────────
   MAIN EXPORT
   ──────────────────────────────────────────────────────────── */
export function KloelAuthScreen({ initialMode = 'login' }: KloelAuthScreenProps) {
  const fid = useId();
  const {
    signIn,
    signUp,
    signInWithGoogle,
    signInWithFacebook,
    requestMagicLink,
    isAuthenticated,
  } = useAuth();
  const redirectingRef = useRef(false);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [affiliateInviteToken, setAffiliateInviteToken] = useState('');
  const [affiliateInviteWorkspaceName, setAffiliateInviteWorkspaceName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState('');
  const tikTokAvailable =
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY?.trim() : '') || '';

  const shouldBypassExistingSessionRedirect = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('forceAuth') === '1';
  }, []);

  const resolveNextPath = useCallback((fallbackPath = '/') => {
    if (typeof window === 'undefined') return fallbackPath;
    return sanitizeNextPath(new URLSearchParams(window.location.search).get('next'), fallbackPath);
  }, []);

  const redirectToApp = useCallback(
    (fallbackPath = '/') => {
      if (typeof window === 'undefined') return;
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      const nextPath = resolveNextPath(fallbackPath);
      const destination = new URL(buildAppUrl(nextPath, window.location.host));
      destination.searchParams.set('auth', '1');
      navigateCurrentWindow(destination.toString());
    },
    [resolveNextPath],
  );

  useEffect(() => {
    if (isAuthenticated && !shouldBypassExistingSessionRedirect()) redirectToApp();
  }, [isAuthenticated, redirectToApp, shouldBypassExistingSessionRedirect]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('affiliateInviteToken')?.trim() || '';
    if (!inviteToken) return;
    const inviteEmail = params.get('email')?.trim() || '';
    const inviteName = params.get('partnerName')?.trim() || '';
    const inviterWorkspaceName = params.get('inviterWorkspaceName')?.trim() || '';
    setMode('register');
    setAffiliateInviteToken(inviteToken);
    setAffiliateInviteWorkspaceName(inviterWorkspaceName);
    if (inviteEmail) setEmail(inviteEmail);
    if (inviteName) setName(inviteName);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error')?.trim() || '';
    if (!oauthError) return;
    const reason = params.get('reason')?.trim() || '';
    setError(resolveOAuthErrorMessage(oauthError, reason));
  }, []);

  const switchMode = (m: Mode) => {
    setMode(m);
    if (!affiliateInviteToken || m !== 'register') {
      setName('');
      setEmail('');
    }
    setPassword('');
    setShowPassword(false);
    setError('');
    setForgotSent(false);
    setMagicLinkSent('');
  };

  const handleSubmit = async () => {
    setError('');
    if (mode === 'register' && !name.trim()) {
      setError('Nome e obrigatorio.');
      return;
    }
    if (!email.trim()) {
      setError('E-mail e obrigatorio.');
      return;
    }
    if (password.length < 1) {
      setError('Senha e obrigatoria.');
      return;
    }
    setIsLoading(true);
    const result =
      mode === 'register'
        ? await signUp(email, name, password, {
            affiliateInviteToken: affiliateInviteToken || undefined,
          })
        : await signIn(email, password);
    if (!result.success) {
      setError(result.error || 'Erro inesperado. Tente novamente.');
      setIsLoading(false);
      return;
    }
    redirectToApp();
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSubmit();
  };

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setError('');
      setMagicLinkSent('');
      setIsLoading(true);
      const result = await signInWithGoogle(credential);
      if (!result.success) {
        setError(result.error || 'Falha ao autenticar com Google.');
        setIsLoading(false);
        return;
      }
      redirectToApp();
    },
    [redirectToApp, signInWithGoogle],
  );

  const googleButtonRef = useRef<HTMLDivElement>(null);
  useGoogleSignIn(handleGoogleCredential, googleButtonRef);

  const handleFacebookAuth = useCallback(
    async ({ accessToken, userId }: { accessToken: string; userId?: string }) => {
      setError('');
      setMagicLinkSent('');
      setIsLoading(true);
      const result = await signInWithFacebook(accessToken, userId);
      if (!result.success) {
        setError(result.error || 'Falha ao autenticar com Facebook.');
        setIsLoading(false);
        return;
      }
      redirectToApp();
    },
    [redirectToApp, signInWithFacebook],
  );

  const {
    available: facebookAvailable,
    sdkReady: facebookSdkReady,
    signIn: triggerFacebookSignIn,
  } = useFacebookSignIn(handleFacebookAuth, isLoading);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Preencha o e-mail.');
      return;
    }
    setError('');
    setMagicLinkSent('');
    setIsLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setForgotSent(true);
    } catch {
      setError('Erro ao enviar e-mail de recuperacao. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = useCallback(async () => {
    if (!email.trim()) {
      setError('Preencha o e-mail para receber o link mágico.');
      return;
    }
    setError('');
    setForgotSent(false);
    setMagicLinkSent('');
    setIsLoading(true);
    try {
      const result = await requestMagicLink(email.trim(), resolveNextPath('/'));
      if (!result.success) {
        setError(result.error || 'Falha ao enviar o link mágico.');
        return;
      }
      setMagicLinkSent(
        result.message ||
          'Se o email for válido, o link de acesso foi enviado para sua caixa de entrada.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [email, requestMagicLink, resolveNextPath]);

  const handleFacebookClick = useCallback(async () => {
    setError('');
    setForgotSent(false);
    setMagicLinkSent('');
    try {
      await triggerFacebookSignIn();
    } catch (facebookError: unknown) {
      setError(
        facebookError instanceof Error
          ? facebookError.message
          : 'Falha ao autenticar com Facebook.',
      );
      setIsLoading(false);
    }
  }, [triggerFacebookSignIn]);

  const handleApple = async () => {
    setIsLoading(true);
    try {
      const appleAuthUrl = `https://appleid.apple.com/auth/authorize?client_id=${encodeURIComponent(process.env.NEXT_PUBLIC_APPLE_CLIENT_ID || 'com.kloel.web')}&redirect_uri=${encodeURIComponent(`${window.location.origin}/api/auth/callback/apple`)}&response_type=code id_token&scope=name email&response_mode=form_post`;
      window.location.href = appleAuthUrl;
    } catch (e) {
      console.error('Apple Sign-In error:', e);
      setIsLoading(false);
    }
  };

  const handleTikTok = useCallback(() => {
    if (!tikTokAvailable || typeof window === 'undefined') return;
    setError('');
    setForgotSent(false);
    setMagicLinkSent('');
    setIsLoading(true);
    const destination = new URL('/api/auth/tiktok/start', window.location.origin);
    destination.searchParams.set('next', resolveNextPath('/'));
    window.location.assign(destination.toString());
  }, [resolveNextPath, tikTokAvailable]);

  const inputBase: React.CSSProperties = {
    width: '100%',
    height: 44,
    background: '#111113',
    border: '1px solid #222226',
    borderRadius: 6,
    padding: '0 14px',
    fontSize: 14,
    fontFamily: sora,
    color: '#E0DDD8',
    outline: 'none',
    transition: 'border-color 150ms ease',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        height: '100vh',
        background: '#0A0A0C',
        fontFamily: sora,
        overflow: 'hidden',
      }}
    >
      {/* LEFT — FORM */}
      <div
        className="kloel-auth-form"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: 'clamp(28px, 5vh, 56px) clamp(20px, 5vw, 48px)',
          maxWidth: 640,
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
          overflowY: 'auto',
          height: '100%',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingBottom: 'clamp(16px, 3vh, 32px)',
          }}
        >
          <div style={{ width: '100%', maxWidth: 408, margin: '0 auto' }}>
            {/* header */}
            <div
              style={{
                marginBottom: 36,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 12,
              }}
            >
              <span
                style={{
                  fontFamily: jetbrains,
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#E85D30',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                }}
              >
                {mode === 'login' ? 'Acesso seguro' : 'Nova conta'}
              </span>
              <h1
                style={{
                  fontFamily: sora,
                  fontSize: 'clamp(28px, 4vw, 34px)',
                  fontWeight: 700,
                  color: '#E0DDD8',
                  lineHeight: 1.12,
                  margin: 0,
                  textWrap: 'balance',
                }}
              >
                {mode === 'login' ? 'Entrar' : 'Criar conta'}
              </h1>
              <p
                style={{
                  fontFamily: sora,
                  fontSize: 14,
                  color: '#6E6E73',
                  lineHeight: 1.6,
                  margin: 0,
                  maxWidth: 340,
                  textWrap: 'balance',
                }}
              >
                {mode === 'login'
                  ? 'Acesse sua conta.'
                  : 'Crie sua conta e comece a usar a inteligencia comercial autonoma.'}
              </p>
              {mode === 'register' && affiliateInviteToken ? (
                <p
                  style={{
                    fontFamily: jetbrains,
                    fontSize: 11,
                    color: '#E85D30',
                    lineHeight: 1.6,
                    margin: 0,
                    maxWidth: 360,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {affiliateInviteWorkspaceName
                    ? `Convite de afiliado para ${affiliateInviteWorkspaceName}`
                    : 'Convite de afiliado detectado'}
                </p>
              ) : null}
            </div>

            {/* social buttons */}
            <SocialButtons
              googleButtonRef={googleButtonRef}
              isLoading={isLoading}
              facebookAvailable={facebookAvailable}
              facebookSdkReady={facebookSdkReady}
              tikTokAvailable={tikTokAvailable}
              onFacebookClick={() => void handleFacebookClick()}
              onTikTokClick={() => void handleTikTok()}
              onAppleClick={handleApple}
            />

            {/* divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
              <div style={{ flex: 1, height: 1, background: '#222226' }} />
              <span
                style={{
                  fontFamily: sora,
                  fontSize: 12,
                  color: '#3A3A3F',
                  textTransform: 'lowercase',
                }}
              >
                ou
              </span>
              <div style={{ flex: 1, height: 1, background: '#222226' }} />
            </div>

            {/* email/password form */}
            <AuthFormFields
              fid={fid}
              mode={mode}
              name={name}
              email={email}
              password={password}
              showPassword={showPassword}
              isLoading={isLoading}
              error={error}
              forgotSent={forgotSent}
              magicLinkSent={magicLinkSent}
              inputBase={inputBase}
              onFormSubmit={handleFormSubmit}
              onHandleSubmit={() => void handleSubmit()}
              onNameChange={setName}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
              onForgotPassword={() => void handleForgotPassword()}
              onMagicLink={() => void handleMagicLink()}
              onSwitchMode={switchMode}
            />
          </div>
        </div>

        {/* footer links */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 24,
            paddingTop: 32,
            paddingBottom: 8,
          }}
        >
          <a
            href="mailto:support@kloel.com"
            style={{
              fontFamily: sora,
              fontSize: 11,
              color: '#3A3A3F',
              textDecoration: 'none',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#6E6E73';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#3A3A3F';
            }}
          >
            {kloelT(`Suporte`)}
          </a>
          <Link
            href="/terms"
            style={{
              fontFamily: sora,
              fontSize: 11,
              color: '#3A3A3F',
              textDecoration: 'none',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#6E6E73';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#3A3A3F';
            }}
          >
            {kloelT(`Termos de Uso`)}
          </Link>
          <Link
            href="/privacy"
            style={{
              fontFamily: sora,
              fontSize: 11,
              color: '#3A3A3F',
              textDecoration: 'none',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#6E6E73';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#3A3A3F';
            }}
          >
            {kloelT(`Privacidade`)}
          </Link>
        </div>
      </div>

      {/* RIGHT — THE MACHINE (hidden on mobile) */}
      <div className="hidden md:flex" style={{ flex: 1, borderLeft: '1px solid #19191C' }}>
        <TheMachine />
      </div>
    </div>
  );
}
