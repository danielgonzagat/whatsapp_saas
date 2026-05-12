'use client';
import { kloelT } from '@/lib/i18n/t';
import {
  NP,
  Ticker,
  SORA,
  MONO,
  PURPLE,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import type { DisplayArea } from './ProdutosView.types';

export default function AreaMembrosOverviewPanel({
  totalStudents,
  displayAreas,
  avgCompletion,
}: {
  totalStudents: number;
  displayAreas: DisplayArea[];
  avgCompletion: number;
}) {
  const activeAreas = displayAreas.filter((area) => area.active !== false).length;
  const totalModules = displayAreas.reduce(
    (sum: number, area) => sum + Number(area.modulesCount || area.modules || 0),
    0,
  );
  const totalLessons = displayAreas.reduce(
    (sum: number, area) => sum + Number(area.lessonsCount || 0),
    0,
  );
  const certificatesEnabled = displayAreas.filter((area) => area.certificates !== false).length;
  const communityEnabled = displayAreas.filter((area) => area.community === true).length;

  return (
    <div style={{ opacity: 1 }}>
      <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 200,
            height: 80,
            borderRadius: '16%',
            background: 'rgba(232, 93, 48, 0.08)',
            animation: 'glow 3s ease-in-out',
            pointerEvents: 'none',
          }}
        />
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              letterSpacing: '0.25em',
              textTransform: 'uppercase' as const,
              marginBottom: 4,
            }}
          >
            {kloelT('Total de Alunos')}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 80,
              fontWeight: 700,
              color: PURPLE,
              letterSpacing: '-0.02em',
            }}
          >
            {totalStudents.toLocaleString('pt-BR')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 8,
            }}
          >
            <NP w={40} h={14} color={PURPLE} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: PURPLE }}>
              {activeAreas > 0
                ? `${activeAreas}/${displayAreas.length} areas ativas`
                : 'Nenhuma area ativa'}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          background: BG_CARD,
          borderRadius: 6,
          border: `1px solid ${BORDER}`,
          marginBottom: 20,
        }}
      >
        <NP w={120} h={24} color={PURPLE} />
        <span
          style={{ fontFamily: MONO, fontSize: 11, color: PURPLE, flex: 1, textAlign: 'center' }}
        >
          {kloelT('Engagement Pulse')}
        </span>
        <NP w={120} h={24} color={PURPLE} />
      </div>

      <Ticker
        items={
          displayAreas.length > 0
            ? displayAreas.map((a) => `${a.name}: ${a.students} alunos`)
            : ['Aguardando alunos...']
        }
        color={PURPLE}
      />

      <div style={{ display: 'flex', gap: 12, padding: '20px 0' }}>
        {[
          {
            icon: IC.users,
            label: 'Alunos',
            value: String(totalStudents),
            sub: `${activeAreas} areas ativas`,
          },
          {
            icon: IC.trend,
            label: 'Conclusao',
            value: `${avgCompletion}%`,
            sub: `${totalLessons} aulas publicadas`,
          },
          {
            icon: IC.book,
            label: 'Areas',
            value: String(displayAreas.length),
            sub: `${totalModules} modulos`,
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ color: PURPLE }}>{s.icon(18)}</span>
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--app-text-tertiary)',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {s.label}
              </span>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
              }}
            >
              {s.value}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: PURPLE, marginTop: 4 }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            marginBottom: 16,
          }}
        >
          {kloelT('Progresso por Area')}
        </div>
        {displayAreas
          .filter((a) => a.completion > 0)
          .map((a) => (
            <div key={a.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                  {a.name}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: PURPLE }}>
                  {a.completion}%
                </span>
              </div>
              <div style={{ height: 4, background: BORDER, borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${a.completion}%`,
                    height: '100%',
                    background: PURPLE,
                    borderRadius: 4,
                    transition: 'width 0.6s ease',
                  }}
                />
              </div>
            </div>
          ))}
      </div>

      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          marginBottom: 16,
          borderLeft: `3px solid ${PURPLE}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: PURPLE }}>{IC.star(18)}</span>
          <span
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT('Recursos liberados')}
          </span>
          <NP w={40} h={14} color={PURPLE} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Areas com certificado', value: String(certificatesEnabled) },
            { label: 'Areas com comunidade', value: String(communityEnabled) },
            { label: 'Modulos publicados', value: String(totalModules) },
            { label: 'Aulas publicadas', value: String(totalLessons) },
          ].map((c) => (
            <div
              key={c.label}
              style={{ padding: '10px 14px', background: BG_ELEVATED, borderRadius: 6 }}
            >
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  color: 'var(--app-text-tertiary)',
                  marginBottom: 4,
                }}
              >
                {c.label}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                }}
              >
                {c.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
