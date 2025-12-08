"use client";

import { useCallback, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import FlowBuilder from "@/components/flow/FlowBuilder";
import { useFlows } from "@/hooks/useFlows";
import { Node, Edge } from 'reactflow';
import { Plus, FileText, Play, Clock, Loader2 } from 'lucide-react';

function FlowPageContent() {
  const searchParams = useSearchParams();
  const flowId = searchParams.get('id') || `flow-${Date.now()}`;
  // TODO: Get from auth context
  const workspaceId = searchParams.get('workspaceId') || 'demo-workspace';
  
  const { saveFlow, loading, error } = useFlows(workspaceId);
  const [activeTab, setActiveTab] = useState<'editor' | 'executions'>('editor');

  const handleSave = useCallback(async (flow: { nodes: Node[]; edges: Edge[]; name: string }) => {
    await saveFlow(flowId, flow);
  }, [flowId, saveFlow]);

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
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Histórico de Execuções</h2>
            <p className="text-gray-500">
              As execuções deste fluxo aparecerão aqui.
            </p>
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
