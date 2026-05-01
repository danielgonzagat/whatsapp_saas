'use client';

import { kloelT } from '@/lib/i18n/t';
import type React from 'react';

import { PulseLoader } from '@/components/kloel/PulseLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  type KnowledgeBaseItem,
  type KnowledgeSourceItem,
  getAutopilotConfig,
  getAutopilotStatus,
  knowledgeBaseApi,
  productApi,
  toggleAutopilot,
  tokenStorage,
  updateAutopilotConfig,
  workspaceApi,
} from '@/lib/api';
import { uploadKnowledgeBase } from '@/lib/api/misc';
import {
  type AiToolData,
  type AiToolKind,
  type CompanyProfile,
  type EmergencyModeProfile,
  type FaqItem,
  type OpeningMessageProfile,
  type VoiceToneProfile,
  formatAiToolOutput,
  formatCurrency,
  invokeAiTool,
  normalizeCompanyProfile,
  normalizeEmergencyMode,
  normalizeFaqs,
  normalizeOpeningMessage,
  normalizeVoiceToneProfile,
  parseCurrency,
} from './brain-settings-section.helpers';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle,
  MessageSquare,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { SettingsNotice, kloelSettingsClass } from './contract';
import { EmergencyModeCard } from './emergency-mode-card';
import { KloelStatusCard } from './kloel-status-card';
import { MissingStepsCard } from './missing-steps-card';
import { OpeningMessageCard } from './opening-message-card';
import { colors } from '@/lib/design-tokens';

interface AccordionSectionProps {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function AccordionSection({
  icon: Icon,
  title,
  children,
  defaultOpen = false,
}: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-[colors.border.space] bg-[colors.background.surface] shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`${isOpen ? 'Fechar' : 'Abrir'} ${title}`}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between p-5"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-[colors.text.muted]" />
          <span className="font-semibold text-[colors.text.silver]">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-[colors.text.muted]" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-5 w-5 text-[colors.text.muted]" aria-hidden="true" />
        )}
      </button>
      {isOpen && <div className="border-t border-[colors.border.space] p-5">{children}</div>}
    </div>
  );
}

interface Product {
  id: string;
  name: string;
  type: string;
  price: string;
  description?: string;
  active: boolean;
  files: number;
  activePlansCount: number;
  memberAreasCount: number;
  totalSales: number;
  totalRevenue: number;
}

// Pure helpers moved to ./brain-settings-section.helpers.ts.

function buildDuplicateAwareKey(prefix: string, values: string[], position: number) {
  const currentValue = values[position] ?? '';
  const occurrence = values.slice(0, position).filter((value) => value === currentValue).length;
  return `${prefix}-${currentValue.slice(0, 24)}-${occurrence}`;
}

/** Brain settings section. */
import { BrainSettingsSection } from "./BrainSettingsSection";
