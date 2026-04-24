'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import { AVAILABLE_FONTS } from '@/lib/fabric';
import {
  FONT_SORA as S,
  FONT_JETBRAINS as M,
  type SelectedCanvasObject,
} from './canvas-editor.types';

type PropertyBarProps = {
  selectedObj: SelectedCanvasObject;
  updateProp: (prop: string, value: unknown) => void;
  onBrightnessChange: (v: number) => void;
  onContrastChange: (v: number) => void;
  onSaturationChange: (v: number) => void;
  onGrayscale: () => void;
  onRemoveFilters: () => void;
};

export function PropertyBar({
  selectedObj,
  updateProp,
  onBrightnessChange,
  onContrastChange,
  onSaturationChange,
  onGrayscale,
  onRemoveFilters,
}: PropertyBarProps) {
  const isText = selectedObj.type === 'textbox' || selectedObj.type === 'i-text';
  const isShape =
    selectedObj.type === 'rect' ||
    selectedObj.type === 'circle' ||
    selectedObj.type === 'triangle' ||
    selectedObj.type === 'polygon';
  const isImage = selectedObj.type === 'image';

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        background: UI.surface,
        border: '1px solid UI.border',
        borderRadius: UI.radiusMd,
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 50,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        maxWidth: 'calc(100% - 40px)',
        overflowX: 'auto',
      }}
    >
      {isText && (
        <>
          <select
            value={selectedObj.fontFamily || 'Sora'}
            onChange={(e) => updateProp('fontFamily', e.target.value)}
            style={{
              background: UI.bg,
              border: '1px solid UI.border',
              borderRadius: UI.radiusSm,
              color: UI.text,
              fontSize: 10,
              fontFamily: S,
              padding: '3px 4px',
              outline: 'none',
              maxWidth: 110,
              cursor: 'pointer',
            }}
          >
            {AVAILABLE_FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>

          <input
            type="number"
            min={8}
            max={200}
            aria-label="Tamanho da fonte"
            value={Math.round(selectedObj.fontSize || 16)}
            onChange={(e) => updateProp('fontSize', Number.parseInt(e.target.value, 10) || 16)}
            style={{
              width: 40,
              background: UI.bg,
              border: '1px solid UI.border',
              borderRadius: UI.radiusSm,
              color: UI.text,
              fontSize: 10,
              fontFamily: M,
              padding: '3px 4px',
              outline: 'none',
              textAlign: 'center',
            }}
          />

          <span style={{ color: UI.tertiary, fontSize: 10 }}>|</span>

          <button
            type="button"
            onClick={() =>
              updateProp('fontWeight', selectedObj.fontWeight === 'bold' ? 'normal' : 'bold')
            }
            style={{
              background: selectedObj.fontWeight === 'bold' ? 'UI.border' : 'none',
              border: 'none',
              color: UI.text,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: UI.radiusSm,
              fontWeight: 700,
              fontSize: 12,
              fontFamily: S,
            }}
          >
            B
          </button>

          <button
            type="button"
            onClick={() =>
              updateProp('fontStyle', selectedObj.fontStyle === 'italic' ? 'normal' : 'italic')
            }
            style={{
              background: selectedObj.fontStyle === 'italic' ? 'UI.border' : 'none',
              border: 'none',
              color: UI.text,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: UI.radiusSm,
              fontStyle: 'italic',
              fontSize: 12,
              fontFamily: S,
            }}
          >
            I
          </button>

          <button
            type="button"
            onClick={() => updateProp('underline', !selectedObj.underline)}
            style={{
              background: selectedObj.underline ? 'UI.border' : 'none',
              border: 'none',
              color: UI.text,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: UI.radiusSm,
              textDecoration: 'underline',
              fontSize: 12,
              fontFamily: S,
            }}
          >
            U
          </button>

          <span style={{ color: UI.tertiary, fontSize: 10 }}>|</span>

          {(['left', 'center', 'right', 'justify'] as const).map((align) => (
            <button
              type="button"
              key={align}
              onClick={() => updateProp('textAlign', align)}
              style={{
                background: selectedObj.textAlign === align ? 'UI.border' : 'none',
                border: 'none',
                color: UI.text,
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: UI.radiusSm,
                fontSize: 9,
                fontFamily: M,
              }}
              title={align}
            >
              {align === 'left'
                ? 'Left'
                : align === 'center'
                  ? 'Center'
                  : align === 'right'
                    ? 'Right'
                    : 'Justify'}
            </button>
          ))}

          <span style={{ color: UI.tertiary, fontSize: 10 }}>|</span>

          <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
            <span style={{ fontSize: 9, color: UI.muted, fontFamily: S }}>{kloelT(`Cor`)}</span>
            <input
              type="color"
              value={typeof selectedObj.fill === 'string' ? selectedObj.fill : 'UI.text'}
              onChange={(e) => updateProp('fill', e.target.value)}
              style={{
                width: 20,
                height: 20,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          </label>
        </>
      )}

      {isShape && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
            <span style={{ fontSize: 9, color: UI.muted, fontFamily: S }}>
              {kloelT(`Preench.`)}
            </span>
            <input
              type="color"
              value={typeof selectedObj.fill === 'string' ? selectedObj.fill : 'UI.text'}
              onChange={(e) => updateProp('fill', e.target.value)}
              style={{
                width: 20,
                height: 20,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          </label>
          <span style={{ color: UI.tertiary, fontSize: 10 }}>|</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
            <span style={{ fontSize: 9, color: UI.muted, fontFamily: S }}>{kloelT(`Borda`)}</span>
            <input
              type="color"
              value={typeof selectedObj.stroke === 'string' ? selectedObj.stroke : 'UI.text'}
              onChange={(e) => {
                updateProp('stroke', e.target.value);
                if (!selectedObj.strokeWidth) {
                  updateProp('strokeWidth', 2);
                }
              }}
              style={{
                width: 20,
                height: 20,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 9, color: UI.muted, fontFamily: S }}>{kloelT(`Esp.`)}</span>
            <input
              type="number"
              min={0}
              max={20}
              value={selectedObj.strokeWidth || 0}
              onChange={(e) => updateProp('strokeWidth', Number.parseInt(e.target.value, 10) || 0)}
              style={{
                width: 32,
                background: UI.bg,
                border: '1px solid UI.border',
                borderRadius: UI.radiusSm,
                color: UI.text,
                fontSize: 10,
                fontFamily: M,
                padding: '3px 4px',
                outline: 'none',
                textAlign: 'center',
              }}
            />
          </label>
        </>
      )}

      {isImage && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 9, color: UI.muted, fontFamily: S }}>{kloelT(`Brilho`)}</span>
            <input
              type="range"
              min={-100}
              max={100}
              defaultValue={0}
              onChange={(e) => onBrightnessChange(Number.parseInt(e.target.value, 10) / 100)}
              style={{ width: 50, accentColor: UI.accent, cursor: 'pointer' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 9, color: UI.muted, fontFamily: S }}>
              {kloelT(`Contraste`)}
            </span>
            <input
              type="range"
              min={-100}
              max={100}
              defaultValue={0}
              onChange={(e) => onContrastChange(Number.parseInt(e.target.value, 10) / 100)}
              style={{ width: 50, accentColor: UI.accent, cursor: 'pointer' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 9, color: UI.muted, fontFamily: S }}>
              {kloelT(`Saturacao`)}
            </span>
            <input
              type="range"
              min={-100}
              max={100}
              defaultValue={0}
              onChange={(e) => onSaturationChange(Number.parseInt(e.target.value, 10) / 100)}
              style={{ width: 50, accentColor: UI.accent, cursor: 'pointer' }}
            />
          </label>
          <button
            type="button"
            onClick={onGrayscale}
            style={{
              background: 'none',
              border: '1px solid UI.border',
              borderRadius: UI.radiusSm,
              color: UI.muted,
              fontSize: 9,
              fontFamily: S,
              padding: '2px 6px',
              cursor: 'pointer',
            }}
          >
            {kloelT(`P&amp;B`)}
          </button>
          <button
            type="button"
            onClick={onRemoveFilters}
            style={{
              background: 'none',
              border: '1px solid UI.border',
              borderRadius: UI.radiusSm,
              color: UI.muted,
              fontSize: 9,
              fontFamily: S,
              padding: '2px 6px',
              cursor: 'pointer',
            }}
          >
            {kloelT(`Reset`)}
          </button>
        </>
      )}

      <span style={{ color: UI.tertiary, fontSize: 10 }}>|</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 9, color: UI.muted, fontFamily: S }}>{kloelT(`Opac.`)}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((selectedObj.opacity ?? 1) * 100)}
          onChange={(e) => updateProp('opacity', Number.parseInt(e.target.value, 10) / 100)}
          style={{ width: 50, accentColor: UI.accent, cursor: 'pointer' }}
        />
        <span style={{ fontSize: 9, color: UI.tertiary, fontFamily: M, width: 24 }}>
          {Math.round((selectedObj.opacity ?? 1) * 100)}%
        </span>
      </label>
    </div>
  );
}
