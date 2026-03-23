"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type WheelEvent,
} from "react"
import {
  ListChecks,
  Monitor,
  MoreHorizontal,
  MousePointer2,
  Play,
  Square,
  X,
} from "lucide-react"
import {
  authApi,
  buildWhatsAppScreencastWsUrl,
  getWhatsAppProofs,
  getWhatsAppScreencastToken,
  getWhatsAppStatus,
  initiateWhatsAppConnection,
  pauseWhatsAppAgent,
  performWhatsAppViewerAction,
  reconcileWhatsAppSession,
  resolveWorkspaceFromAuthPayload,
  resumeWhatsAppAgent,
  takeoverWhatsAppViewer,
  tokenStorage,
  type WhatsAppConnectionStatus,
  type WhatsAppProofEntry,
} from "@/lib/api"
import { ensureAnonymousSession } from "@/lib/anonymous-session"

interface AgentDesktopTraceEntry {
  id: string
  type: string
  message: string
  timestamp: Date
}

interface AgentDesktopViewerProps {
  isVisible: boolean
  latestThought: string
  isThinking: boolean
  traceEntries: AgentDesktopTraceEntry[]
  autoConnect?: boolean
  onClose: () => void
  onConnectionChange?: (connected: boolean) => void
}

type ViewMode = "desktop" | "activity"

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

export function AgentDesktopViewer({
  isVisible,
  latestThought,
  isThinking,
  traceEntries,
  autoConnect = true,
  onClose,
  onConnectionChange,
}: AgentDesktopViewerProps) {
  const [workspaceId, setWorkspaceId] = useState("")
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null)
  const [proofs, setProofs] = useState<WhatsAppProofEntry[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>("desktop")
  const [menuOpen, setMenuOpen] = useState(false)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [displayedThought, setDisplayedThought] = useState("")

  const imageRef = useRef<HTMLImageElement | null>(null)
  const desktopSurfaceRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectionStateRef = useRef(false)
  const wsRetryCountRef = useRef(0)

  const ensureWorkspaceId = useCallback(async () => {
    const currentWorkspaceId = tokenStorage.getWorkspaceId() || ""
    if (currentWorkspaceId) {
      setWorkspaceId(currentWorkspaceId)
      return currentWorkspaceId
    }

    const token = tokenStorage.getToken()
    if (token) {
      const me = await authApi.getMe()
      const recoveredWorkspaceId =
        resolveWorkspaceFromAuthPayload(me.data)?.id || ""

      if (recoveredWorkspaceId) {
        tokenStorage.setWorkspaceId(recoveredWorkspaceId)
        setWorkspaceId(recoveredWorkspaceId)
        return recoveredWorkspaceId
      }

      throw new Error("Workspace nao carregado.")
    }

    const anonymous = await ensureAnonymousSession()
    setWorkspaceId(anonymous.workspaceId)
    return anonymous.workspaceId
  }, [])

  const refreshStatus = useCallback(async (targetWorkspaceId?: string) => {
    const resolvedWorkspaceId = targetWorkspaceId || workspaceId
    if (!resolvedWorkspaceId) return

    try {
      const nextStatus = await getWhatsAppStatus(resolvedWorkspaceId)
      setStatus(nextStatus)
      setWsError((prev) => (nextStatus.connected ? null : prev))
    } catch (error: any) {
      setWsError(error?.message || "Falha ao carregar o status da sessao.")
    }
  }, [workspaceId])

  const refreshProofs = useCallback(async (targetWorkspaceId?: string) => {
    const resolvedWorkspaceId = targetWorkspaceId || workspaceId
    if (!resolvedWorkspaceId) return

    try {
      const nextProofs = await getWhatsAppProofs(resolvedWorkspaceId, 16)
      setProofs(Array.isArray(nextProofs) ? nextProofs : [])
    } catch {
      // noop
    }
  }, [workspaceId])

  const startSession = useCallback(async () => {
    setWorking(true)
    try {
      const resolvedWorkspaceId = await ensureWorkspaceId()
      const currentStatus = await getWhatsAppStatus(resolvedWorkspaceId)
      setStatus(currentStatus)

      if (!currentStatus.connected && currentStatus.status !== "qr_pending") {
        await initiateWhatsAppConnection(resolvedWorkspaceId)
        await refreshStatus(resolvedWorkspaceId)
      }

      await refreshProofs(resolvedWorkspaceId)
    } catch (error: any) {
      setWsError(error?.message || "Falha ao iniciar a sessao do WhatsApp Web.")
    } finally {
      setWorking(false)
    }
  }, [ensureWorkspaceId, refreshProofs, refreshStatus])

  useEffect(() => {
    if (!isVisible) return
    if (!autoConnect) return
    void startSession()
  }, [autoConnect, isVisible, startSession])

  useEffect(() => {
    if (!isVisible) return
    let cancelled = false

    const load = async () => {
      try {
        const resolvedWorkspaceId = await ensureWorkspaceId()
        if (!cancelled) {
          await refreshStatus(resolvedWorkspaceId)
          await refreshProofs(resolvedWorkspaceId)
        }
      } catch {
        // noop
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [ensureWorkspaceId, isVisible, refreshProofs, refreshStatus])

  useEffect(() => {
    if (!isVisible || !workspaceId) return
    const intervalMs =
      status?.workerAvailable === false
        ? 10000
        : wsConnected
          ? 15000
          : 4000
    const interval = setInterval(() => {
      void refreshStatus(workspaceId)
    }, intervalMs)
    return () => clearInterval(interval)
  }, [isVisible, refreshStatus, status?.workerAvailable, workspaceId, wsConnected])

  useEffect(() => {
    if (!isVisible || !workspaceId) return
    if (status?.workerAvailable === false) return
    const intervalMs = wsConnected ? 12000 : 5000
    const interval = setInterval(() => {
      void refreshProofs(workspaceId)
    }, intervalMs)
    return () => clearInterval(interval)
  }, [isVisible, refreshProofs, status?.workerAvailable, workspaceId, wsConnected])

  useEffect(() => {
    const text = String(latestThought || "").trim()
    if (!text) {
      setDisplayedThought("")
      return
    }

    let index = 0
    setDisplayedThought("")
    const interval = setInterval(() => {
      index += 1
      setDisplayedThought(text.slice(0, index))
      if (index >= text.length) {
        clearInterval(interval)
      }
    }, 14)

    return () => clearInterval(interval)
  }, [latestThought])

  useEffect(() => {
    const connected = Boolean(status?.connected)
    if (connected === connectionStateRef.current) return
    connectionStateRef.current = connected
    onConnectionChange?.(connected)
  }, [onConnectionChange, status?.connected])

  useEffect(() => {
    if (!status?.takeoverActive) return
    desktopSurfaceRef.current?.focus()
  }, [status?.takeoverActive])

  useEffect(() => {
    if (status?.workerAvailable === false) {
      setFrameUrl(null)
    }
  }, [status?.workerAvailable])

  useEffect(() => {
    if (!isVisible || !workspaceId) return
    if (status?.workerAvailable === false) {
      setWsConnected(false)
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      return
    }

    let destroyed = false

    const connect = () => {
      if (destroyed) return
      void (async () => {
        try {
          const streamToken = await getWhatsAppScreencastToken(workspaceId)
          const wsUrl = buildWhatsAppScreencastWsUrl(workspaceId, streamToken.token)
          if (!wsUrl) {
            setWsError("URL do screencast nao configurada.")
            return
          }

          const ws = new WebSocket(wsUrl)
          wsRef.current = ws

          ws.onopen = () => {
            wsRetryCountRef.current = 0
            setWsConnected(true)
            setWsError(null)
          }

          ws.onmessage = (event) => {
            const payload = typeof event.data === "string" ? event.data : ""
            if (!payload) return
            setFrameUrl(`data:image/jpeg;base64,${payload}`)
            setWsError(null)
          }

          ws.onerror = () => {
            setWsConnected(false)
            setWsError("Conexao com a area de trabalho ao vivo indisponivel.")
          }

          ws.onclose = (event) => {
            setWsConnected(false)
            wsRef.current = null

            if (destroyed) return
            if (event.code === 4010) {
              setWsError("Sessao do browser encerrada. Reconecte o WhatsApp.")
              return
            }

            wsRetryCountRef.current += 1
            const nextDelay = Math.min(
              2000 * 2 ** Math.max(0, wsRetryCountRef.current - 1),
              30000,
            )
            if (wsRetryCountRef.current >= 8) {
              setWsError("Nao foi possivel conectar a area de trabalho ao vivo.")
              return
            }

            reconnectTimerRef.current = setTimeout(connect, nextDelay)
          }
        } catch (error: any) {
          setWsConnected(false)
          setWsError(error?.message || "Falha ao autorizar o stream ao vivo.")
          wsRetryCountRef.current += 1
          const nextDelay = Math.min(
            4000 * 2 ** Math.max(0, wsRetryCountRef.current - 1),
            30000,
          )
          if (wsRetryCountRef.current >= 8) {
            return
          }
          reconnectTimerRef.current = setTimeout(connect, nextDelay)
        }
      })()
    }

    connect()

    return () => {
      destroyed = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [isVisible, status?.workerAvailable, workspaceId])

  const hasRealViewport = Boolean(status?.viewport?.width && status?.viewport?.height)
  const showQrFallback = !frameUrl && Boolean(status?.qrCode) && !status?.connected
  const viewport = hasRealViewport
    ? status?.viewport || { width: 1440, height: 900 }
    : { width: 1440, height: 900 }

  const handleViewerAction = useCallback(
    async (action: Record<string, any>) => {
      if (!workspaceId) return
      try {
        await performWhatsAppViewerAction(workspaceId, action)
      } catch (error: any) {
        setWsError(error?.message || "Falha ao enviar acao para o browser.")
      }
    },
    [workspaceId],
  )

  const handleTakeover = useCallback(async () => {
    if (!workspaceId) return
    if (!hasRealViewport) {
      setWsError("Aguarde a sessao carregar antes de assumir o controle.")
      return
    }
    setMenuOpen(false)
    try {
      await takeoverWhatsAppViewer(workspaceId)
      await refreshStatus(workspaceId)
      await refreshProofs(workspaceId)
    } catch (error: any) {
      setWsError(error?.message || "Falha ao assumir o navegador.")
    }
  }, [hasRealViewport, refreshProofs, refreshStatus, workspaceId])

  const handleResumeAgent = useCallback(async () => {
    if (!workspaceId) return
    setMenuOpen(false)
    try {
      await resumeWhatsAppAgent(workspaceId)
      await reconcileWhatsAppSession(workspaceId, "Retomar agente apos takeover.")
      await refreshStatus(workspaceId)
      await refreshProofs(workspaceId)
    } catch (error: any) {
      setWsError(error?.message || "Falha ao devolver o controle ao agente.")
    }
  }, [refreshProofs, refreshStatus, workspaceId])

  const handleInterrupt = useCallback(async () => {
    if (!workspaceId) return
    setMenuOpen(false)
    try {
      await pauseWhatsAppAgent(workspaceId, true)
      await refreshStatus(workspaceId)
      await refreshProofs(workspaceId)
    } catch (error: any) {
      setWsError(error?.message || "Falha ao interromper o agente.")
    }
  }, [refreshProofs, refreshStatus, workspaceId])

  const handleResumeFromPause = useCallback(async () => {
    if (!workspaceId) return
    try {
      await pauseWhatsAppAgent(workspaceId, false)
      await reconcileWhatsAppSession(workspaceId, "Retomar agente apos pausa.")
      await refreshStatus(workspaceId)
      await refreshProofs(workspaceId)
    } catch (error: any) {
      setWsError(error?.message || "Falha ao retomar o agente.")
    }
  }, [refreshProofs, refreshStatus, workspaceId])

  const handleScreenClick = useCallback(
    async (event: MouseEvent<HTMLImageElement>) => {
      if (!status?.takeoverActive || !imageRef.current) return

      const rect = imageRef.current.getBoundingClientRect()
      const x = Math.round(((event.clientX - rect.left) / rect.width) * viewport.width)
      const y = Math.round(((event.clientY - rect.top) / rect.height) * viewport.height)

      await handleViewerAction({
        type: "click",
        x: Math.max(0, x),
        y: Math.max(0, y),
      })
    },
    [handleViewerAction, status?.takeoverActive, viewport.height, viewport.width],
  )

  const handleWheelCapture = useCallback(
    async (event: WheelEvent<HTMLDivElement>) => {
      if (!status?.takeoverActive) return
      event.preventDefault()
      await handleViewerAction({
        type: "scroll",
        deltaY: event.deltaY,
      })
    },
    [handleViewerAction, status?.takeoverActive],
  )

  const handleKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLDivElement>) => {
      if (!status?.takeoverActive) return

      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        await handleViewerAction({
          type: "type",
          text: event.key,
        })
        return
      }

      const allowedKeys = [
        "Enter",
        "Backspace",
        "Escape",
        "Tab",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ]
      if (allowedKeys.includes(event.key)) {
        event.preventDefault()
        await handleViewerAction({
          type: "keypress",
          key: event.key,
        })
      }
    },
    [handleViewerAction, status?.takeoverActive],
  )

  const desktopStatusLine = useMemo(() => {
    if (working) return "Configurando a area de trabalho do WhatsApp Web."
    if (status?.workerAvailable === false) {
      return status?.qrCode
        ? "Worker indisponivel. Exibindo QR Code em modo degradado."
        : "Worker/browser runtime temporariamente indisponivel."
    }
    if (status?.connected) {
      return `${status.pushName || "Sessao conectada"}${status.phone ? ` · ${status.phone}` : ""}`
    }
    if (status?.status === "qr_pending") {
      return "Aguardando leitura do QR Code do WhatsApp Web."
    }
    return "Sessao do browser iniciando ou desconectada."
  }, [status?.connected, status?.phone, status?.pushName, status?.status, working])

  if (!isVisible) return null

  return (
    <div className="w-full max-w-5xl">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            <span>Desktop do agente</span>
            {wsConnected ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Ao vivo
              </span>
            ) : status?.workerAvailable === false ? (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Modo degradado
              </span>
            ) : null}
          </div>
          <p className="text-[15px] font-medium leading-relaxed text-gray-900">
            {displayedThought || latestThought || desktopStatusLine}
            {isThinking ? (
              <span className="ml-2 inline-flex gap-1 align-middle">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="inline-block h-1 w-1 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: `${dot * 150}ms` }}
                  />
                ))}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-gray-500">{desktopStatusLine}</p>
        </div>

        <div className="relative flex items-center gap-2">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-gray-600 shadow-sm transition hover:bg-gray-50"
            aria-label="Abrir menu do desktop"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-gray-600 shadow-sm transition hover:bg-gray-50"
            aria-label="Fechar desktop do agente"
          >
            <X className="h-4 w-4" />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
              <button
                onClick={() => {
                  setViewMode((prev) => (prev === "desktop" ? "activity" : "desktop"))
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-800 transition hover:bg-gray-50"
              >
                {viewMode === "desktop" ? <ListChecks className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                {viewMode === "desktop" ? "Atividade" : "Exibir como area de trabalho"}
              </button>
              <button
                onClick={status?.takeoverActive ? handleResumeAgent : handleTakeover}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-800 transition hover:bg-gray-50"
              >
                <MousePointer2 className="h-4 w-4" />
                {status?.takeoverActive
                  ? "Devolver controle ao agente"
                  : "Assumir controle do navegador"}
              </button>
              <button
                onClick={status?.agentPaused ? handleResumeFromPause : handleInterrupt}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-800 transition hover:bg-gray-50"
              >
                {status?.agentPaused ? <Play className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {status?.agentPaused ? "Retomar" : "Interromper"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {viewMode === "activity" ? (
        <div className="rounded-[28px] border border-gray-200 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
              Atividade
            </h3>
            <span className="text-xs text-gray-400">
              {proofs.length} provas · {traceEntries.length} eventos
            </span>
          </div>

          <div className="space-y-3">
            {traceEntries.slice().reverse().slice(0, 24).map((entry) => (
              <div key={entry.id} className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-gray-400">
                  <span>{entry.type}</span>
                  <span>{formatTimestamp(entry.timestamp.toISOString())}</span>
                </div>
                <p className="text-sm leading-relaxed text-gray-800">{entry.message}</p>
              </div>
            ))}

            {proofs.slice(0, 12).map((proof) => (
              <div key={proof.id} className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-gray-400">
                  <span>{proof.kind}</span>
                  <span>{formatTimestamp(proof.createdAt)}</span>
                </div>
                <p className="text-sm leading-relaxed text-gray-800">{proof.summary}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-[28px] border border-blue-200/50 bg-[#0A0A0A] shadow-[0_0_24px_rgba(59,130,246,0.16),0_0_72px_rgba(59,130,246,0.08)]"
          onWheel={handleWheelCapture}
        >
          <div className="relative">
            <div
              ref={desktopSurfaceRef}
              className="relative outline-none"
              onKeyDown={handleKeyDown}
              tabIndex={status?.takeoverActive ? 0 : -1}
            >
              {frameUrl ? (
                <img
                  ref={imageRef}
                  src={frameUrl}
                  alt="WhatsApp Web ao vivo"
                  className="w-full select-none"
                  style={{
                    aspectRatio: `${viewport.width}/${viewport.height}`,
                    objectFit: "contain",
                    cursor: status?.takeoverActive ? "crosshair" : "default",
                  }}
                  draggable={false}
                  onClick={handleScreenClick}
                />
              ) : showQrFallback ? (
                <div
                  className="flex items-center justify-center bg-[#050505]"
                  style={{ aspectRatio: `${viewport.width}/${viewport.height}` }}
                >
                  <div className="flex max-w-md flex-col items-center gap-4 p-8 text-center">
                    <img
                      src={status?.qrCode || ""}
                      alt="QR Code do WhatsApp Web"
                      className="w-full max-w-[320px] rounded-3xl bg-white p-4 shadow-2xl"
                    />
                    <p className="text-sm text-gray-300">
                      {status?.workerAvailable === false
                        ? "QR de fallback carregado sem stream ao vivo."
                        : "Aguardando leitura do QR Code do WhatsApp Web."}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center"
                  style={{ aspectRatio: `${viewport.width}/${viewport.height}` }}
                >
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" />
                    <p className="text-sm text-gray-300">
                      {wsError || "Conectando ao stream ao vivo do navegador..."}
                    </p>
                  </div>
                </div>
              )}

              {status?.takeoverActive ? (
                <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-blue-500/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
                  Controle humano ativo. Clique e use o teclado para operar o browser.
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-gray-300">
            <div className="flex items-center gap-3">
              <span>Ultima observacao: {formatTimestamp(status?.lastObservationAt)}</span>
              <span>Ultima acao: {formatTimestamp(status?.lastActionAt)}</span>
            </div>
            <div className="flex items-center gap-2 uppercase tracking-[0.18em] text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{wsConnected ? "Ao vivo" : "Reconectando"}</span>
            </div>
          </div>
        </div>
      )}

      {wsError ? (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {wsError}
        </div>
      ) : null}

      {(status?.agentPaused || status?.takeoverActive) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {status?.takeoverActive ? (
            <button
              onClick={handleResumeAgent}
              className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              Devolver ao agente
            </button>
          ) : null}
          {status?.agentPaused ? (
            <button
              onClick={handleResumeFromPause}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Retomar agente
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
