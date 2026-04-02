'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { SectionPage } from '@/components/kloel/SectionPage';
import { Card } from '@/components/kloel/Card';
import { colors, typography, motion } from '@/lib/design-tokens';
import { FRONTEND_CAPABILITIES, getCategoryCounts } from '@/lib/frontend-capabilities';

const SECTIONS = [
  {
    title: 'Impulsione suas vendas',
    description:
      'Ferramentas para conversao, paginas, funnels, area de membros e crescimento de receita.',
    icon: '\u{1F680}',
    href: '/ferramentas/impulsione',
    count: getCategoryCounts('impulsione').total,
    color: colors.accent.webb,
  },
  {
    title: 'Recupere vendas',
    description:
      'Carrinho abandonado, retomada de leads, follow-ups, fluxos de retorno e abandono.',
    icon: '\u{1F504}',
    href: '/ferramentas/recupere',
    count: getCategoryCounts('recupere').total,
    color: colors.state.success,
  },
  {
    title: 'Fale com seus leads',
    description: 'Inbox, campanhas, multicanal, WhatsApp, IA, agendamento e atendimento.',
    icon: '\u{1F4AC}',
    href: '/ferramentas/fale',
    count: getCategoryCounts('fale').total,
    color: colors.accent.gold,
  },
  {
    title: 'Gerencie seu negocio',
    description: 'Pagamentos, colaboradores, video, pixels, relatorios, lancamentos e operacao.',
    icon: '\u{2699}\u{FE0F}',
    href: '/ferramentas/gerencie',
    count: getCategoryCounts('gerencie').total,
    color: colors.accent.gold,
  },
  {
    title: 'Ver todas as ferramentas',
    description:
      'Catalogo completo das capacidades do frontend, com status ativo, parcial e planejado.',
    icon: '\u{1F4CB}',
    href: '/ferramentas/ver-todas',
    count: FRONTEND_CAPABILITIES.length,
    color: colors.accent.nebula,
  },
];

export default function FerramentasPage() {
  const router = useRouter();

  return (
    <SectionPage
      title="Ferramentas"
      icon="\u{1F9F0}"
      description="Impulsione vendas, gerencie seu negocio e otimize cada etapa da sua operacao"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
        }}
      >
        {SECTIONS.map((section) => (
          <Card
            key={section.title}
            onClick={() => router.push(section.href)}
            style={{ padding: 28, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
          >
            {/* Accent top border */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: section.color,
                borderRadius: '12px 12px 0 0',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 6,
                  background: colors.background.nebula,
                  border: `1px solid ${colors.border.space}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  flexShrink: 0,
                }}
              >
                {section.icon}
              </div>
              <div>
                <div
                  style={{
                    fontFamily: typography.fontFamily.display,
                    fontSize: 17,
                    fontWeight: 600,
                    color: colors.text.starlight,
                    letterSpacing: '0.01em',
                  }}
                >
                  {section.title}
                </div>
                <div
                  style={{
                    fontFamily: typography.fontFamily.display,
                    fontSize: 12,
                    fontWeight: 600,
                    color: section.color,
                    marginTop: 2,
                  }}
                >
                  {section.count} ferramentas
                </div>
              </div>
            </div>

            <div
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: 13,
                color: colors.text.dust,
                lineHeight: 1.5,
                marginBottom: 20,
              }}
            >
              {section.description}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: section.color,
                fontFamily: typography.fontFamily.display,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Explorar &#8594;
            </div>
          </Card>
        ))}
      </div>
    </SectionPage>
  );
}
