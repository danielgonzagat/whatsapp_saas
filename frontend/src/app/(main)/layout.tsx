import { AppShell } from "@/components/kloel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KLOEL - IA para WhatsApp",
  description: "A IA que vende por você no WhatsApp",
};

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell autopilotActive={false}>{children}</AppShell>;
}
