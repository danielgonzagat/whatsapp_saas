"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, MessageSquare, XCircle } from "lucide-react";
import { useAuth } from "@/components/kloel/auth/auth-provider";
import {
  listConversations,
  listInboxAgents,
  getConversationMessages,
  closeConversation,
  assignConversation,
  type Conversation,
  type Message,
  type InboxAgent,
} from "@/lib/api";

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InboxPage() {
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, workspace, openAuthModal } = useAuth();

  const workspaceId = workspace?.id;

  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [agents, setAgents] = useState<InboxAgent[]>([]);
  const [assigning, setAssigning] = useState(false);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const refreshConversations = async () => {
    if (!workspaceId) return;
    setError(null);
    setLoadingConversations(true);
    try {
      const data = await listConversations(workspaceId);
      setConversations(Array.isArray(data) ? data : []);
      const requestedConversationId = searchParams?.get("conversationId");
      if (requestedConversationId) {
        setSelectedConversationId(requestedConversationId);
      } else if (!selectedConversationId && data?.[0]?.id) {
        setSelectedConversationId(data[0].id);
      }
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar conversas");
    } finally {
      setLoadingConversations(false);
    }
  };

  const refreshAgents = async () => {
    if (!workspaceId) return;
    try {
      const data = await listInboxAgents(workspaceId);
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      // Agents list is optional for basic inbox usage
      setAgents([]);
    }
  };

  const loadMessages = async (conversationId: string) => {
    setError(null);
    setLoadingMessages(true);
    try {
      const data = await getConversationMessages(conversationId);
      setMessages(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar mensagens");
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSelectConversation = async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    await loadMessages(conversationId);
    await refreshConversations();
  };

  const handleCloseConversation = async () => {
    if (!selectedConversationId) return;
    setError(null);
    try {
      await closeConversation(selectedConversationId);
      await refreshConversations();
    } catch (e: any) {
      setError(e?.message || "Falha ao fechar conversa");
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && workspaceId) {
      refreshConversations();
      refreshAgents();
    }
  }, [isLoading, isAuthenticated, workspaceId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    loadMessages(selectedConversationId);
  }, [selectedConversationId]);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-[#222226] bg-[#111113] p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#E0DDD8]">Inbox</h1>
          <p className="mt-2 text-sm text-[#6E6E73]">Faça login para visualizar e operar suas conversas.</p>
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => openAuthModal("login")}
              className="rounded-xl bg-[#E85D30] px-4 py-2 text-sm font-semibold text-[#0A0A0C]"
            >
              Entrar
            </button>
            <Link href="/" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
              Voltar ao chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-[#222226] bg-[#111113] p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#E0DDD8]">Inbox</h1>
          <p className="mt-2 text-sm text-[#6E6E73]">Workspace não configurado para esta sessão.</p>
          <div className="mt-6">
            <Link href="/" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
              Voltar ao chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#E0DDD8]">Inbox</h1>
          <p className="mt-1 text-sm text-[#6E6E73]">Converse, feche e acompanhe conversas do WhatsApp.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/leads" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
            Leads
          </Link>
          <Link href="/" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
            Voltar ao chat
          </Link>
          <button
            onClick={refreshConversations}
            disabled={loadingConversations}
            className="rounded-xl border border-[#222226] bg-[#111113] px-4 py-2 text-sm font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: conversation list */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-[#222226] bg-[#111113] shadow-sm">
            <div className="flex items-center justify-between border-b border-[#222226] px-5 py-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[#6E6E73]" />
                <span className="text-sm font-semibold text-[#E0DDD8]">Conversas</span>
              </div>
              <span className="text-xs text-[#6E6E73]">{conversations.length}</span>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {loadingConversations ? (
                <div className="flex items-center justify-center px-5 py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-[#6E6E73]" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-[#E0DDD8]">Sem conversas</p>
                  <p className="mt-1 text-xs text-[#6E6E73]">Quando mensagens chegarem, elas aparecem aqui.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#222226]">
                  {conversations.map((c) => {
                    const isActive = c.id === selectedConversationId;
                    const name = c.contact?.name || c.contact?.phone || "Contato";
                    const phone = c.contact?.phone || "";
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSelectConversation(c.id)}
                        className={`w-full px-5 py-4 text-left transition-colors ${isActive ? "bg-[#19191C]" : "hover:bg-[#19191C]"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#E0DDD8]">{name}</p>
                            {phone && <p className="mt-0.5 truncate text-xs text-[#6E6E73]">{phone}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {c.unreadCount ? (
                              <span className="rounded-full bg-[#E85D30] px-2 py-0.5 text-[11px] font-semibold text-[#0A0A0C]">
                                {c.unreadCount}
                              </span>
                            ) : null}
                            <span className="text-[11px] text-[#6E6E73]">{formatTime(c.lastMessageAt)}</span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-[#6E6E73]">
                          <span className="rounded-full bg-[#19191C] px-2 py-0.5">{c.status || ""}</span>
                          {c.lastMessageStatus ? (
                            <span className="rounded-full bg-[#19191C] px-2 py-0.5">{c.lastMessageStatus}</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: messages */}
        <div className="lg:col-span-8">
          <div className="rounded-2xl border border-[#222226] bg-[#111113] shadow-sm">
            <div className="flex items-center justify-between border-b border-[#222226] px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#E0DDD8]">
                  {selectedConversation?.contact?.name || selectedConversation?.contact?.phone || "Selecione uma conversa"}
                </p>
                <p className="mt-0.5 truncate text-xs text-[#6E6E73]">
                  {selectedConversation?.contact?.phone || ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedConversationId && agents.length > 0 ? (
                  <select
                    value={selectedConversation?.assignedAgent?.id || ""}
                    disabled={assigning}
                    onChange={async (e) => {
                      if (!selectedConversationId) return;
                      setAssigning(true);
                      setError(null);
                      try {
                        await assignConversation(selectedConversationId, e.target.value);
                        await refreshConversations();
                      } catch (err: any) {
                        setError(err?.message || "Falha ao atribuir agente");
                      } finally {
                        setAssigning(false);
                      }
                    }}
                    className="hidden max-w-[220px] rounded-xl border border-[#222226] bg-[#111113] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50 md:block"
                    title="Atribuir agente"
                  >
                    <option value="">Não atribuído</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.isOnline ? "(online) " : ""}{a.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  onClick={handleCloseConversation}
                  disabled={!selectedConversationId}
                  className="rounded-xl border border-[#222226] bg-[#111113] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-[#6E6E73]" />
                </div>
              ) : !selectedConversationId ? (
                <div className="py-10 text-center">
                  <p className="text-sm font-medium text-[#E0DDD8]">Selecione uma conversa</p>
                  <p className="mt-1 text-xs text-[#6E6E73]">Escolha uma conversa à esquerda para ver as mensagens.</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm font-medium text-[#E0DDD8]">Sem mensagens</p>
                  <p className="mt-1 text-xs text-[#6E6E73]">Esta conversa ainda não possui mensagens.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const isInbound = m.direction === "INBOUND";
                    return (
                      <div key={m.id} className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                            isInbound
                              ? "bg-[#19191C] text-[#E0DDD8]"
                              : "bg-[#E85D30] text-[#0A0A0C]"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.content || ""}</p>
                          <div className={`mt-1 text-[11px] ${isInbound ? "text-[#6E6E73]" : "text-[#0A0A0C]/70"}`}>
                            {formatTime(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
