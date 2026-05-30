'use client';

import { KloelBrandLockup, KloelLoadingState } from '@/components/kloel/KloelBrand';
import { acceptTeamInvite } from '@/lib/api/team';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useId, useState } from 'react';

const sora = "var(--font-sora), 'Sora', sans-serif";

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.text.dim}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={kloelT(`M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z`)} />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.text.dim}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94`,
        )}
      />
      <path d={kloelT(`M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19`)} />
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d={kloelT(`M14.12 14.12a3 3 0 1 1-4.24-4.24`)} />
    </svg>
  );
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const uid = useId();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const inputBase: React.CSSProperties = {
    width: '100%',
    height: 44,
    background: colors.background.surface,
    border: `1px solid ${colors.border.space}`,
    borderRadius: 6,
    padding: '0 14px',
    fontSize: 14,
    fontFamily: sora,
    color: colors.text.silver,
    outline: 'none',
    transition: 'border-color 150ms ease',
    boxSizing: 'border-box',
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Token de convite invalido ou ausente.');
      return;
    }

    if (!name.trim()) {
      setError('Informe seu nome.');
      return;
    }

    if (password.length < 8) {
      setError('A senha deve ter no minimo 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas nao coincidem.');
      return;
    }

    setIsLoading(true);

    try {
      await acceptTeamInvite(token, name.trim(), password);
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao aceitar convite. Tente novamente.',
      );
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: colors.background.void,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: sora,
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: colors.text.silver,
              marginBottom: 12,
            }}
          >
            {kloelT(`Convite invalido`)}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: colors.text.muted,
              marginBottom: 24,
              lineHeight: 1.5,
            }}
          >
            {kloelT(`O link de convite esta invalido ou expirado. Solicite um novo convite ao
            administrador do workspace.`)}
          </p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            style={{
              height: 44,
              padding: '0 24px',
              background: colors.ember.primary,
              color: colors.text.inverted,
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: sora,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Voltar ao login`)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: sora,
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Back to login */}
        <button
          type="button"
          onClick={() => router.push('/login')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            color: colors.text.muted,
            fontSize: 13,
            fontFamily: sora,
            cursor: 'pointer',
            marginBottom: 32,
            padding: 0,
            transition: 'color 150ms ease',
          }}
        >
          <ArrowLeft size={16} aria-hidden="true" />

          {kloelT(`Voltar ao login`)}
        </button>

        <div style={{ marginBottom: 32 }}>
          <KloelBrandLockup markSize={22} fontSize={18} fontWeight={600} />
        </div>

        {success ? (
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: colors.text.silver,
                marginBottom: 12,
              }}
            >
              {kloelT(`Convite aceito`)}
            </h1>
            <p
              style={{
                fontSize: 14,
                color: colors.text.muted,
                lineHeight: 1.5,
                marginBottom: 24,
              }}
            >
              {kloelT(`Sua conta foi criada com sucesso. Voce sera redirecionado para o login em
              instantes.`)}
            </p>
            <button
              type="button"
              onClick={() => router.push('/login')}
              style={{
                width: '100%',
                height: 44,
                background: colors.ember.primary,
                color: colors.text.inverted,
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: sora,
                cursor: 'pointer',
              }}
            >
              {kloelT(`Ir para o login`)}
            </button>
          </div>
        ) : (
          <>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: colors.text.silver,
                marginBottom: 8,
              }}
            >
              {kloelT(`Aceitar convite`)}
            </h1>
            <p
              style={{
                fontSize: 14,
                color: colors.text.muted,
                marginBottom: 32,
                lineHeight: 1.5,
              }}
            >
              {kloelT(`Defina seu nome e senha para concluir o acesso ao workspace.`)}
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Name */}
                <div>
                  <label
                    htmlFor={`${uid}-name`}
                    style={{
                      display: 'block',
                      fontSize: 12,
                      color: colors.text.muted,
                      marginBottom: 6,
                    }}
                  >
                    {kloelT(`Nome`)}
                  </label>
                  <input
                    id={`${uid}-name`}
                    type="text"
                    placeholder={kloelT(`Seu nome completo`)}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    style={inputBase}
                    onFocus={(e) => {
                      e.target.style.borderColor = colors.border.space;
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = colors.border.space;
                    }}
                  />
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor={`${uid}-password`}
                    style={{
                      display: 'block',
                      fontSize: 12,
                      color: colors.text.muted,
                      marginBottom: 6,
                    }}
                  >
                    {kloelT(`Senha`)}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id={`${uid}-password`}
                      type={showPassword ? 'text' : 'password'}
                      placeholder={kloelT(`Minimo 8 caracteres`)}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      style={{ ...inputBase, paddingRight: 42 }}
                      onFocus={(e) => {
                        e.target.style.borderColor = colors.border.space;
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = colors.border.space;
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                {/* Confirm password */}
                <div>
                  <label
                    htmlFor={`${uid}-confirm-password`}
                    style={{
                      display: 'block',
                      fontSize: 12,
                      color: colors.text.muted,
                      marginBottom: 6,
                    }}
                  >
                    {kloelT(`Confirmar senha`)}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id={`${uid}-confirm-password`}
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder={kloelT(`Repita a senha`)}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      style={{ ...inputBase, paddingRight: 42 }}
                      onFocus={(e) => {
                        e.target.style.borderColor = colors.border.space;
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = colors.border.space;
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <p
                  style={{
                    fontSize: 12,
                    color: colors.ember.primary,
                    marginTop: 12,
                  }}
                >
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  height: 44,
                  marginTop: 20,
                  background: colors.ember.primary,
                  color: colors.text.inverted,
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: sora,
                  cursor: isLoading ? 'default' : 'pointer',
                  opacity: isLoading ? 0.7 : 1,
                  transition: 'opacity 150ms ease',
                }}
              >
                {isLoading ? 'Aceitando...' : 'Aceitar convite'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/** Accept team invite page. */
export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: colors.background.void,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: sora,
            padding: 24,
          }}
        >
          <KloelLoadingState
            size={88}
            traceColor={colors.text.silver}
            label={kloelT(`Kloel`)}
            hint={kloelT(`preparando o convite`)}
            minHeight={280}
          />
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
