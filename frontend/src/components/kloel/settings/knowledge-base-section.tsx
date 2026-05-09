'use client';

import { kloelT } from '@/lib/i18n/t';
import { AccordionSection } from './accordion-section';
import { PulseLoader } from '@/components/kloel/PulseLoader';
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
import { uploadKnowledgeBase } from '@/lib/api/ai-assistant';
import { FileText, Plus, Upload } from 'lucide-react';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

interface KnowledgeBaseSectionProps {
  onSourcesLoaded?: (count: number) => void;
}

export function KnowledgeBaseSection({ onSourcesLoaded }: KnowledgeBaseSectionProps) {
  const fid = useId();
  const kbFileRef = useRef<HTMLInputElement>(null);
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

  const [kbUploadFile, setKbUploadFile] = useState<File | null>(null);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbUploadError, setKbUploadError] = useState('');
  const [kbUploadSuccess, setKbUploadSuccess] = useState('');
  const [kbDragOver, setKbDragOver] = useState(false);

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
      setKnowledgeError(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel carregar a base de conhecimento.',
      );
    } finally {
      setKnowledgeLoading(false);
    }
  }, [selectedKnowledgeBaseId, workspaceId]);

  useEffect(() => {
    void hydrateKnowledgeBase();
  }, [hydrateKnowledgeBase]);

  const handleCreateKnowledgeBase = useCallback(async () => {
    if (!workspaceId || !newKnowledgeBaseName.trim()) {
      return;
    }
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
    if (!workspaceId || !selectedKnowledgeBaseId || !knowledgeSourceContent.trim()) {
      return;
    }
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
      setKnowledgeError(
        error instanceof Error ? error.message : 'Nao foi possivel adicionar a fonte.',
      );
      setKnowledgeLoading(false);
    }
  }, [
    hydrateKnowledgeBase,
    knowledgeSourceContent,
    knowledgeSourceType,
    selectedKnowledgeBaseId,
    workspaceId,
  ]);

  const handleKbFileUpload = async (file: File) => {
    if (!selectedKnowledgeBaseId) {
      setKbUploadError('Selecione uma base de conhecimento primeiro.');
      return;
    }
    setKbUploading(true);
    setKbUploadError('');
    setKbUploadSuccess('');
    try {
      await uploadKnowledgeBase(file, selectedKnowledgeBaseId);
      setKbUploadSuccess(`Arquivo ${file.name} enviado com sucesso.`);
      setKbUploadFile(null);
      await hydrateKnowledgeBase();
    } catch (e: unknown) {
      setKbUploadError(e instanceof Error ? e.message : 'Erro ao fazer upload do arquivo.');
    } finally {
      setKbUploading(false);
    }
  };

  const handleKbDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setKbDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setKbUploadFile(file);
    }
  };

  return (
    <AccordionSection icon={FileText} title={kloelT(`Base de conhecimento`)}>
      <div className="space-y-4">
        {(knowledgeError || knowledgeSuccess) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              knowledgeError
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {knowledgeError || knowledgeSuccess}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-[1fr,auto]">
          <Input
            value={newKnowledgeBaseName}
            onChange={(e) => setNewKnowledgeBaseName(e.target.value)}
            placeholder={kloelT(`Nova base de conhecimento`)}
            className="rounded-xl border-gray-200"
          />
          <Button
            onClick={() => void handleCreateKnowledgeBase()}
            disabled={!workspaceId || knowledgeLoading || !newKnowledgeBaseName.trim()}
            className="rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> {kloelT(`Criar base`)}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-[220px,1fr]">
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">{kloelT(`Base selecionada`)}</Label>
              <Select
                value={selectedKnowledgeBaseId}
                onValueChange={setSelectedKnowledgeBaseId}
              >
              <SelectTrigger className="rounded-xl border-gray-200">
                <SelectValue placeholder={kloelT(`Selecione a base`)} />
              </SelectTrigger>
              <SelectContent>
                {knowledgeBases.map((base) => (
                  <SelectItem key={base.id} value={base.id}>
                    {base.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              {knowledgeBases.length} {kloelT(`base(s) carregada(s) do backend.`)}
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="grid gap-3 md:grid-cols-[180px,1fr]">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">{kloelT(`Tipo da fonte`)}</Label>
                <Select
                  value={knowledgeSourceType}
                  onValueChange={(value: 'TEXT' | 'URL' | 'PDF') => setKnowledgeSourceType(value)}
                >
                  <SelectTrigger className="rounded-xl border-gray-200 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEXT">{kloelT(`Texto`)}</SelectItem>
                    <SelectItem value="URL">URL</SelectItem>
                    <SelectItem value="PDF">{kloelT(`PDF (conteudo bruto)`)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">
                  {knowledgeSourceType === 'URL' ? 'URL' : 'Conteudo'}
                </Label>
                <Textarea
                  value={knowledgeSourceContent}
                  onChange={(e) => setKnowledgeSourceContent(e.target.value)}
                  placeholder={
                    knowledgeSourceType === 'URL'
                      ? 'https://seusite.com/artigo'
                      : 'Cole aqui o texto que o Kloel deve aprender.'
                  }
                  className="min-h-[96px] rounded-xl border-gray-200 bg-white"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {kloelT(`Use texto ou URL acima, ou faca upload de arquivo abaixo.`)}
              </p>
              <Button
                onClick={() => void handleAddKnowledgeSource()}
                disabled={
                  !workspaceId ||
                  !selectedKnowledgeBaseId ||
                  knowledgeLoading ||
                  !knowledgeSourceContent.trim()
                }
                className="rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
              >
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" /> {kloelT(`Ingerir fonte`)}
              </Button>
            </div>
          </div>
        </div>

        {knowledgeLoading ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            {kloelT(`Sincronizando base de conhecimento...`)}
          </div>
        ) : null}

        {knowledgeSources.length > 0 ? (
          <div className="space-y-2">
            {knowledgeSources.map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-gray-500" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{source.type}</p>
                    <p className="text-xs text-gray-500">
                      {source.status || 'PENDING'} ·{' '}
                      {source.createdAt
                        ? new Date(source.createdAt).toLocaleString('pt-BR')
                        : 'Sem data'}
                    </p>
                    {source.content ? (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500">{source.content}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {kloelT(`Nenhuma fonte carregada na base de conhecimento selecionada.`)}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {kloelT(`Upload de arquivo (PDF, TXT)`)}
          </p>
          {(kbUploadError || kbUploadSuccess) && (
            <div
              className={`rounded-xl border px-3 py-2 text-xs ${kbUploadError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
            >
              {kbUploadError || kbUploadSuccess}
            </div>
          )}
          <label
            htmlFor={`${fid}-kb-file-input`}
            onDragOver={(e) => {
              e.preventDefault();
              setKbDragOver(true);
            }}
            onDragLeave={() => setKbDragOver(false)}
            onDrop={handleKbDrop}
            aria-label="Selecionar arquivo para base de conhecimento"
            className={`rounded-xl border-2 border-dashed cursor-pointer transition-colors p-6 text-center ${kbDragOver ? 'border-[colors.ember.primary] bg-[colors.ember.primary]/5' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <Upload className="mx-auto mb-2 h-6 w-6 text-gray-400" aria-hidden="true" />
            <p className="text-sm text-gray-600">
              {kbUploadFile ? kbUploadFile.name : 'Arraste um arquivo ou clique para selecionar'}
            </p>
            <p className="mt-1 text-xs text-gray-400">{kloelT(`PDF, TXT, DOCX — max 10MB`)}</p>
            <input
              ref={kbFileRef}
              id={`${fid}-kb-file-input`}
              type="file"
              aria-label="Selecionar arquivo para base de conhecimento (PDF, TXT, DOCX)"
              className="hidden"
              accept={kloelT(`.pdf,.txt,.docx`)}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setKbUploadFile(f);
                }
              }}
            />
          </label>
          {kbUploadFile && (
            <Button
              onClick={() => void handleKbFileUpload(kbUploadFile)}
              disabled={kbUploading || !selectedKnowledgeBaseId}
              className="w-full rounded-xl bg-[colors.ember.primary] text-white hover:bg-[colors.ember.primary]/90"
            >
              {kbUploading ? (
                <PulseLoader width={88} height={18} />
              ) : (
                `Enviar ${kbUploadFile.name}`
              )}
            </Button>
          )}
        </div>
      </div>
    </AccordionSection>
  );
}
