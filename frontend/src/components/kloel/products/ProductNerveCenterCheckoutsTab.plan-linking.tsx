'use client';
import { kloelT } from '@/lib/i18n/t';
import {
  Bg,
  M,
  V,
  cs,
  formatBrlCents,
  type JsonRecord,
} from './product-nerve-center.shared';

interface PlanLinkingSectionProps {
  selectedPlans: JsonRecord[];
  availablePlans: JsonRecord[];
  rawPlans: JsonRecord[];
  setLinkedPlanIds: (updater: (current: string[]) => string[]) => void;
}

export function PlanLinkingSection({
  selectedPlans,
  availablePlans,
  rawPlans,
  setLinkedPlanIds,
}: PlanLinkingSectionProps) {
  return (
    <>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
        {kloelT(`Planos vinculados`)}
      </h4>
      {selectedPlans.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {selectedPlans.map((planCandidate) => (
            <button
              key={String(planCandidate.id)}
              type="button"
              onClick={() =>
                setLinkedPlanIds((current) =>
                  current.filter((candidateId) => candidateId !== String(planCandidate.id)),
                )
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 12px',
                borderRadius: 16,
                border: `1px solid ${V.em}35`,
                background: `${V.em}12`,
                color: V.t,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <span>{String(planCandidate.name)}</span>
              <span style={{ color: V.em, fontFamily: M }}>
                {formatBrlCents(Number(planCandidate.priceInCents || 0))}
              </span>
              <span style={{ color: V.t3 }}>×</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ ...cs, padding: 14, marginBottom: 14, background: V.e }}>
          <span style={{ display: 'block', fontSize: 12, color: V.t, marginBottom: 6 }}>
            {kloelT(`Nenhum plano vinculado`)}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: V.t2, lineHeight: 1.6 }}>
            {kloelT(`Este checkout ainda não gera links públicos. Vincule pelo menos um plano para
            liberar URLs de compra em \`Planos → Ver links\`.`)}
          </span>
        </div>
      )}
      {rawPlans.length === 0 ? (
        <div
          style={{
            ...cs,
            padding: 14,
            background: `${V.y}10`,
            border: `1px solid ${V.y}25`,
            marginBottom: 14,
          }}
        >
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: V.t }}>
            {kloelT(`Nenhum plano criado`)}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: V.t2, lineHeight: 1.6 }}>
            {kloelT(`Crie ao menos um plano em`)}{' '}
            <strong style={{ color: V.t }}>{kloelT(`Planos`)}</strong>{' '}
            {kloelT(`antes de vincular este checkout.`)}
          </span>
        </div>
      ) : null}
      {availablePlans.length > 0 ? (
        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          {availablePlans.map((planCandidate) => (
            <button
              key={String(planCandidate.id)}
              type="button"
              onClick={() =>
                setLinkedPlanIds((current) => {
                  const pid = String(planCandidate.id);
                  return current.includes(pid) ? current : [...current, pid];
                })
              }
              style={{
                ...cs,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                background: V.e,
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: V.t }}>
                  {String(planCandidate.name)}
                </span>
                <span style={{ fontSize: 10, color: V.t3 }}>
                  {formatBrlCents(Number(planCandidate.priceInCents || 0))} ·{' '}
                  {Number(planCandidate.quantity || 1)} item
                  {Number(planCandidate.quantity || 1) === 1 ? '' : 's'}
                </span>
              </div>
              <Bg color={V.g2}>{kloelT(`Adicionar`)}</Bg>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
