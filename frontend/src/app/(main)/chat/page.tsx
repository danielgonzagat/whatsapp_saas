import { redirect } from 'next/navigation';

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }> | { q?: string };
}) {
  const resolved =
    searchParams && typeof (searchParams as Promise<{ q?: string }>).then === 'function'
      ? await (searchParams as Promise<{ q?: string }>)
      : ((searchParams as { q?: string }) || {});

  const q = String(resolved?.q || '').trim();
  if (q) {
    redirect(`/dashboard?draft=${encodeURIComponent(q)}&source=chat`);
  }

  redirect('/dashboard');
}
