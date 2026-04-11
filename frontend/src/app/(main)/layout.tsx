import type { Metadata } from 'next';
import Script from 'next/script';
import { AppShell } from '@/components/kloel/AppShell';
import { SWRProvider } from '@/components/kloel/SWRProvider';
import { ToastProvider } from '@/components/kloel/ToastProvider';
import { ConversationHistoryProvider } from '@/hooks/useConversationHistory';
import { AuthProvider } from '@/components/kloel/auth/auth-provider';
import { ThemeProvider } from '@/components/kloel/theme/ThemeProvider';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kloel — Marketing Artificial',
  description: 'A plataforma onde o marketing se adapta à inteligência artificial.',
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="/kloel-theme-init.js" strategy="beforeInteractive" />
      <AuthProvider>
        <SWRProvider>
          <ConversationHistoryProvider>
            <ToastProvider>
              <ThemeProvider>
                <div className="kloel-app-theme-root">
                  <AppShell>{children}</AppShell>
                </div>
              </ThemeProvider>
            </ToastProvider>
          </ConversationHistoryProvider>
        </SWRProvider>
      </AuthProvider>
    </>
  );
}
