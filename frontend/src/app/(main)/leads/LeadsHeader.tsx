'use client';

import { kloelT } from '@/lib/i18n/t';
import Link from 'next/link';

interface LeadsHeaderProps {
  loadingLeads: boolean;
  onRefresh: () => void;
}

export function LeadsHeader({ loadingLeads, onRefresh }: LeadsHeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{kloelT(`Leads`)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {kloelT(`Acompanhe e acione contatos com intenção de compra.`)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/followups"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {kloelT(`Follow-ups`)}
        </Link>
        <Link
          href="/flow"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {kloelT(`Flow`)}
        </Link>
        <Link
          href="/inbox"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {kloelT(`Inbox`)}
        </Link>
        <Link
          href="/"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {kloelT(`Voltar ao chat`)}
        </Link>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loadingLeads}
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
        >
          {kloelT(`Atualizar`)}
        </button>
      </div>
    </div>
  );
}
