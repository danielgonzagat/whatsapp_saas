'use client';

import { kloelT } from '@/lib/i18n/t';
import { AccordionSection } from './accordion-section';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { tokenStorage } from '@/lib/api';
import { type AiToolKind, formatAiToolOutput, invokeAiTool } from './brain-settings-section.helpers';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

export function AiToolsPanel() {
  const workspaceId = tokenStorage.getWorkspaceId();
  const [aiToolInput, setAiToolInput] = useState('');
  const [aiToolResult, setAiToolResult] = useState('');
  const [aiToolLoading, setAiToolLoading] = useState(false);
  const [aiToolError, setAiToolError] = useState('');

  const runAiTool = async (tool: AiToolKind, label: string) => {
    if (!aiToolInput.trim()) {
      return;
    }
    setAiToolLoading(true);
    setAiToolError('');
    setAiToolResult('');
    try {
      const { data, error } = await invokeAiTool(tool, aiToolInput.trim(), workspaceId || '');
      if (error) {
        throw new Error(error);
      }
      setAiToolResult(`[${label}]\n${formatAiToolOutput(data)}`);
    } catch (e: unknown) {
      setAiToolError(e instanceof Error ? e.message : `Erro ao executar ${label}`);
    } finally {
      setAiToolLoading(false);
    }
  };

  return (
    <AccordionSection icon={Sparkles} title={kloelT(`Ferramentas de IA — Testar`)}>
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          {kloelT(`Teste as ferramentas de IA do assistente diretamente aqui. Informe um texto ou ID de
          conversa e clique em uma ferramenta.`)}
        </p>

        <div className="space-y-2">
          <Label className="text-xs text-gray-500">{kloelT(`Texto / ID de conversa`)}</Label>
          <Textarea
            value={aiToolInput}
            onChange={(e) => setAiToolInput(e.target.value)}
            placeholder={kloelT(`Digite um texto para analise ou um ID de conversa...`)}
            className="min-h-[72px] rounded-xl border-gray-200"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: 'analyzeSentiment' as const, label: 'Analisar Sentimento' },
            { key: 'summarize' as const, label: 'Resumir' },
            { key: 'suggest' as const, label: 'Sugerir Resposta' },
            { key: 'pitch' as const, label: 'Gerar Pitch' },
          ].map(({ key, label }) => (
            <Button
              key={key}
              onClick={() => void runAiTool(key, label)}
              disabled={aiToolLoading || !aiToolInput.trim()}
              variant="outline"
              className="rounded-xl border-gray-200 bg-transparent text-sm hover:border-[colors.ember.primary]/50 hover:text-[colors.ember.primary]"
            >
              {aiToolLoading ? '...' : label}
            </Button>
          ))}
        </div>

        {aiToolError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {aiToolError}
          </div>
        )}

        {aiToolResult && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {kloelT(`Resultado`)}
            </p>
            <pre className="whitespace-pre-wrap text-xs text-gray-800 font-mono">
              {aiToolResult}
            </pre>
          </div>
        )}
      </div>
    </AccordionSection>
  );
}
