'use client';
import { colors } from '@/lib/design-tokens';

import { useCallback, useEffect, useState } from 'react';
import type { MemberAreaStudent } from './ProdutosView.types';
import { apiFetch } from '@/lib/api';
import {
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  PURPLE,
  EMBER,
  inputStyle,
  btnPrimary,
  btnGhost,
  iconBtn,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import { mutate } from 'swr';
import { kloelT } from '@/lib/i18n/t';

interface Props {
  areaId: string | null;
  areaName: string;
  onClose: () => void;
}

export default function AreaMembrosStudentDrawer({
  areaId,
  areaName,
  onClose,
}: Props) {
  const [students, setStudents] = useState<MemberAreaStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newStudent, setNewStudent] = useState({
    studentName: '',
    studentEmail: '',
    studentPhone: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!areaId) return;
    setLoading(true);
    try {
      const qs = search
        ? `?q=${encodeURIComponent(search)}`
        : '';
      const res = await apiFetch(
        `/member-areas/${encodeURIComponent(areaId)}/students${qs}`,
      );
      const list = Array.isArray(res)
        ? res
        : ((res as { students?: MemberAreaStudent[] })?.students ?? []);
      setStudents(list as MemberAreaStudent[]);
    } finally {
      setLoading(false);
    }
  }, [areaId, search]);

  useEffect(() => {
    load();
  }, [load]);

  const invalidate = () =>
    mutate(
      (k: unknown) =>
        typeof k === 'string' && k.startsWith('/member-areas'),
    );

  const handleEnroll = async () => {
    if (!areaId) return;
    setActionLoading('enroll');
    try {
      await apiFetch(
        `/member-areas/${encodeURIComponent(areaId)}/students`,
        { method: 'POST', body: newStudent as unknown as Record<string, unknown> },
      );
      await invalidate();
      setNewStudent({ studentName: '', studentEmail: '', studentPhone: '' });
      setShowAdd(false);
      load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (studentId: string) => {
    if (!areaId) return;
    setActionLoading(`delete-${studentId}`);
    try {
      await apiFetch(
        `/member-areas/${encodeURIComponent(areaId)}/students/${encodeURIComponent(studentId)}`,
        { method: 'DELETE' },
      );
      await invalidate();
      load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleEdit = (student: MemberAreaStudent) => {
    setEditingId(student.id);
    setEditData({
      studentName: student.studentName || '',
      studentEmail: student.studentEmail || '',
      studentPhone: student.studentPhone || '',
      status: student.status || '',
      progress: String(student.progress ?? ''),
    });
  };

  const handleSaveEdit = async (studentId: string) => {
    if (!areaId) return;
    setActionLoading(`save-${studentId}`);
    try {
      await apiFetch(
        `/member-areas/${encodeURIComponent(areaId)}/students/${encodeURIComponent(studentId)}`,
        { method: 'PUT', body: editData as unknown as Record<string, unknown> },
      );
      await invalidate();
      setEditingId(null);
      load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStatus = async (student: MemberAreaStudent) => {
    if (!areaId) return;
    setActionLoading(`toggle-${student.id}`);
    const newStatus = student.status === 'suspended' ? 'active' : 'suspended';
    try {
      await apiFetch(
        `/member-areas/${encodeURIComponent(areaId)}/students/${encodeURIComponent(student.id)}`,
        { method: 'PUT', body: { status: newStatus } },
      );
      await invalidate();
      load();
    } finally {
      setActionLoading(null);
    }
  };

  if (!areaId) return null;

  const statusDot = (status?: string) => (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: status === 'active' || !status ? EMBER : colors.semantic.error,
        flexShrink: 0,
      }}
    />
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 480,
          maxWidth: '100vw',
          height: '100vh',
          background: 'var(--app-bg-primary)',
          borderLeft: `1px solid ${BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            padding: '16px 20px',
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontFamily: SORA,
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--app-text-primary)',
              }}
            >
              {kloelT('Alunos')}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'var(--app-text-tertiary)',
              }}
            >
              {areaName}
            </span>
          </div>
          <button
            type="button"
            style={{
              ...iconBtn,
              color: 'var(--app-text-secondary)',
            }}
            onClick={onClose}
          >
            <svg
              width={20}
              height={20}
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

        {/* Search + Add */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '12px 20px',
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flex: 1,
              padding: '6px 10px',
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
            }}
          >
            {IC.search(14)}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={kloelT('Buscar aluno...')}
              style={{
                border: 'none',
                background: 'none',
                outline: 'none',
                fontFamily: SORA,
                fontSize: 12,
                color: 'var(--app-text-primary)',
                flex: 1,
              }}
            />
          </div>
          <button
            type="button"
            style={btnPrimary(PURPLE)}
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? kloelT('Fechar') : `+ ${kloelT('Aluno')}`}
          </button>
        </div>

        {/* Add Student Form */}
        {showAdd && (
          <div
            style={{
              padding: '12px 20px',
              borderBottom: `1px solid ${BORDER}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <input
              value={newStudent.studentName}
              onChange={(e) =>
                setNewStudent((p) => ({ ...p, studentName: e.target.value }))
              }
              placeholder={`${kloelT('Nome')} *`}
              style={inputStyle}
            />
            <input
              value={newStudent.studentEmail}
              onChange={(e) =>
                setNewStudent((p) => ({
                  ...p,
                  studentEmail: e.target.value,
                }))
              }
              placeholder={`${kloelT('Email')} *`}
              style={inputStyle}
            />
            <input
              value={newStudent.studentPhone}
              onChange={(e) =>
                setNewStudent((p) => ({
                  ...p,
                  studentPhone: e.target.value,
                }))
              }
              placeholder={kloelT('Telefone')}
              style={inputStyle}
            />
            <button
              type="button"
              style={btnPrimary(PURPLE)}
              disabled={actionLoading === 'enroll'}
              onClick={handleEnroll}
            >
              {actionLoading === 'enroll'
                ? kloelT('Matriculando...')
                : kloelT('Matricular aluno')}
            </button>
          </div>
        )}

        {/* Student List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 20px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '20px 0',
              }}
            >
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 52,
                    background: BG_CARD,
                    borderRadius: 8,
                    opacity: 0.5,
                  }}
                />
              ))}
            </div>
          ) : students.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                fontFamily: SORA,
                fontSize: 13,
                color: 'var(--app-text-tertiary)',
              }}
            >
              {kloelT('Nenhum aluno encontrado')}
            </div>
          ) : (
            students.map((student) => (
              <div
                key={student.id}
                style={{
                  background: BG_CARD,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {editingId === student.id ? (
                  /* Inline Edit */
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={editData.studentName || ''}
                        onChange={(e) =>
                          setEditData((p) => ({
                            ...p,
                            studentName: e.target.value,
                          }))
                        }
                        placeholder={kloelT('Nome')}
                        style={inputStyle}
                      />
                      <input
                        value={editData.studentEmail || ''}
                        onChange={(e) =>
                          setEditData((p) => ({
                            ...p,
                            studentEmail: e.target.value,
                          }))
                        }
                        placeholder={kloelT('Email')}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={editData.studentPhone || ''}
                        onChange={(e) =>
                          setEditData((p) => ({
                            ...p,
                            studentPhone: e.target.value,
                          }))
                        }
                        placeholder={kloelT('Telefone')}
                        style={inputStyle}
                      />
                      <select
                        value={editData.status || ''}
                        onChange={(e) =>
                          setEditData((p) => ({ ...p, status: e.target.value }))
                        }
                        style={{ ...inputStyle, flex: 0.7 }}
                      >
                        <option value="active">{kloelT('Ativo')}</option>
                        <option value="suspended">
                          {kloelT('Suspenso')}
                        </option>
                      </select>
                      <input
                        value={editData.progress || ''}
                        onChange={(e) =>
                          setEditData((p) => ({
                            ...p,
                            progress: e.target.value,
                          }))
                        }
                        placeholder="%"
                        style={{ ...inputStyle, flex: 0.4 }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        style={btnPrimary(PURPLE)}
                        disabled={actionLoading === `save-${student.id}`}
                        onClick={() => handleSaveEdit(student.id)}
                      >
                        {kloelT('Salvar aluno')}
                      </button>
                      <button
                        type="button"
                        style={btnGhost}
                        onClick={() => setEditingId(null)}
                      >
                        {kloelT('Cancelar')}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Student Row */
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: PURPLE,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: SORA,
                        fontSize: 13,
                        fontWeight: 700,
                        color: colors.text.silver,
                        flexShrink: 0,
                      }}
                    >
                      {(student.studentName || '?')[0].toUpperCase()}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: SORA,
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--app-text-primary)',
                        }}
                      >
                        {student.studentName || '—'}
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 10,
                          color: 'var(--app-text-tertiary)',
                        }}
                      >
                        {student.studentEmail || '—'}
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 10,
                          color: 'var(--app-text-tertiary)',
                        }}
                      >
                        {student.studentPhone || '—'}
                        {'  '}
                        {student.progress != null && (
                          <span style={{ color: PURPLE }}>
                            {Number(student.progress) || 0}%
                          </span>
                        )}
                      </span>
                    </div>
                    {statusDot(student.status)}
                    <button
                      type="button"
                      style={iconBtn}
                      title={kloelT('Editar')}
                      onClick={() => handleEdit(student)}
                    >
                      {IC.edit(14)}
                    </button>
                    <button
                      type="button"
                      style={iconBtn}
                      title={
                        student.status === 'suspended'
                          ? kloelT('Reativar')
                          : kloelT('Suspender')
                      }
                      onClick={() => handleToggleStatus(student)}
                    >
                      {student.status === 'suspended'
                        ? IC.trend(14)
                        : IC.chevDown(14)}
                    </button>
                    <button
                      type="button"
                      style={{ ...iconBtn, color: colors.semantic.error }}
                      title={kloelT('Remover')}
                      disabled={actionLoading === `delete-${student.id}`}
                      onClick={() => handleDelete(student.id)}
                    >
                      {IC.trash(14)}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
