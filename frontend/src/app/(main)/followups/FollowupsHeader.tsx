'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { Calendar, RotateCw } from 'lucide-react';

interface FollowupsHeaderProps {
  isLoading: boolean;
  onRefresh: () => void;
}

export function FollowupsHeader({ isLoading, onRefresh }: FollowupsHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Calendar className="w-8 h-8 text-primary" aria-hidden="true" />
          {kloelT(`Follow-ups Programados`)}
        </h1>
        <p className="text-muted-foreground mt-1">
          {kloelT(`Acompanhe todos os follow-ups agendados pela IA`)}
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-[var(--ember-hover)] disabled:bg-primary/50 text-primary-foreground font-medium rounded-lg transition-colors"
        style={{ '--ember-hover': colors.ember.hover } as React.CSSProperties}
      >
        {isLoading ? (
          <KloelMushroomMark
            size={18}
            title="Atualizando follow-ups"
            traceColor={colors.background.void}
          />
        ) : (
          <RotateCw className="w-4 h-4" aria-hidden="true" />
        )}
        {kloelT(`Atualizar`)}
      </button>
    </div>
  );
}
