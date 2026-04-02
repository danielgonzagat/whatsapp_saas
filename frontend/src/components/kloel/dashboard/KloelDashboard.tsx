'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { MachineRail } from '@/components/kloel/MachineRail';
import {
  buildDashboardSourceHref,
  buildDashboardContextPrompt,
  buildDashboardContextMetadata,
  normalizeDashboardContext,
  readDashboardContextFromMetadata,
  summarizeDashboardContext,
} from '@/lib/kloel-dashboard-context';
import {
  loadKloelThreadMessages,
  sendAuthenticatedKloelMessage,
  type ThreadMessagePayload,
} from '@/lib/kloel-conversations';
import { getDashboardStats } from '@/lib/api/misc';

const F = "var(--font-sora), 'Sora', sans-serif";
const E = '#E85D30';
const V = '#0A0A0C';

type DashboardMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  animate?: boolean;
};

type DashboardStats = {
  contacts: number;
  campaigns: number;
  flows: number;
  messages: number;
  deliveryRate: number;
  readRate: number;
  errorRate: number;
  activeConversations: number;
  healthScore: number;
  avgLatency: number;
  flowCompleted: number;
  flowRunning: number;
  flowFailed: number;
  billingSuspended: boolean;
};

function KpiCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 120,
        background: '#111113',
        border: '1px solid #222226',
        borderRadius: 6,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontFamily: F,
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#6E6E73',
          marginBottom: 8,
          lineHeight: 1,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 22,
          fontWeight: 600,
          color: '#E0DDD8',
          lineHeight: 1,
        }}
      >
        {value}
        {suffix && (
          <span style={{ fontSize: 13, fontWeight: 400, color: '#6E6E73', marginLeft: 2 }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function KpiBar({ stats }: { stats: DashboardStats | null; isLoading: boolean }) {
  if (!stats) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 20,
      }}
    >
      <KpiCard label="Contatos" value={String(stats.contacts)} />
      <KpiCard label="Conversas ativas" value={String(stats.activeConversations)} />
      <KpiCard label="Taxa de entrega" value={String(stats.deliveryRate)} suffix="%" />
      <KpiCard label="Taxa de leitura" value={String(stats.readRate)} suffix="%" />
      <KpiCard label="Flows ativos" value={String(stats.flows)} />
      <KpiCard label="Score de saude" value={String(stats.healthScore)} suffix="%" />
    </div>
  );
}

function PulseIcon({ size = 32 }: { size?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const raf2 = useRef(0);
  const wp2 = useRef(0);
  const h2 = useRef<Float32Array | null>(null);
  const wi2 = useRef(0);
  const si2 = useRef(0);
  const wv2 = useRef<number[][]>([]);
  const fc = useRef(0);

  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const ctxOrNull = el.getContext('2d');
    if (!ctxOrNull) return;
    const ctx = ctxOrNull;
    const dpr = window.devicePixelRatio || 1;

    function gen() {
      const hr = 0.92 + Math.random() * 0.16;
      const bl1 = Math.round((18 + Math.random() * 8) * hr);
      const s: number[] = [];
      for (let i = 0; i < bl1; i++) s.push(0);
      const pLen = 8;
      for (let i = 0; i < pLen; i++)
        s.push(-Math.sin((i / pLen) * Math.PI) * (1.2 + Math.random() * 0.3));
      for (let i = 0; i < 4; i++) s.push(0);
      s.push(0.8);
      s.push(1.5);
      s.push(-3);
      s.push(-(9 + Math.random() * 2));
      s.push(-2);
      s.push(3.5);
      s.push(1.2);
      s.push(0);
      for (let i = 0; i < Math.round(6 * hr); i++) s.push(0);
      const tLen = 12;
      for (let i = 0; i < tLen; i++)
        s.push(-Math.sin((i / tLen) * Math.PI) * (2.2 + Math.random() * 0.5));
      for (let i = 0; i < Math.round((12 + Math.random() * 6) * hr); i++) s.push(0);
      return s;
    }

    for (let i = 0; i < 30; i++) wv2.current.push(gen());

    function draw() {
      const w = (el as any).offsetWidth;
      const ht = (el as any).offsetHeight;
      (el as any).width = w * dpr;
      (el as any).height = ht * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, ht);
      const tw3 = Math.min(Math.floor(0.6 * w), 140);
      const ox = Math.floor((w - tw3) / 2);
      const my = ht / 2 + 1;
      if (!h2.current || h2.current.length !== tw3) {
        h2.current = new Float32Array(tw3);
        wp2.current = 0;
      }
      fc.current++;
      if (fc.current % 3 === 0) {
        const wave = wv2.current[wi2.current % wv2.current.length];
        const idx = Math.floor(si2.current);
        h2.current[wp2.current] = idx < wave.length ? wave[idx] : 0;
        si2.current++;
        if (si2.current >= wave.length) {
          si2.current = 0;
          wi2.current++;
        }
        wp2.current = (wp2.current + 1) % tw3;
      }
      for (let g = 1; g <= 8; g++) h2.current[(wp2.current + g) % tw3] = NaN;
      function tr(f2: number, t2: number) {
        let p = false;
        for (let x = f2; x < t2; x++) {
          const v2 = h2.current![x];
          if (Number.isNaN(v2)) {
            p = false;
            continue;
          }
          if (p) ctx.lineTo(ox + x, my + v2);
          else {
            ctx.moveTo(ox + x, my + v2);
            p = true;
          }
        }
      }
      ctx.beginPath();
      tr(0, tw3);
      const gr = ctx.createLinearGradient(ox, 0, ox + tw3, 0);
      gr.addColorStop(0, 'rgba(232,93,48,0)');
      gr.addColorStop(0.08, 'rgba(232,93,48,0.9)');
      gr.addColorStop(0.85, 'rgba(232,93,48,0.9)');
      gr.addColorStop(1, 'rgba(232,93,48,0)');
      ctx.strokeStyle = gr;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 12;
      ctx.stroke();
      const cx2 = ox + wp2.current;
      const cv2 = h2.current[wp2.current];
      if (!Number.isNaN(cv2)) {
        const cy = my + cv2;
        ctx.beginPath();
        ctx.arc(cx2, cy, 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = E;
        ctx.fill();
        const rg = ctx.createRadialGradient(cx2, cy, 0, cx2, cy, 5);
        rg.addColorStop(0, 'rgba(232,93,48,0.35)');
        rg.addColorStop(1, 'rgba(232,93,48,0)');
        ctx.beginPath();
        ctx.arc(cx2, cy, 5, 0, 2 * Math.PI);
        ctx.fillStyle = rg;
        ctx.fill();
      }
      raf2.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      if (raf2.current) cancelAnimationFrame(raf2.current);
    };
  }, []);

  return (
    <canvas ref={cv} style={{ width: size, height: Math.round(size * 0.55), display: 'block' }} />
  );
}

function InputBar({
  input,
  setInput,
  onSend,
  isThinking,
  placeholder,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  isThinking: boolean;
  placeholder: string;
  inputRef: React.RefObject<HTMLInputElement | null> | null;
}) {
  return (
    <div
      style={{
        background: '#111113',
        border: 'none',
        borderRadius: 16,
        padding: '0',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '18px 20px 12px' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          placeholder={placeholder}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#E0DDD8',
            fontSize: 17,
            fontFamily: F,
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px 12px',
        }}
      >
        {/* Placeholder: will open attachment/context picker in a future iteration */}
        <button
          type="button"
          aria-label="Adicionar contexto"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'default',
            color: '#6E6E73',
            fontSize: 22,
            fontWeight: 300,
            fontFamily: F,
            borderRadius: 6,
            opacity: 0.5,
          }}
        >
          +
        </button>
        <button
          onClick={onSend}
          disabled={!input.trim() || isThinking}
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: input.trim() ? E : '#19191C',
            border: 'none',
            borderRadius: 6,
            cursor: input.trim() ? 'pointer' : 'default',
            color: input.trim() ? V : '#6E6E73',
            transition: 'all .15s',
          }}
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  if (h >= 18 && h < 24) return 'Boa noite';
  return 'Boa madrugada';
}

function AIMessage({
  text,
  animate = true,
  onDone,
}: {
  text: string;
  animate?: boolean;
  onDone?: () => void;
}) {
  const [displayed, setDisplayed] = useState(animate ? '' : text);
  const [done, setDone] = useState(!animate);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    if (!animate) {
      setDisplayed(text);
      setDone(true);
      return () => {
        mounted.current = false;
      };
    }

    setDisplayed('');
    setDone(false);
    let i = 0;
    const speed = Math.max(12, Math.min(30, 1200 / Math.max(text.length, 1)));
    const iv = setInterval(() => {
      if (!mounted.current) return;
      i++;
      if (i >= text.length) {
        setDisplayed(text);
        setDone(true);
        clearInterval(iv);
        onDone?.();
      } else {
        const resolved = text.slice(0, i);
        const frontier = Array.from(
          { length: Math.min(3, text.length - i) },
          () =>
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
              Math.floor(Math.random() * 62)
            ],
        ).join('');
        setDisplayed(resolved + frontier);
      }
    }, speed);

    return () => {
      mounted.current = false;
      clearInterval(iv);
    };
  }, [animate, onDone, text]);

  return (
    <div style={{ animation: 'msgIn .3s ease both' }}>
      <div style={{ fontSize: 16, color: '#E0DDD8', lineHeight: 1.75, fontFamily: F }}>
        {displayed}
        {!done && (
          <span style={{ color: E, animation: 'blink 1s ease infinite', marginLeft: 1 }}>|</span>
        )}
      </div>
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div style={{ animation: 'msgIn .25s ease both' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            background: '#19191C',
            border: '1px solid #222226',
            borderRadius: 6,
            padding: '14px 18px',
            maxWidth: '75%',
            fontSize: 16,
            color: '#E0DDD8',
            lineHeight: 1.7,
            fontFamily: F,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

const UNAVAILABLE_MESSAGE =
  'IA indisponivel no momento. Verifique se o Autopilot esta ativo e tente novamente em alguns segundos.';

function extractMessageArray(payload: any): ThreadMessagePayload[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export default function KloelDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedConversationId = searchParams.get('conversationId');
  const requestedSource = searchParams.get('source');
  const requestedLeadId = searchParams.get('leadId');
  const requestedPhone = searchParams.get('phone');
  const requestedEmail = searchParams.get('email');
  const requestedName = searchParams.get('name');
  const requestedProductId = searchParams.get('productId');
  const requestedProductName = searchParams.get('productName');
  const requestedPlanId = searchParams.get('planId');
  const requestedPlanName = searchParams.get('planName');
  const requestedDraft = searchParams.get('draft');
  const requestedPurpose = searchParams.get('purpose');
  const { user, workspace } = useAuth();
  const { conversations, setActiveConversation, upsertConversation, refreshConversations } =
    useConversationHistory();

  const userName = user?.name?.split(' ')[0] || '';
  const [greeting, setGreeting] = useState('Ola');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DashboardMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState('Nova conversa');
  const [threadContext, setThreadContext] = useState<any | null>(null);
  const [dashboardKpiStats, setDashboardKpiStats] = useState<DashboardStats | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contextPrefillRef = useRef<string | null>(null);

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  useEffect(() => {
    if (!workspace?.id) return;
    let cancelled = false;
    setKpiLoading(true);
    getDashboardStats()
      .then((res) => {
        if (cancelled) return;
        if (res.data && !res.error) {
          setDashboardKpiStats(res.data as DashboardStats);
        }
      })
      .catch(() => {
        // Graceful degradation: KPI bar simply won't render
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace?.id]);

  const conversationTitleMap = useMemo(() => {
    return new Map(conversations.map((conversation) => [conversation.id, conversation.title]));
  }, [conversations]);

  const dashboardContext = useMemo(
    () => ({
      source: requestedSource,
      leadId: requestedLeadId,
      phone: requestedPhone,
      email: requestedEmail,
      name: requestedName,
      productId: requestedProductId,
      productName: requestedProductName,
      planId: requestedPlanId,
      planName: requestedPlanName,
      draft: requestedDraft,
      purpose: requestedPurpose,
    }),
    [
      requestedDraft,
      requestedEmail,
      requestedLeadId,
      requestedName,
      requestedPhone,
      requestedPlanId,
      requestedPlanName,
      requestedProductId,
      requestedProductName,
      requestedPurpose,
      requestedSource,
    ],
  );
  const normalizedDashboardContext = useMemo(
    () => normalizeDashboardContext(dashboardContext),
    [dashboardContext],
  );

  const dashboardContextPrompt = useMemo(() => {
    if (requestedConversationId) return '';
    return buildDashboardContextPrompt(dashboardContext);
  }, [dashboardContext, requestedConversationId]);

  const dashboardContextSummary = useMemo(() => {
    return summarizeDashboardContext(dashboardContext);
  }, [dashboardContext]);
  const threadContextSummary = useMemo(
    () => summarizeDashboardContext(threadContext),
    [threadContext],
  );
  const effectiveContext = threadContext || normalizedDashboardContext || null;
  const returnToSourceHref = useMemo(
    () => buildDashboardSourceHref(effectiveContext || {}),
    [effectiveContext],
  );

  const visibleContextSummary =
    threadContextSummary.length > 0 ? threadContextSummary : dashboardContextSummary;
  const hasDashboardContext = visibleContextSummary.length > 0;

  const syncConversationUrl = useCallback(
    (conversationId: string | null) => {
      const query = conversationId
        ? `/dashboard?conversationId=${encodeURIComponent(conversationId)}`
        : '/dashboard';
      router.replace(query, { scroll: false });
    },
    [router],
  );

  const resetConversation = useCallback(
    (syncUrl = true) => {
      setMessages([]);
      setInput('');
      setIsThinking(false);
      setIsLoadingConversation(false);
      setActiveConversationId(null);
      setChatTitle('Nova conversa');
      setThreadContext(null);
      setActiveConversation(null);
      if (syncUrl) {
        syncConversationUrl(null);
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [setActiveConversation, syncConversationUrl],
  );

  const loadConversation = useCallback(
    async (conversationId: string) => {
      if (!conversationId) return;

      setIsLoadingConversation(true);
      try {
        const payload = await loadKloelThreadMessages(conversationId);
        const hydrated = payload.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.content,
          animate: false,
        })) satisfies DashboardMessage[];
        const contextualMessage = payload.find(
          (message) =>
            message.role === 'user' && readDashboardContextFromMetadata(message.metadata),
        );
        const persistedContext = contextualMessage
          ? readDashboardContextFromMetadata(contextualMessage.metadata)
          : null;
        const fallbackContext = persistedContext || normalizedDashboardContext || null;

        setMessages(hydrated);
        setThreadContext(fallbackContext);
        setActiveConversationId(conversationId);
        setActiveConversation(conversationId);
        setChatTitle(conversationTitleMap.get(conversationId) || 'Nova conversa');
      } catch {
        setMessages([]);
        setThreadContext(normalizedDashboardContext || null);
      } finally {
        setIsLoadingConversation(false);
      }
    },
    [conversationTitleMap, normalizedDashboardContext, setActiveConversation],
  );

  useEffect(() => {
    if (!requestedConversationId) return;
    if (requestedConversationId === activeConversationId && messages.length > 0) return;
    void loadConversation(requestedConversationId);
  }, [activeConversationId, loadConversation, messages.length, requestedConversationId]);

  useEffect(() => {
    if (requestedConversationId || !dashboardContextPrompt) {
      contextPrefillRef.current = null;
      if (requestedConversationId) return;
      return;
    }

    const contextKey = JSON.stringify(dashboardContext);
    if (contextPrefillRef.current === contextKey) return;
    contextPrefillRef.current = contextKey;

    setInput((current) => (current.trim() ? current : dashboardContextPrompt));
    setChatTitle('Nova conversa');
    setActiveConversation(null);
    setActiveConversationId(null);
    setMessages([]);
    setThreadContext(normalizedDashboardContext);
    setIsThinking(false);
    setIsLoadingConversation(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [
    dashboardContext,
    dashboardContextPrompt,
    normalizedDashboardContext,
    requestedConversationId,
    setActiveConversation,
  ]);

  useEffect(() => {
    if (!activeConversationId) return;
    const title = conversationTitleMap.get(activeConversationId);
    if (title) {
      setChatTitle(title);
    }
  }, [activeConversationId, conversationTitleMap]);

  useEffect(() => {
    const handleNewChat = () => resetConversation(true);
    const handleLoadChat = (event: Event) => {
      const conversationId = (event as CustomEvent).detail?.conversationId;
      if (!conversationId) return;
      syncConversationUrl(String(conversationId));
    };

    window.addEventListener('kloel:new-chat', handleNewChat);
    window.addEventListener('kloel:load-chat', handleLoadChat);

    return () => {
      window.removeEventListener('kloel:new-chat', handleNewChat);
      window.removeEventListener('kloel:load-chat', handleLoadChat);
    };
  }, [resetConversation, syncConversationUrl]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking) return;

    const optimisticUserMessage: DashboardMessage = {
      id: `user_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      role: 'user',
      text,
      animate: false,
    };

    setInput('');
    setMessages((prev) => [...prev, optimisticUserMessage]);
    setIsThinking(true);

    try {
      const responsePayload = await sendAuthenticatedKloelMessage({
        message: text,
        conversationId: activeConversationId || undefined,
        mode: 'chat',
        metadata:
          normalizedDashboardContext && (!activeConversationId || !threadContext)
            ? buildDashboardContextMetadata({
                ...normalizedDashboardContext,
                draft: requestedDraft || text,
              })
            : undefined,
      });
      const reply =
        responsePayload?.response ||
        responsePayload?.reply ||
        responsePayload?.message ||
        UNAVAILABLE_MESSAGE;

      const nextConversationId = responsePayload?.conversationId || activeConversationId || null;
      const nextTitle =
        responsePayload?.title || conversationTitleMap.get(nextConversationId || '') || chatTitle;

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
          role: 'assistant',
          text: reply,
          animate: true,
        },
      ]);

      if (nextConversationId) {
        setActiveConversationId(nextConversationId);
        setActiveConversation(nextConversationId);
        setChatTitle(nextTitle || 'Nova conversa');
        if (!threadContext && normalizedDashboardContext) {
          setThreadContext(normalizedDashboardContext);
        }
        upsertConversation({
          id: nextConversationId,
          title: nextTitle || 'Nova conversa',
          updatedAt: new Date().toISOString(),
        });
        if (requestedConversationId !== nextConversationId) {
          syncConversationUrl(nextConversationId);
        }
        void refreshConversations();
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
          role: 'assistant',
          text: UNAVAILABLE_MESSAGE,
          animate: true,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }, [
    activeConversationId,
    chatTitle,
    conversationTitleMap,
    input,
    isThinking,
    normalizedDashboardContext,
    refreshConversations,
    requestedConversationId,
    requestedDraft,
    setActiveConversation,
    syncConversationUrl,
    threadContext,
    upsertConversation,
  ]);

  const hasMessages = messages.length > 0;
  const clearOperationalContext = useCallback(() => {
    setThreadContext(null);
    router.replace('/dashboard', { scroll: false });
  }, [router]);

  return (
    <div
      style={{
        background: V,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: F,
        color: '#E0DDD8',
      }}
    >
      <style>{`
        @keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        input::placeholder { color: #6E6E73 !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #222226; border-radius: 2px; }
      `}</style>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 920,
          width: '100%',
          margin: '0 auto',
          padding: '0 28px',
        }}
      >
        {!hasMessages && !isLoadingConversation && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'fadeIn .8s ease both',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
              <PulseIcon size={36} />
              <h1
                style={{
                  fontSize: 'clamp(28px, 5vw, 40px)',
                  fontWeight: 700,
                  letterSpacing: '-0.025em',
                  margin: 0,
                  color: '#E0DDD8',
                }}
              >
                {greeting}, {userName}.
              </h1>
            </div>

            <div style={{ width: '100%', maxWidth: 760, marginBottom: 20 }}>
              <KpiBar stats={dashboardKpiStats} isLoading={kpiLoading} />
            </div>

            <div style={{ width: '100%', maxWidth: 760 }}>
              {hasDashboardContext && (
                <div
                  style={{
                    marginBottom: 18,
                    background: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 12,
                    padding: '16px 18px',
                  }}
                >
                  <div
                    style={{
                      fontFamily: F,
                      fontSize: 11,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#6E6E73',
                      marginBottom: 10,
                    }}
                  >
                    Contexto operacional
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    {visibleContextSummary.map((item) => (
                      <span
                        key={item}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          background: '#19191C',
                          color: '#E0DDD8',
                          fontSize: 12,
                          fontFamily: F,
                        }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: F,
                        fontSize: 12,
                        lineHeight: 1.6,
                        color: '#6E6E73',
                      }}
                    >
                      O contexto já foi preparado no campo abaixo. Ajuste a instrução e envie para
                      abrir uma thread real da IA.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {returnToSourceHref ? (
                        <button
                          onClick={() => router.push(returnToSourceHref)}
                          style={{
                            border: '1px solid #222226',
                            background: '#19191C',
                            color: '#E0DDD8',
                            borderRadius: 8,
                            padding: '8px 12px',
                            fontFamily: F,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          Voltar para origem
                        </button>
                      ) : null}
                      <button
                        onClick={clearOperationalContext}
                        style={{
                          border: '1px solid #222226',
                          background: '#0A0A0C',
                          color: '#E0DDD8',
                          borderRadius: 8,
                          padding: '8px 12px',
                          fontFamily: F,
                          fontSize: 12,
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <InputBar
                input={input}
                setInput={setInput}
                onSend={handleSend}
                isThinking={isThinking}
                placeholder="Como posso ajudar você hoje?"
                inputRef={inputRef}
              />
            </div>

            <div style={{ width: '100%', maxWidth: 900, marginTop: 28 }}>
              <MachineRail shell="dashboard" compact />
            </div>
          </div>
        )}

        {(hasMessages || isLoadingConversation) && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', paddingTop: 36, paddingBottom: 24 }}>
              {activeConversationId ? (
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontFamily: F,
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#6E6E73',
                      marginBottom: 8,
                    }}
                  >
                    Conversa salva
                  </div>
                  <div style={{ fontSize: 22, lineHeight: 1.2, color: '#E0DDD8', fontWeight: 600 }}>
                    {chatTitle}
                  </div>
                  {visibleContextSummary.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      {visibleContextSummary.map((item) => (
                        <span
                          key={item}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: '#111113',
                            border: '1px solid #222226',
                            color: '#E0DDD8',
                            fontSize: 12,
                            fontFamily: F,
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {returnToSourceHref ? (
                    <button
                      onClick={() => router.push(returnToSourceHref)}
                      style={{
                        marginTop: 12,
                        border: '1px solid #222226',
                        background: '#111113',
                        color: '#E0DDD8',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontFamily: F,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Voltar para origem operacional
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {messages.map((message) =>
                  message.role === 'user' ? (
                    <UserMessage key={message.id} text={message.text} />
                  ) : (
                    <AIMessage
                      key={message.id}
                      text={message.text}
                      animate={message.animate !== false}
                    />
                  ),
                )}

                {isLoadingConversation && (
                  <div style={{ animation: 'msgIn .3s ease both', padding: '8px 0' }}>
                    <PulseIcon size={120} />
                  </div>
                )}

                {isThinking && (
                  <div style={{ animation: 'msgIn .3s ease both', padding: '8px 0' }}>
                    <PulseIcon size={120} />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div style={{ paddingBottom: 28, paddingTop: 12, flexShrink: 0 }}>
              <InputBar
                input={input}
                setInput={setInput}
                onSend={handleSend}
                isThinking={isThinking}
                placeholder="Responder..."
                inputRef={null}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
