'use client';

import { kloelT } from '@/lib/i18n/t';
import { IC, SORA, EMBER, TEXT, TEXT_DIM, TEXT_MUTED } from './SitesViewIcons';
import { Card } from './SitesViewAtoms';
export function Dominios() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.globe(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Dominios`)}</span>
      </div>

      <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 24px', gap: 16 }}>
        <span style={{ color: EMBER, opacity: 0.25 }}>{IC.globe(48)}</span>
        <div>
          <div style={{ fontFamily: SORA, fontSize: 16, color: TEXT, marginBottom: 8 }}>
            {kloelT(`Gerenciamento de Dominios`)}
          </div>
          <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM, maxWidth: 480, lineHeight: 1.6 }}>
            {kloelT(`O gerenciamento de dominios ainda nao esta disponivel. Enquanto isso, configure seus dominios diretamente no Cloudflare ou no seu provedor de DNS.`)}
          </div>
        </div>
        <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_MUTED, maxWidth: 420 }}>
          {kloelT(`Em breve voce podera conectar seus dominios via Cloudflare direto do painel KLOEL.`)}
        </div>
      </Card>
    </div>
  );
}
