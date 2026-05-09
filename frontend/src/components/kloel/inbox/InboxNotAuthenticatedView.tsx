import { kloelT } from '@/lib/i18n/t';
import Link from 'next/link';

interface NotAuthenticatedViewProps {
  embedded: boolean;
  title: string;
  onLogin: () => void;
}

/** Not authenticated view. */
export function InboxNotAuthenticatedView({ embedded, title, onLogin }: NotAuthenticatedViewProps) {
  return (
    <div className={embedded ? 'w-full' : 'mx-auto max-w-3xl px-6 py-10'}>
      <div className="rounded-2xl border border-[#222226] bg-[#111113] p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-[#E0DDD8]">{title}</h1>
        <p className="mt-2 text-base text-[#6E6E73]">
          {kloelT(`Faça login para visualizar e operar suas conversas.`)}
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onLogin}
            className="rounded-xl bg-[#E85D30] px-4 py-2 text-base font-semibold text-[#0A0A0C]"
          >
            {kloelT(`Entrar`)}
          </button>
          <Link href="/" className="text-base font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
            {kloelT(`Voltar ao chat`)}
          </Link>
        </div>
      </div>
    </div>
  );
}
