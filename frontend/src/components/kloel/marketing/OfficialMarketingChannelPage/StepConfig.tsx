import { KLOEL_THEME } from '@/lib/kloel-theme';
import { sectionTitleStyle, secondaryButtonStyle, inputStyle, textAreaStyle } from './shared-styles';

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

const TONES: Array<[string, string, string]> = [
  ['consultivo', 'Consultivo', 'Diagnostica antes de ofertar'],
  ['urgente', 'Urgente', 'Escassez, exclusividade, ação'],
  ['casual', 'Casual', 'Próximo, descontraído, leve'],
  ['formal', 'Formal', 'Direto, corporativo, sóbrio'],
];

const AGGRESSIVENESS: Array<[string, string]> = [
  ['passivo', 'Passivo'],
  ['moderado', 'Moderado'],
  ['incisivo', 'Incisivo'],
];

function CardGroup({
  options,
  value,
  onPick,
  columns,
}: {
  options: Array<[string, string, string?]>;
  value: string;
  onPick: (next: string) => void;
  columns: number;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
      {options.map(([val, label, desc]) => {
        const active = value === val;
        return (
          <button
            key={val}
            type="button"
            onClick={() => onPick(val)}
            style={{
              textAlign: 'left',
              background: active ? KLOEL_THEME.accentLight : KLOEL_THEME.bgSecondary,
              border: `1.5px solid ${active ? KLOEL_THEME.accent : KLOEL_THEME.borderPrimary}`,
              borderRadius: 6,
              padding: 12,
              cursor: 'pointer',
              transition: 'all .2s',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: KLOEL_THEME.textPrimary }}>
              {label}
            </div>
            {desc ? (
              <div style={{ fontSize: 10, color: KLOEL_THEME.textSecondary, marginTop: 2, lineHeight: 1.4 }}>
                {desc}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: KLOEL_THEME.textSecondary,
  marginBottom: 6,
  display: 'block',
} as const;

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
  const failed =
    !!completeMessage &&
    (completeMessage.includes('Falha') || completeMessage.includes('not_complete'));

  return (
    <div>
      <h2 style={sectionTitleStyle}>Configurar a IA</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: KLOEL_THEME.textSecondary }}>
        Defina como a IA se comporta nas conversas deste canal. Tudo pode ser alterado
        depois.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <span style={labelStyle}>Tom da conversa</span>
          <CardGroup
            options={TONES}
            value={config.tone || 'consultivo'}
            onPick={(tone) => onUpdateConfig({ tone })}
            columns={2}
          />
        </div>

        <div>
          <span style={labelStyle}>Agressividade comercial</span>
          <CardGroup
            options={AGGRESSIVENESS}
            value={config.aggressiveness || 'moderado'}
            onPick={(aggressiveness) => onUpdateConfig({ aggressiveness })}
            columns={3}
          />
        </div>

        <div>
          <span style={labelStyle}>
            Limite diário de mensagens proativas por contato:{' '}
            <span style={{ color: KLOEL_THEME.accent, fontFamily: "'JetBrains Mono', monospace" }}>
              {config.proactiveDailyLimit ?? 0}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={config.proactiveDailyLimit ?? 0}
            onChange={(event) =>
              onUpdateConfig({ proactiveDailyLimit: Number(event.target.value) || 0 })
            }
            style={{ width: '100%', accentColor }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: KLOEL_THEME.textSecondary,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <span>0 (sem proativo)</span>
            <span>100</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: KLOEL_THEME.bgSecondary,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            borderRadius: 6,
            padding: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: KLOEL_THEME.textPrimary }}>
              Follow-up automático
            </div>
            <div style={{ fontSize: 11, color: KLOEL_THEME.textSecondary }}>
              A IA retoma leads que não responderam
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.followUpEnabled !== false}
            onClick={() => onUpdateConfig({ followUpEnabled: !(config.followUpEnabled !== false) })}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              border: 'none',
              background: config.followUpEnabled !== false ? accentColor : KLOEL_THEME.borderPrimary,
              cursor: 'pointer',
              position: 'relative',
              transition: 'background .2s',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: config.followUpEnabled !== false ? 23 : 3,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: KLOEL_THEME.textOnAccent,
                transition: 'left .2s',
              }}
            />
          </button>
        </div>

        <div>
          <span style={labelStyle}>Horário de atendimento</span>
          <input
            value={config.workingHours || ''}
            onChange={(event) => onUpdateConfig({ workingHours: event.target.value })}
            placeholder="08:00-22:00"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div>
          <span style={labelStyle}>Idioma</span>
          <input
            value={config.language || 'pt-BR'}
            onChange={(event) => onUpdateConfig({ language: event.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div>
          <span style={labelStyle}>Critérios de transferência para humano</span>
          <textarea
            value={config.handoffCriteria || ''}
            onChange={(event) => onUpdateConfig({ handoffCriteria: event.target.value })}
            placeholder="Ex: cliente pede nota fiscal, reclamação grave, negociação acima do limite, dúvida jurídica..."
            rows={4}
            style={textAreaStyle}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
        <button type="button" onClick={onSave} style={secondaryButtonStyle}>
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
            padding: '12px 20px',
            fontWeight: 700,
            cursor: connected && !completeBusy ? 'pointer' : 'not-allowed',
            opacity: connected && !completeBusy ? 1 : 0.6,
          }}
        >
          {completeBusy ? 'Concluindo...' : 'Salvar e ativar IA'}
        </button>
      </div>

      {!connected ? (
        <p style={{ marginTop: 10, fontSize: 12, color: KLOEL_THEME.textSecondary }}>
          Conecte o canal (passo 1) para ativar a IA.
        </p>
      ) : null}

      {completeMessage ? (
        <p
          style={{
            marginTop: 10,
            fontSize: 12,
            color: failed ? KLOEL_THEME.warning : KLOEL_THEME.success,
          }}
        >
          {completeMessage}
        </p>
      ) : null}
    </div>
  );
}
