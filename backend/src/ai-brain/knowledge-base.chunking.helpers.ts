import { WHITESPACE_G_RE } from '../common/regex';

/**
 * Chunk-size constants for text splitting.
 * Keep this aligned with worker/processors/memory-processor.ts so the
 * pre-charge uses the same chunk boundaries as async ingestion.
 */
export const KNOWLEDGE_BASE_CHUNK_SIZE = 1000;
export const KNOWLEDGE_BASE_CHUNK_OVERLAP = 200;

/** Sentence-ending punctuation patterns used to find clean split points. */
export const SENTENCE_ENDINGS = ['. ', '? ', '! '];

const isSplitCandidate = (
  idx: number,
  startIndex: number,
  endIndex: number,
  splitIndex: number,
): boolean => idx > startIndex + (endIndex - startIndex) * 0.5 && idx > splitIndex;

const findSentenceSplit = (cleanText: string, startIndex: number, endIndex: number): number => {
  let splitIndex = -1;
  for (const ending of SENTENCE_ENDINGS) {
    const idx = cleanText.lastIndexOf(ending, endIndex);
    if (isSplitCandidate(idx, startIndex, endIndex, splitIndex)) {
      splitIndex = idx + 1;
    }
  }
  return splitIndex;
};

const findChunkEnd = (cleanText: string, startIndex: number, chunkSize: number): number => {
  const endIndex = startIndex + chunkSize;
  if (endIndex >= cleanText.length) {
    return endIndex;
  }

  const splitIndex = findSentenceSplit(cleanText, startIndex, endIndex);
  if (splitIndex !== -1) {
    return splitIndex;
  }

  const lastSpace = cleanText.lastIndexOf(' ', endIndex);
  if (lastSpace > startIndex) {
    return lastSpace;
  }
  return endIndex;
};

/** Split text into overlapping chunks with sentence-boundary awareness. */
export const splitKnowledgeBaseText = (
  text: string,
  chunkSize: number,
  chunkOverlap = KNOWLEDGE_BASE_CHUNK_OVERLAP,
): string[] => {
  if (!text) {
    return [];
  }
  const cleanText = text.replace(WHITESPACE_G_RE, ' ').trim();
  if (cleanText.length <= chunkSize) {
    return [cleanText];
  }

  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < cleanText.length) {
    const endIndex = findChunkEnd(cleanText, startIndex, chunkSize);
    const chunk = cleanText.substring(startIndex, endIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (endIndex >= cleanText.length) {
      break;
    }
    startIndex = Math.max(startIndex + 1, endIndex - chunkOverlap);
  }

  return chunks;
};
