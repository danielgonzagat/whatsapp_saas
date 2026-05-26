'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { ChannelKey } from '../../OfficialMarketingChannelPage.helpers';
import { useOfficialMarketingChannel } from '../use-official-marketing-channel';
import { useOnboardingPalette } from './use-onboarding-palette';
import {
  SORA,
  CHANNEL_COPY,
  TONE_VALUES,
  EDGE_VALUES,
  toneIndex,
  edgeIndex,
} from './palette';
import { StepBar, Chip, CTA } from './atoms';
import { Glyph } from './Glyph';
import {
  StepConnect,
  StepProducts,
  StepArsenal,
  StepVoice,
  Done,
  type ProductRow,
} from './steps';

interface Props {
  channel: ChannelKey;
  initialStep?: number;
}

function subscribeInteractiveReady(_onStoreChange: () => void) {
  return () => undefined;
}

function readInteractiveReady() {
  return true;
}

function readServerInteractiveReady() {
  return false;
}

/**
 * The canonical channel onboarding screen (Marketing spec). One component,
 * five channels, four steps + the awakened state. Every datum is real: it
 * binds the spec's visual contract to {@link useOfficialMarketingChannel},
 * which persists progress and connects the live providers.
 */
export function ChannelOnboarding({ channel, initialStep }: Props) {
  const C = useOnboardingPalette();
  const copy = CHANNEL_COPY[channel];
  const data = useOfficialMarketingChannel({ channel, initialStep });

  // Recomeçar is UI-only: it sends the view back to step 0 without touching
  // the backend (spec §8). Any real navigation clears it.
  const [restarted, setRestarted] = useState(false);
  const [optimisticStep, setOptimisticStep] = useState<number | null>(null);
  const interactiveReady = useSyncExternalStore(
    subscribeInteractiveReady,
    readInteractiveReady,
    readServerInteractiveReady,
  );

  const backendStep = data.setup.currentStep;
  const effectiveStep = optimisticStep ?? backendStep;
  const awakened = data.completed && !restarted;
  const viewStep = restarted ? 0 : effectiveStep;
  const busy = data.busy !== null || data.isLoading;
  const isMetaChannel = channel === 'whatsapp' || channel === 'instagram' || channel === 'facebook';
  const canDisconnectMeta = isMetaChannel && data.connection?.connected === true;

  const products: ProductRow[] = data.productOptions;
  const picked = data.setup.selectedProductIds;
  const tone = toneIndex(data.setup.config.tone);
  const edge = edgeIndex(data.setup.config.aggressiveness);

  const goToStep = useCallback(
    (next: number) => {
      setRestarted(false);
      setOptimisticStep(next);
      data.setCurrentStep(next);
    },
    [data],
  );

  const handleConnect = useCallback(() => {
    setRestarted(false);
    if (channel === 'tiktok') {
      void data.openTikTok('advertiser');
      return;
    }
    if (channel === 'email') {
      void data
        .toggleEmail(true)
        .then(() => {
          // Only advance to the Products step when the channel actually
          // came up. `useOfficialMarketingChannel` surfaces backend
          // failures via `data.loadError` / `data.message`, so we gate
          // on `data.connection?.connected` after the round-trip.
          if (data.connection?.connected) {
            data.setCurrentStep(1);
          }
        })
        .catch(() => undefined);
      return;
    }
    void data.openMeta();
  }, [channel, data]);

  const addArsenalFiles = useCallback(
    (files: FileList) => {
      setRestarted(false);
      const additions = Array.from(files).map((file) =>
        JSON.stringify({ type: '', productId: '', description: file.name }),
      );
      const nextArsenal = [...data.setup.arsenal, ...additions];
      void data.persistSetup(
        { ...data.setup, arsenal: nextArsenal },
        'Arsenal do canal atualizado.',
      );
    },
    [data],
  );

  const setVoice = useCallback(
    (patch: { tone?: number; edge?: number }) => {
      setRestarted(false);
      data.updateConfig({
        ...(patch.tone !== undefined ? { tone: TONE_VALUES[patch.tone] } : {}),
        ...(patch.edge !== undefined ? { aggressiveness: EDGE_VALUES[patch.edge] } : {}),
      });
    },
    [data],
  );

  const handleActivate = useCallback(() => {
    setRestarted(false);
    void data
      .persistSetup({ ...data.setup, currentStep: 3 }, 'Voz calibrada.')
      .then(() => data.handleComplete());
  }, [data]);

  const glyphStep = awakened
    ? 4
    : Math.max(0, Math.min(3, viewStep));

  const vignette = useMemo(() => {
    if (awakened) {
      return (
        <Done
          C={C}
          awakeName={copy.awakeName}
          onReset={() => {
            setOptimisticStep(null);
            setRestarted(true);
          }}
        />
      );
    }
    if (viewStep <= 0) {
      return (
        <StepConnect
          C={C}
          sub={copy.sub}
          verb={copy.verb}
          busy={busy}
          onConnect={handleConnect}
        />
      );
    }
    if (viewStep === 1) {
      return (
        <StepProducts
          C={C}
          products={products}
          picked={picked}
          onToggle={data.toggleProduct}
          onBack={() => goToStep(0)}
          onContinue={() => {
            setRestarted(false);
            setOptimisticStep(2);
            void data.persistSetup(
              { ...data.setup, currentStep: 2 },
              'Produtos do canal salvos.',
            );
          }}
        />
      );
    }
    if (viewStep === 2) {
      return (
        <StepArsenal
          C={C}
          count={data.setup.arsenal.length}
          onAddFiles={addArsenalFiles}
          onBack={() => goToStep(1)}
          onContinue={() => goToStep(3)}
        />
      );
    }
    return (
      <StepVoice
        C={C}
        tone={tone}
        edge={edge}
        onToneChange={(next) => setVoice({ tone: next })}
        onEdgeChange={(next) => setVoice({ edge: next })}
        onBack={() => goToStep(2)}
        onActivate={handleActivate}
        activating={data.completeBusy}
      />
    );
  }, [
    awakened,
    viewStep,
    C,
    copy,
    busy,
    products,
    picked,
    tone,
    edge,
    data,
    handleConnect,
    handleActivate,
    addArsenalFiles,
    goToStep,
    setVoice,
  ]);

  return (
    <div
      style={{
        background: C.void,
        minHeight: '100vh',
        fontFamily: SORA,
        color: C.text,
      }}
    >
      <style>{`
        @keyframes kloelCorePulse {
          0%,100% { transform: scale(1); opacity: .95; }
          50% { transform: scale(1.08); opacity: .7; }
        }
        @keyframes kloelVinFade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .kloel-vin { animation: kloelVinFade .45s ease both; }
      `}</style>

      <div
        style={{
          maxWidth: 620,
          margin: '0 auto',
          padding: '64px 32px 96px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 36,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <Chip C={C}>{copy.provider}</Chip>
          {awakened ? null : (
            <>
              <StepBar
                step={Math.min(glyphStep, 3)}
                C={C}
                {...(interactiveReady ? { onStepClick: goToStep } : {})}
              />
              <Chip C={C} dim>{`Passo ${Math.min(glyphStep, 3) + 1} de 4`}</Chip>
            </>
          )}
        </div>

        <Glyph
          C={C}
          step={glyphStep}
          products={glyphStep >= 1 ? picked.length : 0}
          arsenal={glyphStep >= 2 ? data.setup.arsenal.length : 0}
        />

        <div className="kloel-vin" key={`${awakened ? 'done' : viewStep}`} style={{ width: '100%' }}>
          {vignette}
        </div>

        {canDisconnectMeta ? (
          <CTA
            C={C}
            variant="ghost"
            small
            disabled={data.busy === 'meta-disconnect'}
            onClick={data.disconnectMeta}
          >
            {data.busy === 'meta-disconnect'
              ? 'Desconectando...'
              : data.disconnectArmed
                ? 'Confirmar desconexão'
                : 'Desconectar Meta'}
          </CTA>
        ) : null}

        {data.message ? (
          <Chip C={C} dim>
            {data.message}
          </Chip>
        ) : null}

        {data.completeMessage ? (
          <Chip C={C} dim>
            {data.completeMessage}
          </Chip>
        ) : null}

        {data.loadError ? (
          <Chip C={C} dim>
            {data.loadError}
          </Chip>
        ) : null}
      </div>
    </div>
  );
}

export default ChannelOnboarding;
