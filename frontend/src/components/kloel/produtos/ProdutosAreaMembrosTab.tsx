'use client';
import { useState, useId } from 'react';
import { mutate } from 'swr';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { apiFetch } from '@/lib/api';
import { buildMemberAreaPreviewPath } from '@/lib/member-area-preview';
import { toSupportedEmbedUrl } from '@/lib/video-embed';
import { useMemberAreaMutations } from '@/hooks/useMemberAreas';
import {
  NP,
  Ticker,
  LiveFeed,
  SORA,
  MONO,
  PURPLE,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
  timeAgo,
  inputStyle,
  selectStyle,
  btnPrimary,
  btnGhost,
  iconBtn,
  focusPrimaryInput,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import type {
  DisplayArea,
  DisplayProduct,
  DisplayModule,
  DisplayLesson,
  MemberAreaStudent,
} from './ProdutosView.types';
import type React from 'react';

export default function AreaMembros({
  totalStudents,
  displayAreas,
  avgCompletion,
  mutateAreas,
  productOptions,
}: {
  totalStudents: number;
  displayAreas: DisplayArea[];
  avgCompletion: number;
  mutateAreas: () => void;
  productOptions: DisplayProduct[];
}) {
  const fid = useId();
  const {
    createArea,
    updateArea,
    deleteArea,
    createModule,
    updateModule,
    deleteModule,
    createLesson,
    updateLesson,
    deleteLesson,
  } = useMemberAreaMutations();
  const emptyAreaForm = {
    name: '',
    slug: '',
    description: '',
    type: 'COURSE',
    productId: '',
    template: 'academy',
    logoUrl: '',
    coverUrl: '',
    primaryColor: PURPLE,
    certificates: true,
    quizzes: true,
    community: true,
    gamification: true,
    progressTrack: true,
    downloads: true,
    comments: true,
    active: true,
  };

  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});
  const [showCreateArea, setShowCreateArea] = useState(false);
  const [newArea, setNewArea] = useState(emptyAreaForm);
  const [editingArea, setEditingArea] = useState<string | null>(null);
  const [editAreaData, setEditAreaData] = useState(emptyAreaForm);
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
  const [editStudentData, setEditStudentData] = useState({
    name: '',
    email: '',
    phone: '',
    status: 'active',
    progress: '0',
  });
  const [studentLoading, setStudentLoading] = useState(false);

  const fetchStudents = async (areaId: string, q?: string) => {
    setStudentLoading(true);
    try {
      const url = q
        ? `/member-areas/${areaId}/students?q=${encodeURIComponent(q)}`
        : `/member-areas/${areaId}/students`;
      const res = await apiFetch(url);
      const resData =
        res.data && typeof res.data === 'object' ? (res.data as Record<string, unknown>) : null;
      setStudents(
        Array.isArray(resData)
          ? resData
          : Array.isArray(resData?.students)
            ? (resData.students as typeof students)
            : [],
      );
    } catch {
      setStudents([]);
    }
    setStudentLoading(false);
  };
  const openStudentDrawer = (areaId: string, areaName: string) => {
    setStudentAreaId(areaId);
    setStudentAreaName(areaName);
    setStudentSearch('');
    setShowAddStudent(false);
    setEditingStudentId(null);
    setEditStudentData({ name: '', email: '', phone: '', status: 'active', progress: '0' });
    setNewStudent({ name: '', email: '', phone: '' });
    fetchStudents(areaId);
  };
  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.email || !studentAreaId) {
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/member-areas/${studentAreaId}/students`, {
        method: 'POST',
        body: {
          studentName: newStudent.name,
          studentEmail: newStudent.email,
          studentPhone: newStudent.phone,
        },
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/member-areas'));
      setNewStudent({ name: '', email: '', phone: '' });
      setShowAddStudent(false);
      fetchStudents(studentAreaId);
      mutateAreas();
    } catch {
      /* error */
    }
    setSaving(false);
  };
  const handleRemoveStudent = async (studentId: string) => {
    if (!studentAreaId) {
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/member-areas/${studentAreaId}/students/${studentId}`, { method: 'DELETE' });
      fetchStudents(studentAreaId);
      mutateAreas();
    } catch {
      /* error */
    }
    setSaving(false);
  };
  const handleStartEditStudent = (student: MemberAreaStudent) => {
    setEditingStudentId(student.id);
    setEditStudentData({
      name: student.studentName || '',
      email: student.studentEmail || '',
      phone: student.studentPhone || '',
      status: student.status || 'active',
      progress: String(Number(student.progress || 0)),
    });
  };
  const handleUpdateStudent = async () => {
    if (!studentAreaId || !editingStudentId || !editStudentData.name || !editStudentData.email) {
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/member-areas/${studentAreaId}/students/${editingStudentId}`, {
        method: 'PUT',
        body: {
          studentName: editStudentData.name,
          studentEmail: editStudentData.email,
          studentPhone: editStudentData.phone || null,
          status: editStudentData.status,
          progress: Math.max(0, Math.min(100, Number(editStudentData.progress) || 0)),
        },
      });
      setEditingStudentId(null);
      fetchStudents(studentAreaId, studentSearch || undefined);
      mutateAreas();
    } catch {
      /* error */
    }
    setSaving(false);
  };
  const handleToggleStudentStatus = async (student: MemberAreaStudent) => {
    if (!studentAreaId) {
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/member-areas/${studentAreaId}/students/${student.id}`, {
        method: 'PUT',
        body: { status: student.status === 'active' ? 'suspended' : 'active' },
      });
      fetchStudents(studentAreaId, studentSearch || undefined);
      mutateAreas();
    } catch {
      /* error */
    }
    setSaving(false);
  };
  const handleSearchStudents = (q: string) => {
    setStudentSearch(q);
    if (studentAreaId) {
      fetchStudents(studentAreaId, q || undefined);
    }
  };

  const toggleArea = (id: string) => setExpandedAreas((prev) => ({ ...prev, [id]: !prev[id] }));

  const toEmbed = (url: string) => toSupportedEmbedUrl(url) || '';

  const handleCreateArea = async () => {
    if (!newArea.name.trim()) {
      return;
    }
    setSaving(true);
    try {
      await createArea({
        name: newArea.name.trim(),
        slug: newArea.slug.trim() || undefined,
        description: newArea.description.trim() || undefined,
        type: newArea.type,
        productId: newArea.productId || undefined,
        template: newArea.template,
        logoUrl: newArea.logoUrl.trim() || undefined,
        coverUrl: newArea.coverUrl.trim() || undefined,
        primaryColor: newArea.primaryColor,
        certificates: newArea.certificates,
        quizzes: newArea.quizzes,
        community: newArea.community,
        gamification: newArea.gamification,
        progressTrack: newArea.progressTrack,
        downloads: newArea.downloads,
        comments: newArea.comments,
        active: newArea.active,
      });
      mutateAreas();
      setNewArea(emptyAreaForm);
      setShowCreateArea(false);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleUpdateArea = async (id: string) => {
    if (!editAreaData.name.trim()) {
      return;
    }
    setSaving(true);
    try {
      await updateArea(id, {
        name: editAreaData.name.trim(),
        slug: editAreaData.slug.trim() || undefined,
        description: editAreaData.description.trim() || undefined,
        type: editAreaData.type,
        productId: editAreaData.productId || null,
        template: editAreaData.template,
        logoUrl: editAreaData.logoUrl.trim() || undefined,
        coverUrl: editAreaData.coverUrl.trim() || undefined,
        primaryColor: editAreaData.primaryColor,
        certificates: editAreaData.certificates,
        quizzes: editAreaData.quizzes,
        community: editAreaData.community,
        gamification: editAreaData.gamification,
        progressTrack: editAreaData.progressTrack,
        downloads: editAreaData.downloads,
        comments: editAreaData.comments,
        active: editAreaData.active,
      });
      mutateAreas();
      setEditingArea(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleDeleteArea = async (id: string) => {
    if (!confirm('Excluir esta area?')) {
      return;
    }
    setSaving(true);
    try {
      await deleteArea(id);
      mutateAreas();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleCreateModule = async (areaId: string) => {
    if (!newModule.name.trim()) {
      return;
    }
    setSaving(true);
    try {
      await createModule(areaId, { name: newModule.name.trim() });
      mutateAreas();
      setNewModule({ name: '' });
      setCreatingModule(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleUpdateModule = async (areaId: string, moduleId: string) => {
    if (!editModuleData.name.trim()) {
      return;
    }
    setSaving(true);
    try {
      await updateModule(areaId, moduleId, { name: editModuleData.name.trim() });
      mutateAreas();
      setEditingModule(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleDeleteModule = async (areaId: string, moduleId: string) => {
    if (!confirm('Excluir este modulo?')) {
      return;
    }
    setSaving(true);
    try {
      await deleteModule(areaId, moduleId);
      mutateAreas();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleCreateLesson = async (areaId: string, moduleId: string) => {
    if (!newLesson.name.trim()) {
      return;
    }
    setSaving(true);
    try {
      await createLesson(areaId, moduleId, {
        name: newLesson.name.trim(),
        description: newLesson.description.trim(),
        videoUrl: newLesson.videoUrl.trim(),
      });
      mutateAreas();
      setNewLesson({ name: '', description: '', videoUrl: '' });
      setCreatingLesson(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleUpdateLesson = async (areaId: string, lessonId: string) => {
    if (!editLessonData.name.trim()) {
      return;
    }
    setSaving(true);
    try {
      await updateLesson(areaId, lessonId, {
        name: editLessonData.name.trim(),
        description: editLessonData.description.trim(),
        videoUrl: editLessonData.videoUrl.trim(),
      });
      mutateAreas();
      setEditingLesson(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleDeleteLesson = async (areaId: string, lessonId: string) => {
    if (!confirm('Excluir esta aula?')) {
      return;
    }
    setSaving(true);
    try {
      await deleteLesson(areaId, lessonId);
      mutateAreas();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleGenerateStructure = async (areaId: string) => {
    setGeneratingAreaId(areaId);
    try {
      await apiFetch(`/member-areas/${areaId}/generate-structure`, { method: 'POST' });
      mutateAreas();
      setExpandedAreas((prev) => ({ ...prev, [areaId]: true }));
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingAreaId(null);
    }
  };

  const activeAreas = displayAreas.filter((area) => area.active !== false).length;
  const totalModules = displayAreas.reduce(
    (sum: number, area) => sum + Number(area.modulesCount || area.modules || 0),
    0,
  );
  const totalLessons = displayAreas.reduce(
    (sum: number, area) => sum + Number(area.lessonsCount || 0),
    0,
  );
  const certificatesEnabled = displayAreas.filter((area) => area.certificates !== false).length;
  const communityEnabled = displayAreas.filter((area) => area.community === true).length;
  const memberEvents =
    displayAreas.length > 0
      ? displayAreas.slice(0, 4).map((area) => ({
          text:
            Number(area.students || 0) > 0
              ? `${area.name} tem ${area.students} aluno${Number(area.students || 0) === 1 ? '' : 's'} ativo${Number(area.students || 0) === 1 ? '' : 's'}.`
              : `${area.name} ainda não tem matrículas.`,
          time: timeAgo(area.updatedAt || area.createdAt),
        }))
      : [{ text: 'Aguardando a primeira área de membros.', time: '' }];

  return (
    <div style={{ opacity: 1 }}>
      <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 200,
            height: 80,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${PURPLE}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out',
            pointerEvents: 'none',
          }}
        />
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              letterSpacing: '0.25em',
              textTransform: 'uppercase' as const,
              marginBottom: 4,
            }}
          >
            {kloelT(`Total de Alunos`)}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 80,
              fontWeight: 700,
              color: PURPLE,
              letterSpacing: '-0.02em',
            }}
          >
            {totalStudents.toLocaleString('pt-BR')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 8,
            }}
          >
            <NP w={40} h={14} color={PURPLE} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: PURPLE }}>
              {activeAreas > 0
                ? `${activeAreas}/${displayAreas.length} areas ativas`
                : 'Nenhuma area ativa'}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          background: BG_CARD,
          borderRadius: 6,
          border: `1px solid ${BORDER}`,
          marginBottom: 20,
        }}
      >
        <NP w={120} h={24} color={PURPLE} />
        <span
          style={{ fontFamily: MONO, fontSize: 11, color: PURPLE, flex: 1, textAlign: 'center' }}
        >
          {kloelT(`Engagement Pulse`)}
        </span>
        <NP w={120} h={24} color={PURPLE} />
      </div>

      <Ticker
        items={
          displayAreas.length > 0
            ? displayAreas.map((a) => `${a.name}: ${a.students} alunos`)
            : ['Aguardando alunos...']
        }
        color={PURPLE}
      />

      <div style={{ display: 'flex', gap: 12, padding: '20px 0' }}>
        {[
          {
            icon: IC.users,
            label: 'Alunos',
            value: String(totalStudents),
            sub: `${activeAreas} areas ativas`,
          },
          {
            icon: IC.trend,
            label: 'Conclusao',
            value: `${avgCompletion}%`,
            sub: `${totalLessons} aulas publicadas`,
          },
          {
            icon: IC.book,
            label: 'Areas',
            value: String(displayAreas.length),
            sub: `${totalModules} modulos`,
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ color: PURPLE }}>{s.icon(18)}</span>
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--app-text-tertiary)',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {s.label}
              </span>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
              }}
            >
              {s.value}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: PURPLE, marginTop: 4 }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            marginBottom: 16,
          }}
        >
          {kloelT(`Progresso por Area`)}
        </div>
        {displayAreas
          .filter((a) => a.completion > 0)
          .map((a) => (
            <div key={a.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                  {a.name}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: PURPLE }}>
                  {a.completion}%
                </span>
              </div>
              <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${a.completion}%`,
                    height: '100%',
                    background: `linear-gradient(to right, ${PURPLE}50, ${PURPLE})`,
                    borderRadius: 2,
                    transition: 'width 0.6s ease',
                  }}
                />
              </div>
            </div>
          ))}
      </div>

      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          marginBottom: 16,
          borderLeft: `3px solid ${PURPLE}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: PURPLE }}>{IC.star(18)}</span>
          <span
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT(`Recursos liberados`)}
          </span>
          <NP w={40} h={14} color={PURPLE} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Areas com certificado', value: String(certificatesEnabled) },
            { label: 'Areas com comunidade', value: String(communityEnabled) },
            { label: 'Modulos publicados', value: String(totalModules) },
            { label: 'Aulas publicadas', value: String(totalLessons) },
          ].map((c) => (
            <div
              key={c.label}
              style={{ padding: '10px 14px', background: BG_ELEVATED, borderRadius: 6 }}
            >
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  color: 'var(--app-text-tertiary)',
                  marginBottom: 4,
                }}
              >
                {c.label}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                }}
              >
                {c.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT(`Gerenciar Areas`)}
          </div>
          <button
            type="button"
            onClick={() => setShowCreateArea(!showCreateArea)}
            style={{
              ...btnPrimary(PURPLE),
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: saving ? 0.6 : 1,
            }}
            disabled={saving}
          >
            <span style={{ color: colors.text.silver }}>{IC.plus(14)}</span> {kloelT(`Criar area`)}
          </button>
        </div>

        {showCreateArea && (
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-text-tertiary)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase' as const,
                marginBottom: 10,
              }}
            >
              {kloelT(`Nova Area`)}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1.3 }}>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-nome`}
                >
                  {kloelT(`Nome`)}
                </label>
                <input
                  value={newArea.name}
                  onChange={(e) => setNewArea((p) => ({ ...p, name: e.target.value }))}
                  placeholder={kloelT(`Nome da area...`)}
                  style={inputStyle}
                  id={`${fid}-nome`}
                />
              </div>
              <div style={{ width: 160 }}>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-tipo`}
                >
                  {kloelT(`Tipo`)}
                </label>
                <select
                  value={newArea.type}
                  onChange={(e) => setNewArea((p) => ({ ...p, type: e.target.value }))}
                  style={selectStyle}
                  id={`${fid}-tipo`}
                >
                  <option value="COURSE">{kloelT(`Curso`)}</option>
                  <option value="COMMUNITY">{kloelT(`Comunidade`)}</option>
                  <option value="HYBRID">{kloelT(`Hibrido`)}</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-produto-vinc`}
                >
                  {kloelT(`Produto vinculado`)}
                </label>
                <select
                  value={newArea.productId}
                  onChange={(e) => setNewArea((p) => ({ ...p, productId: e.target.value }))}
                  style={selectStyle}
                  id={`${fid}-produto-vinc`}
                >
                  <option value="">{kloelT(`Sem vinculo`)}</option>
                  {productOptions.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div
              style={{ display: 'grid', gap: 10, gridTemplateColumns: '1.5fr 1fr', marginTop: 10 }}
            >
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-slug`}
                >
                  {kloelT(`Slug`)}
                </label>
                <input
                  value={newArea.slug}
                  onChange={(e) => setNewArea((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="minha-area-de-membros"
                  style={inputStyle}
                  id={`${fid}-slug`}
                />
              </div>
              <div>
                <span
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  {kloelT(`Cor principal`)}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={newArea.primaryColor}
                    onChange={(e) => setNewArea((p) => ({ ...p, primaryColor: e.target.value }))}
                    style={{
                      width: 44,
                      height: 38,
                      background: 'transparent',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  />
                  <input
                    value={newArea.primaryColor}
                    onChange={(e) => setNewArea((p) => ({ ...p, primaryColor: e.target.value }))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
              </div>
            </div>
            <div
              style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginTop: 10 }}
            >
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-desc`}
                >
                  {kloelT(`Descricao`)}
                </label>
                <input
                  value={newArea.description}
                  onChange={(e) => setNewArea((p) => ({ ...p, description: e.target.value }))}
                  placeholder={kloelT(`Resumo da experiencia para o aluno`)}
                  style={inputStyle}
                  id={`${fid}-desc`}
                />
              </div>
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-template`}
                >
                  {kloelT(`Template`)}
                </label>
                <select
                  value={newArea.template}
                  onChange={(e) => setNewArea((p) => ({ ...p, template: e.target.value }))}
                  style={selectStyle}
                  id={`${fid}-template`}
                >
                  <option value="academy">{kloelT(`Academy`)}</option>
                  <option value="community">{kloelT(`Community`)}</option>
                  <option value="membership">{kloelT(`Membership`)}</option>
                </select>
              </div>
            </div>
            <div
              style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginTop: 10 }}
            >
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-logo`}
                >
                  {kloelT(`Logo da area`)}
                </label>
                <input
                  value={newArea.logoUrl}
                  onChange={(e) => setNewArea((p) => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="https://..."
                  style={inputStyle}
                  id={`${fid}-logo`}
                />
              </div>
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-capa`}
                >
                  {kloelT(`Capa da area`)}
                </label>
                <input
                  value={newArea.coverUrl}
                  onChange={(e) => setNewArea((p) => ({ ...p, coverUrl: e.target.value }))}
                  placeholder="https://..."
                  style={inputStyle}
                  id={`${fid}-capa`}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
              {[
                { key: 'certificates', label: 'Certificados' },
                { key: 'quizzes', label: 'Quizzes' },
                { key: 'community', label: 'Comunidade' },
                { key: 'gamification', label: 'Gamificacao' },
                { key: 'progressTrack', label: 'Progresso' },
                { key: 'downloads', label: 'Downloads' },
                { key: 'comments', label: 'Comentarios' },
              ].map((toggle) => (
                <label
                  key={toggle.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: 'var(--app-text-secondary)',
                    fontFamily: SORA,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={(newArea as Record<string, unknown>)[toggle.key] as boolean}
                    onChange={(e) =>
                      setNewArea((prev) => ({ ...prev, [toggle.key]: e.target.checked }))
                    }
                  />
                  {toggle.label}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
              <button
                type="button"
                onClick={handleCreateArea}
                disabled={saving}
                style={{ ...btnPrimary(PURPLE), opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Salvando...' : 'Criar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateArea(false);
                  setNewArea(emptyAreaForm);
                }}
                style={btnGhost}
              >
                {kloelT(`Cancelar`)}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayAreas.length === 0 && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: BG_CARD,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
            }}
          >
            <span style={{ color: PURPLE, display: 'block', marginBottom: 12 }}>
              {IC.users(32)}
            </span>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                marginBottom: 6,
              }}
            >
              {kloelT(`Nenhuma area de membros cadastrada.`)}
            </div>
            <div style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)' }}>
              {kloelT(`Crie sua primeira area clicando em &quot;Criar area&quot; acima.`)}
            </div>
          </div>
        )}
        {displayAreas.map((a) => {
          const isExpanded = expandedAreas[a.id];
          const isEditing = editingArea === a.id;
          const modules: DisplayModule[] = a.modules_list || a.modulesList || [];
          const areaAccent = a.primaryColor || PURPLE;
          const previewHref = buildMemberAreaPreviewPath(a.id);

          return (
            <div
              key={a.id}
              style={{
                background: BG_CARD,
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    background: areaAccent,
                  }}
                />

                <button
                  type="button"
                  onClick={() => toggleArea(a.id)}
                  style={{
                    ...iconBtn,
                    color: areaAccent,
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)',
                    transition: 'transform 150ms ease',
                  }}
                >
                  {IC.chevRight(18)}
                </button>

                {isEditing ? (
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1.5fr 1fr 1fr' }}>
                      <input
                        aria-label="Nome da area"
                        value={editAreaData.name}
                        onChange={(e) => setEditAreaData((p) => ({ ...p, name: e.target.value }))}
                        style={{ ...inputStyle, flex: 1 }}
                        ref={focusPrimaryInput}
                      />
                      <select
                        value={editAreaData.type}
                        onChange={(e) => setEditAreaData((p) => ({ ...p, type: e.target.value }))}
                        style={selectStyle}
                      >
                        <option value="COURSE">{kloelT(`Curso`)}</option>
                        <option value="COMMUNITY">{kloelT(`Comunidade`)}</option>
                        <option value="HYBRID">{kloelT(`Hibrido`)}</option>
                        <option value="MEMBERSHIP">{kloelT(`Membership`)}</option>
                      </select>
                      <select
                        value={editAreaData.productId}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, productId: e.target.value }))
                        }
                        style={selectStyle}
                      >
                        <option value="">{kloelT(`Sem vinculo`)}</option>
                        {productOptions.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 8,
                        gridTemplateColumns: '1.5fr 1fr',
                        marginTop: 8,
                      }}
                    >
                      <input
                        aria-label="Descricao da area"
                        value={editAreaData.description}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, description: e.target.value }))
                        }
                        placeholder={kloelT(`Descricao da area`)}
                        style={inputStyle}
                      />
                      <select
                        value={editAreaData.template}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, template: e.target.value }))
                        }
                        style={selectStyle}
                      >
                        <option value="academy">{kloelT(`Academy`)}</option>
                        <option value="community">{kloelT(`Community`)}</option>
                        <option value="membership">{kloelT(`Membership`)}</option>
                      </select>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 8,
                        gridTemplateColumns: '1fr 1fr',
                        marginTop: 8,
                      }}
                    >
                      <input
                        aria-label="Slug da area"
                        value={editAreaData.slug}
                        onChange={(e) => setEditAreaData((p) => ({ ...p, slug: e.target.value }))}
                        placeholder={kloelT(`Slug da area`)}
                        style={inputStyle}
                      />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="color"
                          value={editAreaData.primaryColor}
                          onChange={(e) =>
                            setEditAreaData((p) => ({ ...p, primaryColor: e.target.value }))
                          }
                          style={{
                            width: 44,
                            height: 38,
                            background: 'transparent',
                            border: `1px solid ${BORDER}`,
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        />
                        <input
                          aria-label="Cor principal da area"
                          value={editAreaData.primaryColor}
                          onChange={(e) =>
                            setEditAreaData((p) => ({ ...p, primaryColor: e.target.value }))
                          }
                          placeholder={kloelT(`#8B5CF6`)}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 8,
                        gridTemplateColumns: '1fr 1fr',
                        marginTop: 8,
                      }}
                    >
                      <input
                        aria-label="Logo da area"
                        value={editAreaData.logoUrl}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, logoUrl: e.target.value }))
                        }
                        placeholder={kloelT(`Logo da area`)}
                        style={inputStyle}
                      />
                      <input
                        aria-label="Capa da area"
                        value={editAreaData.coverUrl}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, coverUrl: e.target.value }))
                        }
                        placeholder={kloelT(`Capa da area`)}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                      {[
                        { key: 'certificates', label: 'Certificados' },
                        { key: 'quizzes', label: 'Quizzes' },
                        { key: 'community', label: 'Comunidade' },
                        { key: 'gamification', label: 'Gamificacao' },
                        { key: 'progressTrack', label: 'Progresso' },
                        { key: 'downloads', label: 'Downloads' },
                        { key: 'comments', label: 'Comentarios' },
                        { key: 'active', label: 'Ativa' },
                      ].map((toggle) => (
                        <label
                          key={toggle.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 11,
                            color: 'var(--app-text-secondary)',
                            fontFamily: SORA,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={
                              (editAreaData as Record<string, unknown>)[toggle.key] as boolean
                            }
                            onChange={(e) =>
                              setEditAreaData((prev) => ({
                                ...prev,
                                [toggle.key]: e.target.checked,
                              }))
                            }
                          />
                          {toggle.label}
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => handleUpdateArea(a.id)}
                        disabled={saving}
                        style={{ ...btnPrimary(PURPLE), fontSize: 11, padding: '6px 12px' }}
                      >
                        {kloelT(`Salvar`)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingArea(null)}
                        style={{ ...btnGhost, fontSize: 11, padding: '6px 12px' }}
                      >
                        {kloelT(`Cancelar`)}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: `${areaAccent}15`,
                        border: `1px solid ${areaAccent}30`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {a.logoUrl ? (
                        <img
                          src={a.logoUrl}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ color: areaAccent }}>{IC.users(18)}</span>
                      )}
                    </div>
                    <div
                      style={{ flex: 1, cursor: 'pointer' }}
                      onClick={() => toggleArea(a.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          (e.currentTarget as HTMLElement).click();
                        }
                      }}
                    >
                      <div
                        style={{
                          fontFamily: SORA,
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--app-text-primary)',
                        }}
                      >
                        {a.name}
                      </div>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          color: 'var(--app-text-tertiary)',
                          marginTop: 2,
                        }}
                      >
                        {a.type === 'COURSE'
                          ? 'Curso'
                          : a.type === 'COMMUNITY'
                            ? 'Comunidade'
                            : a.type === 'HYBRID'
                              ? 'Hibrido'
                              : a.type}{' '}
                        {kloelT(`&middot;`)}{' '}
                        {typeof a.modules === 'number' ? a.modules : modules.length} modulos
                      </div>
                      {a.slug && (
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            color: areaAccent,
                            marginTop: 4,
                          }}
                        >
                          /{a.slug}
                        </div>
                      )}
                    </div>
                    <NP w={100} h={22} color={areaAccent} />
                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--app-text-primary)',
                        }}
                      >
                        {a.students} alunos
                      </div>
                      {a.completion > 0 && (
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            color: areaAccent,
                            marginTop: 2,
                          }}
                        >
                          {a.completion}
                          {kloelT(`% conclusao`)}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openStudentDrawer(a.id, a.name)}
                      style={{ ...iconBtn, color: 'colors.ember.primary' }}
                      title={kloelT(`Gerenciar alunos`)}
                    >
                      <svg
                        aria-hidden="true"
                        width={16}
                        height={16}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path d={kloelT(`M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2`)} />
                        <circle cx="9" cy="7" r="4" />
                        <path d={kloelT(`M23 21v-2a4 4 0 0 0-3-3.87`)} />
                        <path d={kloelT(`M16 3.13a4 4 0 0 1 0 7.75`)} />
                      </svg>
                    </button>
                    <a
                      href={previewHref || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => {
                        if (!previewHref) {
                          event.preventDefault();
                        }
                      }}
                      aria-disabled={!previewHref}
                      style={{
                        ...iconBtn,
                        color: 'colors.ember.primary',
                        opacity: previewHref ? 1 : 0.45,
                        textDecoration: 'none',
                      }}
                      title={kloelT(`Pre-visualizar como aluno`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          (e.currentTarget as HTMLElement).click();
                        }
                      }}
                    >
                      <svg
                        aria-hidden="true"
                        width={16}
                        height={16}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path d={kloelT(`M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z`)} />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingArea(a.id);
                        setEditAreaData({
                          name: a.name,
                          slug: a.slug || '',
                          description: a.description || '',
                          type: a.type || 'COURSE',
                          productId: a.productId || '',
                          template: a.template || 'academy',
                          logoUrl: a.logoUrl || '',
                          coverUrl: a.coverUrl || '',
                          primaryColor: a.primaryColor || PURPLE,
                          certificates: a.certificates !== false,
                          quizzes: a.quizzes !== false,
                          community: a.community === true,
                          gamification: a.gamification !== false,
                          progressTrack: a.progressTrack !== false,
                          downloads: a.downloads !== false,
                          comments: a.comments !== false,
                          active: a.active !== false,
                        });
                      }}
                      style={{ ...iconBtn, color: 'var(--app-text-secondary)' }}
                      title={kloelT(`Editar area`)}
                    >
                      {IC.edit(16)}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteArea(a.id)}
                      style={{ ...iconBtn, color: colors.semantic.error }}
                      title={kloelT(`Excluir area`)}
                    >
                      {IC.trash(16)}
                    </button>
                  </>
                )}
              </div>

              {isExpanded && (
                <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 16px 16px 40px' }}>
                  <div
                    style={{
                      background: BG_ELEVATED,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 6,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    {(a.coverUrl || a.logoUrl) && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '180px 1fr',
                          gap: 12,
                          marginBottom: 12,
                        }}
                      >
                        <div
                          style={{
                            height: 96,
                            borderRadius: 8,
                            overflow: 'hidden',
                            background: 'var(--app-bg-primary)',
                            border: `1px solid ${BORDER}`,
                          }}
                        >
                          {a.coverUrl ? (
                            <img
                              src={a.coverUrl}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: areaAccent,
                              }}
                            >
                              {IC.book(24)}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {a.logoUrl ? (
                            <div
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 12,
                                overflow: 'hidden',
                                border: `1px solid ${BORDER}`,
                                background: 'var(--app-bg-primary)',
                                flexShrink: 0,
                              }}
                            >
                              <img
                                src={a.logoUrl}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </div>
                          ) : null}
                          <div>
                            <div
                              style={{
                                fontFamily: SORA,
                                fontSize: 12,
                                fontWeight: 600,
                                color: 'var(--app-text-primary)',
                              }}
                            >
                              {a.name}
                            </div>
                            <div
                              style={{
                                fontFamily: MONO,
                                fontSize: 10,
                                color: 'var(--app-text-secondary)',
                                marginTop: 2,
                              }}
                            >
                              {a.slug ? `/${a.slug}` : 'Slug automatico'} {kloelT(`&middot;`)}{' '}
                              {a.template || 'academy'}
                            </div>
                            <div
                              style={{
                                fontFamily: MONO,
                                fontSize: 10,
                                color: areaAccent,
                                marginTop: 4,
                              }}
                            >
                              {kloelT(`Cor principal`)} {a.primaryColor || PURPLE}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: SORA,
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--app-text-primary)',
                          }}
                        >
                          {kloelT(`Configuracao da area`)}
                        </div>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            color: 'var(--app-text-tertiary)',
                            marginTop: 2,
                          }}
                        >
                          {a.template || 'academy'} {kloelT(`&middot;`)}{' '}
                          {a.productName || 'Sem produto vinculado'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleGenerateStructure(a.id)}
                          disabled={
                            generatingAreaId === a.id ||
                            (Array.isArray(modules) && modules.length > 0)
                          }
                          style={{
                            ...btnGhost,
                            color:
                              generatingAreaId === a.id ? 'var(--app-text-primary)' : areaAccent,
                            borderColor: areaAccent,
                            opacity: generatingAreaId === a.id || modules.length > 0 ? 0.5 : 1,
                          }}
                        >
                          {generatingAreaId === a.id
                            ? 'Gerando...'
                            : modules.length > 0
                              ? 'Estrutura pronta'
                              : 'Gerar estrutura IA'}
                        </button>
                        <a
                          href={previewHref || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => {
                            if (!previewHref) {
                              event.preventDefault();
                            }
                          }}
                          aria-disabled={!previewHref}
                          style={{
                            ...btnGhost,
                            color: 'colors.ember.primary',
                            opacity: previewHref ? 1 : 0.45,
                            textDecoration: 'none',
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              (e.currentTarget as HTMLElement).click();
                            }
                          }}
                        >
                          {kloelT(`Preview do aluno`)}
                        </a>
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: SORA,
                        fontSize: 12,
                        color: 'var(--app-text-secondary)',
                        lineHeight: 1.6,
                      }}
                    >
                      {a.description ||
                        'Adicione uma descrição para orientar o aluno e dar contexto à jornada.'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      {[
                        a.certificates !== false ? 'Certificados' : null,
                        a.quizzes !== false ? 'Quizzes' : null,
                        a.community === true ? 'Comunidade' : null,
                        a.gamification !== false ? 'Gamificacao' : null,
                        a.progressTrack !== false ? 'Progresso' : null,
                        a.downloads !== false ? 'Downloads' : null,
                        a.comments !== false ? 'Comentários' : null,
                      ]
                        .filter(Boolean)
                        .map((label) => (
                          <span
                            key={label}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 999,
                              background: `${areaAccent}15`,
                              border: `1px solid ${areaAccent}30`,
                              color: areaAccent,
                              fontSize: 10,
                              fontWeight: 600,
                              fontFamily: SORA,
                            }}
                          >
                            {label}
                          </span>
                        ))}
                    </div>
                  </div>
                  {modules.length > 0 ? (
                    modules.map((mod) => {
                      const lessons: DisplayLesson[] = mod.lessons || [];
                      const isEditingMod = editingModule === mod.id;

                      return (
                        <div
                          key={mod.id}
                          style={{
                            marginBottom: 12,
                            background: BG_ELEVATED,
                            borderRadius: 6,
                            border: `1px solid ${BORDER}`,
                            padding: 12,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              marginBottom: lessons.length > 0 ? 10 : 0,
                            }}
                          >
                            <span style={{ color: PURPLE }}>{IC.book(16)}</span>
                            {isEditingMod ? (
                              <div
                                style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}
                              >
                                <input
                                  aria-label="Nome do modulo"
                                  value={editModuleData.name}
                                  onChange={(e) => setEditModuleData({ name: e.target.value })}
                                  style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                                  ref={focusPrimaryInput}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateModule(a.id, mod.id)}
                                  disabled={saving}
                                  style={{
                                    ...btnPrimary(PURPLE),
                                    fontSize: 10,
                                    padding: '5px 10px',
                                  }}
                                >
                                  {kloelT(`Salvar`)}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingModule(null)}
                                  style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                                >
                                  {kloelT(`Cancelar`)}
                                </button>
                              </div>
                            ) : (
                              <>
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
                                  {lessons.length} aulas
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingModule(mod.id);
                                    setEditModuleData({ name: mod.name });
                                  }}
                                  style={{ ...iconBtn, color: 'var(--app-text-secondary)' }}
                                  title={kloelT(`Editar modulo`)}
                                >
                                  {IC.edit(14)}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteModule(a.id, mod.id)}
                                  style={{ ...iconBtn, color: colors.semantic.error }}
                                  title={kloelT(`Excluir modulo`)}
                                >
                                  {IC.trash(14)}
                                </button>
                              </>
                            )}
                          </div>

                          {lessons.map((lesson) => {
                            const isEditingLes = editingLesson === lesson.id;
                            const embedUrl = toEmbed(lesson.videoUrl || '');

                            return (
                              <div
                                key={lesson.id}
                                style={{
                                  marginLeft: 16,
                                  padding: '8px 10px',
                                  borderLeft: `2px solid ${BORDER}`,
                                  marginBottom: 6,
                                }}
                              >
                                {isEditingLes ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <input
                                      aria-label="Nome da aula"
                                      value={editLessonData.name}
                                      onChange={(e) =>
                                        setEditLessonData((p) => ({ ...p, name: e.target.value }))
                                      }
                                      placeholder={kloelT(`Nome da aula`)}
                                      style={{ ...inputStyle, fontSize: 11 }}
                                      ref={focusPrimaryInput}
                                    />
                                    <input
                                      aria-label="Descricao da aula"
                                      value={editLessonData.description}
                                      onChange={(e) =>
                                        setEditLessonData((p) => ({
                                          ...p,
                                          description: e.target.value,
                                        }))
                                      }
                                      placeholder={kloelT(`Descricao`)}
                                      style={{ ...inputStyle, fontSize: 11 }}
                                    />
                                    <input
                                      aria-label="URL do video"
                                      value={editLessonData.videoUrl}
                                      onChange={(e) =>
                                        setEditLessonData((p) => ({
                                          ...p,
                                          videoUrl: e.target.value,
                                        }))
                                      }
                                      placeholder={kloelT(`YouTube URL`)}
                                      style={{ ...inputStyle, fontSize: 11 }}
                                    />
                                    {(() => {
                                      const safeEditLessonEmbedUrl =
                                        toSupportedEmbedUrl(editLessonData.videoUrl) ?? '';
                                      return (
                                        safeEditLessonEmbedUrl && (
                                          <div
                                            style={{
                                              borderRadius: 6,
                                              overflow: 'hidden',
                                              marginTop: 4,
                                            }}
                                          >
                                            <iframe
                                              src={safeEditLessonEmbedUrl}
                                              width="100%"
                                              height="180"
                                              allow={kloelT(
                                                `accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share`,
                                              )}
                                              referrerPolicy="strict-origin-when-cross-origin"
                                              style={{ border: 'none', borderRadius: 6 }}
                                              allowFullScreen
                                              title="Preview"
                                            />
                                          </div>
                                        )
                                      );
                                    })()}
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateLesson(a.id, lesson.id)}
                                        disabled={saving}
                                        style={{
                                          ...btnPrimary(PURPLE),
                                          fontSize: 10,
                                          padding: '5px 10px',
                                        }}
                                      >
                                        {kloelT(`Salvar`)}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingLesson(null)}
                                        style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                                      >
                                        {kloelT(`Cancelar`)}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}
                                  >
                                    <span style={{ color: PURPLE, marginTop: 2 }}>
                                      {IC.play(14)}
                                    </span>
                                    <div style={{ flex: 1 }}>
                                      <div
                                        style={{
                                          fontFamily: SORA,
                                          fontSize: 12,
                                          color: 'var(--app-text-primary)',
                                        }}
                                      >
                                        {lesson.name}
                                      </div>
                                      {lesson.description && (
                                        <div
                                          style={{
                                            fontFamily: MONO,
                                            fontSize: 10,
                                            color: 'var(--app-text-tertiary)',
                                            marginTop: 2,
                                          }}
                                        >
                                          {lesson.description}
                                        </div>
                                      )}
                                      {embedUrl && (
                                        <div
                                          style={{
                                            borderRadius: 6,
                                            overflow: 'hidden',
                                            marginTop: 6,
                                          }}
                                        >
                                          <iframe
                                            src={embedUrl}
                                            width="100%"
                                            height="180"
                                            allow={kloelT(
                                              `accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share`,
                                            )}
                                            referrerPolicy="strict-origin-when-cross-origin"
                                            style={{ border: 'none', borderRadius: 6 }}
                                            allowFullScreen
                                            title={lesson.name}
                                          />
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingLesson(lesson.id);
                                        setEditLessonData({
                                          name: lesson.name,
                                          description: lesson.description || '',
                                          videoUrl: lesson.videoUrl || '',
                                        });
                                      }}
                                      style={{ ...iconBtn, color: 'var(--app-text-secondary)' }}
                                      title={kloelT(`Editar aula`)}
                                    >
                                      {IC.edit(14)}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteLesson(a.id, lesson.id)}
                                      style={{ ...iconBtn, color: colors.semantic.error }}
                                      title={kloelT(`Excluir aula`)}
                                    >
                                      {IC.trash(14)}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {creatingLesson === mod.id ? (
                            <div
                              style={{
                                marginLeft: 16,
                                marginTop: 8,
                                padding: 10,
                                background: BG_CARD,
                                borderRadius: 6,
                                border: `1px solid ${BORDER}`,
                              }}
                            >
                              <div
                                style={{
                                  fontFamily: SORA,
                                  fontSize: 10,
                                  color: 'var(--app-text-tertiary)',
                                  letterSpacing: '0.15em',
                                  textTransform: 'uppercase' as const,
                                  marginBottom: 8,
                                }}
                              >
                                {kloelT(`Nova Aula`)}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <input
                                  aria-label="Nome da aula"
                                  value={newLesson.name}
                                  onChange={(e) =>
                                    setNewLesson((p) => ({ ...p, name: e.target.value }))
                                  }
                                  placeholder={kloelT(`Nome da aula`)}
                                  style={{ ...inputStyle, fontSize: 11 }}
                                  ref={focusPrimaryInput}
                                />
                                <input
                                  aria-label="Descricao da aula"
                                  value={newLesson.description}
                                  onChange={(e) =>
                                    setNewLesson((p) => ({ ...p, description: e.target.value }))
                                  }
                                  placeholder={kloelT(`Descricao (opcional)`)}
                                  style={{ ...inputStyle, fontSize: 11 }}
                                />
                                <input
                                  aria-label="URL do video"
                                  value={newLesson.videoUrl}
                                  onChange={(e) =>
                                    setNewLesson((p) => ({ ...p, videoUrl: e.target.value }))
                                  }
                                  placeholder={kloelT(`YouTube URL (opcional)`)}
                                  style={{ ...inputStyle, fontSize: 11 }}
                                />
                                {toEmbed(newLesson.videoUrl) && (
                                  <div
                                    style={{ borderRadius: 6, overflow: 'hidden', marginTop: 4 }}
                                  >
                                    <iframe
                                      src={toEmbed(newLesson.videoUrl)}
                                      width="100%"
                                      height="180"
                                      allow={kloelT(
                                        `accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share`,
                                      )}
                                      referrerPolicy="strict-origin-when-cross-origin"
                                      style={{ border: 'none', borderRadius: 6 }}
                                      allowFullScreen
                                      title="Preview"
                                    />
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                  <button
                                    type="button"
                                    onClick={() => handleCreateLesson(a.id, mod.id)}
                                    disabled={saving}
                                    style={{
                                      ...btnPrimary(PURPLE),
                                      fontSize: 10,
                                      padding: '5px 10px',
                                    }}
                                  >
                                    {saving ? 'Salvando...' : 'Adicionar'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCreatingLesson(null);
                                      setNewLesson({ name: '', description: '', videoUrl: '' });
                                    }}
                                    style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                                  >
                                    {kloelT(`Cancelar`)}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setCreatingLesson(mod.id);
                                setNewLesson({ name: '', description: '', videoUrl: '' });
                              }}
                              style={{
                                ...iconBtn,
                                color: PURPLE,
                                fontFamily: SORA,
                                fontSize: 11,
                                gap: 4,
                                marginLeft: 16,
                                marginTop: 6,
                              }}
                            >
                              {IC.plus(14)} <span>{kloelT(`Adicionar aula`)}</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: 'var(--app-text-tertiary)',
                        marginBottom: 10,
                      }}
                    >
                      {kloelT(`Nenhum modulo nesta area.`)}
                    </div>
                  )}

                  {creatingModule === a.id ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 12,
                        background: BG_ELEVATED,
                        borderRadius: 6,
                        border: `1px solid ${BORDER}`,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: SORA,
                          fontSize: 10,
                          color: 'var(--app-text-tertiary)',
                          letterSpacing: '0.15em',
                          textTransform: 'uppercase' as const,
                          marginBottom: 8,
                        }}
                      >
                        {kloelT(`Novo Modulo`)}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          aria-label="Nome do modulo"
                          value={newModule.name}
                          onChange={(e) => setNewModule({ name: e.target.value })}
                          placeholder={kloelT(`Nome do modulo`)}
                          style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                          ref={focusPrimaryInput}
                        />
                        <button
                          type="button"
                          onClick={() => handleCreateModule(a.id)}
                          disabled={saving}
                          style={{ ...btnPrimary(PURPLE), fontSize: 10, padding: '5px 10px' }}
                        >
                          {saving ? 'Salvando...' : 'Criar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCreatingModule(null);
                            setNewModule({ name: '' });
                          }}
                          style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                        >
                          {kloelT(`Cancelar`)}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingModule(a.id);
                        setNewModule({ name: '' });
                      }}
                      style={{
                        ...iconBtn,
                        color: PURPLE,
                        fontFamily: SORA,
                        fontSize: 11,
                        gap: 4,
                        marginTop: 8,
                      }}
                    >
                      {IC.plus(14)} <span>{kloelT(`Adicionar modulo`)}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 20 }}>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--app-text-tertiary)',
            marginBottom: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase' as const,
          }}
        >
          {kloelT(`Atividade Recente`)}
        </div>
        <LiveFeed color={PURPLE} events={memberEvents} />
      </div>

      {studentAreaId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 200,
            display: 'flex',
            justifyContent: 'flex-end',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => {
            setStudentAreaId(null);
            setEditingStudentId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (e.currentTarget as HTMLElement).click();
            }
          }}
        >
          <div
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{
              width: 480,
              background: 'var(--app-bg-primary)',
              borderLeft: `1px solid ${BORDER}`,
              height: '100%',
              display: 'flex',
              flexDirection: 'column' as const,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                (e.currentTarget as HTMLElement).click();
              }
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${BORDER}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--app-text-primary)',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`Alunos`)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
                  {studentAreaName}
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar painel de alunos"
                onClick={() => {
                  setStudentAreaId(null);
                  setEditingStudentId(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--app-text-tertiary)',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <svg
                  aria-hidden="true"
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div
              style={{
                padding: '12px 20px',
                borderBottom: `1px solid ${BORDER}`,
                display: 'flex',
                gap: 8,
              }}
            >
              <input
                aria-label="Buscar aluno"
                value={studentSearch}
                onChange={(e) => handleSearchStudents(e.target.value)}
                placeholder={kloelT(`Buscar aluno...`)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => setShowAddStudent(!showAddStudent)}
                style={{
                  ...btnPrimary(PURPLE),
                  padding: '8px 14px',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {showAddStudent ? 'Cancelar' : '+ Aluno'}
              </button>
            </div>
            {showAddStudent && (
              <div
                style={{
                  padding: '12px 20px',
                  borderBottom: `1px solid ${BORDER}`,
                  display: 'flex',
                  flexDirection: 'column' as const,
                  gap: 8,
                }}
              >
                <input
                  aria-label="Nome do aluno"
                  value={newStudent.name}
                  onChange={(e) => setNewStudent((s) => ({ ...s, name: e.target.value }))}
                  placeholder={kloelT(`Nome do aluno *`)}
                  style={inputStyle}
                />
                <input
                  aria-label="Email do aluno"
                  value={newStudent.email}
                  onChange={(e) => setNewStudent((s) => ({ ...s, email: e.target.value }))}
                  placeholder={kloelT(`Email *`)}
                  type="email"
                  style={inputStyle}
                />
                <input
                  aria-label="Telefone do aluno"
                  value={newStudent.phone}
                  onChange={(e) => setNewStudent((s) => ({ ...s, phone: e.target.value }))}
                  placeholder={kloelT(`Telefone (opcional)`)}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={handleAddStudent}
                  disabled={saving || !newStudent.name || !newStudent.email}
                  style={{
                    ...btnPrimary(PURPLE),
                    opacity: saving || !newStudent.name || !newStudent.email ? 0.5 : 1,
                  }}
                >
                  {saving ? 'Salvando...' : 'Matricular aluno'}
                </button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto' as const, padding: '0 20px' }}>
              {studentLoading ? (
                <div
                  style={{
                    padding: '18px 0',
                    display: 'flex',
                    flexDirection: 'column' as const,
                    gap: 12,
                  }}
                >
                  {[0, 1, 2].map((index) => (
                    <div
                      key={`skeleton-row-${index}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: `1px solid ${BG_ELEVATED}`,
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: 'var(--app-bg-secondary)',
                          border: `1px solid ${BORDER}`,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            width: `${58 - index * 8}%`,
                            height: 12,
                            borderRadius: 6,
                            marginBottom: 8,
                            background:
                              'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)',
                          }}
                        />
                        <div
                          style={{
                            width: `${72 - index * 10}%`,
                            height: 10,
                            borderRadius: 6,
                            background:
                              'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : students.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' as const }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'colors.ember.primary',
                      letterSpacing: '.25em',
                      textTransform: 'uppercase' as const,
                      marginBottom: 8,
                    }}
                  >
                    {kloelT(`SEM ALUNOS`)}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--app-text-primary)', fontFamily: SORA }}>
                    {kloelT(`Nenhum aluno matriculado`)}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--app-text-tertiary)',
                      fontFamily: SORA,
                      marginTop: 4,
                    }}
                  >
                    {kloelT(`Clique em &quot;+ Aluno&quot; para adicionar`)}
                  </div>
                </div>
              ) : (
                students.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 0',
                      borderBottom: `1px solid ${BG_ELEVATED}`,
                    }}
                  >
                    {editingStudentId === s.id ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <input
                            aria-label="Nome do aluno"
                            value={editStudentData.name}
                            onChange={(e) =>
                              setEditStudentData((prev) => ({ ...prev, name: e.target.value }))
                            }
                            style={inputStyle}
                          />
                          <input
                            aria-label="Email do aluno"
                            value={editStudentData.email}
                            onChange={(e) =>
                              setEditStudentData((prev) => ({ ...prev, email: e.target.value }))
                            }
                            style={inputStyle}
                          />
                        </div>
                        <div
                          style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px', gap: 8 }}
                        >
                          <input
                            aria-label="Telefone do aluno"
                            value={editStudentData.phone}
                            onChange={(e) =>
                              setEditStudentData((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            style={inputStyle}
                            placeholder={kloelT(`Telefone`)}
                          />
                          <select
                            aria-label="Status do aluno"
                            value={editStudentData.status}
                            onChange={(e) =>
                              setEditStudentData((prev) => ({ ...prev, status: e.target.value }))
                            }
                            style={selectStyle}
                          >
                            <option value="active">{kloelT(`Ativo`)}</option>
                            <option value="suspended">{kloelT(`Suspenso`)}</option>
                          </select>
                          <input
                            aria-label="Progresso do aluno"
                            type="number"
                            min="0"
                            max="100"
                            value={editStudentData.progress}
                            onChange={(e) =>
                              setEditStudentData((prev) => ({ ...prev, progress: e.target.value }))
                            }
                            style={inputStyle}
                            placeholder="0-100"
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={handleUpdateStudent}
                            disabled={saving}
                            style={{
                              ...btnPrimary(PURPLE),
                              padding: '8px 12px',
                              opacity: saving ? 0.6 : 1,
                            }}
                          >
                            {kloelT(`Salvar aluno`)}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingStudentId(null)}
                            style={{ ...btnGhost, padding: '8px 12px' }}
                          >
                            {kloelT(`Cancelar`)}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: BG_ELEVATED,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'colors.ember.primary',
                            fontFamily: SORA,
                            flexShrink: 0,
                          }}
                        >
                          {(s.studentName || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: 'var(--app-text-primary)',
                              fontFamily: SORA,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' as const,
                            }}
                          >
                            {s.studentName}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--app-text-secondary)',
                              fontFamily: SORA,
                            }}
                          >
                            {s.studentEmail}
                          </div>
                          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                            {s.studentPhone ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: 'var(--app-text-tertiary)',
                                  fontFamily: MONO,
                                }}
                              >
                                {s.studentPhone}
                              </span>
                            ) : null}
                            <span style={{ fontSize: 10, color: PURPLE, fontFamily: MONO }}>
                              {Math.round(Number(s.progress || 0))}
                              {kloelT(`% progresso`)}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: s.status === 'active' ? colors.semantic.success : colors.semantic.error,
                            }}
                          />
                          <span
                            style={{
                              fontSize: 10,
                              color: s.status === 'active' ? colors.semantic.success : colors.semantic.error,
                              fontFamily: SORA,
                            }}
                          >
                            {s.status === 'active' ? 'Ativo' : 'Suspenso'}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label="Editar aluno"
                          onClick={() => handleStartEditStudent(s)}
                          disabled={saving}
                          style={{ ...iconBtn, color: 'var(--app-text-secondary)' }}
                          title={kloelT(`Editar aluno`)}
                        >
                          {IC.edit(14)}
                        </button>
                        <button
                          type="button"
                          aria-label={s.status === 'active' ? 'Suspender aluno' : 'Reativar aluno'}
                          onClick={() => handleToggleStudentStatus(s)}
                          disabled={saving}
                          style={{
                            ...iconBtn,
                            color: s.status === 'active' ? colors.semantic.warning : colors.semantic.success,
                          }}
                          title={s.status === 'active' ? 'Suspender aluno' : 'Reativar aluno'}
                        >
                          {s.status === 'active' ? IC.chevDown(14) : IC.trend(14)}
                        </button>
                        <button
                          type="button"
                          aria-label="Remover aluno"
                          onClick={() => handleRemoveStudent(s.id)}
                          disabled={saving}
                          style={{ ...iconBtn, color: colors.semantic.error }}
                          title={kloelT(`Remover aluno`)}
                        >
                          <svg
                            aria-hidden="true"
                            width={14}
                            height={14}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path
                              d={kloelT(
                                `M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2`,
                              )}
                            />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
