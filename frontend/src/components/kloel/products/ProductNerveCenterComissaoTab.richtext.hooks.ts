'use client';

import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import { useId, useRef, useState } from 'react';
import { unwrapApiPayload, type JsonRecord } from './product-nerve-center.shared';
import {
  normalizeLinkUrl,
  readEditableHtml,
} from './ProductNerveCenterComissaoTab.helpers';
import type { RichTextSaveField } from './ProductNerveCenterComissaoTab.types';

export function useRichTextContent(
  productId: string,
  refreshProduct: () => Promise<void>,
  setAffiliateSummary: (value: JsonRecord | null) => void,
  initialValue: string,
  saveField: RichTextSaveField,
  successToast: string,
  errorToast: string,
) {
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

  return {
    content,
    setContent,
    saving,
    saved,
    linkDialogOpen,
    setLinkDialogOpen,
    linkValue,
    setLinkValue,
    linkError,
    setLinkError,
    linkInputId,
    editorRef,
    handleSave,
    handleOpenLinkDialog,
    handleInsertLink,
  };
}
