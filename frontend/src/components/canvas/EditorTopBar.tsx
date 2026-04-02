'use client';

import { useState, useEffect } from 'react';
import { IC } from './CanvasIcons';

const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/* ═══ Resize presets ═══ */
const RESIZE_PRESETS = [
  { l: 'Post Instagram (4:5)', w: 1080, h: 1350 },
  { l: 'Story Instagram', w: 1080, h: 1920 },
  { l: 'Post Facebook', w: 1200, h: 628 },
  { l: 'Post LinkedIn', w: 1200, h: 627 },
  { l: 'Miniatura YouTube', w: 1280, h: 720 },
  { l: 'Quadrado', w: 1080, h: 1080 },
];

/* ═══ Dropdown item styles ═══ */
const ddMenu: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, marginTop: 4,
  background: '#111113', border: '1px solid #1C1C1F', borderRadius: 6,
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: '4px 0',
  minWidth: 220, zIndex: 100,
};
const ddItem: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  width: '100%', padding: '7px 12px', background: 'none', border: 'none',
  fontSize: 11, fontFamily: S, color: '#E0DDD8', cursor: 'pointer',
  textAlign: 'left', transition: 'background 100ms',
};
const ddShortcut: React.CSSProperties = {
  fontSize: 9, fontFamily: M, color: '#3A3A3F', marginLeft: 16,
};
const ddSep: React.CSSProperties = {
  height: 1, background: '#1C1C1F', margin: '4px 0',
};

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

type DropdownId = 'file' | 'resize' | 'edit' | null;

export function EditorTopBar({
  designName, onNameChange, saving, onBack, onUndo, onRedo,
  onExport, onSave, onCopy, onPaste, onDuplicate, onDelete, onSelectAll, onResize,
}: EditorTopBarProps) {
  const [dropdown, setDropdown] = useState<DropdownId>(null);
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdown) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown]')) setDropdown(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [dropdown]);

  const toggleDropdown = (id: DropdownId) => setDropdown(prev => prev === id ? null : id);

  const handleItemHover = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.background = '#1C1C1F';
  };
  const handleItemLeave = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.background = 'none';
  };

  const closeAndRun = (fn?: () => void) => {
    setDropdown(null);
    fn?.();
  };

  return (
    <div style={{
      height: 42, background: '#111113', borderBottom: '1px solid #1C1C1F',
      display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, flexShrink: 0,
    }}>
      {/* Home */}
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', display: 'flex', padding: 4,
      }}>
        {IC.home(16)}
      </button>
      <span style={{ color: '#2A2A2E' }}>|</span>

      {/* ── Arquivo dropdown ── */}
      <div style={{ position: 'relative' }} data-dropdown>
        <button
          onClick={() => toggleDropdown('file')}
          style={{
            background: dropdown === 'file' ? '#1C1C1F' : 'none', border: 'none',
            color: '#E0DDD8', fontSize: 12, fontFamily: S, cursor: 'pointer',
            padding: '4px 8px', borderRadius: 4,
          }}
        >
          Arquivo
        </button>
        {dropdown === 'file' && (
          <div style={ddMenu}>
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(() => { window.location.href = '/canvas/inicio'; })}>
              Novo design
            </button>
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onSave)}>
              <span>Salvar agora</span><span style={ddShortcut}>⌘S</span>
            </button>
            <div style={ddSep} />
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(() => onExport?.('png'))}>
              <span>Download PNG</span>
            </button>
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(() => onExport?.('jpg'))}>
              <span>Download JPG</span>
            </button>
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(() => onExport?.('svg'))}>
              <span>Download SVG</span>
            </button>
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(() => onExport?.('pdf'))}>
              <span>Download PDF</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Redimensionar dropdown ── */}
      <div style={{ position: 'relative' }} data-dropdown>
        <button
          onClick={() => toggleDropdown('resize')}
          style={{
            background: dropdown === 'resize' ? '#1C1C1F' : 'none', border: 'none',
            color: '#E0DDD8', fontSize: 12, fontFamily: S, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 4,
          }}
        >
          {IC.resize(12)} Redimensionar
        </button>
        {dropdown === 'resize' && (
          <div style={{ ...ddMenu, minWidth: 260 }}>
            {RESIZE_PRESETS.map((p) => (
              <button key={p.l} style={ddItem}
                onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
                onClick={() => closeAndRun(() => onResize?.(p.w, p.h))}>
                <span>{p.l}</span>
                <span style={ddShortcut}>{p.w}x{p.h}</span>
              </button>
            ))}
            <div style={ddSep} />
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number" placeholder="L" value={customW}
                onChange={e => setCustomW(e.target.value)}
                style={{
                  width: 60, background: '#0A0A0C', border: '1px solid #1C1C1F',
                  borderRadius: 4, color: '#E0DDD8', fontSize: 11, fontFamily: M,
                  padding: '4px 6px', outline: 'none',
                }}
                onClick={e => e.stopPropagation()}
              />
              <span style={{ color: '#3A3A3F', fontSize: 11 }}>x</span>
              <input
                type="number" placeholder="A" value={customH}
                onChange={e => setCustomH(e.target.value)}
                style={{
                  width: 60, background: '#0A0A0C', border: '1px solid #1C1C1F',
                  borderRadius: 4, color: '#E0DDD8', fontSize: 11, fontFamily: M,
                  padding: '4px 6px', outline: 'none',
                }}
                onClick={e => e.stopPropagation()}
              />
              <button
                onClick={() => {
                  const w = parseInt(customW);
                  const h = parseInt(customH);
                  if (w > 0 && h > 0) closeAndRun(() => onResize?.(w, h));
                }}
                style={{
                  background: '#E85D30', border: 'none', borderRadius: 4,
                  color: '#0A0A0C', fontSize: 10, fontWeight: 700, fontFamily: S,
                  padding: '4px 10px', cursor: 'pointer',
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Edicao dropdown ── */}
      <div style={{ position: 'relative' }} data-dropdown>
        <button
          onClick={() => toggleDropdown('edit')}
          style={{
            background: dropdown === 'edit' ? '#1C1C1F' : 'none', border: 'none',
            color: '#E0DDD8', fontSize: 12, fontFamily: S, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 4,
          }}
        >
          {IC.edit(12)} Edicao {IC.down(8)}
        </button>
        {dropdown === 'edit' && (
          <div style={ddMenu}>
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onUndo)}>
              <span>Desfazer</span><span style={ddShortcut}>⌘Z</span>
            </button>
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onRedo)}>
              <span>Refazer</span><span style={ddShortcut}>⇧⌘Z</span>
            </button>
            <div style={ddSep} />
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onCopy)}>
              <span>Copiar</span><span style={ddShortcut}>⌘C</span>
            </button>
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onPaste)}>
              <span>Colar</span><span style={ddShortcut}>⌘V</span>
            </button>
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onDuplicate)}>
              <span>Duplicar</span><span style={ddShortcut}>⌘D</span>
            </button>
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onDelete)}>
              <span>Excluir</span><span style={ddShortcut}>⌫</span>
            </button>
            <div style={ddSep} />
            <button style={ddItem} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}
              onClick={() => closeAndRun(onSelectAll)}>
              <span>Selecionar tudo</span><span style={ddShortcut}>⌘A</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Center: design name + save status ── */}
      <div style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <input
          value={designName}
          onChange={e => onNameChange(e.target.value)}
          style={{
            fontSize: 12, color: '#6E6E73', fontFamily: S, background: 'none',
            border: 'none', outline: 'none', textAlign: 'center', maxWidth: 280,
          }}
        />
        {saving && (
          <span style={{ fontSize: 9, color: '#E85D30', fontFamily: M, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%', background: '#E85D30',
              animation: 'pE 1.5s ease-in-out infinite', display: 'inline-block',
            }}/>
            Salvando...
          </span>
        )}
      </div>

      {/* ── Undo / Redo ── */}
      <button onClick={onUndo} style={{
        background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', display: 'flex', padding: 4,
      }}>
        {IC.undo(14)}
      </button>
      <button onClick={onRedo} style={{
        background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', display: 'flex', padding: 4,
      }}>
        {IC.redo(14)}
      </button>

      {/* ── Avatar ── */}
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: '#E85D30',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4,
      }}>
        <span style={{ color: '#0A0A0C', fontFamily: M, fontSize: 11, fontWeight: 700 }}>DG</span>
      </div>

      {/* ── Share/Export ── */}
      <button
        onClick={() => onExport?.('png')}
        style={{
          background: '#E85D30', border: 'none', borderRadius: 4, padding: '6px 14px',
          color: '#0A0A0C', fontSize: 11, fontWeight: 700, fontFamily: S, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4,
        }}
      >
        {IC.share(12)} Compartilhar
      </button>
    </div>
  );
}
