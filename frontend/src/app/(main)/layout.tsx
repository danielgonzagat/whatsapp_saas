import type { Metadata } from 'next';
import { AppShell } from '@/components/kloel/AppShell';
import { SWRProvider } from '@/components/kloel/SWRProvider';
import { ToastProvider } from '@/components/kloel/ToastProvider';
import { ConversationHistoryProvider } from '@/hooks/useConversationHistory';
import { AuthProvider } from '@/components/kloel/auth/auth-provider';
import { ThemeProvider } from '@/components/kloel/theme/ThemeProvider';
import { KLOEL_APP_THEME_KEY } from '@/lib/kloel-theme';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kloel — Marketing Artificial',
  description: 'A plataforma onde o marketing se adapta à inteligência artificial.',
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){function applyThemeColor(theme){var meta=document.querySelector('meta[name="theme-color"]');if(!meta){meta=document.createElement('meta');meta.setAttribute('name','theme-color');document.head.appendChild(meta);}meta.setAttribute('content',theme==='dark'?'#0A0A0C':'#FFFFFF');}try{var stored=localStorage.getItem('${KLOEL_APP_THEME_KEY}');var theme=(stored==='dark'||stored==='light')?stored:'light';document.documentElement.setAttribute('data-kloel-app-theme',theme);document.documentElement.style.colorScheme=theme;applyThemeColor(theme);}catch(e){document.documentElement.setAttribute('data-kloel-app-theme','light');document.documentElement.style.colorScheme='light';applyThemeColor('light');}})();`,
        }}
      />
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
