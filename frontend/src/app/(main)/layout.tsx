import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
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
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#050608' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col ml-16">
        <Topbar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
