import {
  LayoutGrid,
  Package,
  Megaphone,
  Globe,
  Palette,
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
  Target,
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
// SIDEBAR DIMENSIONS — Monitor
// ============================================

export const SIDEBAR_WIDTH_COLLAPSED = 52;
export const SIDEBAR_WIDTH_EXPANDED = 240;

// ============================================
// NAVIGATION CONFIG
// ============================================

export const NAV: NavItem[] = [
  { icon: 'LayoutGrid', label: 'Dashboard', key: 'dashboard', sub: [] },
  {
    icon: 'Package',
    label: 'Produtos',
    key: 'produtos',
    sub: ['Meus Produtos', 'Afiliar-se'],
  },
  {
    icon: 'Megaphone',
    label: 'Marketing',
    key: 'marketing',
    sub: ['Visao Geral', 'WhatsApp', 'Instagram', 'TikTok', 'Facebook', 'Email'],
  },
  {
    icon: 'DollarSign',
    label: 'Vendas',
    key: 'vendas',
    sub: ['Gestao de Vendas', 'Gestao de Assinaturas', 'Gestao Produtos Fisicos', 'Pipeline CRM'],
  },
  {
    icon: 'Wallet',
    label: 'Carteira',
    key: 'carteira',
    sub: ['Saldo', 'Extrato', 'Movimentacoes do mes', 'Saques', 'Antecipacoes'],
  },
  {
    icon: 'BarChart3',
    label: 'Relatórios',
    key: 'relatorio',
    sub: ['Vendas', 'Abandonos', 'Assinaturas', 'Estornos'],
  },
];

// ============================================
// ICON MAP
// ============================================

export const ICON_MAP: Record<string, any> = {
  LayoutGrid,
  Package,
  Megaphone,
  Globe,
  Palette,
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
  Target,
};

/** Resolve icon name string to lucide component */
export function getIconComponent(name: string) {
  return ICON_MAP[name] || LayoutGrid;
}
