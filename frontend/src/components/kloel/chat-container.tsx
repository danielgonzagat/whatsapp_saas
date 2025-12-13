"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { HeaderMinimal } from "./header-minimal"
import { InputComposer } from "./input-composer"
import { MessageBubble } from "./message-bubble"
import { QRModal } from "./qr-modal"
import { FooterMinimal } from "./footer-minimal"
import { SettingsDrawer } from "./settings/settings-drawer"
import { TrialPaywallModal } from "./trial-paywall-modal"
import { OnboardingModal } from "./onboarding-modal"
import { PlanActivationSuccessModal } from "./plan-activation-success-modal"
import { AuthModal } from "./auth/auth-modal"
import { useAuth } from "./auth/auth-provider"
import { kloelApi, whatsappApi, billingApi, tokenStorage } from "@/lib/api"
import { apiUrl } from "@/lib/http"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
  eventType?: "tool_call" | "tool_result"
  meta?: Record<string, any>
}

export interface ChatContainerProps {
  initialOpenSettings?: boolean
  initialSettingsTab?: "account" | "billing" | "brain" | "activity"
  initialScrollToCreditCard?: boolean
}

export function ChatContainer({
  initialOpenSettings = false,
  initialSettingsTab = "account",
  initialScrollToCreditCard = false,
}: ChatContainerProps) {
  const {
    isAuthenticated,
    justSignedUp,
    hasCompletedOnboarding,
    completeOnboarding,
    dismissOnboardingForSession,
    authModalOpen,
    authModalMode,
    openAuthModal,
    closeAuthModal,
    subscription,
    refreshSubscription,
  } = useAuth()

  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isWhatsAppConnected, setIsWhatsAppConnected] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Use subscription from auth context
  const subscriptionStatus = subscription?.status || "none"
  const trialDaysLeft = subscription?.trialDaysLeft || 0
  const creditsBalance = subscription?.creditsBalance || 0
  const [hasCard, setHasCard] = useState(false)

  const refreshHasCard = useCallback(async () => {
    if (!isAuthenticated) {
      setHasCard(false)
      return
    }

    try {
      const res = await billingApi.getPaymentMethods()
      const methods = (res.data as any)?.paymentMethods || []
      setHasCard(methods.length > 0)
    } catch {
      setHasCard(false)
    }
  }, [isAuthenticated])

  const [showPaywallModal, setShowPaywallModal] = useState(false)
  const [paywallVariant, setPaywallVariant] = useState<"activate" | "renew">("activate")

  const [settingsInitialTab, setSettingsInitialTab] = useState<"account" | "billing" | "brain" | "activity">(initialSettingsTab)
  const [scrollToCreditCard, setScrollToCreditCard] = useState(initialScrollToCreditCard)

  const appliedInitialDeepLink = useRef(false)

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showActivationSuccess, setShowActivationSuccess] = useState(false)

  const [guestSessionId, setGuestSessionId] = useState<string | null>(null)

  useEffect(() => {
    const storageKey = "kloel_guest_session"
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      setGuestSessionId(stored)
      return
    }
    const newSession = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    localStorage.setItem(storageKey, newSession)
    setGuestSessionId(newSession)
  }, [])

  // Check WhatsApp connection status on mount
  useEffect(() => {
    if (isAuthenticated) {
      checkWhatsAppStatus()
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      refreshHasCard()
    }
  }, [isAuthenticated, refreshHasCard])

  useEffect(() => {
    if (showSettings && isAuthenticated) {
      refreshHasCard()
    }
  }, [showSettings, isAuthenticated, refreshHasCard])

  const checkWhatsAppStatus = useCallback(async () => {
    try {
      const res = await whatsappApi.getStatus()
      if (res.data?.connected) {
        setIsWhatsAppConnected(true)
      }
    } catch {
      // Ignore errors
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && justSignedUp && !hasCompletedOnboarding) {
      const timer = setTimeout(() => setShowOnboarding(true), 500)
      return () => clearTimeout(timer)
    }
  }, [isAuthenticated, justSignedUp, hasCompletedOnboarding])

  useEffect(() => {
    if (appliedInitialDeepLink.current) return
    if (!initialOpenSettings) {
      appliedInitialDeepLink.current = true
      return
    }
    if (!isAuthenticated) return

    setSettingsInitialTab(initialSettingsTab)
    setScrollToCreditCard(initialScrollToCreditCard)
    setShowSettings(true)
    appliedInitialDeepLink.current = true
  }, [
    initialOpenSettings,
    initialSettingsTab,
    initialScrollToCreditCard,
    isAuthenticated,
  ])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const buildToolResultText = (result: any) => {
    if (!result || typeof result !== "object") {
      return "✅ Ferramenta concluída"
    }

    // Smart payment
    const paymentId = (result as any).paymentId || (result as any).id
    const paymentUrl = (result as any).paymentUrl
    const billingType = (result as any).billingType
    const suggestedMessage = (result as any).suggestedMessage

    if (paymentId && (paymentUrl || billingType || suggestedMessage)) {
      const lines: string[] = []
      lines.push("✅ Link de pagamento criado")
      if (billingType) lines.push(`Método: ${billingType}`)
      if (paymentUrl) lines.push(`Link: ${paymentUrl}`)
      lines.push(`Página pública: /pay/${paymentId}`)
      if (suggestedMessage) {
        lines.push("")
        lines.push("Mensagem sugerida:")
        lines.push(String(suggestedMessage))
      }
      return lines.join("\n")
    }

    // Campaign
    const campaign = (result as any).campaign
    if (campaign?.id && (campaign?.name || campaign?.estimatedRecipients != null)) {
      const lines: string[] = []
      lines.push("✅ Campanha criada")
      if (campaign.name) lines.push(`Nome: ${campaign.name}`)
      if (campaign.estimatedRecipients != null) lines.push(`Destinatários estimados: ${campaign.estimatedRecipients}`)
      lines.push(`Abrir: /campaigns`)
      return lines.join("\n")
    }

    // Flow
    const flow = (result as any).flow
    if (flow?.id && flow?.name) {
      return `✅ Flow criado\nNome: ${flow.name}\nAbrir: /flow?id=${encodeURIComponent(flow.id)}`
    }

    // Generic
    try {
      return `✅ Resultado:\n${JSON.stringify(result, null, 2)}`
    } catch {
      return "✅ Ferramenta concluída"
    }
  }

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsTyping(true)

    // Create placeholder for assistant response
    const assistantId = (Date.now() + 1).toString()
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", isStreaming: true },
    ])

    const workspaceId = tokenStorage.getWorkspaceId()
    const canUseAuthedChat = isAuthenticated && !!workspaceId

    if (!canUseAuthedChat) {
      try {
        const response = await fetch(apiUrl("/chat/guest"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "X-Session-Id": guestSessionId || "",
          },
          body: JSON.stringify({ message: content.trim(), sessionId: guestSessionId }),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error("Stream not available")
        }

        const decoder = new TextDecoder()
        let fullContent = ""
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6)
            if (data === "[DONE]") continue

            try {
              const parsed = JSON.parse(data)
              const chunk = parsed.content ?? parsed.chunk
              if (chunk) {
                fullContent += chunk
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m)))
              }
            } catch {
              // ignore
            }
          }
        }

        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)))
        setIsTyping(false)
        return
      } catch (error) {
        console.error("Guest chat error:", error)

        try {
          const syncResponse = await fetch(apiUrl("/chat/guest/sync"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Session-Id": guestSessionId || "",
            },
            body: JSON.stringify({ message: content.trim(), sessionId: guestSessionId }),
          })

          if (syncResponse.ok) {
            const data = await syncResponse.json()
            const reply = data.reply ?? data.response ?? "Sem resposta"
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: reply, isStreaming: false } : m)))
            setIsTyping(false)
            return
          }
        } catch {
          // ignore
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: "Desculpe, estou com dificuldades no momento. Tente novamente em alguns segundos.",
                  isStreaming: false,
                }
              : m,
          ),
        )
        setIsTyping(false)
        return
      }
    }

    // Autenticado: usa /kloel/think (SSE completo com tool_call/tool_result)
    try {
      const token = tokenStorage.getToken()
      const response = await fetch(apiUrl("/kloel/think"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: content.trim() }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("Stream not available")
      }

      const decoder = new TextDecoder()
      let fullContent = ""
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6)
          if (data === "[DONE]") continue

          try {
            const parsed = JSON.parse(data)

            if (parsed.type === "tool_call") {
              const toolName = parsed.tool || parsed.name || "ferramenta"
              setMessages((prev) => [
                ...prev,
                {
                  id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  role: "assistant",
                  content: `🔧 Executando ${toolName}...`,
                  eventType: "tool_call",
                  meta: { name: toolName, args: parsed.args },
                },
              ])
              continue
            }

            if (parsed.type === "tool_result") {
              const resultText = buildToolResultText(parsed.result)
              setMessages((prev) => [
                ...prev,
                {
                  id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  role: "assistant",
                  content: resultText,
                  eventType: "tool_result",
                  meta: parsed.result,
                },
              ])
              continue
            }

            const chunk = parsed.content ?? parsed.chunk
            if (chunk) {
              fullContent += String(chunk)
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m)))
            }

            if (parsed.done) {
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)))
              setIsTyping(false)
            }
          } catch {
            // ignore
          }
        }
      }

      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)))
      setIsTyping(false)
    } catch (error: any) {
      // fallback para endpoint legado (mantém compatibilidade)
      await kloelApi.chat(
        content,
        (chunk) => {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)))
        },
        () => {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)))
          setIsTyping(false)
        },
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: `Desculpe, ocorreu um erro: ${errMsg}`, isStreaming: false } : m)),
          )
          setIsTyping(false)
        },
      )
    }
  }

  const handleWhatsAppConnect = () => {
    if (!isAuthenticated) {
      openAuthModal("signup")
      return
    }

    const hasActiveSubscription = subscriptionStatus === "trial" || subscriptionStatus === "active"

    if (!hasActiveSubscription || !hasCard) {
      if (subscriptionStatus === "expired") {
        setPaywallVariant("renew")
      } else {
        setPaywallVariant("activate")
      }
      setShowPaywallModal(true)
    } else {
      setShowQRModal(true)
    }
  }

  const handlePaywallActivate = () => {
    setShowPaywallModal(false)
    setSettingsInitialTab("billing")
    setScrollToCreditCard(!hasCard)
    setShowSettings(true)
  }

  const handleActivateTrial = async () => {
    try {
      await billingApi.activateTrial()
      await refreshSubscription()
      setHasCard(true)
      setShowActivationSuccess(true)
    } catch (err) {
      console.error("Failed to activate trial:", err)
    }
  }

  const handleQRScanned = () => {
    setShowQRModal(false)
    setIsWhatsAppConnected(true)

    const systemMessage: Message = {
      id: Date.now().toString(),
      role: "assistant",
      content: "Conexao concluida! Estou sincronizando suas conversas e iniciando suas vendas.",
    }
    setMessages((prev) => [...prev, systemMessage])
  }

  const handleTeachProducts = () => {
    const teachPrompt = `Kloel, agora irei te ensinar sobre meus produtos e preciso que voce salve todas as respostas dentro da sua memoria permanente:

Quais sao os meus produtos?
O que eu vendo?
Como eu vendo?
O que eu entrego?
Como eu entrego?
Quando eu entrego?
O que eu ofereco?
Como eu ofereco?
Quem sao os meus clientes?
Como sao os meus clientes?
Quais os problemas dos meus clientes?
Qual a idade dos meus clientes?
Qual o genero dos meus clientes?
O que meus clientes esperam de mim?
Quais sao as perguntas que meus clientes sempre me fazem?
Quais sao as respostas para essas perguntas?
Como devo agir para ser o melhor vendedor da sua empresa?
Como devo agir para ser o melhor agente comercial possivel?
O que eu nao posso esquecer jamais?
Como devo agir quando nao tenho respostas?
Como devo me apresentar?
Voce quer que eu me apresente como inteligencia artificial comercial autonoma da sua empresa ou prefere outro modo?

Lembre-se de subir arquivos, fotos, PDFs e tudo que voce possui sobre o seu negocio. Quanto mais informacoes voce enviar, melhor o Kloel ira operar.`

    setInputValue(teachPrompt)
  }

  const handleOpenSettings = () => {
    if (!isAuthenticated) {
      openAuthModal("login")
      return
    }
    setSettingsInitialTab("account")
    setScrollToCreditCard(false)
    setShowSettings(true)
  }

  const handleOpenBrainSettings = () => {
    setSettingsInitialTab("brain")
    setScrollToCreditCard(false)
    setShowSettings(true)
  }

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    completeOnboarding()
  }

  const handleOnboardingClose = () => {
    setShowOnboarding(false)
    dismissOnboardingForSession()
  }

  const hasMessages = messages.length > 0

  return (
    <div className="flex min-h-screen flex-col">
      <HeaderMinimal
        isWhatsAppConnected={isWhatsAppConnected}
        onOpenSettings={handleOpenSettings}
        subscriptionStatus={subscriptionStatus}
        trialDaysLeft={trialDaysLeft}
      />

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-32 pt-20">
        {!hasMessages ? (
          <div className="flex w-full max-w-3xl flex-col items-center">
            <div className="mb-8 text-center">
              <h1 className="mb-3 text-3xl font-semibold tracking-tight text-gray-900 md:text-4xl">
                Como posso ajudar o seu negocio hoje?
              </h1>
              <p className="text-lg text-gray-500">
                Sou o Kloel, seu vendedor pessoal e inteligencia comercial autonoma.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-3xl space-y-6 pb-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isTyping && (
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white">
                  K
                </div>
                <div className="flex items-center gap-1 rounded-2xl bg-gray-100 px-4 py-3">
                  <span
                    className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#F8F8F8] via-[#F8F8F8] to-transparent pb-6 pt-8">
        <div className="mx-auto max-w-3xl px-4">
          <InputComposer
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSendMessage}
            onTeachProducts={handleTeachProducts}
            onConnectWhatsApp={handleWhatsAppConnect}
            showActionButtons={!hasMessages}
          />
          <FooterMinimal />
        </div>
      </div>

      <AuthModal isOpen={authModalOpen} onClose={closeAuthModal} initialMode={authModalMode} />

      <QRModal isOpen={showQRModal} onClose={() => setShowQRModal(false)} onConnected={handleQRScanned} />

      <SettingsDrawer
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        subscriptionStatus={subscriptionStatus}
        trialDaysLeft={trialDaysLeft}
        creditsBalance={creditsBalance}
        hasCard={hasCard}
        onActivateTrial={handleActivateTrial}
        initialTab={settingsInitialTab}
        scrollToCreditCard={scrollToCreditCard}
      />

      <TrialPaywallModal
        isOpen={showPaywallModal}
        onClose={() => setShowPaywallModal(false)}
        onActivateTrial={handlePaywallActivate}
        variant={paywallVariant}
      />

      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
        onClose={handleOnboardingClose}
        onTeachProducts={() => {
          handleTeachProducts()
        }}
        onConnectWhatsApp={handleWhatsAppConnect}
      />

      <PlanActivationSuccessModal
        isOpen={showActivationSuccess}
        onClose={() => setShowActivationSuccess(false)}
        onTestKloel={() => {}}
        onOpenSettings={handleOpenBrainSettings}
        onChatWithKloel={() => {}}
      />
    </div>
  )
}
