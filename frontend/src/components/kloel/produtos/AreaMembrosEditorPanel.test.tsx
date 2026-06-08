import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AreaMembrosEditorPanel from './AreaMembrosEditorPanel';

type Props = Parameters<typeof AreaMembrosEditorPanel>[0];

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    displayAreas: [],
    productOptions: [],
    saving: false,
    showCreateArea: true,
    setShowCreateArea: vi.fn(),
    newArea: { name: '', type: 'COURSE', productId: '' },
    setNewArea: vi.fn(),
    handleCreateArea: vi.fn().mockResolvedValue(undefined),
    emptyAreaForm: { name: '', type: 'COURSE', productId: '' },
    editingArea: null,
    setEditingArea: vi.fn(),
    editAreaData: {},
    setEditAreaData: vi.fn(),
    handleUpdateArea: vi.fn().mockResolvedValue(undefined),
    handleDeleteArea: vi.fn().mockResolvedValue(undefined),
    editingModule: null,
    setEditingModule: vi.fn(),
    editModuleData: { name: '' },
    setEditModuleData: vi.fn(),
    handleUpdateModule: vi.fn().mockResolvedValue(undefined),
    handleDeleteModule: vi.fn().mockResolvedValue(undefined),
    creatingModule: null,
    setCreatingModule: vi.fn(),
    newModule: { name: '' },
    setNewModule: vi.fn(),
    handleCreateModule: vi.fn().mockResolvedValue(undefined),
    editingLesson: null,
    setEditingLesson: vi.fn(),
    editLessonData: { name: '', description: '', videoUrl: '' },
    setEditLessonData: vi.fn(),
    handleUpdateLesson: vi.fn().mockResolvedValue(undefined),
    handleDeleteLesson: vi.fn().mockResolvedValue(undefined),
    creatingLesson: null,
    setCreatingLesson: vi.fn(),
    newLesson: { name: '', description: '', videoUrl: '' },
    setNewLesson: vi.fn(),
    handleCreateLesson: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Props;
}

describe('AreaMembrosEditorPanel', () => {
  it('blocks empty member-area creation before calling the submit handler', () => {
    const handleCreateArea = vi.fn().mockResolvedValue(undefined);

    render(<AreaMembrosEditorPanel {...makeProps({ handleCreateArea })} />);

    const createButton = screen.getByRole('button', { name: 'Criar' }) as HTMLButtonElement;

    expect(screen.getByText('Informe um nome para criar a area.')).toBeTruthy();
    expect(createButton.disabled).toBe(true);

    fireEvent.click(createButton);

    expect(handleCreateArea).not.toHaveBeenCalled();
  });

  it('allows member-area creation when the name is present', () => {
    const handleCreateArea = vi.fn().mockResolvedValue(undefined);

    render(
      <AreaMembrosEditorPanel
        {...makeProps({ handleCreateArea, newArea: { name: 'Area Auditoria', type: 'COURSE' } })}
      />,
    );

    const createButton = screen.getByRole('button', { name: 'Criar' }) as HTMLButtonElement;

    expect(createButton.disabled).toBe(false);

    fireEvent.click(createButton);

    expect(handleCreateArea).toHaveBeenCalledTimes(1);
  });

  it('connects new-area labels to their controls', () => {
    render(<AreaMembrosEditorPanel {...makeProps()} />);

    const expectedLabels = [
      ['Nome', 'member-area-new-name'],
      ['Tipo', 'member-area-new-type'],
      ['Produto', 'member-area-new-product'],
    ];

    for (const [text, id] of expectedLabels) {
      const label = screen.getByText(text).closest('label') as HTMLLabelElement;
      expect(label.htmlFor).toBe(id);
      expect(document.getElementById(id)).toBeTruthy();
    }
  });

  it('hydrates the edit form when selecting an existing area', () => {
    const setEditingArea = vi.fn();
    const setEditAreaData = vi.fn();
    const displayAreas = [
      {
        id: 'area-1',
        name: 'Area Existente',
        slug: 'area-existente',
        description: 'Conteudo principal',
        type: 'COURSE',
        productId: 'product-1',
        template: 'academy',
        active: true,
      },
    ] as unknown as Props['displayAreas'];

    render(
      <AreaMembrosEditorPanel
        {...makeProps({
          setEditingArea,
          setEditAreaData,
          displayAreas,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText('Selecionar area para editar'), {
      target: { value: 'area-1' },
    });

    expect(setEditingArea).toHaveBeenCalledWith('area-1');
    expect(setEditAreaData).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Area Existente',
        slug: 'area-existente',
        description: 'Conteudo principal',
        type: 'COURSE',
        productId: 'product-1',
        active: true,
      }),
    );
  });

  it('blocks empty module creation before calling the submit handler', () => {
    const handleCreateModule = vi.fn().mockResolvedValue(undefined);
    const displayAreas = [{ id: 'area-1', name: 'Area Existente', modules_list: [] }] as unknown as Props['displayAreas'];

    render(
      <AreaMembrosEditorPanel
        {...makeProps({
          displayAreas,
          editingArea: 'area-1',
          showCreateArea: false,
          creatingModule: 'area-1',
          newModule: { name: '' },
          handleCreateModule,
        })}
      />,
    );

    const createButton = screen.getByRole('button', { name: 'Criar' }) as HTMLButtonElement;

    expect(screen.getByText('Informe um nome para criar o modulo.')).toBeTruthy();
    expect(createButton.disabled).toBe(true);

    fireEvent.click(createButton);

    expect(handleCreateModule).not.toHaveBeenCalled();
  });

  it('blocks empty lesson creation before calling the submit handler', () => {
    const handleCreateLesson = vi.fn().mockResolvedValue(undefined);
    const displayAreas = [
      {
        id: 'area-1',
        name: 'Area Existente',
        modules_list: [{ id: 'module-1', name: 'Modulo 1', lessons: [] }],
      },
    ] as unknown as Props['displayAreas'];

    render(
      <AreaMembrosEditorPanel
        {...makeProps({
          displayAreas,
          editingArea: 'area-1',
          showCreateArea: false,
          creatingLesson: 'module-1',
          newLesson: { name: '', description: '', videoUrl: '' },
          handleCreateLesson,
        })}
      />,
    );

    const addButton = screen.getByRole('button', { name: 'Adicionar' }) as HTMLButtonElement;

    expect(screen.getByText('Informe um nome para adicionar a aula.')).toBeTruthy();
    expect(addButton.disabled).toBe(true);

    fireEvent.click(addButton);

    expect(handleCreateLesson).not.toHaveBeenCalled();
  });

  it('adds stable name attributes to visible editor fields', () => {
    const displayAreas = [
      {
        id: 'area-1',
        name: 'Area Existente',
        slug: 'area-existente',
        description: 'Conteudo principal',
        type: 'COURSE',
        productId: 'product-1',
        modules_list: [],
      },
    ] as unknown as Props['displayAreas'];
    const productOptions = [{ id: 'product-1', name: 'Produto 1' }] as unknown as Props['productOptions'];

    render(
      <AreaMembrosEditorPanel
        {...makeProps({
          displayAreas,
          editingArea: 'area-1',
          showCreateArea: false,
          productOptions,
          editAreaData: {
            name: 'Area Existente',
            slug: 'area-existente',
            description: 'Conteudo principal',
            type: 'COURSE',
            productId: 'product-1',
          },
        })}
      />,
    );

    const expectedNames = [
      ['Selecionar area para editar', 'member-area-editor-select'],
      ['Nome da area', 'member-area-edit-name'],
      ['Tipo da area', 'member-area-edit-type'],
      ['Produto vinculado da area', 'member-area-edit-product'],
      ['Slug', 'member-area-edit-slug'],
      ['Descricao', 'member-area-edit-description'],
    ];

    for (const [label, name] of expectedNames) {
      expect(screen.getByLabelText(label).getAttribute('name')).toBe(name);
    }
  });

  it('exposes real resource toggles when creating a member area', () => {
    const setNewArea = vi.fn();

    render(
      <AreaMembrosEditorPanel
        {...makeProps({
          setNewArea,
          newArea: {
            name: 'Area Auditoria',
            type: 'COURSE',
            productId: '',
            certificates: true,
            community: false,
          },
        })}
      />,
    );

    const certificates = screen.getByRole('checkbox', { name: 'Certificados' }) as HTMLInputElement;
    const community = screen.getByRole('checkbox', { name: 'Comunidade' }) as HTMLInputElement;

    expect(certificates.checked).toBe(true);
    expect(community.checked).toBe(false);

    fireEvent.click(community);

    const updateCommunity = setNewArea.mock.calls[0][0] as (prev: Record<string, unknown>) => Record<string, unknown>;
    expect(updateCommunity({ community: false })).toMatchObject({ community: true });
  });

  it('exposes real resource toggles when editing a member area', () => {
    const setEditAreaData = vi.fn();
    const displayAreas = [
      {
        id: 'area-1',
        name: 'Area Existente',
        type: 'COURSE',
        productId: '',
        certificates: true,
        community: false,
        modules_list: [],
      },
    ] as unknown as Props['displayAreas'];

    render(
      <AreaMembrosEditorPanel
        {...makeProps({
          displayAreas,
          editingArea: 'area-1',
          showCreateArea: false,
          setEditAreaData,
          editAreaData: {
            name: 'Area Existente',
            type: 'COURSE',
            productId: '',
            certificates: true,
            community: false,
          },
        })}
      />,
    );

    const community = screen.getByRole('checkbox', { name: 'Comunidade' }) as HTMLInputElement;

    expect(community.checked).toBe(false);

    fireEvent.click(community);

    const updateCommunity = setEditAreaData.mock.calls[0][0] as (prev: Record<string, unknown>) => Record<string, unknown>;
    expect(updateCommunity({ community: false })).toMatchObject({ community: true });
  });
});
