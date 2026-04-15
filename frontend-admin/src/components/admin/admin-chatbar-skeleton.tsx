'use client';

import { Plus, Send } from 'lucide-react';

/**
 * Visual-only chatbar placeholder. The real admin AI chat lands in SP-14,
 * after RBAC + audit + action dry-run are proven safe. This component has
 * no state and no onClick handlers — it's a honest shell that says "this
 * is where the admin chat will live".
 */
export function AdminChatbarSkeleton() {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-20 w-[min(640px,calc(100vw-3rem))] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-md border border-border bg-card/90 px-3 py-3 shadow-sm backdrop-blur-md">
        <button
          type="button"
          disabled
          aria-label="Adicionar contexto (em breve — SP-14)"
          className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border text-muted-foreground"
        >
          <Plus className="size-4" />
        </button>
        <div className="flex-1 truncate text-xs text-muted-foreground">
          Chat administrativo — disponível a partir de SP-14 (permissões e audit estarão blindados).
        </div>
        <button
          type="button"
          disabled
          aria-label="Enviar (em breve — SP-14)"
          className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border text-muted-foreground"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
