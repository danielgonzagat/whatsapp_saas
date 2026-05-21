import type { TikTokModeData } from '../OfficialMarketingChannelPage.helpers';

interface Props {
  mode: TikTokModeData;
}

const colorMap: Record<string, { bg: string; fg: string; label: string }> = {
  sell: {
    bg: 'rgba(16,185,129,0.12)',
    fg: 'rgb(16,185,129)',
    label: 'Vendendo',
  },
  listen: {
    bg: 'rgba(245,158,11,0.12)',
    fg: 'rgb(245,158,11)',
    label: 'Recebendo',
  },
  blocked: {
    bg: 'rgba(239,68,68,0.12)',
    fg: 'rgb(239,68,68)',
    label: 'Bloqueado',
  },
};

export function TikTokModeBadge({ mode }: Props) {
  const c = colorMap[mode.mode] || colorMap.blocked;

  return (
    <div
      style={{
        border: `1px solid ${c.fg}30`,
        borderRadius: 6,
        background: c.bg,
        padding: '12px 14px',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        color: c.fg,
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Modo TikTok:{' '}
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 8,
            background: c.fg,
            marginRight: 4,
            verticalAlign: 'middle',
          }}
        />{' '}
        {c.label}
      </div>
      {mode.mode === 'blocked' && mode.details.missingVariables.length > 0 ? (
        <div>
          Variáveis ausentes: {mode.details.missingVariables.join(', ')}
          {mode.details.requiredSteps.length > 0 ? (
            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
              {mode.details.requiredSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : mode.mode === 'listen' && !mode.details.outboundApproved ? (
        <div>
          Aprovacao de envio pro-ativo pendente.
          {mode.details.requiredSteps.length > 0 ? (
            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
              {mode.details.requiredSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
