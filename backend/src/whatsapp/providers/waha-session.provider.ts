// PULSE:OK — session lifecycle layer for WAHA.
// Config/diagnostics live in WahaSessionConfigProvider (waha-session-config.provider.ts).
// Setup/QR/LID helpers live in waha-session-lifecycle.util.ts.
// Messaging lives in WahaProvider (waha.provider.ts).
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpsAlertService } from '../../observability/ops-alert.service';
import {
  resolveWahaSessionState,
  type SessionStatus,
  type QrCodeResponse,
  type WahaLidMapping,
  type WahaSessionOverview,
} from './waha-types';
import { WahaSessionConfigProvider } from './waha-session-config.provider';
import {
  ensureSessionConfigured,
  ensureSessionExists,
  getQrCode,
  listLidMappings,
} from './waha-session-lifecycle.util';
import "../../../../scripts/pulse/__companions__/waha-session.provider.companion";
