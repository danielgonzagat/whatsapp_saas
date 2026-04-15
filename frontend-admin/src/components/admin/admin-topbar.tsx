'use client';

import { Bell, LogOut, Settings as SettingsIcon, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AdminThemeToggle } from '@/components/admin/admin-theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAdminSession } from '@/lib/auth/admin-session-context';

const ROLE_VARIANT: Record<string, 'ember' | 'warning' | 'default'> = {
  OWNER: 'ember',
  MANAGER: 'warning',
  STAFF: 'default',
};

export function AdminTopbar() {
  const router = useRouter();
  const { admin, logout } = useAdminSession();

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background/60 px-6 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="hidden md:inline-flex">
          adm.kloel.com
        </Badge>
      </div>
      <div className="flex items-center gap-3">
        <AdminThemeToggle />
        <button
          type="button"
          aria-label="Notificações"
          className="relative flex size-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <Bell className="size-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1 transition-colors hover:border-border"
              aria-label="Menu do usuário"
            >
              <Avatar>
                <AvatarFallback>{admin?.name?.slice(0, 2).toUpperCase() ?? '—'}</AvatarFallback>
              </Avatar>
              <span className="hidden text-xs text-muted-foreground md:inline">
                {admin?.name ?? '—'}
              </span>
              {admin ? (
                <Badge variant={ROLE_VARIANT[admin.role] ?? 'default'}>{admin.role}</Badge>
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{admin?.email ?? 'Sessão anônima'}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push('/perfil')}>
              <User className="size-4" />
              <span>Meu perfil</span>
            </DropdownMenuItem>
            {admin?.role === 'OWNER' ? (
              <DropdownMenuItem onSelect={() => router.push('/configuracoes')}>
                <SettingsIcon className="size-4" />
                <span>Configurações</span>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout}>
              <LogOut className="size-4" />
              <span>Sair</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
