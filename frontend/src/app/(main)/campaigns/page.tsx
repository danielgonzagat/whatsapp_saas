'use client';

import { kloelT } from '@/lib/i18n/t';
import { IC, SORA, EMBER, TEXT, TEXT_DIM, TEXT_MUTED } from '@/components/kloel/sites/SitesViewIcons';
import { Card } from '@/components/kloel/sites/SitesViewAtoms';

/**
 * /campaigns — honest state while the campaign management feature
 * is not yet available. Replaces the previous redirect to /marketing/email.
 */
export default function CampaignsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.zap(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Campanhas`)}</span>
      </div>

      <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 24px', gap: 16 }}>
        <span style={{ color: EMBER, opacity: 0.25 }}>{IC.zap(48)}</span>
        <div>
          <div style={{ fontFamily: SORA, fontSize: 16, color: TEXT, marginBottom: 8 }}>
            {kloelT(`Gestao de Campanhas`)}
          </div>
          <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM, maxWidth: 480, lineHeight: 1.6 }}>
            {kloelT(`O gerenciamento de campanhas ainda nao esta disponivel. Enquanto isso, voce pode acessar as ferramentas de marketing por email e redes sociais nas abas ao lado.`)}
          </div>
        </div>
        <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_MUTED, maxWidth: 420 }}>
          {kloelT(`Em breve voce podera criar, gerenciar e analisar campanhas de marketing diretamente do painel KLOEL.`)}
        </div>
      </Card>
    </div>
  );
}
