'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import {
  AdminEmptyState,
  AdminPage,
  AdminPageIntro,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import { adminSupportApi } from '@/lib/api/admin-support-api';

export default function SupportTicketPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, mutate } = useSWR(['admin/support', conversationId], () =>
    adminSupportApi.detail(conversationId),
  );

  if (!data) {
    return (
      <AdminPage>
        <AdminEmptyState
          title="Carregando ticket"
          description="Estou buscando o histórico completo desta conversa."
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="SUPPORT"
        title={data.ticket.contactName || data.ticket.contactPhone || 'Ticket'}
        description={`${data.ticket.workspaceName} • ${data.ticket.channel} • ${data.ticket.status}`}
        actions={
          <Button asChild variant="outline">
            <Link href="/contas">Voltar para contas</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Histórico"
            description="Linha do tempo operacional completa do ticket."
          />
          <div className="flex flex-col gap-3">
            {data.messages.map((message) => (
              <div
                key={message.id}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  <span>
                    {message.direction} • {message.type}
                  </span>
                  <span>{new Date(message.createdAt).toLocaleString('pt-BR')}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[14px] text-[var(--app-text-primary)]">
                  {message.content}
                </p>
                {message.agentName ? (
                  <p className="mt-2 text-[11px] text-[var(--app-text-secondary)]">
                    por {message.agentName}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </AdminSurface>

        <div className="flex flex-col gap-4">
          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader title="Macros" description="Respostas rápidas para o backoffice." />
            <div className="flex flex-col gap-2">
              {data.macros.map((macro) => (
                <Button
                  key={macro.key}
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft(macro.content)}
                  className="justify-start"
                >
                  {macro.label}
                </Button>
              ))}
            </div>
          </AdminSurface>

          <AdminSurface className="px-5 py-5 lg:px-6">
            <AdminSectionHeader
              title="Responder"
              description="Registra uma resposta operacional no histórico da conversa."
            />
            <div className="flex flex-col gap-3">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={8}
                className="min-h-[180px] rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 py-3 text-[14px] text-[var(--app-text-primary)] outline-none placeholder:text-[var(--app-text-placeholder)]"
                placeholder="Escreva a resposta operacional..."
              />
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await adminSupportApi.updateStatus(conversationId, 'PENDING');
                      await mutate();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Marcar como pendente
                </Button>
                <Button
                  size="sm"
                  disabled={busy || draft.trim().length < 3}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await adminSupportApi.reply(conversationId, draft.trim());
                      setDraft('');
                      await mutate();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? 'Processando…' : 'Registrar resposta'}
                </Button>
              </div>
            </div>
          </AdminSurface>
        </div>
      </div>
    </AdminPage>
  );
}
