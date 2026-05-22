import Link from 'next/link';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { CHANNEL_META, type ChannelKey } from '../OfficialMarketingChannelPage.helpers';

interface Props {
  channel: ChannelKey;
}

export function ChannelNav({ channel }: Props) {
  return (
    <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
      {(['whatsapp', 'instagram', 'facebook', 'tiktok', 'email'] as ChannelKey[]).map((item) => (
        <Link
          key={item}
          href={`/marketing/${item}`}
          style={{
            color: item === channel ? CHANNEL_META[item].color : KLOEL_THEME.textSecondary,
            textDecoration: 'none',
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 12,
          }}
        >
          {CHANNEL_META[item].label}
        </Link>
      ))}
    </nav>
  );
}
