"use client"

import { useState, useEffect } from "react"
import { X, Eye, EyeOff, ArrowLeft, Check } from "lucide-react"
import { signIn as nextAuthSignIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "./auth-provider"

type AuthMode = "signup" | "login"
type AuthStep = "email" | "details"

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: AuthMode
}

export function AuthModal({ isOpen, onClose, initialMode = "signup" }: AuthModalProps) {
  const { signUp, signIn } = useAuth()

  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [step, setStep] = useState<AuthStep>("email")

  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset form when modal opens/closes or mode changes from props
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode)
      setStep("email")
      setEmail("")
      setName("")
      setPassword("")
      setConfirmPassword("")
      setAcceptedTerms(false)
      setErrors({})
    }
  }, [isOpen, initialMode])

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
  }

  const getPasswordStrength = (pwd: string): { level: number; label: string; color: string } => {
    if (pwd.length === 0) return { level: 0, label: "", color: "bg-gray-200" }
    if (pwd.length < 6) return { level: 1, label: "Fraca", color: "bg-red-500" }
    if (pwd.length < 8) return { level: 2, label: "Media", color: "bg-yellow-500" }
    if (pwd.length >= 8 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) {
      return { level: 4, label: "Forte", color: "bg-green-500" }
    }
    return { level: 3, label: "Boa", color: "bg-blue-500" }
  }

  const handleEmailContinue = () => {
    setErrors({})
    if (!validateEmail(email)) {
      setErrors({ email: "Digite um e-mail valido" })
      return
    }
    setStep("details")
  }

  const handleSignUp = async () => {
    setErrors({})
    const newErrors: Record<string, string> = {}

    if (!name.trim()) newErrors.name = "Nome e obrigatorio"
    if (password.length < 6) newErrors.password = "Senha deve ter pelo menos 6 caracteres"
    if (password !== confirmPassword) newErrors.confirmPassword = "As senhas nao coincidem"
    if (!acceptedTerms) newErrors.terms = "Voce deve aceitar os termos"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsLoading(true)
    
    const result = await signUp(email, name, password)
    
    if (!result.success) {
      setErrors({ general: result.error || "Erro ao criar conta. Tente novamente." })
      setIsLoading(false)
      return
    }
    
    setIsLoading(false)
    onClose()
  }

  const handleSignIn = async () => {
    setErrors({})
    if (password.length < 1) {
      setErrors({ password: "Digite sua senha" })
      return
    }

    setIsLoading(true)
    
    const result = await signIn(email, password)
    
    if (!result.success) {
      setErrors({ password: result.error || "Email ou senha incorretos" })
      setIsLoading(false)
      return
    }
    
    setIsLoading(false)
    onClose()
  }

  const handleGoogleSignIn = () => {
    setIsLoading(true)
    nextAuthSignIn("google", { callbackUrl: "/" })
  }

  const handleBack = () => {
    setStep("email")
    setPassword("")
    setConfirmPassword("")
    setName("")
    setAcceptedTerms(false)
    setErrors({})
  }

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode)
    setStep("email")
    setPassword("")
    setConfirmPassword("")
    setName("")
    setAcceptedTerms(false)
    setErrors({})
  }

  const passwordStrength = getPasswordStrength(password)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="rounded-3xl bg-white p-8 shadow-2xl">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Branding */}
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-lg font-bold text-white shadow-lg">
              K
            </div>
            <h1 className="text-xl font-semibold text-gray-900">
              {mode === "signup" ? "Criar sua conta" : "Entrar no Kloel"}
            </h1>
          </div>

          {step === "email" ? (
            <>
              {/* Error Message */}
              {errors.general && (
                <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
                  {errors.general}
                </div>
              )}

              {/* Google Button */}
              <Button
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border-gray-200 py-5 text-gray-700 hover:bg-gray-50 bg-transparent"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
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
              </Button>

              {/* Divider */}
              <div className="mb-5 flex items-center gap-4">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-sm text-gray-400">ou</span>
                <div className="h-px flex-1 bg-gray-200" />
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
                    onKeyDown={(e) => e.key === "Enter" && handleEmailContinue()}
                    className={`rounded-xl border-gray-200 py-5 ${errors.email ? "border-red-500" : ""}`}
                  />
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                </div>

                <Button
                  onClick={handleEmailContinue}
                  disabled={!email}
                  className="w-full rounded-xl bg-gray-900 py-5 text-white hover:bg-gray-800"
                >
                  Continuar
                </Button>
              </div>

              {/* Switch Mode Link */}
              <p className="mt-5 text-center text-sm text-gray-500">
                {mode === "signup" ? (
                  <>
                    Ja tem conta?{" "}
                    <button onClick={() => switchMode("login")} className="font-medium text-gray-900 hover:underline">
                      Entrar
                    </button>
                  </>
                ) : (
                  <>
                    Ainda nao tem conta?{" "}
                    <button onClick={() => switchMode("signup")} className="font-medium text-gray-900 hover:underline">
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
                onClick={handleBack}
                className="mb-5 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>

              {/* Email Display */}
              <div className="mb-5 flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                  {email.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-700">{email}</span>
              </div>

              {mode === "signup" ? (
                /* Sign Up Details */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-700">Nome completo</Label>
                    <Input
                      type="text"
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`rounded-xl border-gray-200 py-5 ${errors.name ? "border-red-500" : ""}`}
                    />
                    {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-gray-700">Senha</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Crie uma senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`rounded-xl border-gray-200 py-5 pr-12 ${errors.password ? "border-red-500" : ""}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {password && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex flex-1 gap-1">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-colors ${
                                i <= passwordStrength.level ? passwordStrength.color : "bg-gray-200"
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
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirme sua senha"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`rounded-xl border-gray-200 py-5 pr-12 ${errors.confirmPassword ? "border-red-500" : ""}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {confirmPassword && password === confirmPassword && (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <Check className="h-3 w-3" />
                        Senhas coincidem
                      </div>
                    )}
                    {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
                  </div>

                  <div className="flex items-start gap-3 pt-2">
                    <Checkbox
                      id="terms"
                      checked={acceptedTerms}
                      onCheckedChange={(checked: boolean | "indeterminate") => setAcceptedTerms(checked === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor="terms" className="text-sm text-gray-600">
                      Eu concordo com os{" "}
                      <a href="#" className="text-gray-900 hover:underline">
                        Termos de Uso
                      </a>{" "}
                      e a{" "}
                      <a href="#" className="text-gray-900 hover:underline">
                        Politica de Privacidade
                      </a>
                      .
                    </label>
                  </div>
                  {errors.terms && <p className="text-xs text-red-500">{errors.terms}</p>}

                  <Button
                    onClick={handleSignUp}
                    disabled={isLoading}
                    className="mt-2 w-full rounded-xl bg-gray-900 py-5 text-white hover:bg-gray-800"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Criando conta...
                      </div>
                    ) : (
                      "Criar conta"
                    )}
                  </Button>

                  <p className="text-center text-sm text-gray-500">
                    Ja tem conta?{" "}
                    <button onClick={() => switchMode("login")} className="font-medium text-gray-900 hover:underline">
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
                        type={showPassword ? "text" : "password"}
                        placeholder="Digite sua senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                        className={`rounded-xl border-gray-200 py-5 pr-12 ${errors.password ? "border-red-500" : ""}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                  </div>

                  <button className="text-sm text-gray-500 hover:text-gray-700 hover:underline">
                    Esqueci minha senha
                  </button>

                  <Button
                    onClick={handleSignIn}
                    disabled={isLoading}
                    className="w-full rounded-xl bg-gray-900 py-5 text-white hover:bg-gray-800"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Entrando...
                      </div>
                    ) : (
                      "Entrar"
                    )}
                  </Button>

                  <p className="text-center text-sm text-gray-500">
                    Criar nova conta?{" "}
                    <button onClick={() => switchMode("signup")} className="font-medium text-gray-900 hover:underline">
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
  )
}
