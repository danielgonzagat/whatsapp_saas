import type { Metadata } from "next";
import { AuthProvider } from "@/components/kloel/auth/auth-provider";
import { AppShell } from "@/components/kloel/AppShell";
import { SWRProvider } from "@/components/kloel/SWRProvider";

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
        <AppShell>{children}</AppShell>
      </SWRProvider>
    </AuthProvider>
  );
}
