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
    sub: ['Meus Produtos', 'Area de Membros', 'Afiliar-se'],
  },
  {
    icon: 'Megaphone',
    label: 'Marketing',
    key: 'marketing',
    sub: ['Visao Geral', 'Criacao de Site', 'WhatsApp', 'Instagram', 'TikTok', 'Facebook', 'Email'],
  },
  {
    icon: 'Target',
    label: 'Anuncios',
    key: 'anuncios',
    sub: ['War Room', 'Meta Ads', 'Google Ads', 'TikTok Ads', 'Rastreamento', 'Regras IA'],
  },
  {
    icon: 'Palette',
    label: 'Canvas',
    key: 'canvas',
    sub: ['Inicio', 'Criar', 'Projetos', 'Modelos'],
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
    label: 'Relatorio',
    key: 'relatorio',
    sub: [
      'Vendas', 'After Pay', 'Churn Rate', 'Abandonos',
      'Desemp. Afiliados', 'Indicadores', 'Assinaturas',
      'Indicadores Produto', 'Motivos Recusa', 'Origem Vendas',
      'Metricas Produtos', 'Estornos', 'Hist. Chargeback',
    ],
  },
  {
    icon: 'Users',
    label: 'Parcerias',
    key: 'parcerias',
    sub: ['Central de colaboradores', 'Afiliados e Produtores', 'Chat'],
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
  Target,
};

/** Resolve icon name string to lucide component */
export function getIconComponent(name: string) {
  return ICON_MAP[name] || LayoutGrid;
}
