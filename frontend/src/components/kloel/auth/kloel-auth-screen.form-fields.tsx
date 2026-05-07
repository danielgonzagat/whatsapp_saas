'use client';
import { kloelT } from '@/lib/i18n/t';
import Link from 'next/link';
import { type FormEvent } from 'react';
import { EyeIcon, EyeOffIcon } from './kloel-auth-screen.icons';

const sora = "var(--font-sora), 'Sora', sans-serif";

type Mode = 'login' | 'register';

interface AuthFormFieldsProps {
  fid: string;
  mode: Mode;
  name: string;
  email: string;
  password: string;
  showPassword: boolean;
  isLoading: boolean;
  error: string;
  forgotSent: boolean;
  magicLinkSent: string;
  inputBase: React.CSSProperties;
  onFormSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onHandleSubmit: () => void;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onTogglePassword: () => void;
  onForgotPassword: () => void;
  onMagicLink: () => void;
  onSwitchMode: (m: Mode) => void;
}

export function AuthFormFields({
  fid,
  mode,
  name,
  email,
  password,
  showPassword,
  isLoading,
  error,
  forgotSent,
  magicLinkSent,
  inputBase,
  onFormSubmit,
  onHandleSubmit,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onForgotPassword,
  onMagicLink,
  onSwitchMode,
}: AuthFormFieldsProps) {
  const inputFocusHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#333338';
  };
  const inputBlurHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#222226';
  };

  return (
    <form onSubmit={onFormSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* name — register only */}
        {mode === 'register' && (
          <div>
            <label
              style={{
                display: 'block',
                fontFamily: sora,
                fontSize: 12,
                color: '#6E6E73',
                marginBottom: 6,
              }}
              htmlFor={`${fid}-nome`}
            >
              {kloelT(`Nome`)}
            </label>
            <input
              aria-label="Nome completo"
              type="text"
              placeholder={kloelT(`Seu nome completo`)}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              style={inputBase}
              onFocus={inputFocusHandler}
              onBlur={inputBlurHandler}
              id={`${fid}-nome`}
            />
          </div>
        )}

        {/* email */}
        <div>
          <label
            style={{
              display: 'block',
              fontFamily: sora,
              fontSize: 12,
              color: '#6E6E73',
              marginBottom: 6,
            }}
            htmlFor={`${fid}-email`}
          >
            {kloelT(`E-mail`)}
          </label>
          <input
            aria-label="E-mail"
            type="email"
            placeholder={kloelT(`seu@email.com`)}
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            autoComplete="email"
            style={inputBase}
            onFocus={inputFocusHandler}
            onBlur={inputBlurHandler}
            id={`${fid}-email`}
          />
        </div>

        {/* password */}
        <div>
          <label
            htmlFor={`${fid}-password`}
            style={{
              display: 'block',
              fontFamily: sora,
              fontSize: 12,
              color: '#6E6E73',
              marginBottom: 6,
            }}
          >
            {kloelT(`Senha`)}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id={`${fid}-password`}
              aria-label="Senha"
              type={showPassword ? 'text' : 'password'}
              placeholder={mode === 'login' ? 'Digite sua senha' : 'Crie uma senha'}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onKeyDown={(e) => e.key === 'Enter' && onHandleSubmit()}
              style={{ ...inputBase, paddingRight: 42 }}
              onFocus={inputFocusHandler}
              onBlur={inputBlurHandler}
            />
            <button
              type="button"
              onClick={onTogglePassword}
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
      </div>

      {/* forgot password — login only */}
      {mode === 'login' &&
        (forgotSent ? (
          <p style={{ fontFamily: sora, fontSize: 12, color: '#6E6E73', marginTop: 12 }}>
            {kloelT(`E-mail de recuperacao enviado. Verifique sua caixa de entrada.`)}
          </p>
        ) : (
          <button
            type="button"
            onClick={onForgotPassword}
            disabled={isLoading}
            style={{
              fontFamily: sora,
              fontSize: 12,
              color: '#E85D30',
              background: 'none',
              border: 'none',
              cursor: isLoading ? 'default' : 'pointer',
              textAlign: 'left',
              padding: 0,
              marginTop: 12,
              transition: 'opacity 150ms ease',
            }}
          >
            {kloelT(`Esqueci minha senha`)}
          </button>
        ))}

      {magicLinkSent ? (
        <p
          style={{
            fontFamily: sora,
            fontSize: 12,
            color: '#6E6E73',
            marginTop: 12,
            lineHeight: 1.6,
          }}
        >
          {magicLinkSent}
        </p>
      ) : null}

      {error && (
        <p style={{ fontSize: 12, color: '#E85D30', marginTop: 12, fontFamily: sora }}>{error}</p>
      )}

      {/* submit */}
      <button
        type="submit"
        disabled={isLoading}
        style={{
          width: '100%',
          height: 44,
          marginTop: 20,
          background: '#E85D30',
          color: '#0A0A0C',
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
        {isLoading
          ? mode === 'login'
            ? 'Entrando...'
            : 'Criando conta...'
          : mode === 'login'
            ? 'Entrar'
            : 'Criar conta'}
      </button>

      <button
        type="button"
        onClick={onMagicLink}
        disabled={isLoading}
        style={{
          width: '100%',
          height: 44,
          marginTop: 12,
          background: '#111113',
          color: '#E0DDD8',
          border: '1px solid #222226',
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 500,
          fontFamily: sora,
          cursor: isLoading ? 'default' : 'pointer',
          opacity: isLoading ? 0.7 : 1,
          transition: 'opacity 150ms ease, border-color 150ms ease',
        }}
        onMouseEnter={(e) => {
          if (isLoading) return;
          e.currentTarget.style.borderColor = '#333338';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#222226';
        }}
      >
        {isLoading
          ? 'Processando...'
          : mode === 'login'
            ? 'Receber link mágico'
            : 'Criar conta com link mágico'}
      </button>

      {/* toggle mode */}
      <p
        style={{
          fontFamily: sora,
          fontSize: 13,
          color: '#6E6E73',
          textAlign: 'center',
          marginTop: 24,
        }}
      >
        {mode === 'login' ? (
          <>
            {kloelT(`Nao tem conta?`)}{' '}
            <button
              type="button"
              onClick={() => onSwitchMode('register')}
              style={{
                fontFamily: sora,
                fontSize: 13,
                color: '#E85D30',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                fontWeight: 600,
              }}
            >
              {kloelT(`Criar conta`)}
            </button>
          </>
        ) : (
          <>
            {kloelT(`Ja tem conta?`)}{' '}
            <button
              type="button"
              onClick={() => onSwitchMode('login')}
              style={{
                fontFamily: sora,
                fontSize: 13,
                color: '#E85D30',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                fontWeight: 600,
              }}
            >
              {kloelT(`Entrar`)}
            </button>
          </>
        )}
      </p>

      {/* legal — register only */}
      {mode === 'register' && (
        <p
          style={{
            fontFamily: sora,
            fontSize: 11,
            color: '#3A3A3F',
            textAlign: 'center',
            marginTop: 16,
            lineHeight: 1.6,
          }}
        >
          {kloelT(`Ao criar sua conta, voce concorda com os`)}{' '}
          <Link href="/terms" style={{ color: '#6E6E73', textDecoration: 'underline' }}>
            {kloelT(`Termos de Uso`)}
          </Link>{' '}
          {kloelT(`e a`)}{' '}
          <Link href="/privacy" style={{ color: '#6E6E73', textDecoration: 'underline' }}>
            {kloelT(`Politica de Privacidade`)}
          </Link>
          .
        </p>
      )}
    </form>
  );
}
