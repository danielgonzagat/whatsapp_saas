'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { useEffect, useState } from 'react';
import { IC } from './CanvasIcons';
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
  RESIZE_DROPDOWN_MENU_STYLE,
  RESIZE_PRESETS,
  SAVING_DOT_STYLE,
  SAVING_LABEL_STYLE,
  SEPARATOR_COLOR,
  setRowBackground,
  SHARE_BUTTON_STYLE,
  TOOLBAR_CONTAINER_STYLE,
  TOOLBAR_ICON_BUTTON_STYLE,
  type DropdownId,
} from './EditorTopBar.helpers';

interface EditorTopBarProps {
  designName: string;
  onNameChange: (name: string) => void;
  saving: boolean;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport?: (format: 'png' | 'jpg' | 'svg' | 'pdf') => void;
  onSave?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onSelectAll?: () => void;
  onResize?: (w: number, h: number) => void;
}

/** Editor top bar. */
export function EditorTopBar({
  designName,
  onNameChange,
  saving,
  onBack,
  onUndo,
  onRedo,
  onExport,
  onSave,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onSelectAll,
  onResize,
}: EditorTopBarProps) {
  const [dropdown, setDropdown] = useState<DropdownId>(null);
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdown) {
      return;
    }
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown]')) {
        setDropdown(null);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [dropdown]);

  const toggleDropdown = (id: DropdownId) => setDropdown((prev) => (prev === id ? null : id));

  const handleItemHover = (e: React.MouseEvent) =>
    setRowBackground(e, colors.canvas.border);
  const handleItemLeave = (e: React.MouseEvent) => setRowBackground(e, 'none');

  const closeAndRun = (fn?: () => void) => {
    setDropdown(null);
    fn?.();
  };

  return (
    <div style={TOOLBAR_CONTAINER_STYLE}>
      {/* Home */}
      <button
        type="button"
        aria-label={kloelT('Voltar para o inicio do Canvas')}
        onClick={onBack}
        style={TOOLBAR_ICON_BUTTON_STYLE}
      >
        {IC.home(16)}
      </button>
      <span style={{ color: SEPARATOR_COLOR }}>|</span>

      {/* ── Arquivo dropdown ── */}
      <div style={{ position: 'relative' }} data-dropdown>
        <button
          type="button"
          onClick={() => toggleDropdown('file')}
          style={buildDropdownTriggerStyle(dropdown === 'file')}
        >
          {kloelT(`Arquivo`)}
        </button>
        {dropdown === 'file' && (
          <div style={DROPDOWN_MENU_STYLE}>
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() =>
                closeAndRun(() => {
                  window.location.href = '/canvas/inicio';
                })
              }
            >
              {kloelT(`Novo design`)}
            </button>
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onSave)}
            >
              <span>{kloelT(`Salvar agora`)}</span>
              <span style={DROPDOWN_SHORTCUT_STYLE}>{kloelT(`⌘S`)}</span>
            </button>
            <div style={DROPDOWN_SEPARATOR_STYLE} />
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(() => onExport?.('png'))}
            >
              <span>{kloelT(`Download PNG`)}</span>
            </button>
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(() => onExport?.('jpg'))}
            >
              <span>{kloelT(`Download JPG`)}</span>
            </button>
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(() => onExport?.('svg'))}
            >
              <span>{kloelT(`Download SVG`)}</span>
            </button>
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(() => onExport?.('pdf'))}
            >
              <span>{kloelT(`Download PDF`)}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Redimensionar dropdown ── */}
      <div style={{ position: 'relative' }} data-dropdown>
        <button
          type="button"
          onClick={() => toggleDropdown('resize')}
          style={buildDropdownTriggerStyle(dropdown === 'resize', true)}
        >
          {IC.resize(12)} {kloelT(`Redimensionar`)}
        </button>
        {dropdown === 'resize' && (
          <div style={RESIZE_DROPDOWN_MENU_STYLE}>
            {RESIZE_PRESETS.map((p) => (
              <button
                type="button"
                key={p.l}
                style={DROPDOWN_ITEM_STYLE}
                onMouseEnter={handleItemHover}
                onMouseLeave={handleItemLeave}
                onClick={() => closeAndRun(() => onResize?.(p.w, p.h))}
              >
                <span>{p.l}</span>
                <span style={DROPDOWN_SHORTCUT_STYLE}>
                  {p.w}x{p.h}
                </span>
              </button>
            ))}
            <div style={DROPDOWN_SEPARATOR_STYLE} />
            <div style={CUSTOM_DIMENSION_ROW_STYLE}>
              <input
                aria-label={kloelT(`Largura personalizada`)}
                type="number"
                placeholder={kloelT(`L`)}
                value={customW}
                onChange={(e) => setCustomW(e.target.value)}
                style={CUSTOM_DIMENSION_INPUT_STYLE}
                onClick={(e) => e.stopPropagation()}
              />
              <span style={CUSTOM_DIMENSION_SEPARATOR_STYLE}>x</span>
              <input
                aria-label={kloelT(`Altura personalizada`)}
                type="number"
                placeholder={kloelT(`A`)}
                value={customH}
                onChange={(e) => setCustomH(e.target.value)}
                style={CUSTOM_DIMENSION_INPUT_STYLE}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={() => {
                  if (applyCustomDimensions(customW, customH, onResize)) {
                    setDropdown(null);
                  }
                }}
                style={APPLY_BUTTON_STYLE}
              >
                {kloelT(`Aplicar`)}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Edicao dropdown ── */}
      <div style={{ position: 'relative' }} data-dropdown>
        <button
          type="button"
          onClick={() => toggleDropdown('edit')}
          style={buildDropdownTriggerStyle(dropdown === 'edit', true)}
        >
          {IC.edit(12)} {kloelT(`Edicao`)} {IC.down(8)}
        </button>
        {dropdown === 'edit' && (
          <div style={DROPDOWN_MENU_STYLE}>
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onUndo)}
            >
              <span>{kloelT(`Desfazer`)}</span>
              <span style={DROPDOWN_SHORTCUT_STYLE}>{kloelT(`⌘Z`)}</span>
            </button>
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onRedo)}
            >
              <span>{kloelT(`Refazer`)}</span>
              <span style={DROPDOWN_SHORTCUT_STYLE}>{kloelT(`⇧⌘Z`)}</span>
            </button>
            <div style={DROPDOWN_SEPARATOR_STYLE} />
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onCopy)}
            >
              <span>{kloelT(`Copiar`)}</span>
              <span style={DROPDOWN_SHORTCUT_STYLE}>{kloelT(`⌘C`)}</span>
            </button>
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onPaste)}
            >
              <span>{kloelT(`Colar`)}</span>
              <span style={DROPDOWN_SHORTCUT_STYLE}>{kloelT(`⌘V`)}</span>
            </button>
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onDuplicate)}
            >
              <span>{kloelT(`Duplicar`)}</span>
              <span style={DROPDOWN_SHORTCUT_STYLE}>{kloelT(`⌘D`)}</span>
            </button>
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onDelete)}
            >
              <span>{kloelT(`Excluir`)}</span>
              <span style={DROPDOWN_SHORTCUT_STYLE}>⌫</span>
            </button>
            <div style={DROPDOWN_SEPARATOR_STYLE} />
            <button
              type="button"
              style={DROPDOWN_ITEM_STYLE}
              onMouseEnter={handleItemHover}
              onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onSelectAll)}
            >
              <span>{kloelT(`Selecionar tudo`)}</span>
              <span style={DROPDOWN_SHORTCUT_STYLE}>{kloelT(`⌘A`)}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Center: design name + save status ── */}
      <div style={CENTER_CONTAINER_STYLE}>
        <input
          id="canvas-design-name"
          name="canvas-design-name"
          aria-label={kloelT(`Nome do design`)}
          value={designName}
          onChange={(e) => onNameChange(e.target.value)}
          style={DESIGN_NAME_INPUT_STYLE}
        />
        <button
          type="button"
          aria-label={kloelT('Salvar design')}
          onClick={onSave}
          disabled={!onSave || saving}
          style={{
            ...buildDropdownTriggerStyle(false, true),
            border: `1px solid ${saving ? colors.canvas.border : `${colors.ember.primary}66`}`,
            color: saving ? colors.text.dim : colors.ember.primary,
            cursor: saving ? 'progress' : 'pointer',
            opacity: onSave ? 1 : 0.5,
          }}
        >
          {IC.file(12)} {saving ? kloelT(`Salvando...`) : kloelT(`Salvar`)}
        </button>
        {saving && (
          <span style={SAVING_LABEL_STYLE}>
            <span style={SAVING_DOT_STYLE} />

            {kloelT(`Salvando...`)}
          </span>
        )}
      </div>

      {/* ── Undo / Redo ── */}
      <button
        type="button"
        aria-label={kloelT('Desfazer')}
        onClick={onUndo}
        style={TOOLBAR_ICON_BUTTON_STYLE}
      >
        {IC.undo(14)}
      </button>
      <button
        type="button"
        aria-label={kloelT('Refazer')}
        onClick={onRedo}
        style={TOOLBAR_ICON_BUTTON_STYLE}
      >
        {IC.redo(14)}
      </button>

      {/* ── Avatar ── */}
      <div style={AVATAR_STYLE}>
        <span style={AVATAR_LABEL_STYLE}>DG</span>
      </div>

      {/* ── Share/Export ── */}
      <button type="button" onClick={() => onExport?.('png')} style={SHARE_BUTTON_STYLE}>
        {IC.share(12)} {kloelT(`Compartilhar`)}
      </button>
    </div>
  );
}
