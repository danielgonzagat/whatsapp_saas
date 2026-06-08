/**
 * Kloel capabilities — shared types.
 *
 * This module hosts a small set of self-contained, deterministic capabilities
 * that the Kloel chat can invoke directly (no external provider required for the
 * core logic). Each capability is pure-logic and returns a structured result
 * the chat can verbalize in PT-BR. The capabilities were reimplemented by intent
 * from prior-art decision frameworks; no third-party branding leaks to the user.
 */

/** Identifiers for the chat-invokable capabilities in this module. */
export type KloelCapabilityName =
  | 'structured_text_extractor'
  | 'response_depth_advisor'
  | 'prompt_refiner';

/** Dominant content shape used to calibrate token estimates. */
export type ContentKind = 'prose' | 'code';

/** Coarse complexity band for a request, used to size a response window. */
export type RequestComplexity =
  | 'simple'
  | 'medium'
  | 'medium_high'
  | 'complex'
  | 'creative';

/** Depth tier the chat can offer the user. */
export type ResponseDepthLevel = 'essential' | 'moderate' | 'detailed' | 'exhaustive';

// ---------------------------------------------------------------------------
// structured_text_extractor
// ---------------------------------------------------------------------------

/** A single row recovered from a block of structured/tabular text. */
export interface ExtractedRow {
  /** 1-based line index of the row in the source block. */
  readonly index: number;
  /** Recovered fields, keyed by the requested column name. */
  readonly fields: Readonly<Record<string, string>>;
  /** Confidence in this row's extraction, 0..1. */
  readonly confidence: number;
  /** Machine reasons explaining any confidence loss. */
  readonly reasons: readonly string[];
}

export interface StructuredTextExtractInput {
  /** Raw text pasted by the user (lines of delimited or labelled data). */
  readonly text: string;
  /**
   * Column names to recover, in order. When omitted, the extractor infers a
   * single `value` column from each non-empty line.
   */
  readonly columns?: readonly string[];
  /** Confidence threshold below which a row is flagged for a model pass. */
  readonly confidenceThreshold?: number;
}

export interface StructuredTextExtractResult {
  readonly capability: 'structured_text_extractor';
  /** All rows that were recovered (regardless of confidence). */
  readonly rows: readonly ExtractedRow[];
  /** Indices of rows below the threshold — the only ones worth an LLM pass. */
  readonly lowConfidenceRowIndices: readonly number[];
  /** Detected delimiter, for transparency. */
  readonly delimiter: 'comma' | 'semicolon' | 'tab' | 'pipe' | 'whitespace' | 'labelled';
  readonly stats: {
    readonly totalLines: number;
    readonly rowsRecovered: number;
    readonly lowConfidenceCount: number;
    /** Share of rows at/above threshold, 0..1. */
    readonly regexSuccessRate: number;
  };
  /** PT-BR one-line summary the chat can speak. */
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// response_depth_advisor
// ---------------------------------------------------------------------------

export interface ResponseDepthInput {
  /** The user's prompt text. */
  readonly prompt: string;
  /** Override the auto-detected complexity band. */
  readonly complexity?: RequestComplexity;
  /** Cap the largest suggested window (e.g. the model's output-token limit). */
  readonly maxOutputTokens?: number;
}

export interface ResponseDepthOption {
  readonly level: ResponseDepthLevel;
  /** Fraction of the window this tier represents (0.25 / 0.5 / 0.75 / 1). */
  readonly fraction: number;
  /** Estimated output tokens for this tier. */
  readonly estimatedTokens: number;
  /** PT-BR label shown to the user. */
  readonly label: string;
}

export interface ResponseDepthResult {
  readonly capability: 'response_depth_advisor';
  readonly inputTokens: number;
  readonly contentKind: ContentKind;
  readonly complexity: RequestComplexity;
  readonly window: { readonly minTokens: number; readonly maxTokens: number };
  readonly options: readonly ResponseDepthOption[];
  /** Heuristic accuracy note for honesty. */
  readonly precisionNote: string;
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// prompt_refiner
// ---------------------------------------------------------------------------

export type PromptIntent =
  | 'new_feature'
  | 'bug_fix'
  | 'refactor'
  | 'research'
  | 'testing'
  | 'review'
  | 'documentation'
  | 'infrastructure'
  | 'design'
  | 'unknown';

export type PromptScope = 'trivial' | 'low' | 'medium' | 'high' | 'epic';

export interface PromptRefineInput {
  /** The raw, possibly-vague prompt the user wants sharpened. */
  readonly prompt: string;
}

export interface PromptRefineResult {
  readonly capability: 'prompt_refiner';
  readonly intent: PromptIntent;
  readonly scope: PromptScope;
  /** Confidence in the intent classification, 0..1. */
  readonly intentConfidence: number;
  /** Critical context the prompt is missing, as PT-BR questions. */
  readonly missingContext: readonly string[];
  /** A rewritten, structured prompt ready to act on. */
  readonly refinedPrompt: string;
  /** Whether the chat should ask clarifying questions before acting. */
  readonly needsClarification: boolean;
  readonly summary: string;
}

export type KloelCapabilityResult =
  | StructuredTextExtractResult
  | ResponseDepthResult
  | PromptRefineResult;
