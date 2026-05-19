'use client';

import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { normalizeMemberAreaPayload } from './member-area.helpers';
import { MemberAreaSidebar } from './MemberAreaSidebar';
import { MemberAreaContent } from './MemberAreaContent';
import type { MemberArea } from './member-area.types';

const SORA = "var(--font-sora), 'Sora', sans-serif";

export default function MemberAreaPreviewPage() {
  const params = useParams();
  const areaId = params?.areaId as string;
  const [area, setArea] = useState<MemberArea | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  useEffect(() => {
    if (!areaId) {
      return;
    }
    apiFetch(`/member-areas/${areaId}`)
      .then((res) => {
        const data = normalizeMemberAreaPayload(res.data ?? null);
        setArea(data);
        if (data?.modules?.[0]) {
          setActiveModuleId(data.modules[0].id);
          if (data.modules[0].lessons?.[0]) {
            setActiveLessonId(data.modules[0].lessons[0].id);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [areaId]);

  const handleModuleSelect = (moduleId: string, firstLessonId?: string) => {
    setActiveModuleId(moduleId);
    if (firstLessonId) {
      setActiveLessonId(firstLessonId);
    }
  };

  return (
    <div
      style={{
        background: 'var(--app-bg-primary)',
        minHeight: '100vh',
        fontFamily: SORA,
        color: 'var(--app-text-primary)',
      }}
    >
      <div
        style={{
          background: 'rgba(232,93,48,0.06)',
          borderBottom: '1px solid colors.ember.primary',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="colors.ember.primary"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path d={kloelT(`M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z`)} />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'colors.ember.primary',
            letterSpacing: '.04em',
          }}
        >
          {kloelT(`MODO DE PRE-VISUALIZACAO — VISAO DO ALUNO`)}
        </span>
      </div>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 41px)' }}>
        <MemberAreaSidebar
          loading={loading}
          area={area}
          activeModuleId={activeModuleId}
          activeLessonId={activeLessonId}
          onModuleSelect={handleModuleSelect}
          onLessonSelect={setActiveLessonId}
        />
        <MemberAreaContent
          loading={loading}
          area={area}
          activeModuleId={activeModuleId}
          activeLessonId={activeLessonId}
        />
      </div>
    </div>
  );
}
