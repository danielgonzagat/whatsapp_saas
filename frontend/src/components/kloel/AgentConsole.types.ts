import type { ElementType } from 'react';
import { colors } from '@/lib/design-tokens';
import {
  AlertCircle,
  Brain,
  CheckCircle,
  Clock,
  LoaderCircle,
  MessageSquare,
  Send,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';

export type ActivityType =
  | 'message_received'
  | 'message_sent'
  | 'action_executed'
  | 'lead_qualified'
  | 'follow_up_scheduled'
  | 'agent_thinking'
  | 'error'
  | 'connection_status';

export type ActivityStatus = 'pending' | 'success' | 'error';

export interface AgentActivity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: Date;
  status: ActivityStatus;
  metadata?: {
    contactName?: string;
    contactPhone?: string;
    messagePreview?: string;
    actionType?: string;
    capabilityCode?: string;
    tacticCode?: string;
    conversationId?: string;
    workItemId?: string;
    conversationProofId?: string;
    accountProofId?: string;
    cycleProofId?: string;
    selectedActionUtility?: number;
    selectedActionRank?: number;
    betterActionCount?: number;
    betterExecutableActionCount?: number;
    nextBestActionType?: string;
    nextBestActionUtility?: number;
    selectedTactic?: string;
    selectedTacticUtility?: number;
    selectedTacticRank?: number;
    betterTacticCount?: number;
    nextBestTactic?: string;
    nextBestTacticUtility?: number;
    utility?: number;
    state?: string;
    leadScore?: number;
    scheduledFor?: Date;
    errorMessage?: string;
  };
}

export interface AgentStats {
  messagesReceived: number;
  messagesSent: number;
  actionsExecuted: number;
  leadsQualified: number;
  activeConversations: number;
  avgResponseTime: string;
}

export interface AgentConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
  activities?: AgentActivity[];
  stats?: AgentStats;
  isConnected?: boolean;
  isThinking?: boolean;
  className?: string;
}

export const ACTIVITY_CONFIG: Record<
  ActivityType,
  {
    icon: ElementType;
    color: string;
    label: string;
  }
> = {
  message_received: {
    icon: MessageSquare,
    color: colors.brand.cyan,
    label: 'Mensagem Recebida',
  },
  message_sent: {
    icon: Send,
    color: colors.brand.green,
    label: 'Mensagem Enviada',
  },
  action_executed: {
    icon: Zap,
    color: colors.state.warning,
    label: 'Ação Executada',
  },
  lead_qualified: {
    icon: Users,
    color: colors.brand.green,
    label: 'Lead Qualificado',
  },
  follow_up_scheduled: {
    icon: Clock,
    color: colors.brand.cyan,
    label: 'Follow-up Agendado',
  },
  agent_thinking: {
    icon: Brain,
    color: colors.text.secondary,
    label: 'Processando',
  },
  error: {
    icon: AlertCircle,
    color: colors.state.error,
    label: 'Erro',
  },
  connection_status: {
    icon: Wifi,
    color: colors.text.secondary,
    label: 'Status de Conexão',
  },
};

export const STATUS_ICONS: Record<ActivityStatus, ElementType> = {
  pending: LoaderCircle,
  success: CheckCircle,
  error: AlertCircle,
};

export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) {
    return `${seconds}s atrás`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m atrás`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h atrás`;
  }
  return `${Math.floor(seconds / 86400)}d atrás`;
}
