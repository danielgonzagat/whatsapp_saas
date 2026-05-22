'use client';

import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, startTransition } from 'react';
import { SORA, EMBER, TEXT, TEXT_DIM } from './SitesViewIcons';
import { SITE_TABS } from './SitesView.tabs';
import { VisaoGeral } from './VisaoGeral';
import { Dominios } from './Dominios';
import { Hospedagem } from './Hospedagem';
import { CriarSite } from './CriarSite';
import { EditarSite } from './EditarSite';
import { Apps } from './Apps';
import { Protecao } from './Protecao';

export default function SitesView({ defaultTab = 'visao-geral' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = defaultTab;

  const rawMode = searchParams?.get('mode') ?? null;

  const switchTab = useCallback((id: string) => {
    const nextRoute = id === 'visao-geral' ? '/sites' : `/sites/${id}`;
    if (pathname === nextRoute) {return;}
    startTransition(() => { router.push(nextRoute); });
  }, [pathname, router]);

  return (
    <div style={{ fontFamily: SORA, color: TEXT, minHeight: '100vh', padding: isMobile ? 16 : 24 }}>
      <style>{`
        @keyframes sitesFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sitesBuildPulse { 0% { opacity: 0.3; transform: scaleX(0.3); } 50% { opacity: 1; transform: scaleX(1); } 100% { opacity: 0.3; transform: scaleX(0.3); } }
      `}</style>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto', paddingBottom: 8, maxWidth: 1240, marginInline: 'auto' }}>
        {SITE_TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => switchTab(t.id)}
            style={{ fontFamily: SORA, fontSize: isMobile ? 11 : 12, padding: isMobile ? '8px 12px' : '8px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, background: tab === t.id ? `${EMBER}20` : 'transparent', color: tab === t.id ? EMBER : TEXT_DIM, transition: 'all .2s' }}>
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {tab === 'visao-geral' && <VisaoGeral switchTab={switchTab} />}
        {tab === 'dominios' && <Dominios />}
        {tab === 'hospedagem' && <Hospedagem />}
        {tab === 'criar' && (rawMode ? <CriarSite mode={rawMode} /> : <CriarSite />)}
        {tab === 'editar' && (rawMode ? <EditarSite mode={rawMode} /> : <EditarSite />)}
        {tab === 'apps' && <Apps />}
        {tab === 'protecao' && <Protecao />}
      </div>
    </div>
  );
}
