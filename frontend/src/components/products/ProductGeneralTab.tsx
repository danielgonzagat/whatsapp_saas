'use client';

import { kloelT } from '@/lib/i18n/t';
import { ChipInput, CurrencyInput, ImageUpload, RadioGroup } from '@/components/kloel/FormExtras';
import { apiFetch } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import { Loader2, Save } from 'lucide-react';
import { useEffect, useRef, useState, useId } from 'react';
import { mutate } from 'swr';

import { PRODUCT_CATEGORIES as CATEGORIES } from '@/lib/categories';

const SHIPPING_TYPES = [
  { value: 'VARIABLE', label: 'Variavel/Gratis' },
  { value: 'FIXED', label: 'Fixo' },
  { value: 'FREE', label: 'Sem frete' },
];

interface ProductData {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  tags: string[];
  format: string;
  imageUrl: string;
  active: boolean;
  status: string;
  salesPageUrl: string;
  thankyouUrl: string;
  thankyouBoletoUrl: string;
  thankyouPixUrl: string;
  reclameAquiUrl: string;
  supportEmail: string;
  warrantyDays: number | null;
  isSample: boolean;
  shippingType: string;
  shippingValue: number | null;
  originCep: string;
}

/** Product general tab. */
export function ProductGeneralTab({ productId }: { productId: string }) {
  const fid = useId();
  const [data, setData] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    apiFetch<ProductData>(`/products/${productId}`)
      .then((res) => setData(res.data || null))
      .catch((err) => console.error('[ProductGeneralTab] Error:', err.message || err))
      .finally(() => setLoading(false));
  }, [productId]);

  const handleSave = async () => {
    if (!data) {
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/products/${productId}`, { method: 'PUT', body: data });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      setSaved(true);
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
      savedTimer.current = setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Erro ao salvar', e);
    } finally {
      setSaving(false);
    }
  };

  const update = (field: keyof ProductData, value: ProductData[keyof ProductData]) => {
    if (data) {
      setData({ ...data, [field]: value });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2
          className="h-6 w-6 animate-spin"
          style={{ color: colors.ember.primary }}
          aria-hidden="true"
        />
      </div>
    );
  }
  if (!data) {
    return (
      <p className="py-8 text-center text-sm" style={{ color: colors.text.muted }}>
        
        {kloelT(`Produto nao encontrado.`)}
      </p>
    );
  }

  const inputClass = 'w-full rounded-md px-4 py-2.5 text-sm outline-none';
  const inputStyle: React.CSSProperties = {
    backgroundColor: colors.background.elevated,
    border: `1px solid ${colors.border.space}`,
    color: colors.text.silver,
    fontFamily: "'Sora', sans-serif",
  };
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider';
  const labelStyle: React.CSSProperties = { color: colors.text.muted };

  return (
    <div className="space-y-8">
      {/* Info Box */}
      <div
        className="flex items-center gap-4 rounded-md px-4 py-3 text-sm"
        style={{
          border: `1px solid ${colors.border.space}`,
          backgroundColor: colors.background.elevated,
        }}
      >
        <span style={{ color: colors.text.muted }}>
          
          {kloelT(`Codigo:`)} <strong style={{ color: colors.text.silver }}>{data.id.slice(0, 8)}</strong>
        </span>
        <span style={{ color: colors.border.space }}>|</span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor:
              data.status === 'APPROVED' ? 'rgba(224,221,216,0.12)' : colors.background.elevated,
            color: data.status === 'APPROVED' ? colors.text.silver : colors.text.muted,
          }}
        >
          {data.status}
        </span>
        <span style={{ color: colors.border.space }}>|</span>
        <span style={{ color: colors.text.muted }}>
          {data.format === 'PHYSICAL'
            ? 'Fisico'
            : data.format === 'DIGITAL'
              ? 'Digital'
              : 'Hibrido'}
        </span>
      </div>

      {/* 2-column layout */}
      <div className="grid gap-8 lg:grid-cols-5">
        {/* Left: Image */}
        <div className="lg:col-span-2">
          <ImageUpload
            value={data.imageUrl}
            onChange={(url) => update('imageUrl', url)}
            label={kloelT(`Foto do produto`)}
            hint={kloelT(`JPG, PNG ou WebP - 500x400px ideal - Max 10MB`)}
            folder="products"
            previewStorageKey={`kloel_product_general_preview_${productId}`}
          />
        </div>

        {/* Right: Fields */}
        <div className="space-y-5 lg:col-span-3">
          {/* Available toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => update('active', !data.active)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ backgroundColor: data.active ? colors.ember.primary : colors.border.space }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${data.active ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
            <span className="text-sm font-medium" style={{ color: colors.text.muted }}>
              
              {kloelT(`Disponivel para venda`)}
            </span>
          </div>

          <div>
            <label className={labelClass} style={labelStyle} htmlFor={`${fid}-nome`}>
              
              {kloelT(`Nome *`)}
            </label>
            <input
              aria-label="Nome do produto"
              value={data.name}
              onChange={(e) => update('name', e.target.value)}
              className={inputClass}
              style={inputStyle}
              maxLength={200}
              id={`${fid}-nome`}
            />
          </div>

          <div>
            <label className={labelClass} style={labelStyle} htmlFor={`${fid}-desc`}>
              
              {kloelT(`Descricao`)}
            </label>
            <textarea
              value={data.description || ''}
              onChange={(e) => update('description', e.target.value)}
              className={inputClass}
              style={{ ...inputStyle, resize: 'vertical' as const }}
              rows={4}
              maxLength={5000}
              id={`${fid}-desc`}
            />
          </div>

          <div>
            <label className={labelClass} style={labelStyle} htmlFor={`${fid}-cat`}>
              
              {kloelT(`Categoria`)}
            </label>
            <select
              value={data.category || ''}
              onChange={(e) => update('category', e.target.value)}
              className={inputClass}
              style={inputStyle}
              id={`${fid}-cat`}
            >
              <option value="">{kloelT(`Selecione`)}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <ChipInput
            value={data.tags || []}
            onChange={(v) => update('tags', v)}
            max={5}
            label={kloelT(`Tags (max. 5)`)}
          />

          <RadioGroup
            value={data.format}
            onChange={(v) => update('format', v)}
            label={kloelT(`Formato`)}
            direction="horizontal"
            options={[
              { value: 'PHYSICAL', label: 'Fisico' },
              { value: 'DIGITAL', label: 'Digital' },
              { value: 'HYBRID', label: 'Hibrido' },
            ]}
          />

          {(data.format === 'PHYSICAL' || data.format === 'HYBRID') && (
            <div>
              <label className={labelClass} style={labelStyle} htmlFor={`${fid}-cep`}>
                
                {kloelT(`CEP de origem`)}
              </label>
              <input
                value={data.originCep || ''}
                onChange={(e) => update('originCep', e.target.value)}
                placeholder="00000-000"
                className={inputClass}
                style={inputStyle}
                maxLength={9}
                id={`${fid}-cep`}
              />
            </div>
          )}
        </div>
      </div>

      {/* URLs */}
      <div>
        <h3
          className="mb-4 text-sm font-semibold uppercase tracking-wider"
          style={{ color: colors.text.muted }}
        >
          
          {kloelT(`URLs`)}
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { key: 'salesPageUrl', label: 'Pagina de vendas' },
            { key: 'thankyouUrl', label: 'Pagina de obrigado' },
            { key: 'thankyouBoletoUrl', label: 'Obrigado (boleto)' },
            { key: 'thankyouPixUrl', label: 'Obrigado (PIX)' },
            { key: 'reclameAquiUrl', label: 'Reclame Aqui' },
            { key: 'supportEmail', label: 'E-mail de suporte' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className={labelClass} style={labelStyle} htmlFor={`${fid}-input`}>
                {label}
              </label>
              <input
                aria-label={label}
                value={(data[key as keyof ProductData] as string) || ''}
                onChange={(e) => update(key as keyof ProductData, e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder={key.includes('Email') ? 'suporte@...' : 'https://...'}
                id={`${fid}-input`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Shipping */}
      {(data.format === 'PHYSICAL' || data.format === 'HYBRID') && (
        <div>
          <h3
            className="mb-4 text-sm font-semibold uppercase tracking-wider"
            style={{ color: colors.text.muted }}
          >
            
            {kloelT(`Configuracao de envio`)}
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className={labelClass} style={labelStyle} htmlFor={`${fid}-garantia`}>
                
                {kloelT(`Tempo de garantia (dias)`)}
              </label>
              <input
                type="number"
                aria-label="Tempo de garantia (dias)"
                value={data.warrantyDays || ''}
                onChange={(e) =>
                  update('warrantyDays', Number.parseInt(e.target.value, 10) || null)
                }
                className={inputClass}
                style={inputStyle}
                id={`${fid}-garantia`}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle} htmlFor={`${fid}-frete`}>
                
                {kloelT(`Tipo de frete`)}
              </label>
              <select
                value={data.shippingType || ''}
                onChange={(e) => update('shippingType', e.target.value)}
                className={inputClass}
                style={inputStyle}
                id={`${fid}-frete`}
              >
                <option value="">{kloelT(`Selecione`)}</option>
                {SHIPPING_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {data.shippingType === 'FIXED' && (
              <CurrencyInput
                value={String(data.shippingValue || '')}
                onChange={(v) => update('shippingValue', Number.parseFloat(v) || null)}
                label={kloelT(`Valor do frete`)}
              />
            )}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => update('isSample', !data.isSample)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{
                backgroundColor: data.isSample ? colors.ember.primary : colors.border.space,
              }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${data.isSample ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
            <span className="text-sm" style={{ color: colors.text.muted }}>
              
              {kloelT(`E amostra gratis?`)}
            </span>
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-semibold"
          style={{
            backgroundColor: colors.ember.primary,
            color: 'var(--app-text-on-accent)',
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
