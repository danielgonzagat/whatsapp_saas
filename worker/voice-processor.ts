import fs from 'fs';
import path from 'path';
import { type Job, Worker } from 'bullmq';
import OpenAI from 'openai';
import { prisma } from './db';
import { resolveWorkerOpenAIModel } from './providers/openai-models';
import { connection } from './queue';

const UPLOAD_DIR = path.join(__dirname, '../backend/public/audio');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
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

  return configured.replace(/\/+$/, '');
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
      voice: ttsVoice as any,
      input: text,
      speed: ttsSpeed,
      response_format: 'opus',
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const fileName = `${jobId}.mp3`;
    const filePath = path.join(UPLOAD_DIR, fileName);
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
    const response = await fetch(mediaUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }

    const tempFile = path.join(
      UPLOAD_DIR,
      `temp_${Date.now()}_${String(phone || '').replace(/\D/g, '')}.mp3`,
    );
    fs.writeFileSync(tempFile, Buffer.from(await response.arrayBuffer()));

    const openai = getOpenAIClient();
    let transcription;
    try {
      transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: resolveWorkerOpenAIModel('audio_understanding'),
        language: 'pt',
        response_format: 'verbose_json',
      });
    } catch {
      transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: resolveWorkerOpenAIModel('audio_understanding_fallback'),
        language: 'pt',
        response_format: 'verbose_json',
      });
    }

    const transcribedText = transcription.text || '';
    if (fs.existsSync(tempFile)) {
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
  } catch (err: any) {
    console.error(`❌ Transcription failed for ${phone}:`, err?.message || err);
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
