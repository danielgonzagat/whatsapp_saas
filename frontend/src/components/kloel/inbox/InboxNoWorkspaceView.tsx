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
      <div className="rounded-2xl border border-[#222226] bg-[#111113] p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-[#E0DDD8]">{title}</h1>
        <p className="mt-2 text-base text-[#6E6E73]">
          {kloelT(`Workspace não configurado para esta sessão.`)}
        </p>
        <div className="mt-6">
          <Link href="/" className="text-base font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
            {kloelT(`Voltar ao chat`)}
          </Link>
        </div>
      </div>
    </div>
  );
}
