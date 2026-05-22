import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import type { CSSProperties, ReactNode } from 'react';
import { C } from './ParceriasDesignTokens';
import { IC } from './ParceriasView.icons';

interface CollaboratorStatCardsInput {
  online: number;
  pendingInvites: number;
  rolesUsed: number;
  total: number;
}

interface CollaboratorStatCard {
  helperText?: string;
  icon: ReactNode;
  iconStyle: CSSProperties;
  id: string;
  label: string;
  value: number;
}

export function buildCollaboratorStatCards({
  online,
  pendingInvites,
  rolesUsed,
  total,
}: CollaboratorStatCardsInput): CollaboratorStatCard[] {
  return [
    { id: 'total', label: kloelT(`Total Colaboradores`), value: total, icon: IC.users(16), iconStyle: { color: C.muted } },
    {
      id: 'online',
      label: kloelT(`Online Agora`),
      value: online,
      icon: <div style={{ width: 8, height: 8, borderRadius: '16%', background: colors.semantic.success }} />,
      iconStyle: {},
      helperText: kloelT(`ativos no momento`),
    },
    { id: 'pending', label: kloelT(`Convites Pendentes`), value: pendingInvites, icon: IC.mail(16), iconStyle: { color: C.muted } },
    { id: 'roles', label: kloelT(`Funcoes Ativas`), value: rolesUsed, icon: IC.shield(16), iconStyle: { color: C.muted } },
  ];
}
