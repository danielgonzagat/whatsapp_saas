'use client';

import { useSession, signOut } from 'next-auth/react';
import { Bell, HelpCircle, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function Topbar() {
  const { data: session } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userName = session?.user?.name || session?.user?.email?.split('@')[0] || 'Usuário';
  const userInitials = userName.slice(0, 2).toUpperCase();

  return (
    <header className="fixed top-0 left-16 right-0 h-14 bg-[#050608]/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6 z-40">
      {/* Left - Logo text */}
      <div className="flex items-center gap-3">
        <span className="text-white font-semibold text-lg tracking-tight">KLOEL</span>
        <span className="text-[#686B73] text-sm">·</span>
        <span className="text-[#686B73] text-sm">Plano Gratuito</span>
        <button className="text-[#28E07B] text-sm hover:underline">
          Fazer upgrade
        </button>
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-2">
        {/* Help */}
        <button className="p-2 rounded-lg text-[#686B73] hover:text-[#A0A3AA] hover:bg-white/5 transition-colors">
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-[#686B73] hover:text-[#A0A3AA] hover:bg-white/5 transition-colors">
          <Bell className="w-5 h-5" />
          {/* Notification badge */}
          <span className="absolute top-1 right-1 w-2 h-2 bg-[#28E07B] rounded-full" />
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#28E07B] to-[#1FC66A] flex items-center justify-center">
              <span className="text-black text-xs font-semibold">{userInitials}</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-[#686B73] transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 top-12 w-48 bg-[#111317] border border-white/10 rounded-xl shadow-2xl py-1 z-50">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-white text-sm font-medium truncate">{userName}</p>
                <p className="text-[#686B73] text-xs truncate">{session?.user?.email}</p>
              </div>
              <button
                onClick={() => signOut()}
                className="w-full px-4 py-2 text-left text-sm text-[#A0A3AA] hover:text-white hover:bg-white/5 transition-colors"
              >
                Sair da conta
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
