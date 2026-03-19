"use client"

import { useEffect, useRef, useState } from "react"

type GoogleSignInButtonProps = {
  mode: "signup" | "login"
  disabled?: boolean
  onCredential: (credential: string) => Promise<{ success: boolean; error?: string }>
  onError?: (message: string) => void
}

const GOOGLE_IDENTITY_SCRIPT_ID = "google-identity-services"
const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client"

export function GoogleSignInButton({
  mode,
  disabled = false,
  onCredential,
  onError,
}: GoogleSignInButtonProps) {
  const buttonContainerRef = useRef<HTMLDivElement | null>(null)
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || ""

  const [sdkReady, setSdkReady] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (clientId) return
    const message =
      "Login com Google não configurado no frontend. Defina NEXT_PUBLIC_GOOGLE_CLIENT_ID."
    setLocalError(message)
    onError?.(message)
  }, [clientId, onError])

  useEffect(() => {
    if (!clientId) return

    if (window.google?.accounts?.id) {
      setSdkReady(true)
      return
    }

    let cancelled = false

    const handleReady = () => {
      if (cancelled) return
      setSdkReady(true)
    }

    const handleFailure = () => {
      if (cancelled) return
      const message = "Não foi possível carregar o login com Google."
      setLocalError(message)
      onError?.(message)
    }

    const existingScript = document.getElementById(
      GOOGLE_IDENTITY_SCRIPT_ID,
    ) as HTMLScriptElement | null

    if (existingScript) {
      existingScript.addEventListener("load", handleReady)
      existingScript.addEventListener("error", handleFailure)

      if (window.google?.accounts?.id) {
        setSdkReady(true)
      }

      return () => {
        cancelled = true
        existingScript.removeEventListener("load", handleReady)
        existingScript.removeEventListener("error", handleFailure)
      }
    }

    const script = document.createElement("script")
    script.id = GOOGLE_IDENTITY_SCRIPT_ID
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener("load", handleReady)
    script.addEventListener("error", handleFailure)
    document.head.appendChild(script)

    return () => {
      cancelled = true
      script.removeEventListener("load", handleReady)
      script.removeEventListener("error", handleFailure)
    }
  }, [clientId, onError])

  useEffect(() => {
    if (!clientId || !sdkReady || !buttonContainerRef.current) return
    if (!window.google?.accounts?.id) return

    const target = buttonContainerRef.current
    target.innerHTML = ""
    setLocalError(null)

    window.google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: "popup",
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: async (response) => {
        const credential = response.credential?.trim()
        if (!credential) {
          const message = "Google não retornou uma credencial válida."
          setLocalError(message)
          onError?.(message)
          return
        }

        setIsSubmitting(true)
        setLocalError(null)

        try {
          const result = await onCredential(credential)
          if (!result.success) {
            const message = result.error || "Falha ao autenticar com Google."
            setLocalError(message)
            onError?.(message)
          }
        } finally {
          setIsSubmitting(false)
        }
      },
    })

    const width = Math.max(280, Math.min(360, target.clientWidth || 320))
    window.google.accounts.id.renderButton(target, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: mode === "signup" ? "signup_with" : "signin_with",
      shape: "rectangular",
      logo_alignment: "left",
      width,
    })
  }, [clientId, mode, onCredential, onError, sdkReady])

  if (!clientId) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
        Login com Google indisponível. Configure <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={buttonContainerRef}
          className="flex min-h-[44px] w-full items-center justify-center overflow-hidden rounded-xl"
        />
        {(disabled || isSubmitting) ? (
          <div className="absolute inset-0 rounded-xl bg-white/65" />
        ) : null}
      </div>
      {localError ? <p className="text-xs text-red-500">{localError}</p> : null}
    </div>
  )
}
