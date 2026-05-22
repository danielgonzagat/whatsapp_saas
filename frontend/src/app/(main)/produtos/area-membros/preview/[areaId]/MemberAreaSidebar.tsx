'use client';

import { kloelT } from '@/lib/i18n/t';
import { MemberAreaSidebarSkeleton, SkeletonBlock } from './MemberAreaSkeleton';
import type { MemberArea } from './member-area.types';

const SORA = "var(--font-sora), 'Sora', sans-serif";

interface MemberAreaSidebarProps {
  loading: boolean;
  area: MemberArea | null;
  activeModuleId: string | null;
  activeLessonId: string | null;
  onModuleSelect: (moduleId: string, firstLessonId?: string) => void;
  onLessonSelect: (lessonId: string) => void;
}

export function MemberAreaSidebar({
  loading,
  area,
  activeModuleId,
  activeLessonId,
  onModuleSelect,
  onLessonSelect,
}: MemberAreaSidebarProps) {
  const modules = area?.modules ?? [];

  return (
    <div
      style={{
        width: 280,
        background: 'var(--app-bg-card)',
        borderRight: '1px solid colors.border.space',
        padding: '20px 0',
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      <div
        style={{ padding: '0 16px 16px', borderBottom: '1px solid var(--app-border-subtle)' }}
      >
        {loading ? (
          <>
            <SkeletonBlock width="72%" height={18} style={{ marginBottom: 8 }} />
            <SkeletonBlock width="92%" height={11} />
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--app-text-primary)' }}>
              {area?.name || 'Area indisponivel'}
            </div>
            {area?.description && (
              <div style={{ fontSize: 12, color: 'var(--app-text-secondary)', marginTop: 4 }}>
                {area.description}
              </div>
            )}
          </>
        )}
      </div>
      {loading ? (
        <MemberAreaSidebarSkeleton />
      ) : (
        modules.map((mod) => (
          <div key={mod.id} style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                onModuleSelect(mod.id, mod.lessons?.[0]?.id);
              }}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: activeModuleId === mod.id ? 'rgba(232,93,48,0.06)' : 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                color: activeModuleId === mod.id ? 'colors.text.silver' : 'colors.text.muted',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: SORA,
              }}
            >
              {mod.name}
            </button>
            {activeModuleId === mod.id &&
              mod.lessons?.map((les) => (
                <button
                  type="button"
                  key={les.id}
                  onClick={() => onLessonSelect(les.id)}
                  style={{
                    width: '100%',
                    padding: '8px 16px 8px 32px',
                    background:
                      activeLessonId === les.id ? 'rgba(232,93,48,0.1)' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color:
                      activeLessonId === les.id ? 'colors.ember.primary' : 'colors.text.dim',
                    fontSize: 12,
                    fontFamily: SORA,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <svg
                    width={12}
                    height={12}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d={kloelT(`M8 5v14l11-7z`)} />
                  </svg>
                  {les.name}
                </button>
              ))}
          </div>
        ))
      )}
    </div>
  );
}
