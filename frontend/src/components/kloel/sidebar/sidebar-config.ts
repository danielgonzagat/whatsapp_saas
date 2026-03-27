import {
  LayoutGrid,
  Package,
  Megaphone,
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
    sub: ['Meus Produtos', 'Area de Membros', 'Afiliar-se'],
  },
  {
    icon: 'Megaphone',
    label: 'Marketing',
    key: 'marketing',
    sub: ['Visao Geral', 'Criacao de Site', 'WhatsApp', 'Direct', 'TikTok', 'Messenger', 'Email'],
  },
  {
    icon: 'Palette',
    label: 'Canvas',
    key: 'canvas',
    sub: [],
  },
  {
    icon: 'DollarSign',
    label: 'Vendas',
    key: 'vendas',
    sub: ['Gestao de Vendas', 'Gestao de Assinaturas', 'Gestao Produtos Fisicos'],
  },
  {
    icon: 'Wallet',
    label: 'Carteira',
    key: 'carteira',
    sub: ['Saldo', 'Extrato', 'Movimentacoes do mes', 'Saques', 'Antecipacoes'],
  },
  { icon: 'BarChart3', label: 'Relatorio', key: 'relatorio', sub: [] },
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
    sub: ['Impulsione suas vendas', 'Gerencie seu negocio', 'Ver todas'],
  },
];

// ============================================
// ICON MAP
// ============================================

export const ICON_MAP: Record<string, any> = {
  LayoutGrid,
  Package,
  Megaphone,
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
};

/** Resolve icon name string to lucide component */
export function getIconComponent(name: string) {
  return ICON_MAP[name] || LayoutGrid;
}
