import { redirect } from 'next/navigation';

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const resolved = searchParams ? await searchParams : {};

  const q = String(resolved?.q || '').trim();
  if (q) {
    redirect(`/dashboard?draft=${encodeURIComponent(q)}&source=chat`);
  }

  redirect('/dashboard');
}
