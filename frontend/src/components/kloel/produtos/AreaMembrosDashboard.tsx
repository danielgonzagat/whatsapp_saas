'use client';

import type { DisplayArea } from './ProdutosView.types';
import {
  NP,
  fmt,
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  PURPLE,
  ANIMATIONS,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import { kloelT } from '@/lib/i18n/t';

interface Props {
  totalStudents: number;
  displayAreas: DisplayArea[];
  avgCompletion: number;
}

export default function AreaMembrosDashboard({
  totalStudents,
  displayAreas,
  avgCompletion,
}: Props) {
  const totalModules = displayAreas.reduce(
    (s, a) => s + (a.modulesCount || a.modules),
    0,
  );
  const totalLessons = displayAreas.reduce((s, a) => s + a.lessonsCount, 0);
  const certificatesEnabled = displayAreas.filter((a) => a.certificates).length;
  const communityEnabled = displayAreas.filter((a) => a.community).length;
  const activeCount = displayAreas.filter((a) => a.active).length;

  const completionBars = displayAreas
    .map((a) => ({
      id: a.id,
      name: a.name,
      completion: a.completion || 0,
      color: a.primaryColor || PURPLE,
    }))
    .filter((b) => b.completion > 0)
    .sort((a, b) => b.completion - a.completion);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Students Hero */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 12,
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          padding: '40px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 200,
            height: 80,
            borderRadius: '50%',
            background: PURPLE,
            filter: 'blur(40px)',
            opacity: 0.35,
            animation: 'glow 3s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--app-text-tertiary)',
            position: 'relative',
          }}
        >
          {kloelT('Total de Alunos')}
        </span>
        <span
          style={{
            fontFamily: SORA,
            fontSize: 80,
            fontWeight: 800,
            color: PURPLE,
            lineHeight: 1,
            position: 'relative',
          }}
        >
          {fmt(totalStudents)}
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            position: 'relative',
          }}
        >
          <NP w={40} h={14} color={PURPLE} />
          <span
            style={{
              fontFamily: SORA,
              fontSize: 14,
              color: PURPLE,
              fontWeight: 600,
            }}
          >
            {activeCount} {kloelT('ativas')}
          </span>
        </div>
      </div>

      {/* Engagement Pulse Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: BG_CARD,
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          padding: '10px 16px',
        }}
      >
        <NP w={120} h={24} color={PURPLE} />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: PURPLE,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {kloelT('Engagement Pulse')}
        </span>
        <NP w={120} h={24} color={PURPLE} />
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: 12 }}>
        {[
          {
            label: kloelT('Alunos'),
            value: fmt(totalStudents),
            icon: IC.users(18),
            sub: `${activeCount} ${kloelT('areas ativas')}`,
          },
          {
            label: kloelT('Conclusao'),
            value: `${Math.round(avgCompletion)}%`,
            icon: IC.trend(18),
            sub: `${fmt(totalLessons)} ${kloelT('aulas')}`,
          },
          {
            label: kloelT('Areas'),
            value: fmt(displayAreas.length),
            icon: IC.book(18),
            sub: `${fmt(totalModules)} ${kloelT('modulos')}`,
          },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              flex: 1,
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--app-text-secondary)',
              }}
            >
              {card.icon}
              <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600 }}>
                {card.label}
              </span>
            </div>
            <span
              style={{
                fontFamily: SORA,
                fontSize: 28,
                fontWeight: 800,
                color: PURPLE,
              }}
            >
              {card.value}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'var(--app-text-tertiary)',
              }}
            >
              {card.sub}
            </span>
          </div>
        ))}
      </div>

      {/* Completion Bars */}
      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: SORA,
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--app-text-primary)',
          }}
        >
          {kloelT('Progresso por Area')}
        </span>
        {completionBars.length === 0 ? (
          <span
            style={{
              fontFamily: SORA,
              fontSize: 12,
              color: 'var(--app-text-tertiary)',
            }}
          >
            {kloelT('Nenhuma area com progresso ainda')}
          </span>
        ) : (
          completionBars.map((bar) => (
            <div key={bar.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                  {bar.name}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: bar.color }}>
                  {Math.round(bar.completion)}%
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: `${bar.color}18`,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, bar.completion)}%`,
                    borderRadius: 3,
                    background: `linear-gradient(90deg, ${bar.color}50, ${bar.color})`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Resource Snapshot */}
      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderLeft: `3px solid ${PURPLE}`,
          borderRadius: 10,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {IC.star(16)}
          <span
            style={{ fontFamily: SORA, fontSize: 14, fontWeight: 700, color: 'var(--app-text-primary)' }}
          >
            {kloelT('Recursos liberados')}
          </span>
          <NP w={60} h={14} color={PURPLE} />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px 12px',
          }}
        >
          {[
            { label: kloelT('com certificado'), value: certificatesEnabled },
            { label: kloelT('com comunidade'), value: communityEnabled },
            { label: kloelT('modulos publicados'), value: totalModules },
            { label: kloelT('aulas publicadas'), value: totalLessons },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-secondary)' }}>
                {item.label}
              </span>
              <span
                style={{ fontFamily: MONO, fontSize: 12, color: PURPLE, fontWeight: 600 }}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <style>{ANIMATIONS}</style>
    </div>
  );
}
