'use client';

import { kloelT } from '@/lib/i18n/t';
import { toYouTubeEmbedUrl } from '@/lib/video-embed';
import { colors } from '@/lib/design-tokens';
import { MemberAreaContentSkeleton } from './MemberAreaSkeleton';
import type { MemberArea } from './member-area.types';

function toEmbed(url: string): string {
  return toYouTubeEmbedUrl(url) || url;
}

interface MemberAreaContentProps {
  loading: boolean;
  area: MemberArea | null;
  activeModuleId: string | null;
  activeLessonId: string | null;
}

export function MemberAreaContent({
  loading,
  area,
  activeModuleId,
  activeLessonId,
}: MemberAreaContentProps) {
  const activeModule = area?.modules?.find((m) => m.id === activeModuleId);
  const activeLesson = activeModule?.lessons?.find((l) => l.id === activeLessonId);
  const showNotFound = !loading && !area;

  return (
    <div style={{ flex: 1, padding: 32 }}>
      {loading ? (
        <MemberAreaContentSkeleton />
      ) : showNotFound ? (
        <div
          style={{
            maxWidth: 560,
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 10,
            padding: 28,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: colors.semantic.error,
              letterSpacing: '.08em',
              marginBottom: 10,
            }}
          >
            {kloelT(`AREA INDISPONIVEL`)}
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--app-text-primary)',
              marginBottom: 10,
            }}
          >
            {kloelT(`Nao foi possivel carregar esta area de membros`)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--app-text-secondary)', lineHeight: 1.7 }}>
            {kloelT(`O shell de preview continua ativo, mas os dados desta area nao foram encontrados ou
            ainda nao estao disponiveis.`)}
          </div>
        </div>
      ) : activeLesson ? (
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              margin: '0 0 8px',
              color: 'var(--app-text-primary)',
            }}
          >
            {activeLesson.name}
          </h1>
          {activeLesson.description && (
            <p style={{ fontSize: 13, color: 'var(--app-text-secondary)', margin: '0 0 24px' }}>
              {activeLesson.description}
            </p>
          )}
          {activeLesson.videoUrl && (
            <div
              style={{
                position: 'relative',
                paddingBottom: '56.25%',
                background: 'var(--app-bg-card)',
                borderRadius: 6,
                overflow: 'hidden',
                border: '1px solid var(--app-border-primary)',
              }}
            >
              <iframe
                src={toEmbed(activeLesson.videoUrl)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                allow={kloelT(
                  `accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture`,
                )}
                allowFullScreen
              />
            </div>
          )}
          {!activeLesson.videoUrl && (
            <div
              style={{
                background: 'var(--app-bg-card)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: 60,
                textAlign: 'center',
              }}
            >
              <svg
                width={48}
                height={48}
                viewBox="0 0 24 24"
                fill="none"
                stroke="colors.text.dim"
                strokeWidth={1.5}
                style={{ margin: '0 auto 12px' }}
                aria-hidden="true"
              >
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
              <div style={{ fontSize: 13, color: 'var(--app-text-tertiary)' }}>
                {kloelT(`Nenhum video adicionado a esta aula`)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', paddingTop: 80 }}>
          <div style={{ fontSize: 14, color: 'var(--app-text-tertiary)' }}>
            {kloelT(`Selecione uma aula para comecar`)}
          </div>
        </div>
      )}
    </div>
  );
}
