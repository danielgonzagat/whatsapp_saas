'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import type { WhatsAppSetupState } from './WhatsAppExperience.helpers';
import { TONE_OPTIONS } from './WhatsAppExperience.helpers';
import { FollowUpSwitch, ToneCard } from './WhatsAppExperience.wizard-cards';
import { B, C, D, E, F, G, M, S, selectInputStyle } from './WhatsAppExperience.panel-tokens';

export interface ConfigStepProps {
  fid: string;
  draft: WhatsAppSetupState;
  busyKey: string | null;
  onSetStep: (step: number) => void;
  onUpdateConfig: <K extends keyof WhatsAppSetupState['config']>(
    key: K,
    value: WhatsAppSetupState['config'][K],
  ) => void;
  onToggleFollowUp: () => void;
  onActivateAi: () => void;
}

export function ConfigStep({
  fid,
  draft,
  busyKey,
  onSetStep,
  onUpdateConfig,
  onToggleFollowUp,
  onActivateAi,
}: ConfigStepProps) {
  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, fontFamily: F }}>
        {kloelT(`Configurar a IA`)}
      </h2>
      <p style={{ fontSize: 13, color: S, marginBottom: 24, fontFamily: F }}>
        {kloelT(`Defina como a IA se comporta nas conversas. Tudo pode ser alterado depois.`)}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: UI.muted,
              marginBottom: 6,
              display: 'block',
              fontFamily: F,
            }}
          >
            {kloelT(`Tom da conversa`)}
          </span>
          <div
            className="wa-tone-grid"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}
          >
            {TONE_OPTIONS.map(([value, label, description]) => (
              <ToneCard
                key={value}
                value={value}
                label={label}
                description={description}
                selected={draft.config.tone === value}
                onSelect={(next) => onUpdateConfig('tone', next)}
              />
            ))}
          </div>
        </div>
        <label
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: UI.muted,
            marginBottom: 6,
            display: 'block',
            fontFamily: F,
          }}
          htmlFor={`${fid}-desconto`}
        >
          {kloelT(`Desconto maximo que a IA pode oferecer:`)}{' '}
          <span style={{ color: E, fontFamily: M }}>{draft.config.maxDiscount}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="50"
          value={draft.config.maxDiscount}
          onChange={(event) => onUpdateConfig('maxDiscount', Number(event.target.value))}
          style={{ width: '100%', accentColor: E }}
          id={`${fid}-desconto`}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: C,
            border: `1px solid ${B}`,
            borderRadius: UI.radiusMd,
            padding: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: KLOEL_THEME.textPrimary,
                fontFamily: F,
              }}
            >
              {kloelT(`Follow-up automatico`)}
            </div>
            <div style={{ fontSize: 11, color: D, fontFamily: F }}>
              {kloelT(`A IA retoma leads que nao responderam`)}
            </div>
          </div>
          <FollowUpSwitch enabled={draft.config.followUp} onToggle={onToggleFollowUp} />
        </div>
        {draft.config.followUp ? (
          <input
            type="range"
            min="1"
            max="72"
            value={draft.config.followUpHours}
            onChange={(event) => onUpdateConfig('followUpHours', Number(event.target.value))}
            style={{ width: '100%', accentColor: E }}
            id={`${fid}-followup`}
          />
        ) : null}
        <input
          type="text"
          value={draft.config.workingHours}
          onChange={(event) => onUpdateConfig('workingHours', event.target.value)}
          placeholder={kloelT(`08:00-22:00`)}
          style={{ ...selectInputStyle, fontFamily: M }}
          id={`${fid}-horario`}
        />
        <textarea
          value={draft.config.greeting}
          onChange={(event) => onUpdateConfig('greeting', event.target.value)}
          placeholder={kloelT(
            `Ex: Nunca ofereca desconto antes do cliente pedir. Sempre mencione o bonus. Chame pelo primeiro nome...`,
          )}
          style={{ ...selectInputStyle, resize: 'vertical', minHeight: 70, lineHeight: 1.5 }}
          id={`${fid}-instrucoes`}
        />
      </div>
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={() => onSetStep(2)}
          style={{
            background: 'none',
            border: `1px solid ${B}`,
            borderRadius: UI.radiusMd,
            padding: '12px 24px',
            color: S,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: F,
          }}
        >
          {kloelT(`<- Voltar`)}
        </button>
        <button
          type="button"
          onClick={onActivateAi}
          disabled={busyKey === 'activate'}
          style={{
            background: G,
            color: UI.bg,
            border: 'none',
            borderRadius: UI.radiusMd,
            padding: '14px 36px',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: F,
            boxShadow: `0 0 20px color-mix(in srgb, ${G} 40%, transparent)`,
            opacity: busyKey === 'activate' ? 0.7 : 1,
          }}
        >
          {busyKey === 'activate' ? 'Salvando...' : 'Salvar e ativar IA'}
        </button>
      </div>
    </div>
  );
}
