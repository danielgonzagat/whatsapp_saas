import { KLOEL_THEME } from '@/lib/kloel-theme';
import { CHANNEL_META, type ChannelKey, type TikTokModeData } from '../OfficialMarketingChannelPage.helpers';
import { TikTokModeBadge } from './TikTokModeBadge';

interface Props {
  channel: ChannelKey;
  tiktokMode: TikTokModeData | null;
}

const CONNECT_COPY: Record<ChannelKey, { provider: string; how: string[] }> = {
  whatsapp: {
    provider: 'WhatsApp Cloud API (Meta oficial)',
    how: [
      'Sem QR Code — conexão oficial via login Meta Business.',
      'Você autoriza o número no Gerenciador da Meta; o Kloel passa a enviar e responder pela API oficial.',
      'Mensagens, leads e vendas aparecem no painel do canal automaticamente.',
    ],
  },
  instagram: {
    provider: 'Instagram via Meta oficial',
    how: [
      'Login oficial Meta — autoriza a conta Instagram Business vinculada.',
      'O Kloel responde DMs e comentários pela Graph API oficial.',
      'Sem senha compartilhada, sem automação não-oficial.',
    ],
  },
  facebook: {
    provider: 'Facebook Pages via Meta oficial',
    how: [
      'Login oficial Meta — autoriza a Página do Facebook.',
      'O Kloel responde mensagens e comentários pela API oficial.',
      'Tudo auditado e revogável no Gerenciador da Meta.',
    ],
  },
  tiktok: {
    provider: 'TikTok via OAuth oficial',
    how: [
      'Login oficial TikTok — conta de criador ou advertiser.',
      'Sem QR Code: autorização pelo fluxo oficial do TikTok.',
      'O modo conectado define quais ações o Kloel pode executar.',
    ],
  },
  'google-ads': {
    provider: 'Google Ads API via OAuth oficial',
    how: [
      'Login oficial Google — autoriza somente leitura da conta de anúncios.',
      'O Kloel consulta customers e campanhas pela Google Ads API.',
      'Tokens ficam criptografados no workspace e podem ser revogados no Google.',
    ],
  },
  email: {
    provider: 'Email transacional Kloel',
    how: [
      'Ativação direta — sem QR Code.',
      'O Kloel passa a enviar campanhas e responder pelo domínio configurado.',
      'Use "Enviar teste" para validar a entrega antes de ativar a IA.',
    ],
  },
};

/**
 * Step 0 hero. Explains the OFFICIAL connection (no QR Code) for the channel.
 * The real connect action lives in <ActionButtons/> below the panel; this is
 * the contextual explanation + status. Theme-token based (light/dark).
 */
export function StepConnection({ channel, tiktokMode }: Props) {
  const meta = CHANNEL_META[channel];
  const copy = CONNECT_COPY[channel];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: KLOEL_THEME.accentLight,
            color: meta.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {meta.label.charAt(0)}
        </span>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: KLOEL_THEME.textPrimary }}>
            Conectar {meta.label}
          </h2>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 12,
              color: KLOEL_THEME.textSecondary,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {copy.provider}
          </p>
        </div>
      </div>

      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          color: KLOEL_THEME.textSecondary,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {copy.how.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <p
        style={{
          margin: 0,
          padding: '10px 14px',
          borderRadius: 6,
          background: KLOEL_THEME.bgSecondary,
          border: `1px solid ${KLOEL_THEME.borderPrimary}`,
          color: KLOEL_THEME.textSecondary,
          fontSize: 12,
        }}
      >
        Use o botão de conexão oficial abaixo. O status volta para esta tela e o
        progresso fica salvo no workspace.
      </p>

      {channel === 'tiktok' && tiktokMode ? <TikTokModeBadge mode={tiktokMode} /> : null}
    </div>
  );
}
