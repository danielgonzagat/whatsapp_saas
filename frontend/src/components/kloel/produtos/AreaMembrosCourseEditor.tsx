'use client';
import { colors } from '@/lib/design-tokens';

import type { DisplayArea, DisplayModule, DisplayLesson } from './ProdutosView.types';
import {
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  inputStyle,
  btnPrimary,
  btnGhost,
  iconBtn,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import { kloelT } from '@/lib/i18n/t';
import { toSupportedEmbedUrl } from '@/lib/video-embed';
import AreaMembrosLessonForm from './AreaMembrosLessonForm';

const modules = (a: DisplayArea): DisplayModule[] =>
  a.modules_list || a.modulesList || [];

interface Props {
  area: DisplayArea;
  isEditing: boolean;
  accentColor: string;
  creatingModule: string | null;
  newModule: { name: string };
  editingModule: string | null;
  editModuleData: { name: string };
  creatingLesson: string | null;
  newLesson: { name: string; description: string; videoUrl: string };
  editingLesson: string | null;
  editLessonData: { name: string; description: string; videoUrl: string };
  onSetCreatingModule: (id: string | null) => void;
  onSetNewModule: (data: { name: string }) => void;
  onCreateModule: (areaId: string) => void;
  onEditModule: (moduleId: string) => void;
  onSetEditingModule: (id: string | null) => void;
  onSetEditModuleData: (data: { name: string }) => void;
  onUpdateModule: (areaId: string, moduleId: string) => void;
  onDeleteModule: (areaId: string, moduleId: string) => void;
  onSetCreatingLesson: (id: string | null) => void;
  onSetNewLesson: (data: {
    name: string;
    description: string;
    videoUrl: string;
  }) => void;
  onCreateLesson: (areaId: string, moduleId: string) => void;
  onEditLesson: (lessonId: string) => void;
  onSetEditingLesson: (id: string | null) => void;
  onSetEditLessonData: (data: {
    name: string;
    description: string;
    videoUrl: string;
  }) => void;
  onUpdateLesson: (areaId: string, lessonId: string) => void;
  onDeleteLesson: (areaId: string, lessonId: string) => void;
}

export default function AreaMembrosCourseEditor({
  area,
  isEditing,
  accentColor: c,
  creatingModule,
  newModule,
  editingModule,
  editModuleData,
  creatingLesson,
  newLesson,
  editingLesson,
  editLessonData,
  onSetCreatingModule,
  onSetNewModule,
  onCreateModule,
  onEditModule,
  onSetEditingModule,
  onSetEditModuleData,
  onUpdateModule,
  onDeleteModule,
  onSetCreatingLesson,
  onSetNewLesson,
  onCreateLesson,
  onEditLesson,
  onSetEditingLesson,
  onSetEditLessonData,
  onUpdateLesson,
  onDeleteLesson,
}: Props) {
  if (isEditing) {
    return null;
  }

  const mods = modules(area);

  if (mods.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--app-text-primary)',
          }}
        >
          {kloelT('Modulos')}
        </span>
        <button
          type="button"
          style={btnPrimary(c)}
          onClick={() => {
            onSetNewModule({ name: '' });
            onSetCreatingModule(area.id);
          }}
        >
          + {kloelT('Modulo')}
        </button>
      </div>

      {creatingModule === area.id && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: 8,
            background: `${c}08`,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
          }}
        >
          <input
            value={newModule.name}
            onChange={(e) => onSetNewModule({ name: e.target.value })}
            placeholder={kloelT('Nome do modulo')}
            style={inputStyle}
          />
          <button
            type="button"
            style={btnPrimary(c)}
            onClick={() => onCreateModule(area.id)}
          >
            {kloelT('Criar')}
          </button>
          <button
            type="button"
            style={btnGhost}
            onClick={() => onSetCreatingModule(null)}
          >
            {kloelT('Cancelar')}
          </button>
        </div>
      )}

      {mods.map((mod) => (
        <div
          key={mod.id}
          style={{
            background: `${c}06`,
            borderRadius: 8,
            border: `1px solid ${BORDER}`,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {editingModule === mod.id ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={editModuleData.name}
                onChange={(e) =>
                  onSetEditModuleData({ name: e.target.value })
                }
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                style={btnPrimary(c)}
                onClick={() => onUpdateModule(area.id, mod.id)}
              >
                {kloelT('Salvar')}
              </button>
              <button
                type="button"
                style={btnGhost}
                onClick={() => onSetEditingModule(null)}
              >
                {kloelT('Cancelar')}
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: c }}>{IC.book(14)}</span>
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  flex: 1,
                }}
              >
                {mod.name}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  color: 'var(--app-text-tertiary)',
                }}
              >
                {mod.lessons?.length ?? 0} {kloelT('aulas')}
              </span>
              <button
                type="button"
                style={iconBtn}
                onClick={() => onEditModule(mod.id)}
              >
                {IC.edit(14)}
              </button>
              <button
                type="button"
                style={{ ...iconBtn, color: colors.semantic.error }}
                onClick={() => onDeleteModule(area.id, mod.id)}
              >
                {IC.trash(14)}
              </button>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              paddingLeft: 22,
            }}
          >
            {mod.lessons?.map((lsn) => (
              <LessonItem
                key={lsn.id}
                lesson={lsn}
                accentColor={c}
                isEditingLesson={editingLesson === lsn.id}
                editLessonData={editLessonData}
                areaId={area.id}
                onEditLesson={onEditLesson}
                onSetEditingLesson={onSetEditingLesson}
                onSetEditLessonData={onSetEditLessonData}
                onUpdateLesson={onUpdateLesson}
                onDeleteLesson={onDeleteLesson}
              />
            ))}

            {creatingLesson === mod.id ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: 8,
                  background: `${c}08`,
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                }}
              >
                <AreaMembrosLessonForm
                  mode="create"
                  name={newLesson.name}
                  description={newLesson.description}
                  videoUrl={newLesson.videoUrl}
                  accentColor={c}
                  savingLabel={kloelT('Criar')}
                  onNameChange={(v) =>
                    onSetNewLesson({ ...newLesson, name: v })
                  }
                  onDescriptionChange={(v) =>
                    onSetNewLesson({ ...newLesson, description: v })
                  }
                  onVideoUrlChange={(v) =>
                    onSetNewLesson({ ...newLesson, videoUrl: v })
                  }
                  onSave={() => onCreateLesson(area.id, mod.id)}
                  onCancel={() => onSetCreatingLesson(null)}
                />
              </div>
            ) : (
              <button
                type="button"
                style={{
                  ...btnGhost,
                  alignSelf: 'flex-start',
                  opacity: 0.7,
                }}
                onClick={() => onSetCreatingLesson(mod.id)}
              >
                + {kloelT('Aula')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function LessonItem({
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
}: {
  lesson: DisplayLesson;
  accentColor: string;
  isEditingLesson: boolean;
  editLessonData: { name: string; description: string; videoUrl: string };
  areaId: string;
  onEditLesson: (lessonId: string) => void;
  onSetEditingLesson: (id: string | null) => void;
  onSetEditLessonData: (data: {
    name: string;
    description: string;
    videoUrl: string;
  }) => void;
  onUpdateLesson: (areaId: string, lessonId: string) => void;
  onDeleteLesson: (areaId: string, lessonId: string) => void;
}) {
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
            onSetEditLessonData({
              ...editLessonData,
              name: v,
            })
          }
          onDescriptionChange={(v) =>
            onSetEditLessonData({
              ...editLessonData,
              description: v,
            })
          }
          onVideoUrlChange={(v) =>
            onSetEditLessonData({
              ...editLessonData,
              videoUrl: v,
            })
          }
          onSave={() => onUpdateLesson(areaId, lesson.id)}
          onCancel={() => onSetEditingLesson(null)}
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
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
            <button
              type="button"
              style={iconBtn}
              onClick={() => onEditLesson(lesson.id)}
            >
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
          {lesson.videoUrl && (
            <VideoEmbed url={lesson.videoUrl} title={lesson.name} />
          )}
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
      style={{
        width: '100%',
        height: 180,
        border: 'none',
        borderRadius: 6,
      }}
      allow="autoplay; fullscreen"
    />
  );
}
