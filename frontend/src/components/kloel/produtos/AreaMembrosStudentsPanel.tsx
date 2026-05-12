'use client';
import { kloelT } from '@/lib/i18n/t';
import { SORA, MONO, PURPLE, BG_ELEVATED, BORDER, inputStyle, selectStyle, btnPrimary, btnGhost, iconBtn } from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import type React from 'react';
import type { MemberAreaStudent } from './ProdutosView.types';
import { colors } from '@/lib/design-tokens';

export default function AreaMembrosStudentsPanel({
  studentAreaId, studentAreaName, students, studentSearch, handleSearchStudents,
  showAddStudent, setShowAddStudent, newStudent, setNewStudent, handleAddStudent,
  saving, editingStudentId, setEditingStudentId, editStudentData, setEditStudentData,
  handleUpdateStudent, handleStartEditStudent, handleToggleStudentStatus,
  handleRemoveStudent, studentLoading, onClose,
}: {
  studentAreaId: string | null;
  studentAreaName: string;
  students: MemberAreaStudent[];
  studentSearch: string;
  handleSearchStudents: (q: string) => void;
  showAddStudent: boolean;
  setShowAddStudent: (v: boolean) => void;
  newStudent: { name: string; email: string; phone: string };
  setNewStudent: React.Dispatch<React.SetStateAction<{ name: string; email: string; phone: string }>>;
  handleAddStudent: () => Promise<void>;
  saving: boolean;
  editingStudentId: string | null;
  setEditingStudentId: (v: string | null) => void;
  editStudentData: { name: string; email: string; phone: string; status: string; progress: string };
  setEditStudentData: React.Dispatch<React.SetStateAction<{ name: string; email: string; phone: string; status: string; progress: string }>>;
  handleUpdateStudent: () => Promise<void>;
  handleStartEditStudent: (student: MemberAreaStudent) => void;
  handleToggleStudentStatus: (student: MemberAreaStudent) => Promise<void>;
  handleRemoveStudent: (studentId: string) => Promise<void>;
  studentLoading: boolean;
  onClose: () => void;
}) {
  if (!studentAreaId) {return null;}

  const drawerBg = 'var(--app-bg-primary)';
  const hdrBorder = { borderBottom: `1px solid ${BORDER}` };
  const glassOverlay = { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(4px)' };
  const drawerStyle = { width: 480, background: drawerBg, borderLeft: `1px solid ${BORDER}`, height: '100%', display: 'flex', flexDirection: 'column' as const };
  const headerStyle = { padding: '16px 20px', ...hdrBorder, display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
  const searchRow = { padding: '12px 20px', ...hdrBorder, display: 'flex', gap: 8 };
  const addFormStyle = { padding: '12px 20px', ...hdrBorder, display: 'flex', flexDirection: 'column' as const, gap: 8 };
  const listArea = { flex: 1, overflowY: 'auto' as const, padding: '0 20px' };
  const avatarCircle = { width: 32, height: 32, borderRadius: '50%', background: BG_ELEVATED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'colors.ember.primary', fontFamily: SORA, flexShrink: 0 };
  const studentRow = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${BG_ELEVATED}` };
  const statusDot = (s: string) => s === 'active' ? colors.semantic.success : colors.semantic.error;

  return (
    <div style={glassOverlay} onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}>
      <div onClick={(e: React.MouseEvent) => e.stopPropagation()} style={drawerStyle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text-primary)', fontFamily: SORA }}>{kloelT('Alunos')}</div>
            <div style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>{studentAreaName}</div>
          </div>
          <button type="button" aria-label={kloelT('Fechar painel de alunos')} onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--app-text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <svg aria-hidden="true" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={searchRow}>
          <input aria-label={kloelT('Buscar aluno')} value={studentSearch}
            onChange={(e) => handleSearchStudents(e.target.value)}
            placeholder={kloelT('Buscar aluno...')} style={{ ...inputStyle, flex: 1 }} />
          <button type="button" onClick={() => setShowAddStudent(!showAddStudent)}
            style={{ ...btnPrimary(PURPLE), padding: '8px 14px', whiteSpace: 'nowrap' as const }}>
            {showAddStudent ? 'Cancelar' : '+ Aluno'}
          </button>
        </div>

        {showAddStudent && (
          <div style={addFormStyle}>
            <input aria-label={kloelT('Nome do aluno')} value={newStudent.name}
              onChange={(e) => setNewStudent((s) => ({ ...s, name: e.target.value }))}
              placeholder={kloelT('Nome do aluno *')} style={inputStyle} />
            <input aria-label={kloelT('Email do aluno')} value={newStudent.email}
              onChange={(e) => setNewStudent((s) => ({ ...s, email: e.target.value }))}
              placeholder={kloelT('Email *')} type="email" style={inputStyle} />
            <input aria-label={kloelT('Telefone do aluno')} value={newStudent.phone}
              onChange={(e) => setNewStudent((s) => ({ ...s, phone: e.target.value }))}
              placeholder={kloelT('Telefone (opcional)')} style={inputStyle} />
            <button type="button" onClick={handleAddStudent}
              disabled={saving || !newStudent.name || !newStudent.email}
              style={{ ...btnPrimary(PURPLE), opacity: saving || !newStudent.name || !newStudent.email ? 0.5 : 1 }}>
              {saving ? 'Salvando...' : 'Matricular aluno'}
            </button>
          </div>
        )}

        <div style={listArea}>
          {studentLoading ? (
            <div style={{ padding: '18px 0', display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <div key={`skel-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${BG_ELEVATED}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--app-bg-secondary)', border: `1px solid ${BORDER}`, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ width: `${58 - i * 8}%`, height: 12, borderRadius: 6, marginBottom: 8, background: 'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)' }} />
                    <div style={{ width: `${72 - i * 10}%`, height: 10, borderRadius: 6, background: 'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : students.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' as const }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'colors.ember.primary', letterSpacing: '.25em', textTransform: 'uppercase' as const, marginBottom: 8 }}>{kloelT('SEM ALUNOS')}</div>
              <div style={{ fontSize: 14, color: 'var(--app-text-primary)', fontFamily: SORA }}>{kloelT('Nenhum aluno matriculado')}</div>
              <div style={{ fontSize: 12, color: 'var(--app-text-tertiary)', fontFamily: SORA, marginTop: 4 }}>{kloelT('Clique em "+ Aluno" para adicionar')}</div>
            </div>
          ) : (
            students.map((s) => (
              <div key={s.id} style={studentRow}>
                {editingStudentId === s.id ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input aria-label={kloelT('Nome do aluno')} value={editStudentData.name}
                        onChange={(e) => setEditStudentData((prev) => ({ ...prev, name: e.target.value }))} style={inputStyle} />
                      <input aria-label={kloelT('Email do aluno')} value={editStudentData.email}
                        onChange={(e) => setEditStudentData((prev) => ({ ...prev, email: e.target.value }))} style={inputStyle} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px', gap: 8 }}>
                      <input aria-label={kloelT('Telefone do aluno')} value={editStudentData.phone}
                        onChange={(e) => setEditStudentData((prev) => ({ ...prev, phone: e.target.value }))}
                        style={inputStyle} placeholder={kloelT('Telefone')} />
                      <select aria-label={kloelT('Status do aluno')} value={editStudentData.status}
                        onChange={(e) => setEditStudentData((prev) => ({ ...prev, status: e.target.value }))} style={selectStyle}>
                        <option value="active">{kloelT('Ativo')}</option>
                        <option value="suspended">{kloelT('Suspenso')}</option>
                      </select>
                      <input aria-label={kloelT('Progresso do aluno')} type="number" min="0" max="100"
                        value={editStudentData.progress}
                        onChange={(e) => setEditStudentData((prev) => ({ ...prev, progress: e.target.value }))}
                        style={inputStyle} placeholder="0-100" />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={handleUpdateStudent} disabled={saving}
                        style={{ ...btnPrimary(PURPLE), padding: '8px 12px', opacity: saving ? 0.6 : 1 }}>{kloelT('Salvar aluno')}</button>
                      <button type="button" onClick={() => setEditingStudentId(null)}
                        style={{ ...btnGhost, padding: '8px 12px' }}>{kloelT('Cancelar')}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={avatarCircle}>{(s.studentName || '?')[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--app-text-primary)', fontFamily: SORA, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.studentName}</div>
                      <div style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>{s.studentEmail}</div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                        {s.studentPhone ? <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)', fontFamily: MONO }}>{s.studentPhone}</span> : null}
                        <span style={{ fontSize: 10, color: PURPLE, fontFamily: MONO }}>{Math.round(Number(s.progress || 0))}{kloelT('% progresso')}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusDot(s.status || 'active') }} />
                      <span style={{ fontSize: 10, color: statusDot(s.status || 'active'), fontFamily: SORA }}>
                        {s.status === 'active' ? 'Ativo' : 'Suspenso'}
                      </span>
                    </div>
                    <button type="button" aria-label={kloelT('Editar aluno')} onClick={() => handleStartEditStudent(s)}
                      disabled={saving} style={{ ...iconBtn, color: 'var(--app-text-secondary)' }} title={kloelT('Editar aluno')}>
                      {IC.edit(14)}
                    </button>
                    <button type="button"
                      aria-label={s.status === 'active' ? kloelT('Suspender aluno') : kloelT('Reativar aluno')}
                      onClick={() => handleToggleStudentStatus(s)} disabled={saving}
                      style={{ ...iconBtn, color: s.status === 'active' ? colors.semantic.warning : colors.semantic.success }}
                      title={s.status === 'active' ? kloelT('Suspender aluno') : kloelT('Reativar aluno')}>
                      {s.status === 'active' ? IC.chevDown(14) : IC.trend(14)}
                    </button>
                    <button type="button" aria-label={kloelT('Remover aluno')} onClick={() => handleRemoveStudent(s.id)}
                      disabled={saving} style={{ ...iconBtn, color: colors.semantic.error }} title={kloelT('Remover aluno')}>
                      <svg aria-hidden="true" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <polyline points="3 6 5 6 21 6" />
                        <path d={kloelT('M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2')} />
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
  );
}
