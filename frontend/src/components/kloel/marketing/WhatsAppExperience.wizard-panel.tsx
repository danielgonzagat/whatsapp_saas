'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import type * as React from 'react';
import type {
  ArsenalItem,
  SelectableProduct,
  WhatsAppSetupState,
} from './WhatsAppExperience.helpers';
import { STEPS } from './WhatsAppExperience.helpers';
import { Steps } from './WhatsAppExperience.connection-panes';
import { B, F, S, V, type EffectiveConnection } from './WhatsAppExperience.panel-tokens';
import {
  ArsenalStep,
  ConfigStep,
  ConnectionStep,
  ProductsStep,
} from './WhatsAppExperience.wizard-steps';

export interface WizardPanelProps {
  fid: string;
  step: number;
  draft: WhatsAppSetupState;
  error: string | null;
  busyKey: string | null;
  qrCode: string;
  scanProgress: number;
  uploadingCount: number;
  effectiveConnection: EffectiveConnection;
  isWahaProvider: boolean;
  selectableProducts: SelectableProduct[];
  selectedIds: Set<string>;
  selectedProductsList: SelectableProduct[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSetStep: (step: number) => void;
  onToggleSelectAll: () => void;
  onToggleProduct: (id: string) => void;
  onSaveProducts: () => void;
  onUpdateArsenalItem: (item: ArsenalItem) => void;
  onRemoveArsenalItem: (id: string) => void;
  onMediaUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGoToConfigStep: () => void;
  onUpdateConfig: <K extends keyof WhatsAppSetupState['config']>(
    key: K,
    value: WhatsAppSetupState['config'][K],
  ) => void;
  onToggleFollowUp: () => void;
  onActivateAi: () => void;
  onRefreshQrCode: () => void;
}

function WizardChrome({
  children,
  error,
  step,
}: React.PropsWithChildren<{ error: string | null; step: number }>) {
  return (
    <div
      style={{
        background: V,
        minHeight: '100%',
        color: KLOEL_THEME.textPrimary,
        fontFamily: F,
        borderRadius: UI.radiusMd,
      }}
    >
      <style>{`
        ::selection { background: color-mix(in srgb, ${UI.accent} 30%, transparent); }
        input::placeholder, textarea::placeholder { color: ${KLOEL_THEME.textPlaceholder}; }
        select option { background: ${KLOEL_THEME.bgSecondary}; color: ${KLOEL_THEME.textPrimary}; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes celebrate { 0% { transform: scale(.8); opacity: 0; } 50% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
        .fade-in { animation: fadeUp .5s ease both; }
        @media (max-width: 760px) {
          .wa-tone-grid { grid-template-columns: 1fr; }
          .wa-operational-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        <Steps current={step} steps={STEPS} />
        {error ? (
          <div
            style={{
              marginBottom: 20,
              border: `1px solid color-mix(in srgb, ${KLOEL_THEME.error} 24%, transparent)`,
              background: KLOEL_THEME.errorBg,
              color: KLOEL_THEME.error,
              padding: '12px 14px',
              borderRadius: UI.radiusMd,
              fontSize: 12,
            }}
          >
            {kloelT(error)}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** Wizard setup panel. */
export function WizardPanel(props: WizardPanelProps) {
  return (
    <WizardChrome error={props.error} step={props.step}>
      {props.step === 0 ? <ConnectionStep {...props} /> : null}
      {props.step === 1 ? <ProductsStep {...props} /> : null}
      {props.step === 2 ? <ArsenalStep {...props} /> : null}
      {props.step === 3 ? <ConfigStep {...props} /> : null}
      {props.step < 0 || props.step > 3 ? (
        <div style={{ border: `1px solid ${B}`, borderRadius: UI.radiusMd, padding: 16, color: S }}>
          {kloelT('Etapa de configuração indisponível.')}
        </div>
      ) : null}
    </WizardChrome>
  );
}
