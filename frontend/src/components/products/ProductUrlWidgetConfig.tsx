'use client';
import { colors, typography } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  PRODUCT_URLS_COPY,
  TRIGGER_TIMINGS,
  WIDGET_POSITIONS,
} from './ProductUrlsTab.constants';

export function ProductUrlWidgetConfig({
  productId,
  fid,
  labelStyle,
  inputStyle,
  selectClass,
}: {
  productId: string;
  fid: string;
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  selectClass: string;
}) {
  const [widgetPosition, setWidgetPosition] = useState<string>('bottom-right');
  const [widgetColor, setWidgetColor] = useState<string>(colors.ember.primary);
  const [widgetMessage, setWidgetMessage] = useState('Olá! Como posso ajudar?');
  const [widgetTrigger, setWidgetTrigger] = useState('5000');
  const [codeCopied, setCodeCopied] = useState(false);
  const codeCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL || 'https://widget.kloel.com';
  const widgetCode = [
    '<script src="',
    `${WIDGET_URL}/chat.js`,
    '"',
    '\n  data-product-id="',
    productId,
    '"',
    '\n  data-position="',
    widgetPosition,
    '"',
    '\n  data-color="',
    widgetColor,
    '"',
    '\n  data-delay="',
    widgetTrigger,
    '"',
    '\n  data-message="',
    widgetMessage,
    '"',
    '\n  async>',
    '\n</script>',
  ].join('');

  const handleCopyCode = () => {
    navigator.clipboard.writeText(widgetCode);
    setCodeCopied(true);
    if (codeCopiedTimer.current) {
      clearTimeout(codeCopiedTimer.current);
    }
    codeCopiedTimer.current = setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="h-4 w-4" style={{ color: colors.accent.webb }} aria-hidden="true" />
        <span
          className="text-xs font-semibold uppercase"
          style={{ ...labelStyle, color: colors.accent.webb }}
        >
          {kloelT(`Configuração do widget`)}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <span className="mb-2 block" style={labelStyle}>
            {kloelT(`Posição do widget`)}
          </span>
          <div className="space-y-1.5">
            {WIDGET_POSITIONS.map((p) => (
              <label
                key={p.v}
                className="flex items-center gap-2 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  type="radio"
                  name="widgetPos"
                  checked={widgetPosition === p.v}
                  onChange={() => setWidgetPosition(p.v)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {p.l}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor={`${fid}-widgetcolor`} className="mb-2 block" style={labelStyle}>
            {kloelT(`Cor primária`)}
          </label>
          <div className="flex items-center gap-3">
            <input
              id={`${fid}-widgetcolor`}
              aria-label={PRODUCT_URLS_COPY.widgetColorPickerAria}
              type="color"
              value={widgetColor}
              onChange={(e) => setWidgetColor(e.target.value)}
              className="h-9 w-9 cursor-pointer rounded-lg border-0 p-0"
            />
            <input
              aria-label={PRODUCT_URLS_COPY.widgetColorHexAria}
              type="text"
              value={widgetColor}
              onChange={(e) => setWidgetColor(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm font-mono w-28 focus:outline-none"
              style={inputStyle}
            />
            <div className="h-8 w-8 rounded-lg" style={{ background: widgetColor }} />
          </div>
        </div>
        <div>
          <label className="mb-2 block" style={labelStyle} htmlFor={`${fid}-msg`}>
            {kloelT(`Mensagem inicial`)}
          </label>
          <input
            aria-label={PRODUCT_URLS_COPY.widgetMessageAria}
            type="text"
            value={widgetMessage}
            onChange={(e) => setWidgetMessage(e.target.value)}
            className={selectClass}
            style={inputStyle}
            placeholder={kloelT(`Olá! Como posso ajudar?`)}
            id={`${fid}-msg`}
          />
        </div>
        <div>
          <label className="mb-2 block" style={labelStyle} htmlFor={`${fid}-quando`}>
            {kloelT(`Quando exibir`)}
          </label>
          <select
            value={widgetTrigger}
            onChange={(e) => setWidgetTrigger(e.target.value)}
            className={selectClass}
            style={inputStyle}
            id={`${fid}-quando`}
          >
            {TRIGGER_TIMINGS.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="mt-4 rounded-lg p-4"
        style={{
          background: colors.background.nebula,
          border: `1px solid ${colors.border.space}`,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: colors.text.moonlight }}>
            {kloelT(`Código do widget para integrar no seu site:`)}
          </span>
          <button
            type="button"
            onClick={handleCopyCode}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              background: colors.background.corona,
              color: codeCopied ? colors.state.success : colors.text.moonlight,
            }}
          >
            {codeCopied ? (
              <>
                <Check className="h-3 w-3" aria-hidden="true" /> {kloelT(`Copiado!`)}
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" aria-hidden="true" /> {kloelT(`Copiar`)}
              </>
            )}
          </button>
        </div>
        <pre
          className="overflow-x-auto text-xs whitespace-pre-wrap"
          style={{ color: colors.accent.webb, fontFamily: typography.fontFamily.mono }}
        >
          {widgetCode}
        </pre>
      </div>
    </>
  );
}
