'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { Card } from '@/components/kloel/Card';
import { ContextualEmptyState } from '@/components/kloel/EmptyStates';
import { SectionPage } from '@/components/kloel/SectionPage';
import { tokenStorage } from '@/lib/api';
import { type VoiceProfile, mediaApi, videoApi, voiceApi } from '@/lib/api/misc';
import { swrFetcher } from '@/lib/fetcher';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { errorMessage, readStringField } from './page.helpers';
import {
  btnPrimary,
  btnSecondary,
  inputStyle,
  STATUS_COLORS,
  type Tab,
  type VideoJob,
  VideoJobRow,
} from './page.shared';

/** Video page. */
import { VideoPage } from "./VideoPage";
