'use client';
import { colors, typography } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { MessageCircle, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import {
  AI_LEARN_OPTIONS,
  PRODUCT_URLS_COPY,
  UPDATE_FREQ,
} from './ProductUrlsTab.constants';
import { ProductUrlWidgetConfig } from './ProductUrlWidgetConfig';
export interface ProductUrlItem {
  id: string;
  description: string;
  url: string;
  isPrivate: boolean;
  active: boolean;
  aiLearning: boolean;
  aiLearnStatus: string | null;
  chatEnabled: boolean;
  salesFromUrl: number;
}

export interface ProductUrlFormData {
  description: string;
  url: string;
  isPrivate: boolean;
  aiLearning: boolean;
  chatEnabled: boolean;
  aiLearnTopics: string[];
  aiUpdateFreq: string;
  widgetPosition: string;
  widgetColor: string;
  widgetMessage: string;
  widgetTrigger: string;
}

export function ProductUrlForm({
  productId,
  creating,
  fid,
  onCreate,
}: {
  productId: string;
  creating: boolean;
  fid: string;
  onCreate: (data: ProductUrlFormData) => Promise<void>;
}) {
  const [form, setForm] = useState({ description: '', url: '', isPrivate: false, aiLearning: false, chatEnabled: false });
  const [aiLearnTopics, setAiLearnTopics] = useState<string[]>([]);
  const [aiUpdateFreq, setAiUpdateFreq] = useState('manual');
  const [widgetPosition, setWidgetPosition] = useState('bottom-right');
  const [widgetColor, setWidgetColor] = useState<string>(colors.ember.primary);
  const [widgetMessage, setWidgetMessage] = useState('Olá! Como posso ajudar?');
  const [widgetTrigger, setWidgetTrigger] = useState('5000');
  const handleSubmit = async () => {
    await onCreate({
      ...form,
      aiLearnTopics,
      aiUpdateFreq,
      widgetPosition,
      widgetColor,
      widgetMessage,
      widgetTrigger,
    });
    setForm({ description: '', url: '', isPrivate: false, aiLearning: false, chatEnabled: false });
    setAiLearnTopics([]);
    setAiUpdateFreq('manual');
    setWidgetPosition('bottom-right');
    setWidgetColor(colors.ember.primary);
    setWidgetMessage('Olá! Como posso ajudar?');
    setWidgetTrigger('5000');
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: typography.fontFamily.display,
    fontSize: '11px',
    fontWeight: 600,
    color: colors.text.dust,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  };
  const cardStyle: React.CSSProperties = {
    background: colors.background.space,
    border: `1px solid ${colors.border.space}`,
    borderRadius: '6px',
  };
  const inputStyle: React.CSSProperties = {
    background: colors.background.nebula,
    border: `1px solid ${colors.border.space}`,
    color: colors.text.starlight,
    borderRadius: '6px',
  };
  const selectClass = 'w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none';

  return (
    <div className="rounded-xl p-5" style={cardStyle}>
      <h3
        className="mb-4 text-sm font-semibold uppercase"
        style={{
          fontFamily: typography.fontFamily.display,
          color: colors.text.starlight,
          letterSpacing: '0.02em',
        }}
      >
        {kloelT(`Adicionar URL`)}
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block" style={labelStyle} htmlFor={`${fid}-desc`}>
            {kloelT(`Descrição *`)}
          </label>
          <input
            aria-label={PRODUCT_URLS_COPY.descriptionAria}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={255}
            placeholder={kloelT(`Página de vendas principal`)}
            className={selectClass}
            style={inputStyle}
            id={`${fid}-desc`}
          />
          <p className="mt-1 text-right text-xs" style={{ color: colors.text.dust }}>
            {form.description.length}/255
          </p>
        </div>
        <div>
          <label className="mb-1 block" style={labelStyle} htmlFor={`${fid}-url`}>
            {kloelT(`URL *`)}
          </label>
          <input
            aria-label={PRODUCT_URLS_COPY.pageUrlAria}
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            maxLength={255}
            placeholder={PRODUCT_URLS_COPY.urlPlaceholder}
            className={selectClass}
            style={inputStyle}
            id={`${fid}-url`}
          />
          <p className="mt-1 text-right text-xs" style={{ color: colors.text.dust }}>
            {form.url.length}/255
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <label
          className="flex items-center gap-2 text-sm cursor-pointer"
          style={{ color: colors.text.starlight }}
        >
          <input
            type="checkbox"
            checked={form.isPrivate}
            onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })}
            style={{ accentColor: colors.accent.webb }}
          />
          {kloelT(`URL privada`)}
        </label>
        <label
          className="flex items-center gap-2 text-sm cursor-pointer"
          style={{ color: colors.text.starlight }}
        >
          <Sparkles className="h-4 w-4" style={{ color: colors.accent.webb }} aria-hidden="true" />
          <input
            type="checkbox"
            checked={form.aiLearning}
            onChange={(e) => setForm({ ...form, aiLearning: e.target.checked })}
            style={{ accentColor: colors.accent.webb }}
          />
          {kloelT(`Kloel pode aprender com essa URL?`)}
        </label>
        <label
          className="flex items-center gap-2 text-sm cursor-pointer"
          style={{ color: colors.text.starlight }}
        >
          <MessageCircle className="h-4 w-4" style={{ color: colors.accent.webb }} aria-hidden="true" />
          <input
            type="checkbox"
            checked={form.chatEnabled}
            onChange={(e) => setForm({ ...form, chatEnabled: e.target.checked })}
            style={{ accentColor: colors.accent.webb }}
          />
          {kloelT(`Integrar chat Kloel nessa URL?`)}
        </label>
      </div>

      {form.aiLearning && (
        <div
          className="mt-4 rounded-xl p-4"
          style={{
            background: `${colors.accent.webb}05`,
            border: `1px solid ${colors.accent.webb}15`,
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4" style={{ color: colors.accent.webb }} aria-hidden="true" />
            <span
              className="text-xs font-semibold uppercase"
              style={{ ...labelStyle, color: colors.accent.webb }}
            >
              {kloelT(`Configuração de aprendizado`)}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className="mb-2 block" style={labelStyle}>
                {kloelT(`O que a IA deve aprender?`)}
              </span>
              <div className="space-y-1.5">
                {AI_LEARN_OPTIONS.map((opt) => (
                  <label
                    key={opt}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                    style={{ color: colors.text.starlight }}
                  >
                    <input
                      type="checkbox"
                      checked={aiLearnTopics.includes(opt)}
                      onChange={() =>
                        setAiLearnTopics(
                          aiLearnTopics.includes(opt)
                            ? aiLearnTopics.filter((x) => x !== opt)
                            : [...aiLearnTopics, opt],
                        )
                      }
                      style={{ accentColor: colors.accent.webb }}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-2 block" style={labelStyle}>
                {kloelT(`Frequência de atualização`)}
              </span>
              <div className="space-y-1.5">
                {UPDATE_FREQ.map((f) => (
                  <label
                    key={f.v}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                    style={{ color: colors.text.starlight }}
                  >
                    <input
                      type="radio"
                      name="updateFreq"
                      checked={aiUpdateFreq === f.v}
                      onChange={() => setAiUpdateFreq(f.v)}
                      style={{ accentColor: colors.accent.webb }}
                    />
                    {f.l}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {form.chatEnabled && (
        <div
          className="mt-4 rounded-xl p-4"
          style={{
            background: `${colors.accent.webb}05`,
            border: `1px solid ${colors.accent.webb}15`,
          }}
        >
          <ProductUrlWidgetConfig
            productId={productId}
            fid={fid}
            labelStyle={labelStyle}
            inputStyle={inputStyle}
            selectClass={selectClass}
            widgetPosition={widgetPosition}
            widgetColor={widgetColor}
            widgetMessage={widgetMessage}
            widgetTrigger={widgetTrigger}
            onPositionChange={setWidgetPosition}
            onColorChange={setWidgetColor}
            onMessageChange={setWidgetMessage}
            onTriggerChange={setWidgetTrigger}
          />
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={creating || !form.description || !form.url}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-all"
          style={{ backgroundColor: colors.accent.webb, boxShadow: 'none' }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {creating ? PRODUCT_URLS_COPY.addingUrl : PRODUCT_URLS_COPY.addUrl}
        </button>
      </div>
    </div>
  );
}
