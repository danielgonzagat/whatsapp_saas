import { createHash } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { AudioService } from '../../audio.service';
import { MindPerceptionService } from './mind-perception.service';
import { SpineEmitterService } from '../../spine/spine-emitter.service';

/**
 * MindMultiModalPerceptionService — pillar #6 "Corpo sensorial e interacao
 * ambiental". Extends text-only perception with honest audio, image and
 * structured-event channels.
 *
 * Every dependency is @Optional: audio (Whisper) and vision are production
 * add-ons; in their absence we return honest empty descriptors instead of
 * mock data. Payloads stay in memory, durations live in bigint milliseconds,
 * workspaceId is required everywhere.
 */

const PROCESSOR_NAME = 'mind-multimodal-perception';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';
const FINGERPRINT_HEX = 32; // 16 bytes hex

export interface MultiModalVisionAdapter {
  describe(
    workspaceId: string,
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<{ description?: string; detectedObjects?: string[] }>;
}

export const MULTIMODAL_VISION_ADAPTER = Symbol('MULTIMODAL_VISION_ADAPTER');

export interface MultiModalAudioObservation {
  readonly transcript?: string;
  readonly durationMs?: bigint;
  readonly emotion?: string;
  readonly sourceFingerprint: string;
}

export interface MultiModalImageObservation {
  readonly description?: string;
  readonly detectedObjects?: string[];
  readonly sourceFingerprint: string;
}

export interface StructuredPerceptionEvent {
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface StructuredPerceptionObservation {
  readonly subject: string;
  readonly salience: number;
  readonly semanticContext: Record<string, unknown>;
}

type Modality = 'audio' | 'image' | 'structured';

@Injectable()
export class MindMultiModalPerceptionService {
  private readonly logger = StructuredLogger.from(MindMultiModalPerceptionService.name);

  public constructor(
    @Optional() private readonly audio?: AudioService,
    @Optional() private readonly vision?: MultiModalVisionAdapter,
    @Optional() private readonly perception?: MindPerceptionService,
    @Optional() private readonly spine?: SpineEmitterService,
  ) {}

  public async perceiveAudio(
    workspaceId: string,
    audioBuffer: Buffer,
    mimeType: string,
  ): Promise<MultiModalAudioObservation> {
    this.requireWorkspace(workspaceId);
    const sourceFingerprint = this.fingerprintBuffer(audioBuffer, mimeType);
    const base = { sourceFingerprint };

    if (!this.audio || typeof this.audio.transcribe !== 'function') {
      void this.safeEmit(workspaceId, 'audio', sourceFingerprint, mimeType, {
        bytes: audioBuffer.byteLength,
        adapterAvailable: false,
      });
      return base;
    }

    try {
      const result = await this.audio.transcribe(audioBuffer, 'pt', workspaceId);
      const durationMs =
        typeof result.duration === 'number' && Number.isFinite(result.duration)
          ? BigInt(Math.max(0, Math.round(result.duration * 1000)))
          : undefined;
      const obs: MultiModalAudioObservation = {
        ...(result.text ? { transcript: result.text } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        sourceFingerprint,
      };
      void this.safeEmit(workspaceId, 'audio', sourceFingerprint, mimeType, {
        bytes: audioBuffer.byteLength,
        adapterAvailable: true,
        hasTranscript: Boolean(result.text),
        ...(durationMs !== undefined ? { durationMs: durationMs.toString() } : {}),
      });
      return obs;
    } catch (err) {
      this.logger.warn(`perceiveAudio failed: ${(err as Error).message}`);
      void this.safeEmit(workspaceId, 'audio', sourceFingerprint, mimeType, {
        bytes: audioBuffer.byteLength,
        adapterAvailable: true,
        failure: 'transcribe_threw',
      });
      return base;
    }
  }

  public async perceiveImage(
    workspaceId: string,
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<MultiModalImageObservation> {
    this.requireWorkspace(workspaceId);
    const sourceFingerprint = this.fingerprintBuffer(imageBuffer, mimeType);
    const base = { sourceFingerprint };

    if (!this.vision || typeof this.vision.describe !== 'function') {
      void this.safeEmit(workspaceId, 'image', sourceFingerprint, mimeType, {
        bytes: imageBuffer.byteLength,
        adapterAvailable: false,
      });
      return base;
    }

    try {
      const result = await this.vision.describe(workspaceId, imageBuffer, mimeType);
      const objs = result.detectedObjects ?? [];
      const obs: MultiModalImageObservation = {
        ...(result.description ? { description: result.description } : {}),
        ...(objs.length > 0 ? { detectedObjects: [...objs] } : {}),
        sourceFingerprint,
      };
      void this.safeEmit(workspaceId, 'image', sourceFingerprint, mimeType, {
        bytes: imageBuffer.byteLength,
        adapterAvailable: true,
        hasDescription: Boolean(result.description),
        objectCount: objs.length,
      });
      return obs;
    } catch (err) {
      this.logger.warn(`perceiveImage failed: ${(err as Error).message}`);
      void this.safeEmit(workspaceId, 'image', sourceFingerprint, mimeType, {
        bytes: imageBuffer.byteLength,
        adapterAvailable: true,
        failure: 'vision_threw',
      });
      return base;
    }
  }

  public perceiveStructuredEvent(
    workspaceId: string,
    event: StructuredPerceptionEvent,
  ): StructuredPerceptionObservation {
    this.requireWorkspace(workspaceId);
    if (!event || typeof event.kind !== 'string' || event.kind.length === 0) {
      throw new Error('perceiveStructuredEvent: event.kind is required');
    }

    const delegated = this.tryDelegateStructured(workspaceId, event);
    const observation: StructuredPerceptionObservation = delegated ?? {
      subject: this.deriveSubject(event),
      salience: this.deriveSalience(event),
      semanticContext: {
        kind: event.kind,
        payloadKeys: Object.keys(event.payload ?? {}),
      },
    };

    void this.safeEmit(workspaceId, 'structured', `kind:${event.kind}`, 'application/json', {
      kind: event.kind,
      subject: observation.subject,
      salience: observation.salience,
      delegated: delegated !== null,
    });
    return observation;
  }

  private tryDelegateStructured(
    workspaceId: string,
    event: StructuredPerceptionEvent,
  ): StructuredPerceptionObservation | null {
    if (!this.perception) {
      return null;
    }
    const candidate = (this.perception as unknown as Record<string, unknown>)['perceive'];
    if (typeof candidate !== 'function') {
      return null;
    }
    try {
      const raw = (candidate as (ws: string, ev: StructuredPerceptionEvent) => unknown)(
        workspaceId,
        event,
      );
      if (raw && typeof raw === 'object') {
        const shaped = raw as Partial<StructuredPerceptionObservation>;
        return {
          subject:
            typeof shaped.subject === 'string' && shaped.subject.length > 0
              ? shaped.subject
              : this.deriveSubject(event),
          salience:
            typeof shaped.salience === 'number' && Number.isFinite(shaped.salience)
              ? Math.max(0, Math.min(1, shaped.salience))
              : this.deriveSalience(event),
          semanticContext:
            shaped.semanticContext && typeof shaped.semanticContext === 'object'
              ? { ...shaped.semanticContext }
              : { kind: event.kind, payloadKeys: Object.keys(event.payload ?? {}) },
        };
      }
    } catch (err) {
      this.logger.warn(`structured delegation threw: ${(err as Error).message}`);
    }
    return null;
  }

  private deriveSubject(event: StructuredPerceptionEvent): string {
    const payload = event.payload ?? {};
    for (const key of ['subject', 'entityId', 'contactId', 'leadId']) {
      const value = payload[key];
      if (typeof value === 'string' && value.length > 0) {
        return `${key}:${value}`;
      }
    }
    return `kind:${event.kind}`;
  }

  private deriveSalience(event: StructuredPerceptionEvent): number {
    const size = Object.keys(event.payload ?? {}).length;
    return Math.max(0, Math.min(1, size === 0 ? 0.1 : 0.3 + size * 0.05));
  }

  private fingerprintBuffer(buffer: Buffer, mimeType: string): string {
    return createHash('sha256').update(mimeType).update(buffer).digest('hex').slice(0, FINGERPRINT_HEX);
  }

  private requireWorkspace(workspaceId: string): void {
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
      throw new Error('workspaceId is required for multimodal perception');
    }
  }

  private async safeEmit(
    workspaceId: string,
    modality: Modality,
    sourceFingerprint: string,
    mimeType: string,
    extras: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    if (!this.spine) {
      return;
    }
    try {
      await this.spine.emit({
        eventName: 'cognition.perception.multimodal_observed',
        workspaceId,
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: { modality, mimeType, sourceFingerprint, ...extras },
      });
    } catch (err) {
      this.logger.warn(`spine emit failed for ${modality}: ${(err as Error).message}`);
    }
  }
}
