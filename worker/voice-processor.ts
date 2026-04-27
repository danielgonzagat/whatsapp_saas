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
    const fileName = `${jobId}.mp3`;
    const fileUrl = safeFileUrl(UPLOAD_DIR, fileName);
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
    // SSRF protection: validate mediaUrl before fetching
    const urlValidation = await validateUrl(mediaUrl);
    if (!urlValidation.valid) {
      throw new Error(`SSRF blocked for media URL: ${urlValidation.error}`);
    }

    const response = await safeRequest({
      url: mediaUrl,
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
    // interpolating it into the format string. Removes Codacy's
    // unsafe-formatstring surface (console.error does not honour printf
    // tokens here, but the multi-arg form is still the safer shape).
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
