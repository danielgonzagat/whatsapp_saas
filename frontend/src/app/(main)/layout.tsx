import { MainAppLayoutShell } from '@/components/kloel/layouts/MainAppLayoutShell';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kloel — Marketing Artificial',
  description: 'A plataforma onde o marketing se adapta à inteligência artificial.',
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <MainAppLayoutShell>{children}</MainAppLayoutShell>;
}
