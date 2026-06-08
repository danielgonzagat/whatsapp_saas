import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AreaMembros from './ProdutosAreaMembrosTab';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/hooks/useResponsiveViewport', () => ({
  useResponsiveViewport: () => ({ isMobile: false }),
}));

vi.mock('@/hooks/useMemberAreas', () => ({
  useMemberAreaMutations: () => ({
    createArea: vi.fn().mockResolvedValue(undefined),
    updateArea: vi.fn().mockResolvedValue(undefined),
    deleteArea: vi.fn().mockResolvedValue(undefined),
    createModule: vi.fn().mockResolvedValue(undefined),
    updateModule: vi.fn().mockResolvedValue(undefined),
    deleteModule: vi.fn().mockResolvedValue(undefined),
    createLesson: vi.fn().mockResolvedValue(undefined),
    updateLesson: vi.fn().mockResolvedValue(undefined),
    deleteLesson: vi.fn().mockResolvedValue(undefined),
  }),
}));

type Props = Parameters<typeof AreaMembros>[0];

function makeArea(): Props['displayAreas'][number] {
  return {
    id: 'area-1',
    name: 'Area Teste',
    slug: 'area-teste',
    type: 'COURSE',
    students: 0,
    modules: 0,
    modules_list: [],
    active: true,
  } as unknown as Props['displayAreas'][number];
}

describe('AreaMembros student navigation', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ data: { students: [] }, error: null });
  });

  it('marks the active member-area subtab with aria-pressed', () => {
    render(
      <AreaMembros
        totalStudents={0}
        displayAreas={[makeArea()]}
        avgCompletion={0}
        mutateAreas={vi.fn()}
        productOptions={[]}
      />,
    );

    const overviewTab = screen.getByRole('button', { name: 'Visao Geral' });
    const studentsTab = screen.getByRole('button', { name: 'Alunos' });

    expect(overviewTab.getAttribute('aria-pressed')).toBe('true');
    expect(studentsTab.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(studentsTab);

    expect(overviewTab.getAttribute('aria-pressed')).toBe('false');
    expect(studentsTab.getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the student drawer from the area list manage-students CTA', async () => {
    render(
      <AreaMembros
        totalStudents={0}
        displayAreas={[makeArea()]}
        avgCompletion={0}
        mutateAreas={vi.fn()}
        productOptions={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Areas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar alunos' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/member-areas/area-1/students');
    });
    expect(await screen.findByRole('button', { name: 'Fechar painel de alunos' })).toBeTruthy();
    expect(screen.getByText('Area Teste')).toBeTruthy();
  });

  it('exposes the member area preview link with a usable accessible name', () => {
    render(
      <AreaMembros
        totalStudents={0}
        displayAreas={[makeArea()]}
        avgCompletion={0}
        mutateAreas={vi.fn()}
        productOptions={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Areas' }));

    const previewLink = screen.getByRole('link', { name: 'Pre-visualizar area Area Teste' });

    expect(previewLink.getAttribute('href')).toBe('/produtos/area-membros/preview/area-1');
  });

  it('debounces student search requests instead of fetching on every keystroke', async () => {
    render(
      <AreaMembros
        totalStudents={0}
        displayAreas={[makeArea()]}
        avgCompletion={0}
        mutateAreas={vi.fn()}
        productOptions={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Areas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar alunos' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/member-areas/area-1/students');
    });
    apiFetchMock.mockClear();

    fireEvent.change(screen.getByLabelText('Buscar aluno'), { target: { value: 'Valido' } });

    expect(apiFetchMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/member-areas/area-1/students?q=Valido');
    });
  });


  it('waits through normal typing gaps before requesting the final student search', async () => {
    render(
      <AreaMembros
        totalStudents={0}
        displayAreas={[makeArea()]}
        avgCompletion={0}
        mutateAreas={vi.fn()}
        productOptions={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Areas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar alunos' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/member-areas/area-1/students');
    });
    apiFetchMock.mockClear();

    fireEvent.change(screen.getByLabelText('Buscar aluno'), { target: { value: 'V' } });
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(apiFetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Buscar aluno'), { target: { value: 'Va' } });
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(apiFetchMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/member-areas/area-1/students?q=Va');
    });
    expect(apiFetchMock).not.toHaveBeenCalledWith('/member-areas/area-1/students?q=V');
  });
  it('cancels a pending student search when the drawer closes', async () => {
    render(
      <AreaMembros
        totalStudents={0}
        displayAreas={[makeArea()]}
        avgCompletion={0}
        mutateAreas={vi.fn()}
        productOptions={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Areas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar alunos' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/member-areas/area-1/students');
    });
    apiFetchMock.mockClear();

    fireEvent.change(screen.getByLabelText('Buscar aluno'), { target: { value: 'Valido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel de alunos' }));

    await new Promise((resolve) => setTimeout(resolve, 320));

    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
