'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography, motion } from '@/lib/design-tokens';
import { useAnalyticsDashboard } from '@/hooks/useAnalytics';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';

export default function ParceriasPage() {
  const router = useRouter();
  const { dashboard, isLoading } = useAnalyticsDashboard();
  const dash = dashboard as any;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <OrbitalLoader size={36} />
      </div>
    );
  }

  const sections = [
    {
      title: 'Programa de Afiliados',
      description: 'Gerencie seus afiliados, comissoes e links de indicacao. Acompanhe o desempenho de cada parceiro.',
      icon: '\u{1F91D}',
      href: '/parcerias/afiliados',
      stats: [
        { label: 'Afiliados Ativos', value: dash?.affiliates ?? dash?.activeAffiliates ?? 0 },
        { label: 'Comissoes Pagas', value: `R$ ${(dash?.affiliateCommissions ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
      ],
      color: colors.accent.webb,
    },
    {
      title: 'Colaboradores',
      description: 'Adicione e gerencie colaboradores da sua operacao. Defina permissoes e acompanhe atividades.',
      icon: '\u{1F465}',
      href: '/parcerias/colaboradores',
      stats: [
        { label: 'Colaboradores', value: dash?.collaborators ?? dash?.teamMembers ?? 0 },
        { label: 'Coproducoes', value: dash?.coproductions ?? 0 },
      ],
      color: colors.accent.gold,
    },
  ];

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      <StarField density={35} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 900 }}>
        <PageTitle
          title="Parcerias"
          sub="Gerencie seus afiliados, colaboradores e coproducoes"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {sections.map((section) => (
            <Card
              key={section.title}
              onClick={() => router.push(section.href)}
              style={{ padding: 28, cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: colors.background.nebula,
                  border: `1px solid ${colors.border.space}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                }}>
                  {section.icon}
                </div>
                <div>
                  <div style={{
                    fontFamily: typography.fontFamily.display,
                    fontSize: 18,
                    fontWeight: 600,
                    color: colors.text.starlight,
                  }}>
                    {section.title}
                  </div>
                </div>
              </div>

              <div style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: 13,
                color: colors.text.dust,
                lineHeight: 1.5,
                marginBottom: 20,
              }}>
                {section.description}
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                {section.stats.map((stat) => (
                  <div key={stat.label}>
                    <Lbl>{stat.label}</Lbl>
                    <Val size={20} color={section.color}>{stat.value}</Val>
                  </div>
                ))}
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 20,
                color: colors.accent.webb,
                fontFamily: typography.fontFamily.display,
                fontSize: 13,
                fontWeight: 600,
              }}>
                Acessar &#8594;
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
