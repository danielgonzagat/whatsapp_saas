'use client';

import {
  fetchPublicMemberArea,
  fetchPublicMemberAreaContent,
  PublicMemberArea,
  PublicMemberContent,
  requestPublicMemberAreaAccess,
} from '@/lib/api/member-area-public';
import { BookOpen, CheckCircle2, Clock, Download, LockKeyhole, PlayCircle } from 'lucide-react';
import { use, useEffect, useState } from 'react';

export default function PublicMemberAreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [area, setArea] = useState<PublicMemberArea | null>(null);
  const [content, setContent] = useState<PublicMemberContent | null>(null);
  const [email, setEmail] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchPublicMemberArea(slug)
      .then((response) => {
        if (active) setArea(response.area);
      })
      .catch(() => {
        if (active) setError('Area de membros nao encontrada.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const requestAccess = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const access = await requestPublicMemberAreaAccess(slug, email);
      const loadedContent = await fetchPublicMemberAreaContent(slug, access.token);
      setContent(loadedContent);
      setArea(loadedContent.area);
      setSelectedLessonId(loadedContent.area.modules[0]?.lessons[0]?.id ?? null);
    } catch {
      setError('Nao encontramos uma matricula ativa para este e-mail.');
    } finally {
      setSubmitting(false);
    }
  };

  const modules = content?.area.modules ?? [];
  const selectedLesson =
    modules.flatMap((module) => module.lessons).find((lesson) => lesson.id === selectedLessonId) ??
    modules[0]?.lessons[0] ??
    null;

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-orange-500" />
        </div>
      </main>
    );
  }

  if (!area) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 text-center">
          <div>
            <LockKeyhole className="mx-auto mb-4 h-10 w-10 text-orange-400" />
            <h1 className="text-2xl font-semibold">Area indisponivel</h1>
            <p className="mt-2 text-sm text-zinc-400">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  if (!content) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white">
        <section className="mx-auto grid min-h-screen max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <div className="mb-6 flex items-center gap-3">
              {area.logoUrl ? (
                <img
                  src={area.logoUrl}
                  alt=""
                  className="h-12 w-12 rounded border border-zinc-800"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded border border-zinc-800 bg-zinc-900">
                  <BookOpen className="h-6 w-6 text-orange-400" />
                </div>
              )}
              <span className="text-sm font-medium text-orange-300">Kloel Members</span>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
              {area.name}
            </h1>
            {area.description && (
              <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">{area.description}</p>
            )}
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-zinc-300">
              <span className="inline-flex items-center gap-2 rounded border border-zinc-800 px-3 py-2">
                <BookOpen className="h-4 w-4 text-orange-400" />
                {area.totalModules ?? 0} modulos
              </span>
              <span className="inline-flex items-center gap-2 rounded border border-zinc-800 px-3 py-2">
                <PlayCircle className="h-4 w-4 text-orange-400" />
                {area.totalLessons ?? 0} aulas
              </span>
            </div>
          </div>

          <form onSubmit={requestAccess} className="rounded border border-zinc-800 bg-zinc-900 p-6">
            <LockKeyhole className="mb-4 h-8 w-8 text-orange-400" />
            <h2 className="text-xl font-semibold">Acessar conteudo</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Use o mesmo e-mail informado na compra para liberar seus modulos e aulas.
            </p>
            <label className="mt-6 block text-sm font-medium text-zinc-200" htmlFor="student-email">
              E-mail da compra
            </label>
            <input
              id="student-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white outline-none focus:border-orange-500"
              placeholder="voce@email.com"
            />
            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded bg-orange-500 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? 'Verificando...' : 'Entrar'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[340px_1fr]">
        <aside className="rounded border border-zinc-800 bg-zinc-900 p-4">
          <h1 className="text-lg font-semibold">{content.area.name}</h1>
          <p className="mt-1 text-sm text-zinc-400">{content.enrollment.studentName}</p>
          <div className="mt-5 space-y-4">
            {modules.map((module) => (
              <section key={module.id}>
                <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-500">
                  {module.name}
                </h2>
                <div className="space-y-1">
                  {module.lessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => setSelectedLessonId(lesson.id)}
                      className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${
                        selectedLesson?.id === lesson.id
                          ? 'bg-orange-500 text-zinc-950'
                          : 'text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <PlayCircle className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{lesson.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <section className="rounded border border-zinc-800 bg-zinc-900 p-5">
          {selectedLesson ? (
            <article>
              <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {selectedLesson.durationMin ? `${selectedLesson.durationMin} min` : 'Aula'}
                </span>
                <span>{selectedLesson.type}</span>
              </div>
              <h2 className="text-2xl font-semibold">{selectedLesson.name}</h2>
              {selectedLesson.description && (
                <p className="mt-2 text-sm leading-6 text-zinc-400">{selectedLesson.description}</p>
              )}
              {selectedLesson.videoUrl && (
                <div className="mt-6 aspect-video overflow-hidden rounded border border-zinc-800 bg-black">
                  <iframe
                    src={selectedLesson.videoUrl}
                    title={selectedLesson.name}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
              {selectedLesson.textContent && (
                <div className="mt-6 whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-4 text-sm leading-7 text-zinc-200">
                  {selectedLesson.textContent}
                </div>
              )}
              {selectedLesson.downloadUrl && (
                <a
                  href={selectedLesson.downloadUrl}
                  className="mt-6 inline-flex items-center gap-2 rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-orange-500"
                >
                  <Download className="h-4 w-4" />
                  Baixar material
                </a>
              )}
            </article>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center text-center text-zinc-400">
              Nenhuma aula publicada nesta area ainda.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
