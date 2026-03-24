import type { Metadata } from "next";
import { AuthProvider } from "@/components/kloel/auth/auth-provider";
import { AppShell } from "@/components/kloel/AppShell";
import { SWRProvider } from "@/components/kloel/SWRProvider";
import { ToastProvider } from "@/components/kloel/ToastProvider";

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
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </SWRProvider>
    </AuthProvider>
  );
}
