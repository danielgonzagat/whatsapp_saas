'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Button, CenterStage, Section } from '@/components/kloel';
import AutopilotSafetyBrakes from '@/components/kloel/autopilot/AutopilotSafetyBrakes';
import type {
  AutopilotConfigLike,
  AutopilotSmokeResultLike,
  QueueStatsLike,
  RuntimeConfigLike,
} from '@/components/kloel/autopilot/AutopilotSafetyBrakes';
import {
  Bot,
  MessageSquare,
  Settings2,
} from 'lucide-react';

interface AutopilotMissionGridProps {
  queueStats: QueueStatsLike | null;
  runtimeConfig: RuntimeConfigLike | null;
  smokeResult: AutopilotSmokeResultLike | null;
  testPhone: string;
  testMessage: string;
  testLiveSend: boolean;
  isTesting: boolean;
  onTestPhoneChange: (v: string) => void;
  onTestMessageChange: (v: string) => void;
  onTestLiveSendChange: (v: boolean) => void;
  onSmokeTest: () => void;
  config: AutopilotConfigLike | null;
  isEditingConfig: boolean;
  configDraft: AutopilotConfigLike;
  isSavingConfig: boolean;
  onConfigDraftChange: (updater: (prev: AutopilotConfigLike) => AutopilotConfigLike) => void;
  onToggleEditingConfig: () => void;
  onSaveConfig: () => void;
  onNavigate: (href: string) => void;
}

export function AutopilotMissionGrid({
  queueStats,
  runtimeConfig,
  smokeResult,
  testPhone,
  testMessage,
  testLiveSend,
  isTesting,
  onTestPhoneChange,
  onTestMessageChange,
  onTestLiveSendChange,
  onSmokeTest,
  config,
  isEditingConfig,
  configDraft,
  isSavingConfig,
  onConfigDraftChange,
  onToggleEditingConfig,
  onSaveConfig,
  onNavigate,
}: AutopilotMissionGridProps) {
  return (
    <>
      {/* Safety Brakes */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <AutopilotSafetyBrakes
            queueStats={queueStats}
            runtimeConfig={runtimeConfig}
            smokeResult={smokeResult}
            testPhone={testPhone}
            testMessage={testMessage}
            testLiveSend={testLiveSend}
            isTesting={isTesting}
            onTestPhoneChange={onTestPhoneChange}
            onTestMessageChange={onTestMessageChange}
            onTestLiveSendChange={onTestLiveSendChange}
            onSmokeTest={onSmokeTest}
            config={config}
            isEditingConfig={isEditingConfig}
            configDraft={configDraft}
            isSavingConfig={isSavingConfig}
            onConfigDraftChange={onConfigDraftChange}
            onToggleEditingConfig={onToggleEditingConfig}
            onSaveConfig={onSaveConfig}
          />
        </CenterStage>
      </Section>

      {/* Help Section */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div
            className="p-6 rounded-xl text-center"
            style={{
              background: 'rgba(232, 93, 48, 0.08)',
              border: `1px solid ${colors.stroke}`,
            }}
          >
            <Bot
              size={40}
              className="mx-auto mb-4"
              style={{ color: colors.brand.green }}
              aria-hidden="true"
            />
            <h3 className="text-lg font-semibold mb-2" style={{ color: colors.text.primary }}>
              {kloelT(`Precisa de ajuda com o Autopilot?`)}
            </h3>
            <p className="text-sm mb-4 max-w-md mx-auto" style={{ color: colors.text.muted }}>
              {kloelT(`O Autopilot usa IA para responder automaticamente, qualificar leads e direcionar para
              conversão. Configure fluxos personalizados para maximizar resultados.`)}
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => onNavigate('/flow')}>
                <Settings2 size={16} className="mr-2" aria-hidden="true" />

                {kloelT(`Configurar Fluxos`)}
              </Button>
              <Button variant="primary" size="sm" onClick={() => onNavigate('/chat')}>
                <MessageSquare size={16} className="mr-2" aria-hidden="true" />

                {kloelT(`Falar com KLOEL`)}
              </Button>
            </div>
          </div>
        </CenterStage>
      </Section>
    </>
  );
}
