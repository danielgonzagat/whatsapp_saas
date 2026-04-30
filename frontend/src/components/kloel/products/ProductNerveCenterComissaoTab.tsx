'use client';

import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import type React from 'react';
import { useCallback, useEffect, useRef, useState, useId } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import { IntegerStepperField, PercentStepperField } from './product-nerve-center.inputs';
import { LabeledFormField } from './LabeledFormField';
import {
  Bg,
  Bt,
  Dv,
  Fd,
  M,
  PanelLoadingState,
  S,
  TabBar,
  Tg,
  V,
  cs,
  is,
  unwrapApiPayload,
  JsonRecord,
} from './product-nerve-center.shared';
import {
  clampIntegerValue,
  formatPercentInput,
  formatBrlAmount,
  formatOneDecimalPercent,
  normalizeLinkUrl,
  parseLocalePercent,
  readEditableHtml,
  syncEditableHtml,
} from './ProductNerveCenterComissaoTab.helpers';

/* ── Data shapes for affiliate / coproduction records ── */
interface AffiliateRequestRecord {
  id: string;
  affiliateName?: string;
  affiliateEmail?: string;
  createdAt?: string;
  status?: string;
  [key: string]: unknown;
}

interface AffiliateLinkRecord {
  id: string;
  affiliateName?: string;
  affiliateEmail?: string;
  active?: boolean;
  clicks?: number;
  sales?: number;
  code?: string;
  slug?: string;
  url?: string;
  [key: string]: unknown;
}

interface AffiliateStatsRecord {
  requests?: number;
  pendingRequests?: number;
  activeLinks?: number;
  commission?: number;
  [key: string]: unknown;
}

/* ── Shared prop types for sub-tabs ── */
interface SubTabProps {
  productId: string;
  p: Record<string, unknown>;
  refreshProduct: () => Promise<void>;
  setAffiliateSummary: (v: JsonRecord | null) => void;
}

type RichTextSaveField = 'merchandContent' | 'affiliateTerms';

function DialogFrame({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.72)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: V.s,
          border: `1px solid ${V.b}`,
          borderRadius: 6,
          padding: 20,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: V.t }}>{title}</h4>
            {description ? (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: V.t2, lineHeight: 1.5 }}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: V.t3,
              cursor: 'pointer',
              padding: 0,
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label={kloelT(`Fechar`)}
          >
            ×
          </button>
        </div>
        <div style={{ marginTop: 16 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

function RichTextToolbar({ onInsertLink }: { onInsertLink: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
      {['B', 'I', 'U'].map((token) => (
        <button
          type="button"
          key={token}
          onClick={() =>
            document.execCommand(token === 'B' ? 'bold' : token === 'I' ? 'italic' : 'underline')
          }
          style={{
            width: 28,
            height: 28,
            background: 'transparent',
            border: `1px solid ${V.b}`,
            borderRadius: 4,
            color: V.t2,
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: token === 'B' ? 'bold' : 'normal',
            fontStyle: token === 'I' ? 'italic' : 'normal',
            textDecoration: token === 'U' ? 'underline' : 'none',
          }}
        >
          {token}
        </button>
      ))}
      <button
        type="button"
        onClick={onInsertLink}
        style={{
          width: 28,
          height: 28,
          background: 'transparent',
          border: `1px solid ${V.b}`,
          borderRadius: 4,
          color: V.t2,
          fontSize: 12,
          cursor: 'pointer',
        }}
        aria-label={kloelT(`Inserir link`)}
      >
        <svg
          aria-hidden="true"
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d={kloelT(`M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71`)} />
          <path d={kloelT(`M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71`)} />
        </svg>
      </button>
    </div>
  );
}

function RichTextEditor({
  editorRef,
  html,
  onChange,
}: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  html: string;
  onChange: (nextHtml: string) => void;
}) {
  useEffect(() => {
    syncEditableHtml(editorRef.current, html);
  }, [editorRef, html]);

  return (
    <div
      ref={editorRef}
      contentEditable
      onInput={(event) => onChange(readEditableHtml(event.currentTarget, html))}
      style={{ minHeight: 140, color: V.t2, fontSize: 13, outline: 'none', fontFamily: S }}
      suppressContentEditableWarning
    />
  );
}

function RichTextContentSubTab({
  productId,
  refreshProduct,
  setAffiliateSummary,
  title,
  description,
  initialValue,
  saveField,
  successToast,
  errorToast,
}: {
  productId: string;
  refreshProduct: () => Promise<void>;
  setAffiliateSummary: (value: JsonRecord | null) => void;
  title: string;
  description?: string;
  initialValue: string;
  saveField: RichTextSaveField;
  successToast: string;
  errorToast: string;
}) {
  const { showToast } = useToast();
  const [content, setContent] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkInputId = useId();
  const editorRef = useRef<HTMLDivElement | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const summary = unwrapApiPayload<JsonRecord | null>(
        await apiFetch(`/products/${productId}/affiliates`, {
          method: 'PUT',
          body: { [saveField]: readEditableHtml(editorRef.current, content) },
        }),
      );
      // PULSE_OK: cache invalidation handled by auto-revalidation
      setAffiliateSummary(summary);
      await refreshProduct();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      showToast(successToast, 'success');
    } catch (error) {
      console.error('Affiliate rich-text save error', { field: saveField, error });
      showToast(error instanceof Error ? error.message : errorToast, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenLinkDialog = () => {
    setLinkValue('');
    setLinkError(null);
    setLinkDialogOpen(true);
  };

  const handleInsertLink = () => {
    const normalizedUrl = normalizeLinkUrl(linkValue);
    if (!normalizedUrl) {
      setLinkError(kloelT(`Informe uma URL válida.`));
      return;
    }

    document.execCommand('createLink', false, normalizedUrl);
    setContent(readEditableHtml(editorRef.current, content));
    setLinkDialogOpen(false);
  };

  return (
    <>
      <div style={{ ...cs, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: '0 0 8px' }}>{title}</h3>
        {description ? (
          <p style={{ fontSize: 12, color: V.t2, marginBottom: 16 }}>{description}</p>
        ) : null}
        <div style={{ background: V.e, border: `1px solid ${V.b}`, borderRadius: 6, padding: 12 }}>
          <RichTextToolbar onInsertLink={handleOpenLinkDialog} />
          <RichTextEditor editorRef={editorRef} html={content} onChange={setContent} />
        </div>
        <Bt primary onClick={handleSave} style={{ marginTop: 16 }}>
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar'}
        </Bt>
        {linkDialogOpen ? (
          <DialogFrame
            title={kloelT(`Inserir link`)}
            description={kloelT(
              `Cole a URL completa para transformar o texto selecionado em um link.`,
            )}
            onClose={() => setLinkDialogOpen(false)}
            footer={
              <>
                <Bt onClick={() => setLinkDialogOpen(false)}>{kloelT(`Cancelar`)}</Bt>
                <Bt primary onClick={handleInsertLink}>
                  {kloelT(`Aplicar link`)}
                </Bt>
              </>
            }
          >
            <label
              htmlFor={linkInputId}
              style={{ display: 'block', fontSize: 11, color: V.t3, marginBottom: 8 }}
            >
              {kloelT(`URL do link`)}
            </label>
            <input
              id={linkInputId}
              value={linkValue}
              onChange={(event) => {
                setLinkValue(event.target.value);
                if (linkError) {
                  setLinkError(null);
                }
              }}
              placeholder="https://"
              style={is}
              autoFocus
            />
            {linkError ? (
              <div style={{ marginTop: 8, fontSize: 11, color: V.r }}>{linkError}</div>
            ) : null}
          </DialogFrame>
        ) : null}
      </div>
    </>
  );
}
