import { KLOEL_THEME } from '@/lib/kloel-theme';
import type { ChannelKey, TikTokModeData } from '../OfficialMarketingChannelPage.helpers';
import { TikTokModeBadge } from './TikTokModeBadge';

interface Props {
  channel: ChannelKey;
  tiktokMode: TikTokModeData | null;
}

export function StepConnection({ channel, tiktokMode }: Props) {
  return (
    <div style={{ color: KLOEL_THEME.textSecondary, lineHeight: 1.7 }}>
      <strong style={{ color: KLOEL_THEME.textPrimary }}>Conexão oficial.</strong> Use o
      botão de conexão abaixo para abrir o fluxo oficial do provedor. O status volta para
      esta tela e o progresso do canal fica salvo no workspace.
      {channel === 'tiktok' && tiktokMode ? (
        <div style={{ marginTop: 14 }}>
          <TikTokModeBadge mode={tiktokMode} />
        </div>
      ) : null}
    </div>
  );
}
