import { kloelT } from '@/lib/i18n/t';
import Link from 'next/link';

interface NotAuthenticatedViewProps {
  embedded: boolean;
  title: string;
  onLogin: () => void;
}

/** Not authenticated view. */
export function NotAuthenticatedView({ embedded, title, onLogin }: NotAuthenticatedViewProps) {
  return (
    <div className={embedded ? 'w-full' : 'mx-auto max-w-3xl px-6 py-10'}>
      <div className="rounded-2xl border border-[var(--bg-border)] bg-[var(--bg-surface)] p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--text-silver)]">{title}</h1>
        <p className="mt-2 text-base text-[var(--text-muted)]">
          {kloelT(`Faça login para visualizar e operar suas conversas.`)}
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onLogin}
            className="rounded-xl bg-[var(--ember-primary)] px-4 py-2 text-base font-semibold text-[var(--bg-void)]"
          >
            {kloelT(`Entrar`)}
          </button>
          <Link href="/" className="text-base font-medium text-[var(--text-muted)] hover:text-[var(--text-silver)]">
            {kloelT(`Voltar ao chat`)}
          </Link>
        </div>
      </div>
    </div>
  );
}
