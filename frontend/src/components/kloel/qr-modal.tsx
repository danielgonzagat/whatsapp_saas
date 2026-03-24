"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Keyboard,
  MousePointer2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  authApi,
  getWhatsAppProofs,
  getWhatsAppQR,
  getWhatsAppStatus,
  getWhatsAppViewer,
  initiateWhatsAppConnection,
  logoutWhatsApp,
  pauseWhatsAppAgent,
  performWhatsAppViewerAction,
  reconcileWhatsAppSession,
  resolveWorkspaceFromAuthPayload,
  resumeWhatsAppAgent,
  takeoverWhatsAppViewer,
  tokenStorage,
  type WhatsAppProofEntry,
} from "@/lib/api"
import { ensureAnonymousSession } from "@/lib/anonymous-session"

interface QRModalProps {
  isOpen: boolean
  onClose: () => void
  onConnected: () => void
}

type ConnectionState = "loading" | "qr" | "connecting" | "connected" | "error"

function formatTimestamp(value?: string | null) {
  if (!value) return "nunca"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "nunca"
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function QRModal({ isOpen, onClose, onConnected }: QRModalProps) {
  const [state, setState] = useState<ConnectionState>("loading")
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [viewerImage, setViewerImage] = useState<string | null>(null)
  const [takeoverActive, setTakeoverActive] = useState(false)
  const [agentPaused, setAgentPaused] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [manualText, setManualText] = useState("")
  const [observationSummary, setObservationSummary] = useState<string | null>(null)
  const [lastObservationAt, setLastObservationAt] = useState<string | null>(null)
  const [lastActionAt, setLastActionAt] = useState<string | null>(null)
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [proofs, setProofs] = useState<WhatsAppProofEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pollCount, setPollCount] = useState(0)
  const [working, setWorking] = useState(false)
  const viewerRef = useRef<HTMLImageElement | null>(null)

  const resolveWorkspaceId = useCallback(() => {
    return tokenStorage.getWorkspaceId() || ""
  }, [])

  const ensureWorkspaceId = useCallback(async () => {
    const currentWorkspaceId = resolveWorkspaceId()
    if (currentWorkspaceId) {
      return currentWorkspaceId
    }

    const token = tokenStorage.getToken()
    if (token) {
      const me = await authApi.getMe()
      const recoveredWorkspaceId =
        resolveWorkspaceFromAuthPayload(me.data)?.id || ""

      if (recoveredWorkspaceId) {
        tokenStorage.setWorkspaceId(recoveredWorkspaceId)
        return recoveredWorkspaceId
      }

      throw new Error("Workspace nao carregado.")
    }

    const anonymous = await ensureAnonymousSession()
    return anonymous.workspaceId
  }, [resolveWorkspaceId])

  const refreshViewer = useCallback(async () => {
    const workspaceId = resolveWorkspaceId()
    if (!workspaceId) return

    try {
      const [view, proofList] = await Promise.all([
        getWhatsAppViewer(workspaceId),
        getWhatsAppProofs(workspaceId, 10).catch(() => []),
      ])
      const snapshot = view?.snapshot || {}
      setViewerImage(view?.image || snapshot?.screenshotDataUrl || null)
      setTakeoverActive(Boolean(snapshot?.takeoverActive))
      setAgentPaused(Boolean(snapshot?.agentPaused))
      setViewport(snapshot?.viewport || { width: 0, height: 0 })
      setObservationSummary(snapshot?.observationSummary || null)
      setLastObservationAt(snapshot?.lastObservationAt || null)
      setLastActionAt(snapshot?.lastActionAt || null)
      setActiveProvider(snapshot?.activeProvider || null)
      setProofs(Array.isArray(proofList) ? proofList : [])

      if (snapshot?.connected && state !== "connected") {
        setState("connecting")
        await new Promise((resolve) => setTimeout(resolve, 800))
        setState("connected")
        setTimeout(onConnected, 1200)
      }
    } catch {
      // ignore viewer refresh errors
    }
  }, [onConnected, resolveWorkspaceId, state])

  const fetchQrCode = useCallback(async function fetchQrCodeImpl() {
    let workspaceId = ""
    try {
      workspaceId = await ensureWorkspaceId()
    } catch (err: any) {
      setError(err?.message || "Workspace nao carregado.")
      setState("error")
      return
    }

    try {
      const qrRes = await getWhatsAppQR(workspaceId)

      if (qrRes.connected) {
        setState("connected")
        setTimeout(onConnected, 1500)
        return
      }

      if (qrRes.qrCode) {
        setError(null)
        setQrCode(qrRes.qrCode)
        setState("qr")
        await refreshViewer()
      } else {
        const statusRes = await getWhatsAppStatus(workspaceId)
        if (statusRes.connected) {
          setState("connected")
          setTimeout(onConnected, 1500)
        } else {
          await new Promise((r) => setTimeout(r, 2000))
          await fetchQrCodeImpl()
        }
      }
    } catch (err: any) {
      setError(err.message || "Falha ao obter QR Code")
      setState("error")
    }
  }, [ensureWorkspaceId, onConnected, refreshViewer])

  const startSession = useCallback(async () => {
    setState("loading")
    setError(null)

    let workspaceId = ""
    try {
      workspaceId = await ensureWorkspaceId()
    } catch (err: any) {
      setError(err?.message || "Workspace nao carregado.")
      setState("error")
      return
    }

    try {
      const statusRes = await getWhatsAppStatus(workspaceId)
      if (statusRes.connected) {
        setState("connected")
        await refreshViewer()
        setTimeout(onConnected, 1500)
        return
      }

      if (statusRes.status === "qr_pending") {
        setQrCode(statusRes.qrCode || null)
        setState("qr")
        await refreshViewer()
        return
      }

      const startRes = await initiateWhatsAppConnection(workspaceId)
      if (startRes.error || startRes.status === "error") {
        setError(startRes.message || "Falha ao iniciar sessao")
        setState("error")
        return
      }

      if (startRes.status === "already_connected") {
        setState("connected")
        await refreshViewer()
        setTimeout(onConnected, 1500)
        return
      }

      if (startRes.status === "qr_ready" && (startRes.qrCode || startRes.qrCodeImage)) {
        setQrCode(startRes.qrCode || startRes.qrCodeImage || null)
        setState("qr")
        await refreshViewer()
        return
      }

      await new Promise((r) => setTimeout(r, 1000))
      await fetchQrCode()
    } catch (err: any) {
      setError(err.message || "Falha ao iniciar sessao")
      setState("error")
    }
  }, [ensureWorkspaceId, fetchQrCode, onConnected, refreshViewer])

  const resetSession = useCallback(async () => {
    setState("loading")
    setError(null)
    setQrCode(null)
    setViewerImage(null)
    setProofs([])

    let workspaceId = ""
    try {
      workspaceId = await ensureWorkspaceId()
    } catch (err: any) {
      setError(err?.message || "Workspace nao carregado.")
      setState("error")
      return
    }

    try {
      await logoutWhatsApp(workspaceId)
      await new Promise((r) => setTimeout(r, 750))
      await startSession()
    } catch (err: any) {
      setError(err.message || "Falha ao resetar sessao")
      setState("error")
    }
  }, [ensureWorkspaceId, startSession])

  const pollStatus = useCallback(async () => {
    if (state !== "qr" && state !== "connected" && state !== "connecting") return

    const workspaceId = resolveWorkspaceId()
    if (!workspaceId) return

    try {
      const statusRes = await getWhatsAppStatus(workspaceId)
      if (statusRes.connected) {
        setState("connected")
        setTakeoverActive(Boolean(statusRes.takeoverActive))
        setAgentPaused(Boolean(statusRes.agentPaused))
        setObservationSummary(statusRes.observationSummary || null)
        setLastObservationAt(statusRes.lastObservationAt || null)
        setLastActionAt(statusRes.lastActionAt || null)
        setActiveProvider(statusRes.activeProvider || null)
        setTimeout(onConnected, 1200)
      } else if (statusRes.status === "qr_pending") {
        setState("qr")
        setQrCode(statusRes.qrCode || qrCode)
      }

      await refreshViewer()

      if (!statusRes.connected && pollCount > 0 && pollCount % 15 === 0) {
        await fetchQrCode()
      }
    } catch {
      // ignore polling errors
    }
  }, [fetchQrCode, onConnected, pollCount, qrCode, refreshViewer, resolveWorkspaceId, state])

  const handleViewerClick = useCallback(
    async (event: MouseEvent<HTMLImageElement>) => {
      if (!takeoverActive || !viewerRef.current || !viewport.width || !viewport.height) {
        return
      }

      const rect = viewerRef.current.getBoundingClientRect()
      const scaleX = viewport.width / rect.width
      const scaleY = viewport.height / rect.height
      const x = Math.round((event.clientX - rect.left) * scaleX)
      const y = Math.round((event.clientY - rect.top) * scaleY)

      const workspaceId = resolveWorkspaceId()
      if (!workspaceId) return

      await performWhatsAppViewerAction(workspaceId, {
        type: "click",
        x,
        y,
      })
      await refreshViewer()
    },
    [refreshViewer, resolveWorkspaceId, takeoverActive, viewport.height, viewport.width],
  )

  const handleSendManualText = useCallback(async () => {
    const workspaceId = resolveWorkspaceId()
    if (!workspaceId || !manualText.trim()) return

    await performWhatsAppViewerAction(workspaceId, {
      type: "type",
      text: manualText,
    })
    await performWhatsAppViewerAction(workspaceId, {
      type: "keypress",
      key: "Enter",
    })
    setManualText("")
    await refreshViewer()
  }, [manualText, refreshViewer, resolveWorkspaceId])

  const handleTakeoverToggle = useCallback(async () => {
    const workspaceId = resolveWorkspaceId()
    if (!workspaceId) return

    setWorking(true)
    try {
      if (takeoverActive) {
        await resumeWhatsAppAgent(workspaceId)
        setTakeoverActive(false)
        setAgentPaused(false)
      } else {
        await takeoverWhatsAppViewer(workspaceId)
        setTakeoverActive(true)
        setAgentPaused(true)
      }
      await refreshViewer()
    } finally {
      setWorking(false)
    }
  }, [refreshViewer, resolveWorkspaceId, takeoverActive])

  const handlePauseToggle = useCallback(async () => {
    const workspaceId = resolveWorkspaceId()
    if (!workspaceId) return

    setWorking(true)
    try {
      await pauseWhatsAppAgent(workspaceId, !agentPaused)
      setAgentPaused((current) => !current)
      await refreshViewer()
    } finally {
      setWorking(false)
    }
  }, [agentPaused, refreshViewer, resolveWorkspaceId])

  const handleReconcile = useCallback(async () => {
    const workspaceId = resolveWorkspaceId()
    if (!workspaceId) return

    setWorking(true)
    try {
      const result = await reconcileWhatsAppSession(workspaceId, "refresh_whatsapp_web_state")
      if (result?.observation?.summary) {
        setObservationSummary(result.observation.summary)
      }
      await refreshViewer()
    } finally {
      setWorking(false)
    }
  }, [refreshViewer, resolveWorkspaceId])

  useEffect(() => {
    if (isOpen) {
      void startSession()
      setPollCount(0)
    } else {
      setState("loading")
      setQrCode(null)
      setViewerImage(null)
      setError(null)
      setTakeoverActive(false)
      setAgentPaused(false)
      setObservationSummary(null)
      setLastObservationAt(null)
      setLastActionAt(null)
      setActiveProvider(null)
      setProofs([])
      setManualText("")
    }
  }, [isOpen, startSession])

  useEffect(() => {
    if (!isOpen) return

    const interval = setInterval(() => {
      setPollCount((c) => c + 1)
      void pollStatus()
    }, 2000)

    return () => clearInterval(interval)
  }, [isOpen, pollStatus])

  const viewerSrc = viewerImage || qrCode

  const statusPill = useMemo(() => {
    if (state === "connected") return "Conectado"
    if (state === "qr") return "Aguardando QR"
    if (state === "error") return "Falha"
    return "Sincronizando"
  }, [state])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-6xl rounded-md bg-white p-6 shadow-2xl">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute right-4 top-4 h-8 w-8 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="grid gap-6 xl:grid-cols-[320px_1fr_320px]">
          <div className="flex flex-col justify-between">
            <div>
              <h2 className="mb-2 text-xl font-semibold text-gray-900">Conectar WhatsApp</h2>
              <p className="mb-6 text-sm text-gray-500">
                QR real, viewer vivo e trilha operacional do agente dentro do Kloel
              </p>

              <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                {state === "loading" && "Iniciando sessao do browser..."}
                {state === "qr" && "Escaneie o QR Code na tela ao lado com o seu celular."}
                {state === "connecting" && "Conectando a sessao escaneada..."}
                {state === "connected" && "Sessao conectada. O agente ja pode operar."}
                {state === "error" && (error || "Erro ao conectar")}
              </div>

              <div className="space-y-2 text-sm text-gray-500">
                <p>1. Abra o WhatsApp no celular</p>
                <p>2. Entre em Aparelhos conectados</p>
                <p>3. Escaneie o QR exibido na tela real</p>
                <p>4. Use takeover se quiser assumir mouse e teclado</p>
              </div>

              <div className="mt-5 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Estado do agente</span>
                  <span className="font-medium">{agentPaused ? "Pausado" : "Ativo"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Takeover</span>
                  <span className="font-medium">{takeoverActive ? "Humano" : "Agente"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Motor visual</span>
                  <span className="font-medium uppercase">{activeProvider || "local"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Ultima observacao</span>
                  <span className="font-medium">{formatTimestamp(lastObservationAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Ultima acao</span>
                  <span className="font-medium">{formatTimestamp(lastActionAt)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={working} onClick={() => void fetchQrCode()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
              <Button variant="outline" size="sm" disabled={working} onClick={() => void handleReconcile()}>
                <ScanSearch className="mr-2 h-4 w-4" />
                Reconciliar
              </Button>
              <Button variant="outline" size="sm" disabled={working} onClick={() => void resetSession()}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Resetar
              </Button>
              <Button variant={agentPaused ? "default" : "outline"} size="sm" disabled={working} onClick={() => void handlePauseToggle()}>
                {agentPaused ? (
                  <PlayCircle className="mr-2 h-4 w-4" />
                ) : (
                  <PauseCircle className="mr-2 h-4 w-4" />
                )}
                {agentPaused ? "Retomar agente" : "Pausar agente"}
              </Button>
              <Button variant={takeoverActive ? "default" : "outline"} size="sm" disabled={working} onClick={() => void handleTakeoverToggle()}>
                <MousePointer2 className="mr-2 h-4 w-4" />
                {takeoverActive ? "Devolver ao agente" : "Assumir controle"}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-md border border-gray-200 bg-black">
              {!viewerSrc && (
                <div className="flex h-[520px] items-center justify-center text-sm text-white/70">
                  {state === "error" ? (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      <span>{error || "Falha ao carregar a sessao."}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      <span>Carregando a tela do WhatsApp Web...</span>
                    </div>
                  )}
                </div>
              )}

              {viewerSrc && (
                <img
                  ref={viewerRef}
                  src={viewerSrc}
                  alt="WhatsApp Web session"
                  className={`h-[520px] w-full object-contain ${takeoverActive ? "cursor-crosshair" : "cursor-default"}`}
                  onClick={(event) => void handleViewerClick(event)}
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                {state === "connected" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <RefreshCw className="h-4 w-4 animate-spin text-gray-500" />
                )}
                <span>{statusPill}</span>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                <Keyboard className="h-4 w-4 text-gray-500" />
                <span>{takeoverActive ? "Takeover ativo" : agentPaused ? "Agente pausado" : "Agente ativo"}</span>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                <ShieldCheck className="h-4 w-4 text-gray-500" />
                <span>{proofs.length} provas recentes</span>
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Ultima leitura do agente
              </div>
              <p className="leading-6 text-gray-700">
                {observationSummary || "Ainda sem observacao consolidada da interface."}
              </p>
            </div>

            {takeoverActive && (
              <div className="flex gap-2">
                <input
                  value={manualText}
                  onChange={(event) => setManualText(event.target.value)}
                  placeholder="Digitar no WhatsApp durante takeover"
                  className="flex-1 rounded-md border border-gray-200 px-4 py-2 text-sm outline-none ring-0"
                />
                <Button onClick={() => void handleSendManualText()}>Enviar</Button>
              </div>
            )}
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Timeline operacional
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Provas do que o agente observou, reconciliou e executou na sessao.
              </p>
            </div>

            <div className="space-y-3">
              {proofs.length === 0 && (
                <div className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
                  As provas vao aparecer aqui conforme o agente observa e atua.
                </div>
              )}

              {proofs.map((proof) => (
                <div key={proof.id} className="rounded-md border border-gray-200 bg-white p-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                      {proof.kind}
                    </span>
                    <span className="text-xs text-gray-400">{formatTimestamp(proof.createdAt)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-800">{proof.summary}</p>
                  {proof.observation?.summary ? (
                    <p className="mt-2 text-xs leading-5 text-gray-500">{proof.observation.summary}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
