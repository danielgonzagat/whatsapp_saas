'use client';

import { apiFetch } from '@/lib/api';
import { useProducts } from '@/hooks/useProducts';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, useMemo } from 'react';
import { mutate } from 'swr';
import { CriarSiteAskPhase } from './CriarSiteAskPhase';
import { CriarSiteBuildingPhase } from './CriarSiteBuildingPhase';
import { CriarSiteEditorPhase } from './CriarSiteEditorPhase';
import type { SiteItem } from './SitesViewIcons';

const DEFAULT_DYNAMIC_PROMPT =
  'Crie uma página de vendas dinâmica que adapte headline, provas e CTA conforme origem do tráfego, interesse do visitante e produto selecionado.';

export function CriarSite({ mode }: { mode?: string }) {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<'ask' | 'building' | 'editor'>('ask');
  const [prompt, setPrompt] = useState('');
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [savedSiteId, setSavedSiteId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [savedSites, setSavedSites] = useState<SiteItem[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { products: rawProducts } = useProducts();
  const dynamicMode = mode === 'dynamic';
  const source = searchParams?.get('source') || '';
  const productId = searchParams?.get('productId') || '';
  const productName = searchParams?.get('productName') || '';

  useEffect(() => {
    if (!dynamicMode || prompt.trim()) return;
    setPrompt(DEFAULT_DYNAMIC_PROMPT);
  }, [dynamicMode, prompt]);

  useEffect(() => {
    if (prompt.trim() || !productName) return;
    setPrompt(`Crie uma página de vendas para o produto ${productName}, com headline forte, provas, FAQ, CTA principal e integração natural com checkout.`);
  }, [productName, prompt]);

  useEffect(() => {
    setLoadingSites(true);
    apiFetch('/kloel/site/list')
      .then((res) => {
        const data = res.data as { sites?: SiteItem[] } | undefined;
        if (data?.sites) setSavedSites(data.sites);
      })
      .finally(() => setLoadingSites(false));
  }, []);

  const productList = useMemo(() => {
    if (!rawProducts || !Array.isArray(rawProducts)) return [];
    return (rawProducts as Record<string, unknown>[])
      .slice(0, 6)
      .map((p: Record<string, unknown>) => ({
        name: (p.name as string) || (p.title as string) || 'Produto',
        price: (p.price as number) ?? 0,
      }));
  }, [rawProducts]);

  const invalidateSites = () => mutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/site'));

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setError('');
    setPhase('building');
    const res = await apiFetch('/kloel/site/generate', { method: 'POST', body: { prompt: prompt.trim() } });
    if (res.error) { setError(res.error); setPhase('ask'); return; }
    const data = res.data as { html?: string } | undefined;
    if (data?.html) {
      setGeneratedHtml(data.html);
      setSiteName(prompt.trim().slice(0, 60));
      setPhase('editor');
    } else {
      setError('Nenhum HTML foi gerado. Tente novamente.');
      setPhase('ask');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const body = { name: siteName || 'Site sem titulo', htmlContent: generatedHtml };
    if (savedSiteId) {
      const res = await apiFetch(`/kloel/site/${savedSiteId}`, { method: 'PUT', body });
      if (res.error) setError(res.error);
      else invalidateSites();
    } else {
      const res = await apiFetch('/kloel/site/save', { method: 'POST', body });
      if (res.error) { setError(res.error); } else {
        const data = res.data as { site?: { id?: string } } | undefined;
        if (data?.site?.id) setSavedSiteId(data.site.id);
        invalidateSites();
      }
    }
    setSaving(false);
  };

  const handlePublish = async () => {
    let targetId = savedSiteId;
    if (!targetId) {
      setSaving(true);
      setError('');
      const saveRes = await apiFetch('/kloel/site/save', { method: 'POST', body: { name: siteName || 'Site sem titulo', htmlContent: generatedHtml } });
      setSaving(false);
      if (saveRes.error) { setError(saveRes.error); return; }
      const data = saveRes.data as { site?: { id?: string } } | undefined;
      if (!data?.site?.id) { setError('Erro ao salvar site antes de publicar.'); return; }
      targetId = data.site.id;
      setSavedSiteId(targetId);
    }
    setPublishing(true);
    setError('');
    const res = await apiFetch(`/kloel/site/${targetId}/publish`, { method: 'POST' });
    setPublishing(false);
    if (res.error) { setError(res.error); return; }
    const data = res.data as { url?: string } | undefined;
    if (data?.url) setPublishedUrl(data.url);
  };

  const handleEditWithAI = async () => {
    if (!editPrompt.trim()) return;
    setEditLoading(true);
    setError('');
    const res = await apiFetch('/kloel/site/generate', { method: 'POST', body: { prompt: editPrompt.trim(), currentHtml: generatedHtml } });
    setEditLoading(false);
    if (res.error) { setError(res.error); return; }
    const data = res.data as { html?: string } | undefined;
    if (data?.html) { setGeneratedHtml(data.html); setEditPrompt(''); }
  };

  const loadSavedSite = (site: SiteItem) => {
    setGeneratedHtml(site.htmlContent || '');
    setSavedSiteId(site.id);
    setSiteName(site.name || '');
    setPublishedUrl(site.published && site.slug ? `/s/${site.slug}` : '');
    setPhase('editor');
  };

  const handleDelete = async (siteId: string) => {
    const res = await apiFetch(`/kloel/site/${siteId}`, { method: 'DELETE' });
    if (!res.error) {
      setSavedSites((prev) => prev.filter((s) => s.id !== siteId));
      if (savedSiteId === siteId) { setSavedSiteId(null); setGeneratedHtml(''); setPhase('ask'); }
      invalidateSites();
    }
  };

  if (phase === 'building') return <CriarSiteBuildingPhase />;

  if (phase === 'editor') {
    return (
      <CriarSiteEditorPhase
        siteName={siteName}
        setSiteName={setSiteName}
        generatedHtml={generatedHtml}
        savedSiteId={savedSiteId}
        saving={saving}
        handleSave={handleSave}
        publishing={publishing}
        handlePublish={handlePublish}
        publishedUrl={publishedUrl}
        productId={productId}
        editPrompt={editPrompt}
        setEditPrompt={setEditPrompt}
        editLoading={editLoading}
        handleEditWithAI={handleEditWithAI}
        error={error}
        iframeRef={iframeRef}
        onBack={() => { setPhase('ask'); setError(''); setPublishedUrl(''); }}
      />
    );
  }

  return (
    <CriarSiteAskPhase
      prompt={prompt}
      setPrompt={setPrompt}
      handleGenerate={handleGenerate}
      error={error}
      productList={productList}
      savedSites={savedSites}
      loadingSites={loadingSites}
      loadSavedSite={loadSavedSite}
      handleDelete={handleDelete}
      dynamicMode={dynamicMode}
      source={source}
      productName={productName}
      productId={productId}
    />
  );
}
