'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Button, CenterStage, Section } from '@/components/kloel';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { MessageSquare, Settings2 } from 'lucide-react';

interface HelpSectionProps {
  onNavigate: (href: string) => void;
}

export function HelpSection({ onNavigate }: HelpSectionProps) {
  return (
    <Section spacing="lg">
      <CenterStage size="XL">
        <div
          className="p-6 rounded-xl text-center"
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${colors.stroke}`,
          }}
        >
          <KloelMushroomMark size={40} title="Autopilot" traceColor={colors.brand.green} />
          <h3 className="text-lg font-semibold mt-4 mb-2" style={{ color: colors.text.primary }}>
            {kloelT('Precisa de ajuda com o Autopilot?')}
          </h3>
          <p className="text-sm mb-4 max-w-md mx-auto" style={{ color: colors.text.muted }}>
            {kloelT(
              'O Autopilot usa IA para responder automaticamente, qualificar leads e direcionar para conversão. Configure fluxos personalizados para maximizar resultados.',
            )}
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => onNavigate('/flow')}>
              <Settings2 size={16} className="mr-2" aria-hidden="true" />
              {kloelT('Configurar Fluxos')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => onNavigate('/chat')}>
              <MessageSquare size={16} className="mr-2" aria-hidden="true" />
              {kloelT('Falar com KLOEL')}
            </Button>
          </div>
        </div>
      </CenterStage>
    </Section>
  );
}
