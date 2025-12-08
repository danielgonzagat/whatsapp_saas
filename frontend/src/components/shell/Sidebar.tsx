'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  MessageCircle,
  Users,
  Package,
  CreditCard,
  Link2,
  GitBranch,
  Brain,
  Settings,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/whatsapp', icon: MessageCircle, label: 'WhatsApp' },
  { href: '/leads', icon: Users, label: 'Leads' },
  { href: '/products', icon: Package, label: 'Produtos' },
  { href: '/sales', icon: CreditCard, label: 'Vendas' },
  { href: '/payments', icon: Link2, label: 'Integrações' },
  { href: '/flows', icon: GitBranch, label: 'Flow Builder' },
  { href: '/automations', icon: Brain, label: 'Automações' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 bg-[#050608] border-r border-white/5 flex flex-col items-center py-4 z-50">
      {/* Logo */}
      <Link href="/dashboard" className="mb-8">
        <div className="w-10 h-10 rounded-xl bg-[#28E07B] flex items-center justify-center">
          <span className="text-black font-bold text-lg">K</span>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-[#686B73] hover:text-[#A0A3AA] hover:bg-white/5'
              )}
              title={item.label}
            >
              <Icon className="w-5 h-5" />
              
              {/* Active indicator */}
              {isActive && (
                <span className="absolute -left-3 w-1 h-5 bg-[#28E07B] rounded-r-full" />
              )}

              {/* Tooltip */}
              <span className="absolute left-14 px-2 py-1 bg-[#181B20] text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Settings */}
      <Link
        href="/settings"
        className="w-10 h-10 rounded-xl flex items-center justify-center text-[#686B73] hover:text-[#A0A3AA] hover:bg-white/5 transition-all"
        title="Configurações"
      >
        <Settings className="w-5 h-5" />
      </Link>
    </aside>
  );
}
