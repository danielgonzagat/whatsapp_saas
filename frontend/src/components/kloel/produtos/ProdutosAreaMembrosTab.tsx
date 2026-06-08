'use client';
import { useState, useId, useEffect, useRef } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { memberAreaApi, memberAreaStudentsApi } from '@/lib/api/member-area';
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
  certificates: true, quizzes: true, community: false, gamification: true,
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
  const [actionError, setActionError] = useState<string | null>(null);
  const studentSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStudentSearchTimer = () => {
    if (studentSearchTimer.current) {
      clearTimeout(studentSearchTimer.current);
      studentSearchTimer.current = null;
    }
  };

  useEffect(() => () => {
    if (studentSearchTimer.current) {
      clearTimeout(studentSearchTimer.current);
      studentSearchTimer.current = null;
    }
  }, []);

  const setOperationError = (error: unknown, fallback: string) => {
    setActionError(error instanceof Error ? error.message : fallback);
  };

  const fetchStudents = async (areaId: string, q?: string) => {
    setStudentLoading(true);
    setActionError(null);
    try {
      const url = q ? `/member-areas/${areaId}/students?q=${encodeURIComponent(q)}` : `/member-areas/${areaId}/students`;
      const res = await apiFetch<{ students?: MemberAreaStudent[] } | MemberAreaStudent[]>(url);
      if (res.error) {
        throw new Error(res.error);
      }
      const resData = res.data;
      const nextStudents = Array.isArray(resData)
        ? resData
        : Array.isArray(resData?.students)
          ? resData.students
          : null;
      if (!nextStudents) {
        throw new Error('Payload de alunos invalido.');
      }
      setStudents(nextStudents);
    } catch (error) {
      setOperationError(error, 'Erro ao carregar alunos.');
    } finally {
      setStudentLoading(false);
    }
  };
  const openStudentDrawer = (areaId: string, areaName: string) => {
    clearStudentSearchTimer();
    setStudentAreaId(areaId); setStudentAreaName(areaName);
    setStudentSearch(''); setShowAddStudent(false); setEditingStudentId(null);
    setEditStudentData({ name: '', email: '', phone: '', status: 'active', progress: '0' });
    setNewStudent({ name: '', email: '', phone: '' }); setActiveSubTab('students'); fetchStudents(areaId);
  };
  const handleSearchStudents = (q: string) => {
    setStudentSearch(q);
    clearStudentSearchTimer();
    if (!studentAreaId) {return;}
    const nextQuery = q.trim();
    studentSearchTimer.current = setTimeout(() => {
      studentSearchTimer.current = null;
      fetchStudents(studentAreaId, nextQuery || undefined);
    }, 500);
  };
  const handleAddStudent = async () => {
    const studentName = newStudent.name.trim();
    const studentEmail = newStudent.email.trim();
    const studentPhone = newStudent.phone.trim();
    if (!studentName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail) || !studentAreaId) {return;}
    setSaving(true);
    setActionError(null);
    try {
      await memberAreaStudentsApi.enroll(studentAreaId, { studentName, studentEmail, studentPhone });
      setNewStudent({ name: '', email: '', phone: '' }); setShowAddStudent(false); await fetchStudents(studentAreaId); mutateAreas();
    } catch (error) { setOperationError(error, 'Erro ao matricular aluno.'); }
    setSaving(false);
  };
  const handleRemoveStudent = async (studentId: string) => {
    if (!studentAreaId) {return;}
    setSaving(true);
    setActionError(null);
    try { await memberAreaStudentsApi.remove(studentAreaId, studentId); await fetchStudents(studentAreaId); mutateAreas(); } catch (error) { setOperationError(error, 'Erro ao remover aluno.'); }
    setSaving(false);
  };
  const handleStartEditStudent = (student: MemberAreaStudent) => {
    setEditingStudentId(student.id);
    setEditStudentData({ name: student.studentName || '', email: student.studentEmail || '', phone: student.studentPhone || '', status: student.status || 'active', progress: String(Number(student.progress || 0)) });
  };
  const handleUpdateStudent = async () => {
    if (!studentAreaId || !editingStudentId || !editStudentData.name || !editStudentData.email) {return;}
    setSaving(true);
    setActionError(null);
    try {
      await memberAreaStudentsApi.update(studentAreaId, editingStudentId, { studentName: editStudentData.name, studentEmail: editStudentData.email, studentPhone: editStudentData.phone || null, status: editStudentData.status, progress: Math.max(0, Math.min(100, Number(editStudentData.progress) || 0)) });
      setEditingStudentId(null); await fetchStudents(studentAreaId, studentSearch || undefined); mutateAreas();
    } catch (error) { setOperationError(error, 'Erro ao atualizar aluno.'); }
    setSaving(false);
  };
  const handleToggleStudentStatus = async (student: MemberAreaStudent) => {
    if (!studentAreaId) {return;}
    setSaving(true);
    setActionError(null);
    try { await memberAreaStudentsApi.update(studentAreaId, student.id, { status: student.status === 'active' ? 'suspended' : 'active' }); await fetchStudents(studentAreaId, studentSearch || undefined); mutateAreas(); } catch (error) { setOperationError(error, 'Erro ao atualizar status do aluno.'); }
    setSaving(false);
  };
  const toggleArea = (id: string) => setExpandedAreas((prev) => ({ ...prev, [id]: !prev[id] }));
  const handleCreateArea = async () => {
    if (!(newArea.name as string)?.trim()) {return;}
    setSaving(true);
    setActionError(null);
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
    } catch (error) { setOperationError(error, 'Erro ao criar area de membros.'); }
    setSaving(false);
  };
  const handleUpdateArea = async (id: string) => {
    if (!(editAreaData.name as string)?.trim()) {return;}
    setSaving(true);
    setActionError(null);
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
    } catch (error) { setOperationError(error, 'Erro ao atualizar area de membros.'); }
    setSaving(false);
  };
  const handleDeleteArea = async (id: string) => {
    if (!confirm('Excluir esta area?')) {return;}
    setSaving(true);
    setActionError(null);
    try { await deleteArea(id); mutateAreas(); setEditingArea(null); } catch (error) { setOperationError(error, 'Erro ao excluir area de membros.'); }
    setSaving(false);
  };
  const handleCreateModule = async (areaId: string) => {
    if (!newModule.name.trim()) {return;}
    setSaving(true);
    setActionError(null);
    try { await createModule(areaId, { name: newModule.name.trim() }); mutateAreas(); setNewModule({ name: '' }); setCreatingModule(null); } catch (error) { setOperationError(error, 'Erro ao criar modulo.'); }
    setSaving(false);
  };
  const handleUpdateModule = async (areaId: string, moduleId: string) => {
    if (!editModuleData.name.trim()) {return;}
    setSaving(true);
    setActionError(null);
    try { await updateModule(areaId, moduleId, { name: editModuleData.name.trim() }); mutateAreas(); setEditingModule(null); } catch (error) { setOperationError(error, 'Erro ao atualizar modulo.'); }
    setSaving(false);
  };
  const handleDeleteModule = async (areaId: string, moduleId: string) => {
    if (!confirm('Excluir este modulo?')) {return;}
    setSaving(true);
    setActionError(null);
    try { await deleteModule(areaId, moduleId); mutateAreas(); } catch (error) { setOperationError(error, 'Erro ao excluir modulo.'); }
    setSaving(false);
  };
  const handleCreateLesson = async (areaId: string, moduleId: string) => {
    if (!newLesson.name.trim()) {return;}
    setSaving(true);
    setActionError(null);
    try { await createLesson(areaId, moduleId, { name: newLesson.name.trim(), description: newLesson.description.trim(), videoUrl: newLesson.videoUrl.trim() }); mutateAreas(); setNewLesson({ name: '', description: '', videoUrl: '' }); setCreatingLesson(null); } catch (error) { setOperationError(error, 'Erro ao criar aula.'); }
    setSaving(false);
  };
  const handleUpdateLesson = async (areaId: string, lessonId: string) => {
    if (!editLessonData.name.trim()) {return;}
    setSaving(true);
    setActionError(null);
    try { await updateLesson(areaId, lessonId, { name: editLessonData.name.trim(), description: editLessonData.description.trim(), videoUrl: editLessonData.videoUrl.trim() }); mutateAreas(); setEditingLesson(null); } catch (error) { setOperationError(error, 'Erro ao atualizar aula.'); }
    setSaving(false);
  };
  const handleDeleteLesson = async (areaId: string, lessonId: string) => {
    if (!confirm('Excluir esta aula?')) {return;}
    setSaving(true);
    setActionError(null);
    try { await deleteLesson(areaId, lessonId); mutateAreas(); } catch (error) { setOperationError(error, 'Erro ao excluir aula.'); }
    setSaving(false);
  };
  const handleGenerateStructure = async (areaId: string) => {
    setGeneratingAreaId(areaId);
    setActionError(null);
    try { await memberAreaApi.generateStructure(areaId); mutateAreas(); setExpandedAreas((prev) => ({ ...prev, [areaId]: true })); } catch (error) { setOperationError(error, 'Erro ao gerar estrutura.'); }
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
          <button
            type="button"
            key={tab.key}
            aria-pressed={activeSubTab === tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            style={getSubinterfacePillStyle(activeSubTab === tab.key, isMobile)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {actionError ? (
        <div role="alert" style={{ marginBottom: 16, padding: 12, border: '1px solid rgba(248,113,113,0.35)', borderRadius: 8, background: 'rgba(127,29,29,0.18)', color: 'rgb(254,202,202)', fontFamily: SORA, fontSize: 12 }}>
          {actionError}
        </div>
      ) : null}

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
        studentAreaId ? (
          <AreaMembrosStudentsPanel
            studentAreaId={studentAreaId} studentAreaName={studentAreaName} students={students}
            studentSearch={studentSearch}
            handleSearchStudents={handleSearchStudents}
            showAddStudent={showAddStudent} setShowAddStudent={setShowAddStudent}
            newStudent={newStudent} setNewStudent={setNewStudent} handleAddStudent={handleAddStudent}
            saving={saving} editingStudentId={editingStudentId} setEditingStudentId={setEditingStudentId}
            editStudentData={editStudentData} setEditStudentData={setEditStudentData}
            handleUpdateStudent={handleUpdateStudent} handleStartEditStudent={handleStartEditStudent}
            handleToggleStudentStatus={handleToggleStudentStatus} handleRemoveStudent={handleRemoveStudent}
            studentLoading={studentLoading}
            onClose={() => { clearStudentSearchTimer(); setStudentAreaId(null); setEditingStudentId(null); }}
          />
        ) : (
          <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: isMobile ? 16 : 20, background: 'rgba(10,10,12,0.72)', display: 'grid', gap: 14 }}>
            <div>
              <div style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: PURPLE, letterSpacing: '0.22em', textTransform: 'uppercase' as const, marginBottom: 6 }}>Alunos</div>
              <h3 style={{ fontFamily: SORA, fontSize: isMobile ? 18 : 22, color: 'var(--app-text-primary)', margin: 0 }}>Escolha uma area para gerenciar matriculas</h3>
              <p style={{ fontFamily: SORA, fontSize: 12, lineHeight: 1.6, color: 'var(--app-text-secondary)', margin: '8px 0 0' }}>A aba Alunos agora abre um fluxo real: selecione uma area para buscar, matricular, editar ou suspender alunos.</p>
            </div>
            {displayAreas.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {displayAreas.map((area) => {
                  const studentCount = Number(area.students || 0);
                  return (
                    <button
                      type="button"
                      key={area.id}
                      aria-label={`Gerenciar alunos de ${area.name}`}
                      onClick={() => openStudentDrawer(area.id, area.name)}
                      style={{ width: '100%', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 12, background: 'rgba(255,255,255,0.035)', color: 'var(--app-text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, textAlign: 'left' as const, fontFamily: SORA }}
                    >
                      <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{area.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--app-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{area.productName ? `Produto: ${area.productName}` : 'Sem produto vinculado'}</span>
                      </span>
                      <span style={{ flex: '0 0 auto', border: `1px solid ${PURPLE}55`, borderRadius: 6, padding: '6px 8px', color: PURPLE, fontSize: 11, fontWeight: 700 }}>{studentCount} aluno{studentCount === 1 ? '' : 's'}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 6, padding: 16, display: 'grid', gap: 10 }}>
                <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-secondary)' }}>Nenhuma area de membros cadastrada.</div>
                <button type="button" aria-label="Abrir Editor para criar area de membros" onClick={() => setActiveSubTab('editor')} style={{ width: 'fit-content', border: `1px solid ${PURPLE}`, borderRadius: 6, padding: '9px 12px', background: PURPLE, color: '#0A0A0C', fontFamily: SORA, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Criar area no Editor</button>
              </div>
            )}
          </div>
        )
      )}

      {activeSubTab === 'certificates' && <AreaMembrosCertificatePanel displayAreas={displayAreas} />}
    </div>
  );
}
