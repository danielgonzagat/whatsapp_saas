/**
 * ============================================
 * EMPTY STATES — Pure Data
 * ============================================
 * Pure config tables extracted from EmptyStates.tsx so the component file
 * stays focused on rendering logic. No React imports here — only design
 * tokens and lucide icon refs.
 * ============================================
 */

import { colors } from '@/lib/design-tokens';
import {
  BarChart3,
  Bot,
  Calendar,
  CreditCard,
  FileText,
  Inbox,
  type LucideIcon,
  MessageSquare,
  Package,
  Phone,
  Search,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

export type EmptyStateVariant =
  | 'default'
  | 'no-data'
  | 'no-results'
  | 'no-connection'
  | 'error'
  | 'success';

/** Empty state config shape. */
export interface EmptyStateConfig {
  /** Icon property. */
  icon: LucideIcon;
  /** Title property. */
  title: string;
  /** Description property. */
  description: string;
  /** Action label property. */
  actionLabel?: string;
  /** Action prompt property. */
  actionPrompt?: string; // Prompt para preencher no composer
  /** Secondary action property. */
  secondaryAction?: {
    label: string;
    prompt?: string;
  };
}

/** Variant style shape — colors per variant. */
export interface VariantStyle {
  /** Background color. */
  bgColor: string;
  /** Icon color. */
  iconColor: string;
  /** Optional border color. */
  borderColor?: string;
}

/** Size style shape — Tailwind class fragments per size. */
export interface SizeStyle {
  /** Icon container box classes. */
  iconBox: string;
  /** Icon size classes. */
  iconSize: string;
  /** Title font-size classes. */
  title: string;
  /** Description font-size classes. */
  description: string;
  /** Outer padding classes. */
  padding: string;
  /** Button size classes. */
  buttonSize: string;
}

// ============================================
// EMPTY STATE CONFIGURATIONS
// ============================================

export const EMPTY_STATE_CONFIGS: Record<string, EmptyStateConfig> = {
  // Conversations
  conversations: {
    icon: MessageSquare,
    title: 'Nenhuma conversa ainda',
    description: 'Conecte seu WhatsApp para começar a receber mensagens automaticamente.',
    actionLabel: 'Conectar WhatsApp',
    actionPrompt: 'Quero conectar meu WhatsApp agora',
  },

  conversationsNoResults: {
    icon: Search,
    title: 'Nenhuma conversa encontrada',
    description: 'Tente ajustar os filtros ou buscar por outro termo.',
    actionLabel: 'Limpar filtros',
  },

  // Leads
  leads: {
    icon: Users,
    title: 'Nenhum lead ainda',
    description: 'Leads serão criados automaticamente quando você receber mensagens.',
    actionLabel: 'Importar leads',
    actionPrompt: 'Quero importar minha lista de contatos',
    secondaryAction: {
      label: 'Criar lead manualmente',
      prompt: 'Criar novo lead com nome e telefone',
    },
  },

  leadsNoResults: {
    icon: Search,
    title: 'Nenhum lead encontrado',
    description: 'Ajuste os filtros ou busque por nome, telefone ou email.',
    actionLabel: 'Limpar filtros',
  },

  // Products
  products: {
    icon: Package,
    title: 'Nenhum produto cadastrado',
    description: 'Cadastre seus produtos para que o agente possa apresentá-los aos clientes.',
    actionLabel: 'Adicionar produto',
    actionPrompt: 'Quero cadastrar meu primeiro produto',
    secondaryAction: {
      label: 'Importar de catálogo',
      prompt: 'Importar produtos do meu catálogo PDF',
    },
  },

  productsNoResults: {
    icon: Search,
    title: 'Nenhum produto encontrado',
    description: 'Tente buscar por outro nome ou categoria.',
    actionLabel: 'Ver todos produtos',
  },

  // Campaigns
  campaigns: {
    icon: Zap,
    title: 'Nenhuma campanha criada',
    description: 'Crie campanhas para enviar mensagens em massa para seus contatos.',
    actionLabel: 'Criar campanha',
    actionPrompt: 'Quero criar uma campanha de vendas',
    secondaryAction: {
      label: 'Ver templates',
      prompt: 'Mostrar templates de campanhas prontos',
    },
  },

  campaignsNoResults: {
    icon: Search,
    title: 'Nenhuma campanha encontrada',
    description: 'Ajuste os filtros de status ou período.',
    actionLabel: 'Ver todas campanhas',
  },

  // Sales
  sales: {
    icon: CreditCard,
    title: 'Nenhuma venda registrada',
    description: 'Vendas aparecerão aqui quando você fechar negócios pelo WhatsApp.',
    actionLabel: 'Registrar venda manual',
    actionPrompt: 'Registrar uma venda manual',
    secondaryAction: {
      label: 'Ver pipeline',
      prompt: 'Mostrar meu pipeline de vendas',
    },
  },

  salesNoResults: {
    icon: Search,
    title: 'Nenhuma venda encontrada',
    description: 'Ajuste o período ou status para ver mais resultados.',
    actionLabel: 'Ver todas vendas',
  },

  // Analytics
  analytics: {
    icon: BarChart3,
    title: 'Dados insuficientes',
    description: 'Comece a usar o sistema para ver métricas e insights aqui.',
    actionLabel: 'Conectar WhatsApp',
    actionPrompt: 'Quero conectar meu WhatsApp para começar a coletar dados',
  },

  analyticsNoData: {
    icon: TrendingUp,
    title: 'Sem dados neste período',
    description: 'Selecione outro período para ver os dados disponíveis.',
    actionLabel: 'Últimos 30 dias',
  },

  // Autopilot
  autopilot: {
    icon: Bot,
    title: 'Autopilot desativado',
    description: 'Ative o Autopilot para que o agente responda automaticamente.',
    actionLabel: 'Ativar Autopilot',
    actionPrompt: 'Ativar o Autopilot agora',
    secondaryAction: {
      label: 'Ver configurações',
      prompt: 'Configurar regras do Autopilot',
    },
  },

  autopilotNoActivity: {
    icon: Bot,
    title: 'Nenhuma atividade recente',
    description: 'O Autopilot está ativo mas não houve atividade nas últimas horas.',
    actionLabel: 'Ver histórico',
  },

  // Inbox
  inbox: {
    icon: Inbox,
    title: 'Inbox vazia',
    description: 'Todas as conversas pendentes aparecerão aqui.',
    actionLabel: 'Atualizar',
  },

  inboxNoUnread: {
    icon: Inbox,
    title: 'Tudo em dia!',
    description: 'Voce nao tem mensagens pendentes.',
    actionLabel: 'Ver todas conversas',
  },

  // Follow-ups
  followUps: {
    icon: Calendar,
    title: 'Nenhum follow-up agendado',
    description: 'Agende follow-ups para não perder oportunidades de venda.',
    actionLabel: 'Agendar follow-up',
    actionPrompt: 'Agendar um follow-up para o lead Maria Santos',
  },

  followUpsNoToday: {
    icon: Calendar,
    title: 'Nenhum follow-up para hoje',
    description: 'Você está livre! Aproveite para prospectar novos leads.',
    actionLabel: 'Ver próximos dias',
  },

  // Search
  searchNoResults: {
    icon: Search,
    title: 'Nenhum resultado',
    description: 'Tente buscar com outros termos ou verifique a ortografia.',
    actionLabel: 'Limpar busca',
  },

  // Connection
  noConnection: {
    icon: Phone,
    title: 'WhatsApp não conectado',
    description: 'Conecte seu número para começar a usar todas as funcionalidades.',
    actionLabel: 'Conectar agora',
    actionPrompt: 'Quero conectar meu WhatsApp',
  },

  connectionLost: {
    icon: Phone,
    title: 'Conexão perdida',
    description: 'A conexão com o WhatsApp foi perdida. Reconecte para continuar.',
    actionLabel: 'Reconectar',
    actionPrompt: 'Reconectar meu WhatsApp',
  },

  // Anúncios
  anuncios: {
    icon: Target,
    title: 'Conecte sua primeira conta de anuncios',
    description:
      'Vincule suas contas de Meta Ads, Google Ads ou TikTok Ads para gerenciar campanhas em um so lugar.',
    actionLabel: 'Conectar conta de anuncios',
    actionPrompt: 'Quero conectar minha conta de Meta Ads',
  },

  // Generic
  generic: {
    icon: FileText,
    title: 'Nada aqui ainda',
    description: 'Comece adicionando seu primeiro item.',
    actionLabel: 'Adicionar',
  },
};

// ============================================
// VARIANT STYLES
// ============================================

export const VARIANT_STYLES: Record<EmptyStateVariant, VariantStyle> = {
  default: {
    bgColor: colors.background.surface1,
    iconColor: colors.text.muted,
  },
  'no-data': {
    bgColor: colors.background.surface1,
    iconColor: colors.brand.cyan,
  },
  'no-results': {
    bgColor: colors.background.surface1,
    iconColor: colors.text.secondary,
  },
  'no-connection': {
    bgColor: 'rgba(110, 110, 115, 0.06)',
    iconColor: colors.state.warning,
    borderColor: 'rgba(110, 110, 115, 0.19)',
  },
  error: {
    bgColor: 'rgba(232, 93, 48, 0.06)',
    iconColor: colors.state.error,
    borderColor: 'rgba(232, 93, 48, 0.19)',
  },
  success: {
    bgColor: 'rgba(224, 221, 216, 0.06)',
    iconColor: colors.state.success,
    borderColor: 'rgba(224, 221, 216, 0.19)',
  },
};

// ============================================
// SIZE STYLES
// ============================================

export const SIZE_STYLES: Record<'sm' | 'md' | 'lg', SizeStyle> = {
  sm: {
    iconBox: 'w-12 h-12',
    iconSize: 'w-6 h-6',
    title: 'text-base',
    description: 'text-xs',
    padding: 'py-8 px-4',
    buttonSize: 'px-3 py-1.5 text-xs',
  },
  md: {
    iconBox: 'w-16 h-16',
    iconSize: 'w-8 h-8',
    title: 'text-lg',
    description: 'text-sm',
    padding: 'py-12 px-4',
    buttonSize: 'px-4 py-2 text-sm',
  },
  lg: {
    iconBox: 'w-20 h-20',
    iconSize: 'w-10 h-10',
    title: 'text-xl',
    description: 'text-base',
    padding: 'py-16 px-6',
    buttonSize: 'px-5 py-2.5 text-base',
  },
};
