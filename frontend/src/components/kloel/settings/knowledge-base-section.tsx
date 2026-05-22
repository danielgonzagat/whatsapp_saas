'use client';

import { kloelT } from '@/lib/i18n/t';
import { AccordionSection } from './accordion-section';
import { KbFileUpload } from './kb-file-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  type KnowledgeBaseItem,
  type KnowledgeSourceItem,
  knowledgeBaseApi,
  tokenStorage,
} from '@/lib/api';
import { FileText, Plus, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface KnowledgeBaseSectionProps {
  onSourcesLoaded?: (count: number) => void;
}

export function KnowledgeBaseSection({ onSourcesLoaded }: KnowledgeBaseSectionProps) {
  const workspaceId = tokenStorage.getWorkspaceId();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState('');
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSourceItem[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState('');
  const [knowledgeSuccess, setKnowledgeSuccess] = useState('');
  const [newKnowledgeBaseName, setNewKnowledgeBaseName] = useState('');
  const [knowledgeSourceType, setKnowledgeSourceType] = useState<'TEXT' | 'URL' | 'PDF'>('TEXT');
  const [knowledgeSourceContent, setKnowledgeSourceContent] = useState('');

  const hydrateKnowledgeBase = useCallback(async () => {
    if (!workspaceId) {
      setKnowledgeBases([]);
      setKnowledgeSources([]);
      setSelectedKnowledgeBaseId('');
      return;
    }
    setKnowledgeLoading(true);
    setKnowledgeError('');
    try {
      const response = await knowledgeBaseApi.list();
      const items = (response.data as KnowledgeBaseItem[]) || [];
      setKnowledgeBases(items);
      const nextSelectedId = selectedKnowledgeBaseId || items[0]?.id || '';
      setSelectedKnowledgeBaseId(nextSelectedId);
      if (nextSelectedId) {
        const sourcesResponse = await knowledgeBaseApi.listSources(nextSelectedId);
        const sources = (sourcesResponse.data as KnowledgeSourceItem[]) || [];
        setKnowledgeSources(sources);
        onSourcesLoaded?.(sources.length);
      } else {
        setKnowledgeSources([]);
        onSourcesLoaded?.(0);
      }
    } catch (error: unknown) {
      setKnowledgeError(error instanceof Error ? error.message : 'Nao foi possivel carregar a base.');
    } finally {
      setKnowledgeLoading(false);
    }
  }, [selectedKnowledgeBaseId, workspaceId, onSourcesLoaded]);

  useEffect(() => {
    void hydrateKnowledgeBase();
  }, [hydrateKnowledgeBase]);

  const handleCreateKnowledgeBase = useCallback(async () => {
    if (!workspaceId || !newKnowledgeBaseName.trim()) {return;}
    setKnowledgeLoading(true);
    setKnowledgeError('');
    setKnowledgeSuccess('');
    try {
      const response = await knowledgeBaseApi.create(newKnowledgeBaseName.trim());
      const created = response.data as KnowledgeBaseItem;
      setKnowledgeSuccess(`Base ${created?.name || newKnowledgeBaseName} criada.`);
      setNewKnowledgeBaseName('');
      setSelectedKnowledgeBaseId(created?.id || '');
      await hydrateKnowledgeBase();
    } catch (error: unknown) {
      setKnowledgeError(error instanceof Error ? error.message : 'Nao foi possivel criar a base.');
      setKnowledgeLoading(false);
    }
  }, [hydrateKnowledgeBase, newKnowledgeBaseName, workspaceId]);

  const handleAddKnowledgeSource = useCallback(async () => {
    if (!workspaceId || !selectedKnowledgeBaseId || !knowledgeSourceContent.trim()) {return;}
    setKnowledgeLoading(true);
    setKnowledgeError('');
    setKnowledgeSuccess('');
    try {
      await knowledgeBaseApi.addSource(selectedKnowledgeBaseId, {
        type: knowledgeSourceType,
        content: knowledgeSourceContent.trim(),
      });
      setKnowledgeSuccess('Fonte de conhecimento enviada para ingestao.');
      setKnowledgeSourceContent('');
      await hydrateKnowledgeBase();
    } catch (error: unknown) {
      setKnowledgeError(error instanceof Error ? error.message : 'Nao foi possivel adicionar a fonte.');
      setKnowledgeLoading(false);
    }
  }, [hydrateKnowledgeBase, knowledgeSourceContent, knowledgeSourceType, selectedKnowledgeBaseId, workspaceId]);

  return (
    <AccordionSection icon={FileText} title={kloelT(`Base de conhecimento`)}>
      <div className="space-y-4">
        {(knowledgeError || knowledgeSuccess) && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${knowledgeError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {knowledgeError || knowledgeSuccess}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-[1fr,auto]">
          <Input value={newKnowledgeBaseName} onChange={(e) => setNewKnowledgeBaseName(e.target.value)} placeholder={kloelT(`Nova base de conhecimento`)} className="rounded-xl border-gray-200" />
          <Button onClick={() => void handleCreateKnowledgeBase()} disabled={!workspaceId || knowledgeLoading || !newKnowledgeBaseName.trim()} className="rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> {kloelT(`Criar base`)}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-[220px,1fr]">
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">{kloelT(`Base selecionada`)}</Label>
            <Select value={selectedKnowledgeBaseId} onValueChange={setSelectedKnowledgeBaseId}>
              <SelectTrigger className="rounded-xl border-gray-200">
                <SelectValue placeholder={kloelT(`Selecione a base`)} />
              </SelectTrigger>
              <SelectContent>
                {knowledgeBases.map((base) => (<SelectItem key={base.id} value={base.id}>{base.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">{knowledgeBases.length} {kloelT(`base(s) carregada(s).`)}</p>
          </div>
          <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="grid gap-3 md:grid-cols-[180px,1fr]">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">{kloelT(`Tipo da fonte`)}</Label>
                <Select value={knowledgeSourceType} onValueChange={(value: 'TEXT' | 'URL' | 'PDF') => setKnowledgeSourceType(value)}>
                  <SelectTrigger className="rounded-xl border-gray-200 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEXT">{kloelT(`Texto`)}</SelectItem>
                    <SelectItem value="URL">URL</SelectItem>
                    <SelectItem value="PDF">{kloelT(`PDF (conteudo bruto)`)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">{knowledgeSourceType === 'URL' ? 'URL' : 'Conteudo'}</Label>
                <Textarea value={knowledgeSourceContent} onChange={(e) => setKnowledgeSourceContent(e.target.value)} placeholder={knowledgeSourceType === 'URL' ? 'https://seusite.com/artigo' : 'Cole aqui o texto que o Kloel deve aprender.'} className="min-h-[96px] rounded-xl border-gray-200 bg-white" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">{kloelT(`Use texto ou URL acima, ou faca upload de arquivo abaixo.`)}</p>
              <Button onClick={() => void handleAddKnowledgeSource()} disabled={!workspaceId || !selectedKnowledgeBaseId || knowledgeLoading || !knowledgeSourceContent.trim()} className="rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]">
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" /> {kloelT(`Ingerir fonte`)}
              </Button>
            </div>
          </div>
        </div>
        {knowledgeLoading ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">{kloelT(`Sincronizando base...`)}</div>
        ) : null}
        {knowledgeSources.length > 0 ? (
          <div className="space-y-2">
            {knowledgeSources.map((source) => (
              <div key={source.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-gray-500" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{source.type}</p>
                    <p className="text-xs text-gray-500">{source.status || 'PENDING'} · {source.createdAt ? new Date(source.createdAt).toLocaleString('pt-BR') : 'Sem data'}</p>
                    {source.content ? <p className="mt-1 line-clamp-2 text-xs text-gray-500">{source.content}</p> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">{kloelT(`Nenhuma fonte carregada na base selecionada.`)}</p>
        )}
        <KbFileUpload selectedKbId={selectedKnowledgeBaseId} onUploaded={hydrateKnowledgeBase} />
      </div>
    </AccordionSection>
  );
}
