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
import { kloelApi, whatsappApi, billingApi } from "@/lib/api"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
}

export function ChatContainer() {
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

  const [showPaywallModal, setShowPaywallModal] = useState(false)
  const [paywallVariant, setPaywallVariant] = useState<"activate" | "renew">("activate")

  const [settingsInitialTab, setSettingsInitialTab] = useState<"account" | "billing" | "brain" | "activity">("account")
  const [scrollToCreditCard, setScrollToCreditCard] = useState(false)

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showActivationSuccess, setShowActivationSuccess] = useState(false)

  // Check WhatsApp connection status on mount
  useEffect(() => {
    if (isAuthenticated) {
      checkWhatsAppStatus()
    }
  }, [isAuthenticated])

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

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

    // Use real API with streaming
    await kloelApi.chat(
      content,
      // onChunk
      (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + chunk }
              : m
          )
        )
      },
      // onDone
      () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, isStreaming: false }
              : m
          )
        )
        setIsTyping(false)
      },
      // onError
      (error) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Desculpe, ocorreu um erro: ${error}`, isStreaming: false }
              : m
          )
        )
        setIsTyping(false)
      }
    )
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
