'use client';

import {
  SUBINTERFACE_PILL_ROW_STYLE,
  getSubinterfacePillStyle,
} from '@/components/kloel/ui/subinterface-pill';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { startTransition } from 'react';
import { IC } from './VendasView.icons';

const TABS = [
  { key: 'vendas', label: 'Gestao de Vendas', icon: IC.dollar },
  { key: 'assinaturas', label: 'Assinaturas', icon: IC.repeat },
  { key: 'fisicos', label: 'Produtos Fisicos', icon: IC.truck },
  { key: 'pipeline', label: 'Pipeline CRM', icon: IC.trend },
  { key: 'estrategias', label: 'Estrategias', icon: IC.map },
];

interface VendasTabsProps {
  tab: string;
  isMobile: boolean;
  onTabChange: (tab: string) => void;
  onFilterReset: () => void;
  onSearchReset: () => void;
}

export function VendasTabs({ tab, isMobile, onTabChange, onFilterReset, onSearchReset }: VendasTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleTabChange = (newTab: string) => {
    onTabChange(newTab);
    onFilterReset();
    onSearchReset();
    const routes: Record<string, string> = {
      vendas: '/vendas',
      assinaturas: '/vendas/assinaturas',
      fisicos: '/vendas/fisicos',
      pipeline: '/vendas/pipeline',
      estrategias: '/vendas?tab=estrategias',
    };
    const nextRoute = routes[newTab] || '/vendas';
    const currentRoute = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;
    if (currentRoute === nextRoute) {
      return;
    }
    startTransition(() => {
      router.push(nextRoute);
    });
  };

  return (
    <div style={SUBINTERFACE_PILL_ROW_STYLE}>
      {TABS.map((t) => (
        <button
          type="button"
          key={t.key}
          onClick={() => handleTabChange(t.key)}
          style={getSubinterfacePillStyle(tab === t.key, isMobile)}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
          {t.label}
        </button>
      ))}
    </div>
  );
}
