import { safeResolve } from './safe-path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Job, Worker } from 'bullmq';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { prisma } from './db';
import { resolveWorkerOpenAIModel } from './providers/openai-models';
import { buildQueueOptions } from './queue';
import { isRetryableError, WorkerError } from './src/utils/error-handler';
import { safeRequest, validateUrl } from './utils/ssrf-protection';
import { WorkerLogger } from './logger';
import { checkIdempotent, endJob, logError, markCompleted, startJob } from './processor-base';

const log = new WorkerLogger('voice-worker');

const PATTERN_RE = /\/+$/;

const UPLOAD_DIR = safeResolve(__dirname, '../backend/public/audio');
const UPLOAD_DIR_URL = pathToFileURL(`${UPLOAD_DIR}${path.sep}`);

fs.mkdirSync(UPLOAD_DIR_URL, { recursive: true });

/**
 * Resolves a file path within a base directory and guards against path traversal.
 * Throws if the resolved path escapes the base directory.
 */
function safePath(basedir: string, filename: string): string {
  const resolved = safeResolve(basedir, path.normalize(filename));
  const base = safeResolve(basedir);
  if (!resolved.startsWith(`${base}${path.sep}`) && resolved !== base) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

function safeFileUrl(basedir: string, filename: string): URL {
  return pathToFileURL(safePath(basedir, filename));
}

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured (required for Whisper transcription)');
  }
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function resolvePublicBackendBaseUrl() {
  const configured =
    process.env.BACKEND_PUBLIC_URL ||
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    process.env.SERVICE_BASE_URL ||
    'http://localhost:3001';

  return configured.replace(PATTERN_RE, '');
}

async function handleGenerateAudio(
  job: Job,
  meta: ReturnType<typeof startJob>,
  ctxLog: WorkerLogger,
) {
  const { jobId, workspaceId, text, profileId } = job.data as {
    jobId: string;
    workspaceId: string;
    text: string;
    profileId: string;
  };

  if (!workspaceId) {
    throw new WorkerError(
      `Voice Job ${jobId} enqueued without workspaceId`,
      'VOICE_NO_WORKSPACE',
      false,
    );
  }

  ctxLog.info('voice_generate_start', { jobId, workspaceId });
  await job.updateProgress(10);

  const jobRecord = await prisma.voiceJob.findFirst({
    where: { id: jobId, workspaceId },
    select: { workspaceId: true, profileId: true },
  });
  if (!jobRecord) {
    throw new WorkerError(`Voice Job ${jobId} not found`, 'VOICE_JOB_NOT_FOUND', false);
  }

  const profile = await prisma.voiceProfile.findFirst({
    where: { id: profileId, workspaceId },
    select: { workspaceId: true, voiceId: true },
  });

  if (!profile) {
    throw new WorkerError(`Voice Profile ${profileId} not found`, 'VOICE_PROFILE_NOT_FOUND', false);
  }

  const openai = getOpenAIClient();
  const ttsVoice = profile.voiceId || process.env.OPENAI_TTS_VOICE || 'nova';
  const ttsSpeed = Number.parseFloat(process.env.OPENAI_TTS_SPEED || '1.0');

  await job.updateProgress(30);
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: ttsVoice,
    input: text,
    speed: ttsSpeed,
    response_format: 'opus',
  });

  await job.updateProgress(60);
  const buffer = Buffer.from(await response.arrayBuffer());
  const fileName = `${jobId}.mp3`;
  const fileUrl = safeFileUrl(UPLOAD_DIR, fileName);
  fs.writeFileSync(fileUrl, buffer);

  const publicUrl = `${resolvePublicBackendBaseUrl()}/audio/${fileName}`;

  await job.updateProgress(80);
  await prisma.voiceJob.updateMany({
    where: { id: jobId, workspaceId },
    data: {
      status: 'COMPLETED',
      outputUrl: publicUrl,
      duration: 0,
    },
  });

  await job.updateProgress(100);
  ctxLog.info('voice_generate_complete', { jobId, publicUrl });
  return { success: true, outputUrl: publicUrl };
}

async function handleTranscription(
  job: Job,
  meta: ReturnType<typeof startJob>,
  ctxLog: WorkerLogger,
) {
  const { workspaceId, phone, mediaUrl, messageType } = job.data;

  ctxLog.info('transcription_start', { phone });
  await job.updateProgress(10);

  const urlValidation = await validateUrl(mediaUrl);
  if (!urlValidation.valid) {
    throw new WorkerError(
      `SSRF blocked for media URL: ${urlValidation.error}`,
      'TRANSCRIBE_SSRF',
      false,
    );
  }

  await job.updateProgress(20);
  const response = await safeRequest({
    url: mediaUrl,
    timeout: 30000,
  });
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.statusText}`);
  }

  await job.updateProgress(40);
  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const transcriptionUpload = await toFile(audioBuffer, `temp_${randomUUID()}.mp3`, {
    type: 'audio/mpeg',
  });

  const openai = getOpenAIClient();
  let transcription: OpenAI.Audio.Transcriptions.TranscriptionVerbose;
  try {
    await job.updateProgress(60);
    transcription = await openai.audio.transcriptions.create({
      file: transcriptionUpload,
      model: resolveWorkerOpenAIModel('audio_understanding'),
      language: 'pt',
      response_format: 'verbose_json',
    });
  } catch {
    transcription = await openai.audio.transcriptions.create({
      file: transcriptionUpload,
      model: resolveWorkerOpenAIModel('audio_understanding_fallback'),
      language: 'pt',
      response_format: 'verbose_json',
    });
  }

  const transcribedText = transcription.text || '';

  await job.updateProgress(80);
  const contact = await prisma.contact.findFirst({
    where: { workspaceId, phone },
  });

  if (contact) {
    const lastAudioMessage = await prisma.message.findFirst({
      where: {
        workspaceId,
        contactId: contact.id,
        type: 'AUDIO',
        direction: 'INBOUND',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (lastAudioMessage) {
      await prisma.message.updateMany({
        where: { id: lastAudioMessage.id, workspaceId },
        data: {
          content: `[Transcrição] ${transcribedText}`,
        },
      });
    }

    const autopilotQueueRef = await import('./queue').then((m) => m.autopilotQueue);
    await autopilotQueueRef.add('process-message', {
      workspaceId,
      contactId: contact.id,
      phone,
      messageContent: transcribedText,
      message: transcribedText,
      isVoiceTranscription: true,
      originalType: messageType,
    });
    ctxLog.info('autopilot_triggered_transcription', { phone });
  }

  await job.updateProgress(100);
  return { success: true, transcription: transcribedText };
}

/** Voice worker. */
export const voiceWorker = new Worker(
  'voice-jobs',
  async (job: Job) => {
    const meta = startJob(job, log);
    const ctxLog = log.withContext(meta.correlationId, meta.workspaceId);

    try {
      const dedup = await checkIdempotent(job);
      if (dedup) {
        ctxLog.info('job_skipped_idempotent', { jobId: job.id });
        endJob(meta, ctxLog, job.name, 'skipped');
        return { ok: true, skipped: true, reason: 'idempotent' };
      }

      let result: unknown;
      switch (job.name) {
        case 'generate-audio':
          result = await handleGenerateAudio(job, meta, ctxLog);
          break;
        case 'transcribe-audio':
          result = await handleTranscription(job, meta, ctxLog);
          break;
        default:
          ctxLog.info('voice_unsupported_job', { name: job.name });
          result = { ignored: true, jobName: job.name };
      }

      await markCompleted(job);
      endJob(meta, ctxLog, job.name, 'completed');
      return result;
    } catch (err) {
      logError(meta, ctxLog, err, job.name);
      const { jobId, workspaceId } = job.data || {};
      if (jobId && workspaceId) {
        await prisma.voiceJob
          .updateMany({
            where: { id: jobId, workspaceId },
            data: { status: 'FAILED' },
          })
          .catch(() => {});
      }

      if (!isRetryableError(err)) {
        throw new WorkerError(
          err instanceof Error ? err.message : String(err),
          'VOICE_PERMANENT',
          false,
        );
      }

      throw err;
    }
  },
  {
    ...buildQueueOptions(),
    concurrency: 3,
    lockDuration: 120_000,
  },
);

/** Transcription worker. */
export const transcriptionWorker = voiceWorker;
