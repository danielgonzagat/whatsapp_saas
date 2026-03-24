"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { AgentDesktopViewer } from "@/components/kloel/AgentDesktopViewer"
import { tokenStorage } from "@/lib/api"
import type { AgentCursorTarget } from "@/components/kloel/AgentCursor"

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
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8" style={{ backgroundColor: '#0A0A0C' }}>
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
      </div>
    </div>
  )
}
