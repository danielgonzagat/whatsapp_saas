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
  Brain,
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
    <aside className="w-64 bg-[#0D0D12] border-r border-[#2A2A3E] h-screen p-4 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#00FFA3] to-[#00D4FF] flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-black" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">KLOEL</h1>
          <p className="text-xs text-gray-500">WhatsApp SaaS</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-2 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-[#00FFA3]/20 to-[#00D4FF]/20 text-[#00FFA3] border border-[#00FFA3]/30"
                  : "text-gray-400 hover:text-white hover:bg-[#1A1A24]",
                item.highlight && !isActive && "relative"
              )}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
              {item.highlight && !isActive && (
                <span className="absolute right-3 w-2 h-2 bg-[#00FFA3] rounded-full animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="pt-4 border-t border-[#2A2A3E]">
        <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-[#00FFA3]/10 to-[#00D4FF]/10 border border-[#2A2A3E]">
          <p className="text-xs text-gray-400">Powered by</p>
          <p className="text-sm font-semibold text-[#00FFA3]">GPT-4o</p>
        </div>
      </div>
    </aside>
  );
}
