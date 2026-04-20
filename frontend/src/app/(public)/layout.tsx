import type React from 'react';
import { PublicLayoutShell } from './public-layout-shell';

/** Public layout. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicLayoutShell>{children}</PublicLayoutShell>;
}
