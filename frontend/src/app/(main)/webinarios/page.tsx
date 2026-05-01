'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { useAuth } from '@/components/kloel/auth/auth-provider';
import { apiFetch } from '@/lib/api';
import { webinarApi } from '@/lib/api/misc';
import { toSupportedEmbedUrl } from '@/lib/video-embed';
import {
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useState } from 'react';
import { mutate } from 'swr';

interface Webinar {
  id: string;
  title: string;
  description?: string | null;
  url: string;
  date: string;
  productId?: string | null;
  status: string;
  createdAt: string;
}

interface WebinarListResponse {
  webinars?: Webinar[];
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string) {
  switch (status) {
    case 'LIVE':
      return 'Ao Vivo';
    case 'COMPLETED':
      return 'Concluido';
    default:
      return 'Agendado';
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'LIVE':
      return colors.ember.primary;
    case 'COMPLETED':
      return '#666' /* PULSE_VISUAL_OK: universal gray disabled */;
    default:
      return '#4CAF50' /* PULSE_VISUAL_OK: material green, non-Monitor */;
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'LIVE':
      return <Play size={12} aria-hidden="true" />;
    case 'COMPLETED':
      return <CheckCircle size={12} aria-hidden="true" />;
    default:
      return <Clock size={12} aria-hidden="true" />;
  }
}

/** Attempt to convert a URL into an embeddable URL */
function toEmbedUrl(url: string): string | null {
  return toSupportedEmbedUrl(url);
}

/** Webinarios page. */
import { WebinariosPage } from "./WebinariosPage";
