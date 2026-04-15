import {
  BarChart3,
  Building2,
  FileText,
  GitBranch,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  MessageSquare,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  User,
  Wallet,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

export type AdminSidebarIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface AdminSidebarItem {
  key: string;
  label: string;
  href?: string;
  icon: AdminSidebarIcon;
  /** Required role floor. If the user's role is below this, the item is hidden. */
  minRole?: 'OWNER' | 'MANAGER' | 'STAFF';
}

export interface AdminSidebarSection {
  key: string;
  items: AdminSidebarItem[];
}

export const ADMIN_SIDEBAR_SECTIONS: readonly AdminSidebarSection[] = [
  {
    key: 'ai-utils',
    items: [
      { key: 'new-chat', label: 'Novo chat', icon: Plus },
      { key: 'search', label: 'Buscar', icon: Search },
    ],
  },
  {
    key: 'operational',
    items: [
      { key: 'home', label: 'Home', href: '/', icon: LayoutDashboard },
      { key: 'produtos', label: 'Produtos', href: '/produtos', icon: Package },
      { key: 'marketing', label: 'Marketing', href: '/marketing', icon: MessageSquare },
      { key: 'vendas', label: 'Vendas', href: '/vendas', icon: LineChart },
      { key: 'carteira', label: 'Carteira', href: '/carteira', icon: Wallet },
      { key: 'relatorios', label: 'Relatórios', href: '/relatorios', icon: BarChart3 },
    ],
  },
  {
    key: 'admin-control',
    items: [
      { key: 'contas', label: 'Contas', href: '/contas', icon: Building2 },
      { key: 'compliance', label: 'Compliance', href: '/compliance', icon: ShieldCheck },
      { key: 'clientes', label: 'Clientes', href: '/clientes', icon: LifeBuoy },
    ],
  },
  {
    key: 'platform',
    items: [
      {
        key: 'configuracoes',
        label: 'Configurações',
        href: '/configuracoes',
        icon: Settings,
        minRole: 'OWNER',
      },
      { key: 'audit', label: 'Audit log', href: '/audit', icon: FileText },
      { key: 'perfil', label: 'Perfil', href: '/perfil', icon: User },
    ],
  },
] as const;

export const SUB_PROJECT_ICON: AdminSidebarIcon = GitBranch;
