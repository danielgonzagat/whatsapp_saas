import { Worker, Job } from "bullmq";
import { connection } from "./queue";
import { prisma } from "./db";
import fs from "fs";
import path from "path";

// Ensure upload dir exists
const UPLOAD_DIR = path.join(__dirname, "../backend/public/audio");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const voiceWorker = new Worker(
  "voice-jobs",
  async (job: Job) => {
    console.log(`\n🎙️ [VOICE] Processing job ${job.data.jobId}`);
    const { jobId, text, profileId } = job.data;

    try {
      // 0. Fetch Job to validate workspace/profile
      const jobRecord = await prisma.voiceJob.findUnique({
        where: { id: jobId },
        select: { workspaceId: true, profileId: true },
      });
      if (!jobRecord) {
        throw new Error(`Voice Job ${jobId} not found`);
      }

      // 1. Fetch Voice Profile (to get external Voice ID)
      const profile = await prisma.voiceProfile.findUnique({
        where: { id: profileId }
      });

      if (!profile) throw new Error(`Voice Profile ${profileId} not found`);

      // Workspace isolation: profile must belong to job workspace
      if (profile.workspaceId !== jobRecord.workspaceId) {
        throw new Error(`Voice Profile ${profileId} does not belong to workspace of job ${jobId}`);
      }

      // 2. Call ElevenLabs API
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

      const voiceId = profile.voiceId; // e.g. "21m00Tcm4TlvDq8ikWAM" (Rachel)
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

      console.log(`🎙️ Calling ElevenLabs: ${url}`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API Error: ${errorText}`);
      }

      // 3. Save Audio File
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileName = `${jobId}.mp3`;
      const filePath = path.join(UPLOAD_DIR, fileName);

      fs.writeFileSync(filePath, buffer);
      console.log(`💾 Audio saved to: ${filePath}`);

      // 4. Update Job Status
      // Assuming Backend serves 'public/audio' at '/audio'
      const publicUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/audio/${fileName}`;

      await prisma.voiceJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          outputUrl: publicUrl,
          duration: 0, // TODO: Calculate duration
        },
      });

      console.log(`✅ Voice Job ${jobId} completed. URL: ${publicUrl}`);

    } catch (err) {
      console.error(`❌ Voice Job ${jobId} failed:`, err);
      await prisma.voiceJob.update({
        where: { id: jobId },
        data: { status: "FAILED" },
      });
      throw err;
    }
  },
  {
    connection,
    concurrency: 2,
  }
);
