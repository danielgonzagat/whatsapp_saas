'use client';
import { useState, useId } from 'react';
import { mutate } from 'swr';
import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { useMemberAreaMutations } from '@/hooks/useMemberAreas';
import { SORA, PURPLE, LiveFeed, timeAgo } from './ProdutosView.shared';
import { SUBINTERFACE_PILL_ROW_STYLE, getSubinterfacePillStyle } from '@/components/kloel/ui/subinterface-pill';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import type { DisplayArea, DisplayProduct, MemberAreaStudent } from './ProdutosView.types';
import AreaMembrosOverviewPanel from './AreaMembrosOverviewPanel';
import AreaMembrosListPanel from './AreaMembrosListPanel';
import AreaMembrosEditorPanel from './AreaMembrosEditorPanel';
import AreaMembrosStudentsPanel from './AreaMembrosStudentsPanel';
import AreaMembrosCertificatePanel from './AreaMembrosCertificatePanel';

const SUB_TABS = [
  { key: 'overview', label: 'Visao Geral' },
  { key: 'list', label: 'Areas' },
  { key: 'editor', label: 'Editor' },
  { key: 'students', label: 'Alunos' },
  { key: 'certificates', label: 'Certificados' },
];

const emptyAreaForm = {
  name: '', slug: '', description: '', type: 'COURSE', productId: '',
  template: 'academy', logoUrl: '', coverUrl: '', primaryColor: PURPLE,
  certificates: true, quizzes: true, community: true, gamification: true,
  progressTrack: true, downloads: true, comments: true, active: true,
};

export default function AreaMembros({
  totalStudents, displayAreas, avgCompletion, mutateAreas, productOptions,
}: {
  totalStudents: number;
  displayAreas: DisplayArea[];
  avgCompletion: number;
  mutateAreas: () => void;
  productOptions: DisplayProduct[];
}) {
  useId();
  const { isMobile } = useResponsiveViewport();
  const [activeSubTab, setActiveSubTab] = useState('overview');
  const { createArea, updateArea, deleteArea, createModule, updateModule, deleteModule, createLesson, updateLesson, deleteLesson } = useMemberAreaMutations();
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});
  const [showCreateArea, setShowCreateArea] = useState(false);
  const [newArea, setNewArea] = useState<Record<string, unknown>>(emptyAreaForm);
  const [editingArea, setEditingArea] = useState<string | null>(null);
  const [editAreaData, setEditAreaData] = useState<Record<string, unknown>>(emptyAreaForm);
  const [creatingModule, setCreatingModule] = useState<string | null>(null);
  const [newModule, setNewModule] = useState({ name: '' });
  const [editingModule, setEditingModule] = useState<string | null>(null);
  const [editModuleData, setEditModuleData] = useState({ name: '' });
  const [creatingLesson, setCreatingLesson] = useState<string | null>(null);
  const [newLesson, setNewLesson] = useState({ name: '', description: '', videoUrl: '' });
  const [editingLesson, setEditingLesson] = useState<string | null>(null);
  const [editLessonData, setEditLessonData] = useState({ name: '', description: '', videoUrl: '' });
  const [saving, setSaving] = useState(false);
  const [generatingAreaId, setGeneratingAreaId] = useState<string | null>(null);
  const [studentAreaId, setStudentAreaId] = useState<string | null>(null);
  const [studentAreaName, setStudentAreaName] = useState('');
  const [students, setStudents] = useState<MemberAreaStudent[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', phone: '' });
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editStudentData, setEditStudentData] = useState({ name: '', email: '', phone: '', status: 'active', progress: '0' });
  const [studentLoading, setStudentLoading] = useState(false);
  const fetchStudents = async (areaId: string, q?: string) => {
    setStudentLoading(true);
    try {
      const url = q ? `/member-areas/${areaId}/students?q=${encodeURIComponent(q)}` : `/member-areas/${areaId}/students`;
      const res = await apiFetch(url);
      const resData = res.data && typeof res.data === 'object' ? (res.data as Record<string, unknown>) : null;
      setStudents(Array.isArray(resData) ? resData : Array.isArray(resData?.students) ? resData.students as MemberAreaStudent[] : []);
    } catch { setStudents([]); }
    setStudentLoading(false);
  };
  const openStudentDrawer = (areaId: string, areaName: string) => {
    setStudentAreaId(areaId); setStudentAreaName(areaName);
    setStudentSearch(''); setShowAddStudent(false); setEditingStudentId(null);
    setEditStudentData({ name: '', email: '', phone: '', status: 'active', progress: '0' });
    setNewStudent({ name: '', email: '', phone: '' }); fetchStudents(areaId);
  };
  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.email || !studentAreaId) return;
    setSaving(true);
    try {
      await apiFetch(`/member-areas/${studentAreaId}/students`, { method: 'POST', body: { studentName: newStudent.name, studentEmail: newStudent.email, studentPhone: newStudent.phone } });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/member-areas'));
      setNewStudent({ name: '', email: '', phone: '' }); setShowAddStudent(false); fetchStudents(studentAreaId); mutateAreas();
    } catch { /* error */ }
    setSaving(false);
  };
  const handleRemoveStudent = async (studentId: string) => {
    if (!studentAreaId) return;
    setSaving(true);
    try { await apiFetch(`/member-areas/${studentAreaId}/students/${studentId}`, { method: 'DELETE' }); fetchStudents(studentAreaId); mutateAreas(); } catch {}
    setSaving(false);
  };
  const handleStartEditStudent = (student: MemberAreaStudent) => {
    setEditingStudentId(student.id);
    setEditStudentData({ name: student.studentName || '', email: student.studentEmail || '', phone: student.studentPhone || '', status: student.status || 'active', progress: String(Number(student.progress || 0)) });
  };
  const handleUpdateStudent = async () => {
    if (!studentAreaId || !editingStudentId || !editStudentData.name || !editStudentData.email) return;
    setSaving(true);
    try {
      await apiFetch(`/member-areas/${studentAreaId}/students/${editingStudentId}`, { method: 'PUT', body: { studentName: editStudentData.name, studentEmail: editStudentData.email, studentPhone: editStudentData.phone || null, status: editStudentData.status, progress: Math.max(0, Math.min(100, Number(editStudentData.progress) || 0)) } });
      setEditingStudentId(null); fetchStudents(studentAreaId, studentSearch || undefined); mutateAreas();
    } catch {}
    setSaving(false);
  };
  const handleToggleStudentStatus = async (student: MemberAreaStudent) => {
    if (!studentAreaId) return;
    setSaving(true);
    try { await apiFetch(`/member-areas/${studentAreaId}/students/${student.id}`, { method: 'PUT', body: { status: student.status === 'active' ? 'suspended' : 'active' } }); fetchStudents(studentAreaId, studentSearch || undefined); mutateAreas(); } catch {}
    setSaving(false);
  };
  const toggleArea = (id: string) => setExpandedAreas((prev) => ({ ...prev, [id]: !prev[id] }));
  const handleCreateArea = async () => {
    if (!(newArea.name as string)?.trim()) return;
    setSaving(true);
    try {
      const d = newArea;
      await createArea({
        name: (d.name as string).trim(), slug: (d.slug as string).trim() || undefined, description: (d.description as string).trim() || undefined,
        type: (d.type as string) || 'COURSE', productId: (d.productId as string) || undefined, template: (d.template as string) || 'academy',
        logoUrl: (d.logoUrl as string).trim() || undefined, coverUrl: (d.coverUrl as string).trim() || undefined,
        primaryColor: (d.primaryColor as string) || PURPLE, certificates: !!d.certificates, quizzes: !!d.quizzes,
        community: !!d.community, gamification: !!d.gamification, progressTrack: !!d.progressTrack,
        downloads: !!d.downloads, comments: !!d.comments, active: !!d.active,
      });
      mutateAreas(); setNewArea(emptyAreaForm); setShowCreateArea(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };
  const handleUpdateArea = async (id: string) => {
    if (!(editAreaData.name as string)?.trim()) return;
    setSaving(true);
    try {
      const d = editAreaData;
      await updateArea(id, {
        name: (d.name as string).trim(), slug: (d.slug as string).trim() || undefined, description: (d.description as string).trim() || undefined,
        type: (d.type as string) || 'COURSE', productId: (d.productId as string) || null, template: (d.template as string) || 'academy',
        logoUrl: (d.logoUrl as string).trim() || undefined, coverUrl: (d.coverUrl as string).trim() || undefined,
        primaryColor: (d.primaryColor as string) || PURPLE, certificates: !!d.certificates, quizzes: !!d.quizzes,
        community: !!d.community, gamification: !!d.gamification, progressTrack: !!d.progressTrack,
        downloads: !!d.downloads, comments: !!d.comments, active: !!d.active,
      });
      mutateAreas(); setEditingArea(null);
    } catch (e) { console.error(e); }
    setSaving(false);
  };
  const handleDeleteArea = async (id: string) => {
    if (!confirm('Excluir esta area?')) return;
    setSaving(true);
    try { await deleteArea(id); mutateAreas(); setEditingArea(null); } catch (e) { console.error(e); }
    setSaving(false);
  };
  const handleCreateModule = async (areaId: string) => {
    if (!newModule.name.trim()) return;
    setSaving(true);
    try { await createModule(areaId, { name: newModule.name.trim() }); mutateAreas(); setNewModule({ name: '' }); setCreatingModule(null); } catch (e) { console.error(e); }
    setSaving(false);
  };
  const handleUpdateModule = async (areaId: string, moduleId: string) => {
    if (!editModuleData.name.trim()) return;
    setSaving(true);
    try { await updateModule(areaId, moduleId, { name: editModuleData.name.trim() }); mutateAreas(); setEditingModule(null); } catch (e) { console.error(e); }
    setSaving(false);
  };
  const handleDeleteModule = async (areaId: string, moduleId: string) => {
    if (!confirm('Excluir este modulo?')) return;
    setSaving(true);
    try { await deleteModule(areaId, moduleId); mutateAreas(); } catch (e) { console.error(e); }
    setSaving(false);
  };
  const handleCreateLesson = async (areaId: string, moduleId: string) => {
    if (!newLesson.name.trim()) return;
    setSaving(true);
    try { await createLesson(areaId, moduleId, { name: newLesson.name.trim(), description: newLesson.description.trim(), videoUrl: newLesson.videoUrl.trim() }); mutateAreas(); setNewLesson({ name: '', description: '', videoUrl: '' }); setCreatingLesson(null); } catch (e) { console.error(e); }
    setSaving(false);
  };
  const handleUpdateLesson = async (areaId: string, lessonId: string) => {
    if (!editLessonData.name.trim()) return;
    setSaving(true);
    try { await updateLesson(areaId, lessonId, { name: editLessonData.name.trim(), description: editLessonData.description.trim(), videoUrl: editLessonData.videoUrl.trim() }); mutateAreas(); setEditingLesson(null); } catch (e) { console.error(e); }
    setSaving(false);
  };
  const handleDeleteLesson = async (areaId: string, lessonId: string) => {
    if (!confirm('Excluir esta aula?')) return;
    setSaving(true);
    try { await deleteLesson(areaId, lessonId); mutateAreas(); } catch (e) { console.error(e); }
    setSaving(false);
  };
  const handleGenerateStructure = async (areaId: string) => {
    setGeneratingAreaId(areaId);
    try { await apiFetch(`/member-areas/${areaId}/generate-structure`, { method: 'POST' }); mutateAreas(); setExpandedAreas((prev) => ({ ...prev, [areaId]: true })); } catch (e) { console.error(e); }
    finally { setGeneratingAreaId(null); }
  };
  const handleEditArea = (area: DisplayArea) => {
    setEditingArea(area.id);
    setEditAreaData({ name: area.name, slug: area.slug || '', description: area.description || '', type: area.type || 'COURSE', productId: area.productId || '', template: area.template || 'academy', logoUrl: area.logoUrl || '', coverUrl: area.coverUrl || '', primaryColor: area.primaryColor || PURPLE, certificates: area.certificates !== false, quizzes: area.quizzes !== false, community: area.community === true, gamification: area.gamification !== false, progressTrack: area.progressTrack !== false, downloads: area.downloads !== false, comments: area.comments !== false, active: area.active !== false });
    setActiveSubTab('editor');
  };
  const memberEvents = displayAreas.length > 0
    ? displayAreas.slice(0, 4).map((area) => ({ text: Number(area.students || 0) > 0 ? `${area.name} tem ${area.students} aluno${Number(area.students) === 1 ? '' : 's'} ativo${Number(area.students) === 1 ? '' : 's'}.` : `${area.name} ainda nao tem matriculas.`, time: timeAgo(area.updatedAt || area.createdAt) }))
    : [{ text: 'Aguardando a primeira area de membros.', time: '' }];
  const editorProps = { displayAreas, productOptions, saving, showCreateArea, setShowCreateArea, newArea, setNewArea, handleCreateArea, emptyAreaForm, editingArea, setEditingArea, editAreaData, setEditAreaData, handleUpdateArea, handleDeleteArea, editingModule, setEditingModule, editModuleData, setEditModuleData, handleUpdateModule, handleDeleteModule, creatingModule, setCreatingModule, newModule, setNewModule, handleCreateModule, editingLesson, setEditingLesson, editLessonData, setEditLessonData, handleUpdateLesson, handleDeleteLesson, creatingLesson, setCreatingLesson, newLesson, setNewLesson, handleCreateLesson };

  return (
    <div style={{ opacity: 1 }}>
      <div style={{ ...SUBINTERFACE_PILL_ROW_STYLE, scrollbarWidth: 'none', marginBottom: 20 }}>
        {SUB_TABS.map((tab) => (
          <button type="button" key={tab.key} onClick={() => setActiveSubTab(tab.key)}
            style={getSubinterfacePillStyle(activeSubTab === tab.key, isMobile)}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'overview' && (
        <AreaMembrosOverviewPanel totalStudents={totalStudents} displayAreas={displayAreas} avgCompletion={avgCompletion} />
      )}

      {activeSubTab === 'list' && (
        <div>
          <AreaMembrosListPanel displayAreas={displayAreas} expandedAreas={expandedAreas} toggleArea={toggleArea}
            onEditArea={handleEditArea} onDeleteArea={handleDeleteArea} onOpenStudents={openStudentDrawer}
            generatingAreaId={generatingAreaId} onGenerateStructure={handleGenerateStructure} />
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: 'var(--app-text-tertiary)', marginBottom: 10, letterSpacing: '0.25em', textTransform: 'uppercase' as const }}>
              {kloelT('Atividade Recente')}
            </div>
            <LiveFeed color={PURPLE} events={memberEvents} />
          </div>
        </div>
      )}

      {activeSubTab === 'editor' && <AreaMembrosEditorPanel {...editorProps} />}

      {activeSubTab === 'students' && (
        <AreaMembrosStudentsPanel
          studentAreaId={studentAreaId} studentAreaName={studentAreaName} students={students}
          studentSearch={studentSearch}
          handleSearchStudents={(q: string) => { setStudentSearch(q); if (studentAreaId) fetchStudents(studentAreaId, q || undefined); }}
          showAddStudent={showAddStudent} setShowAddStudent={setShowAddStudent}
          newStudent={newStudent} setNewStudent={setNewStudent} handleAddStudent={handleAddStudent}
          saving={saving} editingStudentId={editingStudentId} setEditingStudentId={setEditingStudentId}
          editStudentData={editStudentData} setEditStudentData={setEditStudentData}
          handleUpdateStudent={handleUpdateStudent} handleStartEditStudent={handleStartEditStudent}
          handleToggleStudentStatus={handleToggleStudentStatus} handleRemoveStudent={handleRemoveStudent}
          studentLoading={studentLoading}
          onClose={() => { setStudentAreaId(null); setEditingStudentId(null); }}
        />
      )}

      {activeSubTab === 'certificates' && <AreaMembrosCertificatePanel displayAreas={displayAreas} />}
    </div>
  );
}
