import {
  BarChart3,
  Globe,
  type LucideIcon,
  Megaphone,
  Package,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Target,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { HomeIcon } from './HomeIcon';
import { SalesIcon } from './SalesIcon';

// ============================================
// TYPES
// ============================================

export interface NavItem {
  /** Icon property. */
  icon: string;
  /** Label property. */
  label: string;
  /** Key property. */
  key: string;
  /** Sub property. */
  sub: string[];
}

// ============================================
// SIDEBAR DIMENSIONS — Monitor
// ============================================

export const SIDEBAR_WIDTH_COLLAPSED = 52;
/** Sidebar_width_expanded. */
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

export type IconComponent = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;

/** Icon_map. */
export const ICON_MAP: Record<string, IconComponent> = {
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
