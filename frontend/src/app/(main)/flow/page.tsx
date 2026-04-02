'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import FlowBuilder from '@/components/flow/FlowBuilder';
import { useFlows } from '@/hooks/useFlows';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import {
  listFlowExecutions,
  retryFlowExecution,
  listPublicFlowTemplates,
  downloadFlowTemplate,
  optimizeFlow,
  type FlowTemplate,
} from '@/lib/api';
import { Node, Edge } from 'reactflow';
import {
  Plus,
  FileText,
  Play,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  LayoutTemplate,
  Sparkles,
} from 'lucide-react';

function FlowPageContent() {
  const searchParams = useSearchParams();
  const flowId = searchParams.get('id') || `flow-${Date.now()}`;
  const requestedTab = searchParams.get('tab');
  const source = searchParams.get('source') || '';
  const purpose = searchParams.get('purpose') || '';
  const requestedPhone = searchParams.get('phone') || '';
  const requestedLeadId = searchParams.get('leadId') || '';
  const workspaceId = useWorkspaceId();

  const { saveFlow, loading, error } = useFlows(workspaceId);
  const [activeTab, setActiveTab] = useState<'editor' | 'executions' | 'templates'>(
    requestedTab === 'templates' || requestedTab === 'executions' || requestedTab === 'editor'
      ? requestedTab
      : source === 'followups'
        ? 'editor'
        : 'editor',
  );
  const [executions, setExecutions] = useState<any[]>([]);
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  // Templates state
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  // AI Optimize state
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<any>(null);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  const sourceLabel =
    (
      {
        followups: 'Follow-ups',
        leads: 'Leads',
        scrapers: 'Scrapers',
        marketing: 'Marketing',
        inbox: 'Inbox',
      } as Record<string, string>
    )[source] || '';

  useEffect(() => {
    if (
      requestedTab === 'templates' ||
      requestedTab === 'executions' ||
      requestedTab === 'editor'
    ) {
      setActiveTab(requestedTab);
    } else if (source === 'followups') {
      setActiveTab('editor');
    }
  }, [requestedTab, source]);

  const handleSave = useCallback(
    async (flow: { nodes: Node[]; edges: Edge[]; name: string }) => {
      await saveFlow(flowId, flow);
    },
    [flowId, saveFlow],
  );

  const fetchExecutions = useCallback(async () => {
    if (!workspaceId) return;
    setExecLoading(true);
    setExecError(null);
    try {
      const data = await listFlowExecutions(workspaceId, 50);
      setExecutions(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setExecError(err.message || 'Falha ao carregar execuções');
    } finally {
      setExecLoading(false);
    }
  }, [workspaceId]);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const data = await listPublicFlowTemplates();
      setTemplates(data);
    } catch (err: any) {
      setTemplatesError(err.message || 'Falha ao carregar templates');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  const handleRetry = useCallback(
    async (executionId: string) => {
      try {
        await retryFlowExecution(executionId);
        await fetchExecutions();
      } catch (err) {
        setExecError('Falha ao reprocessar execução');
      }
    },
    [fetchExecutions],
  );

  const handleDownloadTemplate = useCallback(async (template: FlowTemplate) => {
    setDownloading((prev) => ({ ...prev, [template.id]: true }));
    try {
      await downloadFlowTemplate(template.id);
      setDownloadedIds((prev) => new Set([...prev, template.id]));
    } catch (err: any) {
      // non-fatal: template was still shown, just increment failed
    } finally {
      setDownloading((prev) => ({ ...prev, [template.id]: false }));
    }
  }, []);

  const handleOptimize = useCallback(async () => {
    const currentFlowId = searchParams.get('id');
    if (!currentFlowId) {
      setOptimizeError('Salve o fluxo primeiro para otimizar com IA');
      return;
    }
    setOptimizing(true);
    setOptimizeError(null);
    setOptimizeResult(null);
    try {
      const result = await optimizeFlow(currentFlowId);
      setOptimizeResult(result);
    } catch (err: any) {
      setOptimizeError(err.message || 'Falha ao otimizar fluxo');
    } finally {
      setOptimizing(false);
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'executions') {
      fetchExecutions();
    }
    if (activeTab === 'templates') {
      fetchTemplates();
    }
  }, [activeTab, fetchExecutions, fetchTemplates]);

  const categoryColors: Record<string, string> = {
    Vendas: '#E85D30',
    Suporte: '#3B82F6',
    Captacao: '#10B981',
    Onboarding: '#8B5CF6',
    Qualificacao: '#F59E0B',
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col" style={{ backgroundColor: '#0A0A0C' }}>
      {(sourceLabel || purpose || requestedPhone || requestedLeadId) && (
        <div className="mx-4 mt-4 rounded-xl border border-[#222226] bg-[#111113] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6E6E73]">
                Contexto operacional
              </p>
              <p className="mt-1 text-sm text-[#E0DDD8]">
                {sourceLabel
                  ? `Você chegou aqui via ${sourceLabel.toLowerCase()}.`
                  : 'Fluxo aberto com contexto operacional.'}{' '}
                {purpose === 'recovery'
                  ? 'Monte uma recuperação para retomar conversão, responder objeções e devolver o lead ao caminho de compra.'
                  : 'Use este fluxo para automatizar a próxima ação comercial no contexto certo.'}
              </p>
              {(requestedPhone || requestedLeadId) && (
                <p className="mt-2 text-xs text-[#6E6E73]">
                  {requestedPhone ? `Contato: ${requestedPhone}` : 'Lead selecionado'}
                  {requestedLeadId ? ` • lead ${requestedLeadId}` : ''}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveTab('templates')}
                className="rounded-lg border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
              >
                Ver templates
              </button>
              <a
                href={
                  requestedPhone
                    ? `/inbox?source=flow&phone=${encodeURIComponent(requestedPhone)}`
                    : '/inbox'
                }
                className="rounded-lg border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
              >
                Abrir Inbox
              </a>
              <a
                href={
                  requestedPhone
                    ? `/leads?source=flow&phone=${encodeURIComponent(requestedPhone)}${requestedLeadId ? `&leadId=${encodeURIComponent(requestedLeadId)}` : ''}`
                    : '/leads'
                }
                className="rounded-lg border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
              >
                Voltar para Leads
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-[#222226] px-4" style={{ backgroundColor: '#111113' }}>
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('editor')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'editor'
                ? 'border-[#E85D30] text-[#E85D30]'
                : 'border-transparent text-[#6E6E73] hover:text-[#E0DDD8]'
            }`}
          >
            <FileText className="w-4 h-4" />
            Editor
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'templates'
                ? 'border-[#E85D30] text-[#E85D30]'
                : 'border-transparent text-[#6E6E73] hover:text-[#E0DDD8]'
            }`}
          >
            <LayoutTemplate className="w-4 h-4" />
            Templates
          </button>
          <button
            onClick={() => setActiveTab('executions')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'executions'
                ? 'border-[#E85D30] text-[#E85D30]'
                : 'border-transparent text-[#6E6E73] hover:text-[#E0DDD8]'
            }`}
          >
            <Clock className="w-4 h-4" />
            Execuções
          </button>

          {/* AI Optimize button — always visible in toolbar */}
          <div className="ml-auto flex items-center pr-2">
            {optimizeResult && (
              <span className="text-xs text-[#10B981] mr-3">
                Sugestoes: {optimizeResult.suggestions?.length ?? 0} melhorias
              </span>
            )}
            {optimizeError && <span className="text-xs text-[#EF4444] mr-3">{optimizeError}</span>}
            <button
              onClick={handleOptimize}
              disabled={optimizing || !searchParams.get('id')}
              title={!searchParams.get('id') ? 'Salve o fluxo primeiro' : 'Otimizar com IA'}
              className="py-2 px-3 flex items-center gap-2 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: optimizing ? 'rgba(232,93,48,0.1)' : 'rgba(232,93,48,0.15)',
                border: '1px solid rgba(232,93,48,0.3)',
                color: '#E85D30',
              }}
            >
              {optimizing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {optimizing ? 'Otimizando...' : 'Otimizar IA'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'editor' && (
          <FlowBuilder flowId={flowId} workspaceId={workspaceId} onSave={handleSave} />
        )}

        {activeTab === 'templates' && (
          <div className="p-6 overflow-y-auto h-full">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-[#E0DDD8]">Templates de Fluxo</h2>
                <p className="text-sm text-[#6E6E73] mt-1">
                  Templates prontos para usar — clique em Usar para copiar nodes/edges ao editor
                </p>
              </div>
              <button
                onClick={fetchTemplates}
                disabled={templatesLoading}
                className="p-2 rounded-md border border-[#222226] text-[#6E6E73] hover:bg-[#19191C] disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${templatesLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {templatesLoading && templates.length === 0 ? (
              <div className="flex items-center gap-2 text-[#6E6E73]">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando templates...
              </div>
            ) : templatesError ? (
              <div className="p-4 rounded-md border border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444] text-sm">
                {templatesError}
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <LayoutTemplate className="w-12 h-12 text-[#3A3A3F]" />
                <p className="text-[#6E6E73] text-sm">Nenhum template publico disponivel ainda</p>
                <p className="text-[#3A3A3F] text-xs">
                  Templates criados por admins aparecerao aqui
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((tmpl) => {
                  const catColor = categoryColors[tmpl.category] || '#6E6E73';
                  const nodeCount = Array.isArray(tmpl.nodes) ? tmpl.nodes.length : 0;
                  const edgeCount = Array.isArray(tmpl.edges) ? tmpl.edges.length : 0;
                  const isDownloaded = downloadedIds.has(tmpl.id);
                  const isDownloading = downloading[tmpl.id];

                  return (
                    <div
                      key={tmpl.id}
                      className="rounded-md border flex flex-col"
                      style={{ backgroundColor: '#111113', borderColor: '#222226' }}
                    >
                      {/* Category bar */}
                      <div className="h-1 rounded-t-md" style={{ background: catColor }} />

                      <div className="p-4 flex-1 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-[#E0DDD8] leading-tight">
                            {tmpl.name}
                          </h3>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full shrink-0"
                            style={{
                              background: `${catColor}20`,
                              color: catColor,
                              border: `1px solid ${catColor}40`,
                            }}
                          >
                            {tmpl.category}
                          </span>
                        </div>

                        {tmpl.description && (
                          <p className="text-xs text-[#6E6E73] leading-relaxed">
                            {tmpl.description}
                          </p>
                        )}

                        <div className="flex items-center gap-3 text-xs text-[#3A3A3F]">
                          <span>{nodeCount} nodes</span>
                          <span>&middot;</span>
                          <span>{edgeCount} conexoes</span>
                          {tmpl.downloads !== undefined && (
                            <>
                              <span>&middot;</span>
                              <span>{tmpl.downloads} usos</span>
                            </>
                          )}
                        </div>

                        <button
                          onClick={() => handleDownloadTemplate(tmpl)}
                          disabled={isDownloading}
                          className="mt-auto w-full py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
                          style={{
                            background: isDownloaded
                              ? 'rgba(16,185,129,0.15)'
                              : 'rgba(232,93,48,0.15)',
                            border: `1px solid ${isDownloaded ? 'rgba(16,185,129,0.3)' : 'rgba(232,93,48,0.3)'}`,
                            color: isDownloaded ? '#10B981' : '#E85D30',
                            cursor: isDownloading ? 'wait' : 'pointer',
                          }}
                        >
                          {isDownloading ? (
                            <span className="flex items-center justify-center gap-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Carregando...
                            </span>
                          ) : isDownloaded ? (
                            'Usado'
                          ) : (
                            'Usar template'
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'executions' && (
          <div className="p-6 space-y-4 overflow-y-auto h-full">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#E0DDD8]">Historico de Execucoes</h2>
              <div className="flex items-center gap-3">
                {execError && <span className="text-sm text-[#EF4444]">{execError}</span>}
                <button
                  onClick={fetchExecutions}
                  disabled={execLoading}
                  className="p-2 rounded-md border border-[#222226] text-[#6E6E73] hover:bg-[#19191C] disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${execLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {execLoading && executions.length === 0 ? (
              <div className="flex items-center gap-2 text-[#6E6E73]">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando execucoes...
              </div>
            ) : executions.length === 0 ? (
              <div className="text-[#6E6E73]">Nenhuma execucao encontrada.</div>
            ) : (
              <div className="space-y-3">
                {executions.map((exec) => (
                  <div
                    key={exec.id}
                    className="p-4 border border-[#222226] rounded-md flex items-center justify-between"
                    style={{ backgroundColor: '#111113' }}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#E0DDD8]">
                          {exec.flow?.name || 'Fluxo'}
                        </span>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            exec.status === 'COMPLETED'
                              ? 'bg-[#10B981]/10 text-[#10B981]'
                              : exec.status === 'FAILED'
                                ? 'bg-[#EF4444]/10 text-[#EF4444]'
                                : 'bg-[#19191C] text-[#6E6E73]'
                          }`}
                        >
                          {exec.status || 'Desconhecido'}
                        </span>
                      </div>
                      <div className="text-sm text-[#6E6E73]">
                        {exec.contact?.name || exec.contact?.phone || 'Contato desconhecido'}
                      </div>
                      <div className="text-xs text-[#6E6E73]">
                        Iniciado em {new Date(exec.createdAt).toLocaleString('pt-BR')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {exec.status === 'FAILED' && (
                        <button
                          onClick={() => handleRetry(exec.id)}
                          className="px-3 py-2 text-sm rounded-md border border-[#222226] text-[#6E6E73] hover:bg-[#19191C]"
                        >
                          <RotateCcw className="w-4 h-4 mr-1 inline" />
                          Reprocessar
                        </button>
                      )}
                      <span className="text-xs text-[#6E6E73]">
                        Atualizado {new Date(exec.updatedAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}

function FlowPageLoading() {
  return (
    <div
      className="h-[calc(100vh-80px)] flex items-center justify-center"
      style={{ backgroundColor: '#0A0A0C' }}
    >
      <Loader2 className="w-8 h-8 animate-spin text-[#E85D30]" />
    </div>
  );
}

export default function FlowPage() {
  return (
    <Suspense fallback={<FlowPageLoading />}>
      <FlowPageContent />
    </Suspense>
  );
}
