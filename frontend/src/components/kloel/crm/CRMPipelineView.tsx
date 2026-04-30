'use client';

import { kloelT } from '@/lib/i18n/t';
import { useCRMMutations, useDeals, usePipelines } from '@/hooks/useCRM';
import { type FormEvent, type DragEvent as ReactDragEvent, useCallback, useState } from 'react';
import { CRM_ICONS } from './crm-pipeline-icons';
import { colors } from '@/lib/design-tokens';
import {
  DealCardSkeleton,
  DetailRow,
  LoadingStrip,
  PipelineColumnSkeleton,
  btnStyle,
  inputStyle,
} from './CRMPipelineView.parts';
import {
  type CRMDeal,
  type CRMPipeline,
  type CRMStage,
  MONO,
  SORA,
  fmtBRL,
} from './crm-pipeline-utils';

const IC = CRM_ICONS;

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  high: { label: 'Alta', color: '#EF4444' },
  medium: { label: 'Média', color: '#F59E0B' },
  low: { label: 'Baixa', color: 'var(--app-text-secondary)' },
};
