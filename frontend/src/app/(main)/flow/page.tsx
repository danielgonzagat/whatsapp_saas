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
import { useFlows } from '@/hooks/useFlows';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { Clock, FileText, LayoutTemplate, Sparkles } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
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

function FlowPageContent() {
  const searchParams = useSearchParams();
  const [fallbackFlowId] = useState(() => `flow-${Date.now()}`);
  const flowId = searchParams.get('id') || fallbackFlowId;
  const requestedTab = searchParams.get('tab');
  const source = searchParams.get('source') || '';
  const purpose = searchParams.get('purpose') || '';
  const requestedPhone = searchParams.get('phone') || '';
  const requestedLeadId = searchParams.get('leadId') || '';
  const workspaceId = useWorkspaceId();

  const { saveFlow, error } = useFlows(workspaceId);
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
  } = useFlowOptimize(searchParams.get('id'));

  const [activeTab, setActiveTab] = useState<'editor' | 'executions' | 'templates'>(
    requestedTab === 'templates' || requestedTab === 'executions' || requestedTab === 'editor'
      ? requestedTab
      : source === 'followups'
        ? 'editor'
        : 'editor',
  );

  const sourceLabel = SOURCE_LABELS[source] || '';

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

  const handleSave = useCallback(
    async (flow: { nodes: Node[]; edges: Edge[]; name: string }) => {
      await saveFlow(flowId, flow);
    },
    [flowId, saveFlow],
  );

  const handleTest = useCallback(
    (flow: { nodes: Node[]; edges: Edge[]; name: string }) => {
      handleSave(flow);
    },
    [handleSave],
  );

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
            {kloelT('Execucoes')}
          </button>

          {/* AI Optimize button */}
          <div className="ml-auto flex items-center pr-2">
            {optimizeResult && (
              <span className="text-xs text-[var(--semantic-success)] mr-3">
                {kloelT('Sugestoes:')} {optimizeResult.suggestions?.length ?? 0} melhorias
              </span>
            )}
            {optimizeError && (
              <span className="text-xs text-[var(--semantic-error)] mr-3">{optimizeError}</span>
            )}
            <button
              type="button"
              onClick={handleOptimize}
              disabled={optimizing || !searchParams.get('id')}
              title={!searchParams.get('id') ? 'Salve o fluxo primeiro' : 'Otimizar com IA'}
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
        {activeTab === 'editor' && (
          <FlowBuilder
            flowId={flowId}
            workspaceId={workspaceId}
            onSave={handleSave}
            onTest={handleTest}
          />
        )}

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
