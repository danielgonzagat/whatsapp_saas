'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Bell, Settings, Search, User } from 'lucide-react';

const pageTitles: Record<string, string> = {
  '/': 'Início',
  '/chat': 'Chat com KLOEL',
  '/flow': 'Flow Builder',
  '/whatsapp': 'WhatsApp',
  '/leads': 'Leads',
  '/sales': 'Vendas',
  '/products': 'Produtos',
  '/payments': 'Integrações',
  '/account': 'Configurações',
  '/pricing': 'Preços',
};

export function Topbar() {
  const pathname = usePathname();
  const title = pageTitles[pathname] || 'KLOEL';

  return (
    <header className="h-16 border-b border-[#E5E5E5] bg-white/80 backdrop-blur-xl flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-[#1A1A1A]">{title}</h1>
      </div>

      <div className="flex items-center gap-1">
        {/* Search */}
        <button className="p-2.5 rounded-xl text-[#525252] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] transition-all duration-150">
          <Search className="w-5 h-5" strokeWidth={1.5} />
        </button>
        
        {/* Notifications */}
        <button className="p-2.5 rounded-xl text-[#525252] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] transition-all duration-150 relative">
          <Bell className="w-5 h-5" strokeWidth={1.5} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-[#3B82F6] rounded-full" />
        </button>
        
        {/* Settings */}
        <Link 
          href="/account"
          className="p-2.5 rounded-xl text-[#525252] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] transition-all duration-150"
        >
          <Settings className="w-5 h-5" strokeWidth={1.5} />
        </Link>

        {/* User Avatar */}
        <div className="ml-2 w-9 h-9 rounded-full bg-[#1A1A1A] flex items-center justify-center cursor-pointer hover:bg-[#333] transition-colors">
          <User className="w-4 h-4 text-white" strokeWidth={1.5} />
        </div>
      </div>
    </header>
  );
}
