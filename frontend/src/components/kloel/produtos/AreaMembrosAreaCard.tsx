'use client';

import type { DisplayArea, DisplayProduct } from './ProdutosView.types';
import {
  SORA,
  BG_CARD,
  BORDER,
  PURPLE,
  btnPrimary,
} from './ProdutosView.shared';
import { kloelT } from '@/lib/i18n/t';
import { buildMemberAreaPreviewPath } from '@/lib/member-area-preview';
import AreaCardHeader from './AreaCardHeader';
import AreaMembrosCourseEditor from './AreaMembrosCourseEditor';

interface Props {
  area: DisplayArea;
  isExpanded: boolean;
  productOptions: DisplayProduct[];
  saving: boolean;
  generatingAreaId: string | null;
  editingArea: string | null;
  editAreaData: Record<string, boolean | string>;
  creatingModule: string | null;
  newModule: { name: string };
  editingModule: string | null;
  editModuleData: { name: string };
  creatingLesson: string | null;
  newLesson: { name: string; description: string; videoUrl: string };
  editingLesson: string | null;
  editLessonData: { name: string; description: string; videoUrl: string };
  onToggle: (id: string) => void;
  onOpenStudents: (areaId: string, areaName: string) => void;
  onEdit: (areaId: string) => void;
  onDelete: (id: string) => void;
  onGenerateStructure: (areaId: string) => void;
  onUpdateArea: (id: string) => void;
  onCancelEdit: () => void;
  onSetEditAreaData: React.Dispatch<React.SetStateAction<Record<string, boolean | string>>>;
  onCreateModule: (areaId: string) => void;
  onSetCreatingModule: (id: string | null) => void;
  onSetNewModule: (data: { name: string }) => void;
  onEditModule: (moduleId: string) => void;
  onSetEditingModule: (id: string | null) => void;
  onSetEditModuleData: (data: { name: string }) => void;
  onUpdateModule: (areaId: string, moduleId: string) => void;
  onDeleteModule: (areaId: string, moduleId: string) => void;
  onCreateLesson: (areaId: string, moduleId: string) => void;
  onSetCreatingLesson: (id: string | null) => void;
  onSetNewLesson: (data: { name: string; description: string; videoUrl: string }) => void;
  onEditLesson: (lessonId: string) => void;
  onSetEditingLesson: (id: string | null) => void;
  onSetEditLessonData: (data: { name: string; description: string; videoUrl: string }) => void;
  onUpdateLesson: (areaId: string, lessonId: string) => void;
  onDeleteLesson: (areaId: string, lessonId: string) => void;
}

const accentColor = (a: DisplayArea) => a.primaryColor || PURPLE;
const modules = (a: DisplayArea) => a.modules_list || a.modulesList || [];
const FEATURE_TAGS = [
  { key: 'certificates', label: 'Certificados' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'community', label: 'Comunidade' },
  { key: 'gamification', label: 'Gamificacao' },
  { key: 'progressTrack', label: 'Progresso' },
  { key: 'downloads', label: 'Downloads' },
  { key: 'comments', label: 'Comentarios' },
] as const;

export default function AreaMembrosAreaCard(props: Props) {
  const {
    area,
    isExpanded,
    saving,
    generatingAreaId,
    editingArea,
    editAreaData,
    onToggle,
    onOpenStudents,
    onEdit,
    onDelete,
    onGenerateStructure,
    onUpdateArea,
    onCancelEdit,
    onSetEditAreaData,
  } = props;

  const c = accentColor(area);
  const previewPath = buildMemberAreaPreviewPath(area.id);
  const isEditing = editingArea === area.id;
  const isGenerating = generatingAreaId === area.id;
  const activeFeatures = FEATURE_TAGS.filter(
    (f) => (area as Record<string, unknown>)[f.key],
  );

  const courseEditorProps = {
    area,
    isEditing,
    accentColor: c,
    creatingModule: props.creatingModule,
    newModule: props.newModule,
    editingModule: props.editingModule,
    editModuleData: props.editModuleData,
    creatingLesson: props.creatingLesson,
    newLesson: props.newLesson,
    editingLesson: props.editingLesson,
    editLessonData: props.editLessonData,
    onSetCreatingModule: props.onSetCreatingModule,
    onSetNewModule: props.onSetNewModule,
    onCreateModule: props.onCreateModule,
    onEditModule: props.onEditModule,
    onSetEditingModule: props.onSetEditingModule,
    onSetEditModuleData: props.onSetEditModuleData,
    onUpdateModule: props.onUpdateModule,
    onDeleteModule: props.onDeleteModule,
    onSetCreatingLesson: props.onSetCreatingLesson,
    onSetNewLesson: props.onSetNewLesson,
    onCreateLesson: props.onCreateLesson,
    onEditLesson: props.onEditLesson,
    onSetEditingLesson: props.onSetEditingLesson,
    onSetEditLessonData: props.onSetEditLessonData,
    onUpdateLesson: props.onUpdateLesson,
    onDeleteLesson: props.onDeleteLesson,
  };

  return (
    <div
      style={{
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 3, background: c }} />

      <div style={{ padding: '14px 16px' }}>
        <AreaCardHeader
          area={area}
          isExpanded={isExpanded}
          isEditing={isEditing}
          saving={saving}
          editAreaData={editAreaData}
          accentColor={c}
          previewPath={previewPath}
          onToggle={onToggle}
          onOpenStudents={onOpenStudents}
          onEdit={onEdit}
          onDelete={onDelete}
          onUpdateArea={onUpdateArea}
          onCancelEdit={onCancelEdit}
          onSetEditAreaData={onSetEditAreaData}
        />

        {!isEditing && modules(area).length === 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              style={btnPrimary(c)}
              disabled={isGenerating}
              onClick={() => onGenerateStructure(area.id)}
            >
              {isGenerating
                ? kloelT('Gerando...')
                : kloelT('Gerar estrutura de modulos')}
            </button>
          </div>
        )}
      </div>

      {isExpanded && (
        <div
          style={{
            padding: '0 16px 16px',
            borderTop: `1px solid ${BORDER}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {area.coverUrl && (
            <div style={{ marginTop: 12 }}>
              <img
                src={area.coverUrl}
                alt=""
                style={{
                  width: '100%',
                  maxHeight: 160,
                  objectFit: 'cover',
                  borderRadius: 8,
                }}
              />
            </div>
          )}

          {area.description && (
            <p
              style={{
                fontFamily: SORA,
                fontSize: 12,
                color: 'var(--app-text-secondary)',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {area.description}
            </p>
          )}

          {activeFeatures.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {activeFeatures.map((f) => (
                <span
                  key={f.key}
                  style={{
                    fontFamily: SORA,
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: `${c}10`,
                    color: c,
                    border: `1px solid ${c}30`,
                  }}
                >
                  {kloelT(f.label)}
                </span>
              ))}
            </div>
          )}

          <AreaMembrosCourseEditor {...courseEditorProps} />
        </div>
      )}
    </div>
  );
}
