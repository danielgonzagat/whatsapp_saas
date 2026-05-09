'use client';

import { apiFetch } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { EditarSiteList } from './EditarSiteList';
import { EditarSiteEditor } from './EditarSiteEditor';
import type { SiteItem } from './SitesViewIcons';

export function EditarSite({ mode }: { mode?: string }) {
  const searchParams = useSearchParams();
  const [savedSites, setSavedSites] = useState<SiteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<SiteItem | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [variantPrompt, setVariantPrompt] = useState('');
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantNotice, setVariantNotice] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abMode = mode === 'ab';
  const productId = searchParams?.get('productId') || '';

  useEffect(() => {
    apiFetch('/kloel/site/list')
      .then((res) => {
        const data = res.data as { sites?: SiteItem[] } | undefined;
        if (data?.sites) setSavedSites(data.sites);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleEditWithAI = async () => {
    if (!editPrompt.trim() || !selectedSite) return;
    setEditLoading(true);
    setError('');
    const res = await apiFetch('/kloel/site/generate', { method: 'POST', body: { prompt: editPrompt.trim(), currentHtml: selectedSite.htmlContent } });
    setEditLoading(false);
    if (res.error) { setError(res.error); return; }
    const data = res.data as { html?: string } | undefined;
    if (data?.html) { setSelectedSite({ ...selectedSite, htmlContent: data.html }); setEditPrompt(''); }
  };

  const handleSave = async () => {
    if (!selectedSite) return;
    setSaving(true);
    setError('');
    const res = await apiFetch(`/kloel/site/${selectedSite.id}`, { method: 'PUT', body: { name: selectedSite.name, htmlContent: selectedSite.htmlContent } });
    if (res.error) setError(res.error);
    setSaving(false);
  };

  const handleDelete = async (siteId: string) => {
    const res = await apiFetch(`/kloel/site/${siteId}`, { method: 'DELETE' });
    if (!res.error) {
      setSavedSites((prev) => prev.filter((s) => s.id !== siteId));
      if (selectedSite?.id === siteId) setSelectedSite(null);
    }
  };

  const handleCreateVariant = async () => {
    if (!selectedSite || !variantPrompt.trim()) return;
    setVariantLoading(true);
    setVariantNotice('');
    setError('');
    const genRes = await apiFetch('/kloel/site/generate', {
      method: 'POST',
      body: { prompt: `Crie uma variação alternativa A/B deste site mantendo a mesma oferta, mas mudando estrutura, ênfase visual e sequência de persuasão. Objetivo: ${variantPrompt.trim()}`, currentHtml: selectedSite.htmlContent },
    });
    const generatedData = genRes.data as { html?: string } | undefined;
    if (genRes.error || !generatedData?.html) { setVariantLoading(false); setError(genRes.error || 'Falha ao gerar variante.'); return; }
    const variantName = `${selectedSite.name || 'Site'} — Variante B`;
    const saveRes = await apiFetch('/kloel/site/save', { method: 'POST', body: { name: variantName, htmlContent: generatedData.html } });
    setVariantLoading(false);
    const savedData = saveRes.data as { site?: SiteItem } | undefined;
    if (saveRes.error || !savedData?.site) { setError(saveRes.error || 'Falha ao salvar variante.'); return; }
    const newSite = savedData.site;
    setSavedSites((prev) => [newSite, ...prev]);
    setSelectedSite(newSite);
    setVariantPrompt('');
    setVariantNotice(`Variante criada: ${variantName}`);
  };

  if (!selectedSite) {
    return <EditarSiteList savedSites={savedSites} loading={loading} onSelectSite={setSelectedSite} onDeleteSite={handleDelete} />;
  }

  return (
    <EditarSiteEditor
      selectedSite={selectedSite}
      saving={saving}
      handleSave={handleSave}
      error={error}
      editPrompt={editPrompt}
      setEditPrompt={setEditPrompt}
      editLoading={editLoading}
      handleEditWithAI={handleEditWithAI}
      abMode={abMode}
      variantPrompt={variantPrompt}
      setVariantPrompt={setVariantPrompt}
      variantLoading={variantLoading}
      handleCreateVariant={handleCreateVariant}
      variantNotice={variantNotice}
      productId={productId}
      iframeRef={iframeRef}
      onBack={() => setSelectedSite(null)}
    />
  );
}
