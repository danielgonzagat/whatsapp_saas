'use client';

import { kloelT } from '@/lib/i18n/t';
import { CRM_ICONS } from './crm-pipeline-icons';
import { SORA } from './crm-pipeline-utils';

const IC = CRM_ICONS;

export function NoPipelinesEmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: 'var(--app-text-secondary)',
        fontFamily: SORA,
      }}
    >
      <span style={{ color: 'var(--app-text-tertiary)' }}>{IC.deal(40)}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--app-text-primary)' }}>
        {kloelT('Nenhum pipeline encontrado')}
      </span>
      <span style={{ fontSize: 12 }}>
        {kloelT('Crie seu primeiro pipeline para gerenciar deals.')}
      </span>
    </div>
  );
}
