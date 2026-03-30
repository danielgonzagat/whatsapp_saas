'use client';

import { IC } from './CanvasIcons';

const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

interface EditorTopBarProps {
  designName: string;
  onNameChange: (name: string) => void;
  saving: boolean;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport?: () => void;
}

export function EditorTopBar({
  designName, onNameChange, saving, onBack, onUndo, onRedo, onExport,
}: EditorTopBarProps) {
  return (
    <div style={{
      height: 42, background: '#111113', borderBottom: '1px solid #1C1C1F',
      display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, flexShrink: 0,
    }}>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', display: 'flex', padding: 4,
      }}>
        {IC.home(16)}
      </button>
      <span style={{ color: '#2A2A2E' }}>|</span>
      <button style={{
        background: 'none', border: 'none', color: '#E0DDD8', fontSize: 12, fontFamily: S, cursor: 'pointer',
      }}>
        Arquivo
      </button>
      <button style={{
        background: 'none', border: 'none', color: '#E0DDD8', fontSize: 12, fontFamily: S,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {IC.resize(12)} Redimensionar
      </button>
      <button style={{
        background: 'none', border: 'none', color: '#E0DDD8', fontSize: 12, fontFamily: S,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {IC.edit(12)} Edicao {IC.down(8)}
      </button>

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
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: '#E85D30',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4,
      }}>
        <span style={{ color: '#0A0A0C', fontFamily: M, fontSize: 11, fontWeight: 700 }}>DG</span>
      </div>
      <button
        onClick={onExport}
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
