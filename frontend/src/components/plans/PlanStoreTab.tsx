'use client';
import { CurrencyInput, ImageUpload } from '@/components/kloel/FormExtras';
import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import { useEffect, useState } from 'react';
import { mutate } from 'swr';

export function PlanStoreTab({ planId, productId }: { planId: string; productId: string }) {
  const [available, setAvailable] = useState(false);
  const [hideAffiliates, setHideAffiliates] = useState(false);
  const [freeSample, setFreeSample] = useState(false);
  const [requireEmail, setRequireEmail] = useState(true);
  const [requireEmailConfirm, setRequireEmailConfirm] = useState(false);
  const [requireAddress, setRequireAddress] = useState(false);
  const [limitSales, setLimitSales] = useState(false);
  const [salesLimit, setSalesLimit] = useState('');
  const [limitPerApproved, setLimitPerApproved] = useState(false);
  const [approvedLimit, setApprovedLimit] = useState('');
  const [minStock, setMinStock] = useState(false);
  const [stockMin, setStockMin] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [items, setItems] = useState('1');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [thankyouUrl, setThankyouUrl] = useState('');
  const [thankyouBoletoUrl, setThankyouBoletoUrl] = useState('');
  const [thankyouPixUrl, setThankyouPixUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!productId || !planId) return;
    apiFetch(`/products/${encodeURIComponent(productId)}/plans/${encodeURIComponent(planId)}`).then(
      (res) => {
        if (res.error || !res.data) return;
        const d = res.data as Record<string, unknown>;
        if (d.available != null) setAvailable(d.available as boolean);
        if (d.hideAffiliates != null) setHideAffiliates(d.hideAffiliates as boolean);
        if (d.freeSample != null) setFreeSample(d.freeSample as boolean);
        if (d.requireEmail != null) setRequireEmail(d.requireEmail as boolean);
        if (d.requireEmailConfirm != null) setRequireEmailConfirm(d.requireEmailConfirm as boolean);
        if (d.requireAddress != null) setRequireAddress(d.requireAddress as boolean);
        if (d.limitSales != null) setLimitSales(d.limitSales as boolean);
        if (d.salesLimit != null) setSalesLimit(String(d.salesLimit));
        if (d.limitPerApproved != null) setLimitPerApproved(d.limitPerApproved as boolean);
        if (d.approvedLimit != null) setApprovedLimit(String(d.approvedLimit));
        if (d.minStock != null) setMinStock(d.minStock as boolean);
        if (d.stockMin != null) setStockMin(String(d.stockMin));
        if (d.name != null) setName(d.name as string);
        if (d.price != null) setPrice(String(d.price));
        if (d.items != null) setItems(String(d.items));
        if (d.redirectUrl != null) setRedirectUrl(d.redirectUrl as string);
        if (d.imageUrl != null) setImageUrl(d.imageUrl as string);
        if (d.thankyouUrl != null) setThankyouUrl(d.thankyouUrl as string);
        if (d.thankyouBoletoUrl != null) setThankyouBoletoUrl(d.thankyouBoletoUrl as string);
        if (d.thankyouPixUrl != null) setThankyouPixUrl(d.thankyouPixUrl as string);
      },
    );
  }, [productId, planId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(
        `/products/${encodeURIComponent(productId)}/plans/${encodeURIComponent(planId)}`,
        {
          method: 'PUT',
          body: {
            available,
            hideAffiliates,
            freeSample,
            requireEmail,
            requireEmailConfirm,
            requireAddress,
            limitSales,
            salesLimit,
            limitPerApproved,
            approvedLimit,
            minStock,
            stockMin,
            name,
            price,
            items,
            redirectUrl,
            imageUrl,
            thankyouUrl,
            thankyouBoletoUrl,
            thankyouPixUrl,
          },
        },
      );
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      showToast('Configurações salvas!', 'success');
    } catch (e) {
      console.error('Save failed', e);
      showToast('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
  }) => (
    <label className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-teal-600' : 'bg-gray-300'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600';

  return (
    <div className="space-y-8">
      {/* Toggles */}
      <div className="grid gap-x-12 gap-y-1 md:grid-cols-2">
        <div>
          <Toggle checked={available} onChange={setAvailable} label="Disponível para venda?" />
          <Toggle
            checked={hideAffiliates}
            onChange={setHideAffiliates}
            label="Ocultar plano para afiliados?"
          />
          <Toggle checked={freeSample} onChange={setFreeSample} label="Amostra grátis?" />
          <Toggle
            checked={requireEmail}
            onChange={setRequireEmail}
            label="Exigir e-mail na compra?"
          />
          <Toggle
            checked={requireEmailConfirm}
            onChange={setRequireEmailConfirm}
            label="Exigir confirmação de e-mail?"
          />
          <Toggle
            checked={requireAddress}
            onChange={setRequireAddress}
            label="Exigir endereço na compra?"
          />
        </div>
        <div>
          <Toggle
            checked={limitSales}
            onChange={setLimitSales}
            label="Limite de vendas por plano"
          />
          {limitSales && (
            <input
              type="number"
              value={salesLimit}
              onChange={(e) => setSalesLimit(e.target.value)}
              placeholder="Ex: 1000"
              className={`${inputClass} mb-2 ml-14 max-w-[200px]`}
            />
          )}
          <Toggle
            checked={limitPerApproved}
            onChange={setLimitPerApproved}
            label="Limite por venda aprovada"
          />
          {limitPerApproved && (
            <input
              type="number"
              value={approvedLimit}
              onChange={(e) => setApprovedLimit(e.target.value)}
              className={`${inputClass} mb-2 ml-14 max-w-[200px]`}
            />
          )}
          <Toggle
            checked={minStock}
            onChange={setMinStock}
            label="Definir quantidade mínima de estoque?"
          />
          {minStock && (
            <input
              type="number"
              value={stockMin}
              onChange={(e) => setStockMin(e.target.value)}
              className={`${inputClass} mb-2 ml-14 max-w-[200px]`}
            />
          )}
        </div>
      </div>

      {/* Plan Data */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">
          Dados do plano
        </h3>
        <div className="grid gap-8 md:grid-cols-5">
          <div className="md:col-span-2">
            <ImageUpload
              value={imageUrl}
              onChange={setImageUrl}
              label="Imagem do plano (opcional)"
              hint="JPG, PNG · 500x400px"
              previewStorageKey={`kloel_plan_preview_${planId}`}
            />
          </div>
          <div className="space-y-4 md:col-span-3">
            <div>
              <label className={labelClass}>Nome *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
            <CurrencyInput value={price} onChange={setPrice} label="Valor do plano (R$) *" />
          </div>
        </div>
      </div>

      {/* Additional Fields */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>Quantidade de itens inclusos *</label>
          <input
            type="number"
            min={1}
            value={items}
            onChange={(e) => setItems(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>URL de redirecionamento (botão voltar)</label>
          <input
            value={redirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </div>
      </div>

      {/* Thank You URLs */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">
          URLs de obrigado do plano
        </h3>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Página de obrigado</label>
            <input
              value={thankyouUrl}
              onChange={(e) => setThankyouUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Página de obrigado (boletos)</label>
            <input
              value={thankyouBoletoUrl}
              onChange={(e) => setThankyouBoletoUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Página de obrigado (PIX)</label>
            <input
              value={thankyouPixUrl}
              onChange={(e) => setThankyouPixUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: '#E0DDD8', color: '#0A0A0C', boxShadow: 'none' }}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
