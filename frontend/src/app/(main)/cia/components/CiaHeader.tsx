'use client';

import { kloelT } from '@/lib/i18n/t';
import {
  Badge,
  Button,
  StageHeadline,
} from '@/components/kloel';
import type { CiaAccountRuntime, CiaSurfaceResponse } from '@/lib/api';
import { RotateCw, Zap } from 'lucide-react';

interface CiaHeaderProps {
  surface: CiaSurfaceResponse | null;
  accountRuntime: CiaAccountRuntime | null;
  activating: boolean;
  workspaceLoading: boolean;
  hasWorkspace: boolean;
  onRefresh: () => void;
  onAutopilotTotal: () => void;
}

export function CiaHeader({
  surface,
  accountRuntime,
  activating,
  workspaceLoading,
  hasWorkspace,
  onRefresh,
  onAutopilotTotal,
}: CiaHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <StageHeadline
          headline={surface?.title || 'KLOEL'}
          subheadline={surface?.subtitle || 'Trabalhando no seu WhatsApp'}
        />
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge>{surface?.workspaceName || 'Workspace'}</Badge>
          <Badge variant="info">{surface?.state || 'CARREGANDO'}</Badge>
          {surface?.runtime?.lastError ? (
            <Badge variant="error">{kloelT('Erro recente')}</Badge>
          ) : (
            <Badge variant="success">{kloelT('Operacao observavel')}</Badge>
          )}
          {accountRuntime && (
            <Badge variant={accountRuntime.noLegalActions ? 'warning' : 'info'}>
              {accountRuntime.mode}
            </Badge>
          )}
          {surface?.commercial?.pipelineMode === 'shadow' && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: 'rgb(58, 58, 63)',
                color: 'rgb(155, 155, 160)',
              }}
            >
              Shadow
            </span>
          )}
          {surface?.commercial?.pipelineMode === 'active' && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: 'rgba(16,185,129,0.12)',
                color: 'rgb(127, 226, 188)',
              }}
            >
              Active
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={onRefresh}
          leftIcon={<RotateCw size={16} aria-hidden="true" />}
          disabled={workspaceLoading}
        >
          {kloelT('Atualizar')}
        </Button>
        <Button
          onClick={onAutopilotTotal}
          isLoading={activating}
          leftIcon={<Zap size={16} aria-hidden="true" />}
          disabled={workspaceLoading || !hasWorkspace}
        >
          {kloelT('Autopilot Total')}
        </Button>
      </div>
    </div>
  );
}
