'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

function toEmbed(url: string): string {
  if (!url) return '';
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?/]+)/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : url;
}

interface Lesson {
  id: string;
  name: string;
  description?: string;
  videoUrl?: string;
  position: number;
}

interface Module {
  id: string;
  name: string;
  description?: string;
  position: number;
  lessons: Lesson[];
}

interface MemberArea {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  primaryColor?: string;
  modules: Module[];
}

export default function MemberAreaPreviewPage() {
  const params = useParams();
  const areaId = params?.areaId as string;
  const [area, setArea] = useState<MemberArea | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  useEffect(() => {
    if (!areaId) return;
    apiFetch(`/member-areas/${areaId}`).then((res: any) => {
      const data = res?.area || res;
      setArea(data);
      if (data?.modules?.[0]) {
        setActiveModuleId(data.modules[0].id);
        if (data.modules[0].lessons?.[0]) {
          setActiveLessonId(data.modules[0].lessons[0].id);
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [areaId]);

  const activeModule = area?.modules?.find((m) => m.id === activeModuleId);
  const activeLesson = activeModule?.lessons?.find((l) => l.id === activeLessonId);

  if (loading) {
    return (
      <div style={{ background: '#0A0A0C', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SORA }}>
        <div style={{ color: '#6E6E73', fontSize: 14 }}>Carregando area de membros...</div>
      </div>
    );
  }

  if (!area) {
    return (
      <div style={{ background: '#0A0A0C', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SORA }}>
        <div style={{ color: '#EF4444', fontSize: 14 }}>Area de membros nao encontrada</div>
      </div>
    );
  }

  return (
    <div style={{ background: '#0A0A0C', minHeight: '100vh', fontFamily: SORA, color: '#E0DDD8' }}>
      {/* Preview Banner */}
      <div style={{ background: 'rgba(232,93,48,0.06)', borderBottom: '1px solid #E85D30', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#E85D30" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#E85D30', letterSpacing: '.04em' }}>MODO DE PRE-VISUALIZACAO — VISAO DO ALUNO</span>
      </div>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 41px)' }}>
        {/* Sidebar — Modules & Lessons */}
        <div style={{ width: 280, background: '#111113', borderRight: '1px solid #222226', padding: '20px 0', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #19191C' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#E0DDD8' }}>{area.name}</div>
            {area.description && <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 4 }}>{area.description}</div>}
          </div>
          {area.modules?.map((mod) => (
            <div key={mod.id} style={{ marginTop: 8 }}>
              <button
                onClick={() => { setActiveModuleId(mod.id); if (mod.lessons?.[0]) setActiveLessonId(mod.lessons[0].id); }}
                style={{ width: '100%', padding: '10px 16px', background: activeModuleId === mod.id ? 'rgba(232,93,48,0.06)' : 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: activeModuleId === mod.id ? '#E0DDD8' : '#6E6E73', fontSize: 13, fontWeight: 600, fontFamily: SORA }}
              >
                {mod.name}
              </button>
              {activeModuleId === mod.id && mod.lessons?.map((les) => (
                <button
                  key={les.id}
                  onClick={() => setActiveLessonId(les.id)}
                  style={{ width: '100%', padding: '8px 16px 8px 32px', background: activeLessonId === les.id ? 'rgba(232,93,48,0.1)' : 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: activeLessonId === les.id ? '#E85D30' : '#3A3A3F', fontSize: 12, fontFamily: SORA, display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  {les.name}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: 32 }}>
          {activeLesson ? (
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: '#E0DDD8' }}>{activeLesson.name}</h1>
              {activeLesson.description && <p style={{ fontSize: 13, color: '#6E6E73', margin: '0 0 24px' }}>{activeLesson.description}</p>}
              {activeLesson.videoUrl && (
                <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#111113', borderRadius: 6, overflow: 'hidden', border: '1px solid #222226' }}>
                  <iframe
                    src={toEmbed(activeLesson.videoUrl)}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
              {!activeLesson.videoUrl && (
                <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 60, textAlign: 'center' }}>
                  <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#3A3A3F" strokeWidth={1.5} style={{ margin: '0 auto 12px' }}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                  <div style={{ fontSize: 13, color: '#3A3A3F' }}>Nenhum video adicionado a esta aula</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <div style={{ fontSize: 14, color: '#3A3A3F' }}>Selecione uma aula para comecar</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
