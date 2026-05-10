'use client';
import { colors } from '@/lib/design-tokens';

import type { DisplayArea } from './ProdutosView.types';
import {
  SORA,
  MONO,
  BORDER,
  inputStyle,
  btnPrimary,
  btnGhost,
  iconBtn,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import { kloelT } from '@/lib/i18n/t';
import AreaMembrosLessonForm from './AreaMembrosLessonForm';
import { LessonItem } from './AreaMembrosLessonItem';

interface Props {
  area: DisplayArea;
  accentColor: string;
  creatingLesson: string | null;
  newLesson: { name: string; description: string; videoUrl: string };
  editingModule: string | null;
  editModuleData: { name: string };
  editingLesson: string | null;
  editLessonData: { name: string; description: string; videoUrl: string };
  onSetEditingModule: (id: string | null) => void;
  onSetEditModuleData: (data: { name: string }) => void;
  onEditModule: (moduleId: string) => void;
  onUpdateModule: (areaId: string, moduleId: string) => void;
  onDeleteModule: (areaId: string, moduleId: string) => void;
  onSetCreatingLesson: (id: string | null) => void;
  onSetNewLesson: (data: { name: string; description: string; videoUrl: string }) => void;
  onCreateLesson: (areaId: string, moduleId: string) => void;
  onEditLesson: (lessonId: string) => void;
  onSetEditingLesson: (id: string | null) => void;
  onSetEditLessonData: (data: { name: string; description: string; videoUrl: string }) => void;
  onUpdateLesson: (areaId: string, lessonId: string) => void;
  onDeleteLesson: (areaId: string, lessonId: string) => void;
}

export default function AreaMembrosModuleItem({
  area,
  accentColor: c,
  creatingLesson,
  newLesson,
  editingModule,
  editModuleData,
  editingLesson,
  editLessonData,
  onSetEditingModule,
  onSetEditModuleData,
  onEditModule,
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
  return (
    <>
      {area.modules_list?.map((mod) => (
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
                onChange={(e) => onSetEditModuleData({ name: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                style={btnPrimary(c)}
                onClick={() => onUpdateModule(area.id, mod.id)}
              >
                {kloelT('Salvar')}
              </button>
              <button type="button" style={btnGhost} onClick={() => onSetEditingModule(null)}>
                {kloelT('Cancelar')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                {mod.lessons?.length ?? 0} {kloelT('aulas')}
              </span>
              <button type="button" style={iconBtn} onClick={() => onEditModule(mod.id)}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 22 }}>
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
                  onNameChange={(v) => onSetNewLesson({ ...newLesson, name: v })}
                  onDescriptionChange={(v) => onSetNewLesson({ ...newLesson, description: v })}
                  onVideoUrlChange={(v) => onSetNewLesson({ ...newLesson, videoUrl: v })}
                  onSave={() => onCreateLesson(area.id, mod.id)}
                  onCancel={() => onSetCreatingLesson(null)}
                />
              </div>
            ) : (
              <button
                type="button"
                style={{ ...btnGhost, alignSelf: 'flex-start', opacity: 0.7 }}
                onClick={() => onSetCreatingLesson(mod.id)}
              >
                + {kloelT('Aula')}
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
