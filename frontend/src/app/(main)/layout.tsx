import type { Metadata } from "next";
import { AuthProvider } from "@/components/kloel/auth/auth-provider";
import { AppShell } from "@/components/kloel/AppShell";
import { SWRProvider } from "@/components/kloel/SWRProvider";
import { ToastProvider } from "@/components/kloel/ToastProvider";
import { ConversationHistoryProvider } from "@/hooks/useConversationHistory";

export const metadata: Metadata = {
  title: "Kloel — Marketing Artificial",
  description: "A plataforma onde o marketing se adapta à inteligência artificial.",
};

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <SWRProvider>
        <ConversationHistoryProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </ConversationHistoryProvider>
      </SWRProvider>
    </AuthProvider>
  );
}
