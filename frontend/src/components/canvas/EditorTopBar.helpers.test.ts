import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateModal } from './CreateModal';
import { EditorTopBar } from './EditorTopBar';
import {
  APPLY_BUTTON_STYLE,
  applyCustomDimensions,
  AVATAR_LABEL_STYLE,
  AVATAR_STYLE,
  buildDropdownTriggerStyle,
  CENTER_CONTAINER_STYLE,
  CUSTOM_DIMENSION_INPUT_STYLE,
  CUSTOM_DIMENSION_ROW_STYLE,
  CUSTOM_DIMENSION_SEPARATOR_STYLE,
  DESIGN_NAME_INPUT_STYLE,
  DROPDOWN_ITEM_STYLE,
  DROPDOWN_MENU_STYLE,
  DROPDOWN_SEPARATOR_STYLE,
  DROPDOWN_SHORTCUT_STYLE,
  MONO_FONT,
  parseCustomDimensions,
  RESIZE_DROPDOWN_MENU_STYLE,
  RESIZE_PRESETS,
  SAVING_DOT_STYLE,
  SAVING_LABEL_STYLE,
  SEPARATOR_COLOR,
  setRowBackground,
  SHARE_BUTTON_STYLE,
  SORA_FONT,
  TOOLBAR_CONTAINER_STYLE,
  TOOLBAR_ICON_BUTTON_STYLE,
} from './EditorTopBar.helpers';

const pushMock = vi.hoisted(() => vi.fn());
const canvasDesignsMock = vi.hoisted(() => ({
  useCanvasDesigns: vi.fn(() => ({ designs: [], loading: false, deleteDesign: vi.fn() })),
}));
const productTemplatesMock = vi.hoisted(() => ({
  useProductTemplates: vi.fn(() => ({ templates: [], isLoading: false, error: null })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/useCanvasDesigns', () => canvasDesignsMock);
vi.mock('@/hooks/useProductTemplates', () => productTemplatesMock);

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

describe('Canvas editor accessibility', () => {
  it('names the icon-only top bar actions', () => {
    render(
      React.createElement(EditorTopBar, {
        designName: 'Post Instagram (4:5)',
        onNameChange: vi.fn(),
        saving: false,
        onBack: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onExport: vi.fn(),
      }),
    );

    expect(screen.getByRole('button', { name: 'Voltar para o inicio do Canvas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refazer' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Nome do design' }).getAttribute('name')).toBe(
      'canvas-design-name',
    );
  });

  it('exposes a direct save action in the top bar', () => {
    const onSave = vi.fn();

    render(
      React.createElement(EditorTopBar, {
        designName: 'Post Instagram (4:5)',
        onNameChange: vi.fn(),
        saving: false,
        onBack: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onExport: vi.fn(),
        onSave,
      }),
    );

    const saveButton = screen.getByRole('button', { name: 'Salvar design' });
    expect(saveButton).toBeTruthy();
    saveButton.click();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('names the create modal dialog and close icon', () => {
    render(React.createElement(CreateModal, { open: true, onClose: vi.fn() }));

    expect(screen.getByRole('dialog', { name: 'Criar um design' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fechar painel de criacao de design' })).toBeTruthy();
    expect(
      screen.getByRole('textbox', { name: 'O que voce gostaria de criar' }).getAttribute('name'),
    ).toBe('canvas-create-search');
  });

  it('names the Canvas project library search field', async () => {
    const { default: CanvasProjetos } = await import('@/app/(main)/canvas/projetos/page');

    render(React.createElement(CanvasProjetos));

    expect(screen.getByRole('textbox', { name: 'Buscar projetos do Canvas' })).toBeTruthy();
  });

  it('names the Canvas AI model prompt field', async () => {
    const { default: CanvasModelos } = await import('@/app/(main)/canvas/modelos/page');

    render(React.createElement(CanvasModelos));

    expect(screen.getByRole('textbox', { name: 'Descrever modelo para gerar com IA' })).toBeTruthy();
  });
});

describe('parseCustomDimensions', () => {
  it('parses positive integers from string inputs', () => {
    expect(parseCustomDimensions('1080', '1920')).toEqual({ width: 1080, height: 1920 });
  });

  it('returns null when width is zero or negative', () => {
    expect(parseCustomDimensions('0', '100')).toBeNull();
    expect(parseCustomDimensions('-5', '100')).toBeNull();
  });

  it('returns null when height is zero or negative', () => {
    expect(parseCustomDimensions('100', '0')).toBeNull();
    expect(parseCustomDimensions('100', '-9')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseCustomDimensions('abc', '100')).toBeNull();
    expect(parseCustomDimensions('100', 'abc')).toBeNull();
    expect(parseCustomDimensions('', '')).toBeNull();
  });

  it('coerces decimal strings via parseInt (drops fraction)', () => {
    expect(parseCustomDimensions('100.9', '50.4')).toEqual({ width: 100, height: 50 });
  });
});

describe('applyCustomDimensions', () => {
  it('invokes onResize with parsed dimensions and returns true', () => {
    const onResize = vi.fn();
    const result = applyCustomDimensions('800', '600', onResize);
    expect(result).toBe(true);
    expect(onResize).toHaveBeenCalledWith(800, 600);
  });

  it('returns false and does not invoke onResize when input is invalid', () => {
    const onResize = vi.fn();
    expect(applyCustomDimensions('0', '600', onResize)).toBe(false);
    expect(applyCustomDimensions('abc', 'def', onResize)).toBe(false);
    expect(onResize).not.toHaveBeenCalled();
  });

  it('tolerates undefined onResize callback', () => {
    expect(applyCustomDimensions('100', '100')).toBe(true);
    expect(applyCustomDimensions('-1', '100')).toBe(false);
  });
});

describe('setRowBackground', () => {
  it('writes the given color onto the event currentTarget style', () => {
    const element = { style: { background: 'initial' } } as unknown as HTMLElement;
    const event = { currentTarget: element } as unknown as React.MouseEvent;
    setRowBackground(event, 'rgb(1,2,3)');
    expect(element.style.background).toBe('rgb(1,2,3)');
  });

  it('overwrites prior background on repeated calls', () => {
    const element = { style: { background: 'red' } } as unknown as HTMLElement;
    const event = { currentTarget: element } as unknown as React.MouseEvent;
    setRowBackground(event, 'blue');
    setRowBackground(event, 'none');
    expect(element.style.background).toBe('none');
  });
});

describe('buildDropdownTriggerStyle', () => {
  it('uses transparent background when closed and no icon layout', () => {
    const style = buildDropdownTriggerStyle(false);
    expect(style.background).toBe('none');
    expect(style.border).toBe('none');
    expect(style.cursor).toBe('pointer');
    expect(style.display).toBeUndefined();
    expect(style.alignItems).toBeUndefined();
    expect(style.gap).toBeUndefined();
  });

  it('switches background to the active border tone when open', () => {
    const closed = buildDropdownTriggerStyle(false);
    const open = buildDropdownTriggerStyle(true);
    expect(open.background).not.toBe(closed.background);
    expect(open.background).not.toBe('none');
  });

  it('adds flex layout when withIconLayout is true', () => {
    const style = buildDropdownTriggerStyle(false, true);
    expect(style.display).toBe('flex');
    expect(style.alignItems).toBe('center');
    expect(style.gap).toBe(4);
  });

  it('keeps shared typography for both layouts', () => {
    const plain = buildDropdownTriggerStyle(true);
    const withIcon = buildDropdownTriggerStyle(true, true);
    expect(plain.fontSize).toBe(12);
    expect(withIcon.fontSize).toBe(12);
    expect(plain.fontFamily).toBe(SORA_FONT);
    expect(withIcon.fontFamily).toBe(SORA_FONT);
    expect(plain.padding).toBe('4px 8px');
    expect(withIcon.borderRadius).toBe(4);
  });
});

describe('style constants', () => {
  it('exposes Sora and Mono font stacks with expected primary families', () => {
    expect(SORA_FONT).toContain('Sora');
    expect(MONO_FONT).toContain('JetBrains Mono');
  });

  it('TOOLBAR_CONTAINER_STYLE renders a 42px sticky-style flex row', () => {
    expect(TOOLBAR_CONTAINER_STYLE.height).toBe(42);
    expect(TOOLBAR_CONTAINER_STYLE.display).toBe('flex');
    expect(TOOLBAR_CONTAINER_STYLE.alignItems).toBe('center');
    expect(TOOLBAR_CONTAINER_STYLE.flexShrink).toBe(0);
    expect(TOOLBAR_CONTAINER_STYLE.gap).toBe(6);
  });

  it('TOOLBAR_ICON_BUTTON_STYLE is a transparent icon-only button', () => {
    expect(TOOLBAR_ICON_BUTTON_STYLE.background).toBe('none');
    expect(TOOLBAR_ICON_BUTTON_STYLE.border).toBe('none');
    expect(TOOLBAR_ICON_BUTTON_STYLE.cursor).toBe('pointer');
    expect(TOOLBAR_ICON_BUTTON_STYLE.padding).toBe(4);
  });

  it('DROPDOWN_MENU_STYLE positions absolutely below its trigger', () => {
    expect(DROPDOWN_MENU_STYLE.position).toBe('absolute');
    expect(DROPDOWN_MENU_STYLE.top).toBe('100%');
    expect(DROPDOWN_MENU_STYLE.left).toBe(0);
    expect(DROPDOWN_MENU_STYLE.marginTop).toBe(4);
    expect(DROPDOWN_MENU_STYLE.zIndex).toBe(100);
    expect(DROPDOWN_MENU_STYLE.minWidth).toBe(220);
  });

  it('RESIZE_DROPDOWN_MENU_STYLE widens the base menu', () => {
    expect(RESIZE_DROPDOWN_MENU_STYLE.minWidth).toBe(260);
    expect(RESIZE_DROPDOWN_MENU_STYLE.position).toBe('absolute');
    // Other fields inherited
    expect(RESIZE_DROPDOWN_MENU_STYLE.zIndex).toBe(DROPDOWN_MENU_STYLE.zIndex);
  });

  it('DROPDOWN_ITEM_STYLE renders a left-aligned 11px Sora row', () => {
    expect(DROPDOWN_ITEM_STYLE.display).toBe('flex');
    expect(DROPDOWN_ITEM_STYLE.justifyContent).toBe('space-between');
    expect(DROPDOWN_ITEM_STYLE.textAlign).toBe('left');
    expect(DROPDOWN_ITEM_STYLE.fontSize).toBe(11);
    expect(DROPDOWN_ITEM_STYLE.fontFamily).toBe(SORA_FONT);
  });

  it('DROPDOWN_SHORTCUT_STYLE is a monospaced micro-label', () => {
    expect(DROPDOWN_SHORTCUT_STYLE.fontSize).toBe(9);
    expect(DROPDOWN_SHORTCUT_STYLE.fontFamily).toBe(MONO_FONT);
    expect(DROPDOWN_SHORTCUT_STYLE.marginLeft).toBe(16);
  });

  it('DROPDOWN_SEPARATOR_STYLE is a hairline divider', () => {
    expect(DROPDOWN_SEPARATOR_STYLE.height).toBe(1);
    expect(DROPDOWN_SEPARATOR_STYLE.margin).toBe('4px 0');
  });

  it('CUSTOM_DIMENSION_ROW_STYLE is a centered flex row with 6px gap', () => {
    expect(CUSTOM_DIMENSION_ROW_STYLE.display).toBe('flex');
    expect(CUSTOM_DIMENSION_ROW_STYLE.alignItems).toBe('center');
    expect(CUSTOM_DIMENSION_ROW_STYLE.gap).toBe(6);
    expect(CUSTOM_DIMENSION_ROW_STYLE.padding).toBe('8px 12px');
  });

  it('CUSTOM_DIMENSION_INPUT_STYLE constrains width and uses Mono', () => {
    expect(CUSTOM_DIMENSION_INPUT_STYLE.width).toBe(60);
    expect(CUSTOM_DIMENSION_INPUT_STYLE.fontFamily).toBe(MONO_FONT);
    expect(CUSTOM_DIMENSION_INPUT_STYLE.outline).toBe('none');
  });

  it('CUSTOM_DIMENSION_SEPARATOR_STYLE is the dim "x" glyph', () => {
    expect(CUSTOM_DIMENSION_SEPARATOR_STYLE.fontSize).toBe(11);
    expect(typeof CUSTOM_DIMENSION_SEPARATOR_STYLE.color).toBe('string');
  });

  it('APPLY_BUTTON_STYLE is a bold ember CTA', () => {
    expect(APPLY_BUTTON_STYLE.fontWeight).toBe(700);
    expect(APPLY_BUTTON_STYLE.fontFamily).toBe(SORA_FONT);
    expect(APPLY_BUTTON_STYLE.cursor).toBe('pointer');
    expect(APPLY_BUTTON_STYLE.borderRadius).toBe(4);
  });

  it('CENTER_CONTAINER_STYLE fills remaining space and centers content', () => {
    expect(CENTER_CONTAINER_STYLE.flex).toBe(1);
    expect(CENTER_CONTAINER_STYLE.justifyContent).toBe('center');
    expect(CENTER_CONTAINER_STYLE.gap).toBe(8);
    expect(CENTER_CONTAINER_STYLE.textAlign).toBe('center');
  });

  it('DESIGN_NAME_INPUT_STYLE is a transparent center-aligned input', () => {
    expect(DESIGN_NAME_INPUT_STYLE.background).toBe('none');
    expect(DESIGN_NAME_INPUT_STYLE.border).toBe('none');
    expect(DESIGN_NAME_INPUT_STYLE.textAlign).toBe('center');
    expect(DESIGN_NAME_INPUT_STYLE.maxWidth).toBe(280);
  });

  it('SAVING_LABEL_STYLE / SAVING_DOT_STYLE describe the pulsing status', () => {
    expect(SAVING_LABEL_STYLE.fontSize).toBe(9);
    expect(SAVING_LABEL_STYLE.fontFamily).toBe(MONO_FONT);
    expect(SAVING_DOT_STYLE.width).toBe(5);
    expect(SAVING_DOT_STYLE.height).toBe(5);
    expect(SAVING_DOT_STYLE.animation).toContain('1.5s');
    expect(SAVING_DOT_STYLE.display).toBe('inline-block');
  });

  it('AVATAR_STYLE / AVATAR_LABEL_STYLE describe a 28px badge with bold initials', () => {
    expect(AVATAR_STYLE.width).toBe(28);
    expect(AVATAR_STYLE.height).toBe(28);
    expect(AVATAR_STYLE.borderRadius).toBe(6);
    expect(AVATAR_LABEL_STYLE.fontWeight).toBe(700);
    expect(AVATAR_LABEL_STYLE.fontFamily).toBe(MONO_FONT);
    expect(AVATAR_LABEL_STYLE.fontSize).toBe(11);
  });

  it('SHARE_BUTTON_STYLE is a primary right-aligned CTA', () => {
    expect(SHARE_BUTTON_STYLE.fontWeight).toBe(700);
    expect(SHARE_BUTTON_STYLE.padding).toBe('6px 14px');
    expect(SHARE_BUTTON_STYLE.display).toBe('flex');
    expect(SHARE_BUTTON_STYLE.marginLeft).toBe(4);
  });

  it('SEPARATOR_COLOR is a non-empty token string', () => {
    expect(typeof SEPARATOR_COLOR).toBe('string');
    expect(SEPARATOR_COLOR.length).toBeGreaterThan(0);
  });
});

describe('RESIZE_PRESETS', () => {
  it('exposes six immutable presets in the documented order', () => {
    expect(RESIZE_PRESETS).toHaveLength(6);
    expect(RESIZE_PRESETS[0]?.l).toBe('Post Instagram (4:5)');
    expect(RESIZE_PRESETS[0]?.w).toBe(1080);
    expect(RESIZE_PRESETS[0]?.h).toBe(1350);
  });

  it('contains the square preset at the tail', () => {
    const last = RESIZE_PRESETS[RESIZE_PRESETS.length - 1];
    expect(last?.l).toBe('Quadrado');
    expect(last?.w).toBe(1080);
    expect(last?.h).toBe(1080);
  });

  it('uses positive dimensions for every preset', () => {
    for (const preset of RESIZE_PRESETS) {
      expect(preset.w).toBeGreaterThan(0);
      expect(preset.h).toBeGreaterThan(0);
      expect(typeof preset.l).toBe('string');
    }
  });
});
