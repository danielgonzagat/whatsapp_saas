'use client';

import { kloelT } from '@/lib/i18n/t';
import { Calendar, CheckCircle2, Clock } from 'lucide-react';
import type { Followup } from './followups.types';

interface FollowupsStatsCardsProps {
  total: number;
  followups: Followup[];
}

/** Stats cards for the followups page. */
export function FollowupsStatsCards({ total, followups }: FollowupsStatsCardsProps) {
  const pendingCount = followups.filter((f) => f.status === 'pending').length;
  const executedCount = followups.filter((f) => f.status === 'executed').length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div className="bg-[var(--bg-surface)] rounded-xl p-5 border border-[var(--bg-border)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[var(--ember-primary)]/15 rounded-xl flex items-center justify-center">
            <Calendar className="w-6 h-6 text-[var(--ember-primary)]" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[var(--text-muted)] text-sm">{kloelT(`Total`)}</p>
            <p className="text-2xl font-bold text-[var(--text-silver)]">{total}</p>
          </div>
        </div>
      </div>
      <div className="bg-[var(--bg-surface)] rounded-xl p-5 border border-[var(--bg-border)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-yellow-500/15 rounded-xl flex items-center justify-center">
            <Clock className="w-6 h-6 text-yellow-400" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[var(--text-muted)] text-sm">{kloelT(`Pendentes`)}</p>
            <p className="text-2xl font-bold text-[var(--text-silver)]">{pendingCount}</p>
          </div>
        </div>
      </div>
      <div className="bg-[var(--bg-surface)] rounded-xl p-5 border border-[var(--bg-border)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-green-500/15 rounded-xl flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green-400" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[var(--text-muted)] text-sm">{kloelT(`Executados`)}</p>
            <p className="text-2xl font-bold text-[var(--text-silver)]">{executedCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
