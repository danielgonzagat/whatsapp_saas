import { z } from 'zod';

export const shaArg = {
  expectedSha256: z
    .string()
    .optional()
    .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
  preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
};
