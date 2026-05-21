'use client';

import { kloelT } from '@/lib/i18n/t';
import { Grid, Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { formatTs } from '../utils';
import { Shield } from 'lucide-react';
import type { CiaProof } from '@/lib/api';

interface CiaProofsProps {
  cycleProof: CiaProof | null;
  accountProof: CiaProof | null;
}

export function CiaProofs({ cycleProof, accountProof }: CiaProofsProps) {
  return (
    <Grid cols={2} gap={4}>
      <Surface className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
          <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
            {kloelT('Prova do Ciclo')}
          </p>
        </div>
        {!cycleProof ? (
          <div
            className="rounded p-4"
            style={{
              backgroundColor: colors.background.surface1,
              border: `1px solid ${colors.stroke}`,
            }}
          >
            <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
              {kloelT('Nenhuma prova de ciclo disponivel')}
            </p>
            <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
              {kloelT('Gerada apos o primeiro ciclo completo do agente.')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cycleProof.summary && (
              <div
                className="rounded p-3"
                style={{
                  backgroundColor: colors.background.surface1,
                  border: `1px solid ${colors.stroke}`,
                }}
              >
                <p
                  className="text-xs uppercase tracking-widest mb-1"
                  style={{ color: colors.text.muted }}
                >
                  {kloelT('Sumario')}
                </p>
                <p className="text-sm" style={{ color: colors.text.primary }}>
                  {cycleProof.summary}
                </p>
              </div>
            )}
            {cycleProof.guaranteeReport && (
              <div
                className="rounded p-3"
                style={{
                  backgroundColor: colors.background.surface1,
                  border: `1px solid ${colors.stroke}`,
                }}
              >
                <p
                  className="text-xs uppercase tracking-widest mb-1"
                  style={{ color: colors.text.muted }}
                >
                  {kloelT('Garantia')}
                </p>
                <pre
                  className="text-xs whitespace-pre-wrap break-words"
                  style={{ color: colors.text.secondary }}
                >
                  {typeof cycleProof.guaranteeReport === 'string'
                    ? cycleProof.guaranteeReport
                    : JSON.stringify(cycleProof.guaranteeReport, null, 2)}
                </pre>
              </div>
            )}
            <p className="text-xs" style={{ color: colors.text.muted }}>
              {kloelT('Gerado em:')} {formatTs(cycleProof.generatedAt)}
            </p>
          </div>
        )}
      </Surface>

      <Surface className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
          <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
            {kloelT('Prova de Conta')}
          </p>
        </div>
        {!accountProof ? (
          <div
            className="rounded p-4"
            style={{
              backgroundColor: colors.background.surface1,
              border: `1px solid ${colors.stroke}`,
            }}
          >
            <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
              {kloelT('Nenhuma prova de conta disponivel')}
            </p>
            <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
              {kloelT('Gerada apos o agente processar o universo completo de contatos.')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {accountProof.summary && (
              <div
                className="rounded p-3"
                style={{
                  backgroundColor: colors.background.surface1,
                  border: `1px solid ${colors.stroke}`,
                }}
              >
                <p
                  className="text-xs uppercase tracking-widest mb-1"
                  style={{ color: colors.text.muted }}
                >
                  {kloelT('Sumario')}
                </p>
                <p className="text-sm" style={{ color: colors.text.primary }}>
                  {accountProof.summary}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Candidatos', value: accountProof.candidateCount },
                { label: 'Elegiveis', value: accountProof.eligibleActionCount },
                { label: 'Bloqueados', value: accountProof.blockedActionCount },
                { label: 'Aguardando aprovacao', value: accountProof.waitingApprovalCount },
              ].map((stat) =>
                stat.value !== undefined ? (
                  <div
                    key={stat.label}
                    className="rounded p-2"
                    style={{
                      backgroundColor: colors.background.surface1,
                      border: `1px solid ${colors.stroke}`,
                    }}
                  >
                    <p
                      className="text-lg font-bold font-mono"
                      style={{ color: colors.text.primary }}
                    >
                      {stat.value}
                    </p>
                    <p className="text-xs" style={{ color: colors.text.muted }}>
                      {stat.label}
                    </p>
                  </div>
                ) : null,
              )}
            </div>
            <p className="text-xs" style={{ color: colors.text.muted }}>
              {kloelT('Gerado em:')} {formatTs(accountProof.generatedAt)}
              {accountProof.status ? ` \u2022 ${accountProof.status}` : ''}
            </p>
          </div>
        )}
      </Surface>
    </Grid>
  );
}
