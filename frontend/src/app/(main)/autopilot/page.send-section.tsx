'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Button, CenterStage, Section } from '@/components/kloel';
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import type { AutopilotAction, AutopilotImpact } from './page.ui';
import { ActionRow } from './page.ui';

interface DirectSendSectionProps {
  sendContactId: string;
  setSendContactId: (v: string) => void;
  sendMessage: string;
  setSendMessage: (v: string) => void;
  isSending: boolean;
  onSend: () => void;
  sendResult: { success?: boolean; messageId?: string; error?: string } | null;
}

export function DirectSendSection({
  sendContactId,
  setSendContactId,
  sendMessage,
  setSendMessage,
  isSending,
  onSend,
  sendResult,
}: DirectSendSectionProps) {
  return (
    <Section spacing="lg">
      <CenterStage size="XL">
        <div
          className="p-5 rounded-xl border"
          style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${colors.brand.cyan}20` }}>
              <Send size={20} style={{ color: colors.brand.cyan }} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                {kloelT('Envio Direto')}
              </h2>
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT('Envia uma mensagem manualmente para um contato via Autopilot')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span style={{ color: colors.text.secondary }}>{kloelT('ID do Contato')}</span>
              <input
                value={sendContactId}
                onChange={(e) => setSendContactId(e.target.value)}
                placeholder={kloelT('ID do contato no CRM')}
                className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                style={{
                  backgroundColor: colors.background.surface2,
                  borderColor: colors.stroke,
                  color: colors.text.primary,
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span style={{ color: colors.text.secondary }}>{kloelT('Mensagem')}</span>
              <input
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                placeholder={kloelT('Mensagem a enviar...')}
                className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                style={{
                  backgroundColor: colors.background.surface2,
                  borderColor: colors.stroke,
                  color: colors.text.primary,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={onSend}
              isLoading={isSending}
              leftIcon={!isSending ? <Send size={14} aria-hidden="true" /> : undefined}
            >
              {isSending ? 'Enviando...' : 'Enviar Mensagem'}
            </Button>
            {sendResult && (
              <div
                className="px-3 py-2 rounded-lg text-sm flex items-center gap-2"
                style={{
                  backgroundColor: sendResult.success
                    ? `${colors.brand.green}15`
                    : `${colors.state.error}1A`,
                  color: sendResult.success ? colors.brand.green : colors.state.error,
                }}
              >
                {sendResult.success ? (
                  <>
                    <CheckCircle2 size={14} aria-hidden="true" />
                    {kloelT('Mensagem enviada')}
                    {sendResult.messageId && (
                      <span style={{ color: colors.text.muted }}>
                        {kloelT('— ID:')} {sendResult.messageId}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <XCircle size={14} aria-hidden="true" />
                    {sendResult.error || 'Erro ao enviar'}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </CenterStage>
    </Section>
  );
}

interface RecentActionsSectionProps {
  actions: AutopilotAction[];
  filteredActions: AutopilotAction[];
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  status: { enabled: boolean } | null;
  isLoading: boolean;
  onRefresh: () => void;
  onExport: () => void;
}

export function RecentActionsSection({
  actions,
  filteredActions,
  statusFilter,
  setStatusFilter,
  status,
  isLoading,
  onRefresh,
  onExport,
}: RecentActionsSectionProps) {
  return (
    <Section spacing="lg">
      <CenterStage size="XL">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
            {kloelT('Ações Recentes')}
          </h2>
          <div className="flex items-center gap-2">
            <Filter size={16} style={{ color: colors.text.muted }} aria-hidden="true" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm border outline-none"
              style={{
                backgroundColor: colors.background.surface2,
                borderColor: colors.stroke,
                color: colors.text.primary,
              }}
            >
              <option value="all">{kloelT('Todos')}</option>
              <option value="success">{kloelT('Sucesso')}</option>
              <option value="error">{kloelT('Erros')}</option>
              <option value="skipped">{kloelT('Ignorados')}</option>
              <option value="scheduled">{kloelT('Agendados')}</option>
            </select>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: colors.text.muted }}
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {filteredActions.length === 0 ? (
            <div
              className="p-8 rounded-xl text-center"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <Bot
                size={48}
                className="mx-auto mb-4"
                style={{ color: colors.text.muted }}
                aria-hidden="true"
              />
              <p style={{ color: colors.text.muted }}>
                {statusFilter === 'all'
                  ? 'Nenhuma ação registrada ainda'
                  : `Nenhuma ação com status "${statusFilter}"`}
              </p>
              {!status?.enabled && (
                <p className="mt-2 text-sm" style={{ color: colors.text.muted }}>
                  {kloelT('Ative o Autopilot para começar a automatizar')}
                </p>
              )}
            </div>
          ) : (
            filteredActions.map((action) => <ActionRow key={action.id} action={action} />)
          )}
        </div>

        {actions.length >= 50 && (
          <div className="mt-4 text-center">
            <Button variant="ghost" size="sm" onClick={onExport}>
              <ArrowUpRight size={16} className="mr-2" aria-hidden="true" />
              {kloelT('Exportar todas as ações')}
            </Button>
          </div>
        )}
      </CenterStage>
    </Section>
  );
}

interface ImpactSectionProps {
  impact: AutopilotImpact | null;
}

export function ImpactSection({ impact }: ImpactSectionProps) {
  if (!impact || impact.samples.length === 0) {
    return null;
  }

  return (
    <Section spacing="lg">
      <CenterStage size="XL">
        <h2 className="text-lg font-semibold mb-4" style={{ color: colors.text.primary }}>
          {kloelT('Exemplos de Impacto')}
        </h2>
        <div
          className="p-4 rounded-xl"
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${colors.stroke}`,
          }}
        >
          <div className="space-y-3">
            {impact.samples.map((sample) => (
              <div
                key={sample.contact}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: colors.background.surface2 }}
              >
                <div>
                  <span className="font-medium" style={{ color: colors.text.primary }}>
                    {sample.contact}
                  </span>
                  <span className="text-sm ml-2" style={{ color: colors.text.muted }}>
                    {kloelT('respondeu em')} {sample.delayMinutes} min
                  </span>
                </div>
                <span className="text-xs" style={{ color: colors.text.muted }}>
                  {new Date(sample.replyAt).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CenterStage>
    </Section>
  );
}
