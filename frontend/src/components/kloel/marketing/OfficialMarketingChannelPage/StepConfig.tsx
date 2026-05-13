import { KLOEL_THEME } from '@/lib/kloel-theme';
import {
  sectionTitleStyle,
  secondaryButtonStyle,
  fieldStyle,
  inputStyle,
  textAreaStyle,
} from './shared-styles';

interface ChannelConfig {
  tone: string;
  aggressiveness: string;
  workingHours: string;
  followUpEnabled: boolean;
  proactiveDailyLimit: number;
  language: string;
  handoffCriteria: string;
}

interface Props {
  config: ChannelConfig;
  onUpdateConfig: (patch: Partial<ChannelConfig>) => void;
  busy: string | null;
  onSave: () => void;
  connected: boolean | undefined;
  accentColor: string;
  completeBusy: boolean;
  onComplete: () => void;
  completeMessage: string | null;
}

export function StepConfig({
  config,
  onUpdateConfig,
  busy,
  onSave,
  connected,
  accentColor,
  completeBusy,
  onComplete,
  completeMessage,
}: Props) {
  return (
    <div>
      <h2 style={sectionTitleStyle}>Configuração operacional</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        <label style={fieldStyle}>
          Tom
          <select
            value={config.tone || 'consultivo'}
            onChange={(event) => onUpdateConfig({ tone: event.target.value })}
            style={inputStyle}
          >
            <option value="consultivo">Consultivo</option>
            <option value="urgente">Urgente</option>
            <option value="casual">Casual</option>
            <option value="formal">Formal</option>
          </select>
        </label>
        <label style={fieldStyle}>
          Agressividade
          <select
            value={config.aggressiveness || 'moderado'}
            onChange={(event) => onUpdateConfig({ aggressiveness: event.target.value })}
            style={inputStyle}
          >
            <option value="passivo">Passivo</option>
            <option value="moderado">Moderado</option>
            <option value="incisivo">Incisivo</option>
          </select>
        </label>
        <label style={fieldStyle}>
          Horário de operação
          <input
            value={config.workingHours || ''}
            onChange={(event) => onUpdateConfig({ workingHours: event.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          Limite diário de mensagens proativas por contato
          <input
            type="number"
            min={0}
            value={config.proactiveDailyLimit ?? 0}
            onChange={(event) =>
              onUpdateConfig({ proactiveDailyLimit: Number(event.target.value) || 0 })
            }
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          Idioma
          <input
            value={config.language || 'pt-BR'}
            onChange={(event) => onUpdateConfig({ language: event.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={config.followUpEnabled !== false}
            onChange={(event) => onUpdateConfig({ followUpEnabled: event.target.checked })}
          />
          Follow-up automático
        </label>
        <label style={fieldStyle}>
          Critérios de transferência para humano
          <textarea
            value={config.handoffCriteria || ''}
            onChange={(event) => onUpdateConfig({ handoffCriteria: event.target.value })}
            rows={4}
            style={textAreaStyle}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={onSave}
        style={{ ...secondaryButtonStyle, marginTop: 14 }}
      >
        {busy === 'setup' ? 'Salvando...' : 'Salvar configuração'}
      </button>
      <button
        type="button"
        onClick={onComplete}
        disabled={completeBusy || !connected}
        style={{
          border: 'none',
          borderRadius: 6,
          background: connected ? accentColor : KLOEL_THEME.borderPrimary,
          color: KLOEL_THEME.textOnAccent,
          padding: '12px 16px',
          fontWeight: 700,
          cursor: connected && !completeBusy ? 'pointer' : 'not-allowed',
          marginTop: 14,
          marginLeft: 10,
          opacity: connected && !completeBusy ? 1 : 0.6,
        }}
      >
        {completeBusy ? 'Concluindo...' : 'Concluir'}
      </button>
      {completeMessage ? (
        <p
          style={{
            marginTop: 10,
            color:
              completeMessage.includes('Falha') || completeMessage.includes('not_complete')
                ? KLOEL_THEME.error
                : KLOEL_THEME.success,
            fontSize: 12,
          }}
        >
          {completeMessage}
        </p>
      ) : null}
    </div>
  );
}
