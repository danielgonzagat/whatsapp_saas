'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Check, Eye, EyeOff, X } from 'lucide-react';
import { useCallback, useEffect, useState, useId } from 'react';
import { KloelMushroomVisual, KloelWordmark } from '../KloelBrand';
import { useAuth } from './auth-provider';
import { GoogleSignInButton } from './google-sign-in-button';

const S_______S________S_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const A_Z_RE = /[A-Z]/;
const RX_0_9_RE = /[0-9]/;

type AuthMode = 'signup' | 'login';
type AuthStep = 'email' | 'details';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
  initialEmail?: string;
}

export function AuthModal({
  isOpen,
  onClose,
  initialMode = 'signup',
  initialEmail,
}: AuthModalProps) {
  const fid = useId();
  const { signUp, signIn, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<AuthStep>('email');

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [forgotSent, setForgotSent] = useState(false);

  // Reset form when modal opens/closes or mode changes from props
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setStep('email');
      setEmail(initialEmail || '');
      setName('');
      setPassword('');
      setConfirmPassword('');
      setAcceptedTerms(false);
      setErrors({});
      setIsLoading(false);
      setForgotSent(false);
    }
  }, [isOpen, initialMode, initialEmail]);

  const validateEmail = (email: string) => {
    const re = S_______S________S_RE;
    return re.test(email);
  };

  const getPasswordStrength = (pwd: string): { level: number; label: string; color: string } => {
    if (pwd.length === 0) {
      return { level: 0, label: '', color: 'bg-gray-200' };
    }
    if (pwd.length < 6) {
      return { level: 1, label: 'Fraca', color: 'bg-red-500' };
    }
    if (pwd.length < 8) {
      return { level: 2, label: 'Media', color: 'bg-yellow-500' };
    }
    if (pwd.length >= 8 && A_Z_RE.test(pwd) && RX_0_9_RE.test(pwd)) {
      return { level: 4, label: 'Forte', color: 'bg-green-500' };
    }
    return { level: 3, label: 'Boa', color: 'bg-blue-500' };
  };

  const handleEmailContinue = () => {
    setErrors({});
    if (!validateEmail(email)) {
      setErrors({ email: 'Digite um e-mail valido' });
      return;
    }

    setStep('details');
  };

  const handleSignUp = async () => {
    setErrors({});
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Nome e obrigatorio';
    }
    if (password.length < 8) {
      newErrors.password = 'Senha deve ter pelo menos 8 caracteres';
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'As senhas nao coincidem';
    }
    if (!acceptedTerms) {
      newErrors.terms = 'Voce deve aceitar os termos';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    const result = await signUp(email, name, password);

    if (!result.success) {
      setErrors({ general: result.error || 'Erro ao criar conta. Tente novamente.' });
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    onClose();
  };

  const handleSignIn = async () => {
    setErrors({});
    if (password.length < 1) {
      setErrors({ password: 'Digite sua senha' });
      return;
    }

    setIsLoading(true);

    const result = await signIn(email, password);

    if (!result.success) {
      setErrors({ password: result.error || 'Email ou senha incorretos' });
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    onClose();
  };

  const handleGoogleSignIn = useCallback(
    async (credential: string) => {
      setErrors({});
      setIsLoading(true);

      const result = await signInWithGoogle(credential);

      if (!result.success) {
        setErrors({ general: result.error || 'Falha ao autenticar com Google.' });
        setIsLoading(false);
        return result;
      }

      setIsLoading(false);
      onClose();
      return result;
    },
    [onClose, signInWithGoogle],
  );

  const handleGoogleError = useCallback((message: string) => {
    setErrors({ general: message });
  }, []);

  const handleBack = () => {
    setStep('email');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setAcceptedTerms(false);
    setErrors({});
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setErrors({ password: 'Preencha o e-mail primeiro.' });
      return;
    }
    setErrors({});
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors({ password: data.message || 'Erro ao enviar e-mail de recuperacao.' });
      } else {
        setForgotSent(true);
      }
    } catch {
      setErrors({ password: 'Erro ao enviar e-mail de recuperacao. Tente novamente.' });
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setStep('email');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setAcceptedTerms(false);
    setErrors({});
    setForgotSent(false);
  };

  const passwordStrength = getPasswordStrength(password);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity border-none p-0 cursor-pointer"
        onClick={onClose}
        aria-label="Fechar modal"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="rounded-3xl bg-white p-8 shadow-2xl">
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Branding */}
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-3">
              <KloelMushroomVisual
                size={56}
                traceColor="#0A0A0C"
                animated={isLoading}
                spores={isLoading ? 'animated' : 'none'}
              />
            </div>
            <KloelWordmark color="#0A0A0C" fontSize={20} fontWeight={600} />
            <h1 className="text-xl font-semibold text-gray-900">
              {mode === 'signup' ? 'Criar sua conta' : 'Entrar no Kloel'}
            </h1>
          </div>

          {step === 'email' ? (
            <>
              {/* Error Message */}
              {errors.general && (
                <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
                  {errors.general}
                </div>
              )}

              <div className="mb-4 space-y-4">
                <GoogleSignInButton
                  mode={mode}
                  disabled={isLoading}
                  onCredential={handleGoogleSignIn}
                  onError={handleGoogleError}
                />

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-xs uppercase tracking-[0.18em] text-gray-400">ou</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
              </div>

              {/* Email Input */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-gray-700">E-mail</Label>
                  <Input
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEmailContinue()}
                    className={`rounded-md border-gray-200 py-5 ${errors.email ? 'border-red-500' : ''}`}
                  />
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                </div>

                <Button
                  type="submit"
                  onClick={handleEmailContinue}
                  disabled={!email}
                  className="w-full rounded-md bg-gray-900 py-5 text-white hover:bg-gray-800"
                >
                  Continuar
                </Button>
              </div>

              {/* Switch Mode Link */}
              <p className="mt-5 text-center text-sm text-gray-500">
                {mode === 'signup' ? (
                  <>
                    Ja tem conta?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      Entrar
                    </button>
                  </>
                ) : (
                  <>
                    Ainda nao tem conta?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      Criar conta
                    </button>
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              {/* Back Button */}
              <button
                type="button"
                onClick={handleBack}
                className="mb-5 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar
              </button>

              {/* Email Display */}
              <div className="mb-5 flex items-center gap-3 rounded-md bg-gray-50 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                  {email.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-700">{email}</span>
              </div>

              {mode === 'signup' ? (
                /* Sign Up Details */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-700">Nome completo</Label>
                    <Input
                      type="text"
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`rounded-md border-gray-200 py-5 ${errors.name ? 'border-red-500' : ''}`}
                    />
                    {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-gray-700">Senha</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Crie uma senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`rounded-md border-gray-200 py-5 pr-12 ${errors.password ? 'border-red-500' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <Eye className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {password && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex flex-1 gap-1">
                          {[1, 2, 3, 4].map((level) => (
                            <div
                              key={`strength-${level}`}
                              className={`h-1 flex-1 rounded-full transition-colors ${
                                level <= passwordStrength.level
                                  ? passwordStrength.color
                                  : 'bg-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-gray-500">{passwordStrength.label}</span>
                      </div>
                    )}
                    {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-gray-700">Confirmar senha</Label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirme sua senha"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`rounded-md border-gray-200 py-5 pr-12 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <Eye className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {confirmPassword && password === confirmPassword && (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Senhas coincidem
                      </div>
                    )}
                    {errors.confirmPassword && (
                      <p className="text-xs text-red-500">{errors.confirmPassword}</p>
                    )}
                  </div>

                  <div className="flex items-start gap-3 pt-2">
                    <Checkbox
                      id={`${fid}-terms`}
                      checked={acceptedTerms}
                      onCheckedChange={(checked: boolean | 'indeterminate') =>
                        setAcceptedTerms(checked === true)
                      }
                      className="mt-0.5"
                    />
                    <label htmlFor={`${fid}-terms`} className="text-sm text-gray-600">
                      Eu concordo com os{' '}
                      <a href="#" className="text-gray-900 hover:underline">
                        Termos de Uso
                      </a>{' '}
                      e a{' '}
                      <a href="#" className="text-gray-900 hover:underline">
                        Politica de Privacidade
                      </a>
                      .
                    </label>
                  </div>
                  {errors.terms && <p className="text-xs text-red-500">{errors.terms}</p>}

                  <Button
                    type="submit"
                    onClick={handleSignUp}
                    disabled={isLoading}
                    className="mt-2 w-full rounded-md bg-gray-900 py-5 text-white hover:bg-gray-800"
                  >
                    {isLoading ? 'Criando conta...' : 'Criar conta'}
                  </Button>

                  <p className="text-center text-sm text-gray-500">
                    Ja tem conta?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      Entrar
                    </button>
                  </p>
                </div>
              ) : (
                /* Login Details */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-700">Senha</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Digite sua senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                        className={`rounded-md border-gray-200 py-5 pr-12 ${errors.password ? 'border-red-500' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <Eye className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                  </div>

                  {forgotSent ? (
                    <p className="text-sm text-gray-500">
                      E-mail de recuperacao enviado. Verifique sua caixa de entrada.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={isLoading}
                      className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  )}

                  <Button
                    type="submit"
                    onClick={handleSignIn}
                    disabled={isLoading}
                    className="w-full rounded-md bg-gray-900 py-5 text-white hover:bg-gray-800"
                  >
                    {isLoading ? 'Entrando...' : 'Entrar'}
                  </Button>

                  <p className="text-center text-sm text-gray-500">
                    Criar nova conta?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      Cadastrar
                    </button>
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
