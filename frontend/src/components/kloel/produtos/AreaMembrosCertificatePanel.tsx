'use client';
import { kloelT } from '@/lib/i18n/t';
import {
  NP,
  SORA,
  MONO,
  PURPLE,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import type { DisplayArea } from './ProdutosView.types';

export default function AreaMembrosCertificatePanel({
  displayAreas,
}: {
  displayAreas: DisplayArea[];
}) {
  const areasWithCert = displayAreas.filter((a) => a.certificates !== false);
  const areasWithQuizzes = displayAreas.filter((a) => a.quizzes !== false);
  const areasWithGamification = displayAreas.filter((a) => a.gamification !== false);
  const areasWithProgress = displayAreas.filter((a) => a.progressTrack !== false);
  const areasWithDownloads = displayAreas.filter((a) => a.downloads !== false);
  const areasWithComments = displayAreas.filter((a) => a.comments !== false);

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
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${PURPLE}40, transparent 70%)`,
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
            {kloelT('Certificados & Recursos')}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 48,
              fontWeight: 700,
              color: PURPLE,
              letterSpacing: '-0.02em',
            }}
          >
            {areasWithCert.length}/{displayAreas.length}
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
              {areasWithCert.length > 0
                ? `${areasWithCert.length} areas com certificado`
                : 'Nenhum certificado'}
            </span>
          </div>
        </div>
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
          {kloelT('Visao geral de certificados')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Certificados ativos', count: areasWithCert.length },
            { label: 'Quizzes ativos', count: areasWithQuizzes.length },
            { label: 'Gamificacao ativa', count: areasWithGamification.length },
            { label: 'Progresso habilitado', count: areasWithProgress.length },
            { label: 'Downloads habilitados', count: areasWithDownloads.length },
            { label: 'Comentarios habilitados', count: areasWithComments.length },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: '14px 16px',
                background: BG_ELEVATED,
                borderRadius: 6,
                borderLeft: `3px solid ${PURPLE}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontFamily: SORA,
                    fontSize: 12,
                    color: 'var(--app-text-primary)',
                  }}
                >
                  {item.label}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 16,
                    fontWeight: 700,
                    color: PURPLE,
                  }}
                >
                  {item.count}
                </span>
              </div>
              <div
                style={{
                  height: 3,
                  background: BORDER,
                  borderRadius: 2,
                  overflow: 'hidden',
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    width: displayAreas.length
                      ? `${Math.round((item.count / displayAreas.length) * 100)}%`
                      : '0%',
                    height: '100%',
                    background: PURPLE,
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            marginBottom: 12,
          }}
        >
          {kloelT('Areas com certificado')}
        </div>
        {areasWithCert.length === 0 ? (
          <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-secondary)' }}>
            {kloelT('Nenhuma area com certificado. Ative nas configuracoes de cada area.')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {areasWithCert.map((area) => (
              <div
                key={area.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: BG_ELEVATED,
                  borderRadius: 6,
                }}
              >
                <span style={{ color: PURPLE }}>{IC.book(16)}</span>
                <span style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                  {area.name}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: PURPLE,
                    marginLeft: 'auto',
                  }}
                >
                  {area.students} alunos
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
