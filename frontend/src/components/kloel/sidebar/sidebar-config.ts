import {
  Package,
  Megaphone,
  Globe,
  Palette,
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
import { HomeIcon } from './HomeIcon';
import { SalesIcon } from './SalesIcon';

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
  { icon: 'HomeIcon', label: 'Home', key: 'home', sub: [] },
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
    sub: ['Conversas', 'WhatsApp', 'Instagram', 'TikTok', 'Facebook', 'Email'],
  },
  {
    icon: 'SalesIcon',
    label: 'Vendas',
    key: 'vendas',
    sub: ['Gestao de Vendas', 'Gestao de Assinaturas', 'Gestao Produtos Fisicos', 'Pipeline CRM'],
  },
  {
    icon: 'Wallet',
    label: 'Carteira',
    key: 'carteira',
    sub: ['Saldo', 'Extrato', 'Saques', 'Antecipacoes'],
  },
  {
    icon: 'BarChart3',
    label: 'Relatórios',
    key: 'relatorio',
    sub: ['Operações', 'Abandonos', 'Assinaturas', 'Estornos'],
  },
];

// ============================================
// ICON MAP
// ============================================

export const ICON_MAP: Record<string, any> = {
  HomeIcon,
  SalesIcon,
  Package,
  Megaphone,
  Globe,
  Palette,
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
  return ICON_MAP[name] || HomeIcon;
}
