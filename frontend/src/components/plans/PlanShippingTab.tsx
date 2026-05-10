'use client';
import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import { Sparkles } from 'lucide-react';
import { useEffect, useState, useId } from 'react';
import { mutate } from 'swr';
import { applyPlanShippingPayload } from './PlanShippingTab.helpers';
import {
  REGIONS,
  FAQ_QUESTIONS,
  FAQ_ANSWERS,
} from './PlanShippingTab.constants';
import { PlanShippingSections } from './PlanShippingTab.sections';
import { PlanFaqSection } from './PlanShippingTab.faq-section';

/** Plan shipping tab. */
export function PlanShippingTab({ planId, productId }: { planId: string; productId: string }) {
  const fid = useId();
  const [packageType, setPackageType] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [length, setLength] = useState('');
  const [weight, setWeight] = useState('');
  const [whoShips, setWhoShips] = useState('self');
  const [shipFrom, setShipFrom] = useState('my_address');
  const [dispatchTime, setDispatchTime] = useState('3');
  const [selectedCarriers, setSelectedCarriers] = useState<string[]>([
    'Correios PAC',
    'Correios SEDEX',
  ]);
  const [freightType, setFreightType] = useState('calculated');
  const [fixedFreight, setFixedFreight] = useState('');
  const [hasTracking, setHasTracking] = useState('all');
  const [regionPrazos, setRegionPrazos] = useState<Record<string, { prazo: string; obs: string }>>(
    Object.fromEntries(REGIONS.map((r) => [r, { prazo: '5-7 dias', obs: 'Entrega normal' }])),
  );
  const [faqAnswers, setFaqAnswers] = useState<Record<number, string>>(
    Object.fromEntries(FAQ_QUESTIONS.map((_, i) => [i, FAQ_ANSWERS[i]?.[0] || ''])),
  );
  const [openFaqs, setOpenFaqs] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!productId || !planId) {
      return;
    }
    apiFetch(`/products/${encodeURIComponent(productId)}/plans/${encodeURIComponent(planId)}`).then(
      (res) => {
        if (res.error || !res.data) {
          return;
        }
        applyPlanShippingPayload(res.data as Record<string, unknown>, {
          setPackageType,
          setWidth,
          setHeight,
          setLength,
          setWeight,
          setWhoShips,
          setShipFrom,
          setDispatchTime,
          setSelectedCarriers,
          setFreightType,
          setFixedFreight,
          setHasTracking,
          setRegionPrazos,
          setFaqAnswers,
        });
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
            packageType,
            dimensions: { width, height, length },
            weight,
            shipper: whoShips,
            shipFrom,
            dispatchTime,
            carriers: selectedCarriers,
            shippingCost: freightType === 'fixed' ? fixedFreight : freightType,
            regionPrazos,
            tracking: hasTracking,
            faqAnswers,
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

  const toggleFaq = (i: number) => setOpenFaqs({ ...openFaqs, [i]: !openFaqs[i] });

  return (
    <div className="space-y-8">
      <PlanShippingSections
        fid={fid}
        packageType={packageType}
        setPackageType={setPackageType}
        width={width}
        setWidth={setWidth}
        height={height}
        setHeight={setHeight}
        length={length}
        setLength={setLength}
        weight={weight}
        setWeight={setWeight}
        whoShips={whoShips}
        setWhoShips={setWhoShips}
        shipFrom={shipFrom}
        setShipFrom={setShipFrom}
        dispatchTime={dispatchTime}
        setDispatchTime={setDispatchTime}
        selectedCarriers={selectedCarriers}
        setSelectedCarriers={setSelectedCarriers}
        freightType={freightType}
        setFreightType={setFreightType}
        fixedFreight={fixedFreight}
        setFixedFreight={setFixedFreight}
        hasTracking={hasTracking}
        setHasTracking={setHasTracking}
        regionPrazos={regionPrazos}
        setRegionPrazos={setRegionPrazos}
      />

      <PlanFaqSection
        faqAnswers={faqAnswers}
        setFaqAnswers={setFaqAnswers}
        openFaqs={openFaqs}
        toggleFaq={toggleFaq}
      />

      {/* AI Note */}
      <div
        className="flex items-start gap-3 rounded-xl p-5"
        style={{
          background: `${colors.accent.webb}05`,
          border: `1px solid ${colors.accent.webb}30`,
          boxShadow: `0 0 20px ${colors.accent.webb}10, 0 0 40px ${colors.accent.webb}05`,
        }}
      >
        <Sparkles
          className="mt-0.5 h-5 w-5 flex-shrink-0"
          style={{ color: colors.accent.webb }}
          aria-hidden="true"
        />
        <p className="text-sm" style={{ color: colors.text.moonlight }}>
          {kloelT(`A IA do Kloel usará todas as informações configuradas nesta página para responder
          automaticamente perguntas dos seus clientes sobre entrega, rastreamento e prazos.`)}
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: colors.background.space, color: colors.text.void }}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
