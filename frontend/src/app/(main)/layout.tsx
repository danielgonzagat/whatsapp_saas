import type { Metadata } from "next";
import { AuthProvider } from "@/components/kloel/auth/auth-provider";

export const metadata: Metadata = {
  title: "KLOEL - IA para WhatsApp",
  description: "A IA que vende por você no WhatsApp",
};

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#F8F8F8]">
      <AuthProvider>{children}</AuthProvider>
    </main>
  );
}
