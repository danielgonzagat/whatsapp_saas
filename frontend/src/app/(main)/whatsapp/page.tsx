"use client"

export const dynamic = 'force-dynamic';

import { useState, useCallback, useRef, useEffect } from "react"
import { AgentDesktopViewer } from "@/components/kloel/AgentDesktopViewer"
import { tokenStorage } from "@/lib/api"
import type { AgentCursorTarget } from "@/components/kloel/AgentCursor"
import {
  getWhatsAppSessionDiagnostics,
  forceWhatsAppSessionCheck,
  forceWhatsAppReconnect,
  repairWhatsAppSessionConfig,
  recreateWhatsAppSessionIfInvalid,
  getWhatsAppProviderStatus,
} from "@/lib/api/whatsapp"

interface AgentStreamEvent {
  type: string
  workspaceId?: string
  phase?: string
  message: string
  ts?: string
  streaming?: boolean
  meta?: Record<string, any>
  runId?: string
}

interface AgentTraceEntry {
  id: string
  type: string
  phase?: string
  message: string
  timestamp: Date
}

export default function WhatsAppPage() {
  const [isThinking, setIsThinking] = useState(false)
  const [latestThought, setLatestThought] = useState("")
  const [traceEntries, setTraceEntries] = useState<AgentTraceEntry[]>([])
  const [cursorTarget, setCursorTarget] = useState<AgentCursorTarget | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [streamEnabled, setStreamEnabled] = useState(false)
  const thoughtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Session management state
  const [diagnostics, setDiagnostics] = useState<Record<string, any> | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [sessionActionMsg, setSessionActionMsg] = useState<string | null>(null)
  const [showDiagPanel, setShowDiagPanel] = useState(false)

  const workspaceId = tokenStorage.getWorkspaceId() ?? ""

  const loadDiagnostics = useCallback(async () => {
    if (!workspaceId) return
    setDiagLoading(true)
    try {
      const data = await getWhatsAppSessionDiagnostics(workspaceId)
      setDiagnostics(data)
    } catch {
      setDiagnostics(null)
    } finally {
      setDiagLoading(false)
    }
  }, [workspaceId])

  const runSessionAction = useCallback(async (
    label: string,
    fn: () => Promise<any>,
  ) => {
    setSessionActionMsg(`Executando: ${label}...`)
    try {
      const result = await fn()
      setSessionActionMsg(`${label}: ${result?.success !== false ? "concluido" : "falhou"}`)
      await loadDiagnostics()
    } catch (err: any) {
      setSessionActionMsg(`Erro: ${err?.message || label}`)
    }
    setTimeout(() => setSessionActionMsg(null), 4000)
  }, [loadDiagnostics])

  // SSE stream for agent events
  useEffect(() => {
    if (!streamEnabled) return

    const token = tokenStorage.getToken()
    const workspaceId = tokenStorage.getWorkspaceId()
    if (!token || !workspaceId) return

    let cancelled = false
    let controller: AbortController | null = null

    const connect = async () => {
      controller = new AbortController()
      try {
        const res = await fetch("/api/whatsapp-api/live", {
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
            "x-kloel-access-token": token,
            "x-workspace-id": workspaceId,
          },
          signal: controller.signal,
        })
        if (!res.ok || !res.body) return

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6)
            if (!data || data === "[DONE]") continue
            try {
              const event: AgentStreamEvent = JSON.parse(data)
              if (!event?.message) continue

              // Update thought
              if (
                event.streaming === true ||
                event.phase === "streaming_token" ||
                event.meta?.streaming === true ||
                ["thought", "typing", "action"].includes(event.type)
              ) {
                setLatestThought(event.message)
                setIsThinking(true)
                if (thoughtTimerRef.current) clearTimeout(thoughtTimerRef.current)
                thoughtTimerRef.current = setTimeout(() => setIsThinking(false), 4000)
              }

              // Update cursor
              if (typeof event.meta?.cursorX === "number" && typeof event.meta?.cursorY === "number") {
                setCursorTarget({
                  x: event.meta.cursorX,
                  y: event.meta.cursorY,
                  actionType: event.meta?.cursorAction,
                  timestamp: Date.now(),
                })
              }

              // Update trace
              setTraceEntries((prev) => [
                ...prev.slice(-99),
                {
                  id: `${event.type}::${event.phase || ""}::${Date.now()}`,
                  type: event.type,
                  phase: event.phase,
                  message: event.message,
                  timestamp: new Date(),
                },
              ])
            } catch {
              // ignore
            }
          }
        }
      } catch {
        if (!cancelled) setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      cancelled = true
      controller?.abort()
    }
  }, [streamEnabled])

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected)
    if (connected) setStreamEnabled(true)
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8" style={{ backgroundColor: '#0A0A0C' }}>
      <div className="w-full max-w-[900px]">
        <AgentDesktopViewer
          isVisible={true}
          latestThought={latestThought}
          isThinking={isThinking}
          traceEntries={traceEntries}
          cursorTarget={cursorTarget}
          autoConnect={true}
          onClose={() => {}}
          onConnectionChange={handleConnectionChange}
        />

        {/* Session Management Panel */}
        <div className="mt-6 rounded border border-[#222226] bg-[#111113]">
          <button
            onClick={() => {
              setShowDiagPanel(v => !v)
              if (!showDiagPanel) loadDiagnostics()
            }}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6E6E73]">
              Gerenciamento da Sessao
            </span>
            <span className="text-xs text-[#3A3A3F]">{showDiagPanel ? "fechar" : "expandir"}</span>
          </button>

          {showDiagPanel && (
            <div className="border-t border-[#222226] px-4 py-4">
              {/* Action buttons */}
              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  {
                    label: "Verificar Sessao",
                    fn: () => forceWhatsAppSessionCheck(workspaceId),
                  },
                  {
                    label: "Forcar Reconexao",
                    fn: () => forceWhatsAppReconnect(workspaceId),
                  },
                  {
                    label: "Reparar Config",
                    fn: () => repairWhatsAppSessionConfig(workspaceId),
                  },
                  {
                    label: "Recriar se Invalida",
                    fn: () => recreateWhatsAppSessionIfInvalid(workspaceId),
                  },
                  {
                    label: "Status do Provider",
                    fn: () => getWhatsAppProviderStatus(workspaceId),
                  },
                ].map(({ label, fn }) => (
                  <button
                    key={label}
                    onClick={() => runSessionAction(label, fn)}
                    className="rounded border border-[#222226] bg-[#19191C] px-3 py-1.5 text-xs font-medium text-[#E0DDD8] hover:border-[#E85D30]/40 hover:text-[#E85D30] transition-colors"
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={loadDiagnostics}
                  disabled={diagLoading}
                  className="rounded border border-[#222226] bg-[#19191C] px-3 py-1.5 text-xs font-medium text-[#6E6E73] hover:text-[#E0DDD8] transition-colors disabled:opacity-50"
                >
                  {diagLoading ? "Carregando..." : "Atualizar Diagnostico"}
                </button>
              </div>

              {sessionActionMsg && (
                <div className="mb-3 rounded bg-[#19191C] px-3 py-2 text-xs text-[#E85D30]">
                  {sessionActionMsg}
                </div>
              )}

              {/* Diagnostics display */}
              {diagnostics && (
                <div className="rounded border border-[#222226] bg-[#0A0A0C] p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#6E6E73]">
                    Diagnostico
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                    {[
                      ["Provider", diagnostics.providerType],
                      ["Sessao", diagnostics.sessionName],
                      ["Status", diagnostics.status?.status || diagnostics.status?.connected ? "CONNECTED" : "DISCONNECTED"],
                      ["Worker", diagnostics.workerAvailable ? "disponivel" : "indisponivel"],
                      ["Workspace", diagnostics.workspaceName || diagnostics.workspaceId],
                      ["Gerado em", diagnostics.generatedAt ? new Date(diagnostics.generatedAt).toLocaleTimeString("pt-BR") : "--"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#3A3A3F]">{label}</span>
                        <span className="truncate font-mono text-[11px] text-[#E0DDD8]">{String(value ?? "--")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!diagnostics && !diagLoading && (
                <p className="text-xs text-[#3A3A3F]">
                  Clique em "Atualizar Diagnostico" para ver o estado detalhado da sessao.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
