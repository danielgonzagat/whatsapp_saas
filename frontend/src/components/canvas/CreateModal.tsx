'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import {
  CATEGORIES,
  FORMAT_DATA,
  type FormatItem,
  QUICK_ACTIONS,
  RECENT_DIMENSIONS,
  SOCIAL_PLATFORMS,
} from '@/lib/canvas-formats';
import { useRouter } from 'next/navigation';
import { useState, useId } from 'react';
import { IC, getIcon } from './CanvasIcons';
import { FormatCard } from './FormatCard';

const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
}

/** Create modal. */
import { CreateModal } from "./CreateModal";
