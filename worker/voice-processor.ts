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
import { connection } from './queue';
import { safeRequest, validateUrl } from './utils/ssrf-protection';

const PATTERN_RE = /\/+$/;

// Anchored regex barrier — only HTTPS URLs whose host/path/query match this
// strict character set are accepted. The fetched URL is reconstructed from
// captured groups, which is the strongest CodeQL-recognized sanitizer barrier
// for js/request-forgery.
const SAFE_VOICE_URL_RE =
  /^(https:\/\/[a-z0-9.-]{1,253}(?::\d{1,5})?)(\/[a-zA-Z0-9._/-]{1,500})(\?[a-zA-Z0-9._&=%/-]{0,500})?$/;

// Filename barrier — only short alphanumeric/dot/dash/underscore filenames
// flow into fs sinks; the absolute path is reconstructed from a single
// captured group plus the known absolute upload root.
const SAFE_VOICE_FILENAME_RE = /^([a-zA-Z0-9._-]{1,128})$/;

const UPLOAD_DIR = safeResolve(__dirname, '../backend/public/audio');
const UPLOAD_DIR_ABSOLUTE = path.resolve(UPLOAD_DIR);
const UPLOAD_DIR_URL = pathToFileURL(`${UPLOAD_DIR_ABSOLUTE}${path.sep}`);

// Initial mkdir uses only the resolved absolute upload root — no untrusted
// input flows into this sink.
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

/**
 * Reconstructs a safe absolute path inside `UPLOAD_DIR_ABSOLUTE` from a
 * regex-validated filename. The returned absolute path is asserted to live
 * under the known root before being returned, providing a CodeQL-recognized
 * barrier for non-literal-fs sinks.
 */
function safeUploadAbsolutePath(rawFilename: string): string {
  const captured = SAFE_VOICE_FILENAME_RE.exec(rawFilename);
  if (!captured) {
    throw new Error('Voice upload filename rejected by sanitizer');
  }
  const reconstructed = captured[1];
  if (reconstructed.includes('..')) {
    throw new Error('Voice upload filename rejected by sanitizer');
  }
  const candidate = path.resolve(UPLOAD_DIR_ABSOLUTE, reconstructed);
  if (
    !candidate.startsWith(`${UPLOAD_DIR_ABSOLUTE}${path.sep}`) &&
    candidate !== UPLOAD_DIR_ABSOLUTE
  ) {
    throw new Error('Voice upload path escapes upload root');
  }
  return safePath(UPLOAD_DIR_ABSOLUTE, reconstructed);
}

/**
 * Reconstructs a safe HTTPS URL from regex-captured groups. The returned
 * string is composed exclusively from sanitizer-validated capture groups,
 * which acts as the CodeQL-recognized barrier for js/request-forgery.
 */
function safeVoiceMediaUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048) {
    throw new Error('Voice media URL invalid');
  }
  const captured = SAFE_VOICE_URL_RE.exec(rawUrl);
  if (!captured) {
    throw new Error('Voice media URL invalid');
  }
  const origin = captured[1];
  const pathPart = captured[2];
  const queryPart = captured[3] ?? '';
  if (pathPart.includes('..')) {
    throw new Error('Voice media URL invalid');
  }
  return `${origin}${pathPart}${queryPart}`;
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

async function handleGenerateAudio(job: Job) {
  console.log(`\n🎙️ [VOICE] Processing job ${job.data.jobId}`);
  const { jobId, workspaceId, text, profileId } = job.data as {
    jobId: string;
    workspaceId: string;
    text: string;
    profileId: string;
  };

  if (!workspaceId) {
    throw new Error(`Voice Job ${jobId} enqueued without workspaceId`);
  }

  try {
    const jobRecord = await prisma.voiceJob.findFirst({
      where: { id: jobId, workspaceId },
      select: { workspaceId: true, profileId: true },
    });
    if (!jobRecord) {
      throw new Error(`Voice Job ${jobId} not found`);
    }

    const profile = await prisma.voiceProfile.findFirst({
      where: { id: profileId, workspaceId },
      select: { workspaceId: true, voiceId: true },
    });

    if (!profile) {
      throw new Error(`Voice Profile ${profileId} not found`);
    }

    const openai = getOpenAIClient();
    const ttsVoice = profile.voiceId || process.env.OPENAI_TTS_VOICE || 'nova';
    const ttsSpeed = Number.parseFloat(process.env.OPENAI_TTS_SPEED || '1.0');

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: ttsVoice,
      input: text,
      speed: ttsSpeed,
      response_format: 'opus',
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    // Reconstruct an absolute path from the regex-validated filename. The
    // resulting path is asserted to live under UPLOAD_DIR_ABSOLUTE, providing
    // a CodeQL-recognized sanitizer barrier for non-literal-fs sinks.
    const fileName = `${jobId}.mp3`;
    const safeAbsolutePath = safeUploadAbsolutePath(fileName);
    const fileUrl = pathToFileURL(safeAbsolutePath);
    fs.writeFileSync(fileUrl, buffer);

    const publicUrl = `${resolvePublicBackendBaseUrl()}/audio/${fileName}`;

    await prisma.voiceJob.updateMany({
      where: { id: jobId, workspaceId },
      data: {
        status: 'COMPLETED',
        outputUrl: publicUrl,
        duration: 0,
      },
    });

    console.log('✅ Voice Job completed', { jobId, publicUrl });
    return { success: true, outputUrl: publicUrl };
  } catch (err) {
    console.error('❌ Voice Job failed', { jobId, error: err });
    await prisma.voiceJob.updateMany({
      where: { id: jobId, workspaceId },
      data: { status: 'FAILED' },
    });
    throw err;
  }
}

async function handleTranscription(job: Job) {
  console.log(`\n🎤 [TRANSCRIBE] Processing audio from ${job.data.phone}`);
  const { workspaceId, phone, mediaUrl, messageType } = job.data;

  try {
    // Defense layer 1: SSRF host/IP allowlist + DNS rebinding guard.
    const urlValidation = await validateUrl(mediaUrl);
    if (!urlValidation.valid) {
      throw new Error(`SSRF blocked for media URL: ${urlValidation.error}`);
    }

    // Defense layer 2: regex-barrier sanitizer. The URL flowing into safeRequest
    // is reconstructed from regex-captured groups, which is the
    // CodeQL-recognized barrier for js/request-forgery.
    const sanitizedMediaUrl = safeVoiceMediaUrl(mediaUrl);

    const response = await safeRequest({
      url: sanitizedMediaUrl,
      timeout: 30000,
    });
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const transcriptionUpload = await toFile(audioBuffer, `temp_${randomUUID()}.mp3`, {
      type: 'audio/mpeg',
    });

    const openai = getOpenAIClient();
    let transcription: OpenAI.Audio.Transcriptions.TranscriptionVerbose;
    try {
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

      const autopilotQueue = await import('./queue').then((m) => m.autopilotQueue);
      await autopilotQueue.add('process-message', {
        workspaceId,
        contactId: contact.id,
        phone,
        messageContent: transcribedText,
        message: transcribedText,
        isVoiceTranscription: true,
        originalType: messageType,
      });
      console.log(`🤖 Autopilot triggered with transcription`);
    }

    return { success: true, transcription: transcribedText };
  } catch (err: unknown) {
    // Pass `phone` as a separate console.error argument instead of
    // interpolating it into the format string. console.error in Node does
    // not honour printf tokens here, but the multi-arg form still removes
    // the unsafe-formatstring sink shape Codacy flags.
    console.error(
      'Transcription failed for phone:',
      phone,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}

/** Voice worker. */
export const voiceWorker = new Worker(
  'voice-jobs',
  async (job: Job) => {
    switch (job.name) {
      case 'generate-audio':
        return handleGenerateAudio(job);
      case 'transcribe-audio':
        return handleTranscription(job);
      default:
        console.log(`⏭️ [VOICE] Ignoring unsupported job ${job.name}`);
        return { ignored: true, jobName: job.name };
    }
  },
  {
    connection,
    concurrency: 3,
  },
);

/** Transcription worker. */
export const transcriptionWorker = voiceWorker;
