'use client';

import { kloelT } from '@/lib/i18n/t';
import { IC, SORA, MONO, EMBER, TEXT, BORDER } from './SitesViewIcons';

export function CriarSiteBuildingPhase() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20 }}>
      <div style={{ color: EMBER }}>{IC.globe(60)}</div>
      <div style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Gerando seu site com IA...`)}</div>
      <div style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>{kloelT(`Isso pode levar alguns segundos`)}</div>
      <div style={{ width: 300, height: 4, background: BORDER, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: EMBER, borderRadius: 16, width: '100%', animation: 'sitesBuildPulse 1.5s ease-in-out infinite' }} />
      </div>
    </div>
  );
}
