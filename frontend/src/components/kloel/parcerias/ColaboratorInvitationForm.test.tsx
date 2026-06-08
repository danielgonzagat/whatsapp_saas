import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ColaboratorInvitationForm from './ColaboratorInvitationForm';
import ColaboratorSearchToolbar from './ColaboratorSearchToolbar';

const inviteCollaboratorMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/usePartnerships', () => ({
  inviteCollaborator: inviteCollaboratorMock,
}));

beforeEach(() => {
  inviteCollaboratorMock.mockReset();
});

describe('ColaboratorInvitationForm', () => {
  it('names collaborator search and invite email fields for browser audits', () => {
    render(<ColaboratorSearchToolbar search="" setSearch={vi.fn()} onInvite={vi.fn()} />);
    render(<ColaboratorInvitationForm onClose={vi.fn()} />);

    const search = screen.getByLabelText('Buscar colaborador');
    const email = screen.getByLabelText('Email do colaborador');

    expect(search.getAttribute('id')).toBe('collaborator-search');
    expect(search.getAttribute('name')).toBe('collaboratorSearch');
    expect(email.getAttribute('name')).toBe('collaboratorInviteEmail');
  });

  it('blocks invalid emails before inviting collaborators', () => {
    const onClose = vi.fn();
    render(<ColaboratorInvitationForm onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Email do colaborador'), {
      target: { value: 'email-invalido' },
    });

    const submit = screen.getByRole('button', { name: 'Enviar Convite' }) as HTMLButtonElement;

    expect(submit.disabled).toBe(true);
    expect(screen.getByText('Informe um email valido para enviar o convite.')).toBeTruthy();

    fireEvent.click(submit);
    expect(inviteCollaboratorMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('invites a valid email and closes the modal', async () => {
    const onClose = vi.fn();
    inviteCollaboratorMock.mockResolvedValueOnce(undefined);
    render(<ColaboratorInvitationForm onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Email do colaborador'), {
      target: { value: 'novo@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() =>
      expect(inviteCollaboratorMock).toHaveBeenCalledWith({ email: 'novo@example.com', role: 'manager' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
