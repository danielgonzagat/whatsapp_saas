'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import { AVAILABLE_FONTS } from '@/lib/fabric';
import {
  FONT_SORA as S,
  FONT_JETBRAINS as M,
  type SelectedCanvasObject,
} from './canvas-editor.types';
import {
  RangeControl,
  ColorControl,
  ToolbarToggleButton,
  propNumberInputStyle,
} from './canvas-editor-panel-shell';

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
            style={{ ...propNumberInputStyle, width: 40 }}
          />

          <span style={{ color: UI.tertiary, fontSize: 10 }}>|</span>

          <ToolbarToggleButton
            active={selectedObj.fontWeight === 'bold'}
            onClick={() =>
              updateProp('fontWeight', selectedObj.fontWeight === 'bold' ? 'normal' : 'bold')
            }
            fontWeight={700}
            fontFamily={S}
          >
            B
          </ToolbarToggleButton>

          <ToolbarToggleButton
            active={selectedObj.fontStyle === 'italic'}
            onClick={() =>
              updateProp('fontStyle', selectedObj.fontStyle === 'italic' ? 'normal' : 'italic')
            }
            fontStyle="italic"
            fontFamily={S}
          >
            I
          </ToolbarToggleButton>

          <ToolbarToggleButton
            active={!!selectedObj.underline}
            onClick={() => updateProp('underline', !selectedObj.underline)}
            textDecoration="underline"
            fontFamily={S}
          >
            U
          </ToolbarToggleButton>

          <span style={{ color: UI.tertiary, fontSize: 10 }}>|</span>

          {(['left', 'center', 'right', 'justify'] as const).map((align) => (
            <ToolbarToggleButton
              key={align}
              active={selectedObj.textAlign === align}
              onClick={() => updateProp('textAlign', align)}
              title={align}
              fontFamily={M}
            >
              {align === 'left'
                ? 'Left'
                : align === 'center'
                  ? 'Center'
                  : align === 'right'
                    ? 'Right'
                    : 'Justify'}
            </ToolbarToggleButton>
          ))}

          <span style={{ color: UI.tertiary, fontSize: 10 }}>|</span>

          <ColorControl
            label={kloelT(`Cor`)}
            value={typeof selectedObj.fill === 'string' ? selectedObj.fill : 'UI.text'}
            onChange={(e) => updateProp('fill', e.target.value)}
          />
        </>
      )}

      {isShape && (
        <>
          <ColorControl
            label={kloelT(`Preench.`)}
            value={typeof selectedObj.fill === 'string' ? selectedObj.fill : 'UI.text'}
            onChange={(e) => updateProp('fill', e.target.value)}
          />
          <span style={{ color: UI.tertiary, fontSize: 10 }}>|</span>
          <ColorControl
            label={kloelT(`Borda`)}
            value={typeof selectedObj.stroke === 'string' ? selectedObj.stroke : 'UI.text'}
            onChange={(e) => {
              updateProp('stroke', e.target.value);
              if (!selectedObj.strokeWidth) {
                updateProp('strokeWidth', 2);
              }
            }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 9, color: UI.muted, fontFamily: S }}>{kloelT(`Esp.`)}</span>
            <input
              type="number"
              min={0}
              max={20}
              value={selectedObj.strokeWidth || 0}
              onChange={(e) => updateProp('strokeWidth', Number.parseInt(e.target.value, 10) || 0)}
              style={{ ...propNumberInputStyle, width: 32 }}
            />
          </label>
        </>
      )}

      {isImage && (
        <>
          <RangeControl
            label={kloelT(`Brilho`)}
            min={-100}
            max={100}
            defaultValue={0}
            onChange={(e) => onBrightnessChange(Number.parseInt(e.target.value, 10) / 100)}
          />
          <RangeControl
            label={kloelT(`Contraste`)}
            min={-100}
            max={100}
            defaultValue={0}
            onChange={(e) => onContrastChange(Number.parseInt(e.target.value, 10) / 100)}
          />
          <RangeControl
            label={kloelT(`Saturacao`)}
            min={-100}
            max={100}
            defaultValue={0}
            onChange={(e) => onSaturationChange(Number.parseInt(e.target.value, 10) / 100)}
          />
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
      <RangeControl
        label={kloelT(`Opac.`)}
        min={0}
        max={100}
        value={Math.round((selectedObj.opacity ?? 1) * 100)}
        onChange={(e) => updateProp('opacity', Number.parseInt(e.target.value, 10) / 100)}
        showValue={`${Math.round((selectedObj.opacity ?? 1) * 100)}%`}
      />
    </div>
  );
}
