'use client';
import { colors } from '@/lib/design-tokens';

import { useCallback, useState } from 'react';
import type { DisplayArea, DisplayProduct } from './ProdutosView.types';
import { useToast } from '@/components/kloel/ToastProvider';
import { useMemberAreaMutations } from '@/hooks/useMemberAreas';
import { Ticker, LiveFeed, PURPLE, ANIMATIONS } from './ProdutosView.shared';
import { kloelT } from '@/lib/i18n/t';
import AreaMembrosDashboard from './AreaMembrosDashboard';
import AreaMembrosCreateAreaForm from './AreaMembrosCreateAreaForm';
import AreaMembrosAreaCard from './AreaMembrosAreaCard';
import AreaMembrosStudentDrawer from './AreaMembrosStudentDrawer';

interface Props {
  totalStudents: number;
  displayAreas: DisplayArea[];
  avgCompletion: number;
  mutateAreas: () => void;
  productOptions: DisplayProduct[];
}

const emptyArea = {
  name: '',
  type: 'COURSE',
  productId: '',
  slug: '',
  description: '',
  template: 'academy',
  logoUrl: '',
  coverUrl: '',
  primaryColor: PURPLE,
  certificates: false,
  quizzes: false,
  community: false,
  gamification: false,
  progressTrack: false,
  downloads: false,
  comments: false,
};

export default function AreaMembros({
  totalStudents,
  displayAreas,
  avgCompletion,
  mutateAreas,
  productOptions,
}: Props) {
  const { showToast } = useToast();
  const m = useMemberAreaMutations();

  const [showCreateArea, setShowCreateArea] = useState(false);
  const [newArea, setNewArea] = useState<Record<string, string | boolean>>({ ...emptyArea });
  const [saving, setSaving] = useState(false);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [editingArea, setEditingArea] = useState<string | null>(null);
  const [editAreaData, setEditAreaData] = useState<Record<string, boolean | string>>({});
  const [generatingAreaId, setGeneratingAreaId] = useState<string | null>(null);

  const [creatingModule, setCreatingModule] = useState<string | null>(null);
  const [newModule, setNewModule] = useState({ name: '' });
  const [editingModule, setEditingModule] = useState<string | null>(null);
  const [editModuleData, setEditModuleData] = useState({ name: '' });

  const [creatingLesson, setCreatingLesson] = useState<string | null>(null);
  const [newLesson, setNewLesson] = useState({ name: '', description: '', videoUrl: '' });
  const [editingLesson, setEditingLesson] = useState<string | null>(null);
  const [editLessonData, setEditLessonData] = useState({ name: '', description: '', videoUrl: '' });

  const [studentAreaId, setStudentAreaId] = useState<string | null>(null);
  const [studentAreaName, setStudentAreaName] = useState('');

  const invalidate = useCallback(async () => {
    await mutateAreas();
  }, [mutateAreas]);

  const toggleArea = (id: string) =>
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleCreateArea = async () => {
    setSaving(true);
    try {
      await m.createArea(newArea as Record<string, unknown>);
      await invalidate();
      setNewArea({ ...emptyArea });
      setShowCreateArea(false);
    } finally {
      setSaving(false);
    }
  };

  const handleEditArea = (areaId: string) => {
    const area = displayAreas.find((a) => a.id === areaId);
    if (area) {
      setEditAreaData({
        name: area.name,
        type: area.type,
        slug: area.slug,
        certificates: area.certificates,
        quizzes: area.quizzes,
        community: area.community,
        gamification: area.gamification,
        progressTrack: area.progressTrack,
        downloads: area.downloads,
        comments: area.comments,
      });
    }
    setEditingArea(areaId);
  };

  const handleUpdateArea = async (areaId: string) => {
    setSaving(true);
    try {
      await m.updateArea(areaId, editAreaData as Record<string, unknown>);
      await invalidate();
      setEditingArea(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArea = async (id: string) => {
    if (!window.confirm(kloelT('Remover esta area?'))) return;
    try {
      await m.deleteArea(id);
      await invalidate();
      showToast('Area removida', 'success');
    } catch {
      showToast('Erro ao remover area', 'error');
    }
  };

  const handleGenerateStructure = async (areaId: string) => {
    setGeneratingAreaId(areaId);
    try {
      await m.createModule(areaId, { name: 'generated' } as Record<string, unknown>);
      await invalidate();
    } finally {
      setGeneratingAreaId(null);
    }
  };

  const handleCreateModule = async (areaId: string) => {
    if (!newModule.name.trim()) return;
    await m.createModule(areaId, { name: newModule.name } as Record<string, unknown>);
    await invalidate();
    setNewModule({ name: '' });
    setCreatingModule(null);
  };

  const handleUpdateModule = async (areaId: string, moduleId: string) => {
    await m.updateModule(areaId, moduleId, { name: editModuleData.name } as Record<string, unknown>);
    await invalidate();
    setEditingModule(null);
  };

  const handleDeleteModule = async (areaId: string, moduleId: string) => {
    if (!window.confirm(kloelT('Remover este modulo?'))) return;
    try {
      await m.deleteModule(areaId, moduleId);
      await invalidate();
      showToast('Modulo removido', 'success');
    } catch {
      showToast('Erro ao remover modulo', 'error');
    }
  };

  const handleCreateLesson = async (areaId: string, moduleId: string) => {
    if (!newLesson.name.trim()) return;
    await m.createLesson(areaId, moduleId, newLesson as Record<string, unknown>);
    await invalidate();
    setNewLesson({ name: '', description: '', videoUrl: '' });
    setCreatingLesson(null);
  };

  const handleUpdateLesson = async (areaId: string, lessonId: string) => {
    await m.updateLesson(areaId, lessonId, editLessonData as Record<string, unknown>);
    await invalidate();
    setEditingLesson(null);
  };

  const handleDeleteLesson = async (areaId: string, lessonId: string) => {
    if (!window.confirm(kloelT('Remover esta aula?'))) return;
    try {
      await m.deleteLesson(areaId, lessonId);
      await invalidate();
      showToast('Aula removida', 'success');
    } catch {
      showToast('Erro ao remover aula', 'error');
    }
  };

  const openStudentDrawer = (areaId: string, areaName: string) => {
    setStudentAreaId(areaId);
    setStudentAreaName(areaName);
  };

  const feedEvents = displayAreas.slice(0, 5).map((a) => ({
    text: `${a.name} - ${a.students} ${kloelT('alunos')}  ${Math.round(a.completion)}%`,
    time: a.updatedAt
      ? (() => {
          const diff = Math.max(0, Math.floor((Date.now() - new Date(a.updatedAt).getTime()) / 60000));
          return diff < 60 ? `${diff}min` : diff < 1440 ? `${Math.floor(diff / 60)}h` : `${Math.floor(diff / 1440)}d`;
        })()
      : '',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AreaMembrosDashboard
        totalStudents={totalStudents}
        displayAreas={displayAreas}
        avgCompletion={avgCompletion}
      />

      <Ticker
        items={displayAreas.map((a) => a.name)}
        color={PURPLE}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          style={{
            padding: '10px 20px',
            background: PURPLE,
            border: 'none',
            borderRadius: 8,
            color: colors.text.silver,
            fontFamily: "'Sora',sans-serif",
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={() => setShowCreateArea((v) => !v)}
        >
          {showCreateArea ? kloelT('Cancelar') : `+ ${kloelT('Nova Area')}`}
        </button>
      </div>

      {showCreateArea && (
        <AreaMembrosCreateAreaForm
          formId="area-membros-create"
          newArea={newArea}
          productOptions={productOptions}
          saving={saving}
          onSetNewArea={setNewArea}
          onCreate={handleCreateArea}
          onCancel={() => setShowCreateArea(false)}
        />
      )}

      {displayAreas.map((area) => (
        <AreaMembrosAreaCard
          key={area.id}
          area={area}
          isExpanded={expandedAreas.has(area.id)}
          productOptions={productOptions}
          saving={saving}
          generatingAreaId={generatingAreaId}
          editingArea={editingArea}
          editAreaData={editAreaData}
          creatingModule={creatingModule}
          newModule={newModule}
          editingModule={editingModule}
          editModuleData={editModuleData}
          creatingLesson={creatingLesson}
          newLesson={newLesson}
          editingLesson={editingLesson}
          editLessonData={editLessonData}
          onToggle={toggleArea}
          onOpenStudents={openStudentDrawer}
          onEdit={handleEditArea}
          onDelete={handleDeleteArea}
          onGenerateStructure={handleGenerateStructure}
          onUpdateArea={handleUpdateArea}
          onCancelEdit={() => setEditingArea(null)}
          onSetEditAreaData={setEditAreaData}
          onCreateModule={handleCreateModule}
          onSetCreatingModule={setCreatingModule}
          onSetNewModule={setNewModule}
          onEditModule={(id) => {
            const mod = displayAreas
              .flatMap((a) => a.modules_list || a.modulesList || [])
              .find((m) => m.id === id);
            if (mod) setEditModuleData({ name: mod.name });
            setEditingModule(id);
          }}
          onSetEditingModule={setEditingModule}
          onSetEditModuleData={setEditModuleData}
          onUpdateModule={handleUpdateModule}
          onDeleteModule={handleDeleteModule}
          onCreateLesson={handleCreateLesson}
          onSetCreatingLesson={setCreatingLesson}
          onSetNewLesson={setNewLesson}
          onEditLesson={(id) => {
            setEditingLesson(id);
          }}
          onSetEditingLesson={setEditingLesson}
          onSetEditLessonData={setEditLessonData}
          onUpdateLesson={handleUpdateLesson}
          onDeleteLesson={handleDeleteLesson}
        />
      ))}

      <AreaMembrosStudentDrawer
        areaId={studentAreaId}
        areaName={studentAreaName}
        onClose={() => setStudentAreaId(null)}
      />

      <LiveFeed events={feedEvents} color={PURPLE} />
      <style>{ANIMATIONS}</style>
    </div>
  );
}
