"use client";

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
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('editor')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'editor'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Editor
          </button>
          <button
            onClick={() => setActiveTab('executions')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'executions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
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
              <h2 className="text-xl font-semibold">Histórico de Execuções</h2>
              <div className="flex items-center gap-3">
                {execError && (
                  <span className="text-sm text-red-600">{execError}</span>
                )}
                <button
                  onClick={fetchExecutions}
                  disabled={execLoading}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${execLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {execLoading && executions.length === 0 ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando execuções...
              </div>
            ) : executions.length === 0 ? (
              <div className="text-gray-500">Nenhuma execução encontrada.</div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
                {executions.map((exec) => (
                  <div key={exec.id} className="p-4 border rounded-lg flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{exec.flow?.name || 'Fluxo'}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          exec.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                          exec.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {exec.status || 'Desconhecido'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {exec.contact?.name || exec.contact?.phone || 'Contato desconhecido'}
                      </div>
                      <div className="text-xs text-gray-400">
                        Iniciado em {new Date(exec.createdAt).toLocaleString('pt-BR')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {exec.status === 'FAILED' && (
                        <button
                          onClick={() => handleRetry(exec.id)}
                          className="px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
                        >
                          <RotateCcw className="w-4 h-4 mr-1 inline" />
                          Reprocessar
                        </button>
                      )}
                      <span className="text-xs text-gray-500">Última atualização {new Date(exec.updatedAt).toLocaleString('pt-BR')}</span>
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
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}

function FlowPageLoading() {
  return (
    <div className="h-[calc(100vh-80px)] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
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
