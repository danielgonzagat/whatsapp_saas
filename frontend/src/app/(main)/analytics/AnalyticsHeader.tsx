'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, FONT_MONO } from './analytics.design-tokens';
import { ICONS } from './shared/Icons';
import { Button } from './shared/Components';
import type { ReportFilters, SetFilters } from './analytics.types';
import type { Dispatch, SetStateAction } from 'react';

interface AnalyticsHeaderProps {
  filters: ReportFilters;
  setFilters: SetFilters;
  setShowFilter: Dispatch<SetStateAction<boolean>>;
  onExport: () => void;
  showExport: boolean;
  isMobile: boolean;
}

export function AnalyticsHeader({
  filters,
  setFilters,
  setShowFilter,
  onExport,
  showExport,
  isMobile,
}: AnalyticsHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 12,
        marginBottom: 20,
      }}
    >
      <div />
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: isMobile ? 'stretch' : 'center',
          flexWrap: 'wrap',
          width: isMobile ? '100%' : 'auto',
        }}
      >
        <input
          aria-label="Data inicio"
          type="date"
          value={filters.startDate ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
          style={dateInputStyle(isMobile)}
        />
        <span style={{ color: V.t3, fontSize: 10 }}>{kloelT(`ate`)}</span>
        <input
          aria-label="Data fim"
          type="date"
          value={filters.endDate ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
          style={dateInputStyle(isMobile)}
        />
        <Button primary onClick={() => setShowFilter(true)}>
          {ICONS.filter(14)} {kloelT(`Filtro avancado`)}
        </Button>
        {showExport && (
          <Button accent={V.g2} onClick={onExport}>
            {ICONS.dl(14)} {kloelT(`Excel`)}
          </Button>
        )}
      </div>
    </div>
  );
}

function dateInputStyle(isMobile: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    background: V.e,
    border: `1px solid ${V.b}`,
    borderRadius: 6,
    color: V.t,
    fontSize: 11,
    fontFamily: FONT_MONO,
    outline: 'none',
    width: isMobile ? '100%' : 'auto',
  };
}
