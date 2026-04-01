'use client';

export const dynamic = 'force-dynamic';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SectionPage } from '@/components/kloel/SectionPage';
import { ToolCard } from '@/components/kloel/ToolCard';
import { Card } from '@/components/kloel/Card';
import { colors, typography, motion } from '@/lib/design-tokens';
import {
  FRONTEND_CAPABILITIES,
  CAPABILITY_CATEGORY_META,
  getCapabilityBadge,
  getCapabilityHref,
} from '@/lib/frontend-capabilities';

type Category = 'all' | 'impulsione' | 'recupere' | 'fale' | 'gerencie';
type Role = 'all' | 'produtor' | 'afiliado';
const ALL_TOOLS = FRONTEND_CAPABILITIES;
const CATEGORY_CARDS: { key: Category; icon: string; title: string; count: number; color: string }[] = [
  { key: 'impulsione', icon: CAPABILITY_CATEGORY_META.impulsione.icon, title: CAPABILITY_CATEGORY_META.impulsione.title, count: ALL_TOOLS.filter((tool) => tool.category === 'impulsione').length, color: colors.accent.webb },
  { key: 'recupere', icon: CAPABILITY_CATEGORY_META.recupere.icon, title: CAPABILITY_CATEGORY_META.recupere.title, count: ALL_TOOLS.filter((tool) => tool.category === 'recupere').length, color: colors.state.success },
  { key: 'fale', icon: CAPABILITY_CATEGORY_META.fale.icon, title: CAPABILITY_CATEGORY_META.fale.title, count: ALL_TOOLS.filter((tool) => tool.category === 'fale').length, color: colors.accent.gold },
  { key: 'gerencie', icon: CAPABILITY_CATEGORY_META.gerencie.icon, title: CAPABILITY_CATEGORY_META.gerencie.title, count: ALL_TOOLS.filter((tool) => tool.category === 'gerencie').length, color: colors.accent.nebula },
];

export default function VerTodasPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [role, setRole] = useState<Role>('all');
  const filtered = useMemo(() => {
    return ALL_TOOLS.filter((tool) => {
      if (category !== 'all' && tool.category !== category) return false;
      if (role !== 'all' && !tool.roles.includes(role)) return false;
      if (search) {
        const text = `${tool.title} ${tool.desc} ${tool.badge || ''}`.toLowerCase();
        if (!text.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [search, category, role]);

  return (
    <SectionPage
      title="Todas as Ferramentas"
      icon="\u{1F4CB}"
      description={`${ALL_TOOLS.length} capacidades do frontend para impulsionar, recuperar, comunicar e gerenciar`}
      back={() => router.push('/ferramentas')}
    >
      {/* Search + Role Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            placeholder="Buscar ferramenta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px 12px 40px',
              background: colors.background.nebula,
              border: `1px solid ${colors.border.space}`,
              borderRadius: 6,
              color: colors.text.starlight,
              fontFamily: typography.fontFamily.sans,
              fontSize: 14,
              outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, opacity: 0.4 }}>&#128269;</span>
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          style={{
            padding: '12px 16px',
            background: colors.background.nebula,
            border: `1px solid ${colors.border.space}`,
            borderRadius: 6,
            color: colors.text.starlight,
            fontFamily: typography.fontFamily.display,
            fontSize: 13,
            fontWeight: 600,
            outline: 'none',
            appearance: 'none' as const,
            minWidth: 160,
            cursor: 'pointer',
          }}
        >
          <option value="all">Todos os Perfis</option>
          <option value="produtor">Produtor</option>
          <option value="afiliado">Afiliado</option>
        </select>
      </div>

      {/* Category Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {CATEGORY_CARDS.map((cat) => {
          const isActive = category === cat.key;
          return (
            <div
              key={cat.key}
              onClick={() => setCategory(isActive ? 'all' : cat.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                background: isActive ? `rgba(${cat.color === colors.accent.webb ? '78, 122, 224' : cat.color === colors.state.success ? '45, 212, 160' : cat.color === colors.accent.gold ? '201, 168, 76' : '123, 94, 167'}, 0.08)` : colors.background.space,
                border: `1px solid ${isActive ? cat.color : colors.border.space}`,
                borderRadius: 6,
                cursor: 'pointer',
                transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
              }}
            >
              <span style={{ fontSize: 22 }}>{cat.icon}</span>
              <div>
                <div style={{
                  fontFamily: typography.fontFamily.display,
                  fontSize: 14,
                  fontWeight: 600,
                  color: isActive ? cat.color : colors.text.starlight,
                }}>
                  {cat.title}
                </div>
                <div style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: 11,
                  color: colors.text.dust,
                }}>
                  {cat.count} ferramentas
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Results Count */}
      <div style={{
        fontFamily: typography.fontFamily.sans,
        fontSize: 13,
        color: colors.text.moonlight,
        marginBottom: 16,
      }}>
        {filtered.length} ferramenta{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
        {category !== 'all' && ` em ${CATEGORY_CARDS.find(c => c.key === category)?.title}`}
        {role !== 'all' && ` para ${role === 'produtor' ? 'Produtor' : 'Afiliado'}`}
      </div>

      {/* Tools Grid */}
      {filtered.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: 32, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
            Nenhuma ferramenta encontrada para os filtros selecionados.
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map((tool) => {
            return (
              <ToolCard
                key={tool.title}
                icon={tool.icon}
                title={tool.title}
                desc={tool.desc}
                badge={getCapabilityBadge(tool)}
                disabled={tool.status === 'planned'}
                onClick={getCapabilityHref(tool) ? () => router.push(getCapabilityHref(tool)!) : undefined}
              />
            );
          })}
        </div>
      )}
    </SectionPage>
  );
}
