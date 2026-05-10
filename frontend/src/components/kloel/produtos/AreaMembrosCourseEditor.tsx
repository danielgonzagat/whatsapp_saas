'use client';

import type { DisplayArea, DisplayModule } from './ProdutosView.types';
import {
  SORA,
  BORDER,
  inputStyle,
  btnPrimary,
  btnGhost,
} from './ProdutosView.shared';
import { kloelT } from '@/lib/i18n/t';
import AreaMembrosModuleItem from './AreaMembrosModuleItem';

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
  onSetNewLesson: (data: { name: string; description: string; videoUrl: string }) => void;
  onCreateLesson: (areaId: string, moduleId: string) => void;
  onEditLesson: (lessonId: string) => void;
  onSetEditingLesson: (id: string | null) => void;
  onSetEditLessonData: (data: { name: string; description: string; videoUrl: string }) => void;
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

  const moduleItemProps = {
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
  };

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
          <button type="button" style={btnPrimary(c)} onClick={() => onCreateModule(area.id)}>
            {kloelT('Criar')}
          </button>
          <button type="button" style={btnGhost} onClick={() => onSetCreatingModule(null)}>
            {kloelT('Cancelar')}
          </button>
        </div>
      )}

      <AreaMembrosModuleItem {...moduleItemProps} />
    </div>
  );
}
