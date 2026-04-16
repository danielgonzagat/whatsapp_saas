'use client';

import { ChevronUp, LogOut, Moon, Settings, Sun, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { useAdminSession } from '@/lib/auth/admin-session-context';

function initialsFromName(name?: string | null) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'A';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]?.slice(0, 1).toUpperCase() || 'A';
  return `${parts[0]?.slice(0, 1) || ''}${parts[parts.length - 1]?.slice(0, 1) || ''}`.toUpperCase();
}

export function AdminSidebarUserMenu({ expanded }: { expanded: boolean }) {
  const router = useRouter();
  const { admin, logout } = useAdminSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const isDark = mounted && resolvedTheme === 'dark';
  const initials = useMemo(() => initialsFromName(admin?.name), [admin?.name]);

  async function handleLogout() {
    setOpen(false);
    await logout();
    router.replace('/login');
  }

  const menuButtonClasses =
    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-hover)] hover:text-[var(--app-text-primary)]';

  return (
    <div ref={containerRef} className={`relative ${expanded ? 'p-3 pt-4' : 'p-1.5 pt-4'}`}>
      <div className="border-t border-[var(--app-border-subtle)] pt-3">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--app-bg-hover)]"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            {initials}
          </span>

          {expanded ? (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13px] font-semibold text-[var(--app-text-primary)]">
                  {admin?.name || 'Administrador'}
                </span>
                <span className="block truncate text-[11px] text-[var(--app-text-tertiary)]">
                  {admin?.role || 'STAFF'}
                </span>
              </span>
              <ChevronUp
                size={14}
                className={`text-[var(--app-text-tertiary)] transition-transform ${open ? 'rotate-0' : 'rotate-180'}`}
                aria-hidden="true"
              />
            </>
          ) : null}
        </button>
      </div>

      {open ? (
        <div
          className={`absolute bottom-20 z-50 overflow-hidden rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] shadow-[var(--app-shadow-lg)] ${
            expanded ? 'left-3 right-3' : 'left-14 w-64'
          }`}
        >
          <div className="border-b border-[var(--app-border-subtle)] px-4 py-3">
            <div className="truncate text-[12px] font-semibold text-[var(--app-text-primary)]">
              {admin?.name || 'Administrador'}
            </div>
            <div className="truncate text-[11px] text-[var(--app-text-secondary)]">
              {admin?.email || 'Sem email'}
            </div>
          </div>

          <div className="border-b border-[var(--app-border-subtle)] p-2">
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={menuButtonClasses}
            >
              {isDark ? (
                <Sun size={16} aria-hidden="true" />
              ) : (
                <Moon size={16} aria-hidden="true" />
              )}
              <span>{isDark ? 'Tema claro' : 'Tema escuro'}</span>
            </button>
          </div>

          <div className="p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push('/perfil');
              }}
              className={menuButtonClasses}
            >
              <User size={16} aria-hidden="true" />
              <span>Perfil</span>
            </button>

            {admin?.role === 'OWNER' ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push('/configuracoes');
                }}
                className={menuButtonClasses}
              >
                <Settings size={16} aria-hidden="true" />
                <span>Configurações da conta</span>
              </button>
            ) : null}

            <button type="button" onClick={handleLogout} className={menuButtonClasses}>
              <LogOut size={16} aria-hidden="true" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
