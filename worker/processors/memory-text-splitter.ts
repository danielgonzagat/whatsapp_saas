const WHITESPACE_RE = /\s+/g;
const SENTENCE_ENDINGS = ['. ', '? ', '! '];
const SPLIT_BIAS_NUMERATOR = 1;
const SPLIT_BIAS_DENOMINATOR = 2;
const NO_SPLIT_INDEX = -1;
const MIN_OFFSET = 1;

const isSplitCandidate = (
  idx: number,
  startIndex: number,
  endIndex: number,
  splitIndex: number,
): boolean => {
  const halfwayIndex =
    startIndex + ((endIndex - startIndex) * SPLIT_BIAS_NUMERATOR) / SPLIT_BIAS_DENOMINATOR;

  return idx > halfwayIndex && idx > splitIndex;
};

const findSentenceSplit = (cleanText: string, startIndex: number, endIndex: number): number => {
  let splitIndex = NO_SPLIT_INDEX;
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
  if (splitIndex !== NO_SPLIT_INDEX) {
    return splitIndex;
  }

  const lastSpace = cleanText.lastIndexOf(' ', endIndex);
  if (lastSpace > startIndex) {
    return lastSpace;
  }

  return endIndex;
};

const nextStartIndex = (startIndex: number, endIndex: number, chunkOverlap: number): number =>
  Math.max(startIndex + MIN_OFFSET, endIndex - chunkOverlap);

const pushIfNonEmpty = (chunks: string[], chunk: string): void => {
  const trimmed = chunk.trim();
  if (trimmed) {
    chunks.push(trimmed);
  }
};

export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_CHUNK_OVERLAP = 200;

export const splitText = (
  text: string,
  chunkSize: number,
  chunkOverlap: number = DEFAULT_CHUNK_OVERLAP,
): string[] => {
  if (!text) {
    return [];
  }
  const cleanText = text.replace(WHITESPACE_RE, ' ').trim();
  if (cleanText.length <= chunkSize) {
    return [cleanText];
  }

  const chunks: string[] = [];
  let startIndex = 0;
  while (startIndex < cleanText.length) {
    const endIndex = findChunkEnd(cleanText, startIndex, chunkSize);
    pushIfNonEmpty(chunks, cleanText.substring(startIndex, endIndex));
    if (endIndex >= cleanText.length) {
      break;
    }
    startIndex = nextStartIndex(startIndex, endIndex, chunkOverlap);
  }

  return chunks;
};
