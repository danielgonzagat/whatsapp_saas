"use client";

export const dynamic = 'force-dynamic';

import { useCallback, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import FlowBuilder from "@/components/flow/FlowBuilder";
import { useFlows } from "@/hooks/useFlows";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { listFlowExecutions, retryFlowExecution } from '@/lib/api';
import { Node, Edge } from 'reactflow';
import { Plus, FileText, Play, Clock, Loader2, RefreshCw, RotateCcw } from 'lucide-react';

function FlowPageContent() {
  const searchParams = useSearchParams();
  const flowId = searchParams.get('id') || `flow-${Date.now()}`;
  const workspaceId = useWorkspaceId();
  
  const { saveFlow, loading, error } = useFlows(workspaceId);
  const [activeTab, setActiveTab] = useState<'editor' | 'executions'>('editor');
  const [executions, setExecutions] = useState<any[]>([]);
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  const handleSave = useCallback(async (flow: { nodes: Node[]; edges: Edge[]; name: string }) => {
    await saveFlow(flowId, flow);
  }, [flowId, saveFlow]);

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

  const handleRetry = useCallback(async (executionId: string) => {
    try {
      await retryFlowExecution(executionId);
      await fetchExecutions();
    } catch (err) {
      setExecError('Falha ao reprocessar execução');
    }
  }, [fetchExecutions]);

  useEffect(() => {
    if (activeTab === 'executions') {
      fetchExecutions();
    }
  }, [activeTab, fetchExecutions]);

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col" style={{ backgroundColor: '#0A0A0C' }}>
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
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'editor' ? (
          <FlowBuilder
            flowId={flowId}
            workspaceId={workspaceId}
            onSave={handleSave}
          />
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#E0DDD8]">Histórico de Execuções</h2>
              <div className="flex items-center gap-3">
                {execError && (
                  <span className="text-sm text-[#E05252]">{execError}</span>
                )}
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
                Carregando execuções...
              </div>
            ) : executions.length === 0 ? (
              <div className="text-[#6E6E73]">Nenhuma execução encontrada.</div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
                {executions.map((exec) => (
                  <div key={exec.id} className="p-4 border border-[#222226] rounded-md flex items-center justify-between" style={{ backgroundColor: '#111113' }}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#E0DDD8]">{exec.flow?.name || 'Fluxo'}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          exec.status === 'COMPLETED' ? 'bg-[#E0DDD8]/10 text-[#E0DDD8]' :
                          exec.status === 'FAILED' ? 'bg-[#E05252]/10 text-[#E05252]' :
                          'bg-[#19191C] text-[#6E6E73]'
                        }`}>
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
                      <span className="text-xs text-[#6E6E73]">Última atualização {new Date(exec.updatedAt).toLocaleString('pt-BR')}</span>
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
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-md ">
          {error}
        </div>
      )}
    </div>
  );
}

function FlowPageLoading() {
  return (
    <div className="h-[calc(100vh-80px)] flex items-center justify-center" style={{ backgroundColor: '#0A0A0C' }}>
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
