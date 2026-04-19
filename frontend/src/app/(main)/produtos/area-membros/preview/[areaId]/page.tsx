'use client';

import { apiFetch } from '@/lib/api';
import { toYouTubeEmbedUrl } from '@/lib/video-embed';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const _MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

function toEmbed(url: string): string {
  return toYouTubeEmbedUrl(url) || url;
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

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function SkeletonBlock({
  width = '100%',
  height = 12,
  style,
}: {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background:
          'linear-gradient(90deg, rgba(25,25,28,0.96) 0%, rgba(41,41,46,0.98) 50%, rgba(25,25,28,0.96) 100%)',
        ...style,
      }}
    />
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeLesson(raw: unknown, moduleIndex: number, lessonIndex: number): Lesson {
  const lesson = readRecord(raw);
  const fallbackId = `lesson-${moduleIndex}-${lessonIndex}`;
  return {
    id: readString(lesson?.id) || readString(lesson?._id) || fallbackId,
    name: readString(lesson?.name, `Aula ${lessonIndex + 1}`),
    description: optionalString(lesson?.description),
    videoUrl: optionalString(lesson?.videoUrl),
    position: Number(lesson?.position ?? lessonIndex) || lessonIndex,
  };
}

function normalizeModule(raw: unknown, moduleIndex: number): Module {
  const moduleRecord = readRecord(raw);
  const rawLessons = Array.isArray(moduleRecord?.lessons) ? moduleRecord.lessons : [];
  const fallbackId = `module-${moduleIndex}`;
  return {
    id: readString(moduleRecord?.id) || readString(moduleRecord?._id) || fallbackId,
    name: readString(moduleRecord?.name, `Modulo ${moduleIndex + 1}`),
    description: optionalString(moduleRecord?.description),
    position: Number(moduleRecord?.position ?? moduleIndex) || moduleIndex,
    lessons: rawLessons.map((lessonValue, lessonIndex) =>
      normalizeLesson(lessonValue, moduleIndex, lessonIndex),
    ),
  };
}

function pickRawModules(raw: Record<string, unknown>): unknown[] {
  if (Array.isArray(raw.modules)) return raw.modules;
  if (Array.isArray(raw.modulesList)) return raw.modulesList;
  return [];
}

function normalizeMemberAreaPayload(payload: unknown): MemberArea | null {
  const payloadRecord = readRecord(payload);
  const raw = readRecord(payloadRecord?.area) ?? payloadRecord;
  if (!raw) return null;

  return {
    id: readString(raw.id),
    name: readString(raw.name, 'Area de membros'),
    description: optionalString(raw.description),
    logoUrl: optionalString(raw.logoUrl),
    primaryColor: optionalString(raw.primaryColor),
    modules: pickRawModules(raw).map(normalizeModule),
  };
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

  const activeModule = area?.modules?.find((m) => m.id === activeModuleId);
  const activeLesson = activeModule?.lessons?.find((l) => l.id === activeLessonId);
  const modules = area?.modules ?? [];
  const showNotFound = !loading && !area;

  return (
    <div
      style={{
        background: 'var(--app-bg-primary)',
        minHeight: '100vh',
        fontFamily: SORA,
        color: 'var(--app-text-primary)',
      }}
    >
      {/* Preview Banner */}
      <div
        style={{
          background: 'rgba(232,93,48,0.06)',
          borderBottom: '1px solid #E85D30',
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
          stroke="#E85D30"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#E85D30', letterSpacing: '.04em' }}>
          MODO DE PRE-VISUALIZACAO — VISAO DO ALUNO
        </span>
      </div>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 41px)' }}>
        {/* Sidebar — Modules & Lessons */}
        <div
          style={{
            width: 280,
            background: 'var(--app-bg-card)',
            borderRight: '1px solid #222226',
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
            <div style={{ padding: '16px' }}>
              {[0, 1, 2].map((index) => (
                <div key={`skeleton-${index}`} style={{ marginBottom: 20 }}>
                  <SkeletonBlock
                    width={`${68 - index * 8}%`}
                    height={14}
                    style={{ marginBottom: 10 }}
                  />
                  <SkeletonBlock
                    width="88%"
                    height={11}
                    style={{ marginLeft: 16, marginBottom: 8 }}
                  />
                  <SkeletonBlock width="76%" height={11} style={{ marginLeft: 16 }} />
                </div>
              ))}
            </div>
          ) : (
            modules.map((mod) => (
              <div key={mod.id} style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModuleId(mod.id);
                    if (mod.lessons?.[0]) setActiveLessonId(mod.lessons[0].id);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: activeModuleId === mod.id ? 'rgba(232,93,48,0.06)' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: activeModuleId === mod.id ? '#E0DDD8' : '#6E6E73',
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
                      onClick={() => setActiveLessonId(les.id)}
                      style={{
                        width: '100%',
                        padding: '8px 16px 8px 32px',
                        background:
                          activeLessonId === les.id ? 'rgba(232,93,48,0.1)' : 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: activeLessonId === les.id ? '#E85D30' : '#3A3A3F',
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
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      {les.name}
                    </button>
                  ))}
              </div>
            ))
          )}
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: 32 }}>
          {loading ? (
            <div>
              <SkeletonBlock width="42%" height={24} style={{ marginBottom: 12 }} />
              <SkeletonBlock width="76%" height={13} style={{ marginBottom: 8 }} />
              <SkeletonBlock width="61%" height={13} style={{ marginBottom: 24 }} />
              <SkeletonBlock width="100%" height={420} style={{ borderRadius: 10 }} />
            </div>
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
                  color: '#EF4444',
                  letterSpacing: '.08em',
                  marginBottom: 10,
                }}
              >
                AREA INDISPONIVEL
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'var(--app-text-primary)',
                  marginBottom: 10,
                }}
              >
                Nao foi possivel carregar esta area de membros
              </div>
              <div style={{ fontSize: 13, color: 'var(--app-text-secondary)', lineHeight: 1.7 }}>
                O shell de preview continua ativo, mas os dados desta area nao foram encontrados ou
                ainda nao estao disponiveis.
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
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
                    stroke="#3A3A3F"
                    strokeWidth={1.5}
                    style={{ margin: '0 auto 12px' }}
                    aria-hidden="true"
                  >
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" />
                  </svg>
                  <div style={{ fontSize: 13, color: 'var(--app-text-tertiary)' }}>
                    Nenhum video adicionado a esta aula
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <div style={{ fontSize: 14, color: 'var(--app-text-tertiary)' }}>
                Selecione uma aula para comecar
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
