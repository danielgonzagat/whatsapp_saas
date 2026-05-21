'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Button, CenterStage, Section } from '@/components/kloel';
import { AlertCircle, CheckCircle2, Lightbulb, Sparkles, XCircle } from 'lucide-react';
import type { AskInsightsResult } from '@/lib/api';
import type { AutopilotInsight } from './page.ui';
import { askResultToSummary } from './page.helpers';

interface AiInsightsSectionProps {
  askQuestion: string;
  setAskQuestion: (v: string) => void;
  isAsking: boolean;
  onAsk: () => void;
  askResult: AskInsightsResult | null;
  insights: AutopilotInsight[];
}

export function AiInsightsSection({
  askQuestion,
  setAskQuestion,
  isAsking,
  onAsk,
  askResult,
  insights,
}: AiInsightsSectionProps) {
  return (
    <Section spacing="lg">
      <CenterStage size="XL">
        <div
          className="p-5 rounded-xl border"
          style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${colors.brand.green}20` }}>
              <Lightbulb size={20} style={{ color: colors.brand.green }} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                {kloelT('Insights da IA')}
              </h2>
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT('Recomendações e observações geradas automaticamente')}
              </p>
            </div>
          </div>

          <div className="flex gap-3 mb-5">
            <input
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              placeholder={kloelT(
                'Pergunte algo sobre o Autopilot... (ex: Quais leads estao mais propensos a comprar?)',
              )}
              className="flex-1 px-4 py-3 rounded-lg border outline-none text-sm"
              style={{
                backgroundColor: colors.background.surface2,
                borderColor: colors.stroke,
                color: colors.text.primary,
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onAsk();
                }
              }}
            />
            <Button
              variant="primary"
              size="md"
              onClick={onAsk}
              isLoading={isAsking}
              leftIcon={!isAsking ? <Sparkles size={14} aria-hidden="true" /> : undefined}
            >
              {isAsking ? 'Consultando...' : 'Perguntar'}
            </Button>
          </div>

          {askResult && (
            <div
              className="mb-5 p-4 rounded-lg border"
              style={{
                backgroundColor: colors.background.surface2,
                borderColor: colors.stroke,
                borderLeft: `3px solid ${colors.brand.green}`,
              }}
            >
              {askResult.question && (
                <p className="text-xs mb-2" style={{ color: colors.text.muted }}>
                  {kloelT('Pergunta:')} {askResult.question}
                </p>
              )}
              <p className="text-sm" style={{ color: colors.text.primary }}>
                {askResult.answer || askResultToSummary(askResult as Record<string, unknown>)}
              </p>
            </div>
          )}

          {insights.length > 0 ? (
            <div className="space-y-3">
              {insights.map((insight, idx) => {
                const severityColors: Record<string, string> = {
                  success: colors.brand.green,
                  info: colors.brand.cyan,
                  warning: colors.state.warning,
                  critical: colors.state.error,
                };
                const severityIcons: Record<string, React.ElementType> = {
                  success: CheckCircle2,
                  info: Lightbulb,
                  warning: AlertCircle,
                  critical: XCircle,
                };
                const sColor = severityColors[insight.severity || 'info'] || colors.brand.cyan;
                const SIcon = severityIcons[insight.severity || 'info'] || Lightbulb;

                return (
                  <div
                    key={insight.id || idx}
                    className="p-4 rounded-lg border"
                    style={{
                      backgroundColor: colors.background.surface2,
                      borderColor: colors.stroke,
                      borderLeft: `3px solid ${sColor}`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="p-1.5 rounded-lg flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: `${sColor}20` }}
                      >
                        <SIcon size={16} style={{ color: sColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium" style={{ color: colors.text.primary }}>
                            {insight.title || insight.type || 'Insight'}
                          </span>
                          {insight.severity && (
                            <span
                              className="px-2 py-0.5 rounded text-xs font-medium uppercase"
                              style={{ backgroundColor: `${sColor}20`, color: sColor }}
                            >
                              {insight.severity}
                            </span>
                          )}
                        </div>
                        {insight.description && (
                          <p className="text-sm mb-2" style={{ color: colors.text.secondary }}>
                            {insight.description}
                          </p>
                        )}
                        {insight.recommendation && (
                          <div
                            className="text-sm p-2 rounded"
                            style={{ backgroundColor: `${sColor}08`, color: colors.text.primary }}
                          >
                            <strong>{kloelT('Recomendação:')}</strong> {insight.recommendation}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="p-6 rounded-lg text-center"
              style={{ backgroundColor: colors.background.surface2 }}
            >
              <Lightbulb
                size={32}
                className="mx-auto mb-2"
                style={{ color: colors.text.muted }}
                aria-hidden="true"
              />
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT('Nenhum insight disponível no momento')}
              </p>
            </div>
          )}
        </div>
      </CenterStage>
    </Section>
  );
}
