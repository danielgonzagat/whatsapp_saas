import {
  LayoutGrid,
  Package,
  Megaphone,
  DollarSign,
  Wallet,
  BarChart3,
  Users,
  Wrench,
  Plus,
  Search,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

export interface NavItem {
  icon: string;
  label: string;
  key: string;
  sub: string[];
}

// ============================================
// NAVIGATION CONFIG
// ============================================

export const NAV: NavItem[] = [
  { icon: 'LayoutGrid', label: 'Dashboard', key: 'dashboard', sub: [] },
  {
    icon: 'Package',
    label: 'Produtos',
    key: 'produtos',
    sub: ['Meus Produtos', 'Área de Membros', 'Afiliar-se'],
  },
  {
    icon: 'Megaphone',
    label: 'Marketing',
    key: 'marketing',
    sub: ['Criação de Site', 'WhatsApp', 'Direct', 'TikTok', 'Messenger', 'Email'],
  },
  {
    icon: 'DollarSign',
    label: 'Vendas',
    key: 'vendas',
    sub: ['Gestão de Vendas', 'Gestão de Assinaturas', 'Gestão Produtos Físicos'],
  },
  {
    icon: 'Wallet',
    label: 'Carteira',
    key: 'carteira',
    sub: ['Saldo', 'Extrato', 'Movimentações do mês', 'Saques', 'Antecipações'],
  },
  { icon: 'BarChart3', label: 'Relatório', key: 'relatorio', sub: [] },
  {
    icon: 'Users',
    label: 'Parcerias',
    key: 'parcerias',
    sub: ['Central de colaboradores', 'Afiliados', 'Chat com Afiliados'],
  },
  {
    icon: 'Wrench',
    label: 'Ferramentas',
    key: 'ferramentas',
    sub: ['Impulsione suas vendas', 'Gerencie seu negócio', 'Ver todas'],
  },
];

// ============================================
// ICON MAP
// ============================================

export const ICON_MAP: Record<string, any> = {
  LayoutGrid,
  Package,
  Megaphone,
  DollarSign,
  Wallet,
  BarChart3,
  Users,
  Wrench,
  Plus,
  Search,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
};

/** Resolve icon name string to lucide component */
export function getIconComponent(name: string) {
  return ICON_MAP[name] || LayoutGrid;
}
