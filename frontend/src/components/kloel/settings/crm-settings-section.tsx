'use client';

import { kloelT } from '@/lib/i18n/t';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { Button } from '@/components/ui/button';
import {
  type CrmDeal,
  type CrmPipeline,
  type CrmContact,
  type SegmentationPreset,
  type SegmentationStats,
  crmApi,
  segmentationApi,
} from '@/lib/api';
import {
  ArrowLeft,
  ArrowRight,
  KanbanSquare,
  Plus,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SettingsCard,
  SettingsHeader,
  SettingsInset,
  SettingsNotice,
  kloelSettingsClass,
} from './contract';
import { errorMessage, formatMoney } from './crm-settings-section.helpers';
import { ContactCard, SegmentationCard, StatCard, fieldClass } from './crm-settings-section.parts';
import { colors } from '@/lib/design-tokens';

/** Crm settings section. */
import { CrmSettingsSection } from "./CrmSettingsSection";
