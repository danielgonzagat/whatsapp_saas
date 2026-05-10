'use client';
import { colors } from '@/lib/design-tokens';

import { SORA, MONO, BG_CARD, BORDER, inputStyle, btnPrimary, btnGhost, iconBtn } from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import { kloelT } from '@/lib/i18n/t';
import { toSupportedEmbedUrl } from '@/lib/video-embed';
import AreaMembrosLessonForm from './AreaMembrosLessonForm';
import type { DisplayLesson } from './ProdutosView.types';

interface LessonItemProps {
  lesson: DisplayLesson;
  accentColor: string;
  isEditingLesson: boolean;
  editLessonData: { name: string; description: string; videoUrl: string };
  areaId: string;
  onEditLesson: (lessonId: string) => void;
  onSetEditingLesson: (id: string | null) => void;
  onSetEditLessonData: (data: { name: string; description: string; videoUrl: string }) => void;
  onUpdateLesson: (areaId: string, lessonId: string) => void;
  onDeleteLesson: (areaId: string, lessonId: string) => void;
}

export function LessonItem({
  lesson,
  accentColor: c,
  isEditingLesson,
  editLessonData,
  areaId,
  onEditLesson,
  onSetEditingLesson,
  onSetEditLessonData,
  onUpdateLesson,
  onDeleteLesson,
}: LessonItemProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        background: BG_CARD,
        borderRadius: 6,
        border: `1px solid ${BORDER}`,
      }}
    >
      {isEditingLesson ? (
        <AreaMembrosLessonForm
          mode="edit"
          name={editLessonData.name}
          description={editLessonData.description}
          videoUrl={editLessonData.videoUrl}
          accentColor={c}
          savingLabel={kloelT('Salvar')}
          onNameChange={(v) =>
            onSetEditLessonData({ ...editLessonData, name: v })
          }
          onDescriptionChange={(v) =>
            onSetEditLessonData({ ...editLessonData, description: v })
          }
          onVideoUrlChange={(v) =>
            onSetEditLessonData({ ...editLessonData, videoUrl: v })
          }
          onSave={() => onUpdateLesson(areaId, lesson.id)}
          onCancel={() => onSetEditingLesson(null)}
        />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: c }}>{IC.play(12)}</span>
            <span
              style={{
                fontFamily: SORA,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                flex: 1,
              }}
            >
              {lesson.name}
            </span>
            <button type="button" style={iconBtn} onClick={() => onEditLesson(lesson.id)}>
              {IC.edit(12)}
            </button>
            <button
              type="button"
              style={{ ...iconBtn, color: colors.semantic.error }}
              onClick={() => onDeleteLesson(areaId, lesson.id)}
            >
              {IC.trash(12)}
            </button>
          </div>
          {lesson.description && (
            <p
              style={{
                fontFamily: SORA,
                fontSize: 11,
                color: 'var(--app-text-tertiary)',
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {lesson.description}
            </p>
          )}
          {lesson.videoUrl && <VideoEmbed url={lesson.videoUrl} title={lesson.name} />}
        </>
      )}
    </div>
  );
}

function VideoEmbed({ url, title }: { url: string; title: string }) {
  const embedUrl = toSupportedEmbedUrl(url);
  if (!embedUrl) {
    return null;
  }
  return (
    <iframe
      src={embedUrl}
      title={title}
      style={{ width: '100%', height: 180, border: 'none', borderRadius: 6 }}
      allow="autoplay; fullscreen"
    />
  );
}
