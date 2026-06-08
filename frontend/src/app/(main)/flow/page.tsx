'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import FlowBuilder from '@/components/flow/FlowBuilder';
import { FlowContextBar } from '@/components/flow/FlowContextBar';
import { FlowExecutionsTab } from '@/components/flow/FlowExecutionsTab';
import { FlowTemplatesTab } from '@/components/flow/FlowTemplatesTab';
import { KloelLoadingState, KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { useFlowExecutions } from '@/hooks/useFlowExecutions';
import { useFlowOptimize } from '@/hooks/useFlowOptimize';
import { useFlowTemplates } from '@/hooks/useFlowTemplates';
import { useFlows, type Flow } from '@/hooks/useFlows';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { Clock, FileText, LayoutTemplate, Sparkles } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import type { Edge, Node } from 'reactflow';

const CATEGORY_COLORS: Record<string, string> = {
  Vendas: colors.ember.primary,
  Suporte: colors.semantic.info,
  Captacao: colors.semantic.success,
  Onboarding: colors.semantic.purple,
  Qualificacao: colors.semantic.warning,
};

const SOURCE_LABELS: Record<string, string> = {
  followups: 'Follow-ups',
  leads: 'Leads',
  scrapers: 'Scrapers',
  marketing: 'Marketing',
  inbox: 'Inbox',
};

const FLOW_TEST_USER = 'kloel-flow-test-runner';

function FlowPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [fallbackFlowId] = useState(() => `flow-${Date.now()}`);
  const existingFlowId = searchParams.get('id') || '';
  const [savedFlowId, setSavedFlowId] = useState(existingFlowId);
  const flowId = existingFlowId || savedFlowId || fallbackFlowId;
  const requestedTab = searchParams.get('tab');
  const source = searchParams.get('source') || '';
  const purpose = searchParams.get('purpose') || '';
  const requestedPhone = searchParams.get('phone') || '';
  const requestedLeadId = searchParams.get('leadId') || '';
  const persistedFlowId = existingFlowId || savedFlowId;
  const workspaceId = useWorkspaceId();

  const { saveFlow, fetchFlow, runFlow, error } = useFlows(workspaceId);
  const {
    executions,
    loading: execLoading,
    error: execError,
    fetchExecutions,
    handleRetry,
  } = useFlowExecutions(workspaceId);
  const {
    templates,
    loading: templatesLoading,
    error: templatesError,
    downloading,
    downloadedIds,
    fetchTemplates,
    handleDownload,
  } = useFlowTemplates();
  const {
    optimizing,
    result: optimizeResult,
    error: optimizeError,
    handleOptimize,
  } = useFlowOptimize(persistedFlowId || null);

  const [activeTab, setActiveTab] = useState<'editor' | 'executions' | 'templates'>(
    requestedTab === 'templates' || requestedTab === 'executions' || requestedTab === 'editor'
      ? requestedTab
      : source === 'followups'
        ? 'editor'
        : 'editor',
  );

  const sourceLabel = SOURCE_LABELS[source] || '';
  const [operationNotice, setOperationNotice] = useState<string | null>(null);


  useEffect(() => {
    if (!existingFlowId) {
      return;
    }
    queueMicrotask(() => setSavedFlowId(existingFlowId));
  }, [existingFlowId]);

  useEffect(() => {
    if (
      requestedTab === 'templates' ||
      requestedTab === 'executions' ||
      requestedTab === 'editor'
    ) {
      queueMicrotask(() => setActiveTab(requestedTab));
    } else if (source === 'followups') {
      queueMicrotask(() => setActiveTab('editor'));
    }
  }, [requestedTab, source]);

  const persistFlow = useCallback(
    async (flow: { nodes: Node[]; edges: Edge[]; name: string }) => {
      const saved = await saveFlow(flowId, flow);
      const confirmedFlowId = saved?.id || flowId;
      setSavedFlowId(confirmedFlowId);

      if (!existingFlowId) {
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.set('id', confirmedFlowId);
        router.replace(`/flow?${nextParams.toString()}`);
      }

      return confirmedFlowId;
    },
    [existingFlowId, flowId, router, saveFlow, searchParams],
  );

  const handleSave = useCallback(
    async (flow: { nodes: Node[]; edges: Edge[]; name: string }) => {
      setOperationNotice(null);
      await persistFlow(flow);
      setOperationNotice(kloelT('Fluxo salvo'));
    },
    [persistFlow],
  );

  const handleTest = useCallback(
    async (flow: { nodes: Node[]; edges: Edge[]; name: string }) => {
      setOperationNotice(null);
      const confirmedFlowId = await persistFlow(flow);
      const startNode = flow.nodes.find((node) => node.type === 'start')?.id || flow.nodes[0]?.id;

      if (!startNode) {
        throw new Error('Fluxo precisa ter pelo menos um nó para testar');
      }

      await runFlow(confirmedFlowId, FLOW_TEST_USER, startNode);
      void fetchExecutions();
      setOperationNotice(kloelT('Teste executado'));
    },
    [fetchExecutions, persistFlow, runFlow],
  );

  // Load an existing flow before mounting the builder. Opening ?id=<flow> used to
  // mount FlowBuilder with an empty seed; if the user then clicked Salvar, that
  // blank graph overwrote the saved nodes/edges (silent data loss). We now gate
  // the builder until the saved flow is fetched and pass it as initial state.
  const [loadedFlow, setLoadedFlow] = useState<Flow | null>(null);
  const [flowReady, setFlowReady] = useState(!existingFlowId);

  useEffect(() => {
    let cancelled = false;
    const setFlowReadyIfMounted = (ready: boolean) => {
      queueMicrotask(() => {
        if (!cancelled) {
          setFlowReady(ready);
        }
      });
    };

    if (!existingFlowId || !workspaceId) {
      setFlowReadyIfMounted(true);
      return () => {
        cancelled = true;
      };
    }

    setFlowReadyIfMounted(false);
    void fetchFlow(existingFlowId).then((flow) => {
      if (cancelled) {
        return;
      }
      setLoadedFlow(flow);
      setFlowReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [existingFlowId, workspaceId, fetchFlow]);

  useEffect(() => {
    if (activeTab === 'executions') {
      fetchExecutions();
    }
    if (activeTab === 'templates') {
      fetchTemplates();
    }
  }, [activeTab, fetchExecutions, fetchTemplates]);

  return (
    <div
      className="h-[calc(100vh-80px)] flex flex-col"
      style={{ backgroundColor: 'var(--app-bg-primary)' }}
    >
      {(sourceLabel || purpose || requestedPhone || requestedLeadId) && (
        <FlowContextBar
          sourceLabel={sourceLabel}
          purpose={purpose}
          requestedPhone={requestedPhone}
          requestedLeadId={requestedLeadId}
          onOpenTemplates={() => setActiveTab('templates')}
        />
      )}

      {/* Tab Navigation */}
      <div
        className="border-b border-border px-4"
        style={{ backgroundColor: 'var(--app-bg-card)' }}
      >
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'editor'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="w-4 h-4" aria-hidden="true" />
            {kloelT('Editor')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'templates'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutTemplate className="w-4 h-4" aria-hidden="true" />
            {kloelT('Templates')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('executions')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'executions'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="w-4 h-4" aria-hidden="true" />
            {kloelT('Execuções')}
          </button>

          {/* AI Optimize button */}
          <div className="ml-auto flex items-center pr-2">
            {optimizeResult && (
              <span className="text-xs text-[var(--semantic-success)] mr-3">
                {kloelT('Sugestões:')} {optimizeResult.suggestions?.length ?? 0} melhorias
              </span>
            )}
            {optimizeError && (
              <span className="text-xs text-[var(--semantic-error)] mr-3">{optimizeError}</span>
            )}
            <button
              type="button"
              onClick={handleOptimize}
              disabled={optimizing || !persistedFlowId}
              title={!persistedFlowId ? 'Salve o fluxo primeiro' : 'Otimizar com IA'}
              className="py-2 px-3 flex items-center gap-2 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: optimizing ? 'rgba(232,93,48,0.1)' : 'rgba(232,93,48,0.15)',
                border: '1px solid rgba(232,93,48,0.3)',
                color: colors.ember.primary,
              }}
            >
              {optimizing ? (
                <KloelMushroomMark size={18} title="Otimizando" traceColor={colors.ember.primary} />
              ) : (
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              )}
              {optimizing ? 'Otimizando...' : 'Otimizar IA'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'editor' &&
          (flowReady ? (
            <FlowBuilder
              key={flowId}
              flowId={flowId}
              workspaceId={workspaceId}
              initialNodes={loadedFlow?.nodes ?? []}
              initialEdges={loadedFlow?.edges ?? []}
              initialName={loadedFlow?.name ?? ''}
              onSave={handleSave}
              onTest={handleTest}
              suppressSuccessNotice
            />
          ) : (
            <KloelLoadingState />
          ))}

        {activeTab === 'templates' && (
          <FlowTemplatesTab
            templates={templates}
            loading={templatesLoading}
            error={templatesError}
            downloading={downloading}
            downloadedIds={downloadedIds}
            categoryColors={CATEGORY_COLORS}
            onRefresh={fetchTemplates}
            onDownload={handleDownload}
          />
        )}

        {activeTab === 'executions' && (
          <FlowExecutionsTab
            executions={executions}
            loading={execLoading}
            error={execError}
            onRefresh={fetchExecutions}
            onRetry={handleRetry}
          />
        )}
      </div>

      {operationNotice && (
        <div role="status" className="fixed bottom-16 right-4 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 shadow-sm">
          {operationNotice}
        </div>
      )}

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
      style={{ backgroundColor: 'var(--app-bg-primary)' }}
    >
      <KloelLoadingState
        size={88}
        traceColor={colors.ember.primary}
        label={kloelT('Carregando fluxos')}
        minHeight="calc(100vh - 80px)"
      />
    </div>
  );
}

/** Flow page. */
export default function FlowPage() {
  return (
    <Suspense fallback={<FlowPageLoading />}>
      <FlowPageContent />
    </Suspense>
  );
}
