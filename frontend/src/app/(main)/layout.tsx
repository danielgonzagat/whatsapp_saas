import { MainAppLayoutShell } from '@/components/kloel/layouts/MainAppLayoutShell';
import type { Metadata } from 'next';

/** Dynamic. */
export const dynamic = 'force-dynamic';

/** Metadata. */
export const metadata: Metadata = {
  title: 'Kloel — Marketing Artificial',
  description: 'A plataforma onde o marketing se adapta à inteligência artificial.',
};

/** Main layout. */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <MainAppLayoutShell>{children}</MainAppLayoutShell>;
}
