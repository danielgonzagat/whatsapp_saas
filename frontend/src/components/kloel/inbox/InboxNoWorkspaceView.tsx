import { kloelT } from '@/lib/i18n/t';
import Link from 'next/link';

interface NoWorkspaceViewProps {
  embedded: boolean;
  title: string;
}

/** No workspace view. */
export function InboxNoWorkspaceView({ embedded, title }: NoWorkspaceViewProps) {
  return (
    <div className={embedded ? 'w-full' : 'mx-auto max-w-3xl px-6 py-10'}>
      <div className="rounded-2xl border border-[var(--bg-border)] bg-[var(--bg-surface)] p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--text-silver)]">{title}</h1>
        <p className="mt-2 text-base text-[var(--text-muted)]">
          {kloelT(`Workspace não configurado para esta sessão.`)}
        </p>
        <div className="mt-6">
          <Link href="/" className="text-base font-medium text-[var(--text-muted)] hover:text-[var(--text-silver)]">
            {kloelT(`Voltar ao chat`)}
          </Link>
        </div>
      </div>
    </div>
  );
}
