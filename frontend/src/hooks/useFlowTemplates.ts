'use client';

import { downloadFlowTemplate, listPublicFlowTemplates } from '@/lib/api';
import type { FlowTemplate } from '@/lib/api';
import { useCallback, useState } from 'react';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message || fallback;
  }
  if (typeof err === 'string') {
    return err || fallback;
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message || fallback;
    }
  }
  return fallback;
}

export function useFlowTemplates() {
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPublicFlowTemplates();
      setTemplates(data);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Falha ao carregar templates'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDownload = useCallback(async (templateId: string) => {
    setDownloading((prev) => ({ ...prev, [templateId]: true }));
    try {
      await downloadFlowTemplate(templateId);
      setDownloadedIds((prev) => new Set([...prev, templateId]));
    } catch {
      // non-fatal: template was shown, just increment failed count
    } finally {
      setDownloading((prev) => ({ ...prev, [templateId]: false }));
    }
  }, []);

  return {
    templates,
    loading,
    error,
    downloading,
    downloadedIds,
    fetchTemplates,
    handleDownload,
  };
}
