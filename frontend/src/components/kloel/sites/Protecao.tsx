'use client';

import { kloelT } from '@/lib/i18n/t';
import { IC, SORA, EMBER, TEXT, TEXT_DIM, TEXT_MUTED } from './SitesViewIcons';
import { Card } from './SitesViewAtoms';
export function Protecao() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.shield(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Protecao & Seguranca`)}</span>
      </div>

      <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 24px', gap: 16 }}>
        <span style={{ color: EMBER, opacity: 0.25 }}>{IC.shield(48)}</span>
        <div>
          <div style={{ fontFamily: SORA, fontSize: 16, color: TEXT, marginBottom: 8 }}>
            {kloelT(`Protecao & Seguranca`)}
          </div>
          <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM, maxWidth: 480, lineHeight: 1.6 }}>
            {kloelT(`O painel de seguranca avancada ainda nao esta disponivel. Seu site ja conta com protecao basica de HTTPS e firewall na infraestrutura da KLOEL.`)}
          </div>
        </div>
        <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_MUTED, maxWidth: 420 }}>
          {kloelT(`Em breve voce podera gerenciar certificados SSL, regras de WAF e protecao DDoS diretamente do painel.`)}
        </div>
      </Card>
    </div>
  );
}
