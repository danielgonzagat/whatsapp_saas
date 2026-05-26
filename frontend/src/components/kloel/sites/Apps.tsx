'use client';

import { kloelT } from '@/lib/i18n/t';
import { IC, SORA, EMBER, TEXT, TEXT_DIM, TEXT_MUTED } from './SitesViewIcons';
import { Card } from './SitesViewAtoms';
export function Apps() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.puzzle(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Apps & Integracoes`)}</span>
      </div>

      <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 24px', gap: 16 }}>
        <span style={{ color: EMBER, opacity: 0.25 }}>{IC.puzzle(48)}</span>
        <div>
          <div style={{ fontFamily: SORA, fontSize: 16, color: TEXT, marginBottom: 8 }}>
            {kloelT(`Apps & Integracoes`)}
          </div>
          <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM, maxWidth: 480, lineHeight: 1.6 }}>
            {kloelT(`O marketplace de apps ainda nao esta disponivel. As integracoes com ferramentas externas serao liberadas em breve.`)}
          </div>
        </div>
        <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_MUTED, maxWidth: 420 }}>
          {kloelT(`Fique atento as novidades no painel.`)}
        </div>
      </Card>
    </div>
  );
}
