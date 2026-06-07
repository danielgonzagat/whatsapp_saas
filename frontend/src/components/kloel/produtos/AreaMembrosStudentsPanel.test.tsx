import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AreaMembrosStudentsPanel from './AreaMembrosStudentsPanel';

type Props = Parameters<typeof AreaMembrosStudentsPanel>[0];

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    studentAreaId: 'area-1',
    studentAreaName: 'Area Auditoria',
    students: [],
    studentSearch: '',
    handleSearchStudents: vi.fn(),
    showAddStudent: true,
    setShowAddStudent: vi.fn(),
    newStudent: { name: '', email: '', phone: '' },
    setNewStudent: vi.fn(),
    handleAddStudent: vi.fn().mockResolvedValue(undefined),
    saving: false,
    editingStudentId: null,
    setEditingStudentId: vi.fn(),
    editStudentData: { name: '', email: '', phone: '', status: 'active', progress: '0' },
    setEditStudentData: vi.fn(),
    handleUpdateStudent: vi.fn().mockResolvedValue(undefined),
    handleStartEditStudent: vi.fn(),
    handleToggleStudentStatus: vi.fn().mockResolvedValue(undefined),
    handleRemoveStudent: vi.fn().mockResolvedValue(undefined),
    studentLoading: false,
    onClose: vi.fn(),
    ...overrides,
  } as Props;
}

describe('AreaMembrosStudentsPanel', () => {
  it('blocks invalid student email before enrolling', () => {
    const handleAddStudent = vi.fn().mockResolvedValue(undefined);

    render(
      <AreaMembrosStudentsPanel
        {...makeProps({
          handleAddStudent,
          newStudent: { name: 'Aluno Auditoria', email: 'email-invalido', phone: '' },
        })}
      />,
    );

    const enrollButton = screen.getByRole('button', { name: 'Matricular aluno' }) as HTMLButtonElement;

    expect(screen.getByText('Informe um email valido para matricular aluno.')).toBeTruthy();
    expect(enrollButton.disabled).toBe(true);

    fireEvent.click(enrollButton);

    expect(handleAddStudent).not.toHaveBeenCalled();
  });

  it('allows enrollment when student name and email are valid', () => {
    const handleAddStudent = vi.fn().mockResolvedValue(undefined);

    render(
      <AreaMembrosStudentsPanel
        {...makeProps({
          handleAddStudent,
          newStudent: { name: 'Aluno Auditoria', email: 'aluno@example.com', phone: '' },
        })}
      />,
    );

    const enrollButton = screen.getByRole('button', { name: 'Matricular aluno' }) as HTMLButtonElement;

    expect(enrollButton.disabled).toBe(false);

    fireEvent.click(enrollButton);

    expect(handleAddStudent).toHaveBeenCalledTimes(1);
  });

  it('blocks invalid student email before updating an enrolled student', () => {
    const handleUpdateStudent = vi.fn().mockResolvedValue(undefined);

    render(
      <AreaMembrosStudentsPanel
        {...makeProps({
          showAddStudent: false,
          students: [{ id: 'student-1', studentName: 'Aluno Auditoria', studentEmail: 'aluno@example.com', status: 'active', progress: 0 } as Props['students'][number]],
          editingStudentId: 'student-1',
          editStudentData: { name: 'Aluno Auditoria', email: 'email-invalido', phone: '', status: 'active', progress: '0' },
          handleUpdateStudent,
        })}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Salvar aluno' }) as HTMLButtonElement;

    expect(screen.getByText('Informe um email valido para atualizar aluno.')).toBeTruthy();
    expect(saveButton.disabled).toBe(true);

    fireEvent.click(saveButton);

    expect(handleUpdateStudent).not.toHaveBeenCalled();
  });

  it('distinguishes empty search results from no enrolled students', () => {
    render(
      <AreaMembrosStudentsPanel
        {...makeProps({
          showAddStudent: false,
          studentSearch: 'sem-match-codex',
          students: [],
        })}
      />,
    );

    expect(screen.getByText('Nenhum aluno encontrado')).toBeTruthy();
    expect(screen.getByText('Tente outro termo de busca.')).toBeTruthy();
  });

  it('requires confirmation before removing an enrolled student', () => {
    const handleRemoveStudent = vi.fn().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <AreaMembrosStudentsPanel
        {...makeProps({
          showAddStudent: false,
          students: [{ id: 'student-1', studentName: 'Aluno Auditoria', studentEmail: 'aluno@example.com', status: 'active', progress: 0 } as Props['students'][number]],
          handleRemoveStudent,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remover aluno' }));

    expect(confirmSpy).toHaveBeenCalledWith('Remover este aluno da area?');
    expect(handleRemoveStudent).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
