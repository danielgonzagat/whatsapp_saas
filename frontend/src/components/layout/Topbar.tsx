'use client';

import { usePathname } from 'next/navigation';
import { Bell, Settings, Search } from 'lucide-react';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/chat': 'Chat com KLOEL',
  '/flow': 'Flow Builder',
};

export function Topbar() {
  const pathname = usePathname();
  const title = pageTitles[pathname] || 'WhatsApp SaaS';

  return (
    <header className="h-16 border-b border-[#2A2A3E] bg-[#0D0D12] flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-white">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1A1A24] transition-colors">
          <Search className="w-5 h-5" />
        </button>
        
        {/* Notifications */}
        <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1A1A24] transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-[#00FFA3] rounded-full" />
        </button>
        
        {/* Settings */}
        <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1A1A24] transition-colors">
          <Settings className="w-5 h-5" />
        </button>

        {/* User Avatar */}
        <div className="ml-2 w-8 h-8 rounded-full bg-gradient-to-r from-[#00FFA3] to-[#00D4FF] flex items-center justify-center">
          <span className="text-xs font-bold text-black">U</span>
        </div>
      </div>
    </header>
  );
}
