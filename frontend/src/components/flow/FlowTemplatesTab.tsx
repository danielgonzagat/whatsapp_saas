'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import type { FlowTemplate } from '@/lib/api';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { LayoutTemplate, RefreshCw } from 'lucide-react';

interface FlowTemplatesTabProps {
  templates: FlowTemplate[];
  loading: boolean;
  error: string | null;
  downloading: Record<string, boolean>;
  downloadedIds: Set<string>;
  categoryColors: Record<string, string>;
  onRefresh: () => void;
  onDownload: (templateId: string) => void;
}

export function FlowTemplatesTab({
  templates,
  loading,
  error,
  downloading,
  downloadedIds,
  categoryColors,
  onRefresh,
  onDownload,
}: FlowTemplatesTabProps) {
  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {kloelT('Templates de Fluxo')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {kloelT(
              'Templates prontos para usar — clique em Usar para copiar nodes/edges ao editor',
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {loading ? (
            <KloelMushroomMark
              size={18}
              title="Atualizando templates"
              traceColor={colors.ember.primary}
            />
          ) : (
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {loading && templates.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <KloelMushroomMark
            size={18}
            title="Carregando templates"
            traceColor={colors.ember.primary}
          />
          {kloelT('Carregando templates...')}
        </div>
      ) : error ? (
        <div className="p-4 rounded-md border border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444] text-sm">
          {error}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <LayoutTemplate className="w-12 h-12 text-muted" aria-hidden="true" />
          <p className="text-muted-foreground text-sm">
            {kloelT('Nenhum template publico disponivel ainda')}
          </p>
          <p className="text-muted text-xs">
            {kloelT('Templates criados por admins aparecerao aqui')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tmpl) => {
            const catColor = categoryColors[tmpl.category] || colors.text.muted;
            const nodeCount = Array.isArray(tmpl.nodes) ? tmpl.nodes.length : 0;
            const edgeCount = Array.isArray(tmpl.edges) ? tmpl.edges.length : 0;
            const isDownloaded = downloadedIds.has(tmpl.id);
            const isDownloading = downloading[tmpl.id];

            return (
              <div
                key={tmpl.id}
                className="rounded-md border flex flex-col"
                style={{
                  backgroundColor: 'var(--app-bg-card)',
                  borderColor: colors.border.space,
                }}
              >
                <div className="h-1 rounded-t-md" style={{ background: catColor }} />
                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground leading-tight">
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
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {tmpl.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>{nodeCount} nodes</span>
                    <span>{kloelT('&middot;')}</span>
                    <span>{edgeCount} conexoes</span>
                    {tmpl.downloads !== undefined && (
                      <>
                        <span>{kloelT('&middot;')}</span>
                        <span>{tmpl.downloads} usos</span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onDownload(tmpl.id)}
                    disabled={isDownloading}
                    className="mt-auto w-full py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
                    style={{
                      background: isDownloaded
                        ? 'rgba(16,185,129,0.15)'
                        : 'rgba(232,93,48,0.15)',
                      border: `1px solid ${isDownloaded ? 'rgba(16,185,129,0.3)' : 'rgba(232,93,48,0.3)'}`,
                      color: isDownloaded ? '#10B981' : colors.ember.primary,
                      cursor: isDownloading ? 'wait' : 'pointer',
                    }}
                  >
                    {isDownloading ? (
                      <span className="flex items-center justify-center gap-2">
                        <KloelMushroomMark
                          size={16}
                          title="Aplicando template"
                          traceColor={colors.ember.primary}
                        />
                        {kloelT('Carregando...')}
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
  );
}
