'use client';

import { kloelT } from '@/lib/i18n/t';
import { CRM_ICONS } from './crm-pipeline-icons';
import { type CRMDeal, type CRMStage, fmtBRL } from './crm-pipeline-utils';
import { DetailRow } from './CRMPipelineView.parts';

const IC = CRM_ICONS;

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  high: { label: 'Alta', color: '#EF4444' },
  medium: { label: 'Média', color: '#F59E0B' },
  low: { label: 'Baixa', color: 'var(--app-text-secondary)' },
};

interface DealDetailModalProps {
  deal: CRMDeal;
  stages: CRMStage[];
  onClose: () => void;
}

export function DealDetailModal({ deal, stages, onClose }: DealDetailModalProps) {
  const resolveStageName = () => {
    if (typeof deal.stage === 'object' && deal.stage?.name) {
      return deal.stage.name;
    }
    const stageId =
      typeof deal.stage === 'string'
        ? deal.stage
        : deal.stage?._id || deal.stage?.id;
    if (!stageId) {
      return '-';
    }
    return (
      stages.find((s) => (s._id || s.id) === stageId)?.name || '-'
    );
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <dialog
        open
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 10,
          width: 420,
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--app-text-primary)' }}>
            {deal.title}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--app-text-secondary)',
              cursor: 'pointer',
            }}
          >
            {IC.x(18)}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <DetailRow label={kloelT('Valor')} value={fmtBRL(deal.value || 0)} mono />
          <DetailRow
            label={kloelT('Prioridade')}
            value={(PRIORITY_CFG[deal.priority || ''] || PRIORITY_CFG.medium).label}
            color={(PRIORITY_CFG[deal.priority || ''] || PRIORITY_CFG.medium).color}
          />
          <DetailRow label={kloelT('Etapa')} value={resolveStageName()} />
          <DetailRow
            label={kloelT('Contato')}
            value={deal.contact?.name || deal.contactName || '-'}
          />
          {deal.contact?.phone && (
            <DetailRow label={kloelT('Telefone')} value={deal.contact.phone} mono />
          )}
          {deal.description && (
            <DetailRow label={kloelT('Descricao')} value={deal.description} />
          )}
          {deal.expectedCloseDate && (
            <DetailRow
              label={kloelT('Previsao de fechamento')}
              value={new Date(deal.expectedCloseDate).toLocaleDateString('pt-BR')}
            />
          )}
          {deal.createdAt && (
            <DetailRow
              label={kloelT('Criado em')}
              value={new Date(deal.createdAt).toLocaleDateString('pt-BR')}
            />
          )}
          {deal.notes && <DetailRow label={kloelT('Notas')} value={deal.notes} />}
        </div>
      </dialog>
    </div>
  );
}
