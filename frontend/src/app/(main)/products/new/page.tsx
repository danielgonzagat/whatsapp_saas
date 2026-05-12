'use client';
import { colors, typography } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
export const dynamic = 'force-dynamic';

import { useToast } from '@/components/kloel/ToastProvider';
import { usePersistentImagePreview } from '@/hooks/usePersistentImagePreview';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { apiFetch } from '@/lib/api';
import { useProductCategories } from '@/hooks/useProducts';
import { readFileAsDataUrl, uploadGenericMedia } from '@/lib/media-upload';
import { buildProductCreatePayload, extractCreatedProductId } from './page.helpers';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mutate } from 'swr';

import { MonitorStepper } from './monitor-stepper';
import { initialForm, type FormState } from './types';
import { StepDetalhes } from './step-detalhes';
import { StepVendas } from './step-vendas';
import { StepEmbalagem } from './step-embalagem';
import { StepEntrega } from './step-entrega';
import { StepAfiliacao } from './step-afiliacao';
import { StepPagamento } from './step-pagamento';
import { StepRevisao } from './step-revisao';

export default function NewProductPage() {
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [tagInput, setTagInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const { categories, isLoading: catLoading, error: catError } = useProductCategories();
  const {
    previewUrl: localPreviewUrl,
    clearPreview: clearLocalPreview,
    setPreviewUrl: setLocalPreviewUrl,
  } = usePersistentImagePreview({
    storageKey: 'kloel_product_preview',
  });

  const needsPhysical = form.format === 'PHYSICAL' || form.format === 'HYBRID';
  const visibleSteps = needsPhysical ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 5, 6, 7];

  const currentVisibleIndex = visibleSteps.indexOf(step);
  const isLastStep = currentVisibleIndex === visibleSteps.length - 1;
  const isFirstStep = currentVisibleIndex === 0;

  const goNext = () => {
    if (currentVisibleIndex < visibleSteps.length - 1) {
      setStep(visibleSteps[currentVisibleIndex + 1]);
    }
  };

  const goPrev = () => {
    if (currentVisibleIndex > 0) {
      setStep(visibleSteps[currentVisibleIndex - 1]);
    } else {
      router.push('/products');
    }
  };

  const updateForm = (partial: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const handleTagAdd = () => {
    const t = tagInput.trim();
    if (t && form.tags.length < 5 && !form.tags.includes(t)) {
      updateForm({ tags: [...form.tags, t] });
      setTagInput('');
    }
  };

  const handleTagRemove = (tag: string) => {
    updateForm({ tags: form.tags.filter((t) => t !== tag) });
  };

  const handleCarrierToggle = (carrier: string) => {
    if (form.carriers.includes(carrier)) {
      updateForm({ carriers: form.carriers.filter((c) => c !== carrier) });
    } else {
      updateForm({ carriers: [...form.carriers, carrier] });
    }
  };

  const handleFileUpload = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    setLocalPreviewUrl(dataUrl);

    setUploading(true);
    try {
      const uploadedUrl = await uploadGenericMedia(file, { folder: 'products' });
      if (uploadedUrl) {
        updateForm({ imageUrl: uploadedUrl });
      }
    } catch (e) {
      console.error('Upload failed:', e);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Informe o nome do produto antes de salvar.', 'error');
      return;
    }

    setSaving(true);
    try {
      const body = buildProductCreatePayload(form, workspaceId, needsPhysical);

      const res = await apiFetch<Record<string, unknown>>('/products', { method: 'POST', body });

      if (res.error) {
        showToast(res.error, 'error');
        return;
      }

      const responsePayload = (res.data ?? null) as Record<string, unknown> | null;
      const createdProductId = extractCreatedProductId(responsePayload);

      await mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      clearLocalPreview();
      showToast('Produto salvo com sucesso.', 'success');

      if (createdProductId) {
        router.push(`/products/${createdProductId}`);
        return;
      }

      router.push('/products');
    } catch (error: unknown) {
      console.error('Erro ao salvar produto', error);
      showToast(
        error instanceof Error ? error.message : 'Nao foi possivel salvar o produto.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="product-create-root"
      style={{
        height: '100vh',
        backgroundColor: colors.background.void,
        position: 'relative',
        overflowY: 'auto',
      }}
    >
      <style>{`*{box-sizing:border-box}:root{--pg2:1fr 1fr;--pg3:repeat(3,1fr)}@media(max-width:640px){:root{--pg2:1fr;--pg3:1fr}}`}</style>

      <div
        className="pnew-wrap"
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '24px clamp(12px, 4vw, 24px)',
          paddingBottom: '80px',
          maxWidth: 780,
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <p
            style={{
              fontSize: 12,
              color: colors.text.dust,
              fontFamily: typography.fontFamily.sans,
              marginBottom: 4,
            }}
          >
            {kloelT('Home &rarr; Produtos &rarr; Cadastrar produto')}
          </p>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              fontFamily: typography.fontFamily.display,
              color: colors.text.starlight,
              margin: 0,
              letterSpacing: '0.02em',
            }}
          >
            {kloelT('Cadastrar produto')}
          </h1>
        </div>

        <MonitorStepper currentStep={step} visibleSteps={visibleSteps} />

        {step === 1 && (
          <StepDetalhes
            form={form}
            updateForm={updateForm}
            tagInput={tagInput}
            setTagInput={setTagInput}
            onTagAdd={handleTagAdd}
            onTagRemove={handleTagRemove}
            categories={categories}
            catLoading={catLoading}
            catError={catError}
            localPreviewUrl={localPreviewUrl}
            uploading={uploading}
            onFileSelect={handleFileUpload}
            onClearPreview={clearLocalPreview}
          />
        )}

        {step === 2 && <StepVendas form={form} updateForm={updateForm} />}

        {step === 3 && needsPhysical && <StepEmbalagem form={form} updateForm={updateForm} />}

        {step === 4 && needsPhysical && (
          <StepEntrega
            form={form}
            updateForm={updateForm}
            onCarrierToggle={handleCarrierToggle}
          />
        )}

        {step === 5 && <StepAfiliacao form={form} updateForm={updateForm} />}

        {step === 6 && <StepPagamento form={form} updateForm={updateForm} />}

        {step === 7 && (
          <StepRevisao form={form} needsPhysical={needsPhysical} onEditStep={setStep} />
        )}

        <div
          style={{
            position: 'sticky',
            bottom: 0,
            background: 'var(--app-bg-primary)',
            borderTop: `1px solid ${colors.border.space}`,
            padding: '16px 0',
            zIndex: 10,
            marginTop: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            onClick={goPrev}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 6,
              border: `1px solid ${colors.border.space}`,
              backgroundColor: 'transparent',
              color: colors.text.moonlight,
              fontSize: 14,
              fontWeight: 500,
              fontFamily: typography.fontFamily.sans,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                colors.background.nebula;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} aria-hidden="true" />
            {isFirstStep ? 'Voltar' : 'Anterior'}
          </button>

          {!isLastStep ? (
            <button
              type="button"
              onClick={goNext}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 24px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: colors.accent.webb,
                color: 'var(--app-text-on-accent)',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: typography.fontFamily.display,
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  colors.accent.webbHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = colors.accent.webb;
              }}
            >
              {kloelT('Continuar')}
              <ArrowRight style={{ width: 16, height: 16 }} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 28px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: saving || !form.name ? colors.border.space : colors.accent.webb,
                color: 'var(--app-text-on-accent)',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: typography.fontFamily.display,
                cursor: saving || !form.name ? 'not-allowed' : 'pointer',
                transition: 'all 150ms ease',
                opacity: saving || !form.name ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!saving && form.name) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    colors.accent.webbHover;
                }
              }}
              onMouseLeave={(e) => {
                if (!saving && form.name) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = colors.accent.webb;
                }
              }}
            >
              {saving ? (
                <div
                  style={{
                    width: 20,
                    height: 20,
                    border: '2px solid transparent',
                    borderTopColor: colors.ember.primary,
                    borderRadius: '16%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
              ) : (
                <Check style={{ width: 16, height: 16 }} aria-hidden="true" />
              )}
              {saving ? 'Salvando...' : 'Publicar Produto'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
