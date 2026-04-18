import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { type Job, Worker } from 'bullmq';
import OpenAI from 'openai';
import { prisma } from './db';
import { resolveWorkerOpenAIModel } from './providers/openai-models';
import { connection } from './queue';
import { validateUrl } from './utils/ssrf-protection';

const PATTERN_RE = /\/+$/;

// SECURITY: UPLOAD_DIR is derived from __dirname (server binary location), not user input.
// All file writes within this directory use safePath() to guard against path traversal.
const UPLOAD_DIR = path.resolve(__dirname, '../backend/public/audio');
// nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
// Safe: UPLOAD_DIR = path.resolve(__dirname, '../backend/public/audio') — derived from the worker binary location, no user input.
if (!fs.existsSync(UPLOAD_DIR)) {
  // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
  // Safe: UPLOAD_DIR is __dirname-derived; no user input.
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Resolves a file path within a base directory and guards against path traversal.
 * Throws if the resolved path escapes the base directory.
 */
function safePath(basedir: string, filename: string): string {
  const resolved = path.resolve(basedir, path.normalize(filename));
  const base = path.resolve(basedir);
  if (!resolved.startsWith(`${base}${path.sep}`) && resolved !== base) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;
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
  const { jobId, text, profileId } = job.data;

  try {
    const jobRecord = await prisma.voiceJob.findUnique({
      where: { id: jobId },
      select: { workspaceId: true, profileId: true },
    });
    if (!jobRecord) {
      throw new Error(`Voice Job ${jobId} not found`);
    }

    const profile = await prisma.voiceProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new Error(`Voice Profile ${profileId} not found`);
    }

    if (profile.workspaceId !== jobRecord.workspaceId) {
      throw new Error(`Voice Profile ${profileId} does not belong to workspace of job ${jobId}`);
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
    const filePath = safePath(UPLOAD_DIR, fileName);
    // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
    // Safe: filePath passed through safePath() which asserts containment in UPLOAD_DIR (__dirname-derived). jobId is a DB primary key, not user free-form input.
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `${resolvePublicBackendBaseUrl()}/audio/${fileName}`;

    await prisma.voiceJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        outputUrl: publicUrl,
        duration: 0,
      },
    });

    console.log(`✅ Voice Job ${jobId} completed. URL: ${publicUrl}`);
    return { success: true, outputUrl: publicUrl };
  } catch (err) {
    console.error(`❌ Voice Job ${jobId} failed:`, err);
    await prisma.voiceJob.update({
      where: { id: jobId },
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

    const response = await fetch(mediaUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }

    // Use randomUUID for temp filename to prevent path traversal via phone
    const tempFile = safePath(UPLOAD_DIR, `temp_${randomUUID()}.mp3`);
    // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
    // Safe: tempFile is safePath(UPLOAD_DIR, `temp_${randomUUID()}.mp3`) — UPLOAD_DIR is __dirname-derived, randomUUID() is crypto-generated. No user input.
    fs.writeFileSync(tempFile, Buffer.from(await response.arrayBuffer()));

    const openai = getOpenAIClient();
    let transcription: OpenAI.Audio.Transcriptions.TranscriptionVerbose;
    try {
      transcription = await openai.audio.transcriptions.create({
        // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
        // Safe: tempFile is safePath(UPLOAD_DIR, randomUUID-based name). No user input.
        file: fs.createReadStream(tempFile),
        model: resolveWorkerOpenAIModel('audio_understanding'),
        language: 'pt',
        response_format: 'verbose_json',
      });
    } catch {
      transcription = await openai.audio.transcriptions.create({
        // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
        // Safe: tempFile is safePath(UPLOAD_DIR, randomUUID-based name). No user input.
        file: fs.createReadStream(tempFile),
        model: resolveWorkerOpenAIModel('audio_understanding_fallback'),
        language: 'pt',
        response_format: 'verbose_json',
      });
    }

    const transcribedText = transcription.text || '';
    // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
    // Safe: tempFile is safePath(UPLOAD_DIR, randomUUID-based name). No user input.
    if (fs.existsSync(tempFile)) {
      // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
      // Safe: tempFile is safePath(UPLOAD_DIR, randomUUID-based name). No user input.
      fs.unlinkSync(tempFile);
    }

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
        await prisma.message.update({
          where: { id: lastAudioMessage.id },
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
    console.error(
      `❌ Transcription failed for ${phone}:`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}

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

export const transcriptionWorker = voiceWorker;
