'use client';

import { kloelT } from '@/lib/i18n/t';
import type { CiaAccountRuntime, CiaSurfaceResponse } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import { Badge, Button, Grid, StatCard, Surface } from '@/components/kloel';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { Activity, Bot, RotateCw, Sparkles, Wallet, Zap } from 'lucide-react';

interface StreamEvent {
  type: string;
  message: string;
  ts?: string;
}

interface CiaHeaderProps {
  surface: CiaSurfaceResponse | null;
  workspaceLoading: boolean;
  accountRuntime: CiaAccountRuntime | null;
  onRefresh: () => void;
  onAutopilotTotal: () => void;
  activating: boolean;
  hasWorkspaceId: boolean;
}

export function CiaHeader({
  surface,
  workspaceLoading,
  accountRuntime,
  onRefresh,
  onAutopilotTotal,
  activating,
  hasWorkspaceId,
}: CiaHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: colors.text.primary }}>
          {surface?.title || 'KLOEL'}
        </h1>
        <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
          {surface?.subtitle || 'Operando seus canais'}
        </p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge>{surface?.workspaceName || 'Workspace'}</Badge>
          <Badge variant="info">{surface?.state || 'CARREGANDO'}</Badge>
          {surface?.runtime?.lastError ? (
            <Badge variant="error">{kloelT('Erro recente')}</Badge>
          ) : (
            <Badge variant="success">{kloelT('Operação observável')}</Badge>
          )}
          {accountRuntime && (
            <Badge variant={accountRuntime.noLegalActions ? 'warning' : 'info'}>
              {accountRuntime.mode}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={onRefresh}
          leftIcon={<RotateCw size={16} aria-hidden="true" />}
          disabled={workspaceLoading}
        >
          {kloelT('Atualizar')}
        </Button>
        <Button
          onClick={onAutopilotTotal}
          isLoading={activating}
          leftIcon={<Zap size={16} aria-hidden="true" />}
          disabled={workspaceLoading || !hasWorkspaceId}
        >
          {kloelT('Autopilot Total')}
        </Button>
      </div>
    </div>
  );
}

interface CiaStatsProps {
  surface: CiaSurfaceResponse | null;
}

export function CiaStats({ surface }: CiaStatsProps) {
  return (
    <Grid cols={3} gap={4}>
      <StatCard
        label={kloelT('Vendido Hoje')}
        value={new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          maximumFractionDigits: 2,
        }).format(Number(surface?.today?.soldAmount || 0))}
        icon={Wallet}
      />
      <StatCard
        label={kloelT('Conversas Ativas')}
        value={surface?.today?.activeConversations || 0}
        icon={Activity}
      />
      <StatCard
        label={kloelT('Pagamentos Pendentes')}
        value={surface?.today?.pendingPayments || 0}
        icon={Bot}
      />
    </Grid>
  );
}

interface CiaNowProps {
  loading: boolean;
  surface: CiaSurfaceResponse | null;
  error: string | null;
}

export function CiaNow({ loading, surface, error }: CiaNowProps) {
  return (
    <Surface className="p-6">
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${colors.brand.green}18` }}
        >
          {loading ? (
            <KloelMushroomMark size={22} title="Carregando CIA" traceColor={colors.brand.green} />
          ) : (
            <Sparkles size={22} style={{ color: colors.brand.green }} aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <p
            className="text-sm uppercase tracking-[0.18em] mb-2"
            style={{ color: colors.text.muted }}
          >
            {kloelT('Agora')}
          </p>
          <p
            className="text-2xl md:text-3xl font-semibold leading-tight"
            style={{ color: colors.text.primary }}
          >
            {surface?.now?.message ||
              'Estou observando o WhatsApp e preparando a próxima ação segura.'}
          </p>
          {surface?.now?.phase && (
            <p className="mt-3 text-sm" style={{ color: colors.text.secondary }}>
              {kloelT('Fase atual:')} {surface.now.phase}
            </p>
          )}
          {error && (
            <p className="mt-3 text-sm" style={{ color: colors.state.error }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </Surface>
  );
}

interface CiaMoneyEventsProps {
  events: StreamEvent[];
}

export function CiaMoneyEvents({ events }: CiaMoneyEventsProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <Surface className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={16} style={{ color: colors.brand.green }} aria-hidden="true" />
        <p className="text-sm font-medium" style={{ color: colors.text.secondary }}>
          {kloelT('Dinheiro em tempo real')}
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {events
          .slice(-6)
          .reverse()
          .map((event, index) => (
            <div
              key={`${event.ts || index}-${event.message}`}
              className="rounded-xl px-4 py-3"
              style={{
                backgroundColor: `${colors.brand.green}10`,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.brand.green }}>
                {event.type === 'sale' ? 'Venda' : 'Pagamento'}
              </p>
              <p className="text-sm mt-1" style={{ color: colors.text.primary }}>
                {event.message}
              </p>
            </div>
          ))}
      </div>
    </Surface>
  );
}

interface CiaInsightsProps {
  surface: CiaSurfaceResponse | null;
}

export function CiaInsights({ surface }: CiaInsightsProps) {
  if (!surface?.insights?.length) {
    return null;
  }

  return (
    <Surface className="p-5">
      <p className="text-sm uppercase tracking-[0.18em] mb-4" style={{ color: colors.text.muted }}>
        {kloelT('Insights do Runtime')}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {surface.insights.map(
          (
            insight: { id?: string; title?: string; type?: string; description?: string },
            index: number,
          ) => (
            <div
              key={insight.id || index}
              className="rounded-xl p-4"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <p className="text-sm font-semibold" style={{ color: colors.text.primary }}>
                {insight.title || insight.type}
              </p>
              <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                {insight.description || 'Insight operacional disponível.'}
              </p>
            </div>
          ),
        )}
      </div>
    </Surface>
  );
}
