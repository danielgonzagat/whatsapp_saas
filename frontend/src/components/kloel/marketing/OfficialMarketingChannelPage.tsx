'use client';

import { CHANNEL_META, type ChannelKey } from './OfficialMarketingChannelPage.helpers';
import { useOfficialMarketingChannel } from './OfficialMarketingChannelPage/use-official-marketing-channel';
import { ChannelNav } from './OfficialMarketingChannelPage/ChannelNav';
import { ChannelHeader } from './OfficialMarketingChannelPage/ChannelHeader';
import { ProofCards } from './OfficialMarketingChannelPage/ProofCards';
import { SetupSteps } from './OfficialMarketingChannelPage/SetupSteps';
import { StepConnection } from './OfficialMarketingChannelPage/StepConnection';
import { StepProducts } from './OfficialMarketingChannelPage/StepProducts';
import { StepArsenal } from './OfficialMarketingChannelPage/StepArsenal';
import { StepConfig } from './OfficialMarketingChannelPage/StepConfig';
import { ActionButtons } from './OfficialMarketingChannelPage/ActionButtons';
import { StatusDisplay } from './OfficialMarketingChannelPage/StatusDisplay';
import { setupPanelStyle } from './OfficialMarketingChannelPage/shared-styles';
import { KLOEL_THEME } from '@/lib/kloel-theme';

interface Props {
  channel: ChannelKey;
  initialStep?: number;
}

export function OfficialMarketingChannelPage({ channel, initialStep }: Props) {
  const meta = CHANNEL_META[channel];
  const data = useOfficialMarketingChannel({ channel, initialStep });

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '28px clamp(16px, 4vw, 40px)',
        background: KLOEL_THEME.bgPrimary,
        color: KLOEL_THEME.textPrimary,
        fontFamily: "'Sora', system-ui, sans-serif",
      }}
    >
      <ChannelNav channel={channel} />

      <section style={{ maxWidth: 920, margin: '0 auto' }}>
        <ChannelHeader
          label={meta.label}
          summary={meta.summary}
          connected={data.connection?.connected}
          badgeStatus={data.badgeStatus}
        />

        <ProofCards proof={meta.proof} accentColor={meta.color} />

        <SetupSteps
          currentStep={data.setup.currentStep}
          setupLoaded={data.setupLoaded}
          channel={channel}
          onStepClick={data.setCurrentStep}
        />

        <section style={setupPanelStyle}>
          <p
            style={{
              margin: '0 0 14px',
              color: KLOEL_THEME.textSecondary,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
            }}
          >
            Passo {data.setup.currentStep + 1} de 4
          </p>

          {data.setup.currentStep === 0 ? (
            <StepConnection channel={channel} tiktokMode={data.tiktokMode} />
          ) : null}

          {data.setup.currentStep === 1 ? (
            <StepProducts
              productOptions={data.productOptions}
              selectedProductIds={data.setup.selectedProductIds}
              onToggleProduct={data.toggleProduct}
              busy={data.busy}
              onSave={() => void data.persistSetup(data.setup, 'Produtos do canal salvos.')}
            />
          ) : null}

          {data.setup.currentStep === 2 ? (
            <StepArsenal
              arsenal={data.setup.arsenal}
              onArsenalChange={data.handleArsenalChange}
              busy={data.busy}
              onSave={() => void data.persistSetup(data.setup, 'Arsenal do canal salvo.')}
            />
          ) : null}

          {data.setup.currentStep === 3 ? (
            <StepConfig
              config={data.setup.config}
              onUpdateConfig={data.updateConfig}
              busy={data.busy}
              onSave={() => void data.persistSetup(data.setup, 'Configuração do canal salva.')}
              connected={data.connection?.connected}
              accentColor={meta.color}
              completeBusy={data.completeBusy}
              onComplete={() => void data.handleComplete()}
              completeMessage={data.completeMessage}
            />
          ) : null}
        </section>

        <StatusDisplay
          isLoading={data.isLoading}
          loadError={data.loadError}
          setupUnavailable={data.setupUnavailable}
          isConnected={data.connection?.connected}
        />

        <ActionButtons
          channel={channel}
          accentColor={meta.color}
          busy={data.busy}
          connection={data.connection}
          disconnectArmed={data.disconnectArmed}
          setupLoaded={data.setupLoaded}
          canAdvance={data.setup.currentStep < 3}
          onEmailToggle={data.toggleEmail}
          onEmailTest={data.sendEmailTest}
          onTikTokConnect={data.openTikTok}
          onMetaConnect={data.openMeta}
          onMetaDisconnect={data.disconnectMeta}
          onRefresh={data.refresh}
          onAdvanceStep={data.handleAdvanceStep}
        />

        {data.message ? (
          <p style={{ color: KLOEL_THEME.textSecondary }}>{data.message}</p>
        ) : null}

        <pre
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 6,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            background: KLOEL_THEME.bgCard,
            color: KLOEL_THEME.textSecondary,
            overflowX: 'auto',
            fontSize: 12,
          }}
        >
          {JSON.stringify(data.details || {}, null, 2)}
        </pre>
      </section>
    </main>
  );
}
