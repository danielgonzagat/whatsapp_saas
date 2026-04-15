'use client';

import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  adminChatApi,
  type AdminChatMessageView,
  type AdminChatSessionView,
} from '@/lib/api/admin-chat-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

/**
 * SP-14 v0 floating admin chat drawer. Pinned bottom-right of the
 * admin layout. The LLM provider is not wired yet — the assistant
 * returns a canned "copiloto not configured" message unless the
 * operator types /tool <name> <jsonArgs> to execute a registered
 * tool directly. That path is already fully audited and permission-
 * scoped (I-ADMIN-C2, C3).
 */
export function AdminChatDrawer() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<AdminChatSessionView | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session]);

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await adminChatApi.sendMessage({
        sessionId: session?.id,
        content: input.trim(),
      });
      setSession(next);
      setInput('');
    } catch (err) {
      setError(
        err instanceof AdminApiClientError
          ? err.message
          : 'Erro inesperado ao falar com o copiloto.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-30 flex h-12 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium shadow-lg transition hover:bg-accent"
        aria-label="Abrir copiloto admin"
      >
        <span className="h-2 w-2 rounded-full bg-ember-primary" aria-hidden />
        Copiloto
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[440px] flex-col border-l border-border bg-background shadow-2xl"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex flex-col">
              <Badge variant="ember" className="w-fit">
                SP-14
              </Badge>
              <span className="text-sm font-semibold">Copiloto admin</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </header>

          <div
            ref={scrollRef}
            className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
          >
            {session ? (
              session.messages.map((m) => <MessageBubble key={m.id} message={m} />)
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Como usar</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
                  <p>
                    O copiloto LLM ainda não foi ligado neste deploy. Use o comando{' '}
                    <code className="font-mono">/tool nome {'{json}'}</code> para executar uma
                    ferramenta diretamente.
                  </p>
                  <p>
                    Exemplo: <code className="font-mono">/tool searchWorkspaces {'{"query":"acme"}'}</code>
                  </p>
                </CardContent>
              </Card>
            )}
            {busy ? <Skeleton className="h-10 w-full" /> : null}
          </div>

          {error ? (
            <div className="border-t border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-2 border-t border-border px-4 py-3"
          >
            <Label htmlFor={inputId} className="sr-only">
              Pergunta
            </Label>
            <Input
              id={inputId}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder="Pergunte algo ou /tool <nome> <json>"
              disabled={busy}
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="submit" size="sm" disabled={busy || input.trim().length === 0}>
                {busy ? 'Enviando…' : 'Enviar'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function MessageBubble({ message }: { message: AdminChatMessageView }) {
  if (message.role === 'USER') {
    return (
      <div className="self-end rounded-md bg-primary/10 px-3 py-2 text-sm">
        {message.content}
      </div>
    );
  }
  if (message.role === 'TOOL') {
    return (
      <div className="self-start rounded-md border border-border bg-card px-3 py-2 text-xs">
        <div className="mb-1 flex items-center gap-2">
          <Badge variant="warning">TOOL</Badge>
          <span className="font-mono">{message.toolName}</span>
        </div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
          {JSON.stringify(message.toolResult, null, 2)}
        </pre>
      </div>
    );
  }
  return (
    <div className="self-start rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">
      {message.content}
    </div>
  );
}
