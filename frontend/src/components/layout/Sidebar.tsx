"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Workflow, 
  LayoutDashboard, 
  MessageSquareText, 
  Sparkles,
  Users,
  CreditCard,
  Settings,
  Smartphone,
  Package,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/chat", icon: MessageSquareText, label: "Chat KLOEL", highlight: true },
    { href: "/whatsapp", icon: Smartphone, label: "WhatsApp" },
    { href: "/leads", icon: Users, label: "Leads" },
    { href: "/sales", icon: CreditCard, label: "Vendas" },
    { href: "/products", icon: Package, label: "Produtos" },
    { href: "/payments", icon: Zap, label: "Integrações" },
    { href: "/flow", icon: Workflow, label: "Flow Builder" },
  ];

  return (
    <aside className="w-64 bg-[#FAFAFA] border-r border-[#E5E5E5] h-screen p-4 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="w-10 h-10 rounded-xl bg-[#1A1A1A] flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[#1A1A1A]">KLOEL</h1>
          <p className="text-xs text-[#A3A3A3]">AI Sales Assistant</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-150",
                isActive
                  ? "bg-[#1A1A1A] text-white shadow-sm"
                  : "text-[#525252] hover:text-[#1A1A1A] hover:bg-[#F0F0F0]",
                item.highlight && !isActive && "relative"
              )}
            >
              <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
              <span className="font-medium text-sm">{item.label}</span>
              {item.highlight && !isActive && (
                <span className="absolute right-3 w-2 h-2 bg-[#3B82F6] rounded-full animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="pt-4 border-t border-[#E5E5E5]">
        <Link
          href="/account"
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-150",
            pathname === "/account"
              ? "bg-[#1A1A1A] text-white"
              : "text-[#525252] hover:text-[#1A1A1A] hover:bg-[#F0F0F0]"
          )}
        >
          <Settings size={18} strokeWidth={1.5} />
          <span className="font-medium text-sm">Configurações</span>
        </Link>
        <div className="mt-4 px-4 py-3 rounded-xl bg-white border border-[#E5E5E5]">
          <p className="text-xs text-[#A3A3A3]">Powered by</p>
          <p className="text-sm font-semibold text-[#1A1A1A]">GPT-4o</p>
        </div>
      </div>
    </aside>
  );
}
