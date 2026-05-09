'use client';

import { kloelT } from '@/lib/i18n/t';
import { Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { Loader2, Sparkles } from 'lucide-react';

interface CiaNowProps {
  message: string;
  phase: string | null | undefined;
  loading: boolean;
  error: string | null;
}

export function CiaNow({ message, phase, loading, error }: CiaNowProps) {
  return (
    <Surface className="p-6">
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${colors.brand.green}18` }}
        >
          {loading ? (
            <Loader2
              className="animate-spin"
              size={22}
              style={{ color: colors.brand.green }}
              aria-hidden="true"
            />
          ) : (
            <Sparkles size={22} style={{ color: colors.brand.green }} aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <p
            className="text-sm uppercase tracking-[0.18em] mb-2"
            style={{ color: colors.text.muted }}
          >
            {kloelT('Agora')}
          </p>
          <p
            className="text-2xl md:text-3xl font-semibold leading-tight"
            style={{ color: colors.text.primary }}
          >
            {message || 'Estou observando o WhatsApp e preparando a proxima acao segura.'}
          </p>
          {phase && (
            <p className="mt-3 text-sm" style={{ color: colors.text.secondary }}>
              {kloelT('Fase atual:')} {phase}
            </p>
          )}
          {error && (
            <p className="mt-3 text-sm" style={{ color: colors.state.error }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </Surface>
  );
}
