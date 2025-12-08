'use client';

/**
 * ============================================
 * EMPTY STATES LIBRARY
 * ============================================
 * Biblioteca de empty states contextuais para todas as páginas.
 * "Nunca deixe o usuário olhando para o vazio."
 * 
 * Cada empty state tem:
 * - Ilustração/ícone contextual
 * - Mensagem principal clara
 * - Sugestão de ação imediata
 * - Prompt opcional para o agente
 * ============================================
 */

import { ReactNode } from 'react';
import {
  MessageSquare,
  Users,
  Package,
  BarChart3,
  Zap,
  Bot,
  CreditCard,
  Settings,
  Search,
  FileText,
  Phone,
  Mail,
  Calendar,
  Inbox,
  Send,
  TrendingUp,
  Target,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, radius } from '@/lib/design-tokens';

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

export interface EmptyStateConfig {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionPrompt?: string; // Prompt para preencher no composer
  secondaryAction?: {
    label: string;
    prompt?: string;
  };
}

export interface ContextualEmptyStateProps {
  /** Context/page type */
  context: keyof typeof EMPTY_STATE_CONFIGS;
  /** Variant of empty state */
  variant?: EmptyStateVariant;
  /** Override title */
  title?: string;
  /** Override description */
  description?: string;
  /** Primary action callback */
  onAction?: () => void;
  /** Fill composer with prompt */
  onFillComposer?: (prompt: string) => void;
  /** Secondary action callback */
  onSecondaryAction?: () => void;
  /** Custom icon */
  icon?: LucideIcon;
  /** Additional class */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
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
    description: 'Você não tem mensagens pendentes. 🎉',
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

const VARIANT_STYLES: Record<EmptyStateVariant, {
  bgColor: string;
  iconColor: string;
  borderColor?: string;
}> = {
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
    bgColor: `${colors.state.warning}10`,
    iconColor: colors.state.warning,
    borderColor: `${colors.state.warning}30`,
  },
  error: {
    bgColor: `${colors.state.error}10`,
    iconColor: colors.state.error,
    borderColor: `${colors.state.error}30`,
  },
  success: {
    bgColor: `${colors.state.success}10`,
    iconColor: colors.state.success,
    borderColor: `${colors.state.success}30`,
  },
};

const SIZE_STYLES = {
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

// ============================================
// COMPONENT
// ============================================

export function ContextualEmptyState({
  context,
  variant = 'default',
  title: customTitle,
  description: customDescription,
  onAction,
  onFillComposer,
  onSecondaryAction,
  icon: customIcon,
  className,
  size = 'md',
}: ContextualEmptyStateProps) {
  const config = EMPTY_STATE_CONFIGS[context] || EMPTY_STATE_CONFIGS.generic;
  const variantStyle = VARIANT_STYLES[variant];
  const sizeStyle = SIZE_STYLES[size];
  
  const Icon = customIcon || config.icon;
  const title = customTitle || config.title;
  const description = customDescription || config.description;

  const handlePrimaryAction = () => {
    if (onAction) {
      onAction();
    } else if (onFillComposer && config.actionPrompt) {
      onFillComposer(config.actionPrompt);
    }
  };

  const handleSecondaryAction = () => {
    if (onSecondaryAction) {
      onSecondaryAction();
    } else if (onFillComposer && config.secondaryAction?.prompt) {
      onFillComposer(config.secondaryAction.prompt);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-2xl',
        sizeStyle.padding,
        className
      )}
      style={{
        backgroundColor: variantStyle.bgColor,
        border: variantStyle.borderColor 
          ? `1px solid ${variantStyle.borderColor}` 
          : `1px dashed ${colors.stroke}`,
      }}
    >
      {/* Icon */}
      <div 
        className={cn(
          'rounded-2xl flex items-center justify-center mb-4',
          sizeStyle.iconBox
        )}
        style={{ 
          backgroundColor: `${variantStyle.iconColor}15`,
        }}
      >
        <Icon 
          className={sizeStyle.iconSize} 
          style={{ color: variantStyle.iconColor }} 
        />
      </div>

      {/* Title */}
      <h3 
        className={cn('font-semibold', sizeStyle.title)}
        style={{ color: colors.text.primary }}
      >
        {title}
      </h3>

      {/* Description */}
      <p 
        className={cn('mt-1.5 max-w-sm', sizeStyle.description)}
        style={{ color: colors.text.muted }}
      >
        {description}
      </p>

      {/* Actions */}
      {(config.actionLabel || config.secondaryAction) && (
        <div className="flex items-center gap-3 mt-5">
          {config.actionLabel && (
            <button
              type="button"
              onClick={handlePrimaryAction}
              className={cn(
                'rounded-lg font-medium transition-all hover:opacity-90',
                sizeStyle.buttonSize
              )}
              style={{
                backgroundColor: colors.brand.green,
                color: colors.background.obsidian,
              }}
            >
              {config.actionLabel}
            </button>
          )}
          
          {config.secondaryAction && (
            <button
              type="button"
              onClick={handleSecondaryAction}
              className={cn(
                'rounded-lg font-medium transition-all hover:bg-white/5',
                sizeStyle.buttonSize
              )}
              style={{
                backgroundColor: 'transparent',
                color: colors.text.secondary,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              {config.secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// SIMPLE INLINE EMPTY STATE
// ============================================

interface InlineEmptyStateProps {
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function InlineEmptyState({ message, action, className }: InlineEmptyStateProps) {
  return (
    <div 
      className={cn('flex items-center justify-center gap-3 py-6 px-4', className)}
      style={{ color: colors.text.muted }}
    >
      <span className="text-sm">{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-sm font-medium hover:underline"
          style={{ color: colors.brand.cyan }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ============================================
// SKELETON PLACEHOLDER
// ============================================

interface SkeletonEmptyStateProps {
  lines?: number;
  className?: string;
}

export function SkeletonEmptyState({ lines = 3, className }: SkeletonEmptyStateProps) {
  return (
    <div className={cn('animate-pulse space-y-3', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div 
          key={i}
          className="h-4 rounded"
          style={{ 
            backgroundColor: colors.background.surface2,
            width: i === lines - 1 ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  );
}

export default ContextualEmptyState;
